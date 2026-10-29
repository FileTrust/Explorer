'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { RewardManagerABI } from '@/lib/abis/RewardManager';
import { StakingManagerABI } from '@/lib/abis/StakingManager';
import { VKEscrowABI } from '@/lib/abis/VKEscrow';
import { GuardianWorkRewardABI } from '@/lib/abis/GuardianWorkReward';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { useEconomicsTotals } from '@/lib/hooks/useEconomicsTotals';
import { useRewardTotalsByType, guardianWorkLabel } from '@/lib/hooks/useRewards';
import { getIndexedLogs } from '@/lib/indexedLogs';
import { usePagedEventRows, usePagedIndex, useEventCountsByName } from '@/lib/hooks/useEventCounts';

export type EconomicKind = 'reward' | 'claim' | 'pool' | 'policy_escrow' | 'access_escrow' | 'vk_escrow' | 'stake' | 'price';

export interface EconomicEvent {
  kind: EconomicKind;
  type: string;
  actor?: `0x${string}`;
  amount: bigint;
  fileId?: `0x${string}`;
  requestId?: bigint;
  commitment?: `0x${string}`;
  balance?: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  detail: string;
}

export interface ParticipantEconomics {
  address: `0x${string}`;
  rewards: bigint;
  claimed: bigint;
  poolDeposits: bigint;
  stakeDeposits: bigint;
  slashed: bigint;
  escrowPaid: bigint;
  escrowReceived: bigint;
  eventCount: number;
}

export interface FileEconomics {
  fileId: `0x${string}`;
  policyEscrowDeposited: bigint;
  policyEscrowRefunded: bigint;
  accessEscrowDeposited: bigint;
  rewardsCredited: bigint;
  accessRequestCount: number;
  eventCount: number;
}

export interface EconomicsStats {
  totalRewards: bigint;
  totalClaimed: bigint;
  totalPoolDeposits: bigint;
  totalPolicyEscrow: bigint;
  totalAccessEscrow: bigint;
  totalVKEscrowDeposited: bigint;
  totalVKEscrowClaimed: bigint;
  totalStaked: bigint;
  totalSlashed: bigint;
}

function rewardEvent(name: string) {
  return RewardManagerABI.find(e => e.name === name)! as any;
}

function stakeEvent(name: string) {
  return StakingManagerABI.find(e => e.name === name)! as any;
}

function vkEscrowEvent(name: string) {
  return VKEscrowABI.find(e => e.name === name)! as any;
}

function workRewardEvent(name: string) {
  return GuardianWorkRewardABI.find(e => e.name === name)! as any;
}

function add(map: Map<string, bigint>, key: string, amount: bigint) {
  map.set(key, (map.get(key) ?? 0n) + amount);
}

function participant(map: Map<string, ParticipantEconomics>, address: `0x${string}`): ParticipantEconomics {
  const key = address.toLowerCase();
  if (!map.has(key)) {
    map.set(key, {
      address,
      rewards: 0n,
      claimed: 0n,
      poolDeposits: 0n,
      stakeDeposits: 0n,
      slashed: 0n,
      escrowPaid: 0n,
      escrowReceived: 0n,
      eventCount: 0,
    });
  }
  return map.get(key)!;
}

function fileEco(map: Map<string, FileEconomics>, fileId: `0x${string}`): FileEconomics {
  const key = fileId.toLowerCase();
  if (!map.has(key)) {
    map.set(key, {
      fileId,
      policyEscrowDeposited: 0n,
      policyEscrowRefunded: 0n,
      accessEscrowDeposited: 0n,
      rewardsCredited: 0n,
      accessRequestCount: 0,
      eventCount: 0,
    });
  }
  return map.get(key)!;
}


/**
 * The escrow / economics event table, a page at a time.
 *
 * The hook above builds three things from the same thirty-two downloads: this
 * list, a per-participant total, and a per-file total. Only the list is a table
 * of events, and only the list can be paged -- the two aggregations genuinely
 * need every row, and belong in the store rather than in the browser.
 */
const ECONOMIC_CONTRACTS = ['RewardManager', 'GuardianWorkReward', 'StakingManager', 'VKEscrow'] as const;

const ECONOMIC_EVENTS = [
  'PolicyEscrowDeposited', 'PolicyEscrowRefunded',
  'AccessEscrowDeposited', 'AccessEscrowCompleted', 'AccessEscrowRefunded',
  'GuardianRewardCredited', 'GuardianMeasuredRewardCredited',
  'GuardianAccessRewardCredited', 'GuardianMeasuredAccessRewardCredited',
  'GuardianJoinRewarded', 'GuardianShareProofRewarded',
  'VKJoinRewarded', 'VKProofRewardCredited', 'VKProofRewarded', 'VKFileRewarded',
  'VKCapacityRewarded', 'GuardianRewarded',
  'RewardsClaimed',
  'JoinRewardPoolDeposited', 'ProofRewardPoolDeposited', 'VKJoinRewardPoolDeposited',
  'VKProofRewardPoolDeposited', 'VKFileRewardPoolDeposited', 'VKCapacityRewardPoolDeposited',
  'PoolDeposited', 'PricesUpdated',
  'StakeDeposited', 'StakeWithdrawn', 'StakeSlashed', 'StakeLocked', 'StakeUnlocked',
  'EscrowDeposited', 'EscrowClaimed', 'EscrowReclaimed',
  'EscrowRefundedByDispute', 'EscrowClaimedOnDeletion',
] as const;

/** Reward events differ in what they call the recipient and the amount. */
const REWARD_LABELS: Record<string, readonly [string, 'guardian' | 'vk', 'amount' | 'amountWei']> = {
  GuardianRewardCredited: ['Guardian Reward', 'guardian', 'amountWei'],
  GuardianMeasuredRewardCredited: ['Measured Guardian Reward', 'guardian', 'amountWei'],
  GuardianAccessRewardCredited: ['Guardian Access Reward', 'guardian', 'amountWei'],
  GuardianMeasuredAccessRewardCredited: ['Measured Access Reward', 'guardian', 'amountWei'],
  GuardianJoinRewarded: ['Guardian Join Reward', 'guardian', 'amount'],
  GuardianShareProofRewarded: ['Share Proof Reward', 'guardian', 'amount'],
  VKJoinRewarded: ['VK Join Reward', 'vk', 'amount'],
  VKProofRewardCredited: ['VK Proof Reward', 'vk', 'amountWei'],
  VKProofRewarded: ['VK Proof Pool Reward', 'vk', 'amount'],
  VKFileRewarded: ['VK File Reward', 'vk', 'amount'],
  VKCapacityRewarded: ['VK Space Reward', 'vk', 'amount'],
};

const POOL_LABELS: Record<string, string> = {
  JoinRewardPoolDeposited: 'Guardian Join Pool',
  ProofRewardPoolDeposited: 'Guardian Proof Pool',
  VKJoinRewardPoolDeposited: 'VK Join Pool',
  VKProofRewardPoolDeposited: 'VK Proof Pool',
  VKFileRewardPoolDeposited: 'VK File Pool',
  VKCapacityRewardPoolDeposited: 'VK Space Pool',
  // GuardianWorkReward's pool.
  PoolDeposited: 'Guardian DKG/PRE Pool',
};

const STAKE_LABELS: Record<string, string> = {
  StakeDeposited: 'Stake Deposited',
  StakeWithdrawn: 'Stake Withdrawn',
  StakeSlashed: 'Stake Slashed',
  StakeLocked: 'Stake Locked',
  StakeUnlocked: 'Stake Unlocked',
};

/** The escrow subset, so the escrow screen asks the store for escrow rows
 *  instead of every economic event and discarding four fifths in the browser. */
export const ESCROW_EVENTS = [
  'PolicyEscrowDeposited', 'PolicyEscrowRefunded',
  'AccessEscrowDeposited', 'AccessEscrowCompleted', 'AccessEscrowRefunded',
  'EscrowDeposited', 'EscrowClaimed', 'EscrowReclaimed',
  'EscrowRefundedByDispute', 'EscrowClaimedOnDeletion',
] as const;

export function usePagedEconomicEvents(pageSize = 200, events: readonly string[] = ECONOMIC_EVENTS) {
  return usePagedEventRows<EconomicEvent>(ECONOMIC_CONTRACTS, events, toEconomicEvent, pageSize);
}

/// The economic events, by name, so a screen about one file can pick them out of
/// that file's own events.
export const ECONOMIC_EVENT_NAMES: ReadonlySet<string> = new Set(ECONOMIC_EVENTS);

/// One stored economic event as a row: labelled, with its actor and amount.
export function toEconomicEvent(row: {
  name?: string; args?: Record<string, unknown>; blockNumber: string | bigint; transactionHash: string;
}): EconomicEvent | null {
  const a = (row.args ?? {}) as Record<string, any>;
  const at = {
    blockNumber: BigInt(row.blockNumber ?? 0),
    txHash: (row.transactionHash ?? '0x') as `0x${string}`,
  };
  const name = row.name ?? '';

  // GuardianWorkReward: one event, labelled by what the Guardian was paid for.
  if (name === 'GuardianRewarded') {
    return {
      ...at, kind: 'reward', type: guardianWorkLabel(Number(a.kind)),
      actor: a.guardian as `0x${string}`, amount: BigInt(a.amount ?? 0n),
      detail: 'Early-network pool reward',
    };
  }

  const reward = REWARD_LABELS[name];
  if (reward) {
    const [label, actorKey, amountKey] = reward;
    return {
      ...at, kind: 'reward', type: label,
      actor: a[actorKey] as `0x${string}`,
      amount: BigInt(a[amountKey] ?? 0n),
      fileId: a.fileId, requestId: a.requestId,
      detail: a.fileId ? 'File-linked reward' : a.requestId ? `Request #${a.requestId}` : 'Participant reward',
    };
  }
  if (POOL_LABELS[name]) {
    return { ...at, kind: 'pool', type: POOL_LABELS[name], actor: a.sender, amount: a.amount ?? 0n, balance: a.balance, detail: 'Reward pool funded' };
  }
  if (STAKE_LABELS[name]) {
    const lock = name === 'StakeLocked' || name === 'StakeUnlocked';
    return {
      ...at, kind: 'stake', type: STAKE_LABELS[name], actor: a.guardian, amount: a.amount ?? 0n,
      balance: lock ? a.lockedStake : (a.totalStake ?? a.remainingStake),
      detail: lock ? 'Stake lock state changed'
        : name === 'StakeDeposited' ? 'Stake deposit'
        : name === 'StakeWithdrawn' ? 'Stake withdrawal' : 'Penalty slash',
    };
  }

  switch (name) {
    case 'PolicyEscrowDeposited':
      return { ...at, kind: 'policy_escrow', type: 'Policy Escrow Deposited', actor: a.payer, fileId: a.fileId, amount: a.amountWei ?? 0n, balance: a.balanceWei, detail: 'Policy service escrow funded' };
    case 'PolicyEscrowRefunded':
      return { ...at, kind: 'policy_escrow', type: 'Policy Escrow Refunded', actor: a.payer ?? a.dataOwner, fileId: a.fileId, amount: a.amountWei ?? 0n, balance: a.balanceWei, detail: 'Policy escrow refunded' };
    case 'AccessEscrowDeposited':
      return { ...at, kind: 'access_escrow', type: 'Access Escrow Deposited', actor: a.requester, fileId: a.fileId, requestId: a.requestId, amount: a.amountWei ?? 0n, balance: a.balanceWei, detail: `Request #${a.requestId}` };
    case 'AccessEscrowCompleted':
      return { ...at, kind: 'access_escrow', type: 'Access Escrow Completed', actor: a.requester, fileId: a.fileId, requestId: a.requestId, amount: 0n, detail: `Request #${a.requestId}` };
    case 'AccessEscrowRefunded':
      return { ...at, kind: 'access_escrow', type: 'Access Escrow Refunded', actor: a.requester, fileId: a.fileId, requestId: a.requestId, amount: a.amountWei ?? 0n, detail: `Request #${a.requestId}` };
    case 'RewardsClaimed':
      return { ...at, kind: 'claim', type: 'Rewards Claimed', actor: a.guardian, amount: a.amountWei ?? 0n, detail: 'Claimed claimable rewards' };
    case 'PricesUpdated':
      return { ...at, kind: 'price', type: 'Prices Updated', amount: 0n, detail: 'Protocol reward price schedule changed' };
    case 'EscrowDeposited':
      return { ...at, kind: 'vk_escrow', type: 'VK Escrow Deposited', actor: a.depositor, commitment: a.paymentCommitment, amount: a.amount ?? 0n, detail: `Service end ${a.serviceEnd}` };
    case 'EscrowClaimed':
      return { ...at, kind: 'vk_escrow', type: 'VK Escrow Claimed', actor: a.recipient, commitment: a.paymentCommitment, amount: a.amount ?? 0n, balance: a.totalClaimed, detail: 'VK claimed completed storage escrow' };
    case 'EscrowReclaimed':
      return { ...at, kind: 'vk_escrow', type: 'VK Escrow Reclaimed', actor: a.depositor, commitment: a.paymentCommitment, amount: a.amount ?? 0n, detail: 'Depositor reclaimed unclaimed escrow' };
    case 'EscrowRefundedByDispute':
      return { ...at, kind: 'vk_escrow', type: 'VK Escrow Dispute Refund', actor: a.depositor, commitment: a.paymentCommitment, amount: a.amount ?? 0n, detail: 'Escrow refunded by dispute' };
    case 'EscrowClaimedOnDeletion':
      return { ...at, kind: 'vk_escrow', type: 'VK Escrow Deletion Claim', actor: a.recipient, commitment: a.paymentCommitment, amount: a.vkAmount ?? 0n, detail: `VK ${a.vkAmount} wei · DO refund ${a.doRefund} wei` };
    default: return null;
  }
}

/// `enabled: false` lets a screen that has the store's totals skip the download.
export function useEconomics({ enabled = true }: { enabled?: boolean } = {}) {
  // Totals from the store, when it can answer. The reduction below still runs
  // and still produces figures from the rows in hand, so an Explorer without a
  // store is unchanged; these simply replace them when available, and they do
  // not depend on how many rows were fetched.
  const storeTotals = useEconomicsTotals();

  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
        // Keyed on the totals themselves, not merely on whether they exist: keying
    // on presence meant a later, more complete answer never triggered a refetch.
    queryKey: ['economics', storeTotals
      ? Object.values(storeTotals).map(String).join(',')
      : 'row-totals'],
    enabled,
    queryFn: async () => {
      const R = (name: string) => getIndexedLogs({ address: CONTRACTS.RewardManager, event: rewardEvent(name) }).catch(() => []);
      const S = (name: string) => getIndexedLogs({ address: CONTRACTS.StakingManager, event: stakeEvent(name) }).catch(() => []);
      const V = (name: string) => getIndexedLogs({ address: CONTRACTS.VKEscrow, event: vkEscrowEvent(name) }).catch(() => []);
      // A deployment from before GuardianWorkReward has none; asking for its logs then asks for nothing.
      const workDeployed = !/^0x0{40}$/i.test(CONTRACTS.GuardianWorkReward);
      const W = (name: string) => (workDeployed
        ? getIndexedLogs({ address: CONTRACTS.GuardianWorkReward, event: workRewardEvent(name) }).catch(() => [])
        : Promise.resolve([]));

      const [
        policyEscrow, policyRefund, accessEscrow, accessComplete, accessRefund,
        guardianReward, guardianMeasuredReward, guardianAccessReward, guardianMeasuredAccessReward,
        guardianJoin, shareProofReward, vkJoin, vkProofCredited, vkProofRewarded, vkFileRewarded,
        claimed, joinPool, proofPool, vkJoinPool, vkProofPool, vkFilePool, prices,
        stakeDeposits, stakeWithdraws, stakeSlashes, stakeLocks, stakeUnlocks,
        vkEscrowDeposits, vkEscrowClaims, vkEscrowReclaims, vkEscrowDisputeRefunds, vkEscrowDeletionClaims,
        vkCapacityRewarded, vkCapacityPool, guardianWorkRewarded, guardianWorkPool,
      ] = await Promise.all([
        R('PolicyEscrowDeposited'), R('PolicyEscrowRefunded'), R('AccessEscrowDeposited'), R('AccessEscrowCompleted'), R('AccessEscrowRefunded'),
        R('GuardianRewardCredited'), R('GuardianMeasuredRewardCredited'), R('GuardianAccessRewardCredited'), R('GuardianMeasuredAccessRewardCredited'),
        R('GuardianJoinRewarded'), R('GuardianShareProofRewarded'), R('VKJoinRewarded'), R('VKProofRewardCredited'), R('VKProofRewarded'), R('VKFileRewarded'),
        R('RewardsClaimed'), R('JoinRewardPoolDeposited'), R('ProofRewardPoolDeposited'), R('VKJoinRewardPoolDeposited'), R('VKProofRewardPoolDeposited'), R('VKFileRewardPoolDeposited'), R('PricesUpdated'),
        S('StakeDeposited'), S('StakeWithdrawn'), S('StakeSlashed'), S('StakeLocked'), S('StakeUnlocked'),
        V('EscrowDeposited'), V('EscrowClaimed'), V('EscrowReclaimed'), V('EscrowRefundedByDispute'), V('EscrowClaimedOnDeletion'),
        R('VKCapacityRewarded'), R('VKCapacityRewardPoolDeposited'), W('GuardianRewarded'), W('PoolDeposited'),
      ]);

      const events: EconomicEvent[] = [];
      const participants = new Map<string, ParticipantEconomics>();
      const files = new Map<string, FileEconomics>();

      function push(event: EconomicEvent) {
        events.push(event);
        if (event.actor) participant(participants, event.actor).eventCount += 1;
        if (event.fileId) fileEco(files, event.fileId).eventCount += 1;
      }

      for (const l of policyEscrow) {
        const a = (l as any).args;
        push({ kind: 'policy_escrow', type: 'Policy Escrow Deposited', actor: a.payer, fileId: a.fileId, amount: a.amountWei, balance: a.balanceWei, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Policy service escrow funded' });
        const f = fileEco(files, a.fileId); f.policyEscrowDeposited += a.amountWei;
        const p = participant(participants, a.payer); p.escrowPaid += a.amountWei;
      }
      for (const l of policyRefund) {
        const a = (l as any).args;
        push({ kind: 'policy_escrow', type: 'Policy Escrow Refunded', actor: a.payer ?? a.dataOwner, fileId: a.fileId, amount: a.amountWei, balance: a.balanceWei, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Policy escrow refunded' });
        fileEco(files, a.fileId).policyEscrowRefunded += a.amountWei;
      }
      for (const l of accessEscrow) {
        const a = (l as any).args;
        push({ kind: 'access_escrow', type: 'Access Escrow Deposited', actor: a.requester, fileId: a.fileId, requestId: a.requestId, amount: a.amountWei, balance: a.balanceWei, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: `Request #${a.requestId}` });
        const f = fileEco(files, a.fileId); f.accessEscrowDeposited += a.amountWei; f.accessRequestCount += 1;
        participant(participants, a.requester).escrowPaid += a.amountWei;
      }
      for (const l of accessComplete) {
        const a = (l as any).args;
        push({ kind: 'access_escrow', type: 'Access Escrow Completed', actor: a.requester, fileId: a.fileId, requestId: a.requestId, amount: 0n, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: `Request #${a.requestId}` });
      }
      for (const l of accessRefund) {
        const a = (l as any).args;
        push({ kind: 'access_escrow', type: 'Access Escrow Refunded', actor: a.requester, fileId: a.fileId, requestId: a.requestId, amount: a.amountWei ?? 0n, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: `Request #${a.requestId}` });
      }

      const rewardLogs = [
        ...guardianReward.map(l => [l, 'Guardian Reward', 'guardian', 'amountWei'] as const),
        ...guardianMeasuredReward.map(l => [l, 'Measured Guardian Reward', 'guardian', 'amountWei'] as const),
        ...guardianAccessReward.map(l => [l, 'Guardian Access Reward', 'guardian', 'amountWei'] as const),
        ...guardianMeasuredAccessReward.map(l => [l, 'Measured Access Reward', 'guardian', 'amountWei'] as const),
        ...guardianJoin.map(l => [l, 'Guardian Join Reward', 'guardian', 'amount'] as const),
        ...shareProofReward.map(l => [l, 'Share Proof Reward', 'guardian', 'amount'] as const),
        ...vkJoin.map(l => [l, 'VK Join Reward', 'vk', 'amount'] as const),
        ...vkProofCredited.map(l => [l, 'VK Proof Reward', 'vk', 'amountWei'] as const),
        ...vkProofRewarded.map(l => [l, 'VK Proof Pool Reward', 'vk', 'amount'] as const),
        ...vkFileRewarded.map(l => [l, 'VK File Reward', 'vk', 'amount'] as const),
        ...vkCapacityRewarded.map(l => [l, 'VK Space Reward', 'vk', 'amount'] as const),
        ...guardianWorkRewarded.map(l => [l, guardianWorkLabel(Number((l as any).args?.kind)), 'guardian', 'amount'] as const),
      ];
      for (const [l, label, actorKey, amountKey] of rewardLogs) {
        const a = (l as any).args;
        const actor = a[actorKey] as `0x${string}`;
        const amount = BigInt(a[amountKey] ?? 0n);
        push({ kind: 'reward', type: label, actor, fileId: a.fileId, requestId: a.requestId, amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: a.fileId ? 'File-linked reward' : a.requestId ? `Request #${a.requestId}` : 'Participant reward' });
        const p = participant(participants, actor); p.rewards += amount;
        if (a.fileId) fileEco(files, a.fileId).rewardsCredited += amount;
      }
      for (const l of claimed) {
        const a = (l as any).args;
        push({ kind: 'claim', type: 'Rewards Claimed', actor: a.guardian, amount: a.amountWei, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Claimed claimable rewards' });
        participant(participants, a.guardian).claimed += a.amountWei;
      }

      for (const [logs, label] of [[joinPool, 'Guardian Join Pool'], [proofPool, 'Guardian Proof Pool'], [vkJoinPool, 'VK Join Pool'], [vkProofPool, 'VK Proof Pool'], [vkFilePool, 'VK File Pool'], [vkCapacityPool, 'VK Space Pool'], [guardianWorkPool, 'Guardian DKG/PRE Pool']] as const) {
        for (const l of logs) {
          const a = (l as any).args;
          push({ kind: 'pool', type: label, actor: a.sender, amount: a.amount, balance: a.balance, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Reward pool funded' });
          participant(participants, a.sender).poolDeposits += a.amount;
        }
      }

      for (const l of prices) {
        push({ kind: 'price', type: 'Prices Updated', amount: 0n, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Protocol reward price schedule changed' });
      }

      for (const l of stakeDeposits) {
        const a = (l as any).args;
        push({ kind: 'stake', type: 'Stake Deposited', actor: a.guardian, amount: a.amount, balance: a.totalStake, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Stake deposit' });
        participant(participants, a.guardian).stakeDeposits += a.amount;
      }
      for (const l of stakeWithdraws) {
        const a = (l as any).args;
        push({ kind: 'stake', type: 'Stake Withdrawn', actor: a.guardian, amount: a.amount, balance: a.remainingStake, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Stake withdrawal' });
      }
      for (const l of stakeSlashes) {
        const a = (l as any).args;
        push({ kind: 'stake', type: 'Stake Slashed', actor: a.guardian, amount: a.amount, balance: a.remainingStake, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Penalty slash' });
        participant(participants, a.guardian).slashed += a.amount;
      }
      for (const l of [...stakeLocks, ...stakeUnlocks]) {
        const a = (l as any).args;
        push({ kind: 'stake', type: (l as any).eventName ?? 'Stake Lock Event', actor: a.guardian, amount: a.amount, balance: a.lockedStake, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Stake lock state changed' });
      }

      for (const l of vkEscrowDeposits) {
        const a = (l as any).args;
        push({ kind: 'vk_escrow', type: 'VK Escrow Deposited', actor: a.depositor, commitment: a.paymentCommitment, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: `Service end ${a.serviceEnd}` });
        participant(participants, a.depositor).escrowPaid += a.amount;
      }
      for (const l of vkEscrowClaims) {
        const a = (l as any).args;
        push({ kind: 'vk_escrow', type: 'VK Escrow Claimed', actor: a.recipient, commitment: a.paymentCommitment, amount: a.amount, balance: a.totalClaimed, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'VK claimed completed storage escrow' });
        participant(participants, a.recipient).escrowReceived += a.amount;
      }
      for (const l of vkEscrowReclaims) {
        const a = (l as any).args;
        push({ kind: 'vk_escrow', type: 'VK Escrow Reclaimed', actor: a.depositor, commitment: a.paymentCommitment, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Depositor reclaimed unclaimed escrow' });
      }
      for (const l of vkEscrowDisputeRefunds) {
        const a = (l as any).args;
        push({ kind: 'vk_escrow', type: 'VK Escrow Dispute Refund', actor: a.depositor, commitment: a.paymentCommitment, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: 'Escrow refunded by dispute' });
      }
      for (const l of vkEscrowDeletionClaims) {
        const a = (l as any).args;
        push({ kind: 'vk_escrow', type: 'VK Escrow Deletion Claim', actor: a.recipient, commitment: a.paymentCommitment, amount: a.vkAmount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x', detail: `VK ${a.vkAmount} wei · DO refund ${a.doRefund} wei` });
        participant(participants, a.recipient).escrowReceived += a.vkAmount;
      }

      const sortedEvents = events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      const stats: EconomicsStats = {
        totalRewards: sortedEvents.filter(e => e.kind === 'reward').reduce((sum, e) => sum + e.amount, 0n),
        totalClaimed: sortedEvents.filter(e => e.kind === 'claim').reduce((sum, e) => sum + e.amount, 0n),
        totalPoolDeposits: sortedEvents.filter(e => e.kind === 'pool').reduce((sum, e) => sum + e.amount, 0n),
        totalPolicyEscrow: sortedEvents.filter(e => e.kind === 'policy_escrow' && e.type.includes('Deposited')).reduce((sum, e) => sum + e.amount, 0n),
        totalAccessEscrow: sortedEvents.filter(e => e.kind === 'access_escrow' && e.type.includes('Deposited')).reduce((sum, e) => sum + e.amount, 0n),
        totalVKEscrowDeposited: vkEscrowDeposits.reduce((sum, l) => sum + BigInt((l as any).args.amount ?? 0n), 0n),
        totalVKEscrowClaimed: [...vkEscrowClaims, ...vkEscrowDeletionClaims].reduce((sum, l) => sum + BigInt((l as any).args.amount ?? (l as any).args.vkAmount ?? 0n), 0n),
        totalStaked: stakeDeposits.reduce((sum, l) => sum + BigInt((l as any).args.amount ?? 0n), 0n),
        totalSlashed: stakeSlashes.reduce((sum, l) => sum + BigInt((l as any).args.amount ?? 0n), 0n),
      };

      return {
        events: sortedEvents,
        participants: [...participants.values()].sort((a, b) => Number((b.rewards + b.escrowReceived) - (a.rewards + a.escrowReceived))),
        files: [...files.values()].sort((a, b) => Number((b.policyEscrowDeposited + b.accessEscrowDeposited) - (a.policyEscrowDeposited + a.accessEscrowDeposited))),
        stats: storeTotals ?? stats,
      };
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * The two economics rollup tables, a page at a time.
 *
 * These are the one shape paging alone cannot fix. A participant's row is a sum
 * over every reward, claim, pool deposit, stake movement and escrow transfer
 * that ever named them, so a page of events cannot produce it -- the browser had
 * to hold all of them to add them up. The sums are computed in the store during
 * ingest instead, one row per participant and per file, and those rows page like
 * any other table.
 *
 * Wei arrives as a decimal string: a lifetime total does not fit in a double.
 */
function useRollupRows<T>(dataset: string, pageSize: number, map: (row: Record<string, any>) => T) {
  const paged = usePagedIndex<Record<string, unknown>>(dataset, {}, pageSize);
  return { ...paged, rows: paged.rows.map(row => map(row as Record<string, any>)) };
}

export function usePagedEconomicParticipants(pageSize = 200) {
  return useRollupRows<ParticipantEconomics>('economic-participants', pageSize, (r) => ({
    address: r.address,
    rewards: BigInt(r.rewards ?? 0),
    claimed: BigInt(r.claimed ?? 0),
    poolDeposits: BigInt(r.pool_deposits ?? 0),
    stakeDeposits: BigInt(r.stake_deposits ?? 0),
    slashed: BigInt(r.slashed ?? 0),
    escrowPaid: BigInt(r.escrow_paid ?? 0),
    escrowReceived: BigInt(r.escrow_received ?? 0),
    eventCount: Number(r.event_count ?? 0),
  }));
}

export function usePagedFileEconomics(pageSize = 200) {
  return useRollupRows<FileEconomics>('file-economics', pageSize, (r) => ({
    fileId: r.fileId,
    policyEscrowDeposited: BigInt(r.policy_escrow_deposited ?? 0),
    policyEscrowRefunded: BigInt(r.policy_escrow_refunded ?? 0),
    accessEscrowDeposited: BigInt(r.access_escrow_deposited ?? 0),
    rewardsCredited: BigInt(r.rewards_credited ?? 0),
    accessRequestCount: Number(r.access_request_count ?? 0),
    eventCount: Number(r.event_count ?? 0),
  }));
}

/** How many rows each rollup holds, for the figure beside the table. */
export function useRollupCounts() {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: ['rollup-counts'],
    queryFn: async () => {
      const res = await fetch('/api/index/rollup-counts', { cache: 'default' }).catch(() => null);
      if (!res || !res.ok) return null;
      return res.json() as Promise<{ participants: number; files: number } | null>;
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/**
 * The dashboard's reward breakdown, counted and summed in the store.
 *
 * Six numbers and six counts, which the dashboard was getting by downloading
 * thirty-two event streams and filtering them in the browser -- eighty-one
 * kilobytes for the escrow deposits alone, on the first page every visitor sees.
 * Every one of them is a sum or a count over a named set of events, which is
 * three aggregate requests: two the economics screens already make, so
 * react-query serves them from the same cache entry.
 */
const GUARDIAN_REWARD_EVENTS = [
  'GuardianRewardCredited', 'GuardianMeasuredRewardCredited',
  'GuardianAccessRewardCredited', 'GuardianMeasuredAccessRewardCredited',
  'GuardianJoinRewarded', 'GuardianShareProofRewarded',
] as const;
/** GuardianWorkReward's payments, counted in its own contract. */
const GUARDIAN_WORK_REWARD_EVENTS = ['GuardianRewarded'] as const;
const VK_REWARD_EVENTS = [
  'VKJoinRewarded', 'VKProofRewardCredited', 'VKProofRewarded', 'VKFileRewarded',
  'VKCapacityRewarded',
] as const;
const VK_ESCROW_CLAIM_EVENTS = ['EscrowClaimed', 'EscrowClaimedOnDeletion'] as const;

const GUARDIAN_REWARD_TYPES = [
  'guardian_reward', 'guardian_access_reward', 'guardian_join_reward', 'share_proof_reward',
  'guardian_work_reward',
] as const;
const VK_REWARD_TYPES = ['vk_join_reward', 'vk_proof_reward', 'vk_file_reward', 'vk_capacity_reward'] as const;

export function useRewardBreakdown() {
  const totals = useEconomicsTotals();
  const byType = useRewardTotalsByType();
  const { data: rewardCounts, isLoading } = useEventCountsByName('RewardManager');
  const { data: workCounts } = useEventCountsByName('GuardianWorkReward');
  const { data: escrowCounts } = useEventCountsByName('VKEscrow');

  const sumTypes = (types: readonly string[]) =>
    types.reduce((sum, type) => sum + (byType?.[type] ?? 0n), 0n);
  const countEvents = (
    counts: Record<string, number> | null | undefined,
    names: readonly string[],
  ) => names.reduce((sum, name) => sum + (counts?.[name] ?? 0), 0);

  return {
    guardianRewards: sumTypes(GUARDIAN_REWARD_TYPES),
    guardianRewardCount: countEvents(rewardCounts, GUARDIAN_REWARD_EVENTS)
      + countEvents(workCounts, GUARDIAN_WORK_REWARD_EVENTS),
    vkRewards: sumTypes(VK_REWARD_TYPES),
    vkRewardCount: countEvents(rewardCounts, VK_REWARD_EVENTS),
    claimed: totals?.totalClaimed ?? 0n,
    poolDeposits: totals?.totalPoolDeposits ?? 0n,
    policyEscrow: totals?.totalPolicyEscrow ?? 0n,
    policyEscrowCount: countEvents(rewardCounts, ['PolicyEscrowDeposited']),
    accessEscrow: totals?.totalAccessEscrow ?? 0n,
    accessEscrowCount: countEvents(rewardCounts, ['AccessEscrowDeposited']),
    vkStorageClaimed: totals?.totalVKEscrowClaimed ?? 0n,
    vkStorageClaimCount: countEvents(escrowCounts, VK_ESCROW_CLAIM_EVENTS),
    isLoading,
  };
}
