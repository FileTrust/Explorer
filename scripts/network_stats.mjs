/**
 * The figures in the site header, computed once per ingest.
 *
 * These are the numbers every visitor sees on every page, so they are the ones
 * that matter most for how the Explorer behaves under load. They were derived in
 * the browser from nineteen whole event streams plus a hundred contract reads --
 * on every screen, for every visitor. Ten thousand keepers and a few hundred
 * readers is enough for that alone to saturate an RPC node, and the numbers were
 * not even right: "active guardians" counted the first fifty and stopped.
 *
 * Each figure is one query here, run against the event store when the indexer
 * advances, and written into the `counter` table the dashboard already reads.
 * The header then costs one request that a cache can answer.
 *
 * The single-query shape matters for correctness, not just speed. Several of
 * these are "how many distinct addresses appear across these events" where the
 * same address appears in more than one of them, and the count of a union is not
 * the sum of the counts. Asking once, over one filtered scan, is the only way to
 * get that right -- and it is why each spec carries a list of clauses that are
 * OR'd together rather than a list of separate questions.
 */

/**
 * A clause is "these events, optionally where an argument has this value".
 * `argEq` is how a role is filtered: `RoleUpdated` carries the role as an
 * argument, and counting data owners means counting that event's `account` only
 * when the role says data owner.
 */
export const NETWORK_STATS = [
  {
    name: 'storageCommitments',
    op: 'distinct',
    keyArgs: ['commitmentHash'],
    clauses: [{ events: ['FileStorageRegistered'] }],
  },
  {
    name: 'storageCommitmentsDeleted',
    op: 'distinct',
    keyArgs: ['commitmentHash'],
    clauses: [{ events: ['FileDeletionConfirmed'] }],
  },
  {
    name: 'proofsSubmitted',
    op: 'count',
    clauses: [{ events: ['SectorProofSubmitted'] }],
  },
  {
    name: 'proofsMissed',
    op: 'count',
    clauses: [{ events: ['SectorProofMissed'] }],
  },
  {
    // A session is a file and a key epoch together, not either alone: counting
    // file ids would merge every re-keying of the same file into one session.
    name: 'dkgSessions',
    op: 'distinct',
    keyArgs: ['fileId', 'keyEpoch'],
    composite: true,
    clauses: [{ events: ['ZkDkgV2Finalized'] }],
  },
  {
    name: 'accessRequests',
    op: 'count',
    clauses: [{ events: ['DataAccessRequestedV2'] }],
  },
  {
    // The same address can be granted the role and also create a policy, so
    // this has to be one distinct over the union rather than two counts added.
    name: 'dataOwners',
    op: 'distinct',
    keyArgs: ['dataOwner', 'account'],
    clauses: [
      { events: ['FilePolicyCreated', 'FilePolicyUpdated', 'KeyGenRequestedForFile', 'BatchCreated'] },
      { events: ['RoleUpdated'], argEq: { role: '2' } },
    ],
  },
  {
    name: 'requesters',
    op: 'distinct',
    keyArgs: ['requester', 'account'],
    clauses: [
      { events: ['RequesterAddedToFile', 'ReencRequestedForFile', 'DataAccessRequestedV2'] },
      { events: ['RoleUpdated'], argEq: { role: '3' } },
    ],
  },
  {
    name: 'reporters',
    op: 'distinct',
    keyArgs: ['reporter'],
    clauses: [{ events: ['DkgComplaintSubmitted', 'PreComplaintSubmitted'] }],
  },
  {
    // "Real stored files": file ids that actually have encrypted pieces on
    // chain. An invalidated CID is not a piece, and a batch that added none is
    // not an upload, so both clauses carry a condition.
    name: 'filesWithPieces',
    op: 'distinct',
    keyArgs: ['fileId'],
    clauses: [
      { events: ['EncCidAddedV2'], argNe: { valid: 'false' } },
      { events: ['EncCidsBatchAdded'], argGt: { count: 0 } },
    ],
  },
];

const quote = (v) => `'${String(v).replace(/'/g, "''")}'`;

function clauseSql(clause, idsFor, json) {
  const ids = idsFor(clause.events);
  // No such event has ever been emitted, so this clause matches nothing. Said
  // explicitly rather than left as an empty `IN ()`, which is a syntax error in
  // one engine and matches everything in the other.
  if (ids.length === 0) return 'false';

  const parts = [`event_id IN (${ids.join(',')})`];
  for (const [arg, value] of Object.entries(clause.argEq ?? {})) {
    parts.push(`${json(arg)} = ${quote(value)}`);
  }
  for (const [arg, value] of Object.entries(clause.argNe ?? {})) {
    parts.push(`${json(arg)} != ${quote(value)}`);
  }
  for (const [arg, value] of Object.entries(clause.argGt ?? {})) {
    // Digits only, so an argument holding something else is not cast and then
    // silently compared as zero.
    parts.push(`${json(arg)} ~ '^[0-9]+$'`);
    parts.push(`${json(arg)}::numeric > ${Number(value)}`);
  }
  return `(${parts.join(' AND ')})`;
}

function clickhouseClause(clause, idsFor) {
  const ids = idsFor(clause.events);
  if (ids.length === 0) return '0';
  const json = (a) => `JSONExtractString(args, ${quote(a)})`;
  const parts = [`event_id IN (${ids.join(',')})`];
  for (const [arg, value] of Object.entries(clause.argEq ?? {})) {
    parts.push(`${json(arg)} = ${quote(value)}`);
  }
  for (const [arg, value] of Object.entries(clause.argNe ?? {})) {
    parts.push(`${json(arg)} != ${quote(value)}`);
  }
  for (const [arg, value] of Object.entries(clause.argGt ?? {})) {
    parts.push(`toUInt256OrZero(${json(arg)}) > ${Number(value)}`);
  }
  return `(${parts.join(' AND ')})`;
}

function expression(spec, json, distinctFn) {
  if (spec.op === 'count') return 'count(*)';
  const keys = spec.keyArgs.map(json);
  // A composite identity is a tuple: several arguments that together name one
  // thing. Everything else coalesces -- the same participant is `dataOwner` in
  // one event and `account` in another, and both are that one address.
  return spec.composite
    ? distinctFn(keys, true)
    : distinctFn([`coalesce(${keys.map(k => `nullif(${k}, '')`).join(', ')})`], false);
}

async function eventIdMap(db, names) {
  const { rows } = await db.query(
    'SELECT id, name FROM event_type WHERE name = ANY($1)', [names],
  );
  return new Map(rows.map(r => [r.name, r.id]));
}

/** Every figure, as one query each. Returns `{ name: number }`. */
export async function computeNetworkStats({ db, clickhouse = null, atBlock = 0 }) {
  const names = [...new Set(NETWORK_STATS.flatMap(s => s.clauses.flatMap(c => c.events)))];
  const ids = await eventIdMap(db, names);
  const idsFor = (events) => events.map(n => ids.get(n)).filter(id => id !== undefined);

  const out = {};
  for (const spec of NETWORK_STATS) {
    const where = clickhouse
      ? spec.clauses.map(c => clickhouseClause(c, idsFor)).join(' OR ')
      : spec.clauses.map(c => clauseSql(c, idsFor, (a) => `(args ->> ${quote(a)})`)).join(' OR ');

    if (clickhouse) {
      const json = (a) => `JSONExtractString(args, ${quote(a)})`;
      const expr = expression(spec, json, (keys, composite) => (composite
        // uniqExact rather than uniq: an approximate count shown as a total is
        // the failure this whole exercise is about.
        ? `uniqExact(${keys.join(', ')})`
        : `uniqExactIf(${keys[0]}, ${keys[0]} != '')`));
      const result = await clickhouse.query({
        // No FINAL: duplicates are prevented on write, not hidden on read.
        query: `SELECT ${expr} AS value FROM event WHERE ${where}`,
        format: 'JSONEachRow',
      });
      const [row] = await result.json();
      out[spec.name] = Number(row?.value ?? 0);
      continue;
    }

    const json = (a) => `(args ->> ${quote(a)})`;
    const expr = expression(spec, json, (keys, composite) => (composite
      ? `count(DISTINCT (${keys.join(', ')}))`
      : `count(DISTINCT ${keys[0]})`));
    const { rows } = await db.query(`SELECT ${expr} AS value FROM event WHERE ${where}`);
    out[spec.name] = Number(rows[0]?.value ?? 0);
  }

  // Registered minus confirmed-deleted, the same subtraction the file screen
  // makes, so the two agree with each other.
  out.storageCommitmentsActive = Math.max(
    0, out.storageCommitments - out.storageCommitmentsDeleted,
  );

  // Active keepers and guardians come from the projected rows, where `active` is
  // a column the contract was asked for. The header used to read fifty of them
  // one call at a time and report that as the total, which was simply wrong past
  // the fiftieth.
  const { rows: entity } = await db.query(`
    SELECT (SELECT count(*) FROM vault_keeper)                    AS vk_total,
           (SELECT count(*) FROM vault_keeper WHERE active)       AS vk_active,
           (SELECT count(*) FROM guardian)                        AS g_total,
           (SELECT count(*) FROM guardian WHERE active)           AS g_active`);
  out.vaultKeepers = Number(entity[0].vk_total);
  out.vaultKeepersActive = Number(entity[0].vk_active);
  out.guardians = Number(entity[0].g_total);
  out.guardiansActive = Number(entity[0].g_active);

  // The marker that says these were computed at all. A chain an hour old has a
  // legitimate zero for every figure above, so "all zero" cannot be the signal
  // -- without this the header could not tell a new network from an Explorer
  // whose stats have never run, and would fall back to reading the whole log
  // forever on the emptiest chain there is.
  out.networkStatsBlock = Number(atBlock) || 1;

  return out;
}
