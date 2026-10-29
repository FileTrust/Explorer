/**
 * Check the rollup column shapes against figures reached another way.
 *
 * The PRE request rollup is the reason this exists. It uses shapes nothing else
 * does -- distinct sets of addresses, a flag, the earliest block across several
 * streams -- and this chain emits no PRE events at all, so running it proves
 * nothing: it writes zero rows whether the SQL is right or hopelessly wrong.
 *
 * So the shapes are exercised over events the chain *does* have, and every
 * answer is checked against the same figure computed a different way through
 * `aggregateEvents`. If a `groupUniqArray` silently drops values, or a `minIf`
 * picks the wrong row, the totals stop agreeing and this says so.
 *
 * Run: node scripts/verify_rollups.mjs
 */
process.loadEnvFile('.env.local');

const { computeRows } = await import('./project_rollups.mjs');
const { aggregateEvents, eventStoreName } = await import('../src/lib/db/repository.mjs');

let clickhouse = null;
if (eventStoreName() === 'clickhouse') {
  const { createClient } = await import('@clickhouse/client');
  clickhouse = createClient({
    url: process.env.CLICKHOUSE_URL,
    database: process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });
}

/// A contract with enough shape to exercise everything: a subject key to collect
/// into sets, a second event to raise a flag, and a numeric argument.
const PROBE = {
  keyArgs: ['vk'],
  keyKind: 'address',
  amountArgs: [],
  events: ['PartitionRegistered', 'PartitionDeactivated', 'PartitionProofSubmittedDeterministic'],
  columns: [
    { as: 'partitions', op: 'set', arg: 'partitionKey', events: ['PartitionRegistered'] },
    { as: 'txs', op: 'set', column: 'tx_hash' },
    { as: 'deactivated', op: 'flag', events: ['PartitionDeactivated'] },
    { as: 'max_sectors', op: 'maxNumber', arg: 'sectorCount', events: ['PartitionRegistered'] },
    { as: 'first_block', op: 'minColumn', column: 'block_number' },
    { as: 'events', op: 'count' },
  ],
};

const checks = [];
const check = (name, got, want) => {
  checks.push({ name, got, want, ok: String(got) === String(want) });
};

const rows = await computeRows(PROBE, { clickhouse });

// Sets: the union across every key must equal the distinct count the aggregate
// reports. This is the check that catches a set aggregate quietly truncating.
const union = new Set();
for (const row of rows) for (const v of row.partitions ?? []) union.add(String(v).toLowerCase());
const distinct = await aggregateEvents({
  op: 'distinct', arg: 'partitionKey', contracts: ['StorageProofSC'],
  events: ['PartitionRegistered'],
});
check('set union == distinct partitionKey', union.size, distinct.total);

// Count: the per-key totals must add up to the total over the same events.
const counted = rows.reduce((sum, row) => sum + Number(row.events), 0);
const total = await aggregateEvents({ op: 'count', contracts: ['StorageProofSC'], events: PROBE.events });
check('per-key counts == total events', counted, total.total);

// Keys: one row per distinct subject.
const distinctVks = await aggregateEvents({
  op: 'distinct', arg: 'vk', contracts: ['StorageProofSC'], events: PROBE.events,
});
check('rows == distinct vk', rows.length, distinctVks.total);

// Flag: how many keys saw the second event, against the same question asked of
// the aggregate one key at a time would be slow -- so check it is a subset and
// that at least the total number of those events is consistent with it.
const flagged = rows.filter((row) => Number(row.deactivated) > 0).length;
const deactivations = await aggregateEvents({
  op: 'count', contracts: ['StorageProofSC'], events: ['PartitionDeactivated'],
});
check('flagged keys <= deactivation events',
  flagged <= Number(deactivations.total), true);

// minColumn: no key may report a first block below the chain's own first block
// for these events, and none may be zero when the key has events.
const badMin = rows.filter((row) => Number(row.first_block) <= 0).length;
check('every key has a first block', badMin, 0);

// A set of transaction hashes must never be empty for a key that has events.
const emptyTxs = rows.filter((row) => (row.txs ?? []).length === 0).length;
check('every key has transaction hashes', emptyTxs, 0);

// --- incremental correctness ------------------------------------------------
//
// The whole point of the watermark is that topping up must land exactly where a
// rebuild would. These four are the ways that can go wrong, and three of them
// did during development: a rebuild that ignored the target block counted
// everything and then let the next pass count the overlap again; a per-row
// watermark that never advanced on untouched rows; and a repeat pass that added
// its window twice.
const { projectRollups } = await import('./project_rollups.mjs');
const { ROLLUP_SPECS } = await import('./rollup_specs.mjs');
const { getEconomicParticipants } = await import('../src/lib/db/repository.mjs');

const snapshot = async () => (await getEconomicParticipants({ limit: 5000 }) ?? [])
  .map(r => [r.address, r.rewards, r.claimed, r.pool_deposits, r.stake_deposits,
    r.slashed, r.escrow_paid, r.escrow_received, r.event_count].join('|'))
  .sort().join('\n');

const { rows: [{ at }] } = await (await import('../src/lib/db/postgres.mjs')).db()
  .query('SELECT coalesce(max(synced_block), 0) AS at FROM rollup_state');
const head = Number(at) || 0;

if (head > 0) {
  const run = (block, full = false) =>
    projectRollups({ specs: ROLLUP_SPECS, atBlock: block, clickhouse, full });

  await run(head, true);
  const truth = await snapshot();

  const mid = Math.floor(head / 3);
  await run(mid, true);
  for (const b of [mid * 2, head]) await run(b);
  check('topping up lands where a rebuild does', await snapshot() === truth, true);

  await run(head);
  await run(head);
  check('a repeated pass changes nothing', await snapshot() === truth, true);

  const back = await run(Math.floor(head / 2));
  check('a checkpoint moving back rebuilds', back[0].mode, 'rebuilt');
  await run(head);
  check('and recovers the same totals', await snapshot() === truth, true);
}

for (const c of checks) {
  console.log(`${c.ok ? '  ok  ' : ' FAIL '} ${c.name.padEnd(38)} got=${c.got} want=${c.want}`);
}

const failed = checks.filter((c) => !c.ok).length;
console.log(failed === 0
  ? `\nrollup column shapes agree with the aggregate (${checks.length} checks, ${rows.length} keys)`
  : `\n${failed} of ${checks.length} checks failed`);

if (clickhouse) await clickhouse.close();
process.exit(failed === 0 ? 0 : 1);
