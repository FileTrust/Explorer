import { publicClient } from './client';
import { CONTRACTS } from './addresses';
import { ABI_REGISTRY } from './abis/registry';
import {
  fetchIndexPage,
  fetchIndexedFileTrustEvents,
  fetchIndexedManifest,
  type IndexedFileTrustEvent,
  type IndexedManifest,
} from './indexedData';
import { matchesArgs, reviveArgs, subjectFromArgs, windowStart } from './indexedLogMatch.mjs';

/**
 * Reading past events from the index instead of replaying the chain.
 *
 * Every screen used to ask the chain for all logs from block zero. On a
 * one-second chain that is about 31 million blocks a year, so a single page load
 * became thousands of requests and grew worse every day; on a chain that caps
 * log ranges it is refused outright, and the screen simply goes blank. Cosmos
 * allows 10,000 blocks, which is about three hours.
 *
 * The indexer already reads each block once and keeps what it finds, so the
 * answer is sitting in a file next to the Explorer. This serves it in the shape
 * the screens already expect, so reading it is a change of source rather than a
 * rewrite of every screen.
 *
 * Exact lookups -- a transaction hash, an address -- should not come through
 * here at all. Those are direct queries to the node and cost the same on any
 * chain, however old.
 */

type AbiEventLike = { name?: string } | undefined;

export interface IndexedLogQuery {
  address?: `0x${string}` | readonly `0x${string}`[];
  event?: AbiEventLike;
  eventName?: string;
  /** Match on indexed event arguments, as the chain query did. Accepting and
   *  ignoring these would quietly return every event of that type instead of
   *  the ones asked for, which reads as working. */
  args?: Record<string, unknown>;
  /** How many rows to take. A screen showing a table wants a page, not a
   *  history: its totals come from the aggregate endpoint, which counts in the
   *  store, so bounding the fetch no longer bounds the numbers. */
  limit?: number;
  /** Whoever or whatever the events are about -- a vault keeper, a file id, a
   *  partition key. Matched on its own index in the store, so a detail screen
   *  asks for its own rows rather than taking a page of everything and throwing
   *  all but a handful away. */
  subject?: string;
  /** Fetch every event about `subject` once, and answer this query and every
   *  other one naming the same subject from it. For a screen about one file,
   *  which asks a few dozen questions about it: one indexed request instead of
   *  one per event type. */
  shareSubject?: boolean;
  /** Honoured so callers asking for a recent slice still get one. */
  fromBlock?: bigint;
  toBlock?: bigint | 'latest';
}

export interface DecodedLog {
  address: `0x${string}`;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
  logIndex: number;
  eventName?: string;
  args: Record<string, unknown>;
}

/** How far back to look when there is no index yet. Bounded on purpose: a fresh
 *  deployment should still show recent activity, and an unbounded request is the
 *  failure this whole change exists to remove. */
const FALLBACK_WINDOW_BLOCKS = 9_000n;

/**
 * How many rows one event query returns when the caller does not say.
 *
 * Every one of these used to be unbounded, so a screen with nineteen of them
 * could pull the whole history nineteen times to produce nineteen numbers. A
 * cap makes the worst case finite instead of a function of chain age.
 *
 * A screen that needs a *total* must not get it by measuring what came back --
 * that is the same mistake with a smaller number. Totals come from
 * `/api/index/aggregate`, which counts in the store; see `useEventCounts`.
 */
const DEFAULT_ROW_LIMIT = 5_000;

/**
 * Whether an index was built against the deployment being viewed.
 *
 * Two ways it can be stale. A different chain id is the obvious one. The subtler
 * one is the same chain with contracts redeployed: the ids match, the addresses
 * do not, and every lookup silently misses. Both are checked, because an index
 * that answers for something else is worse than no index -- it returns zero
 * instead of admitting it cannot say.
 */
async function indexMatchesChain(manifest: IndexedManifest) {
  const meta = manifest as unknown as { chainId?: unknown; contracts?: unknown };

  // Ask the node which chain this is, and fall back to the configured id when
  // it does not answer.
  //
  // This used to return false on any RPC failure, which quietly turned one
  // unreachable node into a dark Explorer: `indexAvailable` went false, every
  // screen abandoned the index it had, and each fell back to reading the chain
  // -- the very thing that was not answering. Screens rendered empty rather
  // than degraded, and nothing said why.
  //
  // The index does not stop being valid because a node timed out. Falling back
  // to the configured id keeps the same check with a weaker source: a
  // misconfigured deployment is still caught by the address overlap below,
  // which needs no network at all.
  let live: string;
  try {
    live = String(await publicClient.getChainId());
  } catch {
    live = String(publicClient.chain?.id ?? '');
  }
  if (live !== '' && String(meta.chainId ?? '') !== live) return false;

  const indexed = Array.isArray(meta.contracts)
    ? (meta.contracts as Array<{ address?: string }>)
        .map((c) => String(c?.address ?? '').toLowerCase())
        .filter(Boolean)
    : [];
  if (indexed.length === 0) return true; // nothing to compare against

  const current = Object.values(CONTRACTS).map((a) => String(a).toLowerCase());
  // One shared address is enough to say this is the same deployment; requiring
  // all of them would reject an index that simply predates a newly added
  // contract, which is stale in coverage but not wrong about what it holds.
  return current.some((address) => indexed.includes(address));
}

/** Whether an index exists at all, which is not the same as it holding events:
 *  a chain deployed an hour ago has a perfectly good index with nothing in it
 *  yet, and must not be mistaken for a missing one. */
let cache: { at: number; available: boolean } | null = null;
let inFlight: Promise<boolean> | null = null;
const CACHE_MS = 10_000;

/**
 * Ask once whether the index can be trusted, and share the answer.
 *
 * Only the manifest is read here. The events used to be loaded alongside it --
 * the whole file, to every screen -- which is the download `/api/index/events`
 * now avoids by filtering server-side. Availability is still decided up front
 * because every query needs it, and it is a few kilobytes however old the chain.
 */
async function indexAvailable(): Promise<boolean> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.available;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    // The manifest is what says an index exists. Judging by whether any events
    // came back would treat a new chain as having no index and send every
    // screen to the chain instead.
    const manifest = await fetchIndexedManifest();

    // An index only answers for the deployment it was built against. A leftover
    // one from another chain, or from contracts since redeployed, contains
    // nothing matching today's addresses -- so every count comes back zero and
    // the screen looks empty rather than broken. Treat it as absent.
    const usable = manifest !== null && (await indexMatchesChain(manifest));
    cache = { at: Date.now(), available: usable };
    inFlight = null;
    return usable;
  })();
  return inFlight;
}

/** Slices already fetched this tick. Screens ask for the same event more than
 *  once per render pass, and each ask is now its own request. */
let sliceCache: { at: number; slices: Map<string, IndexedFileTrustEvent[]> } | null = null;

async function fetchSlice(
  addresses: string[],
  eventName: string | undefined,
  limit?: number,
  subject?: string,
  fromBlock?: bigint,
  toBlock?: bigint,
): Promise<IndexedFileTrustEvent[]> {
  const key = `${addresses.join(',')}|${eventName ?? ''}|${limit ?? ''}|${subject ?? ''}|${fromBlock ?? ''}|${toBlock ?? ''}`;
  const now = Date.now();
  if (!sliceCache || now - sliceCache.at >= CACHE_MS) {
    sliceCache = { at: now, slices: new Map() };
  }
  const hit = sliceCache.slices.get(key);
  if (hit) return hit;

  const rows = (await fetchIndexedFileTrustEvents({
    address: addresses,
    event: eventName,
    limit,
    subject,
    fromBlock: fromBlock === undefined ? undefined : String(fromBlock),
    toBlock: toBlock === undefined ? undefined : String(toBlock),
  })) ?? [];
  sliceCache.slices.set(key, rows);
  return rows;
}

/** Everything about one subject, fetched once per tick and shared. */
let subjectCache: { at: number; subjects: Map<string, Promise<IndexedFileTrustEvent[]>> } | null = null;
const SUBJECT_PAGE = 5_000;
/// A file with more history than this is shown in part rather than not at all.
const SUBJECT_MAX = 50_000;

function fetchSubject(subject: string): Promise<IndexedFileTrustEvent[]> {
  const key = subject.toLowerCase();
  const now = Date.now();
  if (!subjectCache || now - subjectCache.at >= CACHE_MS) {
    subjectCache = { at: now, subjects: new Map() };
  }
  const hit = subjectCache.subjects.get(key);
  if (hit) return hit;
  const pending = (async () => {
    const rows: IndexedFileTrustEvent[] = [];
    let cursor: string | undefined;
    do {
      const page = await fetchIndexPage<IndexedFileTrustEvent>('events', {
        subject: key, limit: SUBJECT_PAGE, cursor,
      });
      if (!page) break;
      rows.push(...page.rows);
      cursor = page.nextCursor ?? undefined;
    } while (cursor && rows.length < SUBJECT_MAX);
    return rows;
  })();
  subjectCache.subjects.set(key, pending);
  return pending;
}

/**
 * Whether the counts drawn from past events are complete.
 *
 * False means there is no index, so anything counted from history is whatever
 * the bounded fallback window happened to see -- a few hours of a chain that may
 * be years old. Those numbers are not totals, and a screen showing them as
 * totals is lying quietly, which is worse than showing nothing.
 */
export async function indexIsAvailable(): Promise<boolean> {
  return indexAvailable();
}

function toDecoded(event: IndexedFileTrustEvent): DecodedLog {
  return {
    address: event.address,
    blockNumber: BigInt(event.blockNumber ?? 0),
    transactionHash: event.transactionHash,
    logIndex: Number(event.logIndex ?? 0),
    eventName: event.name,
    // The chain path hands screens real bigints; without this the indexed path
    // hands them digits as strings, and the first `0n + amount` throws.
    args: reviveArgs((event.args ?? {}) as Record<string, unknown>),
  };
}

/**
 * Past occurrences of one event, newest last, from the index.
 *
 * Falls back to a bounded recent window when there is no index yet -- a fresh
 * chain, or the indexer not run. Partial recent data is a reasonable answer;
 * asking the chain for everything is not, which is why the fallback is windowed
 * rather than unbounded.
 */
export async function getIndexedLogs(query: IndexedLogQuery): Promise<DecodedLog[]> {
  const wanted = query.eventName ?? query.event?.name;
  const addresses = new Set(
    (Array.isArray(query.address) ? query.address : query.address ? [query.address] : [])
      .map((a) => String(a).toLowerCase()),
  );

  if (await indexAvailable()) {
    const from = query.fromBlock;
    const to = query.toBlock === 'latest' ? undefined : query.toBlock;
    // Address and event name are applied by the route, so what arrives is
    // already the slice asked for. They are re-checked here anyway: the filter
    // is cheap on a slice, and it keeps this correct if the route ever answers
    // more broadly than it was asked.
    // Push an `args` filter down to its indexed column when one of them is a
    // subject. A detail screen asking for "this vault keeper's events" then gets
    // its own rows instead of a page of everything, filtered afterwards to a
    // handful. `matchesArgs` still runs below, so a filter that cannot be pushed
    // down is applied in memory exactly as before.
    const subject = query.subject ?? subjectFromArgs(query.args) ?? undefined;
    // The block window goes to the server too.
    //
    // It was computed here and then applied to the rows after they arrived, so
    // asking for "the last 200 blocks" downloaded the entire stream and threw
    // most of it away -- 74 KB for the activity feed on the dashboard, which is
    // the one place on the site that genuinely only wants a recent window. The
    // range is filtered again below for the same reason the address and name
    // are: cheap on a slice, and correct if the route ever answers more broadly
    // than it was asked.
    const events = query.shareSubject && query.subject
      ? await fetchSubject(query.subject)
      : await fetchSlice(
        [...addresses], wanted, query.limit ?? DEFAULT_ROW_LIMIT, subject, from, to,
      );
    return events
      .filter((e) => (addresses.size === 0 || addresses.has(String(e.address).toLowerCase()))
        && (!wanted || e.name === wanted))
      .map(toDecoded)
      .filter((log) => (from === undefined || log.blockNumber >= from)
        && (to === undefined || log.blockNumber <= to)
        && matchesArgs(log.args, query.args))
      .sort((a, b) =>
        a.blockNumber === b.blockNumber
          ? a.logIndex - b.logIndex
          : (a.blockNumber < b.blockNumber ? -1 : 1));
  }

  if (!query.address) return [];
  try {
    const head = await publicClient.getBlockNumber();
    // Never widen past the window, even when the caller asked for more: an
    // unbounded range is exactly what a capped chain refuses.
    const earliest = windowStart(head, FALLBACK_WINDOW_BLOCKS);
    const fromBlock = query.fromBlock !== undefined && query.fromBlock > earliest
      ? query.fromBlock
      : earliest;
    const logs = await publicClient.getLogs({
      address: query.address as never,
      ...(query.event ? { events: ABI_REGISTRY.filter(row=>addresses.has(row.address.toLowerCase()))
        .flatMap(row=>row.abi.filter(event=>event.type==='event' && event.name===wanted))
        .concat([query.event]) as never } : {}),
      fromBlock,
      toBlock: query.toBlock ?? 'latest',
    });
    return (logs as unknown as Array<Record<string, unknown>>).map((log) => ({
      address: log.address as `0x${string}`,
      blockNumber: BigInt((log.blockNumber as bigint | undefined) ?? 0n),
      transactionHash: log.transactionHash as `0x${string}`,
      logIndex: Number(log.logIndex ?? 0),
      eventName: wanted,
      args: (log.args ?? {}) as Record<string, unknown>,
    })).filter(log=>matchesArgs(log.args,query.args));
  } catch {
    return [];
  }
}

/**
 * The query options that limit a reader to one file.
 *
 * The events behind DKG rounds, PRE requests, access requests, data batches and
 * policies all name the file id, and the store indexes events by it. So a screen
 * about one file passes this to each of those readers, and they are all answered
 * from one indexed request about that file instead of each reading the network.
 */
export function fileScope(fileId?: string): Pick<IndexedLogQuery, 'subject' | 'shareSubject'> {
  return fileId ? { subject: fileId, shareSubject: true } : {};
}

/** Forget the cached index, so a refresh picks up a newer one. */
export function resetIndexedLogCache() {
  cache = null;
  inFlight = null;
  sliceCache = null;
  subjectCache = null;
}
