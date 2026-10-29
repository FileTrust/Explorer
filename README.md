# FileTrust Explorer

A read-only web explorer for the FileTrust blockchain, built with Next.js and
React. It displays blocks, transactions, contracts, storage proofs, Guardians,
VaultKeepers and protocol activity. The indexer maintains PostgreSQL state and
a ClickHouse event store.

The repository contains application source, the default database installer and
SQL migrations. It contains no operational environment, database snapshots,
saved wallet activity, deployed address inventory or private Git history.

## Requirements

- Linux for the full default installer and systemd services.
- Node.js 24 with npm, Python 3.12 or newer, Bash and Git.
- PostgreSQL server binaries from your Linux distribution. The helper detects
  `initdb`, `pg_ctl` and `psql`; a separate system-wide PostgreSQL instance is not
  needed for the Explorer's own cluster.
- The bundled ClickHouse downloader currently targets Linux x86-64. Other
  platforms need a separately installed compatible ClickHouse service.

On Debian or Ubuntu, install PostgreSQL and Python if missing:

```sh
sudo apt-get update
sudo apt-get install postgresql python3
```

Install Node.js separately if your distribution's version is older than the
version above. See the [Node.js downloads](https://nodejs.org/en/download) and
[PostgreSQL installation documentation](https://www.postgresql.org/download/linux/).

## Default installation: app + PostgreSQL + ClickHouse

```sh
git clone https://github.com/FileTrust/Explorer.git
cd Explorer
./install.sh --network-config https://config.filetrust.io/v1/network-config
```

The public FileTrust configuration service is the default; pass your own network
configuration URL to display a different deployment. This endpoint is a public
bootstrap service, not an embedded private RPC or server inventory.

The installer:

1. Installs the exact npm lockfile and validates the selected network/RPC chain ID.
2. Downloads that network's public contract addresses, ABIs and source metadata
   into a local cache. The committed address map is an unconfigured template.
3. Initializes a dedicated PostgreSQL cluster if missing and starts it on loopback.
4. Downloads the pinned ClickHouse 26.8.2.7 LTS executable, verifies its published
   SHA-512 checksum and starts a local ClickHouse store.
5. Applies the PostgreSQL SQL migrations and ClickHouse schema included in `db/`.
6. Generates separate database owner/indexer and read-only web credentials,
   enables password authentication, and saves private settings with mode `0600`.
7. Builds the web app and installs the web and indexer services when systemd is
   available and service installation is selected.

Defaults:

| Component | Default |
| --- | --- |
| PostgreSQL | `127.0.0.1:5433`, database `filetrust_explorer` |
| ClickHouse HTTP | `127.0.0.1:8123`, database `filetrust_explorer` |
| ClickHouse native TCP | `127.0.0.1:9100` |
| Database files | `~/.filetrust-data/postgres` and `~/.filetrust-data/clickhouse` |
| Web app | Port `3001`; installer binds all interfaces unless `--bind` is given |

Behind your own reverse proxy, bind the app to loopback:

```sh
./install.sh --bind 127.0.0.1
```

Use `--user` for user services or `--no-service` to prepare everything without
registering services. PostgreSQL and ClickHouse data remain local to the invoking
user. Do not run multiple installers against the same data directory.

## Database files and maintenance

PostgreSQL uses the ordered migrations in `db/migrations/`; ClickHouse uses
`db/clickhouse/001_init.sql`. These are schemas, not copies of operational data.

```sh
npm run db:migrate
npm run index
npm run index:watch
```

Reinstallation preserves indexed history by default. Use `--fresh` only when
you deliberately want to clear it. The standalone database helper also preserves
history by default:

```sh
python3 explorer_stores.py --keep-index
```

For a separate installation, choose its directory and ports **before initial
setup**. They are saved with the private owner settings:

```sh
EXPLORER_STORE_DATA=/path/to/your/explorer-data \
EXPLORER_POSTGRES_PORT=15433 \
EXPLORER_CLICKHOUSE_PORT=18123 \
EXPLORER_CLICKHOUSE_TCP_PORT=19100 \
./install.sh --no-service
```

The web process uses `.env.web` with restricted reader credentials. Migrations
and indexing use the owner settings in `.env.local`. Neither file, its backups,
database directories or generated index snapshots belongs in Git or a release
archive. See [database setup details](db/README.md).

## Build and run manually

The source can be compiled without a live network or database:

```sh
npm ci --ignore-scripts
npm run build
```

To connect it to a network, configure it and prepare the default stores first:

```sh
python3 configure.py --network-config https://config.filetrust.io/v1/network-config
python3 explorer_stores.py --keep-index
npm run build
npm run start
```

Run `npm run index:watch` separately if not using the installed indexer service.
Changing networks updates the compiled address map and requires a rebuild. A
network/deployment migration needs an explicit indexed-history review.

For development, `npm run dev` serves port 3001. Use `.env.example` as a template,
not as a source of credentials; installation generates the real local settings.

## Security and licensing

The Explorer does not need wallet signing keys. Its public RPC proxy limits
requests to reviewed read methods. Separate the web reader from database
administration and indexing. See [SECURITY.md](SECURITY.md).

FileTrust-owned Explorer code uses **FSL-1.1-ALv2**, matching the FileTrust project.
The full terms are in [LICENSE](LICENSE). This is Fair Source with an Apache 2.0
future grant, rather than immediately open source. Dependencies retain their
own licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).
