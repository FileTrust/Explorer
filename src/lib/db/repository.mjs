/// One way to ask the store a question, whichever engine answers it.
///
/// Current state lives in Postgres -- ten thousand vault keepers, updated in
/// place, read transactionally. The event log lives wherever it is configured
/// to: Postgres by default, ClickHouse when CLICKHOUSE_URL is set, because at
/// the measured rate it is billions of rows a year and that is what a columnar
/// store is for. Nothing above this file knows which answered.
///
/// Rows come back in exactly the shape the JSON index produced, numbers as
/// decimal strings included. That is not nostalgia: it is what lets the store
/// change underneath without a single screen changing, and what makes the two
/// answers comparable when checking that the swap was faithful.
import { db, dbReady, toBytes, toHex } from './postgres.mjs';

let clickhouse = null;
let clickhouseChecked = false;

/// The ClickHouse client, or null when the event log stays in Postgres.
async function eventClickHouse() {
  if (clickhouseChecked) return clickhouse;
  clickhouseChecked = true;
  const url = process.env.CLICKHOUSE_URL;
  if (!url) return null;
  const { createClient } = await import('@clickhouse/client');
  clickhouse = createClient({
    url,
    database: process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });
  return clickhouse;
}

export function eventStoreName() {
  return process.env.CLICKHOUSE_URL ? 'clickhouse' : 'postgres';
}

// --- dimensions -------------------------------------------------------------
// Eighteen contracts and 147 event types against billions of rows, so they are
// held here for the life of the process and looked up by id rather than joined.

let dimensions = null;

async function loadDimensions() {
  if (dimensions) return dimensions;
  const [contracts, events] = await Promise.all([
    db().query('SELECT id, address, name, label FROM contract'),
    db().query('SELECT id, name FROM event_type'),
  ]);

  const byId = new Map();
  const byAddress = new Map();
  for (const row of contracts.rows) {
    const entry = { id: row.id, address: toHex(row.address), name: row.name, label: row.label };
    byId.set(row.id, entry);
    byAddress.set(entry.address.toLowerCase(), entry);
  }

  const eventById = new Map();
  const eventByName = new Map();
  for (const row of events.rows) {
    eventById.set(row.id, row.name);
    eventByName.set(row.name, row.id);
  }

  dimensions = { byId, byAddress, eventById, eventByName };
  return dimensions;
}

/// Forget the cached dimensions, after the indexer has added to them.
export function resetDimensions() {
  dimensions = null;
}

/**
 * The dimensions, reloaded once if a name asked for is not in them.
 *
 * The cache is held for the life of the process, and the indexer that adds to
 * these tables is a different process, so the server never learned about an
 * event type first seen after it started. That is not a rare case: every event
 * name enters `event_type` the first time the chain emits it, so the first
 * access request, the first dispute, the first deletion on a running network all
 * arrive as names this server does not know. Filtering by an unknown name is
 * answered with nothing -- correctly, given what it knows -- so the screen reads
 * empty and stays empty until somebody restarts the server.
 *
 * A miss is the one moment worth paying to re-read, and it costs two small
 * queries. A name that is genuinely unknown reloads once and is still unknown,
 * which is the right answer; a name that has just appeared is found. In steady
 * state nothing misses and this is the plain cached read.
 */
async function dimensionsIncluding(names) {
  let dim = await loadDimensions();
  if (names.length === 0 || names.every((name) => dim.eventByName.has(name))) return dim;
  dimensions = null;
  return loadDimensions();
}

// --- status -----------------------------------------------------------------

/**
 * What the manifest used to say: which deployment, how far, how many.
 *
 * Returns null when there is nothing to answer with, because "no store yet" and
 * "a store holding nothing" are different, and only the first should send a
 * screen to its bounded chain window. A chain deployed an hour ago has a
 * perfectly good store with no events in it.
 */
export async function getStatus() {
  if (!(await dbReady())) return null;

  const [checkpoint, counters, contracts] = await Promise.all([
    db().query('SELECT chain_id, deployment_hash, last_block, updated_at FROM indexer_checkpoint WHERE id = 1'),
    db().query('SELECT name, value FROM counter'),
    db().query('SELECT address, name, label FROM contract ORDER BY name'),
  ]);

  if (checkpoint.rowCount === 0) return null;
  const row = checkpoint.rows[0];

  const counts = {};
  for (const c of counters.rows) counts[c.name] = Number(c.value);

  return {
    generatedAt: row.updated_at?.toISOString?.() ?? new Date().toISOString(),
    chainId: Number(row.chain_id),
    fromBlock: '0',
    toBlock: String(row.last_block),
    latestBlock: String(row.last_block),
    store: eventStoreName(),
    counts: {
      blocks: counts.blocks ?? 0,
      transactions: counts.transactions ?? 0,
      logs: counts.logs ?? 0,
      filetrustEvents: counts.filetrustEvents ?? 0,
      files: counts.files ?? 0,
      sectors: counts.sectors ?? 0,
      partitions: counts.partitions ?? 0,
      guardians: counts.guardians ?? 0,
      vaultKeepers: counts.vaultKeepers ?? 0,
      dkgSessions: counts.dkgSessions ?? 0,
      accessRequests: counts.accessRequests ?? 0,
      // The figures in the site header. They ride along here because the header
      // already reads this document, so answering them costs no extra request
      // -- and because they must be as fresh as the checkpoint beside them,
      // which is what makes a single ETag honest for the whole reply.
      storageCommitments: counts.storageCommitments ?? 0,
      storageCommitmentsActive: counts.storageCommitmentsActive ?? 0,
      storageCommitmentsDeleted: counts.storageCommitmentsDeleted ?? 0,
      proofsSubmitted: counts.proofsSubmitted ?? 0,
      proofsMissed: counts.proofsMissed ?? 0,
      dataOwners: counts.dataOwners ?? 0,
      requesters: counts.requesters ?? 0,
      reporters: counts.reporters ?? 0,
      filesWithPieces: counts.filesWithPieces ?? 0,
      guardiansActive: counts.guardiansActive ?? 0,
      vaultKeepersActive: counts.vaultKeepersActive ?? 0,
      /// Zero until the stats have run once. See `network_stats.mjs`.
      networkStatsBlock: counts.networkStatsBlock ?? 0,
    },
    contracts: contracts.rows.map((c) => ({
      address: toHex(c.address),
      name: c.name,
      label: c.label,
    })),
  };
}

// --- events -----------------------------------------------------------------

function eventRow(dim, row) {
  const contract = dim.byId.get(Number(row.contract_id));
  return {
    address: contract?.address,
    contractName: contract?.name,
    contractLabel: contract?.label,
    blockNumber: String(row.block_number),
    transactionHash: toHex(row.tx_hash),
    transactionIndex: Number(row.tx_index),
    logIndex: Number(row.log_index),
    name: dim.eventById.get(Number(row.event_id)),
    args: row.args,
  };
}

/**
 * Events matching a filter, newest first, one page at a time.
 *
 * Every argument is optional and every one of them narrows an index rather than
 * a scan, which is the whole point of the schema above: address and event name
 * are the leading columns of `event_by_type`, and the block bounds ride the
 * partition key.
 */
export async function getEvents({
  addresses = [],
  contracts = [],
  events = [],
  subject,
  /// One transaction's events, for the transaction screen. `tx_hash` is not in
  /// the sort order, so this reads the block's granules and filters -- fine,
  /// because a transaction is always paired with the block that holds it.
  transactionHash,
  fromBlock,
  toBlock,
  limit = 1000,
  cursor,
} = {}) {
  const dim = await dimensionsIncluding(events);

  // Names to ids up front. An unknown name is not an empty filter -- it is a
  // filter nothing satisfies, and answering it with everything would be worse
  // than answering it with nothing.
  const contractIds = [];
  for (const address of addresses) {
    const found = dim.byAddress.get(String(address).toLowerCase());
    if (found) contractIds.push(found.id); else return [];
  }
  for (const name of contracts) {
    for (const entry of dim.byId.values()) {
      if (entry.name === name || entry.label === name) contractIds.push(entry.id);
    }
  }
  if ((addresses.length > 0 || contracts.length > 0) && contractIds.length === 0) return [];

  // A union, so an unknown name narrows it rather than emptying it.
  //
  // One name that has never occurred used to void the whole query: asking for
  // six proof event types where five have never been emitted returned nothing at
  // all, and the screen read zero. Empty is only right when *every* name is
  // unknown -- then the filter genuinely matches nothing, and answering with
  // everything would be worse.
  const eventIds = [];
  for (const name of events) {
    const id = dim.eventByName.get(name);
    if (id !== undefined) eventIds.push(id);
  }
  if (events.length > 0 && eventIds.length === 0) return [];

  // `subject` is whoever or whatever the event is about -- a vault keeper, a
  // file id, a partition key. It has its own index precisely so a detail screen
  // can ask for its own rows instead of taking a page of everything and
  // discarding all but a few. Twenty bytes is an address, thirty-two a key.
  const subjectBytes = subject ? toBytes(subject) : null;
  const subjectColumn = subjectBytes
    ? (subjectBytes.length === 20 ? 'subject_addr' : 'subject_key')
    : null;

  const txBytes = transactionHash ? toBytes(transactionHash) : null;

  const ch = await eventClickHouse();
  const args = {
    contractIds, eventIds, subject, subjectColumn, fromBlock, toBlock, limit, cursor,
    transactionHash: txBytes ? txBytes.toString('hex') : null,
  };
  const rows = ch
    ? await selectEventsClickHouse(ch, args)
    : await selectEventsPostgres({ ...args, subject: subjectBytes, transactionHash: txBytes });

  return rows.map((row) => eventRow(dim, row));
}

async function selectEventsPostgres({ contractIds, eventIds, subject, subjectColumn, transactionHash, fromBlock, toBlock, limit, cursor }) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

  // `= value` where a single one was asked for, rather than `= ANY(array)`.
  // The index is (contract_id, event_id, block_number DESC, log_index DESC), so
  // an equality on both leading columns lets the scan come back already in the
  // order wanted. ANY cannot, and Postgres then sorts what it collected -- cheap
  // under a LIMIT of fifty, much less so once there are partitions to merge.
  if (contractIds.length === 1) add('contract_id = ?', contractIds[0]);
  else if (contractIds.length > 1) add('contract_id = ANY(?)', contractIds);

  if (eventIds.length === 1) add('event_id = ?', eventIds[0]);
  else if (eventIds.length > 1) add('event_id = ANY(?)', eventIds);
  if (subjectColumn && subject) add(`${subjectColumn} = ?`, subject);
  if (transactionHash) add('tx_hash = ?', transactionHash);
  if (fromBlock !== undefined) add('block_number >= ?', String(fromBlock));
  if (toBlock !== undefined) add('block_number <= ?', String(toBlock));
  // Keyset paging: strictly older than the last row handed out. An OFFSET would
  // re-read every row it skipped, which is the cost that grows with depth.
  if (cursor) {
    params.push(String(cursor.blockNumber), cursor.logIndex);
    where.push(`(block_number, log_index) < ($${params.length - 1}, $${params.length})`);
  }

  params.push(Math.min(Number(limit) || 1000, 10000));

  const { rows } = await db().query(
    `SELECT block_number, log_index, tx_hash, tx_index, contract_id, event_id, args
       FROM event
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY block_number DESC, log_index DESC
      LIMIT $${params.length}`,
    params,
  );
  return rows;
}

async function selectEventsClickHouse(ch, { contractIds, eventIds, subject, subjectColumn, transactionHash, fromBlock, toBlock, limit, cursor }) {
  const where = [];
  const params = {};

  if (contractIds.length > 0) { where.push('contract_id IN {contractIds:Array(UInt16)}'); params.contractIds = contractIds; }
  if (eventIds.length > 0) { where.push('event_id IN {eventIds:Array(UInt16)}'); params.eventIds = eventIds; }
  if (subjectColumn && subject) {
    where.push(`${subjectColumn} = {subject:String}`);
    params.subject = String(subject).replace(/^0x/, '').toLowerCase();
  }
  if (transactionHash) { where.push('tx_hash = {txHash:String}'); params.txHash = transactionHash; }
  if (fromBlock !== undefined) { where.push('block_number >= {fromBlock:UInt64}'); params.fromBlock = String(fromBlock); }
  if (toBlock !== undefined) { where.push('block_number <= {toBlock:UInt64}'); params.toBlock = String(toBlock); }
  if (cursor) {
    where.push('(block_number, log_index) < ({cursorBlock:UInt64}, {cursorLog:UInt32})');
    params.cursorBlock = String(cursor.blockNumber);
    params.cursorLog = cursor.logIndex;
  }
  params.limit = Math.min(Number(limit) || 1000, 10000);

  // No FINAL, and this is the note explaining why not.
  //
  // ReplacingMergeTree collapses duplicates only during a background merge, at a
  // time nothing can predict, so a table that can hold two copies of a row needs
  // FINAL on every read to hide them -- and a count that includes both is wrong
  // in the one way that looks exactly like working. That was the situation.
  //
  // It is not any more: the writer takes an explicit block range that the caller
  // promises is complete, clears it, and rewrites it. Postgres has always had
  // the same guarantee from ON CONFLICT. `verify_ingest.mjs` proves it against a
  // copy of the store, including the partial-batch case that a previous attempt
  // at this got wrong badly enough to destroy 2,735 rows.
  //
  // Worth removing because the price was measured, not guessed: at ten million
  // events FINAL disables projections, so this shape of query read the whole
  // table instead of the granules it needed -- 459 ms against 17 ms for one
  // subject's events. See SCALE_TEST_RESULT.md.
  const result = await ch.query({
    query: `SELECT block_number, log_index, tx_hash AS tx_hash_hex, tx_index, contract_id, event_id, args
              FROM event ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ORDER BY block_number DESC, log_index DESC
             LIMIT {limit:UInt32}`,
    query_params: params,
    format: 'JSONEachRow',
  });

  const rows = await result.json();
  return rows.map((row) => ({
    block_number: row.block_number,
    log_index: row.log_index,
    tx_hash: Buffer.from(row.tx_hash_hex, 'hex'),
    tx_index: row.tx_index,
    contract_id: row.contract_id,
    event_id: row.event_id,
    args: typeof row.args === 'string' ? JSON.parse(row.args) : row.args,
  }));
}

// --- aggregates -------------------------------------------------------------

/// Resolve the filter to dimension ids once, for both engines.
async function resolveFilter({ addresses = [], contracts = [], events = [] }) {
  const dim = await dimensionsIncluding(events);
  const contractIds = [];
  for (const address of addresses) {
    const found = dim.byAddress.get(String(address).toLowerCase());
    if (!found) return null; // A filter nothing satisfies, not an empty filter.
    contractIds.push(found.id);
  }
  for (const name of contracts) {
    for (const entry of dim.byId.values()) {
      if (entry.name === name || entry.label === name) contractIds.push(entry.id);
    }
  }
  if ((addresses.length > 0 || contracts.length > 0) && contractIds.length === 0) return null;

  // Same union rule as getEvents: an unknown name narrows, it does not void.
  const eventIds = [];
  for (const name of events) {
    const id = dim.eventByName.get(name);
    if (id !== undefined) eventIds.push(id);
  }
  if (events.length > 0 && eventIds.length === 0) return null;
  return { dim, contractIds, eventIds };
}

/**
 * Answer a question about the events instead of shipping them.
 *
 * `count` and `distinct` are index work; `sum` reaches into the argument JSON,
 * which is the expensive one and is why it is opt-in per argument rather than
 * something a screen can ask for by accident.
 *
 * Values come back as decimal strings, as everything else here does, because a
 * sum of wei does not fit in a double and quietly rounding it would be worse
 * than refusing.
 */
export async function aggregateEvents({
  op = 'count', addresses = [], contracts = [], events = [],
  arg, field, groupBy, fromBlock, toBlock,
} = {}) {
  if (!(await dbReady())) throw new Error('no store');

  const resolved = await resolveFilter({ addresses, contracts, events });
  // Nothing can match, so the answer is zero -- arrived at without a query.
  if (!resolved) return { op, total: '0', groups: [] };
  const { dim, contractIds, eventIds } = resolved;

  if (op === 'sum' && !arg) throw new Error('sum needs ?arg=<argument name>');
  // Distinct answers two different questions. On a promoted column it is an
  // index scan. On an argument it reaches into the JSON, which is slower but is
  // the only way to count things the schema never promoted -- DKG sessions,
  // access requests, file commitments -- and those are exactly what several
  // screens display as totals. Without it they can only count rows, and a screen
  // counting rows to report entities is wrong the moment one entity emits two
  // events, which is what every one of them does.
  const argNames = Array.isArray(arg) ? arg : arg ? [arg] : [];
  if (op === 'distinct' && argNames.length === 0 && !['subject_addr', 'subject_key'].includes(field ?? '')) {
    throw new Error('distinct needs ?field=subject_addr|subject_key or ?arg=<argument name>');
  }
  // `arg:<name>` groups by the value of an event argument rather than by which
  // event it was. Several screens split a total on something the schema never
  // promoted to a column -- proofs by whether they verified, requests by their
  // status -- and without this they can only sample the rows they downloaded and
  // scale the ratio up, which is a guess presented as a total and stops being
  // even approximately right the moment the list is paged.
  const groupArg = typeof groupBy === 'string' && groupBy.startsWith('arg:')
    ? groupBy.slice(4)
    : null;
  if (groupArg !== null && groupArg === '') {
    throw new Error('group=arg: needs an argument name');
  }
  if (groupBy && !groupArg && groupBy !== 'event' && groupBy !== 'contract') {
    throw new Error('group must be event, contract or arg:<argument name>');
  }

  const ch = await eventClickHouse();
  const rows = ch
    ? await aggregateClickHouse(ch, { op, contractIds, eventIds, arg, field, groupBy, groupArg, fromBlock, toBlock })
    : await aggregatePostgres({ op, contractIds, eventIds, arg, field, groupBy, groupArg, fromBlock, toBlock });

  const label = (row) => {
    // An argument's value is already its own label; only ids need looking up.
    if (groupArg) return row.key === null || row.key === '' ? '(absent)' : String(row.key);
    return groupBy === 'event'
      ? dim.eventById.get(Number(row.key))
      : dim.byId.get(Number(row.key))?.name;
  };

  // For a sum, say how many rows carried the argument. Without it a caller
  // cannot tell "nothing was paid" from "that argument does not exist", and the
  // second is a question asked wrongly rather than an answer.
  const carriedCount = (r) => (r?.with_arg === undefined ? undefined : Number(r.with_arg));

  if (!groupBy) {
    const total = String(rows[0]?.value ?? 0);
    const withArg = carriedCount(rows[0]);
    return withArg === undefined
      ? { op, total }
      : { op, total, matchedRowsCarryingArg: withArg, ...(withArg === 0 ? { warning: `no event carried an argument named "${arg}"` } : {}) };
  }
  return {
    op,
    groupedBy: groupBy,
    groups: rows.map((r) => ({ key: label(r) ?? String(r.key), value: String(r.value) })),
    total: String(rows.reduce((sum, r) => sum + BigInt(r.value ?? 0), 0n)),
  };
}

function aggregateExpression(op, arg, field, jsonAccess, jsonDistinct) {
  if (op === 'count') return 'count(*)';
  if (op === 'distinct') {
    const names = Array.isArray(arg) ? arg : arg ? [arg] : [];
    return names.length > 0 ? jsonDistinct(names) : `count(DISTINCT ${field})`;
  }
  return jsonAccess(Array.isArray(arg) ? arg[0] : arg);
}

async function aggregatePostgres({ op, contractIds, eventIds, arg, field, groupBy, groupArg, fromBlock, toBlock }) {
  const where = [];
  const params = [];
  const add = (sql, value) => { params.push(value); where.push(sql.replace('?', `$${params.length}`)); };

  if (contractIds.length === 1) add('contract_id = ?', contractIds[0]);
  else if (contractIds.length > 1) add('contract_id = ANY(?)', contractIds);
  if (eventIds.length === 1) add('event_id = ?', eventIds[0]);
  else if (eventIds.length > 1) add('event_id = ANY(?)', eventIds);
  if (fromBlock !== undefined) add('block_number >= ?', String(fromBlock));
  if (toBlock !== undefined) add('block_number <= ?', String(toBlock));

  // Only digits are summed. An argument holding an address or a hash would
  // otherwise cast to zero and be added in silently, which reads as a real sum.
  const expr = aggregateExpression(op, arg, field, (a) => {
    params.push(a);
    // FILTER belongs after the aggregate's closing parenthesis; written inside it,
    // Postgres refused every sum, so each total read as unavailable.
    return `coalesce(sum((args ->> $${params.length})::numeric) FILTER (WHERE args ->> $${params.length} ~ '^[0-9]+$'), 0)`;
  }, (names) => {
    // Several names means a composite identity. A DKG session is a file and a
    // key epoch together, not either alone, so counting distinct file ids would
    // merge every re-keying of the same file into one session.
    const parts = names.map((a) => { params.push(a); return `args ->> $${params.length}`; });
    return names.length === 1
      ? `count(DISTINCT ${parts[0]})`
      : `count(DISTINCT (${parts.join(', ')}))`;
  });

  // How many rows actually carried the argument. A sum over an argument no event
  // has is zero, and a zero that means "you asked for the wrong name" looks
  // exactly like a zero that means "nothing was paid". Counting them apart is
  // what lets the caller tell.
  const carried = op === 'sum'
    ? `, count(*) FILTER (WHERE args ? $${params.length}) AS with_arg`
    : '';

  let group = groupBy === 'event' ? 'event_id' : groupBy === 'contract' ? 'contract_id' : null;
  if (groupArg) { params.push(groupArg); group = `args ->> $${params.length}`; }
  const { rows } = await db().query(
    `SELECT ${group ? `${group} AS key, ` : ''}${expr} AS value${carried}
       FROM event ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ${group ? `GROUP BY ${group} ORDER BY value DESC` : ''}`,
    params,
  );
  return rows;
}

async function aggregateClickHouse(ch, { op, contractIds, eventIds, arg, field, groupBy, groupArg, fromBlock, toBlock }) {
  const where = [];
  const params = {};
  if (contractIds.length > 0) { where.push('contract_id IN {contractIds:Array(UInt16)}'); params.contractIds = contractIds; }
  if (eventIds.length > 0) { where.push('event_id IN {eventIds:Array(UInt16)}'); params.eventIds = eventIds; }
  if (fromBlock !== undefined) { where.push('block_number >= {fromBlock:UInt64}'); params.fromBlock = String(fromBlock); }
  if (toBlock !== undefined) { where.push('block_number <= {toBlock:UInt64}'); params.toBlock = String(toBlock); }

  const expr = aggregateExpression(op, arg, field, (a) => {
    params.arg = a;
    return 'sum(toUInt256OrZero(JSONExtractString(args, {arg:String})))';
  }, (names) => {
    // uniqExact rather than uniq: an approximate count shown as a total is the
    // failure this whole exercise is about.
    const parts = names.map((a, i) => {
      params[`darg${i}`] = a;
      return `JSONExtractString(args, {darg${i}:String})`;
    });
    return `uniqExact(${parts.join(', ')})`;
  });
  const carried = op === 'sum'
    ? ', countIf(JSONHas(args, {arg:String})) AS with_arg'
    : '';

  let group = groupBy === 'event' ? 'event_id' : groupBy === 'contract' ? 'contract_id' : null;
  if (groupArg) { params.groupArg = groupArg; group = 'JSONExtractString(args, {groupArg:String})'; }
  // No FINAL: the writer keeps one copy of each event, so no reader has to
  // clean up after it. See the note on the event query above.
  const result = await ch.query({
    query: `SELECT ${group ? `${group} AS key, ` : ''}${expr} AS value${carried}
              FROM event ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
             ${group ? `GROUP BY ${group} ORDER BY value DESC` : ''}`,
    query_params: params,
    format: 'JSONEachRow',
  });
  return result.json();
}

// --- blocks and transactions ------------------------------------------------

/// Whether the block table has the base fee and size (migration 017).
async function hasBlockDetails() {
  const { rows } = await db().query(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'block' AND column_name IN ('base_fee_per_gas', 'size')`,
  );
  return rows[0]?.n === 2;
}

/**
 * The newest blocks, a page at a time, with what the block list shows: base
 * fee, size, and the fees their transactions paid.
 *
 * The fees are summed from the page's own transactions -- fifty blocks' worth,
 * found by the index the transaction table already has -- rather than kept as
 * a column that would have to be rewritten whenever a receipt arrives late.
 */
export async function getBlocks({ limit = 1000, cursor } = {}) {
  const details = await hasBlockDetails();
  const params = [];
  let where = '';
  if (cursor && cursor.number !== undefined) {
    params.push(String(cursor.number));
    where = `WHERE number < $1::BIGINT`;
  }
  params.push(Math.min(Number(limit) || 1000, 10000));
  const { rows } = await db().query(
    `SELECT number, hash, parent_hash, block_time, miner, gas_used, gas_limit, transaction_count
            ${details ? ', base_fee_per_gas::text AS base_fee, size' : ''}
       FROM block ${where} ORDER BY number DESC LIMIT $${params.length}`,
    params,
  );
  const fees = new Map();
  if (rows.length > 0) {
    const { rows: sums } = await db().query(
      `SELECT block_number, sum(gas_used::numeric * gas_price)::text AS fees, count(*)::int AS stored,
              count(*) FILTER (WHERE gas_used IS NULL OR gas_price IS NULL)::int AS unknown
         FROM transaction WHERE block_number = ANY($1::bigint[])
        GROUP BY block_number`,
      [rows.map((row) => String(row.number))],
    );
    for (const row of sums) fees.set(String(row.block_number), row);
  }
  return rows.map((row) => {
    const fee = fees.get(String(row.number));
    return {
      number: String(row.number),
      hash: toHex(row.hash),
      parentHash: toHex(row.parent_hash),
      // Seconds, as the chain reports it and as every screen reads it.
      timestamp: String(Math.floor(row.block_time.getTime() / 1000)),
      miner: toHex(row.miner),
      gasUsed: String(row.gas_used),
      gasLimit: String(row.gas_limit),
      transactionCount: Number(row.transaction_count),
      baseFeePerGas: row.base_fee ?? null,
      size: row.size === null || row.size === undefined ? null : Number(row.size),
      // Null when a transaction or its receipt is not stored, rather than a sum
      // that silently leaves it out. A block with no transactions paid nothing.
      feesWei: Number(row.transaction_count) === 0 ? '0'
        : fee && fee.unknown === 0 && fee.stored === Number(row.transaction_count) ? (fee.fees ?? '0') : null,
    };
  });
}

/**
 * What the block page shows about one block beyond its header, when the store
 * holds it: its fees, how its transactions break down by method and outcome,
 * how many contract payments and FileTrust events it holds, and when the block
 * before it was made.
 *
 * Null when the store has no row for the block -- older than the index, or no
 * store -- which the page reads as "ask the chain", not as an empty block.
 */
export async function getBlockDetail(number) {
  if (!(await dbReady())) return null;
  if (!/^\d+$/.test(String(number ?? ''))) return null;
  const n = String(number);
  const { rows: [block] } = await db().query(
    'SELECT number, transaction_count FROM block WHERE number = $1', [n],
  );
  if (!block) return null;

  const [{ rows: methods }, { rows: [previous] }, internalCount, eventCount] = await Promise.all([
    db().query(
      `SELECT CASE WHEN to_addr IS NULL THEN 'create'
                   WHEN length(input) >= 4 THEN encode(substring(input from 1 for 4), 'hex')
                   ELSE 'transfer' END AS method,
              count(*)::int AS n,
              count(*) FILTER (WHERE status = 0)::int AS failed,
              coalesce(sum(gas_used::numeric * gas_price), 0)::text AS fees,
              count(*) FILTER (WHERE gas_used IS NULL OR gas_price IS NULL)::int AS unknown
         FROM transaction WHERE block_number = $1
        GROUP BY 1 ORDER BY n DESC, 1`,
      [n],
    ),
    db().query('SELECT block_time FROM block WHERE number = $1', [String(BigInt(n) - 1n)]),
    // Null for a block whose payments were never read: an empty count there
    // would say "none" where the truth is "not looked at".
    blockTraced(n).then((traced) => (traced
      ? db().query('SELECT count(*)::int AS n FROM internal_transfer WHERE block_number = $1', [n])
        .then((r) => r.rows[0].n)
      : null)),
    countEventsInBlock(n),
  ]);

  const stored = methods.reduce((sum, m) => sum + m.n, 0);
  const unknown = methods.reduce((sum, m) => sum + m.unknown, 0);
  return {
    number: n,
    transactionCount: Number(block.transaction_count),
    // Every transaction of the block is in the store, so the breakdown is the
    // whole block rather than part of it.
    complete: stored === Number(block.transaction_count),
    failedCount: methods.reduce((sum, m) => sum + m.failed, 0),
    feesWei: unknown === 0 && stored === Number(block.transaction_count)
      ? methods.reduce((sum, m) => sum + BigInt(m.fees), 0n).toString()
      : null,
    methods: methods.map((m) => ({
      method: m.method === 'create' || m.method === 'transfer' ? m.method : `0x${m.method}`,
      count: m.n,
      failed: m.failed,
    })),
    internalCount,
    eventCount,
    previousTimestamp: previous ? String(Math.floor(previous.block_time.getTime() / 1000)) : null,
  };
}

async function countEventsInBlock(n) {
  const ch = await eventClickHouse();
  if (ch) {
    const result = await ch.query({
      query: 'SELECT count() AS n FROM event WHERE block_number = {n:UInt64}',
      query_params: { n },
      format: 'JSONEachRow',
    });
    const [row] = await result.json();
    return Number(row?.n ?? 0);
  }
  const { rows } = await db().query('SELECT count(*)::int AS n FROM event WHERE block_number = $1', [n]);
  return rows[0].n;
}

/// Whether one block's contract payments were read: inside the traced range
/// and not left behind as a gap to try again.
async function blockTraced(n) {
  if (!(await hasInternalTransfers())) return false;
  const { rows } = await db().query(
    `SELECT EXISTS (SELECT 1 FROM internal_trace_state
                     WHERE id = 1 AND supported AND $1::BIGINT BETWEEN traced_from AND traced_to)
        AND NOT EXISTS (SELECT 1 FROM internal_trace_gap WHERE block_number = $1::BIGINT) AS traced`,
    [n],
  );
  return rows[0]?.traced === true;
}

/// One block's transactions in the order the block holds them, a page at a time.
export async function getBlockTransactions(number, { limit = 50, cursor } = {}) {
  if (!(await dbReady())) return null;
  if (!/^\d+$/.test(String(number ?? ''))) return null;
  const { rows: [block] } = await db().query('SELECT 1 FROM block WHERE number = $1', [String(number)]);
  if (!block) return null;
  const params = [String(number)];
  let seek = '';
  if (cursor && cursor.transactionIndex !== undefined) {
    params.push(Number(cursor.transactionIndex));
    seek = `AND tx_index > $${params.length}`;
  }
  params.push(Math.min(Number(limit) || 50, 500));
  const { rows } = await db().query(
    `SELECT hash, block_number, block_time, tx_index, from_addr, to_addr, value_wei, gas, gas_price,
            status, gas_used, substring(input from 1 for 4) AS selector
       FROM transaction WHERE block_number = $1 ${seek}
      ORDER BY tx_index LIMIT $${params.length}`,
    params,
  );
  return rows.map((row) => ({
    hash: toHex(row.hash),
    blockNumber: String(row.block_number),
    blockTimestamp: String(Math.floor(row.block_time.getTime() / 1000)),
    transactionIndex: Number(row.tx_index),
    from: toHex(row.from_addr),
    to: toHex(row.to_addr) ?? null,
    value: String(row.value_wei),
    gas: String(row.gas),
    gasPrice: row.gas_price === null ? undefined : String(row.gas_price),
    status: row.status === null ? null : Number(row.status),
    gasUsed: row.gas_used === null ? null : String(row.gas_used),
    selector: row.selector && row.selector.length === 4 ? toHex(row.selector) : null,
  }));
}

export async function getTransactions({ limit = 1000 } = {}) {
  const { rows } = await db().query(
    `SELECT hash, block_number, block_hash, block_time, tx_index, from_addr, to_addr,
            value_wei, gas, gas_price, input
       FROM transaction ORDER BY block_number DESC, tx_index DESC LIMIT $1`,
    [Math.min(Number(limit) || 1000, 10000)],
  );
  return rows.map((row) => ({
    hash: toHex(row.hash),
    blockNumber: String(row.block_number),
    blockHash: toHex(row.block_hash),
    blockTimestamp: String(Math.floor(row.block_time.getTime() / 1000)),
    transactionIndex: Number(row.tx_index),
    from: toHex(row.from_addr),
    to: toHex(row.to_addr) ?? null,
    value: String(row.value_wei),
    gas: String(row.gas),
    gasPrice: row.gas_price === null ? undefined : String(row.gas_price),
    input: toHex(row.input),
  }));
}

/**
 * Every transaction an address sent or received, newest first.
 *
 * The address screen used to answer this by downloading the last 250 whole
 * blocks over RPC and filtering them in the browser. That is wrong in three
 * ways at once: it only ever sees the most recent few minutes of a one-second
 * chain, it costs 250 parallel calls against the endpoint the network itself
 * depends on, and `Promise.all` over 250 calls fails entirely if any one of them
 * is slow -- which the screen reported as "Address not found or RPC
 * unavailable", for an address that was neither.
 *
 * Measured against a live chain: a keeper with nine indexed transactions between
 * blocks 364 and 603, on a chain at head 829, had six of them invisible. They
 * were in the store the whole time.
 *
 * `transaction_by_from` and `transaction_by_to` have existed since the first
 * migration and are exactly (address, block_number DESC) -- the order this wants
 * -- so each side is an indexed seek. They are read as two seeks unioned rather
 * than one `OR`, because `OR` across two different columns cannot use either
 * index and degrades to a scan of the table at exactly the size where that
 * matters.
 */
export async function getAddressTransactions(address, { limit = 50, cursor, direction = 'all' } = {}) {
  if (!(await dbReady())) return null;
  const key = toBytes(address);
  if (!key) return null;

  const take = Math.min(Number(limit) || 50, 500);
  const params = [key];
  // Keyset, not OFFSET: page five hundred costs what page one costs. The cursor
  // is (block, index) because a block holds many transactions and block alone
  // would either repeat the rest of a block or skip it.
  let seek = '';
  if (cursor && cursor.blockNumber !== undefined) {
    params.push(String(cursor.blockNumber), Number(cursor.transactionIndex ?? 0));
    seek = `AND (block_number, tx_index) < ($${params.length - 1}::BIGINT, $${params.length}::INTEGER)`;
  }
  params.push(take);
  const lim = `$${params.length}`;

  // The first four bytes of the input name the function called, which is what
  // the list shows as the method. The rest of the input is the transaction
  // screen's business and is not sent for every row.
  const columns = `hash, block_number, block_time, tx_index, from_addr, to_addr,
                 value_wei, gas, gas_price, status, gas_used,
                 substring(input from 1 for 4) AS selector`;
  // Sent, received, or both. Each side alone is one seek, and "both" is the two
  // seeks unioned, for the reason given above.
  const sides = [];
  if (direction !== 'in') {
    sides.push(`(SELECT ${columns} FROM transaction WHERE from_addr = $1 ${seek}
                 ORDER BY block_number DESC, tx_index DESC LIMIT ${lim})`);
  }
  if (direction !== 'out') {
    sides.push(`(SELECT ${columns} FROM transaction WHERE to_addr = $1 ${seek}
                 ORDER BY block_number DESC, tx_index DESC LIMIT ${lim})`);
  }

  const { rows } = await db().query(
    `SELECT * FROM (${sides.join(' UNION ALL ')}) sent_or_received
      ORDER BY block_number DESC, tx_index DESC
      LIMIT ${lim}`,
    params,
  );

  // A transaction an address sent to itself matches both seeks. Deduplicated
  // here rather than with UNION, which would have to sort the whole result to
  // find duplicates that are almost never there.
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const hash = toHex(row.hash);
    if (seen.has(hash)) continue;
    seen.add(hash);
    unique.push({
      hash,
      blockNumber: String(row.block_number),
      blockTimestamp: String(Math.floor(row.block_time.getTime() / 1000)),
      transactionIndex: Number(row.tx_index),
      from: toHex(row.from_addr),
      to: toHex(row.to_addr) ?? null,
      value: String(row.value_wei),
      gas: String(row.gas),
      gasPrice: row.gas_price === null ? undefined : String(row.gas_price),
      status: row.status === null ? null : Number(row.status),
      gasUsed: row.gas_used === null ? null : String(row.gas_used),
      selector: row.selector && row.selector.length === 4 ? toHex(row.selector) : null,
    });
  }
  return unique;
}

/// How far an address's counts go before the screen says "more than".
const COUNT_CAP = 100000;

/// Whether the store has the contract-payment tables (migration 014).
async function hasInternalTransfers() {
  const { rows } = await db().query(
    `SELECT to_regclass('internal_transfer') IS NOT NULL AND to_regclass('internal_trace_state') IS NOT NULL
        AND to_regclass('internal_trace_gap') IS NOT NULL AS ready`,
  );
  return rows[0]?.ready === true;
}

function internalRow(row) {
  return {
    transactionHash: toHex(row.tx_hash),
    traceIndex: Number(row.trace_index),
    blockNumber: String(row.block_number),
    blockTimestamp: String(Math.floor(row.block_time.getTime() / 1000)),
    transactionIndex: Number(row.tx_index),
    from: toHex(row.from_addr),
    to: toHex(row.to_addr),
    value: String(row.value_wei),
    callType: row.call_type,
  };
}

/**
 * How far contract payments have been read, so a screen can say what an empty
 * list means: none paid, not checked yet, or a node that cannot tell.
 */
async function internalCoverage() {
  if (!(await hasInternalTransfers())) return { available: false, reason: 'not-migrated' };
  const [{ rows: state }, { rows: gaps }, { rows: first }] = await Promise.all([
    db().query('SELECT supported, mode, traced_from, traced_to FROM internal_trace_state WHERE id = 1'),
    db().query('SELECT count(*)::int AS n FROM internal_trace_gap'),
    db().query('SELECT min(block_number) AS b FROM transaction'),
  ]);
  if (state.length === 0) return { available: false, reason: 'not-traced' };
  const s = state[0];
  if (!s.supported) return { available: false, reason: 'unsupported' };
  const firstIndexed = first[0]?.b === null || first[0]?.b === undefined ? null : String(first[0].b);
  const tracedFrom = s.traced_from === null ? null : String(s.traced_from);
  return {
    available: true,
    mode: s.mode,
    tracedFrom,
    tracedTo: s.traced_to === null ? null : String(s.traced_to),
    // Everything the store holds has been looked at once the range reaches
    // back past its first transaction.
    complete: tracedFrom !== null && (firstIndexed === null || BigInt(tracedFrom) <= BigInt(firstIndexed)),
    untracedBlocks: gaps[0]?.n ?? 0,
  };
}

/**
 * FTU contracts paid to or took from one address inside transactions, newest
 * first. Same shape of query as the transaction list: one seek per side.
 */
export async function getAddressInternalTransfers(address, { limit = 50, cursor, direction = 'all' } = {}) {
  if (!(await dbReady())) return null;
  if (!(await hasInternalTransfers())) return null;
  const key = toBytes(address);
  if (!key) return null;

  const take = Math.min(Number(limit) || 50, 500);
  const params = [key];
  let seek = '';
  if (cursor && cursor.blockNumber !== undefined) {
    params.push(String(cursor.blockNumber), Number(cursor.transactionIndex ?? 0), Number(cursor.traceIndex ?? 0));
    seek = `AND (block_number, tx_index, trace_index) < ($${params.length - 2}::BIGINT, $${params.length - 1}::INTEGER, $${params.length}::INTEGER)`;
  }
  params.push(take);
  const lim = `$${params.length}`;
  const columns = 'tx_hash, trace_index, block_number, block_time, tx_index, from_addr, to_addr, value_wei, call_type';
  const sides = [];
  if (direction !== 'in') {
    sides.push(`(SELECT ${columns} FROM internal_transfer WHERE from_addr = $1 ${seek}
                 ORDER BY block_number DESC, tx_index DESC, trace_index DESC LIMIT ${lim})`);
  }
  if (direction !== 'out') {
    sides.push(`(SELECT ${columns} FROM internal_transfer WHERE to_addr = $1 ${seek}
                 ORDER BY block_number DESC, tx_index DESC, trace_index DESC LIMIT ${lim})`);
  }
  const { rows } = await db().query(
    `SELECT * FROM (${sides.join(' UNION ALL ')}) paid
      ORDER BY block_number DESC, tx_index DESC, trace_index DESC
      LIMIT ${lim}`,
    params,
  );
  const seen = new Set();
  const out = [];
  for (const row of rows) {
    const id = `${toHex(row.tx_hash)}:${row.trace_index}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(internalRow(row));
  }
  return out;
}

/// The FTU contracts moved inside one transaction, in the order they ran, and
/// whether its block has been traced at all.
/// The contract payments inside one block's transactions, in block order.
export async function getBlockInternalTransfers(number, { limit = 50, cursor } = {}) {
  if (!(await dbReady())) return null;
  if (!/^\d+$/.test(String(number ?? ''))) return null;
  // Null, not an empty page, for a block nobody traced.
  if (!(await blockTraced(String(number)))) return null;
  const params = [String(number)];
  let seek = '';
  if (cursor && cursor.transactionIndex !== undefined) {
    params.push(Number(cursor.transactionIndex), Number(cursor.traceIndex ?? 0));
    seek = `AND (tx_index, trace_index) > ($${params.length - 1}::INTEGER, $${params.length}::INTEGER)`;
  }
  params.push(Math.min(Number(limit) || 50, 500));
  const { rows } = await db().query(
    `SELECT tx_hash, trace_index, block_number, block_time, tx_index, from_addr, to_addr, value_wei, call_type
       FROM internal_transfer WHERE block_number = $1 ${seek}
      ORDER BY tx_index, trace_index LIMIT $${params.length}`,
    params,
  );
  return rows.map(internalRow);
}

/// The addresses an event in this block is about, from whichever store holds
/// the log.
async function eventSubjectsInBlock(n) {
  const ch = await eventClickHouse();
  if (ch) {
    const result = await ch.query({
      query: `SELECT lower(subject_addr) AS addr, count() AS n FROM event
               WHERE block_number = {n:UInt64} AND subject_addr IS NOT NULL GROUP BY addr`,
      query_params: { n },
      format: 'JSONEachRow',
    });
    return (await result.json()).map((row) => ({ addr: `0x${row.addr}`, n: Number(row.n) }));
  }
  const { rows } = await db().query(
    `SELECT encode(subject_addr, 'hex') AS addr, count(*)::int AS n FROM event
      WHERE block_number = $1 AND subject_addr IS NOT NULL GROUP BY subject_addr`,
    [n],
  );
  return rows.map((row) => ({ addr: `0x${row.addr}`, n: row.n }));
}

/**
 * Every address that took part in one block: who sent or received its
 * transactions, who paid or was paid by a contract inside them, and who its
 * FileTrust events are about -- with whether each is a Guardian or a Vault
 * Keeper. Busiest first, at most a thousand.
 */
export async function getBlockParticipants(number) {
  if (!(await dbReady())) return null;
  if (!/^\d+$/.test(String(number ?? ''))) return null;
  const n = String(number);
  const { rows: [block] } = await db().query('SELECT 1 FROM block WHERE number = $1', [n]);
  if (!block) return null;

  const internal = await hasInternalTransfers();
  const [{ rows: txs }, payments, subjects] = await Promise.all([
    db().query(
      `SELECT encode(addr, 'hex') AS addr, sum(sent)::int AS sent, sum(received)::int AS received FROM (
         SELECT from_addr AS addr, 1 AS sent, 0 AS received FROM transaction WHERE block_number = $1
         UNION ALL
         SELECT to_addr, 0, 1 FROM transaction WHERE block_number = $1 AND to_addr IS NOT NULL
       ) t GROUP BY addr`,
      [n],
    ),
    internal
      ? db().query(
        `SELECT encode(addr, 'hex') AS addr, sum(paid)::int AS paid, sum(got)::int AS got FROM (
           SELECT from_addr AS addr, 1 AS paid, 0 AS got FROM internal_transfer WHERE block_number = $1
           UNION ALL
           SELECT to_addr, 0, 1 FROM internal_transfer WHERE block_number = $1
         ) p GROUP BY addr`,
        [n],
      ).then((r) => r.rows)
      : [],
    eventSubjectsInBlock(n),
  ]);

  const byAddress = new Map();
  const entry = (hex) => {
    const address = `0x${String(hex).replace(/^0x/, '').toLowerCase()}`;
    if (!byAddress.has(address)) {
      byAddress.set(address, {
        address, transactionsSent: 0, transactionsReceived: 0, paymentsOut: 0, paymentsIn: 0, events: 0,
      });
    }
    return byAddress.get(address);
  };
  for (const row of txs) { const e = entry(row.addr); e.transactionsSent += row.sent; e.transactionsReceived += row.received; }
  for (const row of payments) { const e = entry(row.addr); e.paymentsOut += row.paid; e.paymentsIn += row.got; }
  for (const row of subjects) entry(row.addr).events += row.n;

  const list = [...byAddress.values()]
    .map((e) => ({ ...e, total: e.transactionsSent + e.transactionsReceived + e.paymentsOut + e.paymentsIn + e.events }))
    .sort((a, b) => b.total - a.total || (a.address < b.address ? -1 : 1))
    .slice(0, 1000);

  const keys = list.map((e) => toBytes(e.address));
  const [{ rows: guardians }, { rows: keepers }] = await Promise.all([
    db().query("SELECT encode(address, 'hex') AS a FROM guardian WHERE address = ANY($1::bytea[])", [keys]),
    db().query("SELECT encode(address, 'hex') AS a FROM vault_keeper WHERE address = ANY($1::bytea[])", [keys]),
  ]);
  const isGuardian = new Set(guardians.map((r) => `0x${r.a}`));
  const isKeeper = new Set(keepers.map((r) => `0x${r.a}`));
  return list.map((e) => ({
    address: e.address,
    transactionsSent: e.transactionsSent,
    transactionsReceived: e.transactionsReceived,
    paymentsOut: e.paymentsOut,
    paymentsIn: e.paymentsIn,
    events: e.events,
    guardian: isGuardian.has(e.address),
    vaultKeeper: isKeeper.has(e.address),
  }));
}

export async function getTransactionInternalTransfers(hash) {
  if (!(await dbReady())) return null;
  const key = toBytes(hash);
  if (!key) return null;
  const coverage = await internalCoverage();
  if (!coverage.available) return { coverage, traced: false, rows: [] };

  const [{ rows }, { rows: tx }] = await Promise.all([
    db().query(
      `SELECT tx_hash, trace_index, block_number, block_time, tx_index, from_addr, to_addr, value_wei, call_type
         FROM internal_transfer WHERE tx_hash = $1 ORDER BY trace_index`,
      [key],
    ),
    db().query('SELECT block_number FROM transaction WHERE hash = $1', [key]),
  ]);
  let traced = false;
  if (tx.length > 0) {
    const block = BigInt(tx[0].block_number);
    const { rows: gap } = await db().query('SELECT 1 FROM internal_trace_gap WHERE block_number = $1', [String(block)]);
    traced = coverage.tracedFrom !== null && coverage.tracedTo !== null
      && block >= BigInt(coverage.tracedFrom) && block <= BigInt(coverage.tracedTo)
      && gap.length === 0;
  }
  return { coverage, traced, rows: rows.map(internalRow) };
}

/**
 * The overview of one address: how many transactions, when it was first and
 * last active, and who first sent it FTU.
 *
 * Counts are index-only scans on the two transaction indexes. "Funded by" is the
 * earliest incoming payment of any kind -- a transaction or a contract paying out
 * -- because a guardian's first FTU may well have come from a contract.
 */
export async function getAddressSummary(address) {
  if (!(await dbReady())) return null;
  const key = toBytes(address);
  if (!key) return null;

  const [{ rows: counts }, { rows: firstTx }, { rows: lastTx }, { rows: fundTx }] = await Promise.all([
    // Counted up to a cap, so a contract called a million times costs a bounded
    // scan rather than a count of its whole history; past the cap the screen
    // says "more than".
    db().query(
      `SELECT (SELECT count(*) FROM (SELECT 1 FROM transaction WHERE from_addr = $1 LIMIT $2) s)::bigint AS sent,
              (SELECT count(*) FROM (SELECT 1 FROM transaction WHERE to_addr = $1 LIMIT $2) r)::bigint AS received,
              (SELECT count(*) FROM (SELECT 1 FROM transaction WHERE from_addr = $1 AND to_addr = $1 LIMIT $2) b)::bigint AS self`,
      [key, COUNT_CAP + 1],
    ),
    db().query(
      `SELECT * FROM (
         (SELECT hash, block_number, block_time, tx_index FROM transaction WHERE from_addr = $1
           ORDER BY block_number ASC, tx_index ASC LIMIT 1)
         UNION ALL
         (SELECT hash, block_number, block_time, tx_index FROM transaction WHERE to_addr = $1
           ORDER BY block_number ASC, tx_index ASC LIMIT 1)
       ) t ORDER BY block_number ASC, tx_index ASC LIMIT 1`,
      [key],
    ),
    db().query(
      `SELECT * FROM (
         (SELECT hash, block_number, block_time, tx_index FROM transaction WHERE from_addr = $1
           ORDER BY block_number DESC, tx_index DESC LIMIT 1)
         UNION ALL
         (SELECT hash, block_number, block_time, tx_index FROM transaction WHERE to_addr = $1
           ORDER BY block_number DESC, tx_index DESC LIMIT 1)
       ) t ORDER BY block_number DESC, tx_index DESC LIMIT 1`,
      [key],
    ),
    // Among the first thousand incoming transactions: a wallet is funded early,
    // and a contract called with no value a million times must not cost a scan
    // of every call to find that none of them paid.
    db().query(
      `SELECT * FROM (
         SELECT hash, block_number, block_time, tx_index, from_addr, value_wei FROM transaction
          WHERE to_addr = $1 ORDER BY block_number ASC, tx_index ASC LIMIT 1000
       ) first_incoming WHERE value_wei > 0 ORDER BY block_number ASC, tx_index ASC LIMIT 1`,
      [key],
    ),
  ]);

  const coverage = await internalCoverage();
  let internal = null;
  let fundInternal = [];
  if (coverage.available) {
    const [{ rows: ic }, { rows: fi }] = await Promise.all([
      db().query(
        `SELECT (SELECT count(*) FROM (SELECT 1 FROM internal_transfer WHERE from_addr = $1 LIMIT $2) s)::bigint AS sent,
                (SELECT count(*) FROM (SELECT 1 FROM internal_transfer WHERE to_addr = $1 LIMIT $2) r)::bigint AS received`,
        [key, COUNT_CAP + 1],
      ),
      db().query(
        `SELECT tx_hash, block_number, block_time, tx_index, from_addr, value_wei FROM internal_transfer
          WHERE to_addr = $1 ORDER BY block_number ASC, tx_index ASC, trace_index ASC LIMIT 1`,
        [key],
      ),
    ]);
    internal = {
      sent: String(ic[0].sent),
      received: String(ic[0].received),
      capped: BigInt(ic[0].sent) > BigInt(COUNT_CAP) || BigInt(ic[0].received) > BigInt(COUNT_CAP),
    };
    fundInternal = fi;
  }

  const point = (row) => (row ? {
    hash: toHex(row.hash ?? row.tx_hash),
    blockNumber: String(row.block_number),
    blockTimestamp: String(Math.floor(row.block_time.getTime() / 1000)),
  } : null);

  // The earlier of the two kinds of incoming payment.
  const candidates = [
    fundTx[0] && { ...fundTx[0], kind: 'transaction' },
    fundInternal[0] && { ...fundInternal[0], kind: 'internal' },
  ].filter(Boolean).sort((a, b) => {
    const byBlock = Number(BigInt(a.block_number) - BigInt(b.block_number));
    return byBlock !== 0 ? byBlock : Number(a.tx_index) - Number(b.tx_index);
  });
  const funded = candidates[0];

  const c = counts[0];
  const capped = [c.sent, c.received, c.self].some((n) => BigInt(n) > BigInt(COUNT_CAP));
  return {
    transactions: {
      sent: String(c.sent),
      received: String(c.received),
      total: String(BigInt(c.sent) + BigInt(c.received) - BigInt(c.self)),
      // True when a count stopped at the cap: the real figure is larger.
      capped,
    },
    firstSeen: point(firstTx[0]),
    lastSeen: point(lastTx[0]),
    fundedBy: funded ? {
      from: toHex(funded.from_addr),
      value: String(funded.value_wei),
      kind: funded.kind,
      ...point(funded),
    } : null,
    internal,
    internalCoverage: coverage,
  };
}

/**
 * One transaction and the events it emitted, from the index.
 *
 * The transaction screen was the last one still asking the chain for its main
 * answer. That works and is fast against a local node, and it also means every
 * reader's page load lands on the RPC endpoint the network itself depends on --
 * the thing the rest of this was built to avoid. The store already held the
 * call; migration 012 added what the receipt says about its result, so the whole
 * page can be served from here.
 *
 * Null when the transaction is not indexed, which is a real and ordinary case:
 * one newer than the last indexer run, or older than whatever retention keeps.
 * The caller falls back to the chain for those rather than showing nothing.
 *
 * `status` may be null on a row indexed before receipts were collected. That is
 * different from a failed transaction and the caller has to keep them apart.
 */
export async function getTransactionDetail(hash) {
  if (!(await dbReady())) return null;
  const key = toBytes(hash);
  if (!key) return null;

  const { rows } = await db().query(
    `SELECT hash, block_number, block_hash, block_time, tx_index, from_addr, to_addr,
            value_wei, gas, gas_price, input, status, gas_used
       FROM transaction WHERE hash = $1`,
    [key],
  );
  if (rows.length === 0) return null;
  const row = rows[0];

  // The decoded events of this transaction, in log order. They are already in
  // the event table -- this is the filter that was missing rather than new work.
  const parties = [row.from_addr, row.to_addr].filter(Boolean);
  const details = await hasBlockDetails();
  const [events, { rows: [neighbours] }, { rows: guardians }, { rows: keepers }, { rows: [block] }] = await Promise.all([
    getEvents({ transactionHash: hash, limit: 1000 }),
    // The sender's transactions either side of this one, for the page's
    // previous / next arrows.
    db().query(
      `SELECT (SELECT hash FROM transaction
                WHERE from_addr = $1 AND (block_number, tx_index) < ($2::BIGINT, $3::INTEGER)
                ORDER BY block_number DESC, tx_index DESC LIMIT 1) AS previous,
              (SELECT hash FROM transaction
                WHERE from_addr = $1 AND (block_number, tx_index) > ($2::BIGINT, $3::INTEGER)
                ORDER BY block_number, tx_index LIMIT 1) AS next`,
      [row.from_addr, String(row.block_number), Number(row.tx_index)],
    ),
    db().query("SELECT encode(address, 'hex') AS a FROM guardian WHERE address = ANY($1::bytea[])", [parties]),
    db().query("SELECT encode(address, 'hex') AS a FROM vault_keeper WHERE address = ANY($1::bytea[])", [parties]),
    details
      ? db().query('SELECT base_fee_per_gas::text AS base_fee FROM block WHERE number = $1', [String(row.block_number)])
      : { rows: [] },
  ]);
  const roleOf = (bytes) => {
    if (!bytes) return [];
    const hex = Buffer.from(bytes).toString('hex');
    return [
      ...(guardians.some((g) => g.a === hex) ? ['guardian'] : []),
      ...(keepers.some((k) => k.a === hex) ? ['vault-keeper'] : []),
    ];
  };

  return {
    hash: toHex(row.hash),
    blockNumber: String(row.block_number),
    blockHash: toHex(row.block_hash),
    blockTimestamp: String(Math.floor(row.block_time.getTime() / 1000)),
    transactionIndex: Number(row.tx_index),
    from: toHex(row.from_addr),
    to: toHex(row.to_addr) ?? null,
    value: String(row.value_wei),
    gas: String(row.gas),
    gasPrice: row.gas_price === null ? undefined : String(row.gas_price),
    input: toHex(row.input),
    status: row.status === null ? null : Number(row.status),
    gasUsed: row.gas_used === null ? null : String(row.gas_used),
    events: events.slice().reverse(),
    baseFeePerGas: block?.base_fee ?? null,
    senderPrevious: neighbours?.previous ? toHex(neighbours.previous) : null,
    senderNext: neighbours?.next ? toHex(neighbours.next) : null,
    roles: { from: roleOf(row.from_addr), to: roleOf(row.to_addr) },
  };
}

// --- entities ---------------------------------------------------------------

/**
 * Vault keeper profiles as rows, newest-reputation first.
 *
 * This is the query that replaces a chain of contract reads. Ten keepers cost
 * 118 requests read a field at a time, and the cost followed the number of
 * keepers however well it was batched; here it follows the size of the page,
 * and ten thousand keepers cost the same as ten.
 *
 * Returns null rather than an empty list when the projection has not run, so a
 * screen can tell "no keepers" from "nothing has been indexed yet" and fall back
 * to the chain instead of reporting an empty network.
 */
async function filePoliciesProjected() {
  const { rows } = await db().query(
    'SELECT value FROM counter WHERE name = $1', ['projection:file_policy'],
  );
  return rows.length > 0;
}

async function getEntityRows(table, { limit = 500, cursor, activeOnly = false } = {}) {
  if (!(await dbReady())) return null;

  const { rows: [{ n }] } = await db().query(`SELECT count(*)::int AS n FROM ${table}`);
  if (n === 0) return table === 'file_policy' && await filePoliciesProjected() ? [] : null;

  const where = [];
  const params = [];
  if (activeOnly) { params.push(true); where.push(`active = $${params.length}`); }
  // Keyset on the primary key, so paging deep costs the same as paging shallow.
  if (cursor) { params.push(toBytes(cursor)); where.push(`address > $${params.length}`); }
  params.push(Math.min(Number(limit) || 500, 5000));

  const { rows } = await db().query(
    `SELECT profile FROM ${table}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY address
      LIMIT $${params.length}`,
    params,
  );
  // The profile is stored in the shape the screen reads, numbers as digits, so
  // it needs no translation on the way out.
  return rows.map((r) => r.profile);
}

export const getVaultKeepers = (options) => getEntityRows('vault_keeper', options);
export const getGuardians = (options) => getEntityRows('guardian', options);
export const getFilePolicies = (options) => getEntityRows('file_policy', options);
export const getPartitions = (options) => getEntityRows('partition_record', options);
export const getSectors = (options) => getEntityRows('sector_record', options);

/**
 * How many partitions there are, split the way the storage screens split them.
 *
 * Not a count of events. "Active" is a set difference between registration and
 * deactivation, resolved on the contract and stored as a boolean, so this is one
 * grouped count over 129 rows rather than a replay of every partition event ever
 * emitted. Kind 1 is data, kind 2 is capacity, per the contract's constants.
 */
/// Sector counts, the same shape and for the same reason as partitions.
export async function getSectorCounts() {
  if (!(await dbReady())) return null;
  const [{ rows }, { rows: [parents] }] = await Promise.all([
    db().query('SELECT active, count(*)::int AS n FROM sector_record GROUP BY active'),
    db().query('SELECT count(*)::int AS n FROM vault_keeper'),
  ]);

  // Empty is a real answer here, but only once something has looked.
  //
  // Sectors are listed through their keeper, so keepers having been projected is
  // the evidence that the search happened. Without that test an empty table
  // would read as "this network has no sectors" when it means "nothing has
  // asked yet" -- the same distinction every other reader in this file makes,
  // and one that matters more for a count than for a list, because a zero is
  // displayed as a fact rather than as an empty page.
  if (rows.length === 0 && parents.n === 0) return null;
  const total = (pred) => rows.filter(pred).reduce((sum, r) => sum + r.n, 0);

  // The storage screen's risk figures, by the rule its health badge uses:
  // inactive first, then expired (an expiration in the past), then faulted
  // (a missed proof). "Expiring soon" looks at every sector, active or not,
  // as the screen always did. Health moves with the clock, so it is worked out
  // here on read rather than stored.
  const { rows: [risk] } = await db().query(
    `SELECT coalesce(sum(sector_blocks) FILTER (WHERE active), 0)::text AS active_blocks,
            count(*) FILTER (
              WHERE active AND expiration IS NOT NULL AND expiration <= now()
            )::int AS expired,
            count(*) FILTER (
              WHERE active AND NOT (expiration IS NOT NULL AND expiration <= now())
                AND missed_proofs > 0
            )::int AS faulted,
            count(*) FILTER (
              WHERE expiration IS NOT NULL
                AND expiration > now() AND expiration <= now() + interval '7 days'
            )::int AS expiring_soon
       FROM sector_record`,
  );
  return {
    active: total((r) => r.active),
    inactive: total((r) => !r.active),
    total: total(() => true),
    activeBlocks: risk.active_blocks,
    expired: risk.expired,
    faulted: risk.faulted,
    expiringSoon: risk.expiring_soon,
  };
}

export async function getPartitionCounts() {
  if (!(await dbReady())) return null;
  const { rows } = await db().query(
    'SELECT active, kind, count(*)::int AS n FROM partition_record GROUP BY active, kind',
  );
  if (rows.length === 0) return null;

  const total = (pred) => rows.filter(pred).reduce((sum, r) => sum + r.n, 0);
  return {
    active: total((r) => r.active),
    inactive: total((r) => !r.active),
    data: total((r) => r.active && Number(r.kind) === 1),
    capacity: total((r) => r.active && Number(r.kind) === 2),
    total: total(() => true),
  };
}

/// A profile field as a number: its digits, or zero for anything else -- the
/// same reading the screens give it (`toBigInt`, `positiveNumber`).
const profileDigits = (path) => `(CASE WHEN (${path}) ~ '^[0-9]+$' THEN (${path})::numeric ELSE 0 END)`;

/**
 * The network-wide figures the dashboard and the storage screen show, summed
 * and averaged here instead of in the browser.
 *
 * Both screens downloaded every Guardian and every vault keeper row to get them:
 * average service prices for the cycle cost cards, and capacity totals for the
 * storage cards. That is a whole table per visit, capped at 5,000 rows -- so past
 * 5,000 keepers the totals were not slow, they were wrong. These are the same
 * sums over the same projected profiles, by the same rules:
 *
 * - a price is averaged over the members that set one (above zero), and the
 *   count of those members is returned beside it;
 * - capacity is summed over all keepers for the declared total, and over
 *   active keepers with declared capacity for the rest; divergence is per
 *   keeper, so one keeper's mismatch cannot cancel another's.
 *
 * Each half is null when its table is empty, which means "not projected yet"
 * to the screen, the same as an empty entity list does.
 */
export async function getNetworkSummary() {
  if (!(await dbReady())) return null;
  const g = (field) => profileDigits(`profile->>'${field}'`);
  const c = (field) => profileDigits(`profile->'capacity'->>'${field}'`);
  const price = (expr, name) => `
        count(*) FILTER (WHERE ${expr} > 0)::int AS ${name}_n,
        coalesce(avg(${expr}) FILTER (WHERE ${expr} > 0), 0)::float8 AS ${name}_avg`;

  const [{ rows: [gp] }, { rows: [vk] }] = await Promise.all([
    db().query(
      `SELECT count(*)::int AS n,
              ${price(g('dkgMaterialSu'), 'dkg_material')},
              ${price(g('dkgShareKeySu'), 'dkg_share_key')},
              ${price(g('preBatchPartialSu'), 'pre_partial')}
         FROM guardian`,
    ),
    db().query(
      `WITH k AS (
         SELECT ${g('storageFee')} AS fee,
                (profile->'capacity'->>'active') = 'true' AS active,
                (profile->'capacity'->>'proofFresh') = 'true' AS fresh,
                ${c('declared')} AS declared,
                ${c('registeredFree')} AS reg_free,
                ${c('registeredData')} AS reg_data,
                ${c('provedFree')} AS proved_free,
                ${c('provedData')} AS proved_data,
                ${c('conservativeFree')} AS conservative_free
           FROM vault_keeper
       )
       SELECT count(*)::int AS n,
              ${price('fee', 'fee')},
              coalesce(sum(declared), 0)::text AS total_declared,
              coalesce(sum(declared) FILTER (WHERE active AND declared > 0), 0)::text AS active_declared,
              coalesce(sum(conservative_free) FILTER (WHERE active AND declared > 0), 0)::text AS active_conservative_free,
              coalesce(sum(reg_data) FILTER (WHERE active AND declared > 0), 0)::text AS active_registered_data,
              coalesce(sum(declared) FILTER (WHERE active AND declared > 0 AND fresh), 0)::text AS fresh_active_declared,
              coalesce(sum(abs(reg_free - proved_free) + abs(reg_data - proved_data))
                FILTER (WHERE active AND declared > 0), 0)::text AS active_divergence
         FROM k`,
    ),
  ]);

  const avg = (row, name) => ({ average: Number(row[`${name}_avg`]), count: row[`${name}_n`] });
  return {
    guardians: gp.n === 0 ? null : {
      count: gp.n,
      dkgMaterialSu: avg(gp, 'dkg_material'),
      dkgShareKeySu: avg(gp, 'dkg_share_key'),
      preBatchPartialSu: avg(gp, 'pre_partial'),
    },
    vaultKeepers: vk.n === 0 ? null : {
      count: vk.n,
      storageFee: avg(vk, 'fee'),
      // Bytes, as decimal strings: a fleet's capacity does not fit in a double.
      capacity: {
        totalCapacityBytes: vk.total_declared,
        activeDeclaredCapacityBytes: vk.active_declared,
        activeConservativeAvailableBytes: vk.active_conservative_free,
        activeRegisteredDataBytes: vk.active_registered_data,
        freshActiveProofCapacityBytes: vk.fresh_active_declared,
        activeCapacityDivergenceBytes: vk.active_divergence,
      },
    },
  };
}

/**
 * Guardians and vault keepers in leaderboard order, a page at a time.
 *
 * The rankings screen downloaded every row of both tables and sorted them in
 * the browser, which stops at the 5,000-row cap and grows with the network on
 * every visit. The score is a formula over columns the rows already carry, so
 * it is computed and sorted here, and the screen asks for thirty rows.
 *
 * The formulas are the screen's, unchanged:
 *   stake points = min(100, round(log10(whole FTU staked + 1) * 25))
 *   Guardian     = reputation + stake points + job success % + 50 if active
 *                  - min(200, disputes * 25), at least 0
 *   vault keeper = reputation + stake points + 50 if active
 *                  - 250 while suspended, at least 0
 * `round` is JavaScript's (halves up), so it is written as floor(x + 0.5).
 * Ties go to the higher reputation, then to the lower address -- the order the
 * screen's stable sort left them in, since it was handed the rows by address.
 *
 * `rank` is the place in the whole network, before any search: a search narrows
 * the rows shown, not the places they hold. The cursor is the last rank handed
 * out. Null when the table is empty, so the screen falls back to the chain.
 */
const STAKE_POINTS = `(CASE WHEN stake <= 0 THEN 0
  ELSE least(100, floor(log((floor(stake / 1000000000000000000) + 1)::float8) * 25 + 0.5)) END)`;

const RANK_SCORE = {
  guardian: `greatest(0,
      reputation + ${STAKE_POINTS}
      + (CASE WHEN completed + failed > 0
           THEN floor(completed::float8 / (completed + failed) * 100 + 0.5) ELSE 0 END)
      + (CASE WHEN active THEN 50 ELSE 0 END)
      - least(200, disputes * 25))`,
  vault_keeper: `greatest(0,
      reputation + ${STAKE_POINTS}
      + (CASE WHEN active THEN 50 ELSE 0 END)
      - (CASE WHEN ${profileDigits("profile->>'suspendedUntil'")} > extract(epoch FROM now())
           THEN 250 ELSE 0 END))`,
};

async function getRankedEntities(table, { limit = 30, cursor, search } = {}) {
  if (!(await dbReady())) return null;
  const { rows: [{ n }] } = await db().query(`SELECT count(*)::int AS n FROM ${table}`);
  if (n === 0) return null;

  const params = [];
  const where = [];
  if (cursor !== undefined && cursor !== null && cursor !== '') {
    params.push(Number(cursor) || 0);
    where.push(`rank > $${params.length}`);
  }
  // The screen matched the typed text anywhere in the address; so does this.
  const q = String(search ?? '').trim().toLowerCase();
  if (q) {
    params.push(q);
    where.push(`position($${params.length} in '0x' || encode(address, 'hex')) > 0`);
  }
  params.push(Math.min(Number(limit) || 30, 500));

  const { rows } = await db().query(
    `SELECT profile, score::int AS score, rank::int AS rank FROM (
       SELECT address, profile, score,
              row_number() OVER (ORDER BY score DESC, reputation DESC, address) AS rank
         FROM (SELECT address, profile, reputation, ${RANK_SCORE[table]} AS score FROM ${table}) scored
     ) ranked
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY rank
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((r) => ({ ...r.profile, rank: r.rank, rankScore: r.score }));
}

export const getGuardianRanking = (options) => getRankedEntities('guardian', options);
export const getVaultKeeperRanking = (options) => getRankedEntities('vault_keeper', options);

/**
 * File policies by status, counted in the store.
 *
 * The four figures beside the table -- total, active, ZKDKG v2, keygen pending
 * -- were `.filter().length` over every policy the browser had downloaded, which
 * is the pattern this replaces everywhere else. All four are promoted columns,
 * so one grouped count answers them and the table beside them can page.
 */
export async function getFilePolicyCounts() {
  if (!(await dbReady())) return null;
  const { rows } = await db().query(
    `SELECT active, mode, key_gen_requested, count(*)::int AS n
       FROM file_policy GROUP BY active, mode, key_gen_requested`,
  );
  if (rows.length === 0 && !(await filePoliciesProjected())) return null;

  const total = (pred) => rows.filter(pred).reduce((sum, r) => sum + r.n, 0);
  return {
    total: total(() => true),
    active: total((r) => r.active),
    zkdkgV2: total((r) => Number(r.mode) === 1),
    keyGenPending: total((r) => r.key_gen_requested),
  };
}

/**
 * The two rollup tables, paged by their key.
 *
 * These answer questions no contract call does -- how much this address has been
 * rewarded in total, how much escrow this file has taken -- so they are summed
 * from the log during ingest rather than read from the chain. Wei arrive as
 * decimal strings, as every other amount here does, because a lifetime total
 * does not fit in a double and rounding it silently would be worse than
 * refusing.
 *
 * Null when the rollup has not run, which a screen must tell apart from a
 * network with no economic activity.
 */
async function getRollupRows(table, keyColumn, keyName, columns, { limit = 500, cursor } = {}) {
  if (!(await dbReady())) return null;

  const { rows: [{ n }] } = await db().query(`SELECT count(*)::int AS n FROM ${table}`);
  if (n === 0) return null;

  const params = [];
  const where = [];
  if (cursor) { params.push(toBytes(cursor)); where.push(`${keyColumn} > $${params.length}`); }
  params.push(Math.min(Number(limit) || 500, 5000));

  const { rows } = await db().query(
    `SELECT ${keyColumn}, ${columns.join(', ')} FROM ${table}
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ${keyColumn}
      LIMIT $${params.length}`,
    params,
  );
  return rows.map((row) => {
    const out = { [keyName]: toHex(row[keyColumn]) };
    for (const column of columns) {
      // Counts stay numbers; wei stays a decimal string.
      out[column] = column.endsWith('_count') ? Number(row[column]) : String(row[column]);
    }
    return out;
  });
}

export const getEconomicParticipants = (options) => getRollupRows(
  'economic_participant', 'address', 'address',
  ['rewards', 'claimed', 'pool_deposits', 'stake_deposits', 'slashed',
    'escrow_paid', 'escrow_received', 'event_count'],
  options,
);

export const getFileEconomics = (options) => getRollupRows(
  'file_economics', 'file_id', 'fileId',
  ['policy_escrow_deposited', 'policy_escrow_refunded', 'access_escrow_deposited',
    'rewards_credited', 'access_request_count', 'event_count'],
  options,
);

/**
 * Deadlines: the partitions of one vault keeper, grouped by deadline index.
 *
 * A deadline is not an entity anywhere -- no contract holds one, and nothing
 * emits one. It is what you get by grouping a keeper's partitions, which is why
 * the screen used to build it in the browser from a replay of fifteen event
 * streams. The projected rows already carry every field it groups on, so this is
 * one indexed GROUP BY, and `partition_by_deadline (deadline, vk)` was already
 * there to serve it.
 *
 * Health is derived on read, not stored: "expired" happens at a moment no event
 * marks, so a stored value would be wrong between projections. The two counts
 * this returns are the ones the screen shows -- expired-while-active, and
 * expiring inside seven days -- and they use the same rules the browser did.
 */
export async function getDeadlines({ limit = 500, cursor } = {}) {
  if (!(await dbReady())) return null;

  const { rows: [{ n }] } = await db().query('SELECT count(*)::int AS n FROM partition_record');
  if (n === 0) return null;

  const params = [];
  const where = [];
  // Keyset over the pair the rows are ordered by, so paging deep costs the same
  // as paging shallow. The cursor is "vk:deadline".
  if (cursor) {
    const [vk, deadline] = String(cursor).split(':');
    params.push(toBytes(vk), Number(deadline));
    where.push(`(vk, deadline) > ($${params.length - 1}, $${params.length})`);
  }
  params.push(Math.min(Number(limit) || 500, 5000));

  const { rows } = await db().query(
    `SELECT vk, deadline,
            count(*)::int                    AS partition_count,
            coalesce(sum(sector_count), 0)   AS sector_count,
            coalesce(sum(proofs), 0)::int    AS submitted_proofs,
            coalesce(sum(challenges), 0)::int AS opened_challenges,
            count(*) FILTER (
              WHERE active AND expiration IS NOT NULL
                AND expiration > now() AND expiration <= now() + interval '7 days'
            )::int AS expiring_soon,
            -- Inactive wins over expired, the same precedence the health rule
            -- uses, so a deactivated partition is not also counted as faulted.
            count(*) FILTER (WHERE NOT active)::int AS inactive_count,
            count(*) FILTER (
              WHERE active AND expiration IS NOT NULL AND expiration <= now()
            )::int AS expired_count
       FROM partition_record
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY vk, deadline
      ORDER BY vk, deadline
      LIMIT $${params.length}`,
    params,
  );

  return rows.map((row) => {
    const vk = toHex(row.vk);
    const deadlineIndex = Number(row.deadline ?? 0);
    return {
      id: `${vk}-${deadlineIndex}`,
      vk,
      deadlineIndex,
      partitionCount: Number(row.partition_count),
      sectorCount: String(row.sector_count),
      openedChallenges: Number(row.opened_challenges),
      submittedProofs: Number(row.submitted_proofs),
      expiringSoon: Number(row.expiring_soon),
      // What the screen labels "faulted": active but past its expiration.
      faulted: Number(row.expired_count),
      health: Number(row.inactive_count) > 0
        ? 'inactive'
        : Number(row.expired_count) > 0 ? 'expired' : 'healthy',
    };
  });
}

/**
 * PRE re-encryption requests, rolled up from five streams.
 *
 * Ordered by the earliest block any of those streams touched the request, which
 * is what the screen shows as the request's block. There is no "first" event to
 * order by -- a request can appear in an expiry with no readiness declaration
 * before it, which is exactly why this is a rollup and not a paged join.
 *
 * `notUsedGuardians` is derived here rather than stored: it is ready minus
 * active, and storing a difference of two sets that are both already in the row
 * only creates a way for them to disagree.
 */
export async function getPreRequests({ limit = 500, cursor } = {}) {
  if (!(await dbReady())) return null;

  const { rows: [{ n }] } = await db().query('SELECT count(*)::int AS n FROM pre_request');
  if (n === 0) return null;

  const params = [];
  const where = [];
  // Keyset on the id, which is a decimal string, so it is compared as a number.
  if (cursor) { params.push(String(cursor)); where.push(`request_id::numeric > $${params.length}::numeric`); }
  params.push(Math.min(Number(limit) || 500, 5000));

  const { rows } = await db().query(
    `SELECT request_id, file_id, ready_guardians, active_guardians, bad_guardians,
            tx_hashes, expired, absent_count, first_block
       FROM pre_request
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY request_id::numeric
      LIMIT $${params.length}`,
    params,
  );

  return rows.map((row) => {
    const ready = row.ready_guardians ?? [];
    const active = row.active_guardians ?? [];
    const activeSet = new Set(active.map((g) => String(g).toLowerCase()));
    return {
      requestId: String(row.request_id),
      fileId: toHex(row.file_id) ?? '0x',
      readyGuardians: ready,
      activeGuardians: active,
      badPartialGuardians: row.bad_guardians ?? [],
      notUsedGuardians: ready.filter((g) => !activeSet.has(String(g).toLowerCase())),
      expired: Boolean(row.expired),
      absentCount: Number(row.absent_count ?? 0),
      blockNumber: String(row.first_block ?? 0),
      txHashes: row.tx_hashes ?? [],
    };
  });
}

/**
 * What a screen needs from several transactions' receipts, in one query.
 *
 * The file cycle screen shows the gas each of a file's transactions cost. It
 * asked the node three times per transaction -- the transaction, its receipt,
 * its block -- and a busy file has hundreds. The store has kept the receipt
 * fields since migration 012, so this reads them for every hash at once, and
 * counts each transaction's events from the log. A transaction indexed before
 * receipts were kept comes back with a null status, and the screen asks the
 * node for that one only.
 */
export async function getTransactionReceipts(hashes = []) {
  if (!(await dbReady())) return null;
  const wanted = [...new Set(hashes.map((h) => String(h).toLowerCase()))]
    .map((h) => toBytes(h)).filter(Boolean).slice(0, 500);
  if (wanted.length === 0) return [];

  const { rows } = await db().query(
    `SELECT hash, block_number, block_time, from_addr, to_addr, gas_used::text AS gas_used,
            gas_price::text AS gas_price, status
       FROM transaction WHERE hash = ANY($1::bytea[])`,
    [wanted],
  );
  if (rows.length === 0) return [];

  // Events per transaction, looked up by block -- the log's own key -- and then
  // by hash, so neither engine scans for them.
  const blocks = [...new Set(rows.map((r) => String(r.block_number)))];
  const counts = new Map();
  const ch = await eventClickHouse();
  if (ch) {
    const result = await ch.query({
      query: `SELECT tx_hash, count() AS n FROM event
               WHERE block_number IN {blocks:Array(UInt64)} AND tx_hash IN {hashes:Array(String)}
               GROUP BY tx_hash`,
      query_params: { blocks, hashes: rows.map((r) => r.hash.toString('hex')) },
      format: 'JSONEachRow',
    });
    for (const row of await result.json()) counts.set(String(row.tx_hash).toLowerCase(), Number(row.n));
  } else {
    const result = await db().query(
      `SELECT encode(tx_hash, 'hex') AS tx_hash, count(*)::int AS n FROM event
        WHERE block_number = ANY($1::bigint[]) AND tx_hash = ANY($2::bytea[])
        GROUP BY tx_hash`,
      [blocks, rows.map((r) => r.hash)],
    );
    for (const row of result.rows) counts.set(row.tx_hash, Number(row.n));
  }

  return rows.map((row) => ({
    hash: toHex(row.hash),
    blockNumber: String(row.block_number),
    blockTimestamp: row.block_time ? String(Math.floor(new Date(row.block_time).getTime() / 1000)) : null,
    from: toHex(row.from_addr),
    to: toHex(row.to_addr) ?? null,
    gasUsed: row.gas_used ?? null,
    gasPrice: row.gas_price ?? null,
    status: row.status === null || row.status === undefined ? null : Number(row.status),
    eventCount: counts.get(row.hash.toString('hex')) ?? 0,
  }));
}

/**
 * VK storage escrow claims linked to the piece they paid for.
 *
 * Worked out by the indexer from each claim's own input (scripts/escrow_links.mjs),
 * so a screen asks for one piece's links -- or a handful of payments' -- instead of
 * reading every claim the network has made back from the node. Null when the
 * table does not exist yet, so the screen falls back to doing it itself.
 */
export async function getEscrowLinks({ commitment, payments = [] } = {}) {
  if (!(await dbReady())) return null;
  const { rows: [ready] } = await db().query(
    "SELECT to_regclass('escrow_link') IS NOT NULL AND to_regclass('escrow_link_state') IS NOT NULL AS ok",
  );
  if (!ready?.ok) return null;

  const commitmentBytes = commitment ? toBytes(commitment) : null;
  const paymentBytes = payments.map((p) => toBytes(p)).filter(Boolean).slice(0, 500);
  if (!commitmentBytes && paymentBytes.length === 0) return [];

  const { rows } = await db().query(
    `SELECT payment_commitment, claim_tx, kind, claim_block, claim_log, recipient,
            registration_commitment, commitment_hash, vk, amount::text AS amount,
            service_start, service_end, depositor
       FROM escrow_link
      WHERE ($1::bytea IS NOT NULL AND commitment_hash = $1)
         OR payment_commitment = ANY($2::bytea[])
      ORDER BY claim_block, claim_log`,
    [commitmentBytes, paymentBytes],
  );
  const { rows: [state] } = await db().query('SELECT resolved_to FROM escrow_link_state WHERE id');
  return rows.map((row) => ({
    paymentCommitment: toHex(row.payment_commitment),
    claimTxHash: toHex(row.claim_tx),
    kind: row.kind,
    claimBlockNumber: String(row.claim_block),
    claimLogIndex: Number(row.claim_log),
    recipient: toHex(row.recipient) ?? null,
    registrationCommitment: toHex(row.registration_commitment) ?? null,
    commitmentHash: toHex(row.commitment_hash) ?? null,
    vkAddress: toHex(row.vk) ?? null,
    amount: row.amount ?? null,
    serviceStart: row.service_start === null ? null : String(row.service_start),
    serviceEnd: row.service_end === null ? null : String(row.service_end),
    depositor: toHex(row.depositor) ?? null,
    // How far the indexer has read claims, so a screen can say a link may
    // still be on its way rather than absent.
    resolvedTo: state ? String(state.resolved_to) : '-1',
  }));
}

/// How many rows each rollup holds, for the figure beside the table.
export async function getRollupCounts() {
  if (!(await dbReady())) return null;
  const [{ rows: p }, { rows: f }, { rows: r }] = await Promise.all([
    db().query('SELECT count(*)::int AS n FROM economic_participant'),
    db().query('SELECT count(*)::int AS n FROM file_economics'),
    db().query('SELECT count(*)::int AS n FROM pre_request'),
  ]);
  return { participants: p[0].n, files: f[0].n, preRequests: r[0].n };
}

/// When each entity row was last reconciled against the chain, and how many are
/// waiting. A screen showing rows should be able to say how fresh they are.
export async function getEntityFreshness() {
  if (!(await dbReady())) return null;
  const [{ rows: vk }, { rows: g }, { rows: dirty }] = await Promise.all([
    db().query('SELECT count(*)::int AS n, coalesce(max(synced_block), 0) AS block FROM vault_keeper'),
    db().query('SELECT count(*)::int AS n FROM guardian'),
    db().query('SELECT count(*)::int AS n FROM entity_dirty'),
  ]);
  return {
    vaultKeepers: vk[0].n,
    guardians: g[0].n,
    syncedBlock: String(vk[0].block),
    awaitingRefresh: dirty[0].n,
  };
}

export { toBytes, toHex };
