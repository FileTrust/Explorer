/// Event definitions taken from the compiled contracts.
///
/// The indexer used to carry its own copy of every event signature, written out
/// by hand. A signature is part of the contract, and a copy of it is a copy that
/// drifts: rename an argument's type, add a field, and the copy still parses,
/// still produces a topic hash, and matches nothing the chain ever emits. There
/// is no error -- the log simply is not one this indexer knows, so it is skipped.
///
/// Measured against a running chain, the hand-written list decoded 576 of 1,074
/// logs. Seven contracts decoded none of theirs at all: the guardian registry,
/// the data vault, both DKG contracts, the threshold ElGamal contract, the
/// guardian share proofs and the receipt disputes. The screens fed by those were
/// empty, and being empty is indistinguishable from a network where nothing has
/// happened yet. The same chain, read from the artifacts, decodes 1,074 of
/// 1,074.
///
/// So the definitions come from the artifacts the contracts were deployed from,
/// which cannot drift from the deployment because they are what produced it.
import fs from 'node:fs';
import path from 'node:path';

/// Artifacts sit beside the addresses file, because they are written by the same
/// deployment: `<chain>/artifacts/contracts/<Name>.sol/<Name>.json`. Both chains
/// in this repository are laid out that way.
function artifactRoots(deployedPath) {
  const base = path.dirname(deployedPath);
  return [
    ...(process.env.EXPLORER_BLOCKCHAIN_ROOT
      ? [path.join(process.env.EXPLORER_BLOCKCHAIN_ROOT, 'artifacts', 'contracts')] : []),
    path.join(base, 'artifacts', 'contracts'),
    // Hardhat writes a `build-info` sibling; some checkouts keep the artifacts a
    // level up from the addresses file rather than beside it.
    path.join(base, '..', 'artifacts', 'contracts'),
  ];
}

/// Solidity allows one file to hold several contracts, and a contract's artifact
/// is not always under a file of its own name, so the direct path is tried first
/// and the tree searched only if that misses.
function findArtifact(roots, name) {
  for (const root of roots) {
    const direct = path.join(root, `${name}.sol`, `${name}.json`);
    if (fs.existsSync(direct)) return direct;
  }
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    const stack = [root];
    while (stack.length > 0) {
      const dir = stack.pop();
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.name === `${name}.json`) return full;
      }
    }
  }
  return null;
}

const cache = new Map();

/**
 * The event ABI items for one contract, or null when no artifact is available.
 *
 * Null rather than an empty list, so the caller can tell "this contract has no
 * events" from "this contract's artifacts are not on this machine" and fall back
 * for the second rather than silently indexing nothing. An Explorer deployed
 * away from the chain repository is the ordinary case for the second.
 */
export function artifactEvents(deployedPath, name) {
  const key = `${deployedPath}|${name}`;
  if (cache.has(key)) return cache.get(key);

  const file = findArtifact(artifactRoots(deployedPath), name);
  let events = null;
  if (file) {
    try {
      const abi = JSON.parse(fs.readFileSync(file, 'utf8')).abi;
      if (Array.isArray(abi)) events = abi.filter((item) => item?.type === 'event');
    } catch {
      events = null;
    }
  }
  cache.set(key, events);
  return events;
}
