// The early-network pool that pays Guardians for each finished DKG (kind 0), each used
// PRE part (kind 1) and each PRE ready-but-not-used (kind 2). Its own contract, beside
// RewardManager.
export const GuardianWorkRewardABI = [
  { type: 'event', name: 'GuardianRewarded', anonymous: false, inputs: [
    { indexed: true, name: 'guardian', type: 'address' },
    { indexed: true, name: 'kind', type: 'uint8' },
    { indexed: false, name: 'amount', type: 'uint256' },
  ]},
  { type: 'event', name: 'PoolDeposited', anonymous: false, inputs: [
    { indexed: true, name: 'sender', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'balance', type: 'uint256' },
  ]},
  { type: 'event', name: 'RewardsSet', anonymous: false, inputs: [
    { indexed: false, name: 'dkgWei', type: 'uint256' },
    { indexed: false, name: 'preWei', type: 'uint256' },
    { indexed: false, name: 'preReadyWei', type: 'uint256' },
    { indexed: false, name: 'capWei', type: 'uint256' },
  ]},
  { type: 'event', name: 'CallerAuthorized', anonymous: false, inputs: [
    { indexed: true, name: 'caller', type: 'address' },
    { indexed: false, name: 'authorized', type: 'bool' },
  ]},
] as const;
