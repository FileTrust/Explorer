'use client';

import { useQuery } from '@tanstack/react-query';
import { useAutoRefreshInterval } from '@/lib/refresh';

export interface PriceAverage {
  /** Over the members that set a price above zero. */
  average: number;
  /** How many members that is; zero means none set one. */
  count: number;
}

/// Bytes as decimal digits, as the store sends them.
export interface StoreCapacitySummary {
  totalCapacityBytes: string;
  activeDeclaredCapacityBytes: string;
  activeConservativeAvailableBytes: string;
  activeRegisteredDataBytes: string;
  freshActiveProofCapacityBytes: string;
  activeCapacityDivergenceBytes: string;
}

export interface NetworkSummary {
  /** Null when the Guardian rows have not been projected yet. */
  guardians: {
    count: number;
    dkgMaterialSu: PriceAverage;
    dkgShareKeySu: PriceAverage;
    preBatchPartialSu: PriceAverage;
  } | null;
  /** Null when the vault keeper rows have not been projected yet. */
  vaultKeepers: {
    count: number;
    storageFee: PriceAverage;
    capacity: StoreCapacitySummary;
  } | null;
}

/**
 * Average service prices and fleet capacity, worked out in the store.
 *
 * The dashboard and the storage screen used to download every Guardian and
 * every vault keeper row to sum and average these in the browser -- a whole
 * table per visit, and wrong past the 5,000-row cap. This is one small answer
 * whatever the size of the network.
 *
 * `data` is null when there is no store to ask; each half is null when its rows
 * have not been projected. Either way the caller falls back to the lists, which
 * is the right cost on a small network without a store.
 */
export function useNetworkSummary() {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: ['network-summary'],
    queryFn: async (): Promise<NetworkSummary | null> => {
      const res = await fetch('/api/index/network-summary', { cache: 'default' }).catch(() => null);
      if (!res || !res.ok) return null;
      return res.json() as Promise<NetworkSummary>;
    },
    refetchInterval,
    staleTime: 10_000,
  });
}
