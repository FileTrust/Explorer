export const StorageReceiptDisputeABI = [
  { type: 'event', name: 'DisputeSubmitted', anonymous: false, inputs: [
    { indexed: true, name: 'disputeId', type: 'bytes32' },
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'deadlineIndex', type: 'uint8' },
    { indexed: false, name: 'partitionIndex', type: 'uint8' },
    { indexed: false, name: 'partitionRoot', type: 'bytes32' },
  ]},
  { type: 'event', name: 'DisputeValid', anonymous: false, inputs: [
    { indexed: true, name: 'disputeId', type: 'bytes32' },
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'reason', type: 'string' },
  ]},
  { type: 'event', name: 'DisputeInvalid', anonymous: false, inputs: [
    { indexed: true, name: 'disputeId', type: 'bytes32' },
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'reason', type: 'string' },
  ]},
  { type: 'event', name: 'W6EnforcementApplied', anonymous: false, inputs: [
    { indexed: true, name: 'disputeId', type: 'bytes32' },
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'violationLevel', type: 'uint8' },
    { indexed: false, name: 'stakeSlashed', type: 'uint256' },
    { indexed: false, name: 'reputationPenalty', type: 'uint32' },
    { indexed: false, name: 'totalValidDisputes', type: 'uint32' },
    { indexed: false, name: 'suspendedUntil', type: 'uint64' },
    { indexed: false, name: 'permanentlyRemoved', type: 'bool' },
  ]},
  { type: 'event', name: 'VKSuspendedByDispute', anonymous: false, inputs: [
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'suspendedUntil', type: 'uint64' },
    { indexed: false, name: 'totalValidDisputes', type: 'uint32' },
  ]},
  { type: 'event', name: 'VKPermanentlyRemovedByDispute', anonymous: false, inputs: [
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'totalValidDisputes', type: 'uint32' },
  ]},
  { type: 'event', name: 'SectorRiskNotice', anonymous: false, inputs: [
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: true, name: 'sectorRoot', type: 'bytes32' },
    { indexed: false, name: 'reason', type: 'string' },
    { indexed: false, name: 'commitmentCount', type: 'uint256' },
  ]},
  { type: 'event', name: 'DeletionDisputeSubmitted', anonymous: false, inputs: [
    { indexed: true, name: 'delDisputeId', type: 'bytes32' },
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: true, name: 'commitmentHash', type: 'bytes32' },
  ]},
  { type: 'event', name: 'DeletionDisputeValid', anonymous: false, inputs: [
    { indexed: true, name: 'delDisputeId', type: 'bytes32' },
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'commitmentHash', type: 'bytes32' },
    { indexed: false, name: 'reason', type: 'string' },
  ]},
  { type: 'event', name: 'DeletionDisputeInvalid', anonymous: false, inputs: [
    { indexed: true, name: 'delDisputeId', type: 'bytes32' },
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'reason', type: 'string' },
  ]},
  { type: 'event', name: 'DeletionEnforcementApplied', anonymous: false, inputs: [
    { indexed: true, name: 'delDisputeId', type: 'bytes32' },
    { indexed: true, name: 'vk', type: 'address' },
    { indexed: false, name: 'stakeSlashed', type: 'uint256' },
    { indexed: false, name: 'repPenalty', type: 'uint32' },
    { indexed: false, name: 'totalDeletionDisputes', type: 'uint32' },
  ]},
] as const;
