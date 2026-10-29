/**
 * Rollups: one row per participant or per file, summed from the event log.
 *
 * These are not entity projections. An entity projection asks the contract what
 * a thing currently is; a rollup asks the log what happened to it, and there is
 * no call that returns "how much has this address been rewarded in total". The
 * two economics tables were built by downloading every reward, claim, pool
 * deposit, stake movement and escrow transfer and adding them up in the browser
 * -- which is correct, and is also the one shape that cannot be fixed by paging,
 * because a page of events cannot tell you a total.
 *
 * Each spec is one `GROUP BY` over the event table: the key is an argument, and
 * every column is a conditional sum or count over a named set of events. One
 * pass per ingest, rather than one download per reader.
 */

/// Reward events name the recipient two ways and the amount two ways.
const GUARDIAN_REWARDS = [
  'GuardianRewardCredited', 'GuardianMeasuredRewardCredited',
  'GuardianAccessRewardCredited', 'GuardianMeasuredAccessRewardCredited',
  'GuardianJoinRewarded', 'GuardianShareProofRewarded',
  // GuardianWorkReward: the pool reward for a finished DKG, a used PRE part or a PRE
  // ready-but-not-used.
  'GuardianRewarded',
];
const VK_REWARDS = [
  'VKJoinRewarded', 'VKProofRewardCredited', 'VKProofRewarded', 'VKFileRewarded',
  'VKCapacityRewarded',
];
const POOL_DEPOSITS = [
  'JoinRewardPoolDeposited', 'ProofRewardPoolDeposited', 'VKJoinRewardPoolDeposited',
  'VKProofRewardPoolDeposited', 'VKFileRewardPoolDeposited', 'VKCapacityRewardPoolDeposited',
  // GuardianWorkReward's pool.
  'PoolDeposited',
];
const ESCROW_PAID = [
  'PolicyEscrowDeposited', 'AccessEscrowDeposited', 'EscrowDeposited',
];
const ESCROW_RECEIVED = ['EscrowClaimed', 'EscrowClaimedOnDeletion'];

export const ROLLUP_SPECS = [
  {
    kind: 'economic_participant',
    table: 'economic_participant',
    /// Whichever of these the event carries is the address it is about. Ordered
    /// so the most specific wins: an event naming both a payer and a recipient
    /// is about the recipient of the money, not the account that sent it.
    keyArgs: ['guardian', 'vk', 'recipient', 'depositor', 'payer', 'requester', 'sender'],
    keyKind: 'address',
    /// Both names are read for every sum: these contracts are not consistent
    /// about `amount` versus `amountWei`, and an event carries one or the other.
    amountArgs: ['amount', 'amountWei'],
    events: [
      ...GUARDIAN_REWARDS, ...VK_REWARDS, ...POOL_DEPOSITS,
      ...ESCROW_PAID, ...ESCROW_RECEIVED,
      'RewardsClaimed',
      'StakeDeposited', 'StakeWithdrawn', 'StakeSlashed',
    ],
    columns: [
      { as: 'rewards', op: 'sum', events: [...GUARDIAN_REWARDS, ...VK_REWARDS] },
      { as: 'claimed', op: 'sum', events: ['RewardsClaimed'] },
      { as: 'pool_deposits', op: 'sum', events: POOL_DEPOSITS },
      { as: 'stake_deposits', op: 'sum', events: ['StakeDeposited'] },
      { as: 'slashed', op: 'sum', events: ['StakeSlashed'] },
      { as: 'escrow_paid', op: 'sum', events: ESCROW_PAID },
      // Deletion claims name the vault keeper's share `vkAmount`; ordinary
      // claims name it `amount`. Both are read so neither is silently zero.
      { as: 'escrow_received', op: 'sum', events: ESCROW_RECEIVED, extraAmountArgs: ['vkAmount'] },
      { as: 'event_count', op: 'count' },
    ],
  },

  {
    kind: 'file_economics',
    table: 'file_economics',
    keyArgs: ['fileId'],
    keyKind: 'key',
    amountArgs: ['amount', 'amountWei'],
    events: [
      'PolicyEscrowDeposited', 'PolicyEscrowRefunded', 'AccessEscrowDeposited',
      ...GUARDIAN_REWARDS, ...VK_REWARDS,
      'DataAccessRequestedV2',
    ],
    columns: [
      { as: 'policy_escrow_deposited', op: 'sum', events: ['PolicyEscrowDeposited'] },
      { as: 'policy_escrow_refunded', op: 'sum', events: ['PolicyEscrowRefunded'] },
      { as: 'access_escrow_deposited', op: 'sum', events: ['AccessEscrowDeposited'] },
      { as: 'rewards_credited', op: 'sum', events: [...GUARDIAN_REWARDS, ...VK_REWARDS] },
      { as: 'access_request_count', op: 'count', events: ['DataAccessRequestedV2'] },
      { as: 'event_count', op: 'count' },
    ],
  },

  {
    kind: 'pre_request',
    table: 'pre_request',
    keyArgs: ['requestId'],
    /// A uint256, not a hash. Stored as the decimal string the log carries.
    keyKind: 'text',
    events: [
      'PreReadyDeclared', 'V2AccessPartialSubmitted', 'V2BatchAccessPartialSubmitted',
      'PreBadPartialDetected', 'PreRequestExpired',
    ],
    columns: [
      /// The file the request is about. Every event carries it, so any of them
      /// answers; `max` rather than `any` only so two runs agree.
      { as: 'file_id', op: 'maxArg', arg: 'fileId', kind: 'bytes' },
      { as: 'ready_guardians', op: 'set', arg: 'guardian', events: ['PreReadyDeclared'] },
      /// `guardian` is not indexed on the batch variant, so a row without one
      /// contributes nothing rather than an empty address.
      { as: 'active_guardians', op: 'set', arg: 'guardian',
        events: ['V2AccessPartialSubmitted', 'V2BatchAccessPartialSubmitted'] },
      { as: 'bad_guardians', op: 'set', arg: 'guardian', events: ['PreBadPartialDetected'] },
      { as: 'tx_hashes', op: 'set', column: 'tx_hash' },
      { as: 'expired', op: 'flag', events: ['PreRequestExpired'] },
      { as: 'absent_count', op: 'maxNumber', arg: 'absentCount', events: ['PreRequestExpired'] },
      /// The earliest block any of the five touched it, which is what the screen
      /// orders by. Not the block of a "first" event -- there is no such thing
      /// here, which is the whole reason this is a rollup.
      { as: 'first_block', op: 'minColumn', column: 'block_number' },
      { as: 'event_count', op: 'count' },
    ],
  },
];
