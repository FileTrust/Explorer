/**
 * Fill the rollup tables from the event log, one pass per spec.
 *
 * Every column is a conditional aggregate over the same scan -- `sumIf` in
 * ClickHouse, `FILTER (WHERE …)` in Postgres -- so a spec with eight columns is
 * still one query, not eight. The key is whichever of the spec's key arguments
 * the event carries, coalesced in order, which is what lets one query cover
 * events that name the same participant `guardian`, `vk` or `recipient`.
 *
 * A rollup is a sum over all of history, so an incremental update that is not
 * exactly-once drifts, and a drifted total is invisible -- it still looks like a
 * number. This started as a full recompute for that reason, which is safe and
 * costs the same scan every cycle however old the chain gets: the work grows
 * with history while the new work stays constant.
 *
 * So each table now remembers the block it counted up to, and normally reads
 * only what came after it. The exactly-once that makes the sums safe comes from
 * reading that watermark and writing the new one inside a single transaction --
 * a second run sees the moved watermark and computes an empty window. Anything
 * that cannot be settled that way falls back to a rebuild: an empty table, a
 * checkpoint that moved backwards, or an explicit `--full`.
 *
 * Not every column needs the guard. A set union, a maximum and a boolean OR are
 * the same however many times they are applied; only the sums and counts are
 * additive, and those are what the watermark protects.
 */
import { db } from '../src/lib/db/postgres.mjs';

/// Digits only. An argument holding an address or a hash would otherwise cast to
/// zero and be added in silently, which reads as a real sum.
const PG_NUMERIC = (arg) => `CASE WHEN args ->> '${arg}' ~ '^[0-9]+$'
  THEN (args ->> '${arg}')::numeric ELSE 0 END`;

function pgKeyExpression(keyArgs) {
  // Empty string is not a key. `nullif` turns "argument absent" and "argument
  // present but blank" into the same nothing, so coalesce moves past both.
  return `coalesce(${keyArgs.map(a => `nullif(args ->> '${a}', '')`).join(', ')})`;
}

function chKeyExpression(keyArgs) {
  return `coalesce(${keyArgs.map(a => `nullIf(JSONExtractString(args, '${a}'), '')`).join(', ')})`;
}

async function eventIds(names) {
  const { rows } = await db().query(
    'SELECT id, name FROM event_type WHERE name = ANY($1)', [names],
  );
  return new Map(rows.map(r => [r.name, r.id]));
}

/** One query per spec, returning `{ key, ...columns }` rows. Exported so a
 *  spec can be checked against known figures without writing a table. */
export async function computeRows(spec, { clickhouse, fromBlock = null, toBlock = null }) {
  const ids = await eventIds(spec.events);
  const idsFor = (names) => (names ?? spec.events)
    .map(n => ids.get(n)).filter(id => id !== undefined);

  const all = idsFor(spec.events);
  // Nothing of this shape has been emitted. An empty table is the right answer,
  // and is different from "the rollup has not run" -- which is what a missing
  // table means to a reader.
  if (all.length === 0) return [];

  // One conditional aggregate per column, over the same scan. The shapes beyond
  // `sum` exist because a rollup row is not always a total: a PRE request row
  // carries sets of guardian addresses, a flag, and the earliest block any of
  // five streams touched it.
  const selects = spec.columns.map((col) => {
    const set = idsFor(col.events);
    // `col.events` absent means "every event this spec scans".
    const cond = col.events ? `event_id IN (${set.join(',') || '0'})` : 'true';
    const json = (a) => (clickhouse
      ? `JSONExtractString(args, '${a}')`
      : `(args ->> '${a}')`);

    switch (col.op) {
      case 'count':
        return clickhouse
          ? `countIf(${cond}) AS ${col.as}`
          : `count(*) FILTER (WHERE ${cond})::int AS ${col.as}`;

      // Any event of this set occurred. Counted rather than stored as a boolean
      // so the two engines agree without a cast.
      case 'flag':
        return clickhouse
          ? `countIf(${cond}) AS ${col.as}`
          : `count(*) FILTER (WHERE ${cond})::int AS ${col.as}`;

      // Distinct values, as a set. An argument the event does not carry
      // contributes nothing rather than an empty string -- `guardian` is absent
      // on the batch variant, and an empty address in that list would read as a
      // guardian who did nothing rather than as no guardian at all.
      case 'set': {
        const value = col.column
          ? (clickhouse ? col.column : `encode(${col.column}, 'hex')`)
          : `lower(${json(col.arg)})`;
        const present = col.column ? cond : `${cond} AND ${json(col.arg)} != ''`;
        return clickhouse
          ? `groupUniqArrayIf(${value}, ${present}) AS ${col.as}`
          : `coalesce(array_agg(DISTINCT ${value}) FILTER (WHERE ${cond}${col.column ? '' : ` AND ${json(col.arg)} IS NOT NULL AND ${json(col.arg)} <> ''`}), '{}') AS ${col.as}`;
      }

      // One scalar the events agree on. `max` rather than `any` so two runs of
      // the same rollup produce the same row.
      case 'maxArg':
        return clickhouse
          ? `maxIf(${json(col.arg)}, ${cond} AND ${json(col.arg)} != '') AS ${col.as}`
          : `max(${json(col.arg)}) FILTER (WHERE ${cond}) AS ${col.as}`;

      case 'maxNumber':
        return clickhouse
          ? `maxIf(toUInt256OrZero(${json(col.arg)}), ${cond}) AS ${col.as}`
          : `coalesce(max(CASE WHEN ${json(col.arg)} ~ '^[0-9]+$' THEN (${json(col.arg)})::numeric END) FILTER (WHERE ${cond}), 0) AS ${col.as}`;

      case 'minColumn':
        return clickhouse
          ? `minIf(${col.column}, ${cond}) AS ${col.as}`
          : `coalesce(min(${col.column}) FILTER (WHERE ${cond}), 0) AS ${col.as}`;

      default: {
        const args = [...spec.amountArgs, ...(col.extraAmountArgs ?? [])];
        const amount = clickhouse
          ? args.map(a => `toUInt256OrZero(JSONExtractString(args, '${a}'))`).join(' + ')
          : args.map(PG_NUMERIC).join(' + ');
        return clickhouse
          ? `sumIf(${amount}, ${cond}) AS ${col.as}`
          : `coalesce(sum(${amount}) FILTER (WHERE ${cond}), 0) AS ${col.as}`;
      }
    }
  });

  // The window, when this is a top-up rather than a rebuild. Exclusive at the
  // bottom: `synced_block` is the last block already counted.
  const window = [];
  if (fromBlock !== null) window.push(`block_number > ${BigInt(fromBlock)}`);
  if (toBlock !== null) window.push(`block_number <= ${BigInt(toBlock)}`);
  const windowSql = window.length ? ` AND ${window.join(' AND ')}` : '';

  if (clickhouse) {
    const key = chKeyExpression(spec.keyArgs);
    const result = await clickhouse.query({
      // No FINAL: duplicates are prevented on write, not hidden on read.
      query: `SELECT ${key} AS rollup_key, ${selects.join(', ')}
                FROM event
               WHERE event_id IN (${all.join(',')}) AND ${key} != ''${windowSql}
               GROUP BY rollup_key`,
      format: 'JSONEachRow',
    });
    return result.json();
  }

  const key = pgKeyExpression(spec.keyArgs);
  const { rows } = await db().query(
    `SELECT ${key} AS rollup_key, ${selects.join(', ')}
       FROM event
      WHERE event_id = ANY($1) AND ${key} IS NOT NULL${windowSql}
      GROUP BY rollup_key`,
    [all],
  );
  return rows;
}

function toBytes(hex) {
  const clean = String(hex ?? '').replace(/^0x/, '');
  return clean.length === 0 ? null : Buffer.from(clean, 'hex');
}

/** The value each column shape hands to the driver. */
function columnValue(col, raw) {
  switch (col.op) {
    case 'flag':
      return Number(raw ?? 0) > 0;
    case 'set': {
      const list = Array.isArray(raw) ? raw : [];
      return JSON.stringify(list.map(v => (String(v).startsWith('0x') ? String(v) : `0x${v}`)));
    }
    case 'maxArg':
      return col.kind === 'bytes' ? toBytes(raw) : (raw ?? null);
    case 'count':
    case 'maxNumber':
    case 'minColumn':
      return String(raw ?? 0);
    default:
      return String(raw ?? 0);
  }
}

/**
 * How many rows go in one statement.
 *
 * Postgres allows 65,535 bound parameters per statement, and a row here costs
 * one per column plus the key and the block. A thousand rows stays far inside
 * that for any spec anyone is likely to write, and the gain is already flat by
 * then -- the win is in not paying a round trip per row, not in the batch being
 * enormous.
 */
const INSERT_BATCH = 1000;

/// Exported alongside `computeRows` so the write path can be timed and
/// checked without a store behind it.
/**
 * How a column combines what was already stored with what the new blocks added.
 *
 * This is the whole of what makes a top-up safe. Every shape here is either
 * *additive* -- and therefore only correct if the window is applied exactly once
 * -- or *idempotent*, where applying the same window twice changes nothing.
 * Sums and counts are the additive ones, and the watermark below is what gives
 * them their exactly-once.
 */
function mergeExpression(col, table) {
  const mine = `EXCLUDED.${col.as}`;
  const theirs = `${table}.${col.as}`;
  switch (col.op) {
    // A set union is the same however many times it is applied.
    case 'set':
      return `(SELECT coalesce(jsonb_agg(DISTINCT value), '[]'::jsonb)
                 FROM jsonb_array_elements(${theirs} || ${mine}) AS value)`;
    case 'flag':
      return `(${theirs} OR ${mine})`;
    // A later block cannot lower a maximum, and the new window is always later.
    case 'maxArg':
    case 'maxNumber':
      return `greatest(${theirs}, ${mine})`;
    // The earliest block a subject was seen. Zero means "not seen", so it must
    // not win a `least`.
    case 'minColumn':
      return `least(nullif(${theirs}, 0), nullif(${mine}, 0))`;
    default:
      return `(${theirs} + ${mine})`;
  }
}

/**
 * Write a rollup's rows on a caller's connection.
 *
 * Takes the client rather than opening its own, because the watermark and the
 * rows have to move together: if the rows land and the watermark does not, the
 * next pass adds the same window on top of them.
 *
 * A thousand rows to a statement rather than one. That was a round trip per row,
 * invisible at sixteen participants and seconds of wall clock at fifty thousand
 * -- per ingest cycle, on the path that has to keep up with the chain. Measured
 * on this table with its index: 10,000 rows 1,496 ms -> 324 ms, 50,000 rows
 * 6,427 ms -> 1,589 ms. About four times, not the sixteen a three-column table
 * without an index suggested; the rest is index maintenance and NUMERIC parsing,
 * which batching does not avoid.
 */
export async function writeRowsIn(client, spec, rows, atBlock, { merge = false } = {}) {
  const keyColumn = spec.keyKind === 'key' ? 'file_id'
    : spec.keyKind === 'text' ? 'request_id'
    : 'address';
  const columns = spec.columns.map(c => c.as);

  // A text key is stored as it arrived -- a uint256 has no byte form that
  // survives a round trip through a decimal string.
  const prepared = [];
  for (const row of rows) {
    const key = spec.keyKind === 'text'
      ? (row.rollup_key ? String(row.rollup_key) : null)
      : toBytes(row.rollup_key);
    if (!key) continue;
    prepared.push([key, ...spec.columns.map(col => columnValue(col, row[col.as])), String(atBlock ?? 0)]);
  }

  const perRow = columns.length + 2;
  const conflict = merge
    ? `ON CONFLICT (${keyColumn}) DO UPDATE SET `
      + spec.columns.map(col => `${col.as} = ${mergeExpression(col, spec.table)}`).join(', ')
      + ', synced_block = EXCLUDED.synced_block, updated_at = now()'
    : '';

  if (!merge) await client.query(`DELETE FROM ${spec.table}`);

  for (let start = 0; start < prepared.length; start += INSERT_BATCH) {
    const batch = prepared.slice(start, start + INSERT_BATCH);
    const tuples = batch.map((_, row) =>
      `(${Array.from({ length: perRow }, (_, col) => `$${row * perRow + col + 1}`).join(', ')})`);
    await client.query(
      `INSERT INTO ${spec.table} (${keyColumn}, ${columns.join(', ')}, synced_block)
       VALUES ${tuples.join(', ')} ${conflict}`,
      batch.flat(),
    );
  }
  return prepared.length;
}

/// The same write, on its own transaction. For tests and benchmarks that are
/// not already inside one.
export async function writeRows(spec, rows, atBlock, options = {}) {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const written = await writeRowsIn(client, spec, rows, atBlock, options);
    await client.query('COMMIT');
    return written;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The last block already counted into a rollup.
 *
 * Kept in `rollup_state`, one row per spec, and deliberately not on the rollup
 * rows themselves. An incremental pass only touches the keys that appeared in
 * the new blocks, so a per-row watermark never advances on the rows nothing
 * happened to -- the table minimum stays put and the next pass adds the same
 * window again. A test caught that; the totals had doubled.
 *
 * Null when this rollup has never run, which is different from having run and
 * found nothing.
 */
async function watermark(client, spec) {
  const { rows } = await client.query(
    'SELECT synced_block FROM rollup_state WHERE kind = $1', [spec.kind],
  );
  // Deliberately not "and the table has rows". A rollup with nothing in it is
  // the normal state for a spec whose events this chain has never emitted, and
  // treating empty as never-run made those three rescan all of history every
  // minute, forever, to produce nothing. The state row is the record of having
  // run; a table truncated behind our back is what `--full` is for.
  return rows.length === 0 ? null : BigInt(rows[0].synced_block);
}

/**
 * Bring every rollup up to `atBlock`.
 *
 * Rebuilt from nothing when asked, or when the table is empty, or when the
 * checkpoint has moved backwards -- a replay rewrites blocks that were already
 * counted, and adding a window twice is the one thing the additive columns
 * cannot survive. Otherwise only the blocks since the watermark are read, so
 * the work follows what the chain just did rather than everything it has ever
 * done.
 *
 * That last part is why this exists. A full recompute every minute is fine at
 * a few million events and is the same scan, forever, however old the chain
 * gets -- the cost grows with history while the new work stays constant.
 */
export async function projectRollups({ specs, atBlock, clickhouse = null, full = false }) {
  const results = [];
  const target = BigInt(atBlock ?? 0);

  for (const spec of specs) {
    // The watermark is read, the window is computed from it, and the new
    // watermark is written -- all on one connection inside one transaction. That
    // is what makes the additive columns exactly-once: a second run of the same
    // pass sees the moved watermark and computes an empty window.
    const client = await db().connect();
    let mode = 'rebuilt';
    let written = 0;
    try {
      await client.query('BEGIN');
      // Serializes concurrent passes over this rollup without locking the rows
      // a reader might want.
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`rollup:${spec.kind}`]);

      const from = full ? null : await watermark(client, spec);
      // A watermark at or past the target means either nothing new or a replay
      // rewriting counted blocks; both are answered by rebuilding rather than
      // by guessing which.
      const rebuild = from === null || from >= target;
      mode = rebuild ? 'rebuilt' : 'topped up';

      // Both paths stop at the target. A rebuild that counted every block but
      // recorded the target as its watermark would leave the blocks above it
      // counted *and* pending -- the next pass adds them a second time. That is
      // exactly what happened, and the totals came out high.
      const rows = await computeRows(spec, {
        clickhouse,
        fromBlock: rebuild ? null : from,
        toBlock: target,
      });

      written = await writeRowsIn(client, spec, rows, target, { merge: !rebuild });

      await client.query(
        `INSERT INTO rollup_state (kind, synced_block, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (kind) DO UPDATE SET synced_block = EXCLUDED.synced_block, updated_at = now()`,
        [spec.kind, String(target)],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    results.push({ kind: spec.kind, written, mode });
  }
  return results;
}
