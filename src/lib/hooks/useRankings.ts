'use client';

import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { fetchIndexPage } from '@/lib/indexedData';
import { reviveArgs } from '@/lib/indexedLogMatch.mjs';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { useNetworkSummary } from '@/lib/hooks/useNetworkSummary';
import { useGuardians, type GuardianProfile } from '@/lib/hooks/useGuardians';
import { useVaultKeepers, type VKProfile } from '@/lib/hooks/useVaultKeepers';

/**
 * The leaderboard formulas.
 *
 * The store computes the same ones in SQL (repository.mjs, RANK_SCORE), so the
 * rankings screen can ask for a page instead of downloading every row. These
 * stay for an Explorer without a store, and as the reference the store is
 * checked against.
 */
export function stakePoints(stake: bigint) {
  if (stake <= 0n) return 0;
  const wholeFtu = Number(stake / 1_000_000_000_000_000_000n);
  return Math.min(100, Math.round(Math.log10(wholeFtu + 1) * 25));
}

export function guardianScore(g: GuardianProfile) {
  const totalJobs = g.completedJobs + g.failedJobs;
  const success = totalJobs > 0 ? Math.round((g.completedJobs / totalJobs) * 100) : 0;
  const disputePenalty = Math.min(200, g.disputes * 25);
  return Math.max(0, g.reputationScore + stakePoints(g.stake) + success + (g.active ? 50 : 0) - disputePenalty);
}

export function vkScore(vk: VKProfile, now: bigint) {
  const suspendedPenalty = vk.suspendedUntil > now ? 250 : 0;
  return Math.max(0, vk.reputation + stakePoints(vk.stake) + (vk.active ? 50 : 0) - suspendedPenalty);
}

export type Ranked<T> = T & { rank: number; rankScore: number };

/// Score, sort and number a whole list: score first, then reputation, then
/// address -- the order the store uses.
function rankAll<T extends { address: string }>(
  rows: T[], score: (row: T) => number, reputation: (row: T) => number,
): Ranked<T>[] {
  return rows
    .map(row => ({ ...row, rankScore: score(row) }))
    .sort((a, b) => b.rankScore - a.rankScore
      || reputation(b) - reputation(a)
      || (a.address.toLowerCase() < b.address.toLowerCase() ? -1 : a.address.toLowerCase() > b.address.toLowerCase() ? 1 : 0))
    .map((row, i) => ({ ...row, rank: i + 1 }));
}

/// One page of the store's leaderboard at a time. `unavailable` when there is no
/// store to ask, or its rows are not projected yet.
function useStoreRanking<T>(dataset: 'guardian-rank' | 'vk-rank', search: string, pageSize: number) {
  const refetchInterval = useAutoRefreshInterval();
  const query = useInfiniteQuery({
    queryKey: ['ranking', dataset, search, pageSize],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await fetchIndexPage<Record<string, unknown>>(dataset, {
        limit: pageSize, cursor: pageParam, q: search || undefined,
      });
      return page
        ? { ...page, unavailable: false }
        : { rows: [] as Record<string, unknown>[], nextCursor: null, unavailable: true };
    },
    getNextPageParam: last => last.nextCursor ?? undefined,
    refetchInterval,
    staleTime: 10_000,
  });
  const rows = useMemo(
    () => (query.data?.pages ?? []).flatMap(page => page.rows)
      .map(row => reviveArgs(row) as unknown as Ranked<T>),
    [query.data],
  );
  return {
    query,
    rows,
    unavailable: Boolean(query.data?.pages[0]?.unavailable),
  };
}

export interface RankingView<T> {
  rows: Ranked<T>[];
  /** Everyone on the board, before any search. */
  total: number | undefined;
  /** First place on the whole board, before any search. */
  top: Ranked<T> | undefined;
  isLoading: boolean;
  error: unknown;
  refetch: () => unknown;
  hasMore: boolean;
  loadMore: () => unknown;
  loadingMore: boolean;
}

/**
 * The leaderboard for one kind of participant.
 *
 * Scored and sorted in the store, a page at a time: the screen used to download
 * every Guardian and every vault keeper and sort them in the browser, which stops
 * at 5,000 rows. The whole list is fetched only when there is no store.
 *
 * A row's rank is its place on the whole board. A search narrows which rows are
 * shown, not the places they hold.
 */
function useRanking<T extends { address: string }>(
  dataset: 'guardian-rank' | 'vk-rank',
  search: string,
  pageSize: number,
  // The whole list, for when the store has no answer. Fetched only then.
  useList: (enabled: boolean) => { data?: T[]; isLoading: boolean; error: unknown; refetch: () => unknown },
  score: (row: T) => number,
  reputation: (row: T) => number,
  total: number | undefined,
): RankingView<T> {
  // First place on the whole board, which is also how the store is probed: no
  // answer here means no store, or no rows projected yet.
  const top = useStoreRanking<T>(dataset, '', 1);
  const store = useStoreRanking<T>(dataset, search, pageSize);
  const unavailable = top.unavailable;
  const list = useList(unavailable);

  const ranked = useMemo(
    () => (unavailable && list.data ? rankAll(list.data, score, reputation) : []),
    [unavailable, list.data, score, reputation],
  );

  if (!unavailable) {
    return {
      rows: store.rows,
      total,
      top: top.rows[0],
      isLoading: top.query.isLoading || store.query.isLoading,
      error: store.query.error,
      refetch: () => store.query.refetch(),
      hasMore: Boolean(store.query.hasNextPage),
      loadMore: () => store.query.fetchNextPage(),
      loadingMore: store.query.isFetchingNextPage,
    };
  }

  const q = search.toLowerCase();
  return {
    rows: q ? ranked.filter(row => row.address.toLowerCase().includes(q)) : ranked,
    total: list.data?.length,
    top: ranked[0],
    isLoading: list.isLoading,
    error: list.error,
    refetch: list.refetch,
    hasMore: false,
    loadMore: () => undefined,
    loadingMore: false,
  };
}

const useGuardianList = (enabled: boolean) => useGuardians({ enabled });
const useVaultKeeperList = (enabled: boolean) => useVaultKeepers({ enabled });
const guardianReputation = (g: GuardianProfile) => g.reputationScore;
const vkReputation = (vk: VKProfile) => vk.reputation;

export function useGuardianRanking(search: string, pageSize = 100): RankingView<GuardianProfile> {
  const summary = useNetworkSummary();
  return useRanking<GuardianProfile>(
    'guardian-rank', search, pageSize, useGuardianList,
    guardianScore, guardianReputation, summary.data?.guardians?.count,
  );
}

export function useVaultKeeperRanking(search: string, now: bigint, pageSize = 100): RankingView<VKProfile> {
  const summary = useNetworkSummary();
  // The clock matters only to the list path; the store reads its own.
  const score = useMemo(() => (vk: VKProfile) => vkScore(vk, now), [now]);
  return useRanking<VKProfile>(
    'vk-rank', search, pageSize, useVaultKeeperList,
    score, vkReputation, summary.data?.vaultKeepers?.count,
  );
}
