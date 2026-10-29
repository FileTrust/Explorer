/// Writing an indexer run into the database.
///
/// Kept beside the indexer rather than inside it, because the indexer's job is
/// reading a chain and this one's is landing the result. It runs only when a
/// store is configured, so the JSON path is untouched until the API is reading
/// from here and the two have been compared.
import {
  deploymentHash,
  ensureDimensions,
  extendInternalTraceBack,
  getCheckpoint,
  getInternalTraceState,
  internalTransfersMigrated,
  recordInternalTrace,
  resetStore,
  setCheckpoint,
  setCounters,
  storedBlockTransactions,
  untracedBlocks,
  writeBlocks,
  writeEvents,
  writeInternalTransfers,
  writeTransactions,
} from '../src/lib/db/ingest.mjs';
import { db, dbReady } from '../src/lib/db/postgres.mjs';
import { contractsNeeded, loadAbis, markDirty, projectAll } from './project_entities.mjs';
import { resolveEscrowLinks } from './escrow_links.mjs';
import { projectRollups } from './project_rollups.mjs';
import { ROLLUP_SPECS } from './rollup_specs.mjs';
import { fileCountersForStore } from './index_resume.mjs';

/// Whether a store is configured and migrated. Absent is not an error: the
/// indexer keeps writing its files and the Explorer keeps reading them.
export async function storeConfigured() {
  if (!process.env.PGHOST && !process.env.DATABASE_URL && !process.env.PGDATABASE) return false;
  return dbReady();
}

/// Whether the event log can be written right now. The log lives in ClickHouse
/// when CLICKHOUSE_URL is set, and Postgres being up says nothing about it.
export async function eventStoreReachable() {
  const url = process.env.CLICKHOUSE_URL;
  if (!url) return true;
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/ping`, { signal: AbortSignal.timeout(3_000) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Where the store really stopped, when that is earlier than the file index.
 *
 * A pass writes the files first and the store second. When the store write
 * fails -- ClickHouse or Postgres down, a restart in the middle -- the files have
 * already moved on, and the next pass resumes after them. Nothing ever sent the
 * store the events of the failed pass: measured here, ClickHouse stopped for one
 * pass that saw seven events, and after it came back the store held 234 of the
 * chain's 241 for good, while every screen looked healthy.
 *
 * The store's own checkpoint only moves after a complete write, so it is the
 * truth about what the store holds. When it is behind, the pass reads again from
 * there; every write is idempotent, so the overlap costs time, not correctness.
 *
 * Null when the store is level with the files, holds another deployment (that
 * is a rebuild, handled where the store is written), or cannot be written now:
 * re-reading a gap every minute into a store that is down would only load the
 * node, and the gap is still there to close once it is back.
 */
export async function storeResumeBlock({ chainId, contracts, filesFrom }) {
  if (!(await storeConfigured())) return null;
  if (!(await eventStoreReachable())) return null;
  const checkpoint = await getCheckpoint().catch(() => null);
  if (!checkpoint) return null;
  const sameDeployment = checkpoint.chainId === Number(chainId)
    && Buffer.compare(checkpoint.deploymentHash, deploymentHash(contracts)) === 0;
  if (!sameDeployment) return null;
  const next = checkpoint.lastBlock + 1n;
  return next < BigInt(filesFrom) ? next : null;
}

/// Whether this run should read contract payments from the node: only into a
/// store that has the tables for them, and not when switched off with
/// INDEX_TRACE_INTERNAL=0. The files have no place for them, so a run without a
/// store does not pay for the traces.
export async function internalTracingWanted() {
  if (process.env.INDEX_TRACE_INTERNAL === '0') return false;
  if (!(await storeConfigured())) return false;
  try {
    if (await internalTransfersMigrated()) return true;
  } catch { /* treated as not migrated */ }
  console.log('  contract payments: not recorded (run `npm run db:migrate` to add their table)');
  return false;
}

/**
 * Trace older blocks, and retry ones that failed, a bounded number per pass.
 *
 * A store filled before tracing existed -- or one rebuilt from a file index that
 * reaches further back than this run read -- holds transactions whose blocks
 * were never traced. This walks back through them a slice at a time, newest
 * first, so a long history fills in over a few passes instead of stalling one.
 * INDEX_TRACE_CATCHUP sets the slice; 0 turns it off.
 */
export async function catchUpInternalTransfers(tracer) {
  const limit = Number(process.env.INDEX_TRACE_CATCHUP ?? '200');
  if (!tracer || !(limit > 0)) return null;
  const state = await getInternalTraceState();
  if (!state || !state.supported || state.tracedFrom === null) return null;

  const { gaps, older } = await untracedBlocks(limit, state.tracedFrom);
  const blocks = [...new Set([...gaps, ...older].map(String))].map(BigInt);
  const failed = [];
  const traced = [];
  let written = 0;
  for (const blockNumber of blocks) {
    const txs = await storedBlockTransactions(blockNumber);
    if (txs.length === 0) { traced.push(blockNumber); continue; }
    const result = await tracer.traceBlock(blockNumber, txs[0].blockTime, txs);
    if (result.unsupported) {
      await recordInternalTrace({ supported: false });
      return { written, traced: traced.length, failed: failed.length, unsupported: true };
    }
    if (!result.ok) { failed.push({ blockNumber, reason: result.reason }); continue; }
    written += await writeInternalTransfers(result.rows);
    traced.push(blockNumber);
  }
  await recordInternalTrace({ gaps: failed, traced });
  // The range now reaches back over every older block just walked; the ones that
  // failed are in the gap list, which is what keeps the claim true. Fewer than a
  // full slice means nothing older holds a transaction, so the range starts at
  // the beginning of what the store knows.
  if (state.tracedFrom > 0n) {
    await extendInternalTraceBack(older.length < limit ? 0n : older[older.length - 1]);
  }
  return { written, traced: traced.length, failed: failed.length };
}

/**
 * Timestamps for the blocks the events sit in.
 *
 * Logs carry a block number but no time, and the events reach further back than
 * the block window the indexer keeps, so the times for the older ones are not
 * already in hand. Only the distinct blocks that actually hold an event are
 * fetched, and headers only.
 */
async function blockTimes(client, events, known) {
  const times = new Map(known.map((b) => [String(b.number), Number(b.timestamp)]));
  const missing = [...new Set(events.map((e) => String(e.blockNumber)))].filter((n) => !times.has(n));

  const CONCURRENCY = 16;
  for (let i = 0; i < missing.length; i += CONCURRENCY) {
    const slice = missing.slice(i, i + CONCURRENCY);
    const headers = await Promise.all(
      slice.map((n) => client.getBlock({ blockNumber: BigInt(n) }).catch(() => null)),
    );
    headers.forEach((header, j) => {
      if (header) times.set(slice[j], Number(header.timestamp));
    });
  }
  return times;
}

/**
 * Land one run.
 *
 * `allEvents` is everything the index knows; `newEvents` is what this run read.
 * A store already holding this deployment takes only the new ones, because
 * writes are idempotent and re-sending the history each minute is work for
 * nothing. A store that is empty, or was built for a different deployment,
 * takes everything -- after being cleared, because a store answering for another
 * deployment matches nothing and reads as an empty chain rather than an error.
 */
/**
 * Refuse to start while another pass is writing.
 *
 * Two indexers against one store are not two halves of the work; they are two
 * passes doing all of it, deciding what is new from the same checkpoint and both
 * finding the same answer. The watcher serialises its own runs, which is enough
 * until somebody runs one by hand beside it, or a second stack points at the
 * same store, or a restart overlaps the pass it interrupted.
 *
 * Advisory rather than a table: it is released when the connection closes, so a
 * pass killed halfway does not leave the next one locked out.
 *
 * Skipping is the right answer rather than waiting. The work is not lost -- the
 * pass already running covers the same blocks, and if anything is left the next
 * tick takes it.
 */
async function claimIndexerLock() {
  const { rows } = await db().query('SELECT pg_try_advisory_lock(hashtext($1)) AS held', ['indexer:write']);
  return rows[0]?.held === true;
}

export async function writeRunToStore({
  client,
  chainId,
  contracts,
  blockchainRoot,
  fullProjection = false,
  allEvents,
  newEvents,
  blocks,
  transactions,
  counts,
  lastBlock,
  logsFrom,
  logsTo,
  // Contract payments this run traced: { rows, gaps, traced, fromBlock,
  // toBlock, mode, supported }, or null when it did not trace.
  internal = null,
}) {
  if (!(await claimIndexerLock())) {
    console.log('  another indexer pass is writing to this store; skipping this one');
    return {
      eventsWritten: 0, blocksWritten: 0, txWritten: 0, internalWritten: 0, entities: [], mode: 'skipped',
    };
  }

  const hash = deploymentHash(contracts);
  const checkpoint = await getCheckpoint();

  const sameDeployment = checkpoint
    && checkpoint.chainId === Number(chainId)
    && Buffer.compare(checkpoint.deploymentHash, hash) === 0;

  if (checkpoint && !sameDeployment) {
    console.log('  store holds another deployment; clearing it before rebuilding');
    await resetStore();
  }

  const events = sameDeployment ? newEvents : allEvents;

  const ids = await ensureDimensions({
    contracts: contracts.map((c) => ({ address: c.address, name: c.name, label: c.label })),
    eventNames: [...new Set(allEvents.map((e) => e.name).filter(Boolean))],
  });

  const times = await blockTimes(client, events, blocks);
  const rows = events
    .filter((event) => times.has(String(event.blockNumber)))
    .map((event) => ({ ...event, blockTime: times.get(String(event.blockNumber)) }));

  const skipped = events.length - rows.length;
  if (skipped > 0) {
    // Dropping them silently would leave a gap that looks like the chain was
    // quiet, so say so.
    console.log(`  ${skipped} events skipped: their block could not be read for a timestamp`);
  }

  // The range to clear before writing it, on every run rather than only on a
  // resume.
  //
  // It used to be skipped for a rebuild, on the reasoning that a rebuild has
  // already emptied the store so there is nothing to clear. That holds only if
  // this is the only thing writing. It was not: a hand-run pass and the watcher's
  // pass both started after a reset, both found no checkpoint, both rebuilt from
  // block zero, and both inserted everything. The event log is a
  // ReplacingMergeTree, which collapses duplicates when it merges and not a
  // moment sooner, and reads do not ask for FINAL -- so the store held 2,148
  // rows for 1,074 logs and the screens showed every access request three times.
  //
  // Clearing first makes the write idempotent, so writing a range twice leaves
  // what writing it once would. On an empty range the clear counts zero rows and
  // returns without a mutation, which is what a genuine rebuild costs.
  const authoritative = logsFrom !== undefined && logsTo !== undefined
    ? { fromBlock: logsFrom, toBlock: logsTo }
    : null;

  const [eventsWritten, blocksWritten, txWritten] = [
    await writeEvents(rows, ids, authoritative),
    await writeBlocks(blocks),
    await writeTransactions(transactions),
  ];

  // After the reset above, so a rebuild's payments are not cleared with the rest.
  //
  // Best effort: the payments are an addition to the index, and a failure here
  // must not stop the checkpoint below from moving. Nothing is recorded as
  // traced when it fails, so the range does not claim these blocks and the
  // catch-up pass reads them again.
  let internalWritten = 0;
  if (internal) {
    try {
      internalWritten = await writeInternalTransfers(internal.rows);
      await recordInternalTrace({
        fromBlock: internal.fromBlock,
        toBlock: internal.toBlock,
        mode: internal.mode,
        supported: internal.supported,
        gaps: internal.gaps,
        traced: internal.traced,
      });
    } catch (error) {
      console.log(`  contract payments: not stored this pass (${error?.message ?? error})`);
    }
  }

  await setCounters(fileCountersForStore(counts));
  await setCountersFromStore();
  await setCountersFromEntities();
  await setCheckpoint({ chainId: Number(chainId), deploymentHash: hash, lastBlock });

  // And the entity rows the screens page through.
  //
  // Marked from this run's events, then read from the contracts -- the values
  // are the chain's, not a replay's guess at them, so a wrong row is one refresh
  // from being right rather than permanent drift. A rebuild re-reads everyone;
  // a steady tick re-reads only whoever an event named, which is what stops the
  // work following the size of the network instead of the size of the change.
  //
  // A full pass happens on a rebuild, on a new deployment, or on request. The
  // last matters more than it looks: the dirty set tracks what the *chain*
  // changed, not what this code changed, so after the projection itself is
  // edited every row is stale and nothing marks it. INDEX_REPROJECT=1 fixes that
  // without inventing a fake event.
  const reproject = fullProjection || process.env.INDEX_REPROJECT === '1';
  const entities = await projectEntities({
    client,
    contracts,
    blockchainRoot,
    events: rows,
    atBlock: lastBlock,
    full: !sameDeployment || reproject,
  });

  // Which piece each storage payment paid for, read from the claims that
  // revealed it. Best effort, like the projection: a pass that cannot do it
  // leaves the links to the next one.
  const escrowLinks = await linkEscrowClaims({ client, contracts, blockchainRoot, atBlock: lastBlock });

  return {
    eventsWritten, blocksWritten, txWritten, internalWritten, entities, escrowLinks,
    mode: sameDeployment ? 'resumed' : 'rebuilt',
  };
}

/**
 * Blocks and transactions counted in the store, replacing the file indexer's.
 *
 * The figures it produces are not totals. They are the lengths of the two JSON
 * lists it keeps for the activity tables, and both are deliberately bounded -- a
 * thousand blocks, five thousand transactions -- so those files do not grow with
 * the chain. Written into the counters they became the numbers on the header,
 * where they read as "the chain has had this many transactions".
 *
 * Measured on a live server: the header said 662 transactions across 1,000
 * blocks while the store held 7,188 across 15,000. It also moved *down* between
 * refreshes, because the retained window slides and holds whatever the last pass
 * happened to merge into it -- which is what makes it obviously wrong rather
 * than merely low.
 *
 * Separate from the entity counters below, and not inside them, because those
 * only run when the contract artifacts are readable. A block count has nothing
 * to do with an ABI, and should not go uncorrected on a machine without one.
 */
async function setCountersFromStore() {
  const { rows } = await db().query(`
    SELECT (SELECT count(*) FROM block)       AS "blocks",
           (SELECT count(*) FROM transaction) AS "transactions"`);
  const owned = {};
  if (Number(rows[0].blocks) > 0) owned.blocks = Number(rows[0].blocks);
  if (Number(rows[0].transactions) > 0) owned.transactions = Number(rows[0].transactions);
  if (Object.keys(owned).length > 0) await setCounters(owned);
}

/// Totals taken from the entity tables, so the dashboard never counts the log.
async function setCountersFromEntities() {
  const { rows } = await db().query(`
    SELECT (SELECT count(*) FROM vault_keeper) AS "vaultKeepers",
           (SELECT count(*) FROM guardian)     AS "guardians"`);
  const counts = rows[0];
  // Only overwrite what the projection actually owns. A zero here would
  // otherwise wipe a count the file indexer got right.
  const owned = {};
  if (Number(counts.vaultKeepers) > 0) owned.vaultKeepers = Number(counts.vaultKeepers);
  if (Number(counts.guardians) > 0) owned.guardians = Number(counts.guardians);

  if (Object.keys(owned).length > 0) await setCounters(owned);
}

/// The event store the rollups scan. Null when events live in Postgres, where
/// the same connection already serves them.
async function rollupClickHouse() {
  const { eventStoreName } = await import('../src/lib/db/repository.mjs');
  if (eventStoreName() !== 'clickhouse') return null;
  const { createClient } = await import('@clickhouse/client');
  return createClient({
    url: process.env.CLICKHOUSE_URL,
    database: process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });
}

async function linkEscrowClaims({ client, contracts, blockchainRoot, atBlock }) {
  if (!blockchainRoot) return { skipped: 'no blockchain root, so no artifacts to read ABIs from' };
  try {
    const names = ['VKEscrow', 'FileRegistrationSC'];
    const abis = await loadAbis(blockchainRoot, names);
    const byName = Object.fromEntries(contracts.map((c) => [c.name, c.address]));
    const wired = {};
    for (const name of names) {
      if (abis[name] && byName[name]) wired[name] = { address: byName[name], abi: abis[name] };
    }
    const clickhouse = await rollupClickHouse();
    try {
      return await resolveEscrowLinks({ client, wired, atBlock, clickhouse });
    } finally {
      if (clickhouse) await clickhouse.close();
    }
  } catch (error) {
    return { error: error.message ?? String(error) };
  }
}

async function projectEntities({ client, contracts, blockchainRoot, events, atBlock, full }) {
  if (!blockchainRoot) return { skipped: 'no blockchain root, so no artifacts to read ABIs from' };

  try {
    // Whatever the specs need, rather than a list kept in step by hand.
    const abis = await loadAbis(blockchainRoot, contractsNeeded());
    const byName = Object.fromEntries(contracts.map((c) => [c.name, c.address]));
    const wired = {};
    for (const name of Object.keys(abis)) {
      if (byName[name]) wired[name] = { address: byName[name], abi: abis[name] };
    }

    await markDirty(events, atBlock);
    const result = await projectAll({ client, wired, atBlock, full });

    // Count the rows that exist, rather than carrying forward the file
    // indexer's tally. Those two disagreed -- the dashboard read zero vault
    // keepers while ten were sitting in the table -- because the file's count
    // comes from what its own entity extraction recognised, and the table's
    // comes from what was actually read off the chain. The table is the one
    // being served, so it is the one that should be counted.
    await setCountersFromEntities();

    // The site header's figures, computed here rather than in every visitor's
    // browser. They land in the same counter table the manifest already serves,
    // so the header costs one request it was making anyway.
    try {
      const { computeNetworkStats } = await import('./network_stats.mjs');
      const ch = await rollupClickHouse();
      try {
        await setCounters(await computeNetworkStats({ db: db(), clickhouse: ch, atBlock }));
      } finally {
        if (ch) await ch.close();
      }
    } catch (error) {
      // A stale header is a smaller problem than an indexer that stops.
      console.warn('  network stats skipped:', error.message ?? error);
    }

    // Rollups come after, and from the events rather than the contracts: they
    // are totals over history that no call returns. Separate for the same reason
    // the projection is separate from ingest -- a failure here must not cost the
    // entity rows that were just written.
    let rollups;
    try {
      rollups = await projectRollups({ specs: ROLLUP_SPECS, atBlock, clickhouse: await rollupClickHouse(), full });
    } catch (error) {
      rollups = { error: error.message ?? String(error) };
    }
    return [...(Array.isArray(result) ? result : [result]), ...(Array.isArray(rollups) ? rollups : [rollups])];
  } catch (error) {
    // A projection that fails must not take the run with it: the events are
    // already written, and stale entity rows are a smaller problem than an
    // indexer that stops.
    return { error: error.message ?? String(error) };
  }
}
