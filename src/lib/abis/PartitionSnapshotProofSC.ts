import { parseAbi } from 'viem';

export const PartitionSnapshotProofSCABI = parseAbi([
  'function freezePartitionSnapshot(bytes32 partitionKey, uint64 proofEpochId, uint64 round) returns (uint64 contentVersion, uint64 anchorBlock)',
  'function sealPartitionSnapshot(bytes32 partitionKey) returns (bytes32 seed)',
  'function reanchorFrozenPartitionSnapshot(bytes32 partitionKey, uint64 contentVersion, uint64 round) returns (uint64 anchorBlock)',
  'function submitFrozenPartitionZkProof(bytes32 partitionKey, uint64 contentVersion, uint64 proofEpochId, uint64 round, bytes proof, uint256[] publicInputs) returns (bool acceptedAsCurrent)',
  'function abandonFrozenPartitionSnapshot(bytes32 partitionKey, uint64 contentVersion)',
  'event PartitionSnapshotFrozen(bytes32 indexed partitionKey, address indexed vk, uint64 indexed contentVersion, bytes32 contentHash, uint64 proofEpochId, uint64 round, uint64 freezeBlock, uint64 deadline)',
  'event PartitionSnapshotSealed(bytes32 indexed partitionKey, uint64 indexed contentVersion, uint64 proofEpochId, uint64 round, bytes32 challengeAnchor, bytes32 seed)',
  'event PartitionSnapshotReanchored(bytes32 indexed partitionKey, uint64 indexed contentVersion, uint64 proofEpochId, uint64 round, uint64 freezeBlock)',
  'event PartitionSnapshotInvalidated(bytes32 indexed partitionKey, uint64 indexed contentVersion, bytes32 reason)',
  'event FrozenPartitionProofSubmitted(bytes32 indexed partitionKey, address indexed vk, uint64 indexed contentVersion, uint64 proofEpochId, uint64 round, bytes32 contentHash, bool acceptedAsCurrent)',
  'event FrozenPartitionProofAlreadyAccepted(bytes32 indexed partitionKey, uint64 indexed contentVersion, uint64 proofEpochId, uint64 round, bytes32 contentHash)',
]);
