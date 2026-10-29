'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { RewardManagerABI } from '@/lib/abis/RewardManager';
import { StakingManagerABI } from '@/lib/abis/StakingManager';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { getIndexedLogs } from '@/lib/indexedLogs';
import { usePagedEventRows, useEventSumsByName } from '@/lib/hooks/useEventCounts';

export interface RewardEvent {
  type: 'guardian_reward' | 'guardian_access_reward' | 'guardian_join_reward' | 'vk_proof_reward' | 'vk_join_reward' | 'vk_file_reward' | 'vk_capacity_reward' | 'guardian_work_reward' | 'share_proof_reward' | 'claimed' | 'policy_escrow' | 'access_escrow';
  address: `0x${string}`;
  amount: bigint;
  /** guardian_work_reward only: 0 a finished DKG, 1 a used PRE part, 2 PRE ready-but-not-used. */
  workKind?: number;
  /** vk_capacity_reward only: the keeper's proven space the payment was for. */
  provenBytes?: bigint;
  fileId?: `0x${string}`;
  requestId?: bigint;
  rewardType?: `0x${string}`;
  serviceUnits?: bigint;
  measuredGas?: bigint;
  gasReimbursementWei?: bigint;
  incentiveWei?: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export interface StakeEvent {
  type: 'deposit' | 'withdraw' | 'slash' | 'lock' | 'unlock';
  address: `0x${string}`;
  amount: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export function useRewards() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['rewards'],
    queryFn: async (): Promise<RewardEvent[]> => {
      const [
        guardianRew,
        guardianMeasuredRew,
        guardianAccessRew,
        guardianMeasuredAccessRew,
        guardianJoinRew,
        shareProofRew,
        vkJoin,
        vkProofCredited,
        vkProofRewarded,
        vkFileRewarded,
        claimed,
        policyEscrow,
        accessEscrow,
      ] = await Promise.all([
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'GuardianRewardCredited')! as any }),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'GuardianMeasuredRewardCredited')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'GuardianAccessRewardCredited')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'GuardianMeasuredAccessRewardCredited')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'GuardianJoinRewarded')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'GuardianShareProofRewarded')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'VKJoinRewarded')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'VKProofRewardCredited')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'VKProofRewarded')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'VKFileRewarded')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'RewardsClaimed')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'PolicyEscrowDeposited')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.RewardManager, event: RewardManagerABI.find(e => e.name === 'AccessEscrowDeposited')! as any }).catch(() => []),
      ]);

      const events: RewardEvent[] = [];
      for (const l of guardianRew) {
        const a = (l as any).args;
        events.push({ type: 'guardian_reward', address: a.guardian, amount: a.amountWei, fileId: a.fileId, rewardType: a.rewardType, serviceUnits: a.serviceUnits, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of guardianMeasuredRew) {
        const a = (l as any).args;
        events.push({ type: 'guardian_reward', address: a.guardian, amount: a.amountWei, fileId: a.fileId, rewardType: a.rewardType, serviceUnits: a.incentiveServiceUnits, measuredGas: a.measuredGas, gasReimbursementWei: a.gasReimbursementWei, incentiveWei: a.incentiveWei, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of guardianAccessRew) {
        const a = (l as any).args;
        events.push({ type: 'guardian_access_reward', address: a.guardian, amount: a.amountWei, fileId: a.fileId, requestId: a.requestId, rewardType: a.rewardType, serviceUnits: a.serviceUnits, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of guardianMeasuredAccessRew) {
        const a = (l as any).args;
        events.push({ type: 'guardian_access_reward', address: a.guardian, amount: a.amountWei, fileId: a.fileId, requestId: a.requestId, rewardType: a.rewardType, serviceUnits: a.incentiveServiceUnits, measuredGas: a.measuredGas, gasReimbursementWei: a.gasReimbursementWei, incentiveWei: a.incentiveWei, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of guardianJoinRew) {
        const a = (l as any).args;
        events.push({ type: 'guardian_join_reward', address: a.guardian, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of shareProofRew) {
        const a = (l as any).args;
        events.push({ type: 'share_proof_reward', address: a.guardian, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of vkJoin) {
        const a = (l as any).args;
        events.push({ type: 'vk_join_reward', address: a.vk, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of vkProofCredited) {
        const a = (l as any).args;
        events.push({ type: 'vk_proof_reward', address: a.vk, amount: a.amountWei, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of vkProofRewarded) {
        const a = (l as any).args;
        events.push({ type: 'vk_proof_reward', address: a.vk, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of vkFileRewarded) {
        const a = (l as any).args;
        events.push({ type: 'vk_file_reward', address: a.vk, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of claimed) {
        const a = (l as any).args;
        events.push({ type: 'claimed', address: a.guardian, amount: a.amountWei, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of policyEscrow) {
        const a = (l as any).args;
        events.push({ type: 'policy_escrow', address: a.payer, amount: a.amountWei, fileId: a.fileId, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of accessEscrow) {
        const a = (l as any).args;
        events.push({ type: 'access_escrow', address: a.requester, amount: a.amountWei, fileId: a.fileId, requestId: a.requestId, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      return events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

export function useStakingEvents() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['staking'],
    queryFn: async (): Promise<StakeEvent[]> => {
      const [deposits, withdrawals, slashes, locks, unlocks] = await Promise.all([
        getIndexedLogs({ address: CONTRACTS.StakingManager, event: StakingManagerABI.find(e => e.name === 'StakeDeposited')! as any }),
        getIndexedLogs({ address: CONTRACTS.StakingManager, event: StakingManagerABI.find(e => e.name === 'StakeWithdrawn')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.StakingManager, event: StakingManagerABI.find(e => e.name === 'StakeSlashed')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.StakingManager, event: StakingManagerABI.find(e => e.name === 'StakeLocked')! as any }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.StakingManager, event: StakingManagerABI.find(e => e.name === 'StakeUnlocked')! as any }).catch(() => []),
      ]);
      const events: StakeEvent[] = [];
      for (const l of deposits) {
        const a = (l as any).args;
        events.push({ type: 'deposit', address: a.guardian, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of withdrawals) {
        const a = (l as any).args;
        events.push({ type: 'withdraw', address: a.guardian, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of slashes) {
        const a = (l as any).args;
        events.push({ type: 'slash', address: a.guardian, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of locks) {
        const a = (l as any).args;
        events.push({ type: 'lock', address: a.guardian, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      for (const l of unlocks) {
        const a = (l as any).args;
        events.push({ type: 'unlock', address: a.guardian, amount: a.amount, blockNumber: l.blockNumber ?? 0n, txHash: l.transactionHash ?? '0x' });
      }
      return events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

/** What a GuardianWorkReward payment was for, by its `kind`. */
export const GUARDIAN_WORK_KIND_LABELS: Record<number, string> = {
  0: 'Guardian DKG Reward',
  1: 'Guardian PRE Reward',
  2: 'Guardian PRE Ready Reward',
};

/** The display label of one reward row, naming what a Guardian work reward paid for. */
export function guardianWorkLabel(kind: number | undefined): string {
  return (kind !== undefined && GUARDIAN_WORK_KIND_LABELS[kind]) || 'Guardian DKG/PRE Reward';
}

/**
 * The reward and staking tables, a page at a time.
 *
 * Each row is one event, so the store's ordered stream over these names is
 * exactly the list -- rather than thirteen full downloads concatenated and
 * sorted in the browser.
 */
const REWARD_EVENTS = [
  'GuardianRewardCredited', 'GuardianMeasuredRewardCredited',
  'GuardianAccessRewardCredited', 'GuardianMeasuredAccessRewardCredited',
  'GuardianJoinRewarded', 'GuardianShareProofRewarded',
  'VKJoinRewarded', 'VKProofRewardCredited', 'VKProofRewarded', 'VKFileRewarded',
  'VKCapacityRewarded', 'GuardianRewarded',
  'RewardsClaimed', 'PolicyEscrowDeposited', 'AccessEscrowDeposited',
] as const;

/** RewardManager pays every reward but one; the Guardian DKG/PRE pool reward is paid by
 *  its own contract, GuardianWorkReward. */
export const REWARD_CONTRACTS = ['RewardManager', 'GuardianWorkReward'] as const;

export function usePagedRewards(pageSize = 200) {
  return usePagedEventRows<RewardEvent>(REWARD_CONTRACTS, REWARD_EVENTS, (row) => {
    const a = (row.args ?? {}) as Record<string, any>;
    const base = {
      blockNumber: BigInt(row.blockNumber ?? 0),
      txHash: (row.transactionHash ?? '0x') as `0x${string}`,
      fileId: a.fileId as `0x${string}` | undefined,
      requestId: a.requestId as bigint | undefined,
      rewardType: a.rewardType as `0x${string}` | undefined,
    };
    // The measured variants carry the gas breakdown, and name service units
    // differently from the plain ones.
    const measured = {
      serviceUnits: a.incentiveServiceUnits as bigint | undefined,
      measuredGas: a.measuredGas as bigint | undefined,
      gasReimbursementWei: a.gasReimbursementWei as bigint | undefined,
      incentiveWei: a.incentiveWei as bigint | undefined,
    };
    const g = a.guardian as `0x${string}`;
    const vk = a.vk as `0x${string}`;

    switch (row.name) {
      case 'GuardianRewardCredited':
        return { ...base, type: 'guardian_reward', address: g, amount: a.amountWei, serviceUnits: a.serviceUnits };
      case 'GuardianMeasuredRewardCredited':
        return { ...base, ...measured, type: 'guardian_reward', address: g, amount: a.amountWei };
      case 'GuardianAccessRewardCredited':
        return { ...base, type: 'guardian_access_reward', address: g, amount: a.amountWei, serviceUnits: a.serviceUnits };
      case 'GuardianMeasuredAccessRewardCredited':
        return { ...base, ...measured, type: 'guardian_access_reward', address: g, amount: a.amountWei };
      case 'GuardianJoinRewarded': return { ...base, type: 'guardian_join_reward', address: g, amount: a.amount };
      case 'GuardianShareProofRewarded': return { ...base, type: 'share_proof_reward', address: g, amount: a.amount };
      case 'VKJoinRewarded': return { ...base, type: 'vk_join_reward', address: vk, amount: a.amount };
      case 'VKProofRewardCredited': return { ...base, type: 'vk_proof_reward', address: vk, amount: a.amountWei };
      case 'VKProofRewarded': return { ...base, type: 'vk_proof_reward', address: vk, amount: a.amount };
      case 'VKFileRewarded': return { ...base, type: 'vk_file_reward', address: vk, amount: a.amount };
      case 'VKCapacityRewarded':
        return { ...base, type: 'vk_capacity_reward', address: vk, amount: a.amount, provenBytes: a.provenBytes as bigint | undefined };
      case 'GuardianRewarded':
        return { ...base, type: 'guardian_work_reward', address: g, amount: a.amount, workKind: Number(a.kind) };
      case 'RewardsClaimed': return { ...base, type: 'claimed', address: g, amount: a.amountWei };
      case 'PolicyEscrowDeposited': return { ...base, type: 'policy_escrow', address: a.payer, amount: a.amountWei };
      case 'AccessEscrowDeposited': return { ...base, type: 'access_escrow', address: a.requester, amount: a.amountWei };
      default: return null;
    }
  }, pageSize);
}

const STAKE_EVENTS = [
  'StakeDeposited', 'StakeWithdrawn', 'StakeSlashed', 'StakeLocked', 'StakeUnlocked',
] as const;

const STAKE_TYPES: Record<string, StakeEvent['type']> = {
  StakeDeposited: 'deposit', StakeWithdrawn: 'withdraw', StakeSlashed: 'slash',
  StakeLocked: 'lock', StakeUnlocked: 'unlock',
};

export function usePagedStakingEvents(pageSize = 200) {
  return usePagedEventRows<StakeEvent>('StakingManager', STAKE_EVENTS, (row) => {
    const a = (row.args ?? {}) as Record<string, any>;
    const type = STAKE_TYPES[row.name ?? ''];
    if (!type) return null;
    return {
      type, address: a.guardian as `0x${string}`, amount: a.amount as bigint,
      blockNumber: BigInt(row.blockNumber ?? 0),
      txHash: (row.transactionHash ?? '0x') as `0x${string}`,
    };
  }, pageSize);
}

/** Which display type each reward event becomes. The paged mapper reads the
 *  same table, so the chart and the rows can never disagree about a name. */
const REWARD_EVENT_TYPES: Record<string, RewardEvent['type']> = {
  GuardianRewardCredited: 'guardian_reward',
  GuardianMeasuredRewardCredited: 'guardian_reward',
  GuardianAccessRewardCredited: 'guardian_access_reward',
  GuardianMeasuredAccessRewardCredited: 'guardian_access_reward',
  GuardianJoinRewarded: 'guardian_join_reward',
  GuardianShareProofRewarded: 'share_proof_reward',
  VKJoinRewarded: 'vk_join_reward',
  VKProofRewardCredited: 'vk_proof_reward',
  VKProofRewarded: 'vk_proof_reward',
  VKFileRewarded: 'vk_file_reward',
  VKCapacityRewarded: 'vk_capacity_reward',
  GuardianRewarded: 'guardian_work_reward',
  RewardsClaimed: 'claimed',
  PolicyEscrowDeposited: 'policy_escrow',
  AccessEscrowDeposited: 'access_escrow',
};

/**
 * Total wei per reward type, summed in the store.
 *
 * The chart beside the table used to add up the rows the browser held, which
 * was only ever right because the screen downloaded every reward. Paged, that
 * chart would describe one page and call it the network.
 *
 * Both `amount` and `amountWei` are asked for: these events are not consistent
 * about the name, and a name that does not appear simply contributes nothing.
 * GuardianWorkReward is summed beside RewardManager; their event names do not
 * overlap, so one lookup by name serves both.
 * Returns null while the sums are still loading, so a caller can fall back.
 */
export function useRewardTotalsByType(): Record<string, bigint> | null {
  const { data: byAmount } = useEventSumsByName('RewardManager', 'amount');
  const { data: byWei } = useEventSumsByName('RewardManager', 'amountWei');
  const { data: byWork } = useEventSumsByName('GuardianWorkReward', 'amount');
  if (byAmount === undefined || byWei === undefined || byWork === undefined) return null;
  if (byAmount === null && byWei === null) return null;

  const totals: Record<string, bigint> = {};
  for (const [name, type] of Object.entries(REWARD_EVENT_TYPES)) {
    const wei = (byAmount?.[name] ?? 0n) + (byWei?.[name] ?? 0n) + (byWork?.[name] ?? 0n);
    if (wei > 0n) totals[type] = (totals[type] ?? 0n) + wei;
  }
  return totals;
}
