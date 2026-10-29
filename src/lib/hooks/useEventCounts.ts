'use client';

import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { fetchIndexPage } from '@/lib/indexedData';
import { reviveArgs } from '@/lib/indexedLogMatch.mjs';

/**
 * Totals from the store, without fetching the rows behind them.
 *
 * Screens compute their headline numbers by pulling every matching event and
 * taking `.length`. That is the one shape paging cannot rescue: a page is not a
 * total, so the screen genuinely needs every row — and at a billion events they
 * do not fit in the tab.
 *
 * The store can count them where they are. Twenty-nine bytes instead of one and
 * a half megabytes here, and still twenty-nine bytes at a billion.
 *
 * Returns null when there is no store to ask, so a caller keeps whatever it
 * counted itself rather than replacing a real number with a zero.
 */

export interface EventFilter {
  contract?: string;
  event?: string;
  address?: string;
}

async function aggregate(params: Record<string, string | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) query.set(key, value);
  }
  const res = await fetch(`/api/index/aggregate?${query}`, { cache: 'default' }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json();
}

/**
 * Counts for a list of event names, across every contract, in one request.
 * Null without a store. A name that never occurred is simply absent from the
 * map, so a caller reads it as zero.
 */
export async function countEventsByName(names: string[]): Promise<Record<string, number> | null> {
  const query = new URLSearchParams({ op: 'count', group: 'event' });
  for (const name of names) query.append('event', name);
  const res = await fetch(`/api/index/aggregate?${query}`, { cache: 'default' }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body?.groups) return null;
  return Object.fromEntries(
    body.groups.map((g: { key: string; value: string }) => [g.key, Number(g.value)]),
  );
}

export function useEventCountsForNames(names: string[], enabled = true) {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: ['event-counts-for-names', names],
    enabled,
    queryFn: () => countEventsByName(names),
    refetchInterval,
    staleTime: 10_000,
  });
}

/// One count, by contract and event name.
export function useEventCount(filter: EventFilter, enabled = true) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['event-count', filter],
    enabled,
    queryFn: async (): Promise<number | null> => {
      const body = await aggregate({ op: 'count', ...filter });
      return body ? Number(body.total) : null;
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * Every event of one contract, counted and grouped, in a single request.
 *
 * One round trip for a whole screen's worth of totals, rather than one per
 * number. The result is a map from event name to count, so a screen reads
 * `counts.SectorProofSubmitted` where it used to filter an array it had
 * downloaded.
 */
export function useEventCountsByName(contract: string | undefined, enabled = true) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['event-counts-by-name', contract],
    enabled: enabled && Boolean(contract),
    queryFn: async (): Promise<Record<string, number> | null> => {
      const body = await aggregate({ op: 'count', group: 'event', contract });
      if (!body?.groups) return null;
      return Object.fromEntries(
        body.groups.map((g: { key: string; value: string }) => [g.key, Number(g.value)]),
      );
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * A sum of one numeric event argument.
 *
 * `matchedRowsCarryingArg` is passed through because a sum of zero and a sum
 * over an argument that does not exist look identical, and the second is a
 * question asked wrongly rather than an answer worth showing.
 */
export function useEventSum(arg: string, filter: EventFilter, enabled = true) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['event-sum', arg, filter],
    enabled,
    queryFn: async (): Promise<{ total: bigint; rows: number } | null> => {
      const body = await aggregate({ op: 'sum', arg, ...filter });
      if (!body || body.warning) return null;
      return {
        total: BigInt(body.total ?? 0),
        rows: Number(body.matchedRowsCarryingArg ?? 0),
      };
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * Every event of one contract, summed on one argument, in a single request.
 *
 * The counting twin of `useEventCountsByName`, for the screens whose headline
 * figures are totals of wei rather than tallies of rows. One round trip returns
 * a sum per event name, so a screen that showed five money figures by reducing
 * five downloaded arrays now shows them from one answer.
 *
 * Sums come back as strings and are returned as bigints: a total of wei does not
 * fit in a double, and rounding it quietly would be worse than refusing.
 */
export function useEventSumsByName(contract: string | undefined, arg: string, enabled = true) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['event-sums-by-name', contract, arg],
    enabled: enabled && Boolean(contract),
    queryFn: async (): Promise<Record<string, bigint> | null> => {
      const body = await aggregate({ op: 'sum', arg, group: 'event', contract });
      if (!body?.groups) return null;
      return Object.fromEntries(
        body.groups.map((g: { key: string; value: string }) => [g.key, BigInt(g.value ?? 0)]),
      );
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * How many distinct values one event argument takes.
 *
 * The question most of these screens are actually asking. "Total sessions" is
 * not how many DKG events there were, it is how many distinct session ids appear
 * among them -- one session emits several events, so counting rows overstates it
 * every time. Same for access requests and file commitments.
 *
 * Counted exactly, not approximately: a total that is nearly right is the
 * failure this work exists to remove.
 */
export function useDistinctArg(
  arg: string | string[],
  filter: EventFilter = {},
  enabled = true,
) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['distinct-arg', arg, filter],
    enabled,
    queryFn: async (): Promise<number | null> => {
      // Several names count a composite identity: a DKG session is a file and a
      // key epoch together, and counting file ids alone would merge every
      // re-keying of one file into a single session.
      const query = new URLSearchParams({ op: 'distinct' });
      for (const [k, v] of Object.entries(filter)) if (v) query.set(k, v);
      for (const name of Array.isArray(arg) ? arg : [arg]) query.append('arg', name);
      const res = await fetch(`/api/index/aggregate?${query}`, { cache: 'default' }).catch(() => null);
      if (!res || !res.ok) return null;
      const body = await res.json();
      return body && !body.error ? Number(body.total) : null;
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/// How many distinct subjects an event set touched — participants, keepers,
/// files — counted in the store rather than by collecting them in a Set.
export function useDistinctSubjects(
  field: 'subject_addr' | 'subject_key',
  filter: EventFilter = {},
  enabled = true,
) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['distinct-subjects', field, filter],
    enabled,
    queryFn: async (): Promise<number | null> => {
      const body = await aggregate({ op: 'distinct', field, ...filter });
      return body ? Number(body.total) : null;
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * One page of any indexed dataset, with the cursor that continues it.
 *
 * The generic form of what `/txs` does. A table backed by this holds a page
 * rather than a dataset, so what the browser carries stops depending on how much
 * there is — which is the difference between a screen that works on a young
 * chain and one that works on an old one.
 *
 * `rows` accumulates across pages so the table can still sort and filter what
 * has been loaded; `hasMore` is the cursor being non-null, so the end of the
 * data announces itself rather than being calculated.
 */
/**
 * Counts split by the value of an event argument, in one request.
 *
 * Some numbers a screen shows depend on what an event said, not on which event
 * it was -- a proof that verified against one that did not, a request by its
 * status. Grouping by name cannot separate those, so screens sampled the rows
 * they had downloaded and scaled the ratio up to the counted total. That was a
 * guess wearing a total's clothes, and once a list is paged the sample is one
 * page and the guess is wrong.
 *
 * Values arrive as strings, since an argument's value is text in the store.
 */
export function useEventCountsByArg(
  contract: string | undefined,
  arg: string,
  events?: readonly string[],
  enabled = true,
) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['event-counts-by-arg', contract, arg, events],
    enabled: enabled && Boolean(contract),
    queryFn: async (): Promise<Record<string, number> | null> => {
      const query = new URLSearchParams({ op: 'count', group: `arg:${arg}` });
      if (contract) query.set('contract', contract);
      for (const name of events ?? []) query.append('event', name);
      const res = await fetch(`/api/index/aggregate?${query}`, { cache: 'default' }).catch(() => null);
      if (!res || !res.ok) return null;
      const body = await res.json();
      if (!body?.groups) return null;
      return Object.fromEntries(
        body.groups.map((g: { key: string; value: string }) => [g.key, Number(g.value ?? 0)]),
      );
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

export function usePagedIndex<T>(
  dataset: string,
  params: Record<string, string | string[] | number | undefined> = {},
  pageSize = 200,
) {
  const refetchInterval = useAutoRefreshInterval();

  const query = useInfiniteQuery({
    queryKey: ['paged-index', dataset, params, pageSize],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await fetchIndexPage<T>(dataset, { ...params, limit: pageSize, cursor: pageParam });
      return page ?? { rows: [] as T[], nextCursor: null };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval,
    staleTime: 10_000,
  });

  return {
    ...query,
    rows: query.data?.pages.flatMap((p) => p.rows) ?? [],
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
  };
}

/**
 * A table whose rows are events, paged in block order.
 *
 * I had this wrong: these lists looked like entities assembled from several
 * streams and are nothing of the kind. Each row is one event -- proofs,
 * disputes, escrow movements, rewards -- and the hooks only *appeared* to merge
 * because they fetched each event type separately and concatenated. The store
 * already returns several event names as one stream ordered by block and log
 * index, which is exactly the list the screen wanted, and a cursor pages it.
 *
 * `map` turns one stored event into one display row, and is given the row it
 * came from so a screen can keep whatever shape it already renders.
 *
 * Returns null rows and `hasMore: false` when there is no store, so a caller
 * falls back to whatever it built itself.
 */
/**
 * A paged primary stream, with other streams joined over the window it covers.
 *
 * Some tables are one row per event but are not complete without a second
 * stream: a file's registration says nothing about whether it was later deleted,
 * a batch's creation nothing about how many pieces it ended up holding. Those
 * cannot be paged alongside the first, and downloading them whole is what paging
 * exists to stop.
 *
 * They do not have to be. Every one of these joins is *later news about an
 * earlier thing* -- a deletion, a fulfilment, a migration all happen at or after
 * the event that introduced the subject. So every joining row that belongs to a
 * loaded page lies at or above the oldest block on that page, and bounding the
 * join there is exact rather than approximate. The table is newest-first, so the
 * window is the recent tail and grows only as the reader asks for more.
 *
 * `joins` names the events to fetch; the map is given them alongside the page.
 */
export function usePagedWithJoins<T>(
  contract: string,
  // Several names when the rows come from more than one stream -- a DKG session
  // is finalized or it expires, and both are the row.
  event: string | readonly string[],
  joins: readonly string[],
  map: (
    rows: Array<{ name?: string; args: Record<string, unknown>; blockNumber: string; transactionHash: string }>,
    // Joined rows carry their block too: a screen often wants when the later
    // news arrived, not only that it did.
    joined: Record<string, Array<{ args: Record<string, unknown>; blockNumber?: string; transactionHash?: string }>>,
  ) => T[],
  pageSize = 200,
) {
  const paged = usePagedIndex<{
    name?: string; args?: Record<string, unknown>; blockNumber: string; transactionHash: string;
  }>('events', {
    contract,
    event: [...(Array.isArray(event) ? event : [event])] as string[],
  }, pageSize);

  const fromBlock = paged.rows.length === 0 ? undefined : paged.rows.reduce(
    (lowest, r) => (BigInt(r.blockNumber) < BigInt(lowest) ? r.blockNumber : lowest),
    paged.rows[0].blockNumber,
  );

  const results = useQueries({
    queries: joins.map((name) => ({
      queryKey: ['paged-join', contract, name, fromBlock],
      queryFn: async () => {
        if (fromBlock === undefined) return [];
        const query = new URLSearchParams({ contract, event: name, fromBlock, limit: '5000' });
        const res = await fetch(`/api/index/events?${query}`, { cache: 'default' }).catch(() => null);
        if (!res || !res.ok) return [];
        const body = await res.json();
        return (body?.rows ?? []).map((r: {
          args?: Record<string, unknown>; blockNumber?: string; transactionHash?: string;
        }) => ({
          args: reviveArgs(r.args ?? {}) as Record<string, unknown>,
          blockNumber: r.blockNumber,
          transactionHash: r.transactionHash,
        }));
      },
      enabled: fromBlock !== undefined,
      staleTime: 10_000,
    })),
  });

  const joined: Record<string, Array<{
    args: Record<string, unknown>; blockNumber?: string; transactionHash?: string;
  }>> = {};
  joins.forEach((name, i) => { joined[name] = results[i]?.data ?? []; });

  const primary = paged.rows.map(row => ({
    name: row.name,
    args: reviveArgs(row.args ?? {}) as Record<string, unknown>,
    blockNumber: row.blockNumber,
    transactionHash: row.transactionHash,
  }));

  return { ...paged, rows: map(primary, joined) };
}

export function usePagedEventRows<T>(
  // Several contracts when a screen's rows come from more than one -- disputes
  // are raised in three, and the store orders them into one stream all the same.
  contract: string | readonly string[],
  events: readonly string[],
  map: (row: {
    name?: string;
    args?: Record<string, unknown>;
    blockNumber: string;
    transactionHash: string;
  }) => T | null,
  pageSize = 200,
) {
  const paged = usePagedIndex<{
    name?: string;
    args?: Record<string, unknown>;
    blockNumber: string;
    transactionHash: string;
  }>('events', {
    contract: [...(Array.isArray(contract) ? contract : [contract])] as string[],
    event: [...events],
    // The store always answers newest first. The file index keeps events oldest
    // first and is reversed only when asked, so without this a screen with no
    // store showed the oldest page of its newest-first list.
    order: 'desc',
  }, pageSize);

  return {
    ...paged,
    // Rows a map rejects are dropped rather than rendered blank: an event this
    // screen does not know how to show is not a row with empty cells.
    rows: paged.rows
      // Numbers arrive as digits, since JSON holds no bigint. The same revival
      // every other reader of these rows uses.
      .map(row => ({ ...row, args: reviveArgs(row.args ?? {}) }))
      .map(map)
      .filter((row): row is T => row !== null),
  };
}
