import { CONTRACTS } from '@/lib/addresses';
import { GuardianRegistryABI } from './GuardianRegistry';
import { VaultKeeperRegistryABI } from './VaultKeeperRegistry';
import { VKEscrowABI } from './VKEscrow';
import { DataVaultABI } from './DataVault';
import { StorageProofSCABI } from './StorageProofSC';
import { CapacityProofSCABI, CapacityProofSCEventABI } from './CapacityProofSC';
import { PartitionSnapshotProofSCABI } from './PartitionSnapshotProofSC';
import { CapacityCertificationSCABI } from './CapacityCertificationSC';
import { CapacityIncrementalBatchSCABI } from './CapacityIncrementalBatchSC';
import { FileRegistrationSCABI } from './FileRegistrationSC';
import { StorageReceiptDisputeABI } from './StorageReceiptDispute';
import { StorageRegistrationTimeoutABI } from './StorageRegistrationTimeout';
import { GuardianShareProofABI } from './GuardianShareProof';
import { ZkDkgCoordinatorV2ABI } from './ZkDkgCoordinatorV2';
import { ZkDkgDisputeManagerABI } from './ZkDkgDisputeManager';
import { TElGv2ABI } from './TElGv2';
import { ReputationManagerABI } from './ReputationManager';
import { StakingManagerABI } from './StakingManager';
import { RewardManagerABI } from './RewardManager';
import { GuardianWorkRewardABI } from './GuardianWorkReward';
import { DkgAttemptControllerRecoveryEventABI } from './recovery-v1/DkgAttemptController';
import { DkgAttemptRegistryRecoveryEventABI } from './recovery-v1/DkgAttemptRegistry';
import { DkgAttemptEscrowRecoveryEventABI } from './recovery-v1/DkgAttemptEscrow';
import { DkgCommitmentBookRecoveryEventABI } from './recovery-v1/DkgCommitmentBook';

export const ABI_REGISTRY: Array<{
  address: `0x${string}`;
  label: string;
  abi: readonly any[];
}> = [
  { address: CONTRACTS.GuardianRegistry,    label: 'Guardian Registry',    abi: GuardianRegistryABI },
  { address: CONTRACTS.VaultKeeperRegistry, label: 'VaultKeeper Registry', abi: VaultKeeperRegistryABI },
  { address: CONTRACTS.VKEscrow,            label: 'VK Escrow',            abi: VKEscrowABI },
  { address: CONTRACTS.DataVault,           label: 'Data Vault',           abi: DataVaultABI },
  { address: CONTRACTS.CapacityProofSC,     label: 'Capacity Proof',       abi: [...CapacityProofSCABI, ...CapacityProofSCEventABI] },
  { address: CONTRACTS.PartitionSnapshotProofSC, label: 'Partition Snapshot Proof', abi: PartitionSnapshotProofSCABI },
  { address: CONTRACTS.CapacityCertificationSC, label: 'Capacity Certification', abi: CapacityCertificationSCABI },
  { address: CONTRACTS.CapacityIncrementalBatchSC, label: 'Capacity Incremental Batch', abi: CapacityIncrementalBatchSCABI },
  { address: CONTRACTS.StorageProofSC,      label: 'Storage Proof',        abi: StorageProofSCABI },
  { address: CONTRACTS.FileRegistrationSC,  label: 'File Registration',    abi: FileRegistrationSCABI },
  { address: CONTRACTS.StorageReceiptDispute, label: 'Storage Dispute',    abi: StorageReceiptDisputeABI },
  { address: CONTRACTS.StorageRegistrationTimeout, label: 'Storage Registration Timeout', abi: StorageRegistrationTimeoutABI },
  { address: CONTRACTS.GuardianShareProof,  label: 'Guardian Share Proof', abi: GuardianShareProofABI },
  { address: CONTRACTS.ZkDkgCoordinatorV2,  label: 'ZK-DKG Coordinator',  abi: ZkDkgCoordinatorV2ABI },
  { address: CONTRACTS.DkgAttemptController,label:'DKG Attempt Controller',abi:DkgAttemptControllerRecoveryEventABI },
  { address: CONTRACTS.DkgAttemptRegistry,label:'DKG Attempt Registry',abi:DkgAttemptRegistryRecoveryEventABI },
  { address: CONTRACTS.DkgAttemptEscrow,label:'DKG Attempt Escrow',abi:DkgAttemptEscrowRecoveryEventABI },
  { address: CONTRACTS.DkgCommitmentBook,label:'DKG Commitments',abi:DkgCommitmentBookRecoveryEventABI },
  { address: CONTRACTS.ZkDkgDisputeManager, label: 'ZK-DKG Dispute Mgr', abi: ZkDkgDisputeManagerABI },
  { address: CONTRACTS.TElGv2,              label: 'TElG v2',              abi: TElGv2ABI },
  { address: CONTRACTS.ReputationManager,   label: 'Reputation Manager',   abi: ReputationManagerABI },
  { address: CONTRACTS.StakingManager,      label: 'Staking Manager',      abi: StakingManagerABI },
  { address: CONTRACTS.RewardManager,       label: 'Reward Manager',       abi: RewardManagerABI },
  { address: CONTRACTS.GuardianWorkReward,  label: 'Guardian Work Reward', abi: GuardianWorkRewardABI },
];

// A contract missing from this deployment has the zero address; it decodes nothing.
export const ADDRESS_TO_REGISTRY = new Map(
  ABI_REGISTRY
    .filter(r => !/^0x0{40}$/i.test(r.address))
    .map(r => [r.address.toLowerCase(), r])
);

/** Human-readable purpose derived from the first recognisable event in a tx */
export const EVENT_PURPOSE: Record<string, string> = {
  ZkDkgV2Finalized:                  'DKG — Key Generation Finalized',
  ZkDkgV2SamePkRefreshFinalized:     'DKG — Key Share Refresh Finalized',
  DkgKeyGenExpired:                  'DKG — Key Generation Expired',
  V2RefreshExpired:                  'DKG — Key Share Refresh Expired',
  ZkDkgV2DealerMaterialAccepted:     'DKG — Dealer Material Accepted',
  ZkDkgEncryptedShareDisputeOpened:  'DKG Dispute — Encrypted Share Dispute Opened',
  ZkDkgEncryptedShareDisputeJustified: 'DKG Dispute — Dealer Justified Share',
  ZkDkgEncryptedShareDisputeExpired: 'DKG Dispute — Dealer Failed Justification',
  ZkDkgDealerExcluded:               'DKG Dispute — Dealer Excluded',
  GuardianPublicShareRegistered:     'PRE — Re-encryption Key Registered',
  PolicyServicePeriodSet:            'PRE — Policy Service Period Set',
  ShareProofSubmitted:               'PRE — Guardian Share Proof Submitted',
  ShareProofMissed:                  'PRE — Guardian Share Proof Missed',
  PreReadyDeclared:                  'PRE — Guardian Declared Ready for Request',
  V2AccessPartialSubmitted:          'PRE — Re-encryption Partial Submitted',
  V2BatchAccessPartialSubmitted:     'PRE — Batch Re-encryption Partial Submitted',
  PreBadPartialDetected:             'PRE — Bad Partial Detected',
  PreRequestExpired:                 'PRE — Re-encryption Request Expired',
  FileStorageRegistered:             'File Storage — Registered',
  PartitionLinked:                   'File Storage — Partition Linked',
  FileDeletionDeclared:              'File Storage — Deletion Declared',
  FileDeletionConfirmed:             'File Storage — Deletion Confirmed',
  FileStoragePartitionMigrated:      'File Storage — Partition Migrated',
  BatchCreated:                      'Data Vault — Batch Created',
  EncCidAddedV2:                     'Data Vault — Encrypted CID Added',
  GuardianRegistered:                'Guardian — Registered',
  GuardianUpdated:                   'Guardian — Updated',
  GuardianStatusChanged:             'Guardian — Status Changed',
  GuardianHeartbeat:                 'Guardian — Heartbeat',
  GuardianStakeDeposited:            'Guardian — Stake Deposited',
  VaultKeeperRegistered:             'VaultKeeper — Registered',
  VaultKeeperUpdated:                'VaultKeeper — Updated',
  VaultKeeperStatusChanged:          'VaultKeeper — Status Changed',
  VaultKeeperHeartbeat:              'VaultKeeper — Heartbeat',
  VaultKeeperSuspended:              'VaultKeeper — Suspended',
  VaultKeeperCapacityUpdated:        'VaultKeeper — Capacity Updated',
  VKLatestServiceEndUpdated:         'VaultKeeper — Latest Service End Updated',
  EscrowDeposited:                   'VK Escrow — Deposited',
  EscrowClaimed:                     'VK Escrow — Claimed',
  EscrowClaimedOnDeletion:           'VK Escrow — Deletion Claim',
  EscrowReclaimed:                   'VK Escrow — Reclaimed',
  EscrowRefundedByDispute:           'VK Escrow — Dispute Refund',
  DisputeOpened:                     'Dispute — Opened',
  DisputeResolved:                   'Dispute — Resolved',
  DisputeExpired:                    'Dispute — Expired',
  StakeDeposited:                    'Staking — Deposit',
  StakeWithdrawn:                    'Staking — Withdrawal',
  StakeSlashed:                      'Staking — Slashed',
  StakeLocked:                       'Staking — Locked',
  StakeUnlocked:                     'Staking — Unlocked',
  PolicyEscrowDeposited:             'Reward — Policy Escrow Deposited',
  AccessEscrowDeposited:             'Reward — Access Escrow Deposited',
  AccessEscrowCompleted:             'Reward — Access Escrow Completed',
  AccessEscrowRefunded:              'Reward — Access Escrow Refunded',
  DkgSuccessRecorded:                'Reputation — DKG Success Recorded',
  DkgFailureRecorded:                'Reputation — DKG Failure Recorded',
  DkgComplaintSubmitted:             'Reputation — DKG Complaint Submitted',
  PreSuccessRecorded:                'Reputation — PRE Success Recorded',
  PreFailureRecorded:                'Reputation — PRE Failure Recorded',
  PreComplaintSubmitted:             'Reputation — PRE Complaint Submitted',
  ShareProofMissedRecorded:          'Reputation — Share Proof Missed Recorded',
  SectorRegistered:                  'Storage Proof — Sector Registered',
  SectorUpdated:                     'Storage Proof — Sector Updated',
  SectorProofSubmitted:              'Storage Proof — Sector Proof Submitted',
  SectorProofMissed:                 'Storage Proof — Sector Proof Missed',
  PartitionRegistered:               'Storage Proof — Partition Registered',
  PartitionUpdated:                  'Storage Proof — Partition Updated',
  PartitionChallengeOpened:          'Storage Proof — Partition Challenge Opened',
  PartitionProofSubmitted:           'Storage Proof — Partition Proof Submitted',
  PartitionProofSubmittedDeterministic: 'Storage Proof — Partition Proof Submitted',
  CapacityDeclared:                  'Capacity Proof — Capacity Declared',
  QuoteReserved:                     'Capacity Proof — Quote Reserved',
  QuoteReservationStateChanged:      'Capacity Proof — Reservation State Changed',
  PartitionCapacityRegistered:       'Capacity Proof — Partition Registered',
  PartitionCapacityProven:           'Capacity Proof — Partition Proven',
  ProofEpochStarted:                 'Capacity Proof — Epoch Started',
  ProofEpochCompleted:               'Capacity Proof — Epoch Completed',
  ProofEpochAborted:                 'Capacity Proof — Epoch Aborted',
  PartitionSnapshotFrozen:           'Capacity Proof — Snapshot Frozen',
  PartitionSnapshotSealed:           'Capacity Proof — Snapshot Sealed',
  PartitionSnapshotReanchored:       'Capacity Proof — Snapshot Re-anchored',
  PartitionSnapshotInvalidated:      'Capacity Proof — Snapshot Invalidated',
  FrozenPartitionProofSubmitted:     'Capacity Proof — Snapshot Proven',
  FrozenPartitionProofAlreadyAccepted: 'Capacity Proof — Snapshot Already Proven',
  RegistrationTimeoutResolved:       'Storage Registration — Timeout Resolved',
  ZkBlockSizeUpdated:                'Storage Proof — ZK Block Size Updated',
};
