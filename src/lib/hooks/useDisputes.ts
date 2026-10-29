'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { StorageReceiptDisputeABI } from '@/lib/abis/StorageReceiptDispute';
import { ZkDkgDisputeManagerABI } from '@/lib/abis/ZkDkgDisputeManager';
import { ReputationManagerABI } from '@/lib/abis/ReputationManager';
import { fetchIndexedFileTrustEvents, toBigInt, toNumber } from '@/lib/indexedData';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { getIndexedLogs } from '@/lib/indexedLogs';
import { useEventCountsByName, usePagedEventRows } from '@/lib/hooks/useEventCounts';

export interface DisputeEvent {
  type: string;
  category: 'storage' | 'deletion' | 'zkdkg' | 'penalty';
  disputeId?: `0x${string}`;
  vk?: `0x${string}`;
  guardian?: `0x${string}`;
  dealer?: `0x${string}`;
  receiver?: `0x${string}`;
  reporter?: `0x${string}`;
  fileId?: `0x${string}`;
  commitmentHash?: `0x${string}`;
  sectorRoot?: `0x${string}`;
  partitionRoot?: `0x${string}`;
  reason?: string;
  detail?: string;
  stakeSlashed?: bigint;
  reputationPenalty?: number;
  violationLevel?: number;
  totalValidDisputes?: number;
  suspendedUntil?: bigint;
  permanentlyRemoved?: boolean;
  deadline?: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

function hex(value: unknown): `0x${string}` | undefined {
  return typeof value === 'string' && value.startsWith('0x') ? value as `0x${string}` : undefined;
}

function txHash(value: unknown): `0x${string}` {
  return hex(value) ?? '0x';
}

export function useDisputes() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['disputes'],
    queryFn: async (): Promise<DisputeEvent[]> => {
      const D = (name: string) => getIndexedLogs({
        address: CONTRACTS.StorageReceiptDispute,
        event: StorageReceiptDisputeABI.find(e => e.name === name)! as any,
      }).catch(() => []);

      const Z = (name: string) => getIndexedLogs({
        address: CONTRACTS.ZkDkgDisputeManager,
        event: ZkDkgDisputeManagerABI.find(e => e.name === name)! as any,
      }).catch(() => []);

      const R = (name: string) => getIndexedLogs({
        address: CONTRACTS.ReputationManager,
        event: ReputationManagerABI.find(e => e.name === name)! as any,
      }).catch(() => []);

      let [
        submitted,
        valid,
        invalid,
        enforcement,
        suspended,
        removed,
        sectorRisk,
        deletionSubmitted,
        deletionValid,
        deletionInvalid,
        deletionEnforcement,
        zkDkgOpened,
        zkDkgJustified,
        zkDkgExpired,
        zkDkgExcluded,
        vkPenalty,
        vkSerious,
        guardianSerious,
        dkgFailures,
        preFailures,
        dkgComplaints,
        preComplaints,
      ] = Array.from({ length: 22 }, () => []) as any[][];

      // Only the three contracts this screen reads, named the several ways the
      // index may label them. Asking for the whole index and discarding the rest
      // is what the server-side filter exists to avoid.
      const indexed = await fetchIndexedFileTrustEvents({
        contract: [
          'StorageReceiptDispute',
          'ZkDkgDisputeManager', 'ZK-DKG Dispute Manager', 'ZK-DKG Dispute Mgr',
          'ReputationManager',
        ],
      });
      if (indexed?.length) {
        const logsFor = (contractNames: string | string[], name: string) => {
          const names = Array.isArray(contractNames) ? contractNames : [contractNames];
          return indexed
            .filter(e => (names.includes(e.contractName ?? '') || names.includes(e.contractLabel ?? '')) && e.name === name)
            .map(e => ({
              args: e.args ?? {},
              blockNumber: toBigInt(e.blockNumber),
              transactionHash: e.transactionHash,
            }));
        };

        submitted = logsFor('StorageReceiptDispute', 'DisputeSubmitted');
        valid = logsFor('StorageReceiptDispute', 'DisputeValid');
        invalid = logsFor('StorageReceiptDispute', 'DisputeInvalid');
        enforcement = logsFor('StorageReceiptDispute', 'W6EnforcementApplied');
        suspended = logsFor('StorageReceiptDispute', 'VKSuspendedByDispute');
        removed = logsFor('StorageReceiptDispute', 'VKPermanentlyRemovedByDispute');
        sectorRisk = logsFor('StorageReceiptDispute', 'SectorRiskNotice');
        deletionSubmitted = logsFor('StorageReceiptDispute', 'DeletionDisputeSubmitted');
        deletionValid = logsFor('StorageReceiptDispute', 'DeletionDisputeValid');
        deletionInvalid = logsFor('StorageReceiptDispute', 'DeletionDisputeInvalid');
        deletionEnforcement = logsFor('StorageReceiptDispute', 'DeletionEnforcementApplied');
        zkDkgOpened = logsFor(['ZkDkgDisputeManager', 'ZK-DKG Dispute Manager', 'ZK-DKG Dispute Mgr'], 'ZkDkgEncryptedShareDisputeOpened');
        zkDkgJustified = logsFor(['ZkDkgDisputeManager', 'ZK-DKG Dispute Manager', 'ZK-DKG Dispute Mgr'], 'ZkDkgEncryptedShareDisputeJustified');
        zkDkgExpired = logsFor(['ZkDkgDisputeManager', 'ZK-DKG Dispute Manager', 'ZK-DKG Dispute Mgr'], 'ZkDkgEncryptedShareDisputeExpired');
        zkDkgExcluded = logsFor(['ZkDkgDisputeManager', 'ZK-DKG Dispute Manager', 'ZK-DKG Dispute Mgr'], 'ZkDkgDealerExcluded');
        vkPenalty = logsFor('ReputationManager', 'VKDisputePenaltyRecorded');
        vkSerious = logsFor('ReputationManager', 'VKSeriousPenaltyTriggered');
        guardianSerious = logsFor('ReputationManager', 'SeriousPenaltyTriggered');
        dkgFailures = logsFor('ReputationManager', 'DkgFailureRecorded');
        preFailures = logsFor('ReputationManager', 'PreFailureRecorded');
        dkgComplaints = logsFor('ReputationManager', 'DkgComplaintSubmitted');
        preComplaints = logsFor('ReputationManager', 'PreComplaintSubmitted');
        [zkDkgOpened, zkDkgJustified, zkDkgExpired, zkDkgExcluded] = await Promise.all([
          zkDkgOpened.length ? zkDkgOpened : Z('ZkDkgEncryptedShareDisputeOpened'),
          zkDkgJustified.length ? zkDkgJustified : Z('ZkDkgEncryptedShareDisputeJustified'),
          zkDkgExpired.length ? zkDkgExpired : Z('ZkDkgEncryptedShareDisputeExpired'),
          zkDkgExcluded.length ? zkDkgExcluded : Z('ZkDkgDealerExcluded'),
        ]);
        [vkPenalty, vkSerious, guardianSerious, dkgFailures, preFailures, dkgComplaints, preComplaints] = await Promise.all([
          vkPenalty.length ? vkPenalty : R('VKDisputePenaltyRecorded'),
          vkSerious.length ? vkSerious : R('VKSeriousPenaltyTriggered'),
          guardianSerious.length ? guardianSerious : R('SeriousPenaltyTriggered'),
          dkgFailures.length ? dkgFailures : R('DkgFailureRecorded'),
          preFailures.length ? preFailures : R('PreFailureRecorded'),
          dkgComplaints.length ? dkgComplaints : R('DkgComplaintSubmitted'),
          preComplaints.length ? preComplaints : R('PreComplaintSubmitted'),
        ]);
      } else {
        [
          submitted,
          valid,
          invalid,
          enforcement,
          suspended,
          removed,
          sectorRisk,
          deletionSubmitted,
          deletionValid,
          deletionInvalid,
          deletionEnforcement,
          zkDkgOpened,
          zkDkgJustified,
          zkDkgExpired,
          zkDkgExcluded,
          vkPenalty,
          vkSerious,
          guardianSerious,
          dkgFailures,
          preFailures,
          dkgComplaints,
          preComplaints,
        ] = await Promise.all([
          D('DisputeSubmitted'),
          D('DisputeValid'),
          D('DisputeInvalid'),
          D('W6EnforcementApplied'),
          D('VKSuspendedByDispute'),
          D('VKPermanentlyRemovedByDispute'),
          D('SectorRiskNotice'),
          D('DeletionDisputeSubmitted'),
          D('DeletionDisputeValid'),
          D('DeletionDisputeInvalid'),
          D('DeletionEnforcementApplied'),
          Z('ZkDkgEncryptedShareDisputeOpened'),
          Z('ZkDkgEncryptedShareDisputeJustified'),
          Z('ZkDkgEncryptedShareDisputeExpired'),
          Z('ZkDkgDealerExcluded'),
          R('VKDisputePenaltyRecorded'),
          R('VKSeriousPenaltyTriggered'),
          R('SeriousPenaltyTriggered'),
          R('DkgFailureRecorded'),
          R('PreFailureRecorded'),
          R('DkgComplaintSubmitted'),
          R('PreComplaintSubmitted'),
        ]);
      }

      const events: DisputeEvent[] = [];

      for (const l of submitted) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'storage', type: 'Storage Dispute Submitted', disputeId: hex(a.disputeId), vk: hex(a.vk), partitionRoot: hex(a.partitionRoot), detail: `DL${toNumber(a.deadlineIndex)} / P${toNumber(a.partitionIndex)}`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of valid) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'storage', type: 'Storage Dispute Valid', disputeId: hex(a.disputeId), vk: hex(a.vk), reason: String(a.reason ?? ''), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of invalid) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'storage', type: 'Storage Dispute Invalid', disputeId: hex(a.disputeId), vk: hex(a.vk), reason: String(a.reason ?? ''), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of enforcement) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'Storage Enforcement Applied', disputeId: hex(a.disputeId), vk: hex(a.vk), stakeSlashed: toBigInt(a.stakeSlashed), reputationPenalty: toNumber(a.reputationPenalty), violationLevel: toNumber(a.violationLevel), totalValidDisputes: toNumber(a.totalValidDisputes), suspendedUntil: toBigInt(a.suspendedUntil), permanentlyRemoved: Boolean(a.permanentlyRemoved), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of suspended) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'VK Suspended By Dispute', vk: hex(a.vk), suspendedUntil: toBigInt(a.suspendedUntil), totalValidDisputes: toNumber(a.totalValidDisputes), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of removed) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'VK Permanently Removed', vk: hex(a.vk), permanentlyRemoved: true, totalValidDisputes: toNumber(a.totalValidDisputes), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of sectorRisk) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'storage', type: 'Sector Risk Notice', vk: hex(a.vk), sectorRoot: hex(a.sectorRoot), reason: String(a.reason ?? ''), detail: `${toNumber(a.commitmentCount).toLocaleString()} affected commitment(s)`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of deletionSubmitted) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'deletion', type: 'Deletion Dispute Submitted', disputeId: hex(a.delDisputeId), vk: hex(a.vk), commitmentHash: hex(a.commitmentHash), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of deletionValid) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'deletion', type: 'Deletion Dispute Valid', disputeId: hex(a.delDisputeId), vk: hex(a.vk), commitmentHash: hex(a.commitmentHash), reason: String(a.reason ?? ''), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of deletionInvalid) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'deletion', type: 'Deletion Dispute Invalid', disputeId: hex(a.delDisputeId), vk: hex(a.vk), reason: String(a.reason ?? ''), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of deletionEnforcement) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'Deletion Enforcement Applied', disputeId: hex(a.delDisputeId), vk: hex(a.vk), stakeSlashed: toBigInt(a.stakeSlashed), reputationPenalty: toNumber(a.repPenalty), totalValidDisputes: toNumber(a.totalDeletionDisputes), blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of zkDkgOpened) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'zkdkg', type: 'ZK-DKG Dispute Opened', disputeId: hex(a.disputeId), fileId: hex(a.fileId), dealer: hex(a.dealer), receiver: hex(a.receiver), guardian: hex(a.dealer), deadline: toBigInt(a.deadline), detail: `epoch ${toNumber(a.keyEpoch)} · dealer #${toNumber(a.dealerIndex)} → receiver #${toNumber(a.receiverIndex)}${a.isRefresh ? ' · refresh' : ''}`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of zkDkgJustified) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'zkdkg', type: 'ZK-DKG Dispute Justified', disputeId: hex(a.disputeId), dealer: hex(a.dealer), receiver: hex(a.receiver), guardian: hex(a.dealer), detail: 'dealer proved encrypted share was correct', blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of zkDkgExpired) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'zkdkg', type: 'ZK-DKG Dispute Expired', disputeId: hex(a.disputeId), dealer: hex(a.dealer), receiver: hex(a.receiver), guardian: hex(a.dealer), detail: 'dealer failed to justify encrypted share', blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of zkDkgExcluded) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'ZK-DKG Dealer Excluded', fileId: hex(a.fileId), dealer: hex(a.dealer), guardian: hex(a.dealer), detail: `epoch ${toNumber(a.keyEpoch)} · share v${toNumber(a.shareVersion)} · dealer #${toNumber(a.dealerIndex)}${a.isRefresh ? ' · refresh' : ''}`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of vkPenalty) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'VK Dispute Penalty', vk: hex(a.vk), reputationPenalty: toNumber(a.repPenalty), violationLevel: toNumber(a.violationLevel), totalValidDisputes: toNumber(a.disputeComplaints), detail: `rep ${toNumber(a.reputationScore)} · complaints ${toNumber(a.disputeComplaints)}`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of vkSerious) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'VK Serious Penalty', vk: hex(a.vk), reputationPenalty: toNumber(a.penaltyPoints), detail: `${toNumber(a.penaltyPoints)} penalty point(s)`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of guardianSerious) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'Guardian Serious Penalty', guardian: hex(a.guardian), reputationPenalty: toNumber(a.penaltyPoints), detail: `${toNumber(a.dkgComplaints)} DKG · ${toNumber(a.preComplaints)} PRE complaint(s)`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of dkgFailures) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'DKG Failure Recorded', guardian: hex(a.guardian), reputationPenalty: toNumber(a.penaltyPoints), reason: `reason code ${toNumber(a.reasonCode)}`, detail: `${toNumber(a.failedDKG)} failed DKG · rep ${toNumber(a.reputationScore)}`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of preFailures) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'PRE Failure Recorded', guardian: hex(a.guardian), reputationPenalty: toNumber(a.penaltyPoints), reason: `reason code ${toNumber(a.reasonCode)}`, detail: `${toNumber(a.failedPRE)} failed PRE · rep ${toNumber(a.reputationScore)}`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of dkgComplaints) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'DKG Complaint Submitted', guardian: hex(a.guardian), reporter: hex(a.reporter), reputationPenalty: toNumber(a.penaltyPoints), reason: `reason code ${toNumber(a.reasonCode)}`, detail: `${toNumber(a.dkgComplaints)} DKG complaint(s)`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }
      for (const l of preComplaints) {
        const { args: a, blockNumber, transactionHash } = l as any;
        events.push({ category: 'penalty', type: 'PRE Complaint Submitted', guardian: hex(a.guardian), reporter: hex(a.reporter), reputationPenalty: toNumber(a.penaltyPoints), reason: `reason code ${toNumber(a.reasonCode)}`, detail: `${toNumber(a.preComplaints)} PRE complaint(s)`, blockNumber: toBigInt(blockNumber), txHash: txHash(transactionHash) });
      }

      return events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
  });
}


/**
 * The dispute table, a page at a time.
 *
 * Disputes are raised in three contracts and the screen shows them as one list,
 * which the twenty-two separate downloads above assembled by concatenating and
 * re-sorting in the browser. The store already orders several contracts and
 * several event names into one stream by block and log index, so a cursor over
 * that stream is the same list without holding it all.
 *
 * The ZK-DKG contract is named three ways across indexes of different vintages.
 * All three are passed; the ones this store does not know simply narrow nothing.
 */
const DISPUTE_CONTRACTS = [
  'StorageReceiptDispute',
  'ZkDkgDisputeManager', 'ZK-DKG Dispute Manager', 'ZK-DKG Dispute Mgr',
  'ReputationManager',
] as const;

const DISPUTE_EVENTS = [
  'DisputeSubmitted', 'DisputeValid', 'DisputeInvalid', 'W6EnforcementApplied',
  'VKSuspendedByDispute', 'VKPermanentlyRemovedByDispute', 'SectorRiskNotice',
  'DeletionDisputeSubmitted', 'DeletionDisputeValid', 'DeletionDisputeInvalid',
  'DeletionEnforcementApplied',
  'ZkDkgEncryptedShareDisputeOpened', 'ZkDkgEncryptedShareDisputeJustified',
  'ZkDkgEncryptedShareDisputeExpired', 'ZkDkgDealerExcluded',
  'VKDisputePenaltyRecorded', 'VKSeriousPenaltyTriggered', 'SeriousPenaltyTriggered',
  'DkgFailureRecorded', 'PreFailureRecorded',
  'DkgComplaintSubmitted', 'PreComplaintSubmitted',
] as const;

export function usePagedDisputes(pageSize = 200) {
  return usePagedEventRows<DisputeEvent>(DISPUTE_CONTRACTS, DISPUTE_EVENTS, (row) => {
    const a = (row.args ?? {}) as Record<string, any>;
    const at = { blockNumber: toBigInt(row.blockNumber), txHash: txHash(row.transactionHash) };
    const vk = hex(a.vk);
    const dealer = hex(a.dealer);

    switch (row.name) {
      case 'DisputeSubmitted':
        return { ...at, category: 'storage', type: 'Storage Dispute Submitted', disputeId: hex(a.disputeId), vk, partitionRoot: hex(a.partitionRoot), detail: `DL${toNumber(a.deadlineIndex)} / P${toNumber(a.partitionIndex)}` };
      case 'DisputeValid':
        return { ...at, category: 'storage', type: 'Storage Dispute Valid', disputeId: hex(a.disputeId), vk, reason: String(a.reason ?? '') };
      case 'DisputeInvalid':
        return { ...at, category: 'storage', type: 'Storage Dispute Invalid', disputeId: hex(a.disputeId), vk, reason: String(a.reason ?? '') };
      case 'W6EnforcementApplied':
        return { ...at, category: 'penalty', type: 'Storage Enforcement Applied', disputeId: hex(a.disputeId), vk, stakeSlashed: toBigInt(a.stakeSlashed), reputationPenalty: toNumber(a.reputationPenalty), violationLevel: toNumber(a.violationLevel), totalValidDisputes: toNumber(a.totalValidDisputes), suspendedUntil: toBigInt(a.suspendedUntil), permanentlyRemoved: Boolean(a.permanentlyRemoved) };
      case 'VKSuspendedByDispute':
        return { ...at, category: 'penalty', type: 'VK Suspended By Dispute', vk, suspendedUntil: toBigInt(a.suspendedUntil), totalValidDisputes: toNumber(a.totalValidDisputes) };
      case 'VKPermanentlyRemovedByDispute':
        return { ...at, category: 'penalty', type: 'VK Permanently Removed', vk, permanentlyRemoved: true, totalValidDisputes: toNumber(a.totalValidDisputes) };
      case 'SectorRiskNotice':
        return { ...at, category: 'storage', type: 'Sector Risk Notice', vk, sectorRoot: hex(a.sectorRoot), reason: String(a.reason ?? ''), detail: `${toNumber(a.commitmentCount).toLocaleString()} affected commitment(s)` };
      case 'DeletionDisputeSubmitted':
        return { ...at, category: 'deletion', type: 'Deletion Dispute Submitted', disputeId: hex(a.delDisputeId), vk, commitmentHash: hex(a.commitmentHash) };
      case 'DeletionDisputeValid':
        return { ...at, category: 'deletion', type: 'Deletion Dispute Valid', disputeId: hex(a.delDisputeId), vk, commitmentHash: hex(a.commitmentHash), reason: String(a.reason ?? '') };
      case 'DeletionDisputeInvalid':
        return { ...at, category: 'deletion', type: 'Deletion Dispute Invalid', disputeId: hex(a.delDisputeId), vk, reason: String(a.reason ?? '') };
      case 'DeletionEnforcementApplied':
        return { ...at, category: 'penalty', type: 'Deletion Enforcement Applied', disputeId: hex(a.delDisputeId), vk, stakeSlashed: toBigInt(a.stakeSlashed), reputationPenalty: toNumber(a.repPenalty), totalValidDisputes: toNumber(a.totalDeletionDisputes) };
      case 'ZkDkgEncryptedShareDisputeOpened':
        return { ...at, category: 'zkdkg', type: 'ZK-DKG Dispute Opened', disputeId: hex(a.disputeId), fileId: hex(a.fileId), dealer, receiver: hex(a.receiver), guardian: dealer, deadline: toBigInt(a.deadline), detail: `epoch ${toNumber(a.keyEpoch)} · dealer #${toNumber(a.dealerIndex)} → receiver #${toNumber(a.receiverIndex)}${a.isRefresh ? ' · refresh' : ''}` };
      case 'ZkDkgEncryptedShareDisputeJustified':
        return { ...at, category: 'zkdkg', type: 'ZK-DKG Dispute Justified', disputeId: hex(a.disputeId), dealer, receiver: hex(a.receiver), guardian: dealer, detail: 'dealer proved encrypted share was correct' };
      case 'ZkDkgEncryptedShareDisputeExpired':
        return { ...at, category: 'zkdkg', type: 'ZK-DKG Dispute Expired', disputeId: hex(a.disputeId), dealer, receiver: hex(a.receiver), guardian: dealer, detail: 'dealer failed to justify encrypted share' };
      case 'ZkDkgDealerExcluded':
        return { ...at, category: 'penalty', type: 'ZK-DKG Dealer Excluded', fileId: hex(a.fileId), dealer, guardian: dealer, detail: `epoch ${toNumber(a.keyEpoch)} · share v${toNumber(a.shareVersion)} · dealer #${toNumber(a.dealerIndex)}${a.isRefresh ? ' · refresh' : ''}` };
      case 'VKDisputePenaltyRecorded':
        return { ...at, category: 'penalty', type: 'VK Dispute Penalty', vk, reputationPenalty: toNumber(a.repPenalty), violationLevel: toNumber(a.violationLevel), totalValidDisputes: toNumber(a.disputeComplaints), detail: `rep ${toNumber(a.reputationScore)} · complaints ${toNumber(a.disputeComplaints)}` };
      case 'VKSeriousPenaltyTriggered':
        return { ...at, category: 'penalty', type: 'VK Serious Penalty', vk, reputationPenalty: toNumber(a.penaltyPoints), detail: `${toNumber(a.penaltyPoints)} penalty point(s)` };
      case 'SeriousPenaltyTriggered':
        return { ...at, category: 'penalty', type: 'Guardian Serious Penalty', guardian: hex(a.guardian), reputationPenalty: toNumber(a.penaltyPoints), detail: `${toNumber(a.dkgComplaints)} DKG · ${toNumber(a.preComplaints)} PRE complaint(s)` };
      case 'DkgFailureRecorded':
        return { ...at, category: 'penalty', type: 'DKG Failure Recorded', guardian: hex(a.guardian), reputationPenalty: toNumber(a.penaltyPoints), reason: `reason code ${toNumber(a.reasonCode)}`, detail: `${toNumber(a.failedDKG)} failed DKG · rep ${toNumber(a.reputationScore)}` };
      case 'PreFailureRecorded':
        return { ...at, category: 'penalty', type: 'PRE Failure Recorded', guardian: hex(a.guardian), reputationPenalty: toNumber(a.penaltyPoints), reason: `reason code ${toNumber(a.reasonCode)}`, detail: `${toNumber(a.failedPRE)} failed PRE · rep ${toNumber(a.reputationScore)}` };
      case 'DkgComplaintSubmitted':
        return { ...at, category: 'penalty', type: 'DKG Complaint Submitted', guardian: hex(a.guardian), reporter: hex(a.reporter), reputationPenalty: toNumber(a.penaltyPoints), reason: `reason code ${toNumber(a.reasonCode)}`, detail: `${toNumber(a.dkgComplaints)} DKG complaint(s)` };
      case 'PreComplaintSubmitted':
        return { ...at, category: 'penalty', type: 'PRE Complaint Submitted', guardian: hex(a.guardian), reporter: hex(a.reporter), reputationPenalty: toNumber(a.penaltyPoints), reason: `reason code ${toNumber(a.reasonCode)}`, detail: `${toNumber(a.preComplaints)} PRE complaint(s)` };
      // An event this screen does not render is not a row of empty cells.
      default: return null;
    }
  }, pageSize);
}

export function disputeStats(disputes: DisputeEvent[]) {
  const storage = disputes.filter(d => d.category === 'storage').length;
  const deletion = disputes.filter(d => d.category === 'deletion').length;
  const zkdkg = disputes.filter(d => d.category === 'zkdkg' || d.type === 'ZK-DKG Dealer Excluded').length;
  const submitted = disputes.filter(d => d.type.includes('Submitted') || d.type === 'ZK-DKG Dispute Opened').length;
  const valid = disputes.filter(d => (d.type.includes('Valid') && !d.type.includes('Invalid')) || d.type === 'ZK-DKG Dispute Justified').length;
  const invalid = disputes.filter(d => d.type.includes('Invalid')).length;
  const expired = disputes.filter(d => d.type.includes('Expired')).length;
  const enforcement = disputes.filter(d => d.category === 'penalty' || d.type.includes('Enforcement') || d.type.includes('Suspended') || d.type.includes('Removed')).length;
  const formal = submitted;
  return { total: disputes.length, formal, storage, deletion, zkdkg, submitted, valid, invalid, expired, enforcement };
}

/**
 * Dispute totals counted in the store.
 *
 * Every figure here is "how many events of these names", which is exactly what a
 * grouped count answers, so none of them needs the rows. The categories span
 * three contracts, so three counted requests replace a download of all of them.
 *
 * Falls back to counting the rows when there is no store, which is a smaller
 * number from a screen that cannot see further rather than a wrong one.
 */
export function useDisputeStats() {
  const { data: storageCounts, isLoading } = useEventCountsByName('StorageReceiptDispute');
  const { data: dkgCounts } = useEventCountsByName('ZkDkgDisputeManager');
  const { data: repCounts } = useEventCountsByName('ReputationManager');

  // No store to count in. Say so rather than pulling every dispute event to
  // produce a number: the caller already holds a page of rows and can total
  // those itself, which is a smaller number honestly labelled.
  if (!storageCounts && !dkgCounts && !repCounts) {
    return { ...disputeStats([]), isLoading, fromStore: false };
  }

  const n = (counts: Record<string, number> | null | undefined, ...names: string[]) =>
    names.reduce((sum, name) => sum + (counts?.[name] ?? 0), 0);

  const storage = n(storageCounts,
    'DisputeSubmitted', 'DisputeValid', 'DisputeInvalid', 'W6EnforcementApplied',
    'VKSuspendedByDispute', 'VKPermanentlyRemovedByDispute', 'SectorRiskNotice');
  const deletion = n(storageCounts,
    'DeletionDisputeSubmitted', 'DeletionDisputeValid', 'DeletionDisputeInvalid',
    'DeletionEnforcementApplied');
  const zkdkg = n(dkgCounts,
    'ZkDkgEncryptedShareDisputeOpened', 'ZkDkgEncryptedShareDisputeJustified',
    'ZkDkgEncryptedShareDisputeExpired', 'ZkDkgDealerExcluded');

  const submitted = n(storageCounts, 'DisputeSubmitted', 'DeletionDisputeSubmitted')
    + n(dkgCounts, 'ZkDkgEncryptedShareDisputeOpened');
  const valid = n(storageCounts, 'DisputeValid', 'DeletionDisputeValid')
    + n(dkgCounts, 'ZkDkgEncryptedShareDisputeJustified');
  const invalid = n(storageCounts, 'DisputeInvalid', 'DeletionDisputeInvalid');
  const expired = n(dkgCounts, 'ZkDkgEncryptedShareDisputeExpired');
  const enforcement = n(storageCounts,
    'W6EnforcementApplied', 'DeletionEnforcementApplied',
    'VKSuspendedByDispute', 'VKPermanentlyRemovedByDispute')
    + n(dkgCounts, 'ZkDkgDealerExcluded')
    + n(repCounts,
      'VKDisputePenaltyRecorded', 'VKSeriousPenaltyTriggered', 'SeriousPenaltyTriggered',
      'DkgFailureRecorded', 'PreFailureRecorded', 'DkgComplaintSubmitted', 'PreComplaintSubmitted');

  return {
    total: storage + deletion + zkdkg + n(repCounts,
      'VKDisputePenaltyRecorded', 'VKSeriousPenaltyTriggered', 'SeriousPenaltyTriggered',
      'DkgFailureRecorded', 'PreFailureRecorded', 'DkgComplaintSubmitted', 'PreComplaintSubmitted'),
    formal: submitted,
    storage, deletion, zkdkg, submitted, valid, invalid, expired, enforcement,
    isLoading,
    fromStore: true,
  };
}
