/// Resuming an index instead of rebuilding it.
///
/// Re-reading from block zero on every run is what stops an index from being
/// possible on a real chain: a one-second chain produces about 31 million blocks
/// a year, so the work grows without limit and eventually outlasts any run
/// window. An index only needs to look at what it has not already seen.
///
/// Kept free of network access and configuration so it can be tested on its own.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Resumed file runs only see newly registered entities. Their empty maps
// cannot replace totals owned by the database's persistent entity tables.
export function fileCountersForStore(counts) {
  return Object.fromEntries(Object.entries(counts)
    .filter(([key]) => key !== 'guardians' && key !== 'vaultKeepers'));
}

/// What a previous run left behind. A missing or damaged index is not an error:
/// it just means there is nothing to resume from, and the caller starts over.
export async function readPreviousIndex(dir) {
  const load = async (name, fallback) => {
    try {
      return JSON.parse(await readFile(path.join(dir, name), 'utf8'));
    } catch {
      return fallback;
    }
  };
  return {
    manifest: await load('manifest.json', null),
    events: await load('filetrust-events.json', []),
    logs: await load('logs.json', []),
    blocks: await load('blocks.json', []),
    transactions: await load('transactions.json', []),
  };
}

/// Newest first, capped.
///
/// Blocks and transactions back a "latest activity" view rather than a full
/// archive, so keeping every one of them would grow the file without limit for
/// a list nobody scrolls to the end of. A resumed run must still carry the
/// previous ones forward: without that, each pass replaces the list with only
/// the handful of blocks it just read, and a page that showed hundreds of
/// transactions suddenly shows none.
export function mergeRecent(previous, current, identity, keep) {
  const merged = mergeById(current, previous, identity);
  merged.sort((a, b) => {
    const an = BigInt(a.number ?? a.blockNumber ?? 0);
    const bn = BigInt(b.number ?? b.blockNumber ?? 0);
    return an === bn ? 0 : (an > bn ? -1 : 1);
  });
  return keep > 0 ? merged.slice(0, keep) : merged;
}

/// Whether a previous index can be continued, and from which block.
///
/// It cannot when the chain underneath has changed: a different chain id means
/// the stored events describe something else entirely, and a chain whose head is
/// behind the recorded end has been reset, so the index is ahead of reality.
/// Both must rebuild rather than append onto a mismatch. An explicit start block
/// always means the caller wants a rebuild.
export function planResume({ manifest, latest, explicitFrom, chainId, decoderHash, contracts }) {
  if (manifest === null || manifest === undefined) {
    return { resumable: false, fromBlock: explicitFrom ?? 0n, reason: 'no previous index' };
  }
  if (explicitFrom !== null && explicitFrom !== undefined) {
    return { resumable: false, fromBlock: explicitFrom, reason: 'explicit start block' };
  }
  if (String(manifest.chainId ?? '') !== String(chainId)) {
    return { resumable: false, fromBlock: 0n, reason: 'different chain' };
  }
  if (contracts) {
    const identity = (entries) => JSON.stringify((entries ?? [])
      .map(({ name, address }) => [name, String(address).toLowerCase()])
      .sort(([a], [b]) => a.localeCompare(b)));
    if (identity(manifest.contracts) !== identity(contracts)) {
      return { resumable: false, fromBlock: 0n, reason: 'contract deployment changed' };
    }
  }
  if (decoderHash && manifest.decoderHash !== decoderHash) {
    // Installing the correct ABIs must recover events an older decoder missed,
    // not just decode tomorrow's logs correctly. This happens once per change.
    return { resumable: false, fromBlock: 0n, reason: 'event ABIs changed' };
  }
  const previousEnd = BigInt(manifest.toBlock ?? 0);
  if (previousEnd > latest) {
    return { resumable: false, fromBlock: 0n, reason: 'chain moved backwards' };
  }
  return { resumable: true, fromBlock: previousEnd + 1n, reason: 'resuming' };
}

/// Join what was already indexed with what this run found, keeping one copy of
/// anything seen twice. A resumed run that overlaps by a block, or a retry, must
/// not leave the same event in the index more than once.
export function mergeById(previous, current, identity) {
  const seen = new Set();
  const out = [];
  for (const item of [...previous, ...current]) {
    const key = identity(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/// Identity of a log or decoded event: one entry per log position on chain.
export function logIdentity(item) {
  return `${item.transactionHash ?? ''}:${item.logIndex ?? ''}:${item.address ?? ''}`;
}
