/**
 * Prove the writer cannot lose or duplicate an event, on a copy of the store.
 *
 * This exists because the first attempt at the same idea destroyed 2,735 of
 * 2,829 real events, and the reason it was not caught is that it was tried
 * against the live index. Every case below runs against a throwaway ClickHouse
 * database holding a copy of the real one, so a mistake costs nothing.
 *
 * The property under test is the one that would let every read drop `FINAL`:
 * after any sequence of writes, the table holds each (block, log index) exactly
 * once, and holds every event that belongs there.
 *
 *   node scripts/verify_ingest.mjs
 */
process.loadEnvFile('.env.local');

import { createClient } from '@clickhouse/client';

const SOURCE = process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer';
const SANDBOX = 'filetrust_ingest_check';

const base = {
  url: process.env.CLICKHOUSE_URL,
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
};

const checks = [];
const check = (name, got, want) => {
  checks.push({ name, got, want, ok: String(got) === String(want) });
};

const admin = createClient(base);
await admin.command({ query: `DROP DATABASE IF EXISTS ${SANDBOX}` });
await admin.command({ query: `CREATE DATABASE ${SANDBOX}` });
await admin.command({ query: `CREATE TABLE ${SANDBOX}.event AS ${SOURCE}.event` });
await admin.command({ query: `INSERT INTO ${SANDBOX}.event SELECT * FROM ${SOURCE}.event` });
await admin.close();

const ch = createClient({ ...base, database: SANDBOX });
const one = async (sql) => (await (await ch.query({ query: sql, format: 'JSONEachRow' })).json())[0];

const state = async () => {
  const r = await one(`SELECT count() AS total, uniqExact(block_number, log_index) AS uniq,
                              min(block_number) AS lo, max(block_number) AS hi FROM event`);
  return { total: Number(r.total), uniq: Number(r.uniq), lo: Number(r.lo), hi: Number(r.hi) };
};

const original = await state();
console.log(`copy of ${SOURCE}: ${original.total} events, blocks ${original.lo}-${original.hi}\n`);
check('the copy starts clean', original.total - original.uniq, 0);

/// The rows of a block range, in the shape the writer takes them.
async function rowsBetween(from, to) {
  return (await (await ch.query({
    query: `SELECT block_number, log_index, block_time, tx_hash, tx_index,
                   contract_id, event_id, subject_addr, subject_key, args
              FROM event WHERE block_number >= ${from} AND block_number <= ${to}`,
    format: 'JSONEachRow',
  })).json()).map(r => ({ ...r, block_number: String(r.block_number) }));
}

/// What the writer does, against the sandbox: clear the promised range, rewrite.
async function writeRange(rows, range) {
  if (range) {
    const [{ n }] = await (await ch.query({
      query: `SELECT count() AS n FROM event
               WHERE block_number >= ${range.fromBlock} AND block_number <= ${range.toBlock}`,
      format: 'JSONEachRow',
    })).json();
    if (Number(n) > 0) {
      await ch.command({
        query: `DELETE FROM event
                 WHERE block_number >= ${range.fromBlock} AND block_number <= ${range.toBlock}`,
        clickhouse_settings: { mutations_sync: '2' },
      });
    }
  }
  if (rows.length > 0) await ch.insert({ table: 'event', values: rows, format: 'JSONEachRow' });
}

const mid = Math.floor((original.lo + original.hi) / 2);

// 1. The ordinary replay: rewrite a range with exactly what belongs in it.
const middle = await rowsBetween(mid, original.hi);
await writeRange(middle, { fromBlock: mid, toBlock: original.hi });
let now = await state();
check('a replayed range keeps every event', now.total, original.total);
check('and creates no duplicate', now.total - now.uniq, 0);

// 2. The same replay twice more. Additive writing would show here.
await writeRange(middle, { fromBlock: mid, toBlock: original.hi });
await writeRange(middle, { fromBlock: mid, toBlock: original.hi });
now = await state();
check('three replays change nothing', now.total, original.total);
check('and still no duplicate', now.total - now.uniq, 0);

// 3. The case that destroyed the real index: a partial batch. The writer is
//    handed 94 rows from a low block and, crucially, a range that covers only
//    them. Everything above must survive.
const low = await rowsBetween(original.lo, original.lo + 400);
await writeRange(low, { fromBlock: original.lo, toBlock: original.lo + 400 });
now = await state();
check('a partial batch leaves later blocks alone', now.total, original.total);
check('and creates no duplicate', now.total - now.uniq, 0);

// 4. No range promised: the writer must not delete anything. Duplicates are the
//    honest outcome here, which is why a caller that cannot promise must not
//    pretend to.
await writeRange(await rowsBetween(mid, original.hi), null);
now = await state();
check('without a promise, nothing is deleted', now.total > original.total, true);

// 5. And a promised rewrite repairs it.
await writeRange(await rowsBetween(mid, original.hi), { fromBlock: mid, toBlock: original.hi });
now = await state();
check('a promised rewrite repairs the duplicates', now.total, original.total);
check('back to exactly one of each', now.total - now.uniq, 0);

for (const c of checks) {
  console.log(`${c.ok ? '  ok  ' : ' FAIL '} ${c.name.padEnd(46)} got=${c.got} want=${c.want}`);
}

await ch.close();
const admin2 = createClient(base);
await admin2.command({ query: `DROP DATABASE ${SANDBOX}` });
await admin2.close();

const failed = checks.filter(c => !c.ok).length;
console.log(failed === 0
  ? `\nthe writer holds each event exactly once (${checks.length} checks)`
  : `\n${failed} of ${checks.length} checks failed`);
process.exit(failed === 0 ? 0 : 1);
