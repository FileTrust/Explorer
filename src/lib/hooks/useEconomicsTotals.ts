'use client';

import { useEventSumsByName } from '@/lib/hooks/useEventCounts';
import type { EconomicsStats } from '@/lib/hooks/useEconomics';

/**
 * The money figures on the economics screens, summed in the store.
 *
 * These were reductions over downloaded arrays, which makes the total and the
 * download the same act: to show what the network has paid out, the browser had
 * to hold every payment. One grouped sum per contract and argument returns a
 * total per event name instead, and the response is the same size whether it
 * covers a thousand payments or a billion.
 *
 * The event names below are transcribed from `useEconomics`, which is the only
 * place that decides what counts as a reward, a claim or an escrow. They are
 * listed rather than inferred because a wrong name here is a money figure that
 * is quietly too small, and no test on a young chain would notice.
 *
 * The argument names differ per event and were read off the chain rather than
 * assumed: rewards, pool deposits, stake and escrow deposits carry `amount`;
 * claims and policy or access escrows carry `amountWei`; deletion claims carry
 * `vkAmount`. Summing the wrong one returns zero, which looks exactly like a
 * network that has paid nothing.
 */

const REWARD_EVENTS = [
  'GuardianRewardCredited', 'GuardianMeasuredRewardCredited',
  'GuardianAccessRewardCredited', 'GuardianMeasuredAccessRewardCredited',
  'GuardianJoinRewarded', 'GuardianShareProofRewarded',
  'VKJoinRewarded', 'VKProofCredited', 'VKProofRewarded', 'VKFileRewarded',
  'VKCapacityRewarded',
];
const CLAIM_EVENTS = ['RewardsClaimed'];
// One deposit event per RewardManager pool. These were listed as `RewardPoolFunded`
// and `PoolDeposited`, which RewardManager never emits, so the pools always summed
// to zero.
const POOL_EVENTS = [
  'JoinRewardPoolDeposited', 'ProofRewardPoolDeposited', 'VKJoinRewardPoolDeposited',
  'VKProofRewardPoolDeposited', 'VKFileRewardPoolDeposited', 'VKCapacityRewardPoolDeposited',
];
// GuardianWorkReward: the Guardian DKG/PRE pool, its own contract.
const WORK_REWARD_EVENTS = ['GuardianRewarded'];
const WORK_POOL_EVENTS = ['PoolDeposited'];
const POLICY_ESCROW_EVENTS = ['PolicyEscrowDeposited'];
const ACCESS_ESCROW_EVENTS = ['AccessEscrowDeposited'];
const VK_ESCROW_DEPOSIT_EVENTS = ['EscrowDeposited'];
const VK_ESCROW_CLAIM_EVENTS = ['EscrowClaimed', 'EscrowClaimedOnDeletion'];
const STAKE_DEPOSIT_EVENTS = ['StakeDeposited'];
const STAKE_SLASH_EVENTS = ['StakeSlashed'];

const sumOf = (sums: Record<string, bigint> | null | undefined, names: readonly string[]) =>
  names.reduce((total, name) => total + (sums?.[name] ?? 0n), 0n);

/**
 * Returns null until every request has answered, so a screen never shows a
 * half-summed total as a real one. A screen with no store keeps the figures it
 * reduced itself.
 */
export function useEconomicsTotals(): EconomicsStats | null {
  return useEconomicsTotalsState().totals;
}

/**
 * The same totals, with why they are missing when they are: still being asked
 * (`isLoading`), or there is no store to sum them (`unavailable`). A screen that
 * would otherwise download every economic event uses the second to decide when
 * that is the only way left.
 */
export function useEconomicsTotalsState(): {
  totals: EconomicsStats | null; isLoading: boolean; unavailable: boolean;
} {
  // `amount` and `amountWei` are both asked for on RewardManager because its
  // events are not consistent between them, and an absent name simply sums to
  // nothing rather than erroring.
  const { data: rewardAmount } = useEventSumsByName('RewardManager', 'amount');
  const { data: rewardWei } = useEventSumsByName('RewardManager', 'amountWei');
  const { data: workAmount } = useEventSumsByName('GuardianWorkReward', 'amount');
  const { data: vkEscrowAmount } = useEventSumsByName('VKEscrow', 'amount');
  const { data: vkEscrowVk } = useEventSumsByName('VKEscrow', 'vkAmount');
  const { data: stakeAmount } = useEventSumsByName('StakingManager', 'amount');
  const { data: accessWei } = useEventSumsByName('AccessControlFT', 'amountWei');
  const { data: vaultWei } = useEventSumsByName('DataVault', 'amountWei');

  // Every request, or none of them.
  //
  // The first version returned as soon as any one had answered, so whichever
  // arrived first produced a total with the others still zero -- and because the
  // shape was already non-null, the consuming query cached it and never asked
  // again. Rewards read 0 FTU while VK escrow read correctly, which is precisely
  // the half-summed total this is supposed to prevent.
  const answers = [rewardAmount, rewardWei, workAmount, vkEscrowAmount, vkEscrowVk,
    stakeAmount, accessWei, vaultWei];
  if (answers.some((a) => a === undefined)) return { totals: null, isLoading: true, unavailable: false };
  if (answers.every((a) => a === null)) return { totals: null, isLoading: false, unavailable: true };

  const rewards = (s: readonly string[]) => sumOf(rewardAmount, s) + sumOf(rewardWei, s);
  // Policy and access escrow deposits are RewardManager events. They were summed only
  // from AccessControlFT and DataVault, which never emit them, so both escrow totals
  // read zero; RewardManager is now included. The names occur in no other contract.
  const escrow = (s: readonly string[]) =>
    sumOf(rewardWei, s) + sumOf(accessWei, s) + sumOf(vaultWei, s);

  return { isLoading: false, unavailable: false, totals: {
    totalRewards: rewards(REWARD_EVENTS) + sumOf(workAmount, WORK_REWARD_EVENTS),
    totalClaimed: rewards(CLAIM_EVENTS),
    totalPoolDeposits: rewards(POOL_EVENTS) + sumOf(workAmount, WORK_POOL_EVENTS),
    totalPolicyEscrow: escrow(POLICY_ESCROW_EVENTS),
    totalAccessEscrow: escrow(ACCESS_ESCROW_EVENTS),
    totalVKEscrowDeposited: sumOf(vkEscrowAmount, VK_ESCROW_DEPOSIT_EVENTS),
    // Deletion claims name it vkAmount; ordinary claims name it amount.
    totalVKEscrowClaimed: sumOf(vkEscrowAmount, VK_ESCROW_CLAIM_EVENTS)
      + sumOf(vkEscrowVk, VK_ESCROW_CLAIM_EVENTS),
    totalStaked: sumOf(stakeAmount, STAKE_DEPOSIT_EVENTS),
    totalSlashed: sumOf(stakeAmount, STAKE_SLASH_EVENTS),
  } };
}
