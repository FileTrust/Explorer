/// Turning "who changed" into rows the screens can page through.
///
/// The entity screens read current state a field at a time per entity. Batching
/// through Multicall3 cut ten keepers from 118 requests to 8, but the cost still
/// follows how many keepers there are, so ten thousand of them is a hundred
/// thousand reads on every page load for every reader. That does not get better
/// with more batching; it gets better by not doing it at request time.
///
/// So the indexer does it once, against the entities an event actually touched,
/// and writes rows. Two consequences worth being explicit about:
///
///   * The values come from the contracts, not from replaying events into a
///     guess at what the contract would say. Deriving state from events means
///     every missed or misread event is permanent silent drift; reading the
///     source of truth means a wrong row is one refresh from being right.
///   * The work is bounded by what changed, not by how large the network is.
///     A quiet hour costs nothing regardless of how many keepers exist.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { db, toBytes, toHex, withTransaction } from '../src/lib/db/postgres.mjs';
import { ENTITY_SPECS } from './entity_specs.mjs';

/**
 * The deployed ABI for a contract, from the build artifacts.
 *
 * The indexer carries only event signatures, because decoding logs is all it
 * needed. Reading state needs the function ABIs, and taking them from the
 * artifacts means they are the ones actually compiled and deployed rather than
 * a second copy kept in step by hand.
 */
export async function loadAbis(blockchainRoot, names) {
  const root = path.join(process.env.EXPLORER_BLOCKCHAIN_ROOT || blockchainRoot, 'artifacts', 'contracts');

  async function find(dir, name) {
    const direct = path.join(dir, `${name}.sol`, `${name}.json`);
    try {
      return JSON.parse(await readFile(direct, 'utf8'));
    } catch { /* fall through to a walk */ }

    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const child = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await find(child, name);
        if (found) return found;
      } else if (entry.name === `${name}.json`) {
        return JSON.parse(await readFile(child, 'utf8'));
      }
    }
    return null;
  }

  const out = {};
  for (const name of names) {
    const artifact = await find(root, name);
    if (artifact?.abi) out[name] = artifact.abi;
  }
  return out;
}

/// Every contract any spec needs, so the ABIs are loaded once.
export function contractsNeeded() {
  const names = new Set();
  for (const spec of ENTITY_SPECS) {
    names.add(spec.list.contract);
    for (const read of spec.reads) names.add(read.contract);
  }
  return [...names];
}

/// Note every entity an event in this batch spoke about.
///
/// Which argument names count is the spec's business, so a new entity type
/// starts being tracked by being declared rather than by editing this.
export async function markDirty(events, atBlock) {
  const seen = new Map();
  for (const event of events) {
    const args = event.args ?? {};
    for (const spec of ENTITY_SPECS) {
      // Key width per spec: an address is twenty bytes, a fileId or partition
      // key is thirty-two. Assuming twenty is what kept anything not keyed by an
      // address out of this framework.
      const width = (spec.keyBytes ?? 20) * 2;
      const pattern = new RegExp(`^0x[0-9a-fA-F]{${width}}$`);
      for (const name of spec.subjectArgs) {
        const value = args[name];
        if (typeof value === 'string' && pattern.test(value)) {
          seen.set(`${spec.kind}|${value.toLowerCase()}`, {
            kind: spec.kind,
            address: value.toLowerCase(),
            block: BigInt(event.blockNumber ?? atBlock),
          });
        }
      }
    }
  }
  if (seen.size === 0) return 0;

  await withTransaction(async (client) => {
    for (const { kind, address, block } of seen.values()) {
      await client.query(
        `INSERT INTO entity_dirty (kind, id, since_block) VALUES ($1, $2, $3)
           ON CONFLICT (kind, id) DO UPDATE
             SET since_block = LEAST(entity_dirty.since_block, EXCLUDED.since_block)`,
        [kind, toBytes(address), String(block)],
      );
    }
  });
  return seen.size;
}

async function dirtyAddresses(kind, limit = 5000) {
  const { rows } = await db().query(
    'SELECT id FROM entity_dirty WHERE kind = $1 ORDER BY since_block LIMIT $2',
    [kind, limit],
  );
  return rows.map((r) => toHex(r.id));
}

async function clearDirty(kind, addresses) {
  if (addresses.length === 0) return;
  await db().query('DELETE FROM entity_dirty WHERE kind = $1 AND id = ANY($2::bytea[])',
    [kind, addresses.map((a) => toBytes(a))]);
}

/// How many rows a pass may re-read on top of the ones events asked for.
const REFRESH_BUDGET = Math.max(0, Number(process.env.INDEX_REFRESH_BUDGET ?? '250'));

/**
 * The rows longest out of contact with the chain.
 *
 * Refreshing only what an event named assumes every change announces itself to
 * the entity it changed. Contract state does not work that way. A keeper's
 * reputation is raised by the reputation manager, its admission opens once
 * enough capacity is proved, its available stake moves when something it does
 * not appear in locks or frees stake -- none of those emit an event carrying
 * that keeper's address, so nothing marks it dirty and its row keeps whatever it
 * had. Not briefly: for good.
 *
 * That is what was on screen. The chain had every keeper open for admission with
 * a reputation of 1003; the store had all ten closed at 1000, from a read four
 * hundred blocks earlier, and no amount of waiting would have corrected it
 * because nothing was ever going to ask.
 *
 * So each pass also re-reads the rows that have gone longest without one, oldest
 * first. Bounded, because this runs on every tick: the budget decides how much a
 * pass may spend, and the rows rotate through it. With a small network every row
 * is refreshed every pass; with a large one each is refreshed within a knowable
 * number of passes rather than never. Events still drive the fast path -- this
 * is the floor under it, not a replacement.
 */
async function stalestAddresses(table, atBlock, limit) {
  if (limit <= 0) return [];
  const { rows } = await db().query(
    `SELECT address FROM ${table}
      WHERE synced_block < $1
      ORDER BY synced_block ASC
      LIMIT $2`,
    [String(atBlock), limit],
  );
  return rows.map((r) => toHex(r.address));
}

/// Digits for bigints, as the event arguments do, so one revival step on the
/// client serves both.
function plain(value) {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
}

/**
 * Read a batch of contract calls at once.
 *
 * Failures come back rather than throwing, because one unreadable entity must
 * leave a gap instead of taking the batch and the screen with it. Without a
 * Multicall3 address this falls back to a call each: correct, and slow in
 * exactly the way this exists to stop happening at request time -- but it
 * happens once in the indexer rather than on every page load, so it is worth
 * still working.
 */
/**
 * Whether the configured Multicall3 exists on the chain being indexed.
 *
 * Asked once per process, because the answer cannot change under a running
 * indexer and the cost of being wrong is total: batching every read through a
 * contract that is not there fails every one of them, and a projection whose
 * reads all fail writes no rows at all -- silently, because "not registered" and
 * "could not read" look the same to a spec's `exists` check.
 *
 * That is not hypothetical. A certification run builds a fresh chain, and the
 * address in `.env.local` belongs to the chain before it. Ten vault keepers were
 * on the registry, the projection read all ten, and wrote none; the screens said
 * the network was empty.
 */
let multicallChecked = false;
let multicallAddress = null;

async function resolveMulticall(client) {
  if (multicallChecked) return multicallAddress;
  multicallChecked = true;
  // The Cosmos EVM chain answers a batched aggregate3 call with empty/wrong
  // results instead of an error or a revert -- confirmed by hand: the same
  // getGuardian() read that returns the right struct one call at a time comes
  // back null through Multicall3 here. Every entity projection reads through
  // this path, so a silent failure here writes zero rows for a chain that is
  // not empty. Hardhat's Multicall3 has not shown this, so only Cosmos skips it.
  if (process.env.FILETRUST_CHAIN === 'cosmos') return null;
  const configured = process.env.NEXT_PUBLIC_MULTICALL3_ADDRESS;
  if (!configured) return null;
  try {
    const code = await client.getCode({ address: configured });
    if (code && code !== '0x') {
      multicallAddress = configured;
    } else {
      console.log(`  no Multicall3 at ${configured} on this chain; reading one call at a time`);
    }
  } catch {
    // A node that will not answer eth_getCode will not answer a multicall
    // either. Fall back rather than assume.
  }
  return multicallAddress;
}

// One shared queue per client, including calls from different getter groups.
// Public RPC limits concurrent HTTP requests as well as request rate. Letting
// every getter fan out across every node bypassed both limits inside one pass.
const readQueues = new WeakMap();
function boundedRead(client, run) {
  let queue = readQueues.get(client);
  if (!queue) {
    queue = { active: 0, pending: [], nextStart: 0, timer: null };
    readQueues.set(client, queue);
  }
  const pump = () => {
    if (queue.timer || queue.active >= 4 || queue.pending.length === 0) return;
    const delay = queue.nextStart - Date.now();
    if (delay > 0) {
      queue.timer = setTimeout(() => { queue.timer = null; pump(); }, delay);
      return;
    }
    const task = queue.pending.shift();
    queue.active += 1;
    queue.nextStart = Date.now() + 50;
    Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => {
      queue.active -= 1;
      pump();
    });
    pump();
  };
  return new Promise((resolve, reject) => {
    queue.pending.push({ run, resolve, reject });
    pump();
  });
}

async function readAll(client, contracts, options = {}) {
  if (contracts.length === 0) return [];
  const address = await resolveMulticall(client);
  if (address) {
    return boundedRead(client, () => client.multicall({ contracts, allowFailure: true, batchSize: 1024, multicallAddress: address, ...options }));
  }
  return Promise.all(contracts.map((c) => boundedRead(client, () => client.readContract({ ...c, ...options }))
    .then((result) => ({ status: 'success', result }))
    .catch((error) => ({ status: 'failure', error }))));
}

const unwrap = (r) => (r && r.status === 'success' ? r.result : null);

/**
 * Run one spec's reads over a set of addresses and return mapped rows.
 *
 * Exported so the verifier can ask for exactly what the projection would have
 * written, and compare it against what is stored, without duplicating any of
 * the mapping it is checking.
 */
export async function readEntities(client, spec, wired, addresses, options = {}) {
  if (addresses.length === 0) return [];

  const results = await Promise.all(spec.reads.map((read) => {
    const contract = wired[read.contract];
    if (!contract) return Promise.resolve(addresses.map(() => null));
    return readAll(client, addresses.map((addr) => ({
      address: contract.address, abi: contract.abi, functionName: read.fn, args: [addr],
    })), options);
  }));

  return addresses.map((address, i) => {
    // A transport failure is not an on-chain zero or a closed admission gate.
    // Publish complete rows only; retain the previous row and dirty marker for
    // retries. A successful zero/false value remains a valid result.
    if (spec.reads.some((_read, r) => results[r][i]?.status !== 'success')) return null;
    const named = { address };
    spec.reads.forEach((read, r) => { named[read.as] = unwrap(results[r][i]); });
    // Not registered means no row. Asking the spec rather than checking that a
    // call returned: these registries answer for an unknown address with a
    // struct of zeros instead of reverting, so a successful read is not evidence
    // the entity exists.
    if (spec.exists && !spec.exists(named)) return null;
    try {
      return spec.map(named);
    } catch {
      return null;
    }
  });
}

async function upsert(spec, rows, atBlock) {
  const present = rows.filter(Boolean);
  if (present.length === 0) return 0;

  const cols = Object.keys(spec.columns);
  const columnList = ['address', ...cols, 'profile', 'synced_block', 'last_event_block', 'updated_at'];
  const assignments = [...cols, 'profile', 'synced_block']
    .map((c) => `${c} = EXCLUDED.${c}`).join(', ');

  await withTransaction(async (client) => {
    for (const row of present) {
      const values = [toBytes(row[spec.keyField ?? 'address']), ...cols.map((c) => spec.columns[c](row)),
        JSON.stringify(plain(row)), String(atBlock)];
      const placeholders = values.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO ${spec.table} (${columnList.join(', ')})
         VALUES (${placeholders.join(', ')}, $${values.length}, now())
         ON CONFLICT (address) DO UPDATE SET ${assignments}, updated_at = now()`,
        values,
      );
    }
  });
  return present.length;
}

/**
 * Bring one entity kind up to date.
 *
 * `full` re-reads every registered entity, which a first run, a rebuild, or an
 * edit to the projection needs. Otherwise only the ones an event has touched,
 * which is what keeps a steady tick cheap however large the network gets.
 */
export async function projectEntity({ client, spec, wired, atBlock, full = false }) {
  const listContract = wired[spec.list.contract];
  if (!listContract) return { kind: spec.kind, skipped: 'contract not deployed' };

  // A full scan can legitimately find no file policies. Remember that success
  // separately from row count, including once on existing installations.
  if (spec.kind === 'file_policy' && !full) {
    const { rows } = await db().query(
      'SELECT value FROM counter WHERE name = $1', ['projection:file_policy'],
    );
    full = rows.length === 0;
  }
  const markComplete = async () => {
    if (full && spec.kind === 'file_policy') {
      await db().query(
        `INSERT INTO counter (name, value, updated_at) VALUES ($1, $2, now())
           ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        ['projection:file_policy', String(atBlock)],
      );
    }
  };

  let addresses;
  if (full) {
    if (spec.list.perParent) {
      // Some things are only listable through their owner: a partition key can
      // be had from its vault keeper, never from a global roll. The parents are
      // already rows by the time this runs, so this reads a list per parent
      // rather than a list of everything -- which is the same shape the entity
      // screens used to have, except it happens once in the indexer instead of
      // on every page load.
      const { rows } = await db().query(
        `SELECT address FROM ${spec.list.perParent.table}`,
      );
      const parents = rows.map((r) => toHex(r.address));
      const lists = await readAll(client, parents.map((parent) => ({
        address: listContract.address, abi: listContract.abi,
        functionName: spec.list.fn, args: [parent],
      })));
      addresses = lists
        .flatMap((result) => unwrap(result) ?? [])
        .map((k) => String(k).toLowerCase());
      // A key can be listed by more than one parent in principle; a duplicate
      // would be read twice and upserted twice, which is harmless but wasteful.
      addresses = [...new Set(addresses)];
    } else {
      let all;
      try {
        all = await client.readContract({
          address: listContract.address, abi: listContract.abi, functionName: spec.list.fn,
        });
      } catch {
        return { kind: spec.kind, skipped: 'entity list unavailable' };
      }
      addresses = all.map((a) => String(a).toLowerCase());
    }
  } else {
    // What events asked for, then the stalest rows with whatever budget is left.
    // Events first, so a pass under a heavy budget still answers the changes it
    // was told about before it spends anything on the rotation.
    const dirty = await dirtyAddresses(spec.kind);
    const stale = await stalestAddresses(
      spec.table, atBlock, REFRESH_BUDGET - dirty.length,
    );
    addresses = [...new Set([...dirty, ...stale])];
  }
  if (addresses.length === 0) {
    if (full) await markComplete();
    return { kind: spec.kind, read: 0, written: 0 };
  }

  const rows = await readEntities(client, spec, wired, addresses, { blockNumber: BigInt(atBlock) });

  // Fold in what the events say, for the columns the contract does not hold.
  if (spec.tallyEvents || spec.eventFacts || spec.firstBlockOf) {
    const { eventStoreName } = await import('../src/lib/db/repository.mjs');
    let ch = null;
    if (eventStoreName() === 'clickhouse') {
      const { createClient } = await import('@clickhouse/client');
      ch = createClient({
        url: process.env.CLICKHOUSE_URL,
        database: process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer',
        username: process.env.CLICKHOUSE_USER || 'default',
        password: process.env.CLICKHOUSE_PASSWORD || '',
      });
    }
    // Only the subjects being re-read, so a steady pass counts the events of a
    // few hundred rows rather than grouping the whole log every minute. A full
    // pass reads everyone, and grouping everything is the cheaper way to do it.
    const keys = full ? undefined : addresses;
    try {
      const tallies = spec.tallyEvents
        ? await eventTallies(spec.tallyEvents, { clickhouse: ch, keys })
        : new Map();
      const facts = await eventFacts(
        spec.eventFacts ?? [], spec.firstBlockOf ?? [], { clickhouse: ch, keys },
      );
      for (const row of rows) {
        if (!row) continue;
        const key = String(row[spec.keyField ?? 'address']).toLowerCase();
        const t = tallies.get(key) ?? {};
        if (spec.withTallies) Object.assign(row, spec.withTallies(row, t));
        // Facts are assigned under the names the spec asked for, so a spec that
        // wants none is unaffected and one that wants some needs no extra hook.
        Object.assign(row, facts.get(key) ?? {});
      }
    } finally {
      if (ch) await ch.close();
    }
  }

  const written = await upsert(spec, rows, atBlock);
  await clearDirty(spec.kind, rows.filter(Boolean).map(row => row[spec.keyField ?? 'address']));
  if (written === addresses.length) await markComplete();
  return { kind: spec.kind, read: addresses.length, written, deferred: addresses.length - written };
}

/// Every spec, in one pass.
export async function projectAll({ client, wired, atBlock, full = false }) {
  const results = [];
  for (const spec of ENTITY_SPECS) {
    results.push(await projectEntity({ client, spec, wired, atBlock, full }));
  }
  return results;
}

/**
 * Per-entity event tallies, in one grouped query each.
 *
 * A projected row carries what the contract says. The tables beside those counts
 * also show what *happened* -- proofs submitted, challenges opened, the block a
 * thing was registered in -- and none of that is contract state, so a projection
 * without it cannot back the table, only the totals.
 *
 * `subject_key` is indexed and holds the partition key, so "how many proofs per
 * partition" is one grouped scan rather than a walk. That is the difference
 * between counters a projection can afford to keep current and counters it
 * cannot.
 *
 * Returns a Map from key to a count per named event.
 */
/// Keys as ClickHouse holds them: lower-case hex without the 0x.
function clickHouseKeys(keys) {
  return keys.map((k) => String(k).replace(/^0x/i, '').toLowerCase());
}

/**
 * Per-subject facts drawn from the event log, beside the counts.
 *
 * Some columns a table shows are neither contract state nor a tally. A
 * partition's sector count lives only in the event that announced it, and the
 * block a partition was registered in is the event's own block -- ask the
 * contract and it has neither. Replaying the log in the browser is how those
 * two were obtained, which is exactly what a projection is supposed to end.
 *
 * `facts` is a list of `{ event, arg, as }`, plus `firstBlockOf` naming events
 * whose earliest block is wanted. The argument's value is taken from the newest
 * matching event, so an update supersedes the registration that preceded it.
 */
export async function eventFacts(facts = [], firstBlockOf = [], { clickhouse, keys } = {}) {
  const names = [...new Set([...facts.map((f) => f.event), ...firstBlockOf])];
  if (names.length === 0) return new Map();

  const { rows: types } = await db().query(
    'SELECT id, name FROM event_type WHERE name = ANY($1)', [names],
  );
  if (types.length === 0) return new Map();
  const nameById = new Map(types.map((t) => [t.id, t.name]));
  const ids = types.map((t) => t.id);

  // Ordered by (block, log index) rather than by block alone: two events for one
  // subject in a single block are ordinary, and picking either at random is how
  // a column ends up flickering between two values on refresh.
  let rows;
  if (clickhouse) {
    const result = await clickhouse.query({
      query: `SELECT lower(subject_key) AS key, event_id,
                     min(block_number) AS first_block,
                     max(block_number) AS last_block,
                     argMax(log_index, (block_number, log_index)) AS last_log,
                     argMax(args, (block_number, log_index)) AS newest_args
                FROM event
               WHERE subject_key IS NOT NULL AND event_id IN {ids:Array(UInt16)}
                 ${keys ? 'AND subject_key IN {keys:Array(String)}' : ''}
               GROUP BY key, event_id`,
      query_params: keys ? { ids, keys: clickHouseKeys(keys) } : { ids },
      format: 'JSONEachRow',
    });
    rows = await result.json();
  } else {
    const result = await db().query(
      `SELECT DISTINCT ON (subject_key, event_id)
              encode(subject_key, 'hex') AS key, event_id,
              min(block_number) OVER (PARTITION BY subject_key, event_id) AS first_block,
              block_number AS last_block, log_index AS last_log,
              args AS newest_args
         FROM event
        WHERE subject_key IS NOT NULL AND event_id = ANY($1)
          ${keys ? 'AND subject_key = ANY($2::bytea[])' : ''}
        ORDER BY subject_key, event_id, block_number DESC, log_index DESC`,
      keys ? [ids, keys.map((k) => toBytes(k))] : [ids],
    );
    rows = result.rows;
  }

  // Two events can supply the same fact -- a partition's sector count is
  // announced at registration and restated on update -- so the newer one wins
  // regardless of which order the rows arrive in. `at` remembers when the value
  // currently held was emitted, and is dropped before the facts are returned.
  const byKey = new Map();
  const newer = (a, b) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

  for (const row of rows) {
    const name = nameById.get(Number(row.event_id));
    if (!name) continue;
    const key = `0x${row.key}`;
    const entry = byKey.get(key) ?? { at: {} };
    const args = typeof row.newest_args === 'string'
      ? JSON.parse(row.newest_args || '{}')
      : (row.newest_args ?? {});
    const stamp = [BigInt(row.last_block ?? 0), Number(row.last_log ?? 0)];

    for (const fact of facts) {
      if (fact.event !== name) continue;
      const value = args[fact.arg];
      if (value === undefined) continue;
      const held = entry.at[fact.as];
      if (held === undefined || newer(stamp, held)) {
        entry[fact.as] = value;
        entry.at[fact.as] = stamp;
      }
    }
    if (firstBlockOf.includes(name)) {
      const block = String(row.first_block ?? '0');
      // The earliest across every named event, so "registered" means the first
      // time this subject was seen however it was announced.
      entry.firstBlock = entry.firstBlock === undefined
        ? block
        : (BigInt(block) < BigInt(entry.firstBlock) ? block : entry.firstBlock);
    }
    byKey.set(key, entry);
  }

  for (const entry of byKey.values()) delete entry.at;
  return byKey;
}

export async function eventTallies(eventNames, { clickhouse, keys } = {}) {
  const { rows: types } = await db().query(
    'SELECT id, name FROM event_type WHERE name = ANY($1)', [eventNames],
  );
  if (types.length === 0) return new Map();
  const nameById = new Map(types.map((t) => [t.id, t.name]));

  let rows;
  if (clickhouse) {
    const result = await clickhouse.query({
      // subject_key is already hex text in ClickHouse -- FixedString could not
      // carry raw bytes through JSONEachRow -- so hex() here would encode it
      // twice and every key would miss. Postgres holds bytea and does need
      // encoding, which is why the two branches differ.
      query: `SELECT lower(subject_key) AS key, event_id, count() AS n
                FROM event
               WHERE subject_key IS NOT NULL AND event_id IN {ids:Array(UInt16)}
                 ${keys ? 'AND subject_key IN {keys:Array(String)}' : ''}
               GROUP BY key, event_id`,
      query_params: keys
        ? { ids: types.map((t) => t.id), keys: clickHouseKeys(keys) }
        : { ids: types.map((t) => t.id) },
      format: 'JSONEachRow',
    });
    rows = await result.json();
  } else {
    const result = await db().query(
      `SELECT encode(subject_key, 'hex') AS key, event_id, count(*)::int AS n
         FROM event
        WHERE subject_key IS NOT NULL AND event_id = ANY($1)
          ${keys ? 'AND subject_key = ANY($2::bytea[])' : ''}
        GROUP BY key, event_id`,
      keys
        ? [types.map((t) => t.id), keys.map((k) => toBytes(k))]
        : [types.map((t) => t.id)],
    );
    rows = result.rows;
  }

  const tallies = new Map();
  for (const row of rows) {
    const key = `0x${row.key}`;
    const name = nameById.get(Number(row.event_id));
    if (!name) continue;
    const entry = tallies.get(key) ?? {};
    entry[name] = Number(row.n);
    tallies.set(key, entry);
  }
  return tallies;
}
