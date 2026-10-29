export const StakingManagerABI = [
  { type: 'event', name: 'StakeDeposited', anonymous: false, inputs: [
    { indexed: true, name: 'guardian', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'totalStake', type: 'uint256' },
  ]},
  { type: 'event', name: 'StakeWithdrawn', anonymous: false, inputs: [
    { indexed: true, name: 'guardian', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'remainingStake', type: 'uint256' },
  ]},
  { type: 'event', name: 'StakeLocked', anonymous: false, inputs: [
    { indexed: true, name: 'guardian', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'lockedStake', type: 'uint256' },
  ]},
  { type: 'event', name: 'StakeUnlocked', anonymous: false, inputs: [
    { indexed: true, name: 'guardian', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'lockedStake', type: 'uint256' },
  ]},
  { type: 'event', name: 'StakeSlashed', anonymous: false, inputs: [
    { indexed: true, name: 'guardian', type: 'address' },
    { indexed: false, name: 'amount', type: 'uint256' },
    { indexed: false, name: 'remainingStake', type: 'uint256' },
    { indexed: true, name: 'treasury', type: 'address' },
  ]},
  { type: 'event', name: 'MinimumStakeUpdated', anonymous: false, inputs: [
    { indexed: false, name: 'minStake', type: 'uint256' },
  ]},
  { type: 'function', name: 'stakeOf', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'lockedStakeOf', stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]},
  { type: 'function', name: 'availableStake', stateMutability: 'view',
    inputs: [{ name: 'guardian', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]},
] as const;
