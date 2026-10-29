import { guardRead } from '@/lib/read-guard.mjs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getBlocks, getEvents, getFilePolicies, getGuardians, getPartitionCounts,
  getFilePolicyCounts,
  getSectors,
  getEconomicParticipants,
  getFileEconomics,
  getRollupCounts,
  getDeadlines,
  getPreRequests,
  getAddressTransactions,
  getAddressInternalTransfers,
  getAddressSummary,
  getTransactionInternalTransfers,
  getTransactionDetail, getPartitions, getSectorCounts, getStatus, getTransactions, getVaultKeepers,
  getNetworkSummary, getGuardianRanking, getVaultKeeperRanking, getEscrowLinks,
  getTransactionReceipts, getBlockDetail, getBlockTransactions, getBlockInternalTransfers,
  getBlockParticipants } from '@/lib/db/repository.mjs';
import { BUILD_TAG } from '@/lib/buildTag';
import { subjectsOf } from '@/lib/indexedLogMatch.mjs';

export const dynamic = 'force-dynamic';

/**
 * The index, filtered on the server instead of in the browser.
 *
 * The screens used to fetch the index files themselves and filter what came
 * back. That is fine while the files are small and stops being fine exactly when
 * the index starts earning its keep: the events file is already megabytes for a
 * thousand blocks, it is downloaded in full to answer a question about forty
 * rows, and it grows with the chain. A screen on an old chain would spend longer
 * downloading history it discards than reading the part it wants.
 *
 * Filtering here means the browser receives the rows it asked for. It also puts
 * one seam between the screens and the storage: everything above this route asks
 * by address, contract and event name, so the JSON behind it can become a
 * database without any screen noticing.
 */

const DATASETS = {
  manifest: 'manifest.json',
  events: 'filetrust-events.json',
  blocks: 'blocks.json',
  transactions: 'transactions.json',
  // Current state, which only the store has. There is no file behind this one,
  // so it 404s without a projection and the screen reads the chain instead --
  // the same fallback every other dataset has, arrived at differently.
  'vault-keepers': null,
  guardians: null,
  'file-policies': null,
  partitions: null,
  sectors: null,
  deadlines: null,
  'partition-counts': null,
  'sector-counts': null,
  'file-policy-counts': null,
  // Totals over history, summed from the log during ingest: no contract call
  // returns "how much has this address earned".
  'economic-participants': null,
  'file-economics': null,
  'pre-requests': null,
  // One transaction and its events, so that screen stops asking the chain.
  transaction: null,
  // Every transaction one address sent or received. Two indexed seeks against
  // indexes that have existed since the first migration, in place of the 250
  // whole blocks the address screen used to pull over RPC to see four minutes
  // of history.
  'address-transactions': null,
  // FTU contracts paid to or took from one address inside transactions --
  // rewards, fees, refunds, returned stake -- read from the node's call trace.
  'address-internal': null,
  // One address's counts, first and last activity, and who first funded it.
  'address-summary': null,
  // The FTU contracts moved inside one transaction.
  'tx-internal': null,
  'rollup-counts': null,
  // Average service prices and fleet capacity, summed over the projected rows
  // rather than downloaded whole to be summed in the browser.
  'network-summary': null,
  // The leaderboard, scored and sorted in the store, a page at a time.
  'guardian-rank': null,
  'vk-rank': null,
  // VK storage escrow claims and the piece each one paid for, worked out by the
  // indexer from the claim, so a file's cycle does not read every claim back.
  'escrow-links': null,
  // Receipt fields for several transactions at once, for the file cycle's costs.
  'tx-receipts': null,
  // One block, beyond its header: fees, methods, payments, events, who took part.
  'block-detail': null,
  'block-transactions': null,
  'block-internal': null,
  'block-participants': null,
} as const;

type Dataset = keyof typeof DATASETS;

function isDataset(value: string): value is Dataset {
  return Object.prototype.hasOwnProperty.call(DATASETS, value);
}

type IndexedEvent = {
  args?: Record<string, unknown>;
  address?: string;
  contractName?: string;
  contractLabel?: string;
  name?: string;
  /** Decimal digits, as everything numeric is written to the index files. */
  blockNumber?: string;
};

/**
 * Parse each file once and keep it until it changes on disk.
 *
 * The watcher rewrites these every minute, so the cache is keyed on the file's
 * modified time rather than a duration: a rebuilt index is picked up on the next
 * request, and an unchanged one is never parsed twice however many screens ask.
 */
const parsed = new Map<Dataset, { mtimeMs: number; size: number; data: unknown }>();

/**
 * One address's transactions from the file index, newest first.
 *
 * Without a store this dataset had no answer, and the address screen fell back
 * to fetching 250 whole blocks over RPC at once -- heavy on a busy chain, and one
 * failed block failed the screen. The file index already holds the most recent
 * transactions (INDEX_RETAIN_TRANSACTIONS), so they are filtered here instead.
 * Null when there is no file index either.
 */
async function addressTransactionsFromFiles(params: URLSearchParams) {
  const address = (params.get('address') ?? '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(address)) return null;
  const data = await readDataset('transactions');
  if (!Array.isArray(data)) return null;
  const limit = Math.min(Number(params.get('limit') ?? '') || 50, 500);
  const direction = params.get('direction');
  return (data as Array<{ from?: string; to?: string | null; input?: string }>)
    .filter(tx => {
      const sent = tx.from?.toLowerCase() === address;
      const received = tx.to?.toLowerCase() === address;
      if (direction === 'out') return sent;
      if (direction === 'in') return received;
      return sent || received;
    })
    .slice(0, limit)
    // The same field the store sends, so the list shows a method either way.
    .map(tx => ({ ...tx, selector: typeof tx.input === 'string' && tx.input.length >= 10 ? tx.input.slice(0, 10) : null }));
}

async function readDataset(dataset: Dataset): Promise<unknown | null> {
  const name = DATASETS[dataset];
  if (name === null) return null; // Store-only; there is no file to fall back to.
  const file = path.join(process.cwd(), 'public', 'index', name);
  let info;
  try {
    info = await stat(file);
  } catch {
    return null; // No index yet. The caller falls back to a bounded chain read.
  }

  const hit = parsed.get(dataset);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.data;

  try {
    const data = JSON.parse(await readFile(file, 'utf8'));
    parsed.set(dataset, { mtimeMs: info.mtimeMs, size: info.size, data });
    return data;
  } catch {
    // A half-written file during a rebuild reads as absent rather than as an
    // error, so a screen shows its bounded window for a moment instead of
    // breaking.
    return null;
  }
}

function filterEvents(rows: IndexedEvent[], params: URLSearchParams): IndexedEvent[] {
  const addresses = new Set(params.getAll('address').map(a => a.toLowerCase()).filter(Boolean));
  // Whoever or whatever the event is about, picked by the same rule the store
  // uses to fill its subject columns, so the files answer the same question.
  const subject = (params.get('subject') ?? '').toLowerCase();
  const contracts = new Set(params.getAll('contract').filter(Boolean));
  const events = new Set(params.getAll('event').filter(Boolean));
  // The same block window the store applies, so a screen joining two streams
  // gets the same rows whichever side answered.
  const from = params.get('fromBlock');
  const to = params.get('toBlock');
  const fromBlock = from === null ? null : BigInt(from);
  const toBlock = to === null ? null : BigInt(to);

  if (addresses.size === 0 && contracts.size === 0 && events.size === 0
    && fromBlock === null && toBlock === null && !subject) return rows;

  return rows.filter(row => {
    if (subject) {
      const { address, key } = subjectsOf(row.args);
      if (address !== subject && key !== subject) return false;
    }
    if (addresses.size > 0 && !addresses.has(String(row.address ?? '').toLowerCase())) return false;
    if (contracts.size > 0
      && !contracts.has(row.contractName ?? '')
      && !contracts.has(row.contractLabel ?? '')) return false;
    if (events.size > 0 && !events.has(row.name ?? '')) return false;
    if (fromBlock !== null && BigInt(row.blockNumber ?? 0) < fromBlock) return false;
    if (toBlock !== null && BigInt(row.blockNumber ?? 0) > toBlock) return false;
    return true;
  });
}

/**
 * The store, when there is one, ahead of the files.
 *
 * Both are written during the changeover, so this decides which answers. The
 * store is asked for its status rather than merely reached for: a configured but
 * unbuilt database must fall through to the files rather than serve a page an
 * empty chain. Cached briefly because every request would otherwise ask.
 */
let storeStatus: { at: number; value: Awaited<ReturnType<typeof getStatus>> } | null = null;
const STORE_STATUS_MS = 5_000;

async function store() {
  const now = Date.now();
  if (!storeStatus || now - storeStatus.at >= STORE_STATUS_MS) {
    let value = null;
    try {
      value = await getStatus();
    } catch {
      // A database that is down is a database that is absent, as far as a
      // screen is concerned: fall through to the files rather than fail a page.
      value = null;
    }
    storeStatus = { at: now, value };
  }
  return storeStatus.value;
}

/**
 * Where the next page starts, as one opaque string.
 *
 * Opaque on purpose. Callers pass back what they were given and nothing else, so
 * the columns a cursor is built from can change without every caller having to
 * learn the new shape -- and nobody is tempted to construct one by hand and land
 * between rows.
 */
function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | null): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    // A malformed cursor is a caller error, not a reason to fail a page: start
    // from the beginning rather than throwing at someone holding a stale link.
    return undefined;
  }
}

/// The page size actually applied, which is what decides whether a short page
/// means "end of data". Kept in one place so the default cannot drift between
/// where the query is built and where the cursor is decided.
const DEFAULT_LIMIT: Record<string, number> = {
  events: 10000, blocks: 1000, transactions: 5000, 'vault-keepers': 5000, guardians: 5000, 'file-policies': 5000, partitions: 5000,
  'address-transactions': 50, 'address-internal': 50, 'guardian-rank': 30, 'vk-rank': 30,
  'block-transactions': 50, 'block-internal': 50,
};

/// Sent, received or both. Anything else is both, rather than an error.
function directionParam(params: URLSearchParams): 'all' | 'in' | 'out' {
  const value = params.get('direction');
  return value === 'in' || value === 'out' ? value : 'all';
}

function requestedLimit(url: URL, dataset: Dataset): number {
  return Number(url.searchParams.get('limit') ?? '') || DEFAULT_LIMIT[dataset] || 1000;
}

/// The cursor that would continue this page, or null at the end of the data.
/// A short page is the end -- asking again would cost a query to learn nothing.
function nextCursorFor(dataset: Dataset, rows: unknown[], limit: number): string | null {
  if (rows.length < limit) return null;
  const last = rows[rows.length - 1] as Record<string, unknown>;

  switch (dataset) {
    case 'events':
      return encodeCursor({ blockNumber: last.blockNumber, logIndex: last.logIndex });
    case 'vault-keepers':
    case 'guardians':
      return encodeCursor(last.address);
    case 'file-policies':
      return encodeCursor(last.fileId);
    case 'partitions':
      return encodeCursor(last.partitionKey);
    case 'sectors':
      return encodeCursor(last.sectorKey);
    case 'deadlines':
      // A deadline is a keeper and an index together, so the cursor is the pair.
      return encodeCursor(`${last.vk}:${last.deadlineIndex}`);
    case 'economic-participants':
      return encodeCursor(last.address);
    case 'file-economics':
      return encodeCursor(last.fileId);
    case 'pre-requests':
      return encodeCursor(last.requestId);
    case 'guardian-rank':
    case 'vk-rank':
      // A place in the leaderboard; the next page starts after it.
      return encodeCursor(last.rank);
    case 'network-summary':
    case 'escrow-links':
    case 'tx-receipts':
    case 'file-policy-counts':
    case 'partition-counts':
    case 'sector-counts':
    case 'rollup-counts':
    case 'transaction':
      // A single object, not a page.
      return null;
    case 'blocks':
      return encodeCursor({ number: last.number });
    case 'block-transactions':
      return encodeCursor({ transactionIndex: last.transactionIndex });
    case 'block-internal':
      return encodeCursor({ transactionIndex: last.transactionIndex, traceIndex: last.traceIndex });
    case 'block-detail':
    case 'block-participants':
      // One block's whole answer, not a page.
      return null;
    case 'transactions':
    case 'address-transactions':
      return encodeCursor({ blockNumber: last.blockNumber, transactionIndex: last.transactionIndex });
    case 'address-internal':
      // A transaction can pay several times, so the call's position is part of
      // where the next page starts.
      return encodeCursor({
        blockNumber: last.blockNumber, transactionIndex: last.transactionIndex, traceIndex: last.traceIndex,
      });
    default:
      return null;
  }
}

async function fromStore(dataset: Dataset, params: URLSearchParams, status: NonNullable<Awaited<ReturnType<typeof getStatus>>>) {
  const limit = Number(params.get('limit') ?? '') || undefined;
  const cursor = decodeCursor(params.get('cursor'));

  switch (dataset) {
    case 'manifest':
      return status;
    case 'events':
      return getEvents({
        addresses: params.getAll('address').filter(Boolean),
        contracts: params.getAll('contract').filter(Boolean),
        events: params.getAll('event').filter(Boolean),
        // Whoever or whatever the events are about, matched on its own index so
        // a detail screen fetches its own rows rather than a page of everything.
        subject: params.get('subject') ?? undefined,
        // A block window, so a screen can join one stream against another over
        // exactly the range it has loaded. A fulfilment is always recorded at or
        // after the request it fulfils, so bounding the join below the oldest
        // loaded row cannot miss one.
        fromBlock: params.get('fromBlock') ?? undefined,
        toBlock: params.get('toBlock') ?? undefined,
        limit: limit ?? 10000,
        cursor: cursor as { blockNumber: string; logIndex: number } | undefined,
      });
    case 'blocks':
      return getBlocks({ limit: limit ?? 1000, cursor: cursor as { number?: string } | undefined });
    case 'block-detail':
      return getBlockDetail(params.get('number') ?? '');
    case 'block-transactions':
      return getBlockTransactions(params.get('number') ?? '', {
        limit: limit ?? 50, cursor: cursor as { transactionIndex?: number } | undefined,
      });
    case 'block-internal':
      return getBlockInternalTransfers(params.get('number') ?? '', {
        limit: limit ?? 50, cursor: cursor as { transactionIndex?: number; traceIndex?: number } | undefined,
      });
    case 'block-participants':
      return getBlockParticipants(params.get('number') ?? '');
    case 'transactions':
      return getTransactions({ limit: limit ?? 5000 });
    case 'address-transactions':
      return getAddressTransactions(params.get('address') ?? '', {
        limit: limit ?? 50,
        cursor,
        direction: directionParam(params),
      });
    case 'address-internal':
      return getAddressInternalTransfers(params.get('address') ?? '', {
        limit: limit ?? 50,
        cursor,
        direction: directionParam(params),
      });
    case 'address-summary':
      return getAddressSummary(params.get('address') ?? '');
    case 'tx-internal':
      return getTransactionInternalTransfers(params.get('hash') ?? '');
    case 'vault-keepers':
      return getVaultKeepers({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        activeOnly: params.get('active') === '1',
      });
    // Listed once. There were two `partitions` cases, and the first -- the one
    // without `activeOnly` -- is the one a switch reaches, so `?active=1` on
    // this dataset had never done anything.
    case 'partitions':
      return getPartitions({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        activeOnly: params.get('active') === '1',
      });
    case 'economic-participants':
      return getEconomicParticipants({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
      });
    case 'file-economics':
      return getFileEconomics({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
      });
    case 'transaction': {
      const hash = params.get('hash');
      return hash ? getTransactionDetail(hash) : null;
    }
    case 'pre-requests':
      return getPreRequests({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
      });
    case 'rollup-counts':
      return getRollupCounts();
    case 'deadlines':
      return getDeadlines({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
      });
    case 'sectors':
      return getSectors({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        activeOnly: params.get('active') === '1',
      });
    case 'file-policies':
      return getFilePolicies({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        activeOnly: params.get('active') === '1',
      });
    // One object rather than a list: the counts the storage screens show, which
    // are a set difference the event log cannot be aggregated into.
    case 'file-policy-counts':
      return getFilePolicyCounts();
    case 'partition-counts':
      return getPartitionCounts();
    case 'sector-counts':
      return getSectorCounts();
    case 'guardians':
      return getGuardians({
        limit: limit ?? 5000,
        cursor: typeof cursor === 'string' ? cursor : undefined,
        activeOnly: params.get('active') === '1',
      });
    case 'network-summary':
      return getNetworkSummary();
    case 'tx-receipts':
      return getTransactionReceipts(params.getAll('hash').filter(Boolean));
    case 'escrow-links':
      return getEscrowLinks({
        commitment: params.get('commitment') ?? undefined,
        payments: params.getAll('payment').filter(Boolean),
      });
    case 'guardian-rank':
    case 'vk-rank':
      return (dataset === 'guardian-rank' ? getGuardianRanking : getVaultKeeperRanking)({
        limit: limit ?? 30,
        cursor: typeof cursor === 'number' ? String(cursor) : undefined,
        search: params.get('q') ?? undefined,
      });
    default:
      return null;
  }
}

async function handleGET(
  request: Request,
  { params }: { params: Promise<{ dataset: string }> },
) {
  const { dataset } = await params;
  if (!isDataset(dataset)) {
    return NextResponse.json({ error: 'Unknown dataset' }, { status: 404 });
  }

  const url = new URL(request.url);

  const status = await store();
  if (status) {
    /**
     * The answer only changes when the indexer moves.
     *
     * So the tag is the question plus how far the store had got when it was
     * asked. Same question at the same block is the same answer, by
     * construction rather than by a guessed expiry -- which is what makes a 304
     * here honest instead of hopeful. A reader refreshing a screen every few
     * seconds on a chain that has not moved gets no body at all.
     */
    const etag = `W/"${dataset}:${BUILD_TAG}:${status.toBlock}:${
      Buffer.from([...url.searchParams].sort().join('&')).toString('base64url')
    }"`;

    if (request.headers.get('if-none-match') === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, 'Cache-Control': 'no-cache', 'X-Index-Source': `store:${status.store}` },
      });
    }

    // A store that fails a query is treated like a store that is absent: the
    // screen gets the file index or its own chain fallback, not a 500. One bad
    // query used to fail the whole address screen this way.
    let body: Awaited<ReturnType<typeof fromStore>> = null;
    try {
      body = await fromStore(dataset, url.searchParams, status);
    } catch (error) {
      console.error(`index ${dataset}: store query failed, falling back`, error);
      body = null;
    }
    // A store that has the events but has not projected the entities yet must
    // say so rather than answer with an empty list, or the screen would report a
    // network with no vault keepers in it instead of reading the chain.
    if (body !== null) {
      // Lists arrive in an envelope carrying where the next page starts.
      // `manifest` is a single object and stays one.
      const paged = Array.isArray(body)
        ? { rows: body, nextCursor: nextCursorFor(dataset, body, requestedLimit(url, dataset)) }
        : body;

      return NextResponse.json(paged, {
        headers: {
          ETag: etag,
          // no-cache, not no-store: revalidate every time, but a 304 is allowed.
          // no-store would forbid even asking, and the whole point is to ask
          // cheaply.
          'Cache-Control': 'no-cache',
          'X-Index-Source': `store:${status.store}`,
        },
      });
    }
  }

  if (dataset === 'address-transactions') {
    const rows = await addressTransactionsFromFiles(url.searchParams);
    if (rows !== null) {
      return NextResponse.json({ rows, nextCursor: null }, {
        headers: {
          'Cache-Control': 'no-store',
          'X-Index-Source': 'files',
          // The file index keeps only the most recent transactions, so this is
          // recent history rather than all of it, and the screen says so.
          'X-Index-Scope': 'recent',
        },
      });
    }
  }

  const data = await readDataset(dataset);
  if (data === null) {
    // Distinguishable from an empty index: a chain deployed an hour ago has a
    // perfectly good index holding nothing, and must not read as missing.
    return NextResponse.json({ error: 'No index' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }

  // Old indexes may still carry the private upstream URL. Never publish it.
  let body = data;
  if (dataset === 'manifest' && data && typeof data === 'object' && !Array.isArray(data)) {
    const publicManifest = { ...data } as Record<string, unknown>;
    delete publicManifest.rpcUrl;
    body = publicManifest;
  }

  if (dataset === 'events' && Array.isArray(data)) {
    body = filterEvents(data as IndexedEvent[], url.searchParams);
    // The file keeps events oldest first. A screen that pages newest first --
    // as the store always answers -- asks for that order, so a limit keeps the
    // recent end rather than the start of the chain.
    if (url.searchParams.get('order') === 'desc') body = (body as IndexedEvent[]).slice().reverse();
  }

  // The transaction list shows a time per row. The indexer now records it on the
  // transaction, so this only fills gaps left by an index built before it did --
  // and it fills them from the blocks still retained, which is why a rebuilt
  // index is the real fix rather than this. Joining here costs nothing either
  // way: both files are already open on this side, and the browser would
  // otherwise download every block to read one field.
  if (dataset === 'transactions' && url.searchParams.get('withBlockTime') === '1' && Array.isArray(body)) {
    const rows = body as Array<{ blockNumber?: string; blockTimestamp?: string }>;
    if (rows.some(tx => tx.blockTimestamp === undefined)) {
      const blocks = await readDataset('blocks');
      const times = new Map(
        (Array.isArray(blocks) ? blocks as Array<{ number?: string; timestamp?: string }> : [])
          .map(block => [String(block.number), block.timestamp]),
      );
      body = rows.map(tx => (tx.blockTimestamp !== undefined
        ? tx
        : { ...tx, blockTimestamp: times.get(String(tx.blockNumber)) }));
    }
  }

  // Newest first for the activity lists, so a limit keeps the recent end.
  const limit = Math.min(requestedLimit(url, dataset), DEFAULT_LIMIT[dataset] || 1000);
  if (Array.isArray(body)) {
    body = (body as unknown[]).slice(0, limit);
  }

  // Named so the two paths can be told apart from outside while both exist, and
  // wrapped the same way so a caller never has to ask which answered. The files
  // hand back whole datasets rather than pages, so there is no next cursor.
  return NextResponse.json(
    Array.isArray(body) ? { rows: body, nextCursor: null } : body,
    { headers: { 'Cache-Control': 'no-store', 'X-Index-Source': 'files' } },
  );
}

export async function GET(request: Request, context: { params: Promise<{ dataset: string }> }) {
  return guardRead(request, () => handleGET(request, context), { ttlMs: 2000 });
}
