#!/usr/bin/env python3
"""Point this Explorer at a network, from the network's own config service.

Every other FileTrust app asks the config service while it runs. The Explorer
cannot: its contract addresses are compiled into the build, and twenty-six
files import them. So it asks here instead -- at install, and again whenever
you reinstall after a redeploy -- and the build that follows carries the
answer.

What it writes:

    src/lib/addresses.ts   the contract addresses, for the browser
    deployed_addresses.json  the same, for the indexer, which reads a file
    .env.local             the chain, RPC, config and price service settings
    .network/              this deployment's artifacts, source and compiler metadata

What it does not touch: anything about the two stores. The indexed history
belongs to this machine, not to a deploy, and a redeploy that empties it is a
separate decision made with --fresh.

    python3 configure.py --network-config https://config.filetrust.io/v1/network-config
    python3 configure.py --show
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath

HERE = Path(__file__).resolve().parent
ADDRESSES_TS = HERE / "src" / "lib" / "addresses.ts"
DEPLOYED_JSON = HERE / "deployed_addresses.json"
ENV_LOCAL = HERE / ".env.local"
ZERO = "0x" + "0" * 40
DEFAULT_CONFIG_URL = "https://config.filetrust.io/v1/network-config"

# What the Explorer shows, and what it calls each one on screen.
#
# The same list lives in update_configs.py, which writes this file for the
# monorepo. test_configure.py fails if the two ever disagree, because a
# contract added in one place and not the other is a screen that silently
# stops naming an address.
EXPLORER_CONTRACTS: tuple[tuple[str, str], ...] = (
    ("GuardianRegistry", "Guardian Registry"),
    ("VaultKeeperRegistry", "VaultKeeper Registry"),
    ("VKEscrow", "VK Escrow"),
    ("AccessControlFT", "Access Control"),
    ("DataVault", "Data Vault"),
    ("CapacityProofSC", "Capacity Proof"),
    ("PartitionSnapshotProofSC", "Partition Snapshot Proof"),
    ("CapacityCertificationSC", "Capacity Certification"),
    ("CapacityIncrementalBatchSC", "Capacity Incremental Batch"),
    ("StorageProofSC", "Storage Proof"),
    ("FileRegistrationSC", "File Registration"),
    ("StorageReceiptDispute", "Storage Dispute"),
    ("StorageRegistrationTimeout", "Storage Registration Timeout"),
    ("GuardianShareProof", "Guardian Share Proof"),
    ("ZkDkgCoordinatorV2", "ZK-DKG Coordinator"),
    ("DkgAttemptController", "DKG Attempt Controller"),
    ("DkgAttemptRegistry", "DKG Attempt Registry"),
    ("DkgAttemptEscrow", "DKG Attempt Escrow"),
    ("DkgCommitmentBook", "DKG Commitments"),
    ("ZkDkgDisputeManager", "ZK-DKG Dispute Mgr"),
    ("TElGv2", "TElG v2"),
    ("ReputationManager", "Reputation Manager"),
    ("StakingManager", "Staking Manager"),
    ("RewardManager", "Reward Manager"),
    ("GuardianWorkReward", "Guardian Work Reward"),
)


class ConfigureError(Exception):
    """The config service could not be read, or did not answer with a config."""


def _fetch(url: str, timeout: float) -> dict:
    request = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "FileTrust-Explorer",
    })
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            if response.status != 200:
                raise ConfigureError(f"the config service answered HTTP {response.status}")
            raw = response.read(64 * 1024 * 1024 + 1)
            if len(raw) > 64 * 1024 * 1024:
                raise ConfigureError("the config service sent more than 64 MB")
            payload = json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError:
        raise
    except ConfigureError:
        raise
    except Exception as exc:
        raise ConfigureError(f"the config service could not be reached: {exc}") from exc
    if not isinstance(payload, dict) or "deployed_addresses" not in payload:
        raise ConfigureError("the config service did not answer with a config")
    return payload


def fetch(url: str, timeout: float = 30.0) -> dict:
    # Source and compiler metadata are an Explorer-only download. Other roles
    # keep using the smaller bootstrap response. Older services still work.
    explorer_url = url.removesuffix("/v1/network-config") + "/v1/explorer-config" \
        if url.endswith("/v1/network-config") else url
    try:
        try:
            return _fetch(explorer_url, timeout)
        except urllib.error.HTTPError as exc:
            if exc.code != 404 or explorer_url == url:
                raise
            return _fetch(url, timeout)
    except urllib.error.HTTPError as exc:
        raise ConfigureError(f"the config service answered HTTP {exc.code}") from exc


def saved_env() -> dict[str, str]:
    if not ENV_LOCAL.is_file():
        return {}
    result = {}
    for line in ENV_LOCAL.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.partition("=")
        if sep and not key.strip().startswith("#"):
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def checked_url(value: str) -> str:
    value = str(value or "").strip()
    parts = urllib.parse.urlsplit(value)
    if parts.scheme not in ("http", "https") or not parts.netloc or parts.fragment \
            or any(char.isspace() for char in value):
        raise ConfigureError("service addresses must be full http or https URLs")
    return value.rstrip("/")


def check_rpc(url: str, expected_chain_id: str) -> None:
    request = urllib.request.Request(url, data=json.dumps({
        "jsonrpc": "2.0", "id": 1, "method": "eth_chainId", "params": [],
    }).encode(), headers={"Content-Type": "application/json", "User-Agent": "FileTrust-Explorer"})
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            actual = int(json.loads(response.read())["result"], 16)
        if actual != int(expected_chain_id):
            raise ConfigureError(f"RPC chain {actual} does not match config chain {expected_chain_id}")
    except ConfigureError:
        raise
    except Exception as exc:
        raise ConfigureError("the selected RPC did not answer eth_chainId") from exc


def deployment_aliases(files: dict, deployed: dict) -> None:
    """Resolve deployment names (including generated verifiers) to artifacts.

    A deployment calls an adapter StorageProofVerifier and a library
    PublicInputMSMLib even when Solidity names them differently. The catalog
    links those deployment names, so each needs the matching artifact too.
    """
    artifacts = {}
    for content in files.values():
        if not isinstance(content, dict) or not isinstance(content.get("abi"), list):
            continue
        name, source = content.get("contractName"), content.get("sourceName")
        if name:
            artifacts.setdefault(name, content)
        if name and source:
            artifacts[f"{source}:{name}"] = content
    contracts = deployed.get("contracts") or {}
    env = deployed.get("env") or {}
    targets = {
        "StorageProofVerifier": "GnarkStorageProofVerifierAdapter",
        "StorageProofPartitionVerifier": "GnarkPartitionProofVerifierAdapter132",
        "StorageProofGeneratedVerifier": env.get("STORAGE_PROOF_GENERATED_VERIFIER_CONTRACT"),
        "StorageProofPartitionGeneratedVerifier": env.get("STORAGE_PROOF_PARTITION_GENERATED_VERIFIER_CONTRACT"),
        "PublicInputMSMLib": env.get("PUBLIC_INPUT_MSM_LIB_CONTRACT", "PublicInputMSMLib"),
    }
    profiles = contracts.get("ShareVerifierByCommittee") or {}
    aliases = {name: (address, targets.get(name, name)) for name, address in contracts.items()
               if isinstance(address, str) and re.fullmatch(r"0x[0-9a-fA-F]{40}", address)}
    for profile, address in profiles.items():
        if re.fullmatch(r"\d+:\d+", profile):
            n, t = profile.split(":")
            name = f"ShareVerifierN{n}T{t}"
            aliases[name] = (address, name)
    for n, address in (contracts.get("ShareVerifierByParticipantCount") or {}).items():
        profile = next((key for key, value in profiles.items() if value.lower() == address.lower()), "")
        if re.fullmatch(r"\d+:\d+", profile):
            count, threshold = profile.split(":")
            aliases[f"ShareVerifierByParticipantCount{n}"] = (address, f"ShareVerifierN{count}T{threshold}")
    for alias, (address, target) in aliases.items():
        artifact = artifacts.get(target)
        if artifact and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", alias):
            files[f"artifacts/contracts/{alias}.sol/{alias}.json"] = {
                **artifact, "deployedAddress": address,
            }


def install_contract_files(payload: dict) -> Path | None:
    files = payload.get("explorer_files") or {}
    if not isinstance(files, dict):
        raise ConfigureError("the contract package is not a file map")
    files = dict(files)
    if not files:
        # Compatibility with an older config service: install its ABIs even
        # when it cannot yet supply source and compiler metadata.
        for name, artifact in (payload.get("artifact_files") or {}).items():
            if not isinstance(artifact, dict) or not isinstance(artifact.get("abi"), list):
                continue
            source = artifact.get("sourceName") or f"contracts/{Path(name).stem}.sol"
            contract = artifact.get("contractName") or Path(name).stem
            files[f"artifacts/{source}/{contract}.json"] = artifact
    if not files:
        return None
    deployment_aliases(files, payload.get("deployed_addresses") or {})

    for name, content in files.items():
        path = PurePosixPath(name)
        if path.is_absolute() or ".." in path.parts or "\\" in name or not (
            (name.startswith("contracts/") and name.endswith(".sol") and isinstance(content, str))
            or (name.startswith(("artifacts/contracts/", "artifacts/build-info/"))
                and name.endswith(".json") and isinstance(content, dict))
        ):
            raise ConfigureError("the contract package contains an invalid file path")
        if isinstance(content, dict) and "abi" in content:
            source = PurePosixPath(str(content.get("sourceName", "contracts/unknown.sol")))
            build = str(content.get("buildInfoId", ""))
            if source.is_absolute() or ".." in source.parts or "\\" in str(source) \
                    or (build and not re.fullmatch(r"[A-Za-z0-9_-]+", build)):
                raise ConfigureError("the contract package contains invalid source metadata")

    # Publish a complete directory at once, and keep the previous version until
    # the new settings point at this one. Reinstalling never mixes deployments.
    digest = hashlib.sha256(json.dumps(files, sort_keys=True).encode()).hexdigest()[:24]
    root = DEPLOYED_JSON.parent / ".network"
    target = root / digest
    if not target.is_dir():
        root.mkdir(parents=True, exist_ok=True)
        temporary = Path(tempfile.mkdtemp(prefix="incoming-", dir=root))
        try:
            for name, content in files.items():
                destination = temporary / name
                destination.parent.mkdir(parents=True, exist_ok=True)
                text = content if isinstance(content, str) else json.dumps(content)
                destination.write_text(text, encoding="utf-8")
                destination.chmod(0o644)
            # These files are public Explorer metadata. The web service runs
            # under its own identity and must be able to traverse this cache.
            for directory in temporary.rglob("*"):
                if directory.is_dir():
                    directory.chmod(0o755)
            temporary.chmod(0o755)
            os.replace(temporary, target)
        finally:
            if temporary.exists():
                shutil.rmtree(temporary)
    target.chmod(0o755)
    return target


def address_of(deployed: dict, name: str) -> str:
    """One contract's address, or the zero address.

    Zero rather than blank for a contract this deployment does not have: the
    generated file says so plainly, and the screen leaves it out instead of
    labelling an empty string.
    """
    contracts = deployed.get("contracts") if isinstance(deployed, dict) else None
    value = str((contracts or {}).get(name, "") or "").strip()
    if not value.startswith("0x") or len(value) != 42:
        return ZERO
    return value


def render_addresses_ts(deployed: dict) -> str:
    width = max(len(name) for name, _ in EXPLORER_CONTRACTS)
    lines = [
        "// Generated by configure.py from the network config service.",
        "export const CONTRACTS = {",
    ]
    for name, _label in EXPLORER_CONTRACTS:
        pad = " " * (width - len(name) + 1)
        lines.append(f"  {name}:{pad}'{address_of(deployed, name)}' as `0x${{string}}`,")
    lines += [
        "} as const;",
        "",
        "export type ContractName = keyof typeof CONTRACTS;",
        "",
        "export const CONTRACT_LABELS: Record<ContractName, string> = {",
    ]
    for name, label in EXPLORER_CONTRACTS:
        pad = " " * (width - len(name) + 1)
        lines.append(f"  {name}:{pad}{json.dumps(label)},")
    lines += [
        "};",
        "",
        "// A contract this deployment does not have is written as the zero address; it",
        "// names nothing, so it is left out rather than labelling the zero address.",
        "export const ADDRESS_TO_NAME: Record<string, string> = Object.fromEntries(",
        "  Object.entries(CONTRACTS)",
        "    .filter(([, addr]) => !/^0x0{40}$/i.test(addr))",
        "    .map(([name, addr]) => [",
        "      addr.toLowerCase(),",
        "      CONTRACT_LABELS[name as ContractName],",
        "    ])",
        ");",
        "",
    ]
    return "\n".join(lines)


def merge_env(path: Path, values: dict[str, str]) -> list[str]:
    """Set these keys in .env.local, leaving every other line as it was.

    The stores put their own lines in this file, and so may whoever runs it.
    Rewriting the file whole would take their settings with it, so each key is
    replaced in place and anything new is appended.
    """
    lines = path.read_text(encoding="utf-8").splitlines() if path.is_file() else []
    changed: list[str] = []
    for key, value in values.items():
        wanted = f"{key}={value}"
        for index, line in enumerate(lines):
            if line.split("=", 1)[0].strip() == key:
                if line.strip() != wanted:
                    lines[index] = wanted
                    changed.append(key)
                break
        else:
            if not lines or lines[-1].strip():
                lines.append("")
            lines.append(wanted)
            changed.append(key)
    if changed:
        path.write_text("\n".join(lines).rstrip("\n") + "\n", encoding="utf-8")
    return changed


def apply(payload: dict, *, rpc_url: str = "", price_url: str = "",
          chain: str = "", config_url: str = "") -> list[str]:
    deployed = payload.get("deployed_addresses") or {}
    network = payload.get("network") or {}
    written: list[str] = []
    if config_url:
        config_url = checked_url(config_url)
    rpc = checked_url(rpc_url or network.get("rpc_url", ""))
    price = price_url or network.get("ftu_price_url", "")
    if price:
        price = checked_url(price)
    chain_id = str(deployed.get("chainId", "") or "")
    if not chain_id.isdigit() or int(chain_id) <= 0:
        raise ConfigureError("the config service supplied no valid chain id")
    selected_chain = chain or network.get("chain_type") or {
        "31338": "cosmos", "31337": "hardhat",
    }.get(chain_id, "evm")
    if selected_chain not in ("cosmos", "hardhat", "evm"):
        raise ConfigureError("chain must be cosmos, hardhat, or evm")
    contract_root = install_contract_files(payload)

    rendered = render_addresses_ts(deployed)
    current = ADDRESSES_TS.read_text(encoding="utf-8") if ADDRESSES_TS.is_file() else ""
    if rendered != current:
        ADDRESSES_TS.parent.mkdir(parents=True, exist_ok=True)
        ADDRESSES_TS.write_text(rendered, encoding="utf-8")
        written.append("src/lib/addresses.ts")

    # The indexer reads the addresses from a file rather than from the build,
    # so it gets its own copy of exactly what the service published.
    as_json = json.dumps(deployed, indent=2) + "\n"
    if not DEPLOYED_JSON.is_file() or DEPLOYED_JSON.read_text(encoding="utf-8") != as_json:
        DEPLOYED_JSON.write_text(as_json, encoding="utf-8")
        written.append("deployed_addresses.json")

    env: dict[str, str] = {
        "DEPLOYED_ADDRESSES_PATH": str(DEPLOYED_JSON),
        "FILETRUST_CHAIN": selected_chain,
        "EXPLORER_EXPECTED_CHAIN_ID": hex(int(chain_id)),
    }
    if config_url:
        env["NETWORK_CONFIG_URL"] = checked_url(config_url)
    if contract_root:
        env["EXPLORER_BLOCKCHAIN_ROOT"] = str(contract_root)
    if price:
        env["FTU_PRICE_URL"] = price
        env["NEXT_PUBLIC_FTU_PRICE_URL"] = ""
    # Preserve explicit installer overrides on a later reinstall.
    env["EXPLORER_RPC_OVERRIDE"] = rpc_url
    env["EXPLORER_PRICE_OVERRIDE"] = price_url
    env["EXPLORER_CHAIN_OVERRIDE"] = chain
    if rpc:
        # Server-side only. The browser is deliberately NOT given this.
        #
        # A chain node answers on plain http. Give that address to a page
        # served over https and the browser refuses every call, silently --
        # mixed content is blocked, not warned about. The page then shows only
        # what the index holds and looks like a working Explorer that is
        # simply behind.
        #
        # Left empty, the browser calls the Explorer's own /api/rpc, which
        # reaches the chain from the server. That works over http and https
        # alike, which is why it is the app's default.
        env["RPC_URL"] = rpc
        env["NEXT_PUBLIC_RPC_URL"] = ""
    if chain_id:
        env["NEXT_PUBLIC_CHAIN_ID"] = chain_id
    changed = merge_env(ENV_LOCAL, env)
    if changed:
        written.append(".env.local (" + ", ".join(changed) + ")")
    return written


def show() -> int:
    if not ADDRESSES_TS.is_file():
        print("not configured yet: src/lib/addresses.ts does not exist")
        return 1
    print(f"addresses from: {ADDRESSES_TS}")
    for line in ADDRESSES_TS.read_text(encoding="utf-8").splitlines():
        if ":" in line and "0x" in line:
            print("  " + line.strip().rstrip(","))
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--network-config", default="",
                        help="The network config service, e.g. "
                             "https://config.filetrust.io/v1/network-config")
    parser.add_argument("--show", action="store_true",
                        help="Print the addresses this Explorer is built against.")
    parser.add_argument("--rpc", default="", help="Use this RPC instead of the network default.")
    parser.add_argument("--price-url", default="", help="Use this price service instead of the network default.")
    parser.add_argument("--chain", choices=("cosmos", "hardhat", "evm"), default="",
                        help="Chain implementation; otherwise read from the network config.")
    args = parser.parse_args(argv)

    if args.show:
        return show()
    try:
        saved = saved_env()
        url = checked_url(args.network_config or saved.get("NETWORK_CONFIG_URL") or DEFAULT_CONFIG_URL)
        payload = fetch(url)
        # Changing networks drops overrides belonging to the previous one.
        same_network = not args.network_config or args.network_config == saved.get("NETWORK_CONFIG_URL")
        rpc = args.rpc or (saved.get("EXPLORER_RPC_OVERRIDE", "") if same_network else "")
        price = args.price_url or (saved.get("EXPLORER_PRICE_OVERRIDE", "") if same_network else "")
        chain = args.chain or (saved.get("EXPLORER_CHAIN_OVERRIDE", "") if same_network else "")
        check_rpc(checked_url(rpc or payload.get("network", {}).get("rpc_url", "")),
                  str(payload.get("deployed_addresses", {}).get("chainId", "")))
        written = apply(payload, rpc_url=rpc, price_url=price, chain=chain, config_url=url)
    except ConfigureError as exc:
        print(f"  {exc}", file=sys.stderr)
        return 1

    if written:
        print("  wrote " + ", ".join(written))
    else:
        print("  already pointed at this network")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
