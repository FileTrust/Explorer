#!/usr/bin/env python3
"""Bring up the two stores the Explorer reads from, installing them if needed.

The Explorer answers its screens from Postgres (current state) and ClickHouse
(the event log), not from the chain. Nothing else in a deployment starts them,
and without them the Explorer still comes up, still answers, and still passes its
own readiness check -- while reporting an empty network. That looks like a
working deployment and is not one, which is the failure this exists to stop.

Three cases, in order:

  already serving   use it, touch nothing
  installed, down   start it
  not installed     install, configure, start

The third is what makes this usable on a server nobody has prepared by hand. Both
stores install under one directory as the invoking user, with nothing in system
paths -- remove the directory and they are gone.

Postgres binaries are the exception: they come from the distribution, so if they
are absent this says which package to install rather than guessing at a package
manager and a password. Everything else is fetched and configured here.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import socket
import subprocess
import tarfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable

# This file lives beside the Explorer it serves, so a clone of the Explorer
# alone can bring its own stores up. The monorepo still reaches it through
# scripts/network/explorer_stores.py, which is one line importing this.
EXPLORER_DIR = Path(__file__).resolve().parent

from configure import saved_env
_STORE_ENV = saved_env()

def _store_setting(name: str, default: str) -> str:
    return os.environ.get(name) or _STORE_ENV.get(name) or default

STORE_DATA = Path(_store_setting("EXPLORER_STORE_DATA", str(Path.home() / ".filetrust-data"))).expanduser().resolve()
POSTGRES_DIR = STORE_DATA / "postgres"
POSTGRES_PORT = int(_store_setting("EXPLORER_POSTGRES_PORT", "5433"))
POSTGRES_USER = "filetrust"
POSTGRES_DB = "filetrust_explorer"

CLICKHOUSE_DIR = STORE_DATA / "clickhouse"
CLICKHOUSE_PORT = int(_store_setting("EXPLORER_CLICKHOUSE_PORT", "8123"))
CLICKHOUSE_PING = f"http://127.0.0.1:{CLICKHOUSE_PORT}/ping"
# The native protocol port. Nothing here uses it -- the Explorer speaks HTTP --
# but ClickHouse always opens it, so it is named rather than left at a default
# that a second instance on the same box would collide with.
CLICKHOUSE_TCP_PORT = int(_store_setting("EXPLORER_CLICKHOUSE_TCP_PORT", "9100"))
# The LTS line, pinned. Not the `master` build the one-line installer fetches:
# an event log is not the place to find out what changed this week.
CLICKHOUSE_VERSION = "26.8.2.7"
CLICKHOUSE_TARBALL = f"clickhouse-common-static-{CLICKHOUSE_VERSION}-amd64.tgz"
CLICKHOUSE_URL = f"https://packages.clickhouse.com/tgz/lts/{CLICKHOUSE_TARBALL}"


class StoreError(RuntimeError):
    """A store could not be made ready, with a reason worth printing."""


Log = Callable[[str], None]


# --- probes -----------------------------------------------------------------


def _port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(1.0)
        return probe.connect_ex(("127.0.0.1", port)) == 0


def _clickhouse_ready() -> bool:
    try:
        with urllib.request.urlopen(CLICKHOUSE_PING, timeout=2) as response:
            return response.status == 200
    except Exception:
        return False


def _wait_until(label: str, ready: Callable[[], bool], seconds: int = 90) -> None:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if ready():
            return
        time.sleep(1)
    raise StoreError(f"{label} did not become ready within {seconds}s")


def _run(cmd: list[str], *, cwd: Path | None = None, env: dict[str, str] | None = None,
         timeout: int = 600) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [str(part) for part in cmd],
        cwd=str(cwd) if cwd else None,
        env={**os.environ, **(env or {})},
        text=True, capture_output=True, check=False, timeout=timeout,
    )


def _fail(label: str, result: subprocess.CompletedProcess[str]) -> None:
    detail = (result.stderr or result.stdout or "").strip().splitlines()
    raise StoreError(f"{label} failed: {detail[-1] if detail else f'exit {result.returncode}'}")


# --- postgres ---------------------------------------------------------------


def postgres_bin() -> Path:
    """Where this machine keeps initdb and pg_ctl.

    Debian keeps them out of PATH under a per-version directory, so `which` finds
    psql and misses the two that matter. The newest version wins when several are
    installed.
    """
    versions = sorted(
        (p for p in Path("/usr/lib/postgresql").glob("*/bin") if (p / "pg_ctl").is_file()),
        key=lambda p: int(p.parent.name) if p.parent.name.isdigit() else 0,
        reverse=True,
    )
    if versions:
        return versions[0]
    found = shutil.which("pg_ctl")
    if found:
        return Path(found).parent
    raise StoreError(
        "Postgres is not installed on this machine. It comes from the distribution "
        "rather than from this repository, so install it first:\n"
        "    sudo apt-get install -y postgresql\n"
        "Nothing else here needs root."
    )


def _initdb(binaries: Path, log: Log) -> None:
    """Create the cluster this deployment will use.

    Owned by the invoking user and living entirely under one directory, so the
    server needs no privileges and leaves nothing behind elsewhere. Loopback
    trust is used only during bootstrap; reader provisioning then installs
    password authentication and saves separate owner and reader credentials.
    """
    log(f"installing a Postgres cluster in {POSTGRES_DIR}")
    POSTGRES_DIR.parent.mkdir(parents=True, exist_ok=True)
    result = _run([
        binaries / "initdb", "-D", POSTGRES_DIR,
        "-U", POSTGRES_USER, "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8",
    ])
    if result.returncode != 0:
        _fail("initdb", result)


def _start_postgres(binaries: Path, log: Log) -> None:
    # -k /tmp because the default socket directory is not writable by this user,
    # and the port is the one .env.local expects.
    result = _run([
        binaries / "pg_ctl", "-D", POSTGRES_DIR,
        "-o", f"-p {POSTGRES_PORT} -k /tmp -c listen_addresses=127.0.0.1",
        "-l", STORE_DATA / "postgres.log", "-w", "start",
    ], timeout=180)
    if result.returncode != 0:
        _fail("starting Postgres", result)
    _wait_until("Postgres", lambda: _port_open(POSTGRES_PORT))
    log(f"Postgres serving on {POSTGRES_PORT}")


def _ensure_database(binaries: Path, log: Log) -> None:
    """The role and database the Explorer connects as.

    Separate from initdb because a cluster that already exists may predate this,
    and because both are checked rather than assumed: creating one that is there
    is an error, and skipping one that is not leaves the Explorer unable to
    connect for a reason nothing would explain.
    """
    env = {"PGHOST": "127.0.0.1", "PGPORT": str(POSTGRES_PORT), "PGUSER": POSTGRES_USER}
    # Provisioning enables password authentication for the local cluster.
    # Read the saved owner password when a stopped store is brought back.
    saved = EXPLORER_DIR / ".env.local"
    if saved.is_file():
        import json
        for line in saved.read_text(encoding="utf-8").splitlines():
            if line.startswith("PGPASSWORD="):
                value = line.partition("=")[2].strip()
                try:
                    value = json.loads(value)
                except (ValueError, TypeError):
                    value = value.strip("'\"")
                env["PGPASSWORD"] = str(value)
    psql = binaries / "psql"

    exists = _run([psql, "-d", "postgres", "-Atc",
                   f"SELECT 1 FROM pg_roles WHERE rolname = '{POSTGRES_USER}'"], env=env)
    if exists.returncode == 0 and exists.stdout.strip() != "1":
        created = _run([psql, "-d", "postgres", "-c",
                        f"CREATE ROLE {POSTGRES_USER} LOGIN SUPERUSER"], env=env)
        if created.returncode != 0:
            _fail("creating the Explorer role", created)
        log(f"created Postgres role {POSTGRES_USER}")

    has_db = _run([psql, "-d", "postgres", "-Atc",
                   f"SELECT 1 FROM pg_database WHERE datname = '{POSTGRES_DB}'"], env=env)
    if has_db.returncode != 0:
        _fail("checking for the Explorer database", has_db)
    if has_db.stdout.strip() != "1":
        created = _run([psql, "-d", "postgres", "-c",
                        f"CREATE DATABASE {POSTGRES_DB} OWNER {POSTGRES_USER}"], env=env)
        if created.returncode != 0:
            _fail("creating the Explorer database", created)
        log(f"created Postgres database {POSTGRES_DB}")


def ensure_postgres(log: Log) -> None:
    if _port_open(POSTGRES_PORT):
        log(f"Postgres already serving on {POSTGRES_PORT}; using it")
        return

    binaries = postgres_bin()
    if not (POSTGRES_DIR / "PG_VERSION").is_file():
        _initdb(binaries, log)
    _start_postgres(binaries, log)
    _ensure_database(binaries, log)


# --- clickhouse -------------------------------------------------------------


CLICKHOUSE_CONFIG = """<clickhouse>
    <!-- Single node, run as the invoking user, no root and no system paths.
         Everything lives under one directory so it can be moved or removed
         without touching the rest of the machine. -->
    <logger>
        <level>information</level>
        <log>{root}/logs/clickhouse-server.log</log>
        <errorlog>{root}/logs/clickhouse-server.err.log</errorlog>
        <size>200M</size>
        <count>3</count>
    </logger>

    <http_port>{http_port}</http_port>
    <tcp_port>{tcp_port}</tcp_port>
    <listen_host>127.0.0.1</listen_host>

    <path>{root}/data/</path>
    <tmp_path>{root}/data/tmp/</tmp_path>
    <user_files_path>{root}/data/user_files/</user_files_path>
    <format_schema_path>{root}/data/format_schemas/</format_schema_path>

    <!-- Its own budget in bytes, not a share of the machine's total. A ratio
         says nothing about what is left once a prover has taken three or four
         gigabytes; a fixed figure is a promise this server can keep whatever
         else is running. This event log is millions of rows, not billions, and
         sits at about 600 MiB. -->
    <max_server_memory_usage>2147483648</max_server_memory_usage>
    <mark_cache_size>536870912</mark_cache_size>

    <!-- Measure this process, not whatever else shares its cgroup.

         Started from a terminal, the server lands in that terminal's scope
         alongside the chain node, the vault keepers and the prover. Asked how
         much memory it was using, it read the scope's total and answered for all
         of them: 5.6 GiB against a 4.6 GiB limit while its own resident set was
         705 MiB. It then refused every query, including the ones asking what was
         wrong, and the Explorer's index stopped advancing for hours while the
         store fell behind the chain. -->
    <memory_worker_use_cgroup>false</memory_worker_use_cgroup>

    <users_config>users.xml</users_config>
    <default_profile>default</default_profile>
    <default_database>default</default_database>
    <mlock_executable>false</mlock_executable>
</clickhouse>
"""

CLICKHOUSE_USERS = """<clickhouse>
    <profiles>
        <default>
            <max_memory_usage>4000000000</max_memory_usage>
            <use_uncompressed_cache>0</use_uncompressed_cache>
            <load_balancing>random</load_balancing>
        </default>
    </profiles>
    <users>
        <default>
            <password></password>
            <!-- Bound to loopback in config.xml; this is a development node. -->
            <networks><ip>127.0.0.1</ip></networks>
            <profile>default</profile>
            <quota>default</quota>
            <access_management>1</access_management>
        </default>
    </users>
    <quotas><default></default></quotas>
</clickhouse>
"""


def _download(url: str, target: Path, log: Log) -> None:
    log(f"downloading {url.rsplit('/', 1)[-1]}")
    # Some CDNs (packages.clickhouse.com among them) 403 the default
    # "Python-urllib/x.y" user agent as a bot-blocking measure -- a browser-like
    # one gets through the same request unchanged otherwise.
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as handle:
            shutil.copyfileobj(response, handle)
    except (urllib.error.URLError, OSError) as exc:
        raise StoreError(f"could not download {url}: {exc}") from exc


def _install_clickhouse(log: Log) -> None:
    """Fetch the pinned build, check it, and lay out a single-node server.

    The checksum is not ceremony: this is a binary fetched over the network and
    then run, so the one thing worth being sure of is that it is the build the
    project pinned rather than whatever answered the request.
    """
    staging = STORE_DATA / "clickhouse-dl"
    staging.mkdir(parents=True, exist_ok=True)
    archive = staging / CLICKHOUSE_TARBALL
    digest_file = staging / f"{CLICKHOUSE_TARBALL}.sha512"

    if not archive.is_file():
        _download(CLICKHOUSE_URL, archive, log)
    if not digest_file.is_file():
        _download(f"{CLICKHOUSE_URL}.sha512", digest_file, log)

    expected = digest_file.read_text(encoding="utf-8").split()[0].lower()
    actual = hashlib.sha512(archive.read_bytes()).hexdigest()
    if actual != expected:
        archive.unlink(missing_ok=True)
        raise StoreError(
            f"{CLICKHOUSE_TARBALL} did not match its published SHA-512; the download "
            "has been removed. Retry, and if it fails again do not run the binary."
        )
    log(f"verified {CLICKHOUSE_TARBALL} against its published SHA-512")

    # Extract only the regular executable needed by this installer. Do not
    # unpack links, arbitrary archive paths, debug files or packaged examples.
    for name in ("bin", "etc", "data", "logs"):
        (CLICKHOUSE_DIR / name).mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive) as tar:
        member = next((item for item in tar.getmembers()
                       if item.isfile() and item.name.endswith("/usr/bin/clickhouse")), None)
        if member is None:
            raise StoreError(f"no clickhouse binary inside {CLICKHOUSE_TARBALL}")
        stream = tar.extractfile(member)
        if stream is None:
            raise StoreError("could not read the ClickHouse executable")
        with stream, (CLICKHOUSE_DIR / "bin" / "clickhouse").open("wb") as output:
            shutil.copyfileobj(stream, output)
    (CLICKHOUSE_DIR / "bin" / "clickhouse").chmod(0o755)
    (CLICKHOUSE_DIR / "etc" / "config.xml").write_text(
        CLICKHOUSE_CONFIG.format(
            root=CLICKHOUSE_DIR, http_port=CLICKHOUSE_PORT, tcp_port=CLICKHOUSE_TCP_PORT), encoding="utf-8")
    (CLICKHOUSE_DIR / "etc" / "users.xml").write_text(CLICKHOUSE_USERS, encoding="utf-8")
    log(f"installed ClickHouse {CLICKHOUSE_VERSION} in {CLICKHOUSE_DIR}")


def _start_clickhouse(log: Log, attempts: int = 6) -> None:
    """Start the server, and start it again if it quits while starting.

    A server that is still shutting down holds a lock on its data directory for
    a few seconds after it stops answering. A new one started in that window
    exits at once ("Another server instance in same directory is already
    running"), and waiting 90 seconds for it to answer only ends with nothing
    running at all -- which is how a restart found ClickHouse down, started it,
    and left it down. So a server that exits before it answers is started again
    once the old one has had time to let go.
    """
    binary = CLICKHOUSE_DIR / "bin" / "clickhouse"
    config = CLICKHOUSE_DIR / "etc" / "config.xml"
    logs = CLICKHOUSE_DIR / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, attempts + 1):
        with (logs / "start.log").open("a", encoding="utf-8") as handle:
            process = subprocess.Popen(
                [str(binary), "server", f"--config-file={config}"],
                cwd=str(CLICKHOUSE_DIR),
                stdout=handle, stderr=subprocess.STDOUT, start_new_session=True,
            )
        deadline = time.time() + 90
        while time.time() < deadline:
            if _clickhouse_ready():
                log(f"ClickHouse serving on {CLICKHOUSE_PORT}")
                return
            if process.poll() is not None:
                break
            time.sleep(1)
        else:
            raise StoreError("ClickHouse did not become ready within 90s")
        log(f"ClickHouse exited while starting (attempt {attempt} of {attempts}); "
            "waiting for a previous instance to release its data directory")
        time.sleep(5)
    raise StoreError(
        f"ClickHouse would not start after {attempts} attempts; "
        f"see {logs / 'clickhouse-server.err.log'}"
    )


def ensure_clickhouse(log: Log) -> None:
    if _clickhouse_ready():
        log(f"ClickHouse already serving on {CLICKHOUSE_PORT}; using it")
        return
    if not (CLICKHOUSE_DIR / "bin" / "clickhouse").is_file():
        _install_clickhouse(log)
    elif not (CLICKHOUSE_DIR / "etc" / "config.xml").is_file():
        _install_clickhouse(log)
    _start_clickhouse(log)


# --- schema and freshness ---------------------------------------------------


STORE_SETTINGS = {
    "EXPLORER_STORE_DATA": str(STORE_DATA),
    "EXPLORER_POSTGRES_PORT": str(POSTGRES_PORT),
    "EXPLORER_CLICKHOUSE_PORT": str(CLICKHOUSE_PORT),
    "EXPLORER_CLICKHOUSE_TCP_PORT": str(CLICKHOUSE_TCP_PORT),
    "PGHOST": "127.0.0.1",
    "PGPORT": str(POSTGRES_PORT),
    "PGUSER": POSTGRES_USER,
    "PGDATABASE": POSTGRES_DB,
    "CLICKHOUSE_URL": f"http://127.0.0.1:{CLICKHOUSE_PORT}",
    "CLICKHOUSE_DATABASE": POSTGRES_DB,
}


def ensure_env_local(log: Log) -> None:
    """Make sure `.env.local` says where these stores are.

    Everything that touches the store reads that file: the Explorer, the indexer,
    the watcher, the migration. On a server that has never run this, it does not
    exist -- and the defaults in the code are not these. Postgres defaults to
    5432 while this installs on 5433, so the migration would look for a server
    that is not there; `CLICKHOUSE_URL` defaults to unset, which quietly puts the
    event log back in Postgres and leaves the ClickHouse just installed doing
    nothing.

    Only missing keys are added. A line somebody set by hand is theirs, and a
    deployment pointed at a shared database should not be moved onto a local one
    by a script whose job was to make sure a local one exists.
    """
    env_local = EXPLORER_DIR / ".env.local"
    existing = {}
    if env_local.is_file():
        for line in env_local.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                existing[line.split("=", 1)[0].strip()] = True

    missing = {k: v for k, v in STORE_SETTINGS.items() if k not in existing}
    if not missing:
        return

    with env_local.open("a", encoding="utf-8") as handle:
        if env_local.stat().st_size > 0:
            handle.write("\n")
        handle.write("# Where the Explorer's stores are. Added by scripts/network/explorer_stores.py.\n")
        for key, value in missing.items():
            handle.write(f"{key}={value}\n")
    log(f"wrote {len(missing)} store setting(s) to {env_local.name}: {', '.join(missing)}")


def _npm(script: str, label: str, env: dict[str, str] | None = None) -> None:
    result = _run(["npm", "run", "--silent", script], cwd=EXPLORER_DIR, env=env, timeout=600)
    if result.returncode != 0:
        _fail(label, result)


def ensure_stores(log: Log, env: dict[str, str] | None = None, fresh: bool = False) -> None:
    """Both stores up, migrated, and emptied for a fresh run.

    The migration is the schema step and the proof in one: a socket accepts a
    connection while a database is still replaying its log, so "reachable" is not
    "usable" and only a real statement settles it.

    `fresh` empties the index, because a run deploys contracts afresh and
    redeploying with the same deployer and nonces puts every contract back at the
    address it had. The indexer's "same deployment?" check therefore says yes to
    a chain that was replaced minutes ago, and last run's events sit beside this
    run's. A fresh run says so rather than leaving it to be inferred.
    """
    ensure_postgres(log)
    ensure_clickhouse(log)
    ensure_env_local(log)

    _npm("db:migrate", "migrating the Explorer store", env)
    log("Explorer store migrated")
    result = _run(["node", "scripts/provision_reader.mjs"], cwd=EXPLORER_DIR, env=env, timeout=90)
    if result.returncode != 0:
        _fail("provisioning the public database reader", result)
    log("Public database reader provisioned")
    if fresh:
        _npm("index:reset", "clearing the Explorer index", env)
        log("Explorer index cleared for a fresh run")


if __name__ == "__main__":  # pragma: no cover - manual check
    import sys

    def _stdout(message: str) -> None:
        print(f"[explorer-stores] {message}", flush=True)

    try:
        ensure_stores(_stdout, fresh="--fresh" in sys.argv)
    except StoreError as exc:
        print(f"[explorer-stores] ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
