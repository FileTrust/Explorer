import { parseAbi } from 'viem';

export const CapacityProofSCABI = [
  {
    inputs: [{ internalType: 'address', name: 'vk', type: 'address' }],
    name: 'capacityAccountingOf',
    outputs: [
      { internalType: 'uint64', name: 'declaredBytes', type: 'uint64' },
      { internalType: 'uint64', name: 'registeredFree', type: 'uint64' },
      { internalType: 'uint64', name: 'registeredData', type: 'uint64' },
      { internalType: 'uint64', name: 'provedFree', type: 'uint64' },
      { internalType: 'uint64', name: 'provedData', type: 'uint64' },
      { internalType: 'uint64', name: 'quoteReserved', type: 'uint64' },
      { internalType: 'uint64', name: 'allocatedStored', type: 'uint64' },
      { internalType: 'uint64', name: 'conservativeFree', type: 'uint64' },
      { internalType: 'uint64', name: 'latestCapacityProofAt', type: 'uint64' },
      { internalType: 'bool', name: 'proofFresh', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'vk', type: 'address' }],
    name: 'getActiveProofEpoch',
    outputs: [
      { internalType: 'uint64', name: 'epochId', type: 'uint64' },
      { internalType: 'uint64', name: 'targetRound', type: 'uint64' },
      { internalType: 'uint64', name: 'cutoffNonce', type: 'uint64' },
      { internalType: 'uint32', name: 'expectedPartitions', type: 'uint32' },
      { internalType: 'uint32', name: 'provenPartitions', type: 'uint32' },
      { internalType: 'uint64', name: 'expectedBytes', type: 'uint64' },
      { internalType: 'bool', name: 'active', type: 'bool' },
      { internalType: 'bool', name: 'invalidated', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ internalType: 'address', name: 'vk', type: 'address' }],
    name: 'capacityCheckpointOf',
    outputs: [
      { internalType: 'uint64', name: 'checkpointFree', type: 'uint64' },
      { internalType: 'uint64', name: 'checkpointData', type: 'uint64' },
      { internalType: 'uint64', name: 'allocatedAtCheckpoint', type: 'uint64' },
      { internalType: 'uint64', name: 'backedBytes', type: 'uint64' },
      { internalType: 'uint64', name: 'proofSequence', type: 'uint64' },
      { internalType: 'uint64', name: 'proofRound', type: 'uint64' },
      { internalType: 'uint64', name: 'proofAt', type: 'uint64' },
      { internalType: 'bool', name: 'proofFresh', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export const CapacityProofSCEventABI = parseAbi([
  'event CapacityDeclared(address indexed vk, uint64 totalCapacityBytes)',
  'event QuoteReserved(bytes32 indexed registrationCommitment, address indexed vk, uint64 reservedBytes, uint64 expiresAt)',
  'event QuoteReservationStateChanged(bytes32 indexed registrationCommitment, address indexed vk, uint8 oldState, uint8 newState, uint64 reservedBytes)',
  'event PartitionCapacityRegistered(bytes32 indexed partitionKey, address indexed vk, uint8 kind, uint64 contentVersion, bytes32 contentHash, uint64 registeredBytes, bool active)',
  'event PartitionCapacityProven(bytes32 indexed partitionKey, address indexed vk, uint8 kind, uint64 contentVersion, bytes32 contentHash, uint64 provedBytes, uint64 proofSequence)',
  'event ProofEpochStarted(address indexed vk, uint64 indexed epochId, uint64 targetRound, uint64 cutoffNonce, uint32 expectedPartitions, uint64 expectedBytes)',
  'event ProofEpochCompleted(address indexed vk, uint64 indexed epochId, uint64 targetRound, uint64 proofSequence, uint64 backedBytes)',
  'event ProofEpochAborted(address indexed vk, uint64 indexed epochId, uint64 targetRound)',
  'event ProofEpochCutoffMemberExcluded(address indexed vk, uint64 indexed epochId, bytes32 partitionKey, uint64 contentVersion, uint64 excludedBytes)',
]);
