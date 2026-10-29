'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { GuardianRegistryABI } from '@/lib/abis/GuardianRegistry';
import { VaultKeeperRegistryABI } from '@/lib/abis/VaultKeeperRegistry';
import { FileRegistrationSCABI } from '@/lib/abis/FileRegistrationSC';
import { StorageProofSCABI } from '@/lib/abis/StorageProofSC';
import { DataVaultABI } from '@/lib/abis/DataVault';
import { countRequestsAtThreshold } from '@/lib/preCompletion.mjs';
import { ZkDkgCoordinatorV2ABI } from '@/lib/abis/ZkDkgCoordinatorV2';
import { AccessControlFTABI } from '@/lib/abis/AccessControlFT';
import { ReputationManagerABI } from '@/lib/abis/ReputationManager';
import { VKEscrowABI } from '@/lib/abis/VKEscrow';
import { fetchIndexedManifest, fetchIndexPage, IndexedFileTrustEvent } from '@/lib/indexedData';
import { ACTIVITY_EVENT_NAMES, ActivityItem, toActivityItem } from '@/lib/activity';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { getIndexedLogs } from '@/lib/indexedLogs';
import { countEventsByName } from '@/lib/hooks/useEventCounts';

export interface ChainStats {
  blockNumber: bigint;
  transactionCount: number | null;
  guardianCount: bigint;
  activeGuardians: number;
  vaultKeeperCount: bigint;
  activeVKs: number;
  dataOwnerCount: number;
  requesterCount: number;
  reporterCount: number;
  fileCount: number;
  /** False when there is no index, so every count drawn from past events
   *  is a recent slice rather than a total. */
  indexAvailable: boolean;
  storageCommitmentCount: number;
  activeStorageCommitmentCount: number;
  deletedStorageCommitmentCount: number;
  proofsSubmitted: number;
  proofsMissed: number;
  dkgSessions: number;
  accessRequests: number;
  indexedLogCount: number | null;
  indexedEventCount: number | null;
  timestamp: number;
}

/** Every figure the header shows, read from the index's own manifest. */
function chainStatsFromIndex(
  manifest: NonNullable<Awaited<ReturnType<typeof fetchIndexedManifest>>>,
  blockNumber: bigint,
): ChainStats {
  const c = manifest.counts as Record<string, number>;
  return {
    blockNumber,
    transactionCount: c.transactions ?? null,
    guardianCount: BigInt(c.guardians ?? 0),
    activeGuardians: c.guardiansActive ?? 0,
    vaultKeeperCount: BigInt(c.vaultKeepers ?? 0),
    activeVKs: c.vaultKeepersActive ?? 0,
    dataOwnerCount: c.dataOwners ?? 0,
    requesterCount: c.requesters ?? 0,
    reporterCount: c.reporters ?? 0,
    fileCount: c.filesWithPieces ?? 0,
    indexAvailable: true,
    storageCommitmentCount: c.storageCommitments ?? 0,
    activeStorageCommitmentCount: c.storageCommitmentsActive ?? 0,
    deletedStorageCommitmentCount: c.storageCommitmentsDeleted ?? 0,
    proofsSubmitted: c.proofsSubmitted ?? 0,
    proofsMissed: c.proofsMissed ?? 0,
    dkgSessions: c.dkgSessions ?? 0,
    accessRequests: c.accessRequests ?? 0,
    indexedLogCount: c.logs ?? null,
    indexedEventCount: c.filetrustEvents ?? null,
    timestamp: Date.now(),
  };
}

/**
 * The site header's figures.
 *
 * This runs on every screen, for every visitor, which makes it the single
 * hottest thing in the Explorer -- and it used to be the most expensive: it
 * downloaded nineteen whole event streams and made a hundred contract calls to
 * produce fourteen numbers. At ten thousand keepers that is not slow, it is an
 * outage: a few hundred readers refreshing a dashboard would saturate the RPC
 * node the network itself depends on.
 *
 * Two of the numbers were also wrong. Active guardians and active keepers were
 * counted by reading the first fifty registrations one call at a time, so past
 * the fiftieth the header simply understated the network.
 *
 * All of it is computed in the store now, once per ingest, and lands in the
 * manifest -- a document this hook already fetched. So the whole header costs
 * one request that was already being made, plus one call for the chain head.
 */
export function useChainStats() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['chain-stats'],
    queryFn: async (): Promise<ChainStats> => {
      const [head, manifest] = await Promise.all([
        publicClient.getBlockNumber().catch(() => null),
        fetchIndexedManifest(),
      ]);

      const counts = manifest?.counts as Record<string, number> | undefined;
      if (manifest && Number(counts?.networkStatsBlock ?? 0) > 0) {
        // The head from the node when it answers; otherwise the newest block the
        // index holds. Both are "the newest block this Explorer knows about",
        // and showing that beats showing nothing because one RPC call timed out.
        return chainStatsFromIndex(manifest, head ?? BigInt(manifest.latestBlock ?? 0));
      }

      return chainStatsFromChain();
    },
    refetchInterval,
    staleTime: 6_000,
  });
}

/**
 * The old path: derive every figure by downloading the log.
 *
 * Kept, unchanged, for an Explorer with no store behind it -- a local checkout
 * pointed straight at a node, which is a real way this runs. It is the reason
 * the fast path needs an explicit marker rather than guessing from the numbers:
 * this has to stay reachable, and it has to stay obvious when it is reached.
 *
 * It is not what production uses. Nineteen whole event streams and a hundred
 * contract reads, on every screen, for every visitor.
 */
async function chainStatsFromChain(): Promise<ChainStats> {
  {
    {
      const [blockNumber, indexedManifest, guardianCount, vkCount, fileEvents, deletionConfirmedEvents, proofSubmitted, proofMissed, dkgFinalized, accessReq, guardianAddrs, vkAddrs] = await Promise.all([
        publicClient.getBlockNumber(),
        fetchIndexedManifest(),
        publicClient.readContract({ address: CONTRACTS.GuardianRegistry, abi: GuardianRegistryABI, functionName: 'getGuardianCount' }).catch(() => 0n),
        publicClient.readContract({ address: CONTRACTS.VaultKeeperRegistry, abi: VaultKeeperRegistryABI, functionName: 'getVaultKeeperCount' }).catch(() => 0n),
        getIndexedLogs({ address: CONTRACTS.FileRegistrationSC, event: FileRegistrationSCABI.find(e => e.name === 'FileStorageRegistered')! as any }),
        // Active piece accounting is only exact when both registration and
        // confirmed-deletion histories are available. Fail the query instead
        // of silently presenting historical registrations as active storage.
        getIndexedLogs({ address: CONTRACTS.FileRegistrationSC, event: FileRegistrationSCABI.find(e => e.name === 'FileDeletionConfirmed')! as any }),
        getIndexedLogs({ address: CONTRACTS.StorageProofSC, event: StorageProofSCABI.find(e => e.name === 'SectorProofSubmitted')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.StorageProofSC, event: StorageProofSCABI.find(e => e.name === 'SectorProofMissed')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.ZkDkgCoordinatorV2, event: ZkDkgCoordinatorV2ABI.find(e => e.name === 'ZkDkgV2Finalized')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.DataVault, event: DataVaultABI.find(e => e.name === 'DataAccessRequestedV2')! as any }).catch(() => []),
        publicClient.readContract({ address: CONTRACTS.GuardianRegistry, abi: GuardianRegistryABI, functionName: 'getAllGuardians' }).catch(() => [] as `0x${string}`[]),
        publicClient.readContract({ address: CONTRACTS.VaultKeeperRegistry, abi: VaultKeeperRegistryABI, functionName: 'getAllVaultKeepers' }).catch(() => [] as `0x${string}`[]),
      ]);

      const [
        roleUpdated,
        policyCreated,
        policyUpdated,
        keyGenRequested,
        requesterAdded,
        reencRequested,
        batchCreated,
        encCidAddedV2,
        encCidsBatchAdded,
        dkgComplaints,
        preComplaints,
      ] = await Promise.all([
        getIndexedLogs({ address: CONTRACTS.AccessControlFT, event: AccessControlFTABI.find(e => e.name === 'RoleUpdated')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.AccessControlFT, event: AccessControlFTABI.find(e => e.name === 'FilePolicyCreated')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.AccessControlFT, event: AccessControlFTABI.find(e => e.name === 'FilePolicyUpdated')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.AccessControlFT, event: AccessControlFTABI.find(e => e.name === 'KeyGenRequestedForFile')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.AccessControlFT, event: AccessControlFTABI.find(e => e.name === 'RequesterAddedToFile')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.AccessControlFT, event: AccessControlFTABI.find(e => e.name === 'ReencRequestedForFile')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.DataVault, event: DataVaultABI.find(e => e.name === 'BatchCreated')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.DataVault, event: DataVaultABI.find(e => e.name === 'EncCidAddedV2')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.DataVault, event: DataVaultABI.find(e => e.name === 'EncCidsBatchAdded')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.ReputationManager, event: ReputationManagerABI.find(e => e.name === 'DkgComplaintSubmitted')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.ReputationManager, event: ReputationManagerABI.find(e => e.name === 'PreComplaintSubmitted')! as any }).catch(() => []),
      ]);

      // Count active guardians
      const guardianStatuses = await Promise.all(
        (guardianAddrs as `0x${string}`[]).slice(0, 50).map(addr =>
          publicClient.readContract({ address: CONTRACTS.GuardianRegistry, abi: GuardianRegistryABI, functionName: 'isActiveGuardian', args: [addr] }).catch(() => false)
        )
      );
      const activeGuardians = guardianStatuses.filter(Boolean).length;

      // Count active VKs
      const vkStatuses = await Promise.all(
        (vkAddrs as `0x${string}`[]).slice(0, 50).map(addr =>
          publicClient.readContract({ address: CONTRACTS.VaultKeeperRegistry, abi: VaultKeeperRegistryABI, functionName: 'isEligibleVaultKeeper', args: [addr] }).catch(() => false)
        )
      );
      const activeVKs = vkStatuses.filter(Boolean).length;
      let transactionCount = indexedManifest?.counts?.transactions ?? null;
      // Only reached when there is no manifest to read the totals from. With
      // one, asking for every contract's events downloaded the entire index to
      // count rows the manifest already counted -- megabytes for one number, and
      // the single largest request any screen made.
      const contractLogCount = indexedManifest
        ? null
        : (await getIndexedLogs({ address: Object.values(CONTRACTS) }).catch(() => null))?.length ?? null;

      const dataOwners = new Set<string>();
      const requesters = new Set<string>();
      const reporters = new Set<string>();
      const deletionConfirmedCommitments = new Set(
        deletionConfirmedEvents.map(log =>
          String((log as any).args?.commitmentHash ?? '').toLowerCase()
        ).filter(Boolean)
      );
      const activeStorageCommitmentCount = fileEvents.reduce((count, log) => {
        const commitment = String(
          (log as any).args?.commitmentHash ?? ''
        ).toLowerCase();
        return count + (
          commitment && !deletionConfirmedCommitments.has(commitment) ? 1 : 0
        );
      }, 0);
      const addAddress = (set: Set<string>, value: unknown) => {
        if (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)) {
          set.add(value.toLowerCase());
        }
      };

      for (const log of roleUpdated) {
        const a = (log as any).args;
        const role = Number(a?.role ?? -1);
        if (role === 2) addAddress(dataOwners, a?.account);
        if (role === 3) addAddress(requesters, a?.account);
      }
      for (const log of [...policyCreated, ...policyUpdated, ...keyGenRequested, ...batchCreated]) {
        addAddress(dataOwners, (log as any).args?.dataOwner);
      }
      for (const log of [...requesterAdded, ...reencRequested, ...accessReq]) {
        addAddress(requesters, (log as any).args?.requester);
      }
      for (const log of [...dkgComplaints, ...preComplaints]) {
        addAddress(reporters, (log as any).args?.reporter);
      }

      // "Real stored files" = fileIds that actually have encrypted CID/PID records on-chain.
      // This intentionally excludes policy-only fileIds with no encrypted upload persisted.
      const filesWithEncryptedPid = new Set<string>();
      for (const log of encCidAddedV2) {
        const args = (log as any).args;
        if (args?.valid === false) continue;
        const fileId = String(args?.fileId ?? '').toLowerCase();
        if (fileId) filesWithEncryptedPid.add(fileId);
      }
      for (const log of encCidsBatchAdded) {
        const args = (log as any).args;
        const count = Number(args?.count ?? 0);
        if (!Number.isFinite(count) || count <= 0) continue;
        const fileId = String(args?.fileId ?? '').toLowerCase();
        if (fileId) filesWithEncryptedPid.add(fileId);
      }

      if (transactionCount === null && blockNumber <= 5_000n) {
        const blocks = await Promise.all(
          Array.from({ length: Number(blockNumber + 1n) }, (_, i) =>
            publicClient.getBlock({ blockNumber: BigInt(i) }).catch(() => null)
          )
        );
        transactionCount = blocks.reduce((sum, block) => sum + (Array.isArray(block?.transactions) ? block.transactions.length : 0), 0);
      }

      return {
        blockNumber,
        transactionCount,
        guardianCount: BigInt(guardianCount),
        activeGuardians,
        vaultKeeperCount: BigInt(vkCount),
        activeVKs,
        dataOwnerCount: dataOwners.size,
        requesterCount: requesters.size,
        reporterCount: reporters.size,
        fileCount: filesWithEncryptedPid.size,
        indexAvailable: indexedManifest !== null,
        storageCommitmentCount: fileEvents.length,
        activeStorageCommitmentCount,
        deletedStorageCommitmentCount:
          fileEvents.length - activeStorageCommitmentCount,
        proofsSubmitted: proofSubmitted.length,
        proofsMissed: proofMissed.length,
        dkgSessions: dkgFinalized.length,
        accessRequests: accessReq.length,
        indexedLogCount: indexedManifest?.counts.logs ?? contractLogCount,
        indexedEventCount: indexedManifest?.counts.filetrustEvents ?? contractLogCount,
        timestamp: Date.now(),
      };
    }
  }
}

/**
 * How many rows each activity stream may return.
 *
 * The feed renders fifty items and was asking for five thousand from each of ten
 * streams. The block window usually keeps that theoretical, but "usually" is
 * doing real work there: two hundred blocks of a busy chain can hold more than
 * five thousand events, and then the dashboard pulls megabytes to show fifty
 * lines. Measured at ten million events with a window that happened to match
 * everything, one stream alone returned 2.9 MB.
 *
 * Two hundred is enough that the fifty shown are the newest fifty even when one
 * kind of event dominates the window.
 */
const ACTIVITY_ROW_LIMIT = 200;

/// The events the Keying & Access cards count.
export const KEY_ACCESS_EVENTS = [
  'ZkDkgV2Finalized', 'ZkDkgV2SamePkRefreshFinalized', 'DkgKeyGenExpired', 'V2RefreshExpired',
  // ReencryptedCidsStored is deliberately NOT here. It fires only from
  // DataVault.storeReencryptedCids, the LEGACY TElG path, which V2 never calls --
  // req_actions.py says so outright: "reusableRequestPlusOneByKey is only set by
  // Legacy TElG (storeReencryptedCids), never by V2". Counting it made PRE
  // Completed read 0 forever and pushed every finished request into PRE Waiting.
  'DataAccessRequestedV2', 'PreRequestExpired',
  // The two work cards under Proofs & Disputes. A batch submission emits a
  // single V2AccessPartialSubmitted per Guardian beside its batch event, and
  // the contract refuses a second partial from one Guardian for one request,
  // so counting that event is counting partials.
  'ZkDkgV2DealerMaterialAccepted', 'V2AccessPartialSubmitted', 'PreBadPartialDetected',
];

export interface KeyAccessCounts {
  dkgFinalized: number;
  dkgRefreshed: number;
  dkgExpired: number;
  refreshExpired: number;
  accessRequests: number;
  /** Requests whose accepted partials reached their file's Guardian threshold,
   *  which is the point the requester can reconstruct. Null when the join behind
   *  it could not be read -- V2 emits no completion event, so this is derived. */
  preCompleted: number | null;
  /** Requests the Guardians did not answer in time. */
  preExpired: number;
  /** Neither yet. Null when completion could not be determined, since a pending
   *  count derived from an unknown completed count would be a guess. */
  prePending: number | null;
  /** Dealer material accepted by the DKG coordinator, over every round. */
  dkgDealerMaterials: number;
  /** Guardian PRE partials accepted. */
  prePartials: number;
  preBadPartials: number;
  /** True when a count came from a capped list, so the real figure may be higher. */
  atLeast: boolean;
  source: 'store' | 'files';
}

/// Cap on a counted list when there is no store to count in.
const FILE_COUNT_CAP = 5_000;

/**
 * DKG and PRE totals for the Keying & Access cards.
 *
 * Counted in the store. They used to be the length of a downloaded list, which
 * is capped at 5,000 rows, so the cards stopped at 5,000 however many there
 * were. Without a store, the file index is counted the same capped way and the
 * card says "at least".
 */
/**
 * How many V2 access requests have actually been fulfilled.
 *
 * V2 has NO completion event. Every event TElGv2 emits is a step, not a verdict:
 * V2AccessPartialSubmitted, PreReadyDeclared, PreBadPartialDetected,
 * PreRequestExpired. So completion has to be derived, and the derivation is the
 * one the cryptography already dictates: a request is fulfilled once accepted
 * partials reach its file's Guardian threshold, because that is the point at
 * which the requester can reconstruct.
 *
 * Checked live on 2026-10-06 against a chain with 21 requests: every one had 3 or
 * 4 partial guardians via getV2PartialGuardians, so every one was complete, while
 * the card read 0 completed and 11 waiting.
 *
 * Three reads, joined here rather than in SQL: partials per request, the file each
 * request belongs to, and that file's threshold. Returns null when any of them is
 * unavailable, so the card can say "unknown" instead of implying zero.
 */
async function countFulfilledPreRequests(): Promise<{ completed: number; requests: number } | null> {
  const query = new URLSearchParams({ op: 'count', group: 'arg:requestId' });
  query.append('event', 'V2AccessPartialSubmitted');
  const [aggregate, requestPage, policyPage] = await Promise.all([
    fetch(`/api/index/aggregate?${query}`, { cache: 'default' })
      .then(res => (res.ok ? res.json() : null))
      .catch(() => null),
    fetchIndexPage<IndexedFileTrustEvent>('events', {
      event: 'DataAccessRequestedV2', limit: FILE_COUNT_CAP,
    }),
    fetchIndexPage<{ fileId?: string; threshold?: number }>('file-policies', {
      limit: FILE_COUNT_CAP,
    }),
  ]);
  if (!aggregate?.groups || requestPage === null || policyPage === null) return null;

  const partialsByRequest = new Map<string, number>(
    (aggregate.groups as { key: string; value: string }[])
      .map(group => [String(group.key), Number(group.value)]),
  );
  const thresholdByFile = new Map<string, number>(
    policyPage.rows
      .filter(row => row.fileId)
      .map(row => [String(row.fileId).toLowerCase(), Number(row.threshold ?? 0)]),
  );

  // One request id can appear once only, but the page is newest-first and may be
  // capped, so dedupe rather than trust the row count.
  const fileByRequest = new Map<string, string>();
  for (const row of requestPage.rows) {
    const requestId = row.args?.requestId;
    const fileId = row.args?.fileId;
    if (requestId === undefined || fileId === undefined) continue;
    fileByRequest.set(String(requestId), String(fileId).toLowerCase());
  }

  const { completed, requests } = countRequestsAtThreshold(
    partialsByRequest, fileByRequest, thresholdByFile,
  );
  return { completed, requests };
}

export function useKeyAccessCounts() {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: ['key-access-counts'],
    queryFn: async (): Promise<KeyAccessCounts | null> => {
      let counts = await countEventsByName(KEY_ACCESS_EVENTS);
      let atLeast = false;
      let source: KeyAccessCounts['source'] = 'store';
      if (!counts) {
        const pages = await Promise.all(KEY_ACCESS_EVENTS.map(name =>
          fetchIndexPage<IndexedFileTrustEvent>('events', { event: name, limit: FILE_COUNT_CAP })));
        if (pages.some(page => page === null)) return null;
        counts = Object.fromEntries(KEY_ACCESS_EVENTS.map((name, i) => [name, pages[i]!.rows.length]));
        atLeast = pages.some(page => page!.rows.length >= FILE_COUNT_CAP);
        source = 'files';
      }
      const n = (name: string) => counts?.[name] ?? 0;
      // Derived, because V2 emits no completion event. Null means "could not
      // tell", which the card shows as unknown rather than as zero.
      const fulfilled = await countFulfilledPreRequests();
      const accessRequests = n('DataAccessRequestedV2');
      const preExpired = n('PreRequestExpired');
      return {
        dkgFinalized: n('ZkDkgV2Finalized'),
        dkgRefreshed: n('ZkDkgV2SamePkRefreshFinalized'),
        dkgExpired: n('DkgKeyGenExpired'),
        refreshExpired: n('V2RefreshExpired'),
        accessRequests,
        preCompleted: fulfilled ? fulfilled.completed : null,
        preExpired,
        prePending: fulfilled
          ? Math.max(0, accessRequests - fulfilled.completed - preExpired)
          : null,
        dkgDealerMaterials: n('ZkDkgV2DealerMaterialAccepted'),
        prePartials: n('V2AccessPartialSubmitted'),
        preBadPartials: n('PreBadPartialDetected'),
        atLeast,
        source,
      };
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/// How many of the newest events the feed and the block chart are drawn from.
export const RECENT_ACTIVITY_LIMIT = 100;

export interface RecentActivity {
  items: ActivityItem[];
  /** 'index': the newest events over all of history. 'chain-window': no index
   *  to ask, so only what the last 200 blocks hold. */
  source: 'index' | 'chain-window';
}

/**
 * The newest FileTrust activity, whenever it happened.
 *
 * This used to read only the last 200 blocks -- about three minutes of a
 * one-second chain -- so on any network that was not busy at that very moment
 * the feed and both charts were empty, with the whole history sitting in the
 * index. It now asks the index for the newest events of every kind the
 * dashboard calls activity (see activity.ts), in one request. The 200-block
 * read is kept only for an Explorer with no index at all.
 */
export function useRecentActivity() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['recent-activity'],
    queryFn: async (): Promise<RecentActivity> => {
      const page = await fetchIndexPage<IndexedFileTrustEvent>('events', {
        event: ACTIVITY_EVENT_NAMES,
        order: 'desc',
        limit: RECENT_ACTIVITY_LIMIT,
      });
      if (page) {
        const items = page.rows
          .map(row => toActivityItem(row))
          .filter((item): item is ActivityItem => item !== null)
          // The store answers newest first; the file index is reversed to match.
          // Sorted anyway, so the two cannot disagree on order.
          .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : b.blockNumber < a.blockNumber ? -1 : 0));
        return { items, source: 'index' };
      }
      return { items: await recentActivityFromChain(), source: 'chain-window' };
    },
    refetchInterval,
    staleTime: 6_000,
  });
}

/// The fallback with no index behind it: the last 200 blocks, read per event.
async function recentActivityFromChain(): Promise<ActivityItem[]> {
  const currentBlock = await publicClient.getBlockNumber();
  const fromBlock = currentBlock > 200n ? currentBlock - 200n : 0n;

  const [files, deletionDeclared, deletionConfirmed, deletionClaims, proofSubmitted, proofMissed, guardians, vks, access, dkg] = await Promise.all([
    getIndexedLogs({ address: CONTRACTS.FileRegistrationSC, event: FileRegistrationSCABI.find(e => e.name === 'FileStorageRegistered')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }),
    getIndexedLogs({ address: CONTRACTS.FileRegistrationSC, event: FileRegistrationSCABI.find(e => e.name === 'FileDeletionDeclared')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
    getIndexedLogs({ address: CONTRACTS.FileRegistrationSC, event: FileRegistrationSCABI.find(e => e.name === 'FileDeletionConfirmed')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
    getIndexedLogs({ address: CONTRACTS.VKEscrow, event: VKEscrowABI.find(e => e.name === 'EscrowClaimedOnDeletion')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
    getIndexedLogs({ address: CONTRACTS.StorageProofSC, event: StorageProofSCABI.find(e => e.name === 'SectorProofSubmitted')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
    getIndexedLogs({ address: CONTRACTS.StorageProofSC, event: StorageProofSCABI.find(e => e.name === 'SectorProofMissed')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
    getIndexedLogs({ address: CONTRACTS.GuardianRegistry, event: GuardianRegistryABI.find(e => e.name === 'GuardianRegistered')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
    getIndexedLogs({ address: CONTRACTS.VaultKeeperRegistry, event: VaultKeeperRegistryABI.find(e => e.name === 'VaultKeeperRegistered')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
    getIndexedLogs({ address: CONTRACTS.DataVault, event: DataVaultABI.find(e => e.name === 'DataAccessRequestedV2')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
    getIndexedLogs({ address: CONTRACTS.ZkDkgCoordinatorV2, event: ZkDkgCoordinatorV2ABI.find(e => e.name === 'ZkDkgV2Finalized')! as any, fromBlock, toBlock: 'latest', limit: ACTIVITY_ROW_LIMIT }).catch(() => []),
  ]);

  const items: ActivityItem[] = [];

  for (const l of files) {
    const a = (l as any).args;
    items.push({ type: 'file', label: 'Piece Registered', description: `Commitment: ${(a.commitmentHash as string).slice(0, 12)}…`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-blue' });
  }
  for (const l of deletionDeclared) {
    const a = (l as any).args;
    items.push({ type: 'deletion', label: 'Deletion Declared', description: `Piece: ${(a.commitmentHash as string).slice(0, 12)}…`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-amber' });
  }
  for (const l of deletionConfirmed) {
    const a = (l as any).args;
    items.push({ type: 'deletion', label: 'Deletion Confirmed', description: `Piece: ${(a.commitmentHash as string).slice(0, 12)}…`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-red' });
  }
  for (const l of deletionClaims) {
    const a = (l as any).args;
    items.push({ type: 'escrow', label: 'VK Deletion Escrow Claimed', description: `VK: ${(a.recipient as string).slice(0, 10)}…`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-cyan' });
  }
  for (const l of proofSubmitted) {
    const a = (l as any).args;
    items.push({ type: 'proof', label: 'Proof Submitted', description: `VK: ${(a.vk as string).slice(0, 10)}… round ${a.round}`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-green' });
  }
  for (const l of proofMissed) {
    const a = (l as any).args;
    items.push({ type: 'missed', label: 'Proof Missed', description: `VK: ${(a.vk as string).slice(0, 10)}… round ${a.round}`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-red' });
  }
  for (const l of guardians) {
    const a = (l as any).args;
    items.push({ type: 'guardian', label: 'Guardian Joined', description: `Address: ${(a.guardian as string).slice(0, 10)}…`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-purple' });
  }
  for (const l of vks) {
    const a = (l as any).args;
    items.push({ type: 'vk', label: 'Vault Keeper Joined', description: `Address: ${(a.vkAddress as string).slice(0, 10)}…`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-cyan' });
  }
  for (const l of access) {
    const a = (l as any).args;
    items.push({ type: 'access', label: 'Data Access Request', description: `Request #${a.requestId}`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-amber' });
  }
  for (const l of dkg) {
    const a = (l as any).args;
    items.push({ type: 'dkg', label: 'DKG Finalized', description: `N=${a.n} T=${a.t} epoch ${a.keyEpoch}`, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', color: 'text-ft-purple' });
  }

  return items.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1)).slice(0, 50);
}
