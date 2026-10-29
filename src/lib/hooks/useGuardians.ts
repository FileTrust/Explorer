'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { GuardianRegistryABI } from '@/lib/abis/GuardianRegistry';
import { ReputationManagerABI } from '@/lib/abis/ReputationManager';
import { StakingManagerABI } from '@/lib/abis/StakingManager';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { fetchIndexedGuardians } from '@/lib/indexedData';
import { reviveArgs } from '@/lib/indexedLogMatch.mjs';
import { usePagedIndex } from '@/lib/hooks/useEventCounts';
import { getIndexedLogs } from '@/lib/indexedLogs';

export interface GuardianProfile {
  address: `0x${string}`;
  stake: bigint;
  availableStake: bigint;
  lockedStake: bigint;
  reputationScore: number;
  completedJobs: number;
  failedJobs: number;
  disputes: number;
  completedDKG: number;
  failedDKG: number;
  completedPRE: number;
  failedPRE: number;
  dkgComplaints: number;
  preComplaints: number;
  penaltyPoints: number;
  readyButNotUsedPRE: number;
  missedShareProofPenalties: number;
  lastActivityAt: bigint;
  active: boolean;
  registeredAt: bigint;
  lastHeartbeat: bigint;
  metadataURI: string;
  dkgMaterialSu: bigint;
  dkgShareKeySu: bigint;
  preBatchPartialSu: bigint;
  dailyShareCustodySu: bigint;
  maxServiceDays: bigint;
}

/// `enabled: false` lets a screen that has the store's answer skip the list.
export function useGuardians({ enabled = true }: { enabled?: boolean } = {}) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['guardians'],
    enabled,
    queryFn: async (): Promise<GuardianProfile[]> => {
      // Rows first. What follows reads six fields per guardian straight from the
      // contracts, which does not scale: the cost follows the number of
      // guardians, on every page load, for every reader. The chain path stays as
      // the fallback for an Explorer with no store.
      const projected = await fetchIndexedGuardians();
      if (projected) return projected.map(row => reviveArgs(row) as unknown as GuardianProfile);

      const addresses = await publicClient.readContract({
        address: CONTRACTS.GuardianRegistry,
        abi: GuardianRegistryABI,
        functionName: 'getAllGuardians',
      });

      const [profiles, services, reputationStats, shareProofPenalties, availableStakes, lockedStakes] = await Promise.all([
        Promise.all(
          addresses.map(addr =>
            publicClient.readContract({
              address: CONTRACTS.GuardianRegistry,
              abi: GuardianRegistryABI,
              functionName: 'getGuardian',
              args: [addr],
            }).catch(() => null)
          )
        ),
        Promise.all(
          addresses.map(addr =>
            publicClient.readContract({
              address: CONTRACTS.GuardianRegistry,
              abi: GuardianRegistryABI,
              functionName: 'getGuardianServiceInfo',
              args: [addr],
            }).catch(() => null)
          )
        ),
        Promise.all(
          addresses.map(addr =>
            publicClient.readContract({
              address: CONTRACTS.ReputationManager,
              abi: ReputationManagerABI,
              functionName: 'getGuardianStats',
              args: [addr],
            }).catch(() => null)
          )
        ),
        Promise.all(
          addresses.map(addr =>
            publicClient.readContract({
              address: CONTRACTS.ReputationManager,
              abi: ReputationManagerABI,
              functionName: 'getTotalShareProofPenalties',
              args: [addr],
            }).catch(() => 0)
          )
        ),
        Promise.all(
          addresses.map(addr =>
            publicClient.readContract({
              address: CONTRACTS.StakingManager,
              abi: StakingManagerABI,
              functionName: 'availableStake',
              args: [addr],
            }).catch(() => 0n)
          )
        ),
        Promise.all(
          addresses.map(addr =>
            publicClient.readContract({
              address: CONTRACTS.StakingManager,
              abi: StakingManagerABI,
              functionName: 'lockedStakeOf',
              args: [addr],
            }).catch(() => 0n)
          )
        ),
      ]);

      return profiles
        .map((p, i) => {
          if (!p) return null;
          const service = services[i] as any;
          const stats = reputationStats[i] as any;
          const completedDKG = Number(stats?.completedDKG ?? stats?.[1] ?? 0);
          const failedDKG = Number(stats?.failedDKG ?? stats?.[2] ?? 0);
          const completedPRE = Number(stats?.completedPRE ?? stats?.[3] ?? 0);
          const failedPRE = Number(stats?.failedPRE ?? stats?.[4] ?? 0);
          const dkgComplaints = Number(stats?.dkgComplaints ?? stats?.[5] ?? 0);
          const preComplaints = Number(stats?.preComplaints ?? stats?.[6] ?? 0);
          return {
            address: addresses[i],
            stake: p.stake,
            availableStake: BigInt(availableStakes[i] ?? 0n),
            lockedStake: BigInt(lockedStakes[i] ?? 0n),
            reputationScore: Number(stats?.reputationScore ?? stats?.[0] ?? p.reputationScore),
            completedJobs: completedDKG + completedPRE || Number(p.completedJobs ?? 0),
            failedJobs: failedDKG + failedPRE || Number(p.failedJobs ?? 0),
            disputes: dkgComplaints + preComplaints || Number(p.disputes ?? 0),
            completedDKG,
            failedDKG,
            completedPRE,
            failedPRE,
            dkgComplaints,
            preComplaints,
            penaltyPoints: Number(stats?.penaltyPoints ?? stats?.[7] ?? 0),
            readyButNotUsedPRE: Number(stats?.readyButNotUsedPRE ?? stats?.[9] ?? 0),
            missedShareProofPenalties: Number(shareProofPenalties[i] ?? 0),
            lastActivityAt: BigInt(stats?.lastActivityAt ?? stats?.[8] ?? 0n),
            active: p.active,
            registeredAt: p.registeredAt,
            lastHeartbeat: p.lastHeartbeat,
            metadataURI: p.metadataURI,
            dkgMaterialSu: BigInt(service?.dkgMaterialSu ?? service?.[0] ?? 0n),
            dkgShareKeySu: BigInt(service?.dkgShareKeySu ?? service?.[1] ?? 0n),
            preBatchPartialSu: BigInt(service?.preBatchPartialSu ?? service?.[2] ?? 0n),
            dailyShareCustodySu: BigInt(service?.dailyShareCustodySu ?? service?.[3] ?? 0n),
            maxServiceDays: BigInt(service?.maxServiceDays ?? service?.[4] ?? 0n),
          } as GuardianProfile;
        })
        .filter((p): p is GuardianProfile => p !== null);
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

export function useGuardianDetail(address: `0x${string}`) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['guardian', address],
    queryFn: async () => {
      const [profile, stats, registeredEvents, heartbeatEvents, stakeEvents, slashEvents, reputationEvents] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.GuardianRegistry,
          abi: GuardianRegistryABI,
          functionName: 'getGuardian',
          args: [address],
        }).catch(() => null),
        publicClient.readContract({
          address: CONTRACTS.ReputationManager,
          abi: ReputationManagerABI,
          functionName: 'getGuardianStats',
          args: [address],
        }).catch(() => null),
        getIndexedLogs({
          address: CONTRACTS.GuardianRegistry,
          event: GuardianRegistryABI.find(e => e.name === 'GuardianRegistered')! as any,
          args: { guardian: address },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.GuardianRegistry,
          event: GuardianRegistryABI.find(e => e.name === 'GuardianHeartbeat')! as any,
          args: { guardian: address },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.GuardianRegistry,
          event: GuardianRegistryABI.find(e => e.name === 'GuardianStakeDeposited')! as any,
          args: { guardian: address },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.GuardianRegistry,
          event: GuardianRegistryABI.find(e => e.name === 'GuardianStakeSlashed')! as any,
          args: { guardian: address },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.GuardianRegistry,
          event: GuardianRegistryABI.find(e => e.name === 'ReputationUpdated')! as any,
          args: { guardian: address },
        }).catch(() => []),
      ]);
      const s = stats as any;
      const lastActivityAt = BigInt(s?.lastActivityAt ?? s?.[8] ?? 0n);
      return { profile, lastActivityAt, registeredEvents, heartbeatEvents, stakeEvents, slashEvents, reputationEvents };
    },
    enabled: !!address,
    refetchInterval,
  });
}

/**
 * GuardianProfiles a page at a time, straight from the projected rows.
 *
 * The hook above still returns the whole set, because several screens reduce
 * over it -- rankings, totals, the storage fleet view -- and a page is not a set.
 * This is for the table that lists them, which needs a screenful and a way to
 * ask for more. At ten thousand keepers the difference is the whole point: one
 * holds ten thousand rows in the browser, the other holds two hundred.
 */
export function usePagedGuardianProfiles(pageSize = 200) {
  const paged = usePagedIndex<Record<string, unknown>>('guardians', {}, pageSize);
  return {
    ...paged,
    // Stored with numbers as digits, since JSON holds no bigint.
    rows: paged.rows.map(row => reviveArgs(row) as unknown as GuardianProfile),
  };
}
