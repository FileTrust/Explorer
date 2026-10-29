/// Writing into the store. The read side is repository.mjs; this is its twin.
///
/// Every write here is idempotent. The event key is (block_number, log_index)
/// and inserts are ON CONFLICT DO NOTHING, so a batch replayed after a restart
/// costs a little work and changes nothing. That is what lets the indexer carry
/// no rollback logic at all -- safe here because CometBFT finalises in a single
/// block, so a block that was read is a block that happened.
import { createHash } from 'node:crypto';
import { db, toBytes, withTransaction } from './postgres.mjs';
import { SUBJECT_ADDRESS_ARGS, SUBJECT_KEY_ARGS } from '../indexedLogMatch.mjs';
import { eventStoreName, resetDimensions } from './repository.mjs';

/// Argument names that hold whoever an event is about, and whatever it is
/// about. Promoted out of the JSON into indexed columns, because "everything
/// this vault keeper did" has to be an index scan at a billion rows.
// Shared with the query side, which must agree exactly: a name the indexer did
// not promote cannot be filtered on the column, and asking anyway returns
// nothing rather than everything. `vkAddress` appears 534 times in this chain's
// events and was missing from the first version of this list.
const SUBJECT_ADDRESS_KEYS = SUBJECT_ADDRESS_ARGS;
const SUBJECT_KEY_KEYS = SUBJECT_KEY_ARGS;

function pickSubject(args, names, byteLength) {
  for (const name of names) {
    const value = args?.[name];
    if (typeof value === 'string' && value.startsWith('0x')) {
      const bytes = toBytes(value);
      if (bytes && bytes.length === byteLength) return bytes;
    }
  }
  return null;
}

/// JSON cannot hold a bigint, so store its digits -- the same convention the
/// file index used, which is what keeps the client's revival step working
/// unchanged against either store.
function plainArgs(args) {
  return JSON.parse(JSON.stringify(args ?? {}, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

/// Identifies the deployment this store was built against. A store built for
/// another one matches nothing and reads as an empty chain rather than as an
/// error, which is how a misconfigured indexer once cost a chain's worth of
/// history with nothing appearing to be wrong.
export function deploymentHash(contracts) {
  const canonical = [...contracts]
    .map((c) => String(c.address).toLowerCase())
    .sort()
    .join(',');
  return createHash('sha256').update(canonical).digest();
}

/// Insert the contracts and event names, and hand back their ids.
///
/// Both tables are written with the row filtered out *before* the INSERT rather
/// than with a bare `ON CONFLICT`, because the two are not equivalent in what
/// they cost. `ON CONFLICT` still draws an id from the sequence for every row it
/// attempts, then throws it away when the row turns out to be there already; the
/// conflict is detected after the value is spent. These ids are SMALLINT, so
/// there are 32,767 of them, and this runs on every pass of the indexer over
/// roughly thirty contracts and forty event names.
///
/// That is about seventy ids a minute for rows that never change, and it ran the
/// sequence dry in a couple of days: `nextval: reached maximum value of sequence
/// "contract_id_seq"`, every pass, with thirty-one contracts in the table and
/// ids 19 to 49 in use. The indexer stopped, the screens kept serving what they
/// already had, and the only sign was a store falling further behind the chain.
///
/// Filtered first, a pass over rows that already exist draws nothing at all, and
/// the sequence advances only for a contract or an event genuinely seen for the
/// first time. `ON CONFLICT DO NOTHING` stays as the backstop for two indexers
/// racing between the check and the insert.
export async function ensureDimensions({ contracts, eventNames }) {
  await withTransaction(async (client) => {
    for (const contract of contracts) {
      const address = toBytes(contract.address);
      const label = contract.label ?? null;
      // Names and labels can be corrected between runs, so an existing row is
      // still brought up to date -- it just does not cost an id to do it.
      await client.query(
        `UPDATE contract SET name = $2, label = $3
          WHERE address = $1 AND (name, label) IS DISTINCT FROM ($2, $3)`,
        [address, contract.name, label],
      );
      await client.query(
        `INSERT INTO contract (address, name, label)
         SELECT $1, $2, $3
          WHERE NOT EXISTS (SELECT 1 FROM contract WHERE address = $1)
             ON CONFLICT (address) DO NOTHING`,
        [address, contract.name, label],
      );
    }
    for (const name of eventNames) {
      await client.query(
        `INSERT INTO event_type (name)
         SELECT $1
          WHERE NOT EXISTS (SELECT 1 FROM event_type WHERE name = $1)
             ON CONFLICT (name) DO NOTHING`,
        [name],
      );
    }
  });
  resetDimensions();

  const [contractRows, eventRows] = await Promise.all([
    db().query('SELECT id, address FROM contract'),
    db().query('SELECT id, name FROM event_type'),
  ]);

  return {
    contractIdByAddress: new Map(
      contractRows.rows.map((r) => [`0x${r.address.toString('hex')}`, r.id]),
    ),
    eventIdByName: new Map(eventRows.rows.map((r) => [r.name, r.id])),
  };
}

const BATCH = 1000;

function chunk(rows, size = BATCH) {
  const out = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/// Make sure the partitions the batch lands in exist before inserting into it.
async function ensurePartitions(client, blockNumbers) {
  const spans = new Set(blockNumbers.map((n) => (BigInt(n) / 10000000n).toString()));
  for (const span of spans) {
    await client.query('SELECT ensure_event_partition($1::bigint)', [String(BigInt(span) * 10000000n)]);
  }
}

/**
 * Write decoded events.
 *
 * Multi-row INSERT rather than COPY. COPY is markedly faster and is what the
 * billion-row load test will want, but it cannot carry ON CONFLICT without a
 * staging table, and correctness on replay matters more here than ingest rate
 * does at this size. It is the first thing to change when a measurement says so.
 *
 * `range` is the caller's promise that these rows are *everything* that belongs
 * between those two blocks. Only a caller that scanned a range and kept all of
 * what it found may pass one; anything less must pass null and accept that a
 * replay leaves duplicates for a reader to resolve.
 */
export async function writeEvents(rows, ids, range = null) {
  if (rows.length === 0) return 0;

  const store = eventStoreName();
  if (store === 'clickhouse') return writeEventsClickHouse(rows, ids, range);

  let written = 0;
  for (const batch of chunk(rows)) {
    await withTransaction(async (client) => {
      await ensurePartitions(client, batch.map((r) => r.blockNumber));

      const values = [];
      const params = [];
      for (const row of batch) {
        const args = plainArgs(row.args);
        const base = params.length;
        params.push(
          String(row.blockNumber),
          Number(row.logIndex ?? 0),
          new Date(Number(row.blockTime) * 1000),
          toBytes(row.transactionHash),
          Number(row.transactionIndex ?? 0),
          ids.contractIdByAddress.get(String(row.address).toLowerCase()),
          ids.eventIdByName.get(row.name),
          pickSubject(args, SUBJECT_ADDRESS_KEYS, 20),
          pickSubject(args, SUBJECT_KEY_KEYS, 32),
          JSON.stringify(args),
        );
        values.push(
          `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},` +
          `$${base + 6},$${base + 7},$${base + 8},$${base + 9},$${base + 10}::jsonb)`,
        );
      }

      const result = await client.query(
        `INSERT INTO event (block_number, log_index, block_time, tx_hash, tx_index,
                            contract_id, event_id, subject_addr, subject_key, args)
         VALUES ${values.join(',')}
         ON CONFLICT (block_number, log_index) DO NOTHING`,
        params,
      );
      written += result.rowCount ?? 0;
    });
  }
  return written;
}

/**
 * Clear a block range so it can be rewritten, and report how much was there.
 *
 * The range is the caller's promise that what follows is the complete contents
 * of those blocks. That promise is the entire mechanism. Postgres gets the same
 * guarantee for free from `ON CONFLICT DO NOTHING` on (block_number, log_index);
 * ClickHouse has no such clause, so it leaned on ReplacingMergeTree and made
 * every read carry `FINAL` to hide duplicates until a merge resolved them.
 *
 * An earlier attempt cleared from the lowest block in the batch *upward*, with
 * no upper bound and no promise behind it. A run that produced 94 events for
 * blocks 244-577 deleted every event above block 244 and put back only those 94
 * -- 2,735 rows destroyed. Hence a range that is explicit, bounded at both ends,
 * and passed only by a caller that scanned exactly it.
 *
 * Counting first is not only an optimisation. Normal forward ingest writes
 * blocks the table has never held, so the count is zero, the mutation never
 * runs, and the cycle costs one indexed lookup.
 */
async function clearRange(client, { fromBlock, toBlock }) {
  const params = { from: String(fromBlock), to: String(toBlock) };
  const [{ n }] = await (await client.query({
    query: `SELECT count() AS n FROM event
             WHERE block_number >= {from:UInt64} AND block_number <= {to:UInt64}`,
    query_params: params,
    format: 'JSONEachRow',
  })).json();
  if (Number(n) === 0) return 0;

  // Synchronous: the insert that follows must not race the delete.
  await client.command({
    query: `DELETE FROM event
             WHERE block_number >= {from:UInt64} AND block_number <= {to:UInt64}`,
    query_params: params,
    clickhouse_settings: { mutations_sync: '2' },
  });
  return Number(n);
}

async function writeEventsClickHouse(rows, ids, range = null) {
  const { createClient } = await import('@clickhouse/client');
  const client = createClient({
    url: process.env.CLICKHOUSE_URL,
    database: process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });
  try {
    if (range) {
      const removed = await clearRange(client, range);
      if (removed > 0) {
        console.log(`  rewriting blocks ${range.fromBlock}-${range.toBlock}: `
          + `cleared ${removed} rows already stored`);
      }
    }

    for (const batch of chunk(rows, 10000)) {
      await client.insert({
        table: 'event',
        format: 'JSONEachRow',
        values: batch.map((row) => {
          const args = plainArgs(row.args);
          const addr = pickSubject(args, SUBJECT_ADDRESS_KEYS, 20);
          const key = pickSubject(args, SUBJECT_KEY_KEYS, 32);
          return {
            block_number: String(row.blockNumber),
            log_index: Number(row.logIndex ?? 0),
            block_time: new Date(Number(row.blockTime) * 1000).toISOString().replace('T', ' ').replace('Z', ''),
            // Hex, not raw bytes: JSONEachRow carries these inside a JSON
            // string and any byte above 0x7F would be re-encoded as two.
            tx_hash: toBytes(row.transactionHash)?.toString('hex') ?? '',
            tx_index: Number(row.transactionIndex ?? 0),
            contract_id: ids.contractIdByAddress.get(String(row.address).toLowerCase()),
            event_id: ids.eventIdByName.get(row.name),
            subject_addr: addr ? addr.toString('hex') : null,
            subject_key: key ? key.toString('hex') : null,
            args: JSON.stringify(args),
          };
        }),
      });
    }
    return rows.length;
  } finally {
    await client.close();
  }
}

/// Whether the block table has the columns migration 017 added. Asked once: a
/// store from before it still takes blocks, without them.
let blockDetailsColumns;
async function hasBlockDetails() {
  if (blockDetailsColumns === undefined) {
    const { rows } = await db().query(
      `SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_name = 'block' AND column_name IN ('base_fee_per_gas', 'size')`,
    );
    blockDetailsColumns = rows[0]?.n === 2;
  }
  return blockDetailsColumns;
}

const numericOrNull = (value) => (value === undefined || value === null ? null : String(value));

export async function writeBlocks(rows) {
  if (rows.length === 0) return 0;
  const details = await hasBlockDetails();
  const columns = details ? 10 : 8;
  let written = 0;
  for (const batch of chunk(rows)) {
    const values = [];
    const params = [];
    for (const row of batch) {
      const base = params.length;
      params.push(
        String(row.number), toBytes(row.hash), toBytes(row.parentHash),
        new Date(Number(row.timestamp) * 1000), toBytes(row.miner),
        String(row.gasUsed), String(row.gasLimit), Number(row.transactionCount ?? 0),
      );
      if (details) params.push(numericOrNull(row.baseFeePerGas), row.size === undefined || row.size === null ? null : Number(row.size));
      values.push(`(${Array.from({ length: columns }, (_, i) => `$${base + i + 1}`).join(',')})`);
    }
    const result = await db().query(
      details
        ? `INSERT INTO block (number, hash, parent_hash, block_time, miner, gas_used, gas_limit, transaction_count,
                              base_fee_per_gas, size)
           VALUES ${values.join(',')}
           ON CONFLICT (number) DO UPDATE SET
             base_fee_per_gas = coalesce(block.base_fee_per_gas, EXCLUDED.base_fee_per_gas),
             size = coalesce(block.size, EXCLUDED.size)
           -- Only a row stored before these columns existed is filled in; one
           -- already complete is left alone, so a rescan rewrites nothing.
           WHERE (block.base_fee_per_gas IS NULL AND EXCLUDED.base_fee_per_gas IS NOT NULL)
              OR (block.size IS NULL AND EXCLUDED.size IS NOT NULL)`
        : `INSERT INTO block (number, hash, parent_hash, block_time, miner, gas_used, gas_limit, transaction_count)
           VALUES ${values.join(',')} ON CONFLICT (number) DO NOTHING`,
      params,
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

export async function writeTransactions(rows) {
  if (rows.length === 0) return 0;
  let written = 0;
  for (const batch of chunk(rows)) {
    const values = [];
    const params = [];
    for (const row of batch) {
      const base = params.length;
      params.push(
        toBytes(row.hash), String(row.blockNumber), toBytes(row.blockHash),
        new Date(Number(row.blockTimestamp) * 1000), Number(row.transactionIndex ?? 0),
        toBytes(row.from), toBytes(row.to), String(row.value ?? '0'),
        String(row.gas ?? '0'), row.gasPrice === undefined || row.gasPrice === null ? null : String(row.gasPrice),
        toBytes(row.input) ?? Buffer.alloc(0),
        // The receipt, when the run collected one. Null rather than zero for a
        // transaction indexed before receipts were stored: the page has to be
        // able to tell "it failed" from "nobody looked".
        row.status === undefined || row.status === null ? null : Number(row.status),
        row.gasUsed === undefined || row.gasUsed === null ? null : String(row.gasUsed),
      );
      values.push(
        `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},` +
        `$${base + 7},$${base + 8},$${base + 9},$${base + 10},$${base + 11},$${base + 12},$${base + 13})`,
      );
    }
    const result = await db().query(
      `INSERT INTO transaction (hash, block_number, block_hash, block_time, tx_index,
                                from_addr, to_addr, value_wei, gas, gas_price, input,
                                status, gas_used)
       VALUES ${values.join(',')}
       ON CONFLICT (hash) DO UPDATE SET
         -- A later run that did collect receipts fills in what an earlier one
         -- could not, without disturbing a row that already has them.
         status   = coalesce(transaction.status, EXCLUDED.status),
         gas_used = coalesce(transaction.gas_used, EXCLUDED.gas_used)`,
      params,
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

/// Totals the dashboard reads, so it never counts a billion rows to show one.
export async function setCounters(counts) {
  const entries = Object.entries(counts).filter(([, v]) => Number.isFinite(Number(v)));
  if (entries.length === 0) return;
  await withTransaction(async (client) => {
    for (const [name, value] of entries) {
      await client.query(
        `INSERT INTO counter (name, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [name, String(Math.trunc(Number(value)))],
      );
    }
  });
}

export async function getCheckpoint() {
  const { rows } = await db().query(
    'SELECT chain_id, deployment_hash, last_block FROM indexer_checkpoint WHERE id = 1',
  );
  if (rows.length === 0) return null;
  return {
    chainId: Number(rows[0].chain_id),
    deploymentHash: rows[0].deployment_hash,
    lastBlock: BigInt(rows[0].last_block),
  };
}

export async function setCheckpoint({ chainId, deploymentHash: hash, lastBlock }) {
  await db().query(
    `INSERT INTO indexer_checkpoint (id, chain_id, deployment_hash, last_block, updated_at)
     VALUES (1, $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE
       SET chain_id = EXCLUDED.chain_id,
           deployment_hash = EXCLUDED.deployment_hash,
           last_block = EXCLUDED.last_block,
           updated_at = now()`,
    [String(chainId), hash, String(lastBlock)],
  );
}

// --- FTU paid by contracts ---------------------------------------------------

/// Whether the store has the tables for contract payments. A store migrated
/// before they existed keeps working; it just has no such history until
/// `npm run db:migrate` adds them.
export async function internalTransfersMigrated() {
  const { rows } = await db().query(
    `SELECT to_regclass('internal_transfer') IS NOT NULL
        AND to_regclass('internal_trace_state') IS NOT NULL
        AND to_regclass('internal_trace_gap') IS NOT NULL AS ready`,
  );
  return rows[0]?.ready === true;
}

/// Contract payments, as read from the trace. Idempotent on (tx_hash,
/// trace_index), so a block traced twice changes nothing.
export async function writeInternalTransfers(rows) {
  if (rows.length === 0) return 0;
  let written = 0;
  for (const batch of chunk(rows)) {
    const values = [];
    const params = [];
    for (const row of batch) {
      const base = params.length;
      params.push(
        toBytes(row.txHash), Number(row.traceIndex), String(row.blockNumber),
        new Date(Number(row.blockTime) * 1000), Number(row.txIndex ?? 0),
        toBytes(row.from), toBytes(row.to), String(row.value), String(row.callType),
      );
      values.push(`(${Array.from({ length: 9 }, (_, i) => `$${base + i + 1}`).join(',')})`);
    }
    const result = await db().query(
      `INSERT INTO internal_transfer (tx_hash, trace_index, block_number, block_time, tx_index,
                                      from_addr, to_addr, value_wei, call_type)
       VALUES ${values.join(',')}
       ON CONFLICT (tx_hash, trace_index) DO NOTHING`,
      params,
    );
    written += result.rowCount ?? 0;
  }
  return written;
}

export async function getInternalTraceState() {
  const { rows } = await db().query(
    'SELECT supported, mode, traced_from, traced_to FROM internal_trace_state WHERE id = 1',
  );
  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    supported: r.supported,
    mode: r.mode,
    tracedFrom: r.traced_from === null ? null : BigInt(r.traced_from),
    tracedTo: r.traced_to === null ? null : BigInt(r.traced_to),
  };
}

/**
 * Record that a run of blocks has been traced.
 *
 * `fromBlock..toBlock` is every block the run looked at, including the ones that
 * hold no transactions and so had nothing to trace. A block inside it that could
 * not be traced goes into the gap list rather than breaking the range; a block
 * that has now been traced comes out of it.
 *
 * The range only grows while it stays unbroken. A run that starts beyond its end
 * -- tracing was off for a while, or the node could not trace -- starts a new
 * range, because claiming the blocks in between were checked would be false.
 * The catch-up pass then walks back through them.
 */
export async function recordInternalTrace({ fromBlock, toBlock, mode, supported = true, gaps = [], traced = [] }) {
  await withTransaction(async (client) => {
    // A pass that found no new block has an empty range (start past end), and
    // says nothing about coverage.
    const hasRange = fromBlock !== undefined && toBlock !== undefined && BigInt(fromBlock) <= BigInt(toBlock);
    if (hasRange && supported) {
      await client.query(
        `INSERT INTO internal_trace_state (id, supported, mode, traced_from, traced_to, updated_at)
         VALUES (1, TRUE, $1, $2, $3, now())
         ON CONFLICT (id) DO UPDATE SET
           supported = TRUE,
           mode = EXCLUDED.mode,
           traced_from = CASE
             WHEN internal_trace_state.traced_to IS NULL
               OR EXCLUDED.traced_from > internal_trace_state.traced_to + 1
             THEN EXCLUDED.traced_from
             ELSE LEAST(internal_trace_state.traced_from, EXCLUDED.traced_from) END,
           traced_to = CASE
             WHEN internal_trace_state.traced_to IS NULL
               OR EXCLUDED.traced_from > internal_trace_state.traced_to + 1
             THEN EXCLUDED.traced_to
             ELSE GREATEST(internal_trace_state.traced_to, EXCLUDED.traced_to) END,
           updated_at = now()`,
        [mode ?? null, String(fromBlock), String(toBlock)],
      );
    } else if (!supported) {
      await client.query(
        `INSERT INTO internal_trace_state (id, supported, mode, updated_at)
         VALUES (1, FALSE, 'none', now())
         ON CONFLICT (id) DO UPDATE SET supported = FALSE, mode = 'none', updated_at = now()`,
      );
    }
    for (const gap of gaps) {
      await client.query(
        `INSERT INTO internal_trace_gap (block_number, reason) VALUES ($1, $2)
         ON CONFLICT (block_number) DO UPDATE
           SET reason = EXCLUDED.reason,
               attempts = internal_trace_gap.attempts + 1,
               last_tried = now()`,
        [String(gap.blockNumber), gap.reason ?? null],
      );
    }
    if (traced.length > 0) {
      await client.query(
        'DELETE FROM internal_trace_gap WHERE block_number = ANY($1::BIGINT[])',
        [traced.map(String)],
      );
    }
  });
}

/// Move the start of the traced range back, after the catch-up pass has traced
/// every block holding transactions between `fromBlock` and the old start.
export async function extendInternalTraceBack(fromBlock) {
  await db().query(
    `UPDATE internal_trace_state SET traced_from = LEAST(traced_from, $1), updated_at = now()
      WHERE id = 1 AND traced_from IS NOT NULL`,
    [String(fromBlock)],
  );
}

/**
 * Blocks still to trace, newest first: the ones that failed before, then the
 * ones older than the traced range. Only blocks the store holds transactions
 * for -- a block with none has nothing to trace -- and at most `limit` of each.
 */
export async function untracedBlocks(limit, tracedFrom) {
  // A block that keeps failing -- its state pruned from the node, say -- is
  // given up on after a few passes rather than costing every pass forever. It
  // stays listed, so the screen can still say it was not checked.
  const { rows: gaps } = await db().query(
    `SELECT block_number FROM internal_trace_gap WHERE attempts < 10
      ORDER BY block_number DESC LIMIT $1`,
    [limit],
  );
  const older = tracedFrom === null || tracedFrom === undefined ? [] : (await db().query(
    `SELECT DISTINCT block_number FROM transaction
      WHERE block_number < $1 ORDER BY block_number DESC LIMIT $2`,
    [String(tracedFrom), limit],
  )).rows;
  return {
    gaps: gaps.map((r) => BigInt(r.block_number)),
    older: older.map((r) => BigInt(r.block_number)),
  };
}

/// One block's transactions as the store holds them, in block order: what a
/// trace of that block has to line up with.
export async function storedBlockTransactions(blockNumber) {
  const { rows } = await db().query(
    `SELECT hash, tx_index, from_addr, block_time FROM transaction
      WHERE block_number = $1 ORDER BY tx_index`,
    [String(blockNumber)],
  );
  return rows.map((r) => ({
    hash: `0x${r.hash.toString('hex')}`,
    transactionIndex: Number(r.tx_index),
    from: `0x${r.from_addr.toString('hex')}`,
    blockTime: Math.floor(r.block_time.getTime() / 1000),
  }));
}

/// Drop everything and start again, for a deployment change or an explicit
/// rebuild. Truncating rather than deleting so the partitions go too.
export async function resetStore() {
  await db().query('TRUNCATE event, block, transaction, counter, indexer_checkpoint CASCADE');
  // Contract payments belong to the deployment as much as its transactions do.
  // Separate, and only if migrated, so a store from before they existed still
  // resets rather than failing on a table it does not have.
  if (await internalTransfersMigrated()) {
    await db().query('TRUNCATE internal_transfer, internal_trace_state, internal_trace_gap');
  }
  // Which piece each storage payment paid for: worked out from this
  // deployment's claims, so it goes with them.
  const { rows: [links] } = await db().query(
    "SELECT to_regclass('escrow_link') IS NOT NULL AND to_regclass('escrow_link_state') IS NOT NULL AS ready",
  );
  if (links?.ready) await db().query('TRUNCATE escrow_link, escrow_link_state');
  if (eventStoreName() === 'clickhouse') {
    const { createClient } = await import('@clickhouse/client');
    const client = createClient({
      url: process.env.CLICKHOUSE_URL,
      database: process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer',
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
    });
    await client.command({ query: 'TRUNCATE TABLE IF EXISTS event' });
    await client.close();
  }
}
