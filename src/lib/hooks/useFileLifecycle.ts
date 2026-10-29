'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useFileDetail } from '@/lib/hooks/useFiles';
import { useAccessRequests, useDataBatches } from '@/lib/hooks/useAccess';
import { useDKG } from '@/lib/hooks/useDKG';
import { usePRERequests } from '@/lib/hooks/usePRE';
import { EconomicEvent } from '@/lib/hooks/useEconomics';
import { usePolicies, PolicyEvent } from '@/lib/hooks/usePolicies';
import { useVKStorageRelationships, VKStorageRelationship } from '@/lib/hooks/useVKStorageRelationships';
import { fetchReceipts, useFileEconomicEvents, useFileEscrows, useFileStorageEvents } from '@/lib/hooks/useFileScope';
import { useAutoRefreshInterval } from '@/lib/refresh';

export type LifecycleStatus = 'complete' | 'active' | 'pending' | 'warning' | 'failed';

export interface LifecycleStep {
  key: string;
  label: string;
  status: LifecycleStatus;
  count: number;
  blockNumber?: bigint;
  txHash?: `0x${string}`;
  detail: string;
}

export interface LifecycleRow {
  type: string;
  blockNumber: bigint;
  txHash?: `0x${string}`;
  detail: string;
  href?: string;
  variant: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'cyan' | 'gray';
}

export interface LifecycleReceipt {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  blockNumber: bigint;
  blockTimestamp?: bigint;
  gasUsed: bigint;
  gasPriceWei: bigint;
  gasFeeWei: bigint;
  eventCount: number;
  status: 'success' | 'reverted';
}

export interface LifecycleReceiptSummary {
  txCount: number;
  eventCount: number;
  gasUsed: bigint;
  gasFeeWei: bigint;
  failedCount: number;
  receipts: LifecycleReceipt[];
}

export interface LifecycleCostSummary {
  policyEscrowDeposited: bigint;
  policyEscrowRefunded: bigint;
  accessEscrowDeposited: bigint;
  accessEscrowRefunded: bigint;
  vkEscrowDeposited: bigint;
  rewardsCredited: bigint;
  doGasWei: bigint;
  requesterGasWei: bigint;
  otherGasWei: bigint;
  fullCycleCostWei: bigint;
  doAddress?: `0x${string}`;
  requesterCount: number;
  rewardEventCount: number;
}

export interface LifecycleRelationshipRow {
  kind: 'DO-VK' | 'VK-REQ';
  status: 'exact_after_reveal' | 'revealed_deletion' | 'hidden_until_service_end' | 'inferred_from_policy';
  doAddress?: `0x${string}`;
  vkAddress?: `0x${string}`;
  requester?: `0x${string}`;
  commitmentHash?: `0x${string}`;
  paymentCommitment?: `0x${string}`;
  amount: bigint;
  blockNumber?: bigint;
  txHash?: `0x${string}`;
  detail: string;
}

const EMPTY_RECEIPT_SUMMARY: LifecycleReceiptSummary = {
  txCount: 0,
  eventCount: 0,
  gasUsed: 0n,
  gasFeeWei: 0n,
  failedCount: 0,
  receipts: [],
};

function latest<T extends { blockNumber: bigint }>(rows: T[]): T | undefined {
  return [...rows].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1))[0];
}

function isRealTxHash(hash: unknown): hash is `0x${string}` {
  return typeof hash === 'string' && /^0x[0-9a-fA-F]{64}$/.test(hash);
}

function uniqueTxHashes(hashes: Array<`0x${string}` | undefined>): `0x${string}`[] {
  return [...new Set(hashes.filter(isRealTxHash))];
}

function sumAmounts(events: EconomicEvent[], predicate: (event: EconomicEvent) => boolean): bigint {
  return events.filter(predicate).reduce((sum, event) => sum + event.amount, 0n);
}

function statusForEconomicEvent(event: EconomicEvent): LifecycleRow['variant'] {
  if (event.kind.includes('escrow')) return event.type.includes('Refund') || event.type.includes('Reclaim') ? 'cyan' : 'amber';
  if (event.kind === 'reward' || event.kind === 'claim') return 'green';
  if (event.kind === 'stake') return event.type.includes('Slash') ? 'red' : 'blue';
  return 'gray';
}

/**
 * Everything about one file or piece, read by its own keys.
 *
 * This used to download the whole network's history -- every storage, DKG, PRE,
 * access, economic and policy event, about a hundred lists -- and filter it down
 * to one file in the browser, then ask the node four times per policy and four
 * times per escrow claim, network-wide. Now each part asks the store only about
 * this file: the events filed under its id, the partition and sector its piece
 * sits in, the data owner's escrow deposits during its cycle, and the claims
 * the indexer has tied to it. Without a store the same questions go to the file
 * index; only the escrow links fall back to the old network-wide reading.
 */
export function useFileLifecycle(commitmentHash: `0x${string}`) {
  const refetchInterval = useAutoRefreshInterval();
  const fileId = commitmentHash;
  const file = useFileDetail(commitmentHash);
  const storage = useFileStorageEvents(file.data ? (file.data.record as Record<string, any> | null) : undefined);
  const access = useAccessRequests({ fileId });
  const batches = useDataBatches({ fileId });
  const dkg = useDKG({ fileId });
  const pre = usePRERequests({ fileId });
  const economics = useFileEconomicEvents(fileId);
  const policies = usePolicies({ fileId });

  // Who owns the file and when its cycle ran, from what has been read so far:
  // the escrow deposits of that owner inside that window are its storage
  // payments. The same rule the page always used, asked of the store instead.
  const cycle = useMemo(() => {
    const normalized = commitmentHash.toLowerCase();
    const policy = (policies.data?.policies ?? []).find(row => row.fileId.toLowerCase() === normalized);
    const policyEvents = (policies.data?.events ?? []).filter(event => event.fileId.toLowerCase() === normalized);
    const linkedAccess = (access.data ?? []).filter(row => row.fileId.toLowerCase() === normalized);
    const linkedBatches = (batches.data ?? []).filter(row => row.fileId.toLowerCase() === normalized);
    const linkedDkg = (dkg.data ?? []).filter(row => row.fileId.toLowerCase() === normalized);
    const linkedPre = (pre.data ?? []).filter(row => row.fileId.toLowerCase() === normalized);
    const doAddress = policy?.dataOwner ?? linkedBatches[0]?.dataOwner ?? linkedDkg[0]?.dataOwner;
    const blocks = [...policyEvents, ...linkedAccess, ...linkedBatches, ...linkedDkg, ...linkedPre]
      .map(row => row.blockNumber)
      .filter((block): block is bigint => block !== undefined);
    const start = blocks.length > 0 ? blocks.reduce((min, b) => (b < min ? b : min), blocks[0]) : 0n;
    const end = blocks.length > 0 ? blocks.reduce((max, b) => (b > max ? b : max), blocks[0]) + 30n : 0n;
    return { doAddress, start, end };
  }, [access.data, batches.data, commitmentHash, dkg.data, policies.data, pre.data]);

  const firstStageReady = Boolean(policies.data && batches.data && dkg.data && access.data && pre.data);
  const escrows = useFileEscrows({
    id: commitmentHash,
    doAddress: cycle.doAddress,
    fromBlock: cycle.start,
    toBlock: cycle.end,
    enabled: firstStageReady,
  });
  // Only an Explorer whose store has no escrow links reads every claim back
  // from the node, as this page always did.
  const vkStorageFallback = useVKStorageRelationships({ enabled: escrows.data?.linksAvailable === false });

  const baseData = useMemo(() => {
    if (!file.data) return undefined;

    const record: any = file.data.record;
    const fileEvents = file.data.events;
    const normalized = commitmentHash.toLowerCase();

    const policy = (policies.data?.policies ?? []).find(row => row.fileId.toLowerCase() === normalized);
    const policyEvents = (policies.data?.events ?? []).filter(event => event.fileId.toLowerCase() === normalized);

    // The events of the partition and sector this piece is recorded in.
    const linkedStorageEvents = storage.data?.events ?? [];
    const linkedPartitionKeys = storage.data?.partitionKeys ?? [];
    const linkedSectorKeys = storage.data?.sectorKeys ?? [];

    const linkedAccess = (access.data ?? []).filter(row => row.fileId.toLowerCase() === normalized);
    const linkedBatches = (batches.data ?? []).filter(row => row.fileId.toLowerCase() === normalized);
    const linkedDkg = (dkg.data ?? []).filter(row => row.fileId.toLowerCase() === normalized);
    const linkedPre = (pre.data ?? []).filter(row => row.fileId.toLowerCase() === normalized);
    const requestIds = new Set(linkedAccess.map(row => row.requestId.toString()));
    const baseEconomicEvents = (economics.data ?? []).filter(event =>
      event.fileId?.toLowerCase() === normalized ||
      (event.requestId !== undefined && requestIds.has(event.requestId.toString())) ||
      event.commitment?.toLowerCase() === normalized
    );
    const doAddress = policy?.dataOwner ?? linkedBatches[0]?.dataOwner ?? linkedDkg[0]?.dataOwner;
    const knownCycleRowsForWindow = [
      ...policyEvents,
      ...linkedAccess,
      ...linkedBatches,
      ...linkedDkg,
      ...linkedPre,
    ].filter(row => row.blockNumber !== undefined) as Array<{ blockNumber: bigint }>;
    const cycleStartBlock = knownCycleRowsForWindow.length > 0
      ? knownCycleRowsForWindow.reduce((min, row) => row.blockNumber < min ? row.blockNumber : min, knownCycleRowsForWindow[0].blockNumber)
      : 0n;
    const cycleEndBlock = knownCycleRowsForWindow.length > 0
      ? knownCycleRowsForWindow.reduce((max, row) => row.blockNumber > max ? row.blockNumber : max, knownCycleRowsForWindow[0].blockNumber) + 30n
      : 0n;
    // The owner's escrow deposits inside the cycle window, as found by the store,
    // checked again here by the same rule.
    const escrowEvents = [...(escrows.data?.candidateDeposits ?? []), ...(escrows.data?.paymentEvents ?? [])];
    const candidateVkEscrowDeposits = (escrows.data?.candidateDeposits ?? []).filter(event =>
      event.kind === 'vk_escrow' &&
      event.type.includes('Deposited') &&
      event.actor?.toLowerCase() === doAddress?.toLowerCase() &&
      (cycleStartBlock === 0n || event.blockNumber >= cycleStartBlock) &&
      (cycleEndBlock === 0n || event.blockNumber <= cycleEndBlock)
    );
    const candidatePaymentCommitments = new Set(
      candidateVkEscrowDeposits
        .map(event => event.commitment?.toLowerCase())
        .filter((value): value is string => Boolean(value))
    );
    const relationships = escrows.data?.linksAvailable === false
      ? (vkStorageFallback.data ?? [])
      : (escrows.data?.relationships ?? []);
    const linkedVkRelationships = relationships.filter(link =>
      link.commitmentHash?.toLowerCase() === normalized ||
      candidatePaymentCommitments.has(link.paymentCommitment.toLowerCase())
    );
    const linkedEconomicEvents = [
      ...baseEconomicEvents,
      ...escrowEvents.filter((event, i, all) =>
        all.findIndex(other => other.txHash === event.txHash && other.type === event.type) === i &&
        event.kind === 'vk_escrow' &&
        event.commitment !== undefined &&
        candidatePaymentCommitments.has(event.commitment.toLowerCase()) &&
        !baseEconomicEvents.some(base => base.txHash === event.txHash && base.type === event.type)
      ),
    ];

    const policyRows = policyEvents.map((event): LifecycleRow => ({
      type: event.type,
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      detail: event.detail,
      href: `/access/policies/${event.fileId}`,
      variant: event.variant,
    }));

    const registered = fileEvents.allRegistered.map((e: any): LifecycleRow => ({
      type: 'Piece Registered',
      blockNumber: e.blockNumber ?? 0n,
      txHash: e.transactionHash ?? '0x',
      detail: `VK ${String(e.args?.vkAddress ?? '').slice(0, 10)}...`,
      variant: 'green',
    }));
    const partitionLinked = fileEvents.partitionLinked.map((e: any): LifecycleRow => ({
      type: 'Partition Linked',
      blockNumber: e.blockNumber ?? 0n,
      txHash: e.transactionHash ?? '0x',
      detail: `Sector ${String(e.args?.sectorRoot ?? '').slice(0, 12)}...`,
      variant: 'blue',
    }));
    const migrations = fileEvents.migrations.map((e: any): LifecycleRow => ({
      type: 'Storage Migration',
      blockNumber: e.blockNumber ?? 0n,
      txHash: e.transactionHash ?? '0x',
      detail: `DL${e.args?.oldDeadlineIndex}/P${e.args?.oldPartitionIndex} -> DL${e.args?.newDeadlineIndex}/P${e.args?.newPartitionIndex}`,
      variant: 'purple',
    }));
    const deletionDeclared = fileEvents.deletionDeclared.map((e: any): LifecycleRow => ({
      type: 'Deletion Declared',
      blockNumber: e.blockNumber ?? 0n,
      txHash: e.transactionHash ?? '0x',
      detail: `Grace ${e.args?.graceSeconds}s`,
      variant: 'amber',
    }));
    const deletionConfirmed = fileEvents.deletionConfirmed.map((e: any): LifecycleRow => ({
      type: 'Deletion Confirmed',
      blockNumber: e.blockNumber ?? 0n,
      txHash: e.transactionHash ?? '0x',
      detail: 'File removed from storage',
      variant: 'red',
    }));

    const storageRows = linkedStorageEvents.map((event): LifecycleRow => ({
      type: event.type,
      blockNumber: event.blockNumber,
      txHash: event.txHash,
      detail: event.detail,
      href: event.type.includes('Partition') ? `/storage/partitions/${event.key}` : `/storage/sectors/${event.key}`,
      variant: event.type.includes('Missed') ? 'red' : event.type.includes('Challenge') ? 'amber' : event.type.includes('Partition') ? 'purple' : 'cyan',
    }));

    const dkgRows = linkedDkg.map(row => ({
      type: row.type === 'fresh' ? 'DKG Finalized' : 'DKG Refresh',
      blockNumber: row.blockNumber,
      txHash: row.txHash,
      detail: `${row.status} · epoch ${row.keyEpoch}${row.n && row.t ? ` · N${row.n}:T${row.t}` : ''} · ${row.dealerCount} dealer material(s)`,
      href: `/dkg?q=${row.fileId}`,
      variant: row.status === 'finalized' ? 'green' : 'red',
    } satisfies LifecycleRow));

    const accessRows = linkedAccess.map(row => ({
      type: 'Access Request',
      blockNumber: row.blockNumber,
      txHash: row.txHash,
      detail: `Request #${row.requestId} · ${row.fulfilled ? 'fulfilled' : 'pending'} · ${row.pieceCount} piece(s)`,
      href: `/access?q=${row.requestId}&view=requests`,
      variant: row.fulfilled ? 'green' : 'amber',
    } satisfies LifecycleRow));

    const batchRows = linkedBatches.map(row => ({
      type: 'Data Batch',
      blockNumber: row.blockNumber,
      txHash: row.txHash,
      detail: `Batch #${row.batchId} · N${row.n}:T${row.t} · ${row.pieceCount || row.n} piece(s) · epoch ${row.keyEpoch}`,
      href: `/access?q=${row.fileId}`,
      variant: 'blue',
    } satisfies LifecycleRow));

    const preRows = linkedPre.map(row => ({
      type: 'PRE Request',
      blockNumber: row.blockNumber,
      txHash: row.txHashes[0],
      detail: `Request #${row.requestId} · ${row.activeGuardians.length} partial(s) · ${row.badPartialGuardians.length} bad · ${row.expired ? 'expired' : 'active'}`,
      href: `/pre?q=${row.fileId}`,
      variant: row.expired ? 'red' : row.activeGuardians.length > 0 ? 'green' : 'amber',
    } satisfies LifecycleRow));

    const economicRows = linkedEconomicEvents.map(row => ({
      type: row.type,
      blockNumber: row.blockNumber,
      txHash: row.txHash,
      detail: row.amount > 0n
        ? `${row.amount.toString()} wei${row.requestId !== undefined ? ` · request #${row.requestId}` : ''}`
        : row.detail,
      href: row.fileId ? `/economics/files?q=${row.fileId}` : '/economics',
      variant: statusForEconomicEvent(row),
    } satisfies LifecycleRow));

    const vkStorageRows = linkedVkRelationships.map(link => {
      const deletionReveal = link.status === 'revealed_deletion' && link.confidence === 'exact_after_reveal';
      const exactReveal = link.confidence === 'exact_after_reveal';
      return {
        type: deletionReveal ? 'Piece Deletion Claimed' : exactReveal ? 'DO-VK Revealed' : 'VK Hidden Escrow',
        blockNumber: link.claimBlockNumber ?? link.depositBlockNumber ?? 0n,
        txHash: link.claimTxHash ?? link.depositTxHash,
        detail: exactReveal
          ? `DO ${link.doAddress.slice(0, 10)}... -> VK ${String(link.vkAddress ?? '').slice(0, 10)}...`
          : `DO escrow funded; VK hidden until service end claim`,
        href: link.commitmentHash ? `/files/${link.commitmentHash}` : '/economics/escrows',
        variant: deletionReveal ? 'red' : exactReveal ? 'green' : 'amber',
      } satisfies LifecycleRow;
    });
    const deletionRevealRows = vkStorageRows.filter(row => row.type === 'Piece Deletion Claimed');

    const policyRequesters = new Set<`0x${string}`>();
    for (const row of linkedAccess) policyRequesters.add(row.requester);
    for (const event of policyEvents) {
      if (event.type === 'Requester Added' && event.actor) policyRequesters.add(event.actor);
    }

    const relationshipRows: LifecycleRelationshipRow[] = [];
    for (const link of linkedVkRelationships) {
      const deletionReveal = link.status === 'revealed_deletion' && link.confidence === 'exact_after_reveal';
      relationshipRows.push({
        kind: 'DO-VK',
        status: deletionReveal
          ? 'revealed_deletion'
          : link.confidence === 'exact_after_reveal'
            ? 'exact_after_reveal'
            : 'hidden_until_service_end',
        doAddress: link.doAddress,
        vkAddress: link.vkAddress,
        commitmentHash: link.commitmentHash,
        paymentCommitment: link.paymentCommitment,
        amount: link.amount,
        blockNumber: link.claimBlockNumber ?? link.depositBlockNumber,
        txHash: link.claimTxHash ?? link.depositTxHash,
        detail: deletionReveal
          ? 'Exact after deletion claim revealed escrow/storage link'
          : link.confidence === 'exact_after_reveal'
            ? 'Exact after VK revealed escrow/storage link'
          : 'Depositor and amount are visible; VK/storage commitment stays hidden until claim',
      });

      if (link.vkAddress) {
        for (const requester of policyRequesters) {
          relationshipRows.push({
            kind: 'VK-REQ',
            status: 'inferred_from_policy',
            doAddress: link.doAddress,
            vkAddress: link.vkAddress,
            requester,
            commitmentHash: link.commitmentHash,
            paymentCommitment: link.paymentCommitment,
            amount: 0n,
            blockNumber: link.claimBlockNumber ?? link.depositBlockNumber,
            txHash: link.claimTxHash ?? link.depositTxHash,
            detail: deletionReveal
              ? 'Requester is exact for selected policy; VK link is from deletion claim'
              : 'Requester is exact for selected policy; VK link is from revealed/candidate storage escrow',
          });
        }
      }
    }

    const allRows = [
      ...policyRows,
      ...registered,
      ...partitionLinked,
      ...migrations,
      ...deletionDeclared,
      ...deletionConfirmed,
      ...storageRows,
      ...dkgRows,
      ...batchRows,
      ...accessRows,
      ...preRows,
      ...economicRows,
      ...vkStorageRows,
    ].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));

    const chronologicalRows = [...allRows].sort((a, b) => (a.blockNumber > b.blockNumber ? 1 : -1));

    const txHashes = uniqueTxHashes([
      ...allRows.map(row => row.txHash),
      ...linkedDkg.flatMap(row => row.materialTxHashes),
      ...linkedBatches.flatMap(row => [row.c1TxHash, ...row.cidTxHashes]),
      ...linkedPre.flatMap(row => row.txHashes),
      ...linkedEconomicEvents.map(row => row.txHash),
      ...linkedVkRelationships.flatMap(row => [row.depositTxHash, row.claimTxHash]),
    ]);

    const steps: LifecycleStep[] = [
      {
        key: 'policy',
        label: 'Policy',
        status: policy?.exists ? 'complete' : policyEvents.length > 0 ? 'active' : 'pending',
        count: policyEvents.length,
        blockNumber: latest(policyRows)?.blockNumber ?? policy?.createdBlock,
        txHash: latest(policyRows)?.txHash ?? policy?.createdTx,
        detail: policy ? `${policy.mode} · T${policy.threshold}/N${policy.selectedGuardians.length}` : 'No policy record',
      },
      {
        key: 'registered',
        label: 'Storage',
        status: registered.length > 0 || linkedVkRelationships.some(link => link.confidence === 'exact_after_reveal') ? 'complete' : linkedVkRelationships.length > 0 ? 'active' : 'pending',
        count: registered.length + partitionLinked.length + linkedStorageEvents.length + linkedVkRelationships.length,
        blockNumber: latest([...registered, ...partitionLinked, ...storageRows, ...vkStorageRows])?.blockNumber,
        txHash: latest([...registered, ...partitionLinked, ...storageRows, ...vkStorageRows])?.txHash,
        detail: registered.length > 0
          ? `${registered.length} registration(s)`
          : linkedVkRelationships.length > 0
            ? `${linkedVkRelationships.length} DO storage escrow(s); VK hidden until claim unless revealed`
            : 'No storage registration',
      },
      {
        key: 'batches',
        label: 'Data Batch',
        status: linkedBatches.length > 0 ? 'complete' : 'pending',
        count: linkedBatches.length,
        blockNumber: latest(batchRows)?.blockNumber,
        txHash: latest(batchRows)?.txHash,
        detail: linkedBatches.length > 0 ? `${linkedBatches.reduce((sum, row) => sum + (row.pieceCount || row.n), 0)} piece event(s)` : 'No DataVault batch',
      },
      {
        key: 'dkg',
        label: 'DKG',
        status: linkedDkg.some(s => s.status === 'finalized') ? 'complete' : linkedDkg.some(s => s.status === 'expired') ? 'failed' : 'pending',
        count: linkedDkg.length,
        blockNumber: latest(dkgRows)?.blockNumber,
        txHash: latest(dkgRows)?.txHash,
        detail: linkedDkg.length > 0 ? `${linkedDkg.length} session(s) · ${linkedDkg.reduce((sum, row) => sum + row.dealerCount, 0)} material(s)` : 'No matching fileId session',
      },
      {
        key: 'access',
        label: 'Access/PRE',
        status: linkedAccess.some(r => r.fulfilled) || linkedPre.some(r => r.activeGuardians.length > 0) ? 'complete' : linkedAccess.length > 0 || linkedPre.length > 0 ? 'active' : 'pending',
        count: linkedAccess.length + linkedPre.length,
        blockNumber: latest([...accessRows, ...preRows])?.blockNumber,
        txHash: latest([...accessRows, ...preRows])?.txHash,
        detail: `${linkedAccess.length} access · ${linkedPre.reduce((sum, row) => sum + row.activeGuardians.length, 0)} PRE partial(s)`,
      },
      {
        key: 'economics',
        label: 'Economics',
        status: linkedEconomicEvents.length > 0 ? 'complete' : 'pending',
        count: linkedEconomicEvents.length,
        blockNumber: latest(economicRows)?.blockNumber,
        txHash: latest(economicRows)?.txHash,
        detail: `${linkedEconomicEvents.filter(row => row.kind.includes('escrow')).length} escrow · ${linkedEconomicEvents.filter(row => row.kind === 'reward').length} reward`,
      },
      {
        key: 'deletion',
        label: 'Deletion',
        status: deletionConfirmed.length > 0 || deletionRevealRows.length > 0 ? 'complete' : deletionDeclared.length > 0 ? 'active' : 'pending',
        count: deletionDeclared.length + deletionConfirmed.length + deletionRevealRows.length,
        blockNumber: latest([...deletionDeclared, ...deletionConfirmed, ...deletionRevealRows])?.blockNumber,
        txHash: latest([...deletionDeclared, ...deletionConfirmed, ...deletionRevealRows])?.txHash,
        detail: deletionConfirmed.length > 0
          ? `Confirmed${deletionRevealRows.length > 0 ? ` · ${deletionRevealRows.length} relation reveal(s)` : ''}`
          : deletionRevealRows.length > 0
            ? `${deletionRevealRows.length} piece deletion claim(s)`
            : deletionDeclared.length > 0 ? 'Declared' : 'No deletion activity',
      },
    ];

    return {
      record,
      policy,
      policyEvents,
      fileEvents,
      steps,
      rows: allRows,
      chronologicalRows,
      txHashes,
      linkedStorageEvents,
      linkedPartitionKeys,
      linkedSectorKeys,
      linkedAccess,
      linkedBatches,
      linkedDkg,
      linkedPre,
      linkedEconomicEvents,
      linkedVkRelationships,
      relationshipRows,
      candidateVkEscrowDeposits,
    };
  }, [access.data, batches.data, commitmentHash, dkg.data, economics.data, escrows.data, file.data, policies.data, pre.data, storage.data, vkStorageFallback.data]);

  const txHashKey = baseData?.txHashes.join(',') ?? '';
  const receipts = useQuery({
    queryKey: ['file-cycle-receipts', commitmentHash, txHashKey],
    // Once the escrows are in: they add transactions, and asking before they
    // arrive asks for every receipt twice.
    enabled: !!baseData && baseData.txHashes.length > 0 && escrows.isFetched,
    // From the store in a few requests; the node is asked only about a
    // transaction the store holds no receipt for.
    queryFn: (): Promise<LifecycleReceipt[]> => fetchReceipts(baseData!.txHashes),
    staleTime: 10_000,
    refetchInterval,
  });

  const data = useMemo(() => {
    if (!baseData) return undefined;

    const receiptRows = receipts.data ?? [];
    const receiptSummary: LifecycleReceiptSummary = receiptRows.length > 0 ? {
      txCount: receiptRows.length,
      eventCount: receiptRows.reduce((sum, row) => sum + row.eventCount, 0),
      gasUsed: receiptRows.reduce((sum, row) => sum + row.gasUsed, 0n),
      gasFeeWei: receiptRows.reduce((sum, row) => sum + row.gasFeeWei, 0n),
      failedCount: receiptRows.filter(row => row.status === 'reverted').length,
      receipts: receiptRows,
    } : EMPTY_RECEIPT_SUMMARY;

    const linkedEconomicEvents = baseData.linkedEconomicEvents;
    const policyEscrowDeposited = sumAmounts(linkedEconomicEvents, event => event.kind === 'policy_escrow' && event.type.includes('Deposited'));
    const policyEscrowRefunded = sumAmounts(linkedEconomicEvents, event => event.kind === 'policy_escrow' && event.type.includes('Refunded'));
    const accessEscrowDeposited = sumAmounts(linkedEconomicEvents, event => event.kind === 'access_escrow' && event.type.includes('Deposited'));
    const accessEscrowRefunded = sumAmounts(linkedEconomicEvents, event => event.kind === 'access_escrow' && event.type.includes('Refunded'));
    const vkEscrowDeposited = sumAmounts(linkedEconomicEvents, event => event.kind === 'vk_escrow' && event.type.includes('Deposited'));
    const rewardsCredited = sumAmounts(linkedEconomicEvents, event => event.kind === 'reward');

    const doAddress = baseData.policy?.dataOwner ?? baseData.linkedBatches[0]?.dataOwner ?? baseData.linkedDkg[0]?.dataOwner;
    const requesterSet = new Set(baseData.linkedAccess.map(row => row.requester.toLowerCase()));
    const doGasWei = doAddress
      ? receiptRows.filter(row => row.from.toLowerCase() === doAddress.toLowerCase()).reduce((sum, row) => sum + row.gasFeeWei, 0n)
      : 0n;
    const requesterGasWei = receiptRows.filter(row => requesterSet.has(row.from.toLowerCase())).reduce((sum, row) => sum + row.gasFeeWei, 0n);
    const otherGasWei = receiptSummary.gasFeeWei - doGasWei - requesterGasWei;

    const costSummary: LifecycleCostSummary = {
      policyEscrowDeposited,
      policyEscrowRefunded,
      accessEscrowDeposited,
      accessEscrowRefunded,
      vkEscrowDeposited,
      rewardsCredited,
      doGasWei,
      requesterGasWei,
      otherGasWei: otherGasWei > 0n ? otherGasWei : 0n,
      fullCycleCostWei: (policyEscrowDeposited - policyEscrowRefunded) + (accessEscrowDeposited - accessEscrowRefunded) + vkEscrowDeposited + doGasWei + requesterGasWei,
      doAddress,
      requesterCount: requesterSet.size,
      rewardEventCount: linkedEconomicEvents.filter(event => event.kind === 'reward').length,
    };

    return {
      ...baseData,
      receiptSummary,
      costSummary,
      receiptsLoading: receipts.isLoading,
      receiptsError: receipts.error,
    };
  }, [baseData, receipts.data, receipts.error, receipts.isLoading]);

  return {
    data,
    isLoading: file.isLoading || storage.isLoading || access.isLoading || batches.isLoading || dkg.isLoading || pre.isLoading || economics.isLoading || policies.isLoading || escrows.isLoading,
    error: file.error || storage.error || access.error || batches.error || dkg.error || pre.error || economics.error || policies.error || escrows.error,
    refetch: () => {
      file.refetch();
      storage.refetch();
      access.refetch();
      batches.refetch();
      dkg.refetch();
      pre.refetch();
      economics.refetch();
      policies.refetch();
      escrows.refetch();
      receipts.refetch();
    },
  };
}

export type FileLifecycleData = NonNullable<ReturnType<typeof useFileLifecycle>['data']>;
