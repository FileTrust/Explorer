// Unconfigured template. configure.py installs the selected network's public contract addresses.
export const CONTRACTS = {
  GuardianRegistry:           '0x0000000000000000000000000000000000000000' as `0x${string}`,
  VaultKeeperRegistry:        '0x0000000000000000000000000000000000000000' as `0x${string}`,
  VKEscrow:                   '0x0000000000000000000000000000000000000000' as `0x${string}`,
  AccessControlFT:            '0x0000000000000000000000000000000000000000' as `0x${string}`,
  DataVault:                  '0x0000000000000000000000000000000000000000' as `0x${string}`,
  CapacityProofSC:            '0x0000000000000000000000000000000000000000' as `0x${string}`,
  PartitionSnapshotProofSC:   '0x0000000000000000000000000000000000000000' as `0x${string}`,
  CapacityCertificationSC:    '0x0000000000000000000000000000000000000000' as `0x${string}`,
  CapacityIncrementalBatchSC: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  StorageProofSC:             '0x0000000000000000000000000000000000000000' as `0x${string}`,
  FileRegistrationSC:         '0x0000000000000000000000000000000000000000' as `0x${string}`,
  StorageReceiptDispute:      '0x0000000000000000000000000000000000000000' as `0x${string}`,
  StorageRegistrationTimeout: '0x0000000000000000000000000000000000000000' as `0x${string}`,
  GuardianShareProof:         '0x0000000000000000000000000000000000000000' as `0x${string}`,
  ZkDkgCoordinatorV2:         '0x0000000000000000000000000000000000000000' as `0x${string}`,
  DkgAttemptController:       '0x0000000000000000000000000000000000000000' as `0x${string}`,
  DkgAttemptRegistry:         '0x0000000000000000000000000000000000000000' as `0x${string}`,
  DkgAttemptEscrow:           '0x0000000000000000000000000000000000000000' as `0x${string}`,
  DkgCommitmentBook:          '0x0000000000000000000000000000000000000000' as `0x${string}`,
  ZkDkgDisputeManager:        '0x0000000000000000000000000000000000000000' as `0x${string}`,
  TElGv2:                     '0x0000000000000000000000000000000000000000' as `0x${string}`,
  ReputationManager:          '0x0000000000000000000000000000000000000000' as `0x${string}`,
  StakingManager:             '0x0000000000000000000000000000000000000000' as `0x${string}`,
  RewardManager:              '0x0000000000000000000000000000000000000000' as `0x${string}`,
  GuardianWorkReward:         '0x0000000000000000000000000000000000000000' as `0x${string}`,
} as const;

export type ContractName = keyof typeof CONTRACTS;

export const CONTRACT_LABELS: Record<ContractName, string> = {
  GuardianRegistry:           "Guardian Registry",
  VaultKeeperRegistry:        "VaultKeeper Registry",
  VKEscrow:                   "VK Escrow",
  AccessControlFT:            "Access Control",
  DataVault:                  "Data Vault",
  CapacityProofSC:            "Capacity Proof",
  PartitionSnapshotProofSC:   "Partition Snapshot Proof",
  CapacityCertificationSC:    "Capacity Certification",
  CapacityIncrementalBatchSC: "Capacity Incremental Batch",
  StorageProofSC:             "Storage Proof",
  FileRegistrationSC:         "File Registration",
  StorageReceiptDispute:      "Storage Dispute",
  StorageRegistrationTimeout: "Storage Registration Timeout",
  GuardianShareProof:         "Guardian Share Proof",
  ZkDkgCoordinatorV2:         "ZK-DKG Coordinator",
  DkgAttemptController:       "DKG Attempt Controller",
  DkgAttemptRegistry:         "DKG Attempt Registry",
  DkgAttemptEscrow:           "DKG Attempt Escrow",
  DkgCommitmentBook:          "DKG Commitments",
  ZkDkgDisputeManager:        "ZK-DKG Dispute Mgr",
  TElGv2:                     "TElG v2",
  ReputationManager:          "Reputation Manager",
  StakingManager:             "Staking Manager",
  RewardManager:              "Reward Manager",
  GuardianWorkReward:         "Guardian Work Reward",
};

// A contract this deployment does not have is written as the zero address; it
// names nothing, so it is left out rather than labelling the zero address.
export const ADDRESS_TO_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(CONTRACTS)
    .filter(([, addr]) => !/^0x0{40}$/i.test(addr))
    .map(([name, addr]) => [
      addr.toLowerCase(),
      CONTRACT_LABELS[name as ContractName],
    ])
);
