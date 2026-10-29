'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { getIndexedLogs, type DecodedLog } from '@/lib/indexedLogs';
import { fetchIndexPage, fetchIndexedVaultKeepers } from '@/lib/indexedData';
import { reviveArgs } from '@/lib/indexedLogMatch.mjs';
import { CONTRACTS } from '@/lib/addresses';
import { StorageProofSCABI } from '@/lib/abis/StorageProofSC';
import { CapacityProofSCABI, CapacityProofSCEventABI } from '@/lib/abis/CapacityProofSC';
import { VaultKeeperRegistryABI } from '@/lib/abis/VaultKeeperRegistry';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { useNetworkSummary } from '@/lib/hooks/useNetworkSummary';
import { useEventCountsByName, usePagedEventRows, usePagedIndex } from '@/lib/hooks/useEventCounts';

export type StorageHealth = 'healthy' | 'warning' | 'faulted' | 'expired' | 'inactive';

export interface PartitionSectorRecord {
  slot: number;
  sectorId: `0x${string}`;
  sectorRoot: `0x${string}`;
  sectorBlockCount: bigint;
  committedBytes: bigint;
  pieceCommitment: `0x${string}`;
}

export interface SectorRecord {
  sectorKey: `0x${string}`;
  sectorId: `0x${string}`;
  vk: `0x${string}`;
  sectorRoot: `0x${string}`;
  expiration: bigint;
  sectorBlockCount: number;
  challengeCount: number;
  active: boolean;
  registeredBlock: bigint;
  registeredTx: `0x${string}`;
  updatedBlock?: bigint;
  updatedTx?: `0x${string}`;
  openedChallenges: number;
  submittedProofs: number;
  missedProofs: number;
  lastProofRound?: bigint;
  lastProofBlock?: bigint;
  lastDeadline?: bigint;
  health: StorageHealth;
}

export interface PartitionRecord {
  partitionKey: `0x${string}`;
  vk: `0x${string}`;
  deadlineIndex: number;
  partitionIndex: number;
  partitionKind: number;
  committedBytes: bigint;
  sectorCount: bigint;
  expiration: bigint;
  active: boolean;
  registeredBlock: bigint;
  registeredTx: `0x${string}`;
  updatedBlock?: bigint;
  updatedTx?: `0x${string}`;
  openedChallenges: number;
  submittedProofs: number;
  lastProofRound?: bigint;
  lastProofBlock?: bigint;
  lastDeadline?: bigint;
  health: StorageHealth;
}

export interface DeadlineSummary {
  id: string;
  vk: `0x${string}`;
  deadlineIndex: number;
  partitionCount: number;
  sectorCount: bigint;
  openedChallenges: number;
  submittedProofs: number;
  expiringSoon: number;
  faulted: number;
  health: StorageHealth;
}

export interface StorageStats {
  sectorCount: number;
  activeSectors: number;
  partitionCount: number;
  activePartitions: number;
  inactivePartitions: number;
  dataPartitionCount: number;
  capacityPartitionCount: number;
  deadlineCount: number;
  totalSectorBlocks: bigint;
  activeSectorBlocks: bigint;
  estimatedBytes: bigint;
  activeEstimatedBytes: bigint;
  zkBlockSizeBytes: bigint;
  openedChallenges: number;
  submittedProofs: number;
  missedProofs: number;
  expiredSectors: number;
  expiringSoonSectors: number;
  faultedSectors: number;
  successRate: number;
  // Capacity tracking (from CapacityDeclared / CapacityUsageUpdated events)
  totalCapacityBytes: bigint;   // declared by all VKs at startup
  // Effective proved total, capped by each VK's declared capacity. The raw
  // proof-accounting counters remain available below for diagnostics.
  provenCapacityBytes: bigint;
  checkpointFreeBytes: bigint;
  checkpointDataBytes: bigint;
  checkpointAllocatedBytes: bigint;
  registeredFreeBytes: bigint;
  registeredDataBytes: bigint;
  provedFreeBytes: bigint;
  provedDataBytes: bigint;
  quoteReservedBytes: bigint;
  allocatedStoredBytes: bigint;
  freshCapacityProofVKs: number;
  capacityProofVKs: number;
  activeCapacityEpochs: number;
  capacityEpochAborts: number;
  capacityCutoffExclusions: number;
  capacityCutoffExcludedBytes: bigint;
  capacityDivergenceBytes: bigint;
  checkpointDriftBytes: bigint;
  latestCapacityProofAt: bigint;
  // Production-facing values include active VKs only. A stale active VK stays
  // in the denominator; only registry-deactivated VKs are excluded.
  activeDeclaredCapacityBytes: bigint;
  activeConservativeAvailableBytes: bigint;
  activeRegisteredDataBytes: bigint;
  freshActiveProofCapacityBytes: bigint;
  activeCapacityDivergenceBytes: bigint;
  capacityEpochPartitions: number;
  capacityEpochProvenPartitions: number;
  provenAvailableBytes: bigint;
  provenUsedBytes: bigint;
  usedBytes: bigint;
  freeBytes: bigint;
}

export interface StorageEventRow {
  type: string;
  key: `0x${string}`;
  vk: `0x${string}`;
  round?: bigint;
  deadline?: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  detail: string;
}

function eventOf(name: string) {
  return StorageProofSCABI.find(e => e.name === name)! as any;
}

type DecodedStorageLog = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: `0x${string}`;
};

/**
 * Past storage and capacity events, read from the index.
 *
 * These two were the last readers still replaying the chain from block zero, in
 * 5,000-block steps, behind a cache that emptied on every page load. That cost
 * grows with the age of the chain rather than with what is being asked for --
 * unnoticeable at seventeen thousand blocks, roughly two thousand sequential
 * requests at five million -- and a chain that caps log ranges refuses the walk
 * outright. Every other hook had already moved to the index; these were the pair
 * `INDEXER.md` still listed as outstanding.
 *
 * Both ask by event name, one query per event, which is what the rest of the
 * hooks already do. Naming the event is not a stylistic choice: it is the only
 * form that survives having no index. The fallback asks the chain over a bounded
 * window, and viem only decodes a log when it was told which event to expect, so
 * an unnamed "everything from this address" query would come back as raw topics.
 *
 * With an index present all of these resolve against one cached, de-duplicated
 * load and cost a filter each.
 */

/** Exactly the capacity events read below, which is two of the nine the
 *  operational ABI describes. The chain-replaying version decoded all nine
 *  because it was already holding every log it had walked past; now that each
 *  event is its own request, fetching the other seven would be paying to
 *  transfer rows nothing reads -- QuoteReservationStateChanged alone was the
 *  largest request the storage screen made. Adding a reader means adding its
 *  event here. */
const CAPACITY_EVENT_NAMES = [
  'ProofEpochAborted',
  'ProofEpochCutoffMemberExcluded',
] as const;

/** Exactly the storage events the screens below read through `L(...)`. Adding a
 *  reader there means adding its event here, or it silently reads as empty. */
const STORAGE_EVENT_NAMES = [
  'SectorRegistered',
  'SectorUpdated',
  'SectorStatusChanged',
  'SectorProofSubmitted',
  'SectorProofMissed',
  'ChallengeOpened',
  'PartitionRegistered',
  'PartitionUpdated',
  'PartitionContentVersionUpdated',
  'PartitionDeactivated',
  'PartitionChallengeOpened',
  'PartitionProofSubmitted',
  'PartitionProofSubmittedDeterministic',
  'ZkBlockSizeUpdated',
] as const;

function capacityEventOf(name: string) {
  return CapacityProofSCEventABI.find(entry => entry.name === name) as never;
}

function toStorageLog(log: DecodedLog): DecodedStorageLog {
  return {
    eventName: String(log.eventName ?? ''),
    args: log.args,
    blockNumber: log.blockNumber,
    transactionHash: log.transactionHash,
  };
}

async function readCapacityOperationalLogs(): Promise<DecodedStorageLog[]> {
  const perEvent = await Promise.all(
    CAPACITY_EVENT_NAMES.map(name => getIndexedLogs({
      address: CONTRACTS.CapacityProofSC,
      event: capacityEventOf(name),
      eventName: name,
    }).catch(() => [] as DecodedLog[])),
  );
  // Flattened across events, so restore the single ascending order the callers
  // were previously handed by the block-by-block walk.
  return perEvent
    .flat()
    .sort((a, b) => (a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : (a.blockNumber < b.blockNumber ? -1 : 1)))
    .map(toStorageLog);
}

async function readStorageLogs(): Promise<Map<string, DecodedStorageLog[]>> {
  const perEvent = await Promise.all(
    STORAGE_EVENT_NAMES.map(async name => [
      name,
      await getIndexedLogs({
        address: CONTRACTS.StorageProofSC,
        event: eventOf(name),
        eventName: name,
      }).catch(() => [] as DecodedLog[]),
    ] as const),
  );

  const byName = new Map<string, DecodedStorageLog[]>();
  for (const [name, logs] of perEvent) {
    byName.set(name, logs.map(toStorageLog));
  }
  return byName;
}

async function readCurrentCapacityAccounting() {
  // Projected rows first.
  //
  // This used to list every vault keeper and then make five reads against each
  // of them, so the cost followed the size of the fleet on every load of this
  // screen. The indexer already reads exactly these fields when it refreshes a
  // keeper, so the answer is a row rather than a round trip, and ten thousand
  // keepers cost what ten do.
  const projected = await fetchIndexedVaultKeepers();
  if (projected) {
    return projected.map(row => {
      const p = reviveArgs(row) as Record<string, any>;
      const c = (p.capacity ?? {}) as Record<string, any>;
      return {
        vk: String(p.address).toLowerCase() as `0x${string}`,
        active: Boolean(c.active),
        declared: toBigInt(c.declared),
        registeredFree: toBigInt(c.registeredFree),
        registeredData: toBigInt(c.registeredData),
        provedFree: toBigInt(c.provedFree),
        provedData: toBigInt(c.provedData),
        quoteReserved: toBigInt(c.quoteReserved),
        allocatedStored: toBigInt(c.allocatedStored),
        conservativeFree: toBigInt(c.conservativeFree),
        latestCapacityProofAt: toBigInt(c.latestCapacityProofAt),
        proofFresh: Boolean(c.proofFresh),
        checkpointFree: toBigInt(c.checkpointFree),
        checkpointData: toBigInt(c.checkpointData),
        checkpointAllocated: toBigInt(c.checkpointAllocated),
        checkpointBacked: toBigInt(c.checkpointBacked),
        epochExpectedPartitions: Number(c.epochExpectedPartitions ?? 0),
        epochProvenPartitions: Number(c.epochProvenPartitions ?? 0),
        epochActive: Boolean(c.epochActive),
      };
    });
  }

  const addresses = await publicClient.readContract({
    address: CONTRACTS.VaultKeeperRegistry,
    abi: VaultKeeperRegistryABI,
    functionName: 'getAllVaultKeepers',
  });
  const rows = await Promise.all(addresses.map(async vk => {
    // A VK can be registered before its first capacity epoch/checkpoint exists.
    // One unavailable per-VK diagnostic must not fail the fleet-wide Explorer
    // storage query.
    const [accountingRaw, epochRaw, checkpointRaw, declaredRaw, profileRaw] = await Promise.all([
      publicClient.readContract({
        address: CONTRACTS.CapacityProofSC,
        abi: CapacityProofSCABI,
        functionName: 'capacityAccountingOf',
        args: [vk],
      }).catch(() => null),
      publicClient.readContract({
        address: CONTRACTS.CapacityProofSC,
        abi: CapacityProofSCABI,
        functionName: 'getActiveProofEpoch',
        args: [vk],
      }).catch(() => null),
      publicClient.readContract({
        address: CONTRACTS.CapacityProofSC,
        abi: CapacityProofSCABI,
        functionName: 'capacityCheckpointOf',
        args: [vk],
      }).catch(() => null),
      publicClient.readContract({
        address: CONTRACTS.VaultKeeperRegistry,
        abi: VaultKeeperRegistryABI,
        functionName: 'getVaultKeeperCapacity',
        args: [vk],
      }).catch(() => 0n),
      publicClient.readContract({
        address: CONTRACTS.VaultKeeperRegistry,
        abi: VaultKeeperRegistryABI,
        functionName: 'getVaultKeeper',
        args: [vk],
      }).catch(() => null),
    ]);
    const accounting = accountingRaw as any;
    const epoch = epochRaw as any;
    const checkpoint = checkpointRaw as any;
    return {
      vk: vk.toLowerCase(),
      // Fail closed for reporting: if status cannot be read, keep the VK in
      // active proof coverage so an RPC error cannot improve fleet health.
      active: profileRaw === null
        ? true
        : Boolean((profileRaw as any)?.active ?? (profileRaw as any)?.[3]),
      declared: accounting ? toBigInt(accounting[0]) : toBigInt(declaredRaw),
      registeredFree: toBigInt(accounting?.[1]),
      registeredData: toBigInt(accounting?.[2]),
      provedFree: toBigInt(accounting?.[3]),
      provedData: toBigInt(accounting?.[4]),
      quoteReserved: toBigInt(accounting?.[5]),
      allocatedStored: toBigInt(accounting?.[6]),
      conservativeFree: toBigInt(accounting?.[7]),
      latestCapacityProofAt: toBigInt(accounting?.[8]),
      proofFresh: Boolean(accounting?.[9]),
      checkpointFree: toBigInt(checkpoint?.[0]),
      checkpointData: toBigInt(checkpoint?.[1]),
      checkpointAllocated: toBigInt(checkpoint?.[2]),
      checkpointBacked: toBigInt(checkpoint?.[3]),
      epochExpectedPartitions: Number(epoch?.[3] ?? 0),
      epochProvenPartitions: Number(epoch?.[4] ?? 0),
      epochActive: Boolean(epoch?.[6]),
    };
  }));
  return rows;
}

function healthFor(active: boolean, expiration: bigint, submitted: number, missed: number): StorageHealth {
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (!active) return 'inactive';
  if (expiration > 0n && expiration <= now) return 'expired';
  if (missed > 0 && submitted === 0) return 'faulted';
  if (missed > 0) return 'warning';
  return 'healthy';
}

function isExpiringSoon(expiration: bigint) {
  if (expiration === 0n) return false;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const sevenDays = 7n * 24n * 60n * 60n;
  return expiration > now && expiration <= now + sevenDays;
}

function worstHealth(a: StorageHealth, b: StorageHealth): StorageHealth {
  const rank: Record<StorageHealth, number> = { healthy: 0, warning: 1, expired: 2, inactive: 2, faulted: 3 };
  return rank[b] > rank[a] ? b : a;
}

function toBigInt(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(value);
  if (typeof value === 'string' && value !== '') return BigInt(value);
  return 0n;
}

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

async function readZkBlockSizeBytes(): Promise<bigint> {
  const value = await publicClient.readContract({
    address: CONTRACTS.StorageProofSC,
    abi: StorageProofSCABI,
    functionName: 'zkBlockSizeBytes',
  }).catch(() => 0n);
  return toBigInt(value);
}

export async function readPartitionSectorRecords(
  partitionKey: `0x${string}`,
  zkBlockSizeOverride?: bigint,
): Promise<PartitionSectorRecord[]> {
  const [sectorIdsRaw, sectorRootsRaw, blockCountsRaw, pieceCommitmentsRaw, chainBlockSize] = await Promise.all([
    publicClient.readContract({
      address: CONTRACTS.StorageProofSC,
      abi: StorageProofSCABI,
      functionName: 'getPartitionSectorIds',
      args: [partitionKey],
    }).catch(() => []),
    publicClient.readContract({
      address: CONTRACTS.StorageProofSC,
      abi: StorageProofSCABI,
      functionName: 'getPartitionSectorRoots',
      args: [partitionKey],
    }).catch(() => []),
    publicClient.readContract({
      address: CONTRACTS.StorageProofSC,
      abi: StorageProofSCABI,
      functionName: 'getPartitionBlockCounts',
      args: [partitionKey],
    }).catch(() => []),
    publicClient.readContract({
      address: CONTRACTS.StorageProofSC,
      abi: StorageProofSCABI,
      functionName: 'getPartitionPieceCommitments',
      args: [partitionKey],
    }).catch(() => []),
    readZkBlockSizeBytes(),
  ]);
  const sectorIds = sectorIdsRaw as readonly `0x${string}`[];
  const sectorRoots = sectorRootsRaw as readonly `0x${string}`[];
  const blockCounts = blockCountsRaw as readonly unknown[];
  const pieceCommitments = pieceCommitmentsRaw as readonly `0x${string}`[];
  const zkBlockSizeBytes = zkBlockSizeOverride && zkBlockSizeOverride > 0n
    ? zkBlockSizeOverride
    : chainBlockSize;
  const count = Math.max(sectorIds.length, sectorRoots.length, blockCounts.length, pieceCommitments.length);

  return Array.from({ length: count }, (_, i) => {
    const sectorBlockCount = toBigInt(blockCounts[i]);
    return {
      slot: i,
      sectorId: sectorIds[i] ?? ZERO_BYTES32,
      sectorRoot: sectorRoots[i] ?? ZERO_BYTES32,
      sectorBlockCount,
      committedBytes: sectorBlockCount * zkBlockSizeBytes,
      pieceCommitment: pieceCommitments[i] ?? ZERO_BYTES32,
    };
  });
}

/**
 * Partition counts from the store.
 *
 * "118 active, 88 data, 30 capacity, 11 inactive" is a set difference between
 * registrations and deactivations. No aggregate over the event log can express
 * it, and a capped page of events answers it wrongly rather than partially -- so
 * it is a grouped count over projected rows, where `active` is what the contract
 * says rather than what a replay concluded.
 */
function useEntityCounts<T>(dataset: string) {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: [dataset],
    queryFn: async () => {
      const res = await fetch(`/api/index/${dataset}`, { cache: 'default' }).catch(() => null);
      if (!res || !res.ok) return null;
      return res.json() as Promise<T | null>;
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

export const usePartitionCounts = () => useEntityCounts<{
  active: number; inactive: number; data: number; capacity: number; total: number;
}>('partition-counts');

/// Sectors, for the same reason: "active" is a set difference, not a tally.
export const useSectorCounts = () => useEntityCounts<{
  active: number; inactive: number; total: number;
  /** ZK blocks held by active sectors, as digits. Absent from an older server. */
  activeBlocks?: string;
  expired?: number;
  faulted?: number;
  expiringSoon?: number;
}>('sector-counts');

/// `enabled: false` lets a screen that has the store's answers skip the replay.
export function useStorage({ enabled = true }: { enabled?: boolean } = {}) {
  const refetchInterval = useAutoRefreshInterval();
  const { data: partitionCounts } = usePartitionCounts();
  const { data: sectorCounts } = useSectorCounts();

  return useQuery({
    enabled,
    // Keyed on the counts themselves, so a later answer re-runs the query
    // rather than leaving the first, row-derived one cached.
    queryKey: ['storage-overview',
      partitionCounts
        ? `${partitionCounts.total}/${partitionCounts.active}/${partitionCounts.data}/${partitionCounts.capacity}`
        : 'rows',
      sectorCounts ? `${sectorCounts.total}/${sectorCounts.active}` : 'rows'],
    queryFn: async () => {
      const [storageLogs, currentCapacity, capacityOperationalLogs] = await Promise.all([
        readStorageLogs(),
        readCurrentCapacityAccounting(),
        readCapacityOperationalLogs(),
      ]);
      const L = (name: string) => storageLogs.get(name) ?? [];

      const [
        zkBlockSizeRead,
        sectorRegistered,
        sectorUpdated,
        sectorStatus,
        challengeOpened,
        proofSubmitted,
        proofMissed,
        partitionRegistered,
        partitionUpdated,
        partitionContentVersionUpdated,
        partitionDeactivated,
        partitionChallengeOpened,
        partitionProofSubmitted,
        partitionProofDeterministic,
        zkBlockSizeUpdated,
      ] = [
        await readZkBlockSizeBytes(),
        L('SectorRegistered'),
        L('SectorUpdated'),
        L('SectorStatusChanged'),
        L('ChallengeOpened'),
        L('SectorProofSubmitted'),
        L('SectorProofMissed'),
        L('PartitionRegistered'),
        L('PartitionUpdated'),
        L('PartitionContentVersionUpdated'),
        L('PartitionDeactivated'),
        L('PartitionChallengeOpened'),
        L('PartitionProofSubmitted'),
        L('PartitionProofSubmittedDeterministic'),
        L('ZkBlockSizeUpdated'),
      ];
      const latestZkBlockEvent = zkBlockSizeUpdated.at(-1) as any;
      const zkBlockSizeBytes = zkBlockSizeRead > 0n
        ? zkBlockSizeRead
        : toBigInt(latestZkBlockEvent?.args?.zkBlockSizeBytes);

      const sectors = new Map<string, SectorRecord>();
      const partitions = new Map<string, PartitionRecord>();
      const events: StorageEventRow[] = [];

      for (const log of sectorRegistered) {
        const a = (log as any).args;
        sectors.set(a.sectorKey, {
          sectorKey: a.sectorKey,
          sectorId: a.sectorId,
          vk: a.vk,
          sectorRoot: a.sectorRoot,
          expiration: a.expiration,
          sectorBlockCount: Number(a.sectorBlockCount),
          challengeCount: Number(a.challengeCount),
          active: true,
          registeredBlock: log.blockNumber ?? 0n,
          registeredTx: log.transactionHash ?? '0x',
          openedChallenges: 0,
          submittedProofs: 0,
          missedProofs: 0,
          health: 'healthy',
        });
        events.push({ type: 'Sector Registered', key: a.sectorKey, vk: a.vk, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `${Number(a.sectorBlockCount).toLocaleString()} blocks` });
      }

      for (const log of sectorUpdated) {
        const a = (log as any).args;
        const sector = sectors.get(a.sectorKey);
        if (sector) {
          sector.sectorRoot = a.newSectorRoot;
          sector.expiration = a.expiration;
          sector.sectorBlockCount = Number(a.sectorBlockCount);
          sector.challengeCount = Number(a.challengeCount);
          sector.updatedBlock = log.blockNumber ?? 0n;
          sector.updatedTx = log.transactionHash ?? '0x';
        }
        events.push({ type: 'Sector Updated', key: a.sectorKey, vk: a.vk, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `${Number(a.sectorBlockCount).toLocaleString()} blocks` });
      }

      for (const log of sectorStatus) {
        const a = (log as any).args;
        const sector = sectors.get(a.sectorKey);
        if (sector) sector.active = a.active;
        events.push({ type: a.active ? 'Sector Activated' : 'Sector Inactive', key: a.sectorKey, vk: a.vk, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: '' });
      }

      for (const log of challengeOpened) {
        const a = (log as any).args;
        const sector = sectors.get(a.sectorKey);
        if (sector) {
          sector.openedChallenges += 1;
          sector.lastDeadline = a.deadline;
        }
        events.push({ type: 'Sector Challenge', key: a.sectorKey, vk: a.vk, round: a.round, deadline: a.deadline, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `Round ${a.round}` });
      }

      for (const log of proofSubmitted) {
        const a = (log as any).args;
        const sector = sectors.get(a.sectorKey);
        if (sector) {
          sector.submittedProofs += 1;
          sector.lastProofRound = a.round;
          sector.lastProofBlock = log.blockNumber ?? 0n;
          sector.sectorRoot = a.sectorRoot;
        }
        events.push({ type: 'Sector Proof Submitted', key: a.sectorKey, vk: a.vk, round: a.round, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `Round ${a.round}` });
      }

      for (const log of proofMissed) {
        const a = (log as any).args;
        const sector = sectors.get(a.sectorKey);
        if (sector) sector.missedProofs += 1;
        events.push({ type: 'Sector Proof Missed', key: a.sectorKey, vk: a.vk, round: a.round, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `Round ${a.round}` });
      }

      const partitionLifecycle = [
        ...partitionRegistered.map(log => ({ name: 'PartitionRegistered', log })),
        ...partitionUpdated.map(log => ({ name: 'PartitionUpdated', log })),
        ...partitionContentVersionUpdated.map(log => ({ name: 'PartitionContentVersionUpdated', log })),
        ...partitionDeactivated.map(log => ({ name: 'PartitionDeactivated', log })),
      ].sort((a, b) => {
        const aBlock = a.log.blockNumber ?? 0n;
        const bBlock = b.log.blockNumber ?? 0n;
        if (aBlock !== bBlock) return aBlock > bBlock ? 1 : -1;
        const aIndex = Number((a.log as any).logIndex ?? 0);
        const bIndex = Number((b.log as any).logIndex ?? 0);
        return aIndex - bIndex;
      });

      for (const item of partitionLifecycle) {
        const log = item.log as any;
        const a = log.args;
        if (item.name === 'PartitionRegistered') {
          partitions.set(a.partitionKey, {
            partitionKey: a.partitionKey,
            vk: a.vk,
            deadlineIndex: Number(a.deadlineIndex),
            partitionIndex: Number(a.partitionIndex),
            partitionKind: Number(a.partitionKind ?? 1),
            committedBytes: BigInt(a.committedBytes ?? 0n),
            sectorCount: a.sectorCount,
            expiration: a.expiration,
            active: true,
            registeredBlock: log.blockNumber ?? 0n,
            registeredTx: log.transactionHash ?? '0x',
            openedChallenges: 0,
            submittedProofs: 0,
            health: 'healthy',
          });
          const kind = Number(a.partitionKind ?? 1) === 2 ? 'capacity' : 'data';
          events.push({ type: 'Partition Registered', key: a.partitionKey, vk: a.vk, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `DL${a.deadlineIndex} / P${a.partitionIndex} · ${kind}` });
        } else if (item.name === 'PartitionUpdated') {
          const partition = partitions.get(a.partitionKey);
          if (partition) {
            partition.partitionKind = Number(a.partitionKind ?? partition.partitionKind);
            partition.sectorCount = a.sectorCount;
            partition.committedBytes = BigInt(a.committedBytes ?? partition.committedBytes);
            partition.active = true;
            partition.updatedBlock = log.blockNumber ?? 0n;
            partition.updatedTx = log.transactionHash ?? '0x';
          }
          const kind = Number(a.partitionKind ?? 1) === 2 ? 'capacity' : 'data';
          events.push({ type: 'Partition Updated', key: a.partitionKey, vk: a.vk, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `${a.sectorCount} sectors · ${kind}` });
        } else if (item.name === 'PartitionContentVersionUpdated') {
          const partition = partitions.get(a.partitionKey);
          if (partition) {
            partition.updatedBlock = log.blockNumber ?? 0n;
            partition.updatedTx = log.transactionHash ?? '0x';
          }
          events.push({ type: 'Partition Content Updated', key: a.partitionKey, vk: a.vk, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `Version ${a.contentVersion}` });
        } else if (item.name === 'PartitionDeactivated') {
          const partition = partitions.get(a.partitionKey);
          if (partition) {
            partition.active = false;
            partition.partitionKind = Number(a.partitionKind ?? partition.partitionKind);
            partition.sectorCount = 0n;
            partition.committedBytes = 0n;
            partition.expiration = 0n;
            partition.updatedBlock = log.blockNumber ?? 0n;
            partition.updatedTx = log.transactionHash ?? '0x';
          } else {
            partitions.set(a.partitionKey, {
              partitionKey: a.partitionKey,
              vk: a.vk,
              deadlineIndex: 0,
              partitionIndex: 0,
              partitionKind: Number(a.partitionKind ?? 1),
              committedBytes: 0n,
              sectorCount: 0n,
              expiration: 0n,
              active: false,
              registeredBlock: log.blockNumber ?? 0n,
              registeredTx: log.transactionHash ?? '0x',
              openedChallenges: 0,
              submittedProofs: 0,
              health: 'inactive',
            });
          }
          const kind = Number(a.partitionKind ?? 1) === 2 ? 'capacity' : 'data';
          events.push({ type: 'Partition Deactivated', key: a.partitionKey, vk: a.vk, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: kind });
        }
      }

      for (const log of partitionChallengeOpened) {
        const a = (log as any).args;
        const partition = partitions.get(a.partitionKey);
        if (partition) {
          partition.openedChallenges += 1;
          partition.lastDeadline = a.deadline;
        }
        events.push({ type: 'Partition Challenge', key: a.partitionKey, vk: a.vk, round: a.round, deadline: a.deadline, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `Round ${a.round}` });
      }

      for (const log of [...partitionProofSubmitted, ...partitionProofDeterministic]) {
        const a = (log as any).args;
        const partition = partitions.get(a.partitionKey);
        if (partition) {
          partition.submittedProofs += 1;
          partition.lastProofRound = a.round;
          partition.lastProofBlock = log.blockNumber ?? 0n;
        }
        events.push({ type: 'Partition Proof Submitted', key: a.partitionKey, vk: a.vk, round: a.round, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail: `Round ${a.round}` });
      }

      const sectorList = [...sectors.values()].map(sector => ({
        ...sector,
        health: healthFor(sector.active, sector.expiration, sector.submittedProofs, sector.missedProofs),
      })).sort((a, b) => (b.registeredBlock > a.registeredBlock ? 1 : -1));

      const partitionList = [...partitions.values()].map(partition => ({
        ...partition,
        health: healthFor(partition.active, partition.expiration, partition.submittedProofs, 0),
      })).sort((a, b) => (b.registeredBlock > a.registeredBlock ? 1 : -1));

      const deadlineMap = new Map<string, DeadlineSummary>();
      for (const partition of partitionList) {
        const id = `${partition.vk}-${partition.deadlineIndex}`;
        const existing = deadlineMap.get(id) ?? {
          id,
          vk: partition.vk,
          deadlineIndex: partition.deadlineIndex,
          partitionCount: 0,
          sectorCount: 0n,
          openedChallenges: 0,
          submittedProofs: 0,
          expiringSoon: 0,
          faulted: 0,
          health: 'healthy' as StorageHealth,
        };
        existing.partitionCount += 1;
        existing.sectorCount += partition.sectorCount;
        existing.openedChallenges += partition.openedChallenges;
        existing.submittedProofs += partition.submittedProofs;
        existing.expiringSoon += isExpiringSoon(partition.expiration) ? 1 : 0;
        existing.faulted += partition.health === 'faulted' || partition.health === 'expired' ? 1 : 0;
        existing.health = worstHealth(existing.health, partition.health);
        deadlineMap.set(id, existing);
      }

      const deadlineList = [...deadlineMap.values()].sort((a, b) => {
        if (a.vk === b.vk) return a.deadlineIndex - b.deadlineIndex;
        return a.vk.localeCompare(b.vk);
      });

      // CapacityProofSC is the sole authoritative ledger. StorageProofSC no
      // longer accepts self-reported usage, so Explorer must not reconstruct
      // admission capacity from historical StorageProof events.
      const latestCapacity = new Map<string, bigint>();
      const latestAccounting = new Map<string, {
        registeredFree: bigint;
        registeredData: bigint;
        provedFree: bigint;
        provedData: bigint;
        quoteReserved: bigint;
        allocatedStored: bigint;
        conservativeFree: bigint;
        latestCapacityProofAt: bigint;
        proofFresh: boolean;
        checkpointFree: bigint;
        checkpointData: bigint;
        checkpointAllocated: bigint;
        checkpointBacked: bigint;
        epochActive: boolean;
        epochExpectedPartitions: number;
        epochProvenPartitions: number;
      }>();
      for (const row of currentCapacity) {
        latestCapacity.set(row.vk, row.declared);
        latestAccounting.set(row.vk, {
          registeredFree: row.registeredFree,
          registeredData: row.registeredData,
          provedFree: row.provedFree,
          provedData: row.provedData,
          quoteReserved: row.quoteReserved,
          allocatedStored: row.allocatedStored,
          conservativeFree: row.conservativeFree,
          latestCapacityProofAt: row.latestCapacityProofAt,
          proofFresh: row.proofFresh,
          checkpointFree: row.checkpointFree,
          checkpointData: row.checkpointData,
          checkpointAllocated: row.checkpointAllocated,
          checkpointBacked: row.checkpointBacked,
          epochActive: row.epochActive,
          epochExpectedPartitions: row.epochExpectedPartitions,
          epochProvenPartitions: row.epochProvenPartitions,
        });
      }

      const totalCapacityBytes = [...latestCapacity.values()].reduce((s, v) => s + v, 0n);
      const registeredFreeBytes = [...latestAccounting.values()].reduce((s, v) => s + v.registeredFree, 0n);
      const registeredDataBytes = [...latestAccounting.values()].reduce((s, v) => s + v.registeredData, 0n);
      const provedFreeBytes = [...latestAccounting.values()].reduce((s, v) => s + v.provedFree, 0n);
      const provedDataBytes = [...latestAccounting.values()].reduce((s, v) => s + v.provedData, 0n);
      const quoteReservedBytes = [...latestAccounting.values()].reduce((s, v) => s + v.quoteReserved, 0n);
      const allocatedStoredBytes = [...latestAccounting.values()].reduce((s, v) => s + v.allocatedStored, 0n);
      const provenAvailableBytes = [...latestAccounting.values()].reduce((s, v) => s + v.conservativeFree, 0n);
      // Current exact counters reset whenever a partition version changes.
      // "Proven total" must use the last atomically completed checkpoint, not
      // disappear during a healthy rolling update. Live and exact-current
      // values remain separate diagnostics below.
      const provenCapacityBytes = [...latestAccounting.values()].reduce(
        (s, v) => s + v.checkpointBacked, 0n,
      );
      const checkpointFreeBytes = [...latestAccounting.values()].reduce(
        (s, v) => s + v.checkpointFree, 0n,
      );
      const checkpointDataBytes = [...latestAccounting.values()].reduce(
        (s, v) => s + v.checkpointData, 0n,
      );
      const checkpointAllocatedBytes = [...latestAccounting.values()].reduce(
        (s, v) => s + v.checkpointAllocated, 0n,
      );
      const provenUsedBytes = checkpointDataBytes;
      const freshCapacityProofVKs = [...latestAccounting.values()].filter(v => v.proofFresh).length;
      const capacityProofVKs = currentCapacity.filter(v => v.declared > 0n).length;
      const activeCapacityEpochs = [...latestAccounting.values()].filter(v => v.epochActive).length;
      const capacityEpochAborts = capacityOperationalLogs.filter(log => log.eventName === 'ProofEpochAborted').length;
      const exclusions = capacityOperationalLogs.filter(log => log.eventName === 'ProofEpochCutoffMemberExcluded');
      const capacityCutoffExclusions = exclusions.length;
      const capacityCutoffExcludedBytes = exclusions.reduce((sum, log) => sum + toBigInt(log.args.excludedBytes), 0n);
      const latestCapacityProofAt = [...latestAccounting.values()].reduce(
        (latest, value) => value.latestCapacityProofAt > latest ? value.latestCapacityProofAt : latest, 0n,
      );
      const capacityEpochPartitions = [...latestAccounting.values()].reduce((s, v) => s + v.epochExpectedPartitions, 0);
      const capacityEpochProvenPartitions = [...latestAccounting.values()].reduce((s, v) => s + v.epochProvenPartitions, 0);

      const usedBytes = allocatedStoredBytes;
      const freeBytes = provenAvailableBytes;
      const registeredCapacityBytes = registeredFreeBytes + registeredDataBytes;
      const checkpointCapacityBytes = checkpointFreeBytes + checkpointDataBytes;
      // Proof health is exact-current and component-wise, matching the VK's
      // authoritative capacity-lag calculation. Summing per VK prevents one
      // vault's free/data mismatch from cancelling another vault's mismatch.
      const capacityDivergenceBytes = [...latestAccounting.values()].reduce((sum, value) => {
        const freeDivergence = value.registeredFree >= value.provedFree
          ? value.registeredFree - value.provedFree
          : value.provedFree - value.registeredFree;
        const dataDivergence = value.registeredData >= value.provedData
          ? value.registeredData - value.provedData
          : value.provedData - value.registeredData;
        return sum + freeDivergence + dataDivergence;
      }, 0n);
      // The durable full-manifest checkpoint changes less frequently than
      // exact-current incremental proofs. Preserve its drift as a separate
      // historical diagnostic; it is not current proof divergence.
      const checkpointDriftBytes = registeredCapacityBytes >= checkpointCapacityBytes
        ? registeredCapacityBytes - checkpointCapacityBytes
        : checkpointCapacityBytes - registeredCapacityBytes;

      // Live product metrics are capacity-weighted and limited to currently
      // active registry members. This avoids historical/deactivated VK counts
      // distorting a long-lived network while retaining stale active VKs.
      const activeCapacityRows = currentCapacity.filter(row => row.active && row.declared > 0n);
      const activeDeclaredCapacityBytes = activeCapacityRows.reduce((sum, row) => sum + row.declared, 0n);
      const activeConservativeAvailableBytes = activeCapacityRows.reduce(
        (sum, row) => sum + row.conservativeFree,
        0n,
      );
      const activeRegisteredDataBytes = activeCapacityRows.reduce(
        (sum, row) => sum + row.registeredData,
        0n,
      );
      const freshActiveProofCapacityBytes = activeCapacityRows.reduce(
        (sum, row) => sum + (row.proofFresh ? row.declared : 0n),
        0n,
      );
      const activeCapacityDivergenceBytes = activeCapacityRows.reduce((sum, row) => {
        const freeDivergence = row.registeredFree >= row.provedFree
          ? row.registeredFree - row.provedFree
          : row.provedFree - row.registeredFree;
        const dataDivergence = row.registeredData >= row.provedData
          ? row.registeredData - row.provedData
          : row.provedData - row.registeredData;
        return sum + freeDivergence + dataDivergence;
      }, 0n);

      const submitted = sectorList.reduce((sum, s) => sum + s.submittedProofs, 0);
      const missed = sectorList.reduce((sum, s) => sum + s.missedProofs, 0);
      const totalSectorBlocks = sectorList.reduce((sum, s) => sum + BigInt(s.sectorBlockCount), 0n);
      const activeSectorBlocks = sectorList.filter(s => s.active).reduce((sum, s) => sum + BigInt(s.sectorBlockCount), 0n);
      // Counted in the store when it has the rows.
      //
      // These four are a set difference between registrations and deactivations,
      // resolved per partition, and `partitionList` is a capped page of the
      // events behind them -- so at any size the page stops being the whole
      // story and these numbers stop being right. The projection resolves
      // `active` from the contract, so a grouped count over rows answers it
      // exactly. Falling back to the page keeps an Explorer without a store
      // working, with a smaller number rather than a wrong one.
      const activePartitions = partitionCounts?.active
        ?? partitionList.filter(p => p.active).length;
      const inactivePartitions = partitionCounts?.inactive
        ?? (partitionList.length - partitionList.filter(p => p.active).length);
      const dataPartitionCount = partitionCounts?.data
        ?? partitionList.filter(p => p.active && p.partitionKind !== 2).length;
      const capacityPartitionCount = partitionCounts?.capacity
        ?? partitionList.filter(p => p.active && p.partitionKind === 2).length;
      const stats: StorageStats = {
        sectorCount: sectorCounts?.total ?? sectorList.length,
        activeSectors: sectorCounts?.active ?? sectorList.filter(s => s.active).length,
        partitionCount: partitionCounts?.total ?? partitionList.length,
        activePartitions,
        inactivePartitions,
        dataPartitionCount,
        capacityPartitionCount,
        deadlineCount: deadlineList.length,
        totalSectorBlocks,
        activeSectorBlocks,
        estimatedBytes: totalSectorBlocks * zkBlockSizeBytes,
        activeEstimatedBytes: activeSectorBlocks * zkBlockSizeBytes,
        zkBlockSizeBytes,
        openedChallenges: sectorList.reduce((sum, s) => sum + s.openedChallenges, 0) + partitionList.reduce((sum, p) => sum + p.openedChallenges, 0),
        submittedProofs: submitted + partitionList.reduce((sum, p) => sum + p.submittedProofs, 0),
        missedProofs: missed,
        expiredSectors: sectorList.filter(s => s.health === 'expired').length,
        expiringSoonSectors: sectorList.filter(s => isExpiringSoon(s.expiration)).length,
        faultedSectors: sectorList.filter(s => s.health === 'faulted' || s.health === 'warning').length,
        successRate: submitted + missed > 0 ? Math.round(submitted / (submitted + missed) * 100) : 0,
        totalCapacityBytes,
        provenCapacityBytes,
        checkpointFreeBytes,
        checkpointDataBytes,
        checkpointAllocatedBytes,
        registeredFreeBytes,
        registeredDataBytes,
        provedFreeBytes,
        provedDataBytes,
        quoteReservedBytes,
        allocatedStoredBytes,
        freshCapacityProofVKs,
        capacityProofVKs,
        activeCapacityEpochs,
        capacityEpochAborts,
        capacityCutoffExclusions,
        capacityCutoffExcludedBytes,
        capacityDivergenceBytes,
        checkpointDriftBytes,
        latestCapacityProofAt,
        activeDeclaredCapacityBytes,
        activeConservativeAvailableBytes,
        activeRegisteredDataBytes,
        freshActiveProofCapacityBytes,
        activeCapacityDivergenceBytes,
        capacityEpochPartitions,
        capacityEpochProvenPartitions,
        provenAvailableBytes,
        provenUsedBytes,
        usedBytes,
        freeBytes,
      };

      return {
        sectors: sectorList,
        partitions: partitionList,
        deadlines: deadlineList,
        events: events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1)),
        stats,
      };
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

export function useSectorDetail(sectorKey: `0x${string}`) {
  const storage = useStorage();
  return {
    ...storage,
    data: storage.data ? {
      sector: storage.data.sectors.find(s => s.sectorKey.toLowerCase() === sectorKey.toLowerCase()),
      events: storage.data.events.filter(e => e.key.toLowerCase() === sectorKey.toLowerCase()),
    } : undefined,
  };
}

export function usePartitionDetail(partitionKey: `0x${string}`) {
  const storage = useStorage();
  const refetchInterval = useAutoRefreshInterval();
  const sectorDetails = useQuery({
    queryKey: ['partition-sector-records', partitionKey, storage.data?.stats.zkBlockSizeBytes.toString() ?? '0'],
    queryFn: () => readPartitionSectorRecords(partitionKey, storage.data?.stats.zkBlockSizeBytes),
    enabled: Boolean(partitionKey),
    refetchInterval,
    staleTime: 10_000,
  });
  return {
    ...storage,
    isLoading: storage.isLoading || sectorDetails.isLoading,
    error: storage.error || sectorDetails.error,
    refetch: async () => {
      await Promise.all([storage.refetch(), sectorDetails.refetch()]);
    },
    data: storage.data ? {
      partition: storage.data.partitions.find(p => p.partitionKey.toLowerCase() === partitionKey.toLowerCase()),
      sectors: sectorDetails.data ?? [],
      events: storage.data.events.filter(e => e.key.toLowerCase() === partitionKey.toLowerCase()),
    } : undefined,
  };
}

/**
 * Partitions and sectors a page at a time, from the projected rows.
 *
 * `useStorage` still replays fifteen event streams to build these, because the
 * screens around it reduce over the whole set -- deadline summaries, the fleet
 * view, per-keeper rollups -- and a page is not a set. This is for the two
 * tables that simply list them, which need a screenful and a way to ask for
 * more. At a hundred thousand partitions the difference is the whole point.
 *
 * Health is not stored: it is a function of state the row already carries, and
 * it moves with the clock -- a partition becomes expired at a moment no event
 * marks. Computing it on read is what keeps it true between projections.
 */
function useProjectedRows<T>(dataset: string, pageSize: number, map: (row: Record<string, any>) => T) {
  const paged = usePagedIndex<Record<string, unknown>>(dataset, {}, pageSize);
  return { ...paged, rows: paged.rows.map(row => map(reviveArgs(row) as Record<string, any>)) };
}

export function usePagedPartitions(pageSize = 200) {
  return useProjectedRows<PartitionRecord>('partitions', pageSize, (r) => {
    const active = Boolean(r.active);
    const expiration = toBigInt(r.expiration);
    const submittedProofs = Number(r.submittedProofs ?? 0);
    return {
      partitionKey: r.partitionKey,
      vk: r.vk,
      deadlineIndex: Number(r.deadlineIndex ?? 0),
      partitionIndex: Number(r.partitionIndex ?? 0),
      partitionKind: Number(r.partitionKind ?? 0),
      committedBytes: toBigInt(r.committedBytes),
      sectorCount: toBigInt(r.sectorCount),
      expiration,
      active,
      // The registering event's own block, which the contract does not hold.
      registeredBlock: toBigInt(r.firstBlock),
      registeredTx: '0x',
      openedChallenges: Number(r.openedChallenges ?? 0),
      submittedProofs,
      lastProofRound: toBigInt(r.lastProofRound),
      // Partitions have no missed-proof event, so the replay passed zero here
      // too -- this is the same rule, not a weaker one.
      health: healthFor(active, expiration, submittedProofs, 0),
    };
  });
}

export function usePagedSectors(pageSize = 200) {
  return useProjectedRows<SectorRecord>('sectors', pageSize, (r) => {
    const active = Boolean(r.active);
    const expiration = toBigInt(r.expiration);
    const submittedProofs = Number(r.submittedProofs ?? 0);
    const missedProofs = Number(r.missedProofs ?? 0);
    return {
      sectorKey: r.sectorKey,
      sectorId: r.sectorId ?? '0x',
      vk: r.vk,
      sectorRoot: r.sectorRoot ?? '0x',
      expiration,
      sectorBlockCount: Number(r.sectorBlockCount ?? 0),
      challengeCount: Number(r.challengeCount ?? 0),
      active,
      registeredBlock: toBigInt(r.firstBlock),
      registeredTx: '0x',
      openedChallenges: Number(r.openedChallenges ?? 0),
      submittedProofs,
      missedProofs,
      lastProofRound: toBigInt(r.lastProofRound),
      health: healthFor(active, expiration, submittedProofs, missedProofs),
    };
  });
}

/**
 * The storage summary, without replaying the log.
 *
 * `useStorage` builds four things from fifteen event streams: the sector list,
 * the partition list, the deadline summaries, and these numbers. Only the
 * screens that show a list need the first three. The dashboard shows none of
 * them -- it renders capacity and partition counts -- and was paying for all of
 * it: a hundred and twenty-two event requests and three hundred and seventy
 * kilobytes on the page every visitor lands on first.
 *
 * Every figure below already lives in the store. Capacity is read from the
 * projected keeper rows, which the indexer fills from exactly these contract
 * calls; partition and sector counts are grouped counts over projected rows.
 * The arithmetic is copied from `useStorage` unchanged so the two cannot
 * disagree about a number they both show.
 */
export interface StorageSummary {
  totalCapacityBytes: bigint;
  activeDeclaredCapacityBytes: bigint;
  activeConservativeAvailableBytes: bigint;
  activeRegisteredDataBytes: bigint;
  freshActiveProofCapacityBytes: bigint;
  activeCapacityDivergenceBytes: bigint;
  activePartitions: number;
  inactivePartitions: number;
  dataPartitionCount: number;
  capacityPartitionCount: number;
  partitionCount: number;
  sectorCount: number;
  activeSectors: number;
}

/// Capacity totals from keeper rows, when the store cannot sum them itself.
function capacityFromRows(currentCapacity: Awaited<ReturnType<typeof readCurrentCapacityAccounting>>) {
  const totalCapacityBytes = currentCapacity.reduce((sum, row) => sum + row.declared, 0n);
  // Capacity-weighted and limited to currently active members, so a
  // deactivated keeper's history does not inflate a long-lived network.
  const active = currentCapacity.filter(row => row.active && row.declared > 0n);
  const sumOf = (pick: (row: typeof active[number]) => bigint) =>
    active.reduce((sum, row) => sum + pick(row), 0n);

  return {
    totalCapacityBytes,
    activeDeclaredCapacityBytes: sumOf(row => row.declared),
    activeConservativeAvailableBytes: sumOf(row => row.conservativeFree),
    activeRegisteredDataBytes: sumOf(row => row.registeredData),
    freshActiveProofCapacityBytes: sumOf(row => (row.proofFresh ? row.declared : 0n)),
    // Summed per keeper, so one vault's free/data mismatch cannot cancel
    // another's.
    activeCapacityDivergenceBytes: active.reduce((sum, row) => {
      const free = row.registeredFree >= row.provedFree
        ? row.registeredFree - row.provedFree : row.provedFree - row.registeredFree;
      const data = row.registeredData >= row.provedData
        ? row.registeredData - row.provedData : row.provedData - row.registeredData;
      return sum + free + data;
    }, 0n),
  };
}

export function useStorageSummary({ enabled = true }: { enabled?: boolean } = {}) {
  const refetchInterval = useAutoRefreshInterval();
  const { data: partitionCounts } = usePartitionCounts();
  const { data: sectorCounts } = useSectorCounts();
  // Summed in the store, by the same rules as `capacityFromRows`. Without a
  // store, or before the keepers are projected, the rows are summed here.
  const summary = useNetworkSummary();
  const storeCapacity = summary.data?.vaultKeepers?.capacity ?? null;

  const query = useQuery({
    // Keyed on the counts and the store's sums, so a later answer re-runs
    // rather than leaving the first one cached -- the same rule `useStorage`
    // follows.
    queryKey: ['storage-summary',
      partitionCounts ? `${partitionCounts.total}/${partitionCounts.active}/${partitionCounts.data}/${partitionCounts.capacity}` : 'none',
      sectorCounts ? `${sectorCounts.total}/${sectorCounts.active}` : 'none',
      storeCapacity ? Object.values(storeCapacity).join('/') : 'rows'],
    // Wait for the store's answer before deciding to sum the rows instead.
    enabled: enabled && !summary.isPending,
    queryFn: async (): Promise<StorageSummary> => {
      const capacity = storeCapacity
        ? {
          totalCapacityBytes: toBigInt(storeCapacity.totalCapacityBytes),
          activeDeclaredCapacityBytes: toBigInt(storeCapacity.activeDeclaredCapacityBytes),
          activeConservativeAvailableBytes: toBigInt(storeCapacity.activeConservativeAvailableBytes),
          activeRegisteredDataBytes: toBigInt(storeCapacity.activeRegisteredDataBytes),
          freshActiveProofCapacityBytes: toBigInt(storeCapacity.freshActiveProofCapacityBytes),
          activeCapacityDivergenceBytes: toBigInt(storeCapacity.activeCapacityDivergenceBytes),
        }
        : capacityFromRows(await readCurrentCapacityAccounting());

      return {
        ...capacity,
        activePartitions: partitionCounts?.active ?? 0,
        inactivePartitions: partitionCounts?.inactive ?? 0,
        dataPartitionCount: partitionCounts?.data ?? 0,
        capacityPartitionCount: partitionCounts?.capacity ?? 0,
        partitionCount: partitionCounts?.total ?? 0,
        sectorCount: sectorCounts?.total ?? 0,
        activeSectors: sectorCounts?.active ?? 0,
      };
    },
    refetchInterval,
    staleTime: 10_000,
  });
  return { ...query, isLoading: query.isLoading || summary.isPending };
}

/// What the storage overview shows: a subset of `StorageStats`, so the replay's
/// figures fill it unchanged when there is no store.
export type StorageOverviewStats = Pick<StorageStats,
  | 'totalCapacityBytes' | 'activeDeclaredCapacityBytes' | 'activeConservativeAvailableBytes'
  | 'freshActiveProofCapacityBytes' | 'activeRegisteredDataBytes' | 'activeCapacityDivergenceBytes'
  | 'activeSectorBlocks' | 'zkBlockSizeBytes' | 'sectorCount' | 'activeSectors'
  | 'activePartitions' | 'dataPartitionCount' | 'capacityPartitionCount' | 'inactivePartitions'
  | 'successRate' | 'submittedProofs' | 'missedProofs'
  | 'faultedSectors' | 'expiredSectors' | 'expiringSoonSectors'>;

/// One stored storage event as a row of the overview's table, labelled the way
/// the replay labels it.
export function storageEventRow(row: {
  name?: string; args?: Record<string, unknown>; blockNumber: string; transactionHash: string;
}): StorageEventRow | null {
  const a = (row.args ?? {}) as Record<string, any>;
  const base = {
    vk: a.vk as `0x${string}`,
    blockNumber: BigInt(row.blockNumber ?? 0),
    txHash: (row.transactionHash ?? '0x') as `0x${string}`,
  };
  const kind = Number(a.partitionKind ?? 1) === 2 ? 'capacity' : 'data';
  const round = { round: a.round as bigint, detail: `Round ${a.round}` };
  switch (row.name) {
    case 'SectorRegistered':
      return { ...base, type: 'Sector Registered', key: a.sectorKey, detail: `${Number(a.sectorBlockCount).toLocaleString()} blocks` };
    case 'SectorUpdated':
      return { ...base, type: 'Sector Updated', key: a.sectorKey, detail: `${Number(a.sectorBlockCount).toLocaleString()} blocks` };
    case 'SectorStatusChanged':
      return { ...base, type: a.active ? 'Sector Activated' : 'Sector Inactive', key: a.sectorKey, detail: '' };
    case 'ChallengeOpened':
      return { ...base, type: 'Sector Challenge', key: a.sectorKey, deadline: a.deadline, ...round };
    case 'SectorProofSubmitted':
      return { ...base, type: 'Sector Proof Submitted', key: a.sectorKey, ...round };
    case 'SectorProofMissed':
      return { ...base, type: 'Sector Proof Missed', key: a.sectorKey, ...round };
    case 'PartitionRegistered':
      return { ...base, type: 'Partition Registered', key: a.partitionKey, detail: `DL${a.deadlineIndex} / P${a.partitionIndex} · ${kind}` };
    case 'PartitionUpdated':
      return { ...base, type: 'Partition Updated', key: a.partitionKey, detail: `${a.sectorCount} sectors · ${kind}` };
    case 'PartitionContentVersionUpdated':
      return { ...base, type: 'Partition Content Updated', key: a.partitionKey, detail: `Version ${a.contentVersion}` };
    case 'PartitionDeactivated':
      return { ...base, type: 'Partition Deactivated', key: a.partitionKey, detail: kind };
    case 'PartitionChallengeOpened':
      return { ...base, type: 'Partition Challenge', key: a.partitionKey, deadline: a.deadline, ...round };
    case 'PartitionProofSubmitted':
    case 'PartitionProofSubmittedDeterministic':
      return { ...base, type: 'Partition Proof Submitted', key: a.partitionKey, ...round };
    default:
      return null;
  }
}

/// The events the overview's table lists: every storage event the replay
/// turned into a row.
const STORAGE_TABLE_EVENTS = [
  'SectorRegistered', 'SectorUpdated', 'SectorStatusChanged', 'ChallengeOpened',
  'SectorProofSubmitted', 'SectorProofMissed',
  'PartitionRegistered', 'PartitionUpdated', 'PartitionContentVersionUpdated', 'PartitionDeactivated',
  'PartitionChallengeOpened', 'PartitionProofSubmitted', 'PartitionProofSubmittedDeterministic',
] as const;

/// The size of one ZK block: one contract read, or the newest event that set it.
async function readZkBlockSize(): Promise<bigint> {
  const read = await readZkBlockSizeBytes();
  if (read > 0n) return read;
  const page = await fetchIndexPage<{ args?: Record<string, unknown> }>('events', {
    contract: 'StorageProofSC', event: 'ZkBlockSizeUpdated', order: 'desc', limit: 1,
  });
  return toBigInt(page?.rows[0]?.args?.zkBlockSizeBytes);
}

/**
 * The storage overview, from the store.
 *
 * `useStorage` replays sixteen event streams and every keeper row to build the
 * sector list, the partition list, the deadlines and these figures. The
 * overview shows only the figures and a list of recent events, and every figure
 * is now a count or a sum the store answers: capacity from the keeper rows,
 * sectors and partitions from theirs, proofs from the event log. The table is
 * the newest events, a page at a time.
 *
 * Without a store, the replay still answers, exactly as before.
 */
export function useStorageOverview(pageSize = 200) {
  const network = useNetworkSummary();
  // The store answered at all -- even with nothing projected yet.
  const storeMode = network.data != null;
  const replay = useStorage({ enabled: !network.isPending && !storeMode });

  const summary = useStorageSummary({ enabled: storeMode });
  const sectorCounts = useSectorCounts();
  const proofCounts = useEventCountsByName('StorageProofSC', storeMode);
  const refetchInterval = useAutoRefreshInterval();
  const zkBlockSize = useQuery({
    queryKey: ['zk-block-size'],
    enabled: storeMode,
    queryFn: readZkBlockSize,
    refetchInterval,
    staleTime: 60_000,
  });
  const events = usePagedEventRows<StorageEventRow>('StorageProofSC', STORAGE_TABLE_EVENTS, storageEventRow, pageSize);

  if (!storeMode) {
    return {
      stats: replay.data?.stats as StorageOverviewStats | undefined,
      events: replay.data?.events ?? [],
      eventsPaging: null,
      isLoading: network.isPending || replay.isLoading,
      error: replay.error,
      refetch: () => replay.refetch(),
    };
  }

  const capacity = summary.data;
  const counts = proofCounts.data;
  const sectors = sectorCounts.data;
  const n = (name: string) => counts?.[name] ?? 0;
  const sectorSubmitted = n('SectorProofSubmitted');
  const missed = n('SectorProofMissed');
  const stats: StorageOverviewStats | undefined = capacity ? {
    totalCapacityBytes: capacity.totalCapacityBytes,
    activeDeclaredCapacityBytes: capacity.activeDeclaredCapacityBytes,
    activeConservativeAvailableBytes: capacity.activeConservativeAvailableBytes,
    freshActiveProofCapacityBytes: capacity.freshActiveProofCapacityBytes,
    activeRegisteredDataBytes: capacity.activeRegisteredDataBytes,
    activeCapacityDivergenceBytes: capacity.activeCapacityDivergenceBytes,
    activeSectorBlocks: toBigInt(sectors?.activeBlocks ?? '0'),
    zkBlockSizeBytes: zkBlockSize.data ?? 0n,
    sectorCount: capacity.sectorCount,
    activeSectors: capacity.activeSectors,
    activePartitions: capacity.activePartitions,
    dataPartitionCount: capacity.dataPartitionCount,
    capacityPartitionCount: capacity.capacityPartitionCount,
    inactivePartitions: capacity.inactivePartitions,
    // Sector proofs only, as the replay computed it: partitions have no missed
    // proof to set against their submissions.
    successRate: sectorSubmitted + missed > 0 ? Math.round(sectorSubmitted / (sectorSubmitted + missed) * 100) : 0,
    submittedProofs: sectorSubmitted + n('PartitionProofSubmitted') + n('PartitionProofSubmittedDeterministic'),
    missedProofs: missed,
    faultedSectors: sectors?.faulted ?? 0,
    expiredSectors: sectors?.expired ?? 0,
    expiringSoonSectors: sectors?.expiringSoon ?? 0,
  } : undefined;

  return {
    stats,
    events: events.rows,
    eventsPaging: {
      hasMore: events.hasMore,
      loadMore: events.loadMore,
      loadingMore: events.loadingMore,
      isLoading: events.isLoading,
    },
    isLoading: summary.isLoading || proofCounts.isLoading,
    error: summary.error ?? proofCounts.error ?? events.error,
    refetch: () => Promise.all([summary.refetch(), proofCounts.refetch(), events.refetch()]),
  };
}

/**
 * Deadlines, grouped in the store.
 *
 * The screen showed a grouping of a keeper's partitions by deadline index, and
 * built it by replaying fifteen event streams into the browser and reducing them
 * there. The projected partition rows carry every field the grouping needs, so
 * it is one indexed GROUP BY, and it pages.
 */
export function usePagedDeadlines(pageSize = 200) {
  return useProjectedRows<DeadlineSummary>('deadlines', pageSize, (r) => ({
    id: r.id,
    vk: r.vk,
    deadlineIndex: Number(r.deadlineIndex ?? 0),
    partitionCount: Number(r.partitionCount ?? 0),
    sectorCount: toBigInt(r.sectorCount),
    openedChallenges: Number(r.openedChallenges ?? 0),
    submittedProofs: Number(r.submittedProofs ?? 0),
    expiringSoon: Number(r.expiringSoon ?? 0),
    faulted: Number(r.faulted ?? 0),
    health: r.health as StorageHealth,
  }));
}
