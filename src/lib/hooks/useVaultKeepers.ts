'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { VaultKeeperRegistryABI } from '@/lib/abis/VaultKeeperRegistry';
import { ReputationManagerABI } from '@/lib/abis/ReputationManager';
import { StakingManagerABI } from '@/lib/abis/StakingManager';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { getIndexedLogs } from '@/lib/indexedLogs';
import { fetchIndexedVaultKeepers } from '@/lib/indexedData';
import { reviveArgs } from '@/lib/indexedLogMatch.mjs';
import { usePagedIndex } from '@/lib/hooks/useEventCounts';

export interface VKProfile {
  address: `0x${string}`;
  storageFee: bigint;
  stake: bigint;
  availableStake: bigint;
  lockedStake: bigint;
  active: boolean;
  registeredAt: bigint;
  lastHeartbeat: bigint;
  suspendedUntil: bigint;
  maxServiceDays: number;
  reputation: number;
  penaltyPoints: number;
  disputeComplaints: number;
  disputePenaltyPoints: number;
  missedProofs: number;
  totalMissedPenalties: number;
  lastActivityAt: bigint;
  maxPieceSizeBytes: bigint;
  latestServiceEnd: bigint;
  endpointHash?: `0x${string}`;
  endpointSeq: bigint;
  endpointUpdatedAt: bigint;
  admissionOpen: boolean;
  admissionState: 'open' | 'capacity_closed' | 'ineligible' | 'unavailable';
  admissionReadAvailable: boolean;
  admissionClosed: boolean;
  admissionClosedAt: bigint;
  reportedAdmissionFreeBytes: bigint;
  /// admissionClosureReasonCode in the VaultKeeper registry implementation. 0 means no reason is
  /// recorded, which is not the same as "open": a keeper can be closed a moment before
  /// its reason reaches the chain.
  admissionClosureReason: number;
}

/// `enabled: false` lets a screen that has the store's answer skip the list.
export function useVaultKeepers({ enabled = true }: { enabled?: boolean } = {}) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['vault-keepers'],
    enabled,
    queryFn: async (): Promise<VKProfile[]> => {
      // Rows first, if the indexer has projected them.
      //
      // What follows reads ten fields per keeper straight from the contracts,
      // which is correct and does not scale: ten keepers cost 118 requests, and
      // the cost follows the number of keepers however well it is batched, on
      // every page load, for every reader. Projected rows make it one query for
      // a page, the same whether there are ten keepers or ten thousand.
      //
      // The chain path stays as the fallback, so an Explorer with no store, or
      // one whose projection has not run yet, still works exactly as before.
      const projected = await fetchIndexedVaultKeepers();
      // Stored with numbers as digits, since JSON holds no bigint -- the same
      // convention the event arguments use, so the same revival serves both.
      if (projected) return projected.map(row => reviveArgs(row) as unknown as VKProfile);

      const addresses = await publicClient.readContract({
        address: CONTRACTS.VaultKeeperRegistry,
        abi: VaultKeeperRegistryABI,
        functionName: 'getAllVaultKeepers',
      });

      const [
        profiles,
        registryReputations,
        reputationStats,
        capacities,
        serviceEnds,
        endpoints,
        availableStakes,
        lockedStakes,
        admissionStatuses,
        admissionOpenFlags,
        admissionClosureReasons,
      ] = await Promise.all([
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.VaultKeeperRegistry,
            abi: VaultKeeperRegistryABI,
            functionName: 'getVaultKeeper',
            args: [addr],
          }).catch(() => null)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.VaultKeeperRegistry,
            abi: VaultKeeperRegistryABI,
            functionName: 'getVKReputation',
            args: [addr],
          }).catch(() => 0)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.ReputationManager,
            abi: ReputationManagerABI,
            functionName: 'getVKStats',
            args: [addr],
          }).catch(() => null)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.VaultKeeperRegistry,
            abi: VaultKeeperRegistryABI,
            functionName: 'getVaultKeeperCapacity',
            args: [addr],
          }).catch(() => 0n)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.VaultKeeperRegistry,
            abi: VaultKeeperRegistryABI,
            functionName: 'latestServiceEnd',
            args: [addr],
          }).catch(() => 0n)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.VaultKeeperRegistry,
            abi: VaultKeeperRegistryABI,
            functionName: 'getVaultKeeperEndpoint',
            args: [addr],
          }).catch(() => null)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.StakingManager,
            abi: StakingManagerABI,
            functionName: 'availableStake',
            args: [addr],
          }).catch(() => 0n)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.StakingManager,
            abi: StakingManagerABI,
            functionName: 'lockedStakeOf',
            args: [addr],
          }).catch(() => 0n)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.VaultKeeperRegistry,
            abi: VaultKeeperRegistryABI,
            functionName: 'getAdmissionStatus',
            args: [addr],
          }).catch(() => null)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.VaultKeeperRegistry,
            abi: VaultKeeperRegistryABI,
            functionName: 'isAdmissionOpen',
            args: [addr],
          }).catch(() => null)
        )),
        Promise.all(addresses.map(addr =>
          publicClient.readContract({
            address: CONTRACTS.VaultKeeperRegistry,
            abi: VaultKeeperRegistryABI,
            functionName: 'admissionClosureReason',
            args: [addr],
          }).catch(() => null)
        )),
      ]);

      return profiles
        .map((p, i) => {
          if (!p) return null;
          const stats = reputationStats[i] as any;
          const endpoint = endpoints[i] as any;
          const admission = admissionStatuses[i] as any;
          const admissionOpenValue = admissionOpenFlags[i];
          const admissionReadAvailable = admission !== null && admissionOpenValue !== null;
          const admissionClosed = admissionReadAvailable
            ? Boolean(admission?.closed ?? admission?.[0] ?? false)
            : false;
          const admissionOpen = admissionReadAvailable ? Boolean(admissionOpenValue) : false;
          const admissionState: VKProfile['admissionState'] = !admissionReadAvailable
            ? 'unavailable'
            : admissionClosed
              ? 'capacity_closed'
              : admissionOpen
                ? 'open'
                : 'ineligible';
          return {
            address: addresses[i],
            storageFee: p.storageFee,
            stake: p.stake,
            availableStake: BigInt(availableStakes[i] ?? 0n),
            lockedStake: BigInt(lockedStakes[i] ?? 0n),
            active: p.active,
            registeredAt: BigInt(p.registeredAt),
            lastHeartbeat: BigInt(p.lastHeartbeat),
            suspendedUntil: BigInt(p.suspendedUntil ?? 0n),
            maxServiceDays: Number(p.maxServiceDays ?? 0),
            reputation: Number(stats?.reputationScore ?? stats?.[0] ?? registryReputations[i] ?? 0),
            penaltyPoints: Number(stats?.penaltyPoints ?? stats?.[1] ?? 0),
            disputeComplaints: Number(stats?.disputeComplaints ?? stats?.[2] ?? 0),
            disputePenaltyPoints: Number(stats?.disputePenaltyPoints ?? stats?.[3] ?? 0),
            missedProofs: Number(stats?.missedProofs ?? stats?.[4] ?? 0),
            totalMissedPenalties: Number(stats?.totalMissedPenalties ?? stats?.[5] ?? 0),
            lastActivityAt: BigInt(stats?.lastActivityAt ?? stats?.[6] ?? 0n),
            maxPieceSizeBytes: BigInt(capacities[i] ?? 0n),
            latestServiceEnd: BigInt(serviceEnds[i] ?? 0n),
            endpointHash: endpoint?.endpointHash ?? endpoint?.[0],
            endpointSeq: BigInt(endpoint?.seq ?? endpoint?.[1] ?? 0n),
            endpointUpdatedAt: BigInt(endpoint?.updatedAt ?? endpoint?.[2] ?? 0n),
            admissionOpen,
            admissionState,
            admissionReadAvailable,
            admissionClosed,
            admissionClosedAt: BigInt(admission?.closedAt ?? admission?.[1] ?? 0n),
            reportedAdmissionFreeBytes: BigInt(admission?.reportedFreeBytes ?? admission?.[2] ?? 0n),
            admissionClosureReason: Number(admissionClosureReasons[i] ?? 0),
          } as VKProfile;
        })
        .filter((p): p is VKProfile => p !== null);
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

export function useVaultKeeperDetail(address: `0x${string}`) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['vault-keeper', address],
    queryFn: async () => {
      const [profile, stats, registeredEvents, heartbeatEvents, suspendedEvents, statusEvents] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.VaultKeeperRegistry,
          abi: VaultKeeperRegistryABI,
          functionName: 'getVaultKeeper',
          args: [address],
        }).catch(() => null),
        publicClient.readContract({
          address: CONTRACTS.ReputationManager,
          abi: ReputationManagerABI,
          functionName: 'getVKStats',
          args: [address],
        }).catch(() => null),
        getIndexedLogs({
          address: CONTRACTS.VaultKeeperRegistry,
          event: VaultKeeperRegistryABI.find(e => e.name === 'VaultKeeperRegistered')! as any,
          args: { vkAddress: address },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.VaultKeeperRegistry,
          event: VaultKeeperRegistryABI.find(e => e.name === 'VaultKeeperHeartbeat')! as any,
          args: { vkAddress: address },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.VaultKeeperRegistry,
          event: VaultKeeperRegistryABI.find(e => e.name === 'VaultKeeperSuspended')! as any,
          args: { vkAddress: address },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.VaultKeeperRegistry,
          event: VaultKeeperRegistryABI.find(e => e.name === 'VaultKeeperStatusChanged')! as any,
          args: { vkAddress: address },
        }).catch(() => []),
      ]);
      const reputation = await publicClient.readContract({
        address: CONTRACTS.VaultKeeperRegistry,
        abi: VaultKeeperRegistryABI,
        functionName: 'getVKReputation',
        args: [address],
      }).catch(() => 0);
      const s = stats as any;
      const lastActivityAt = BigInt(s?.lastActivityAt ?? s?.[6] ?? 0n);
      return { profile, reputation: Number(reputation), lastActivityAt, registeredEvents, heartbeatEvents, suspendedEvents, statusEvents };
    },
    enabled: !!address,
    refetchInterval,
  });
}

/**
 * VKProfiles a page at a time, straight from the projected rows.
 *
 * The hook above still returns the whole set, because several screens reduce
 * over it -- rankings, totals, the storage fleet view -- and a page is not a set.
 * This is for the table that lists them, which needs a screenful and a way to
 * ask for more. At ten thousand keepers the difference is the whole point: one
 * holds ten thousand rows in the browser, the other holds two hundred.
 */
export function usePagedVKProfiles(pageSize = 200) {
  const paged = usePagedIndex<Record<string, unknown>>('vault-keepers', {}, pageSize);
  return {
    ...paged,
    // Stored with numbers as digits, since JSON holds no bigint.
    rows: paged.rows.map(row => reviveArgs(row) as unknown as VKProfile),
  };
}
