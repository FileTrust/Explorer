#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, decodeEventLog, http, parseAbiItem, toEventHash } from 'viem';
import { logIdentity, mergeById, mergeRecent, planResume, readPreviousIndex } from './index_resume.mjs';
import {
  catchUpInternalTransfers, internalTracingWanted, storeConfigured, storeResumeBlock, writeRunToStore,
} from './index_store.mjs';
import { createInternalTracer } from './trace_internal.mjs';
import { artifactEvents } from './contract_events.mjs';
import { recoveryEventSources } from './recovery_event_sources.mjs';
import { closeDb } from '../src/lib/db/postgres.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const explorerRoot = path.resolve(__dirname, '..');

// Read the same .env.local the Explorer reads.
//
// Next loads it; a bare `node scripts/indexer.mjs` does not, so the two used to
// disagree about which deployment they were looking at. The Explorer followed
// DEPLOYED_ADDRESSES_PATH to the Cosmos workspace while the indexer fell through
// to the hardhat default below, and wrote an index whose addresses matched
// nothing the screens ask for. The Explorer then correctly refused the whole
// index as belonging to another deployment and fell back to its bounded window,
// so the symptom was not an error but a chain-length worth of history quietly
// going missing.
//
// Anything already set in the environment wins, so an explicit
// `FILETRUST_CHAIN=cosmos npm run index` still overrides the file.
const envLocal = path.join(explorerRoot, '.env.local');
if (existsSync(envLocal)) {
  process.loadEnvFile(envLocal);
}

// Which chain's deployment to index. The two chains write their addresses to
// different workspaces and, indexed against the wrong one, every address misses and
// the run produces an empty index rather than an error. Mirrors update_configs.py's
// --chain, so `FILETRUST_CHAIN=cosmos npm run index` matches
// `run_filetrust_stack.py --chain cosmos`.
const CHAIN_WORKSPACES = {
  hardhat: 'Blockchain',
  cosmos: path.join('Blockchain 2', 'filetrust', 'evm'),
  evm: 'Blockchain',
};
const chain = process.env.FILETRUST_CHAIN || 'hardhat';
if (!(chain in CHAIN_WORKSPACES)) {
  throw new Error(
    `FILETRUST_CHAIN must be one of ${Object.keys(CHAIN_WORKSPACES).join(', ')}, got ${chain}`,
  );
}

const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545';
const deployedPath = process.env.DEPLOYED_ADDRESSES_PATH
  || path.join(explorerRoot, 'deployed_addresses.json');
const outDir = process.env.INDEX_OUT_DIR || path.join(explorerRoot, 'public', 'index');
const chunkSize = BigInt(process.env.INDEX_LOG_CHUNK || '2000');
const recentBlockLimit = Number(process.env.INDEX_RECENT_BLOCKS || '0');
// How many recent blocks and transactions the index keeps for the activity
// lists. Bounded so the files do not grow without limit as the chain ages.
const retainBlocks = Number(process.env.INDEX_RETAIN_BLOCKS || '1000');
const retainTransactions = Number(process.env.INDEX_RETAIN_TRANSACTIONS || '5000');

const labels = {
  GuardianRegistry: 'Guardian Registry',
  VaultKeeperRegistry: 'VaultKeeper Registry',
  VKEscrow: 'VK Escrow',
  AccessControlFT: 'Access Control',
  DataVault: 'Data Vault',
  CapacityProofSC: 'Capacity Proof',
  PartitionSnapshotProofSC: 'Partition Snapshot Proof',
  StorageProofSC: 'Storage Proof',
  FileRegistrationSC: 'File Registration',
  StorageReceiptDispute: 'Storage Dispute',
  StorageRegistrationTimeout: 'Storage Registration Timeout',
  GuardianShareProof: 'Guardian Share Proof',
  ZkDkgCoordinatorV2: 'ZK-DKG Coordinator',
  ZkDkgDisputeManager: 'ZK-DKG Dispute Manager',
  TElGv2: 'TElG v2',
  ReputationManager: 'Reputation Manager',
  StakingManager: 'Staking Manager',
  RewardManager: 'Reward Manager',
  GuardianWorkReward: 'Guardian Work Reward',
  CapacityCertificationSC: 'Capacity Certification',
  CapacityIncrementalBatchSC: 'Capacity Incremental Batch',
  DeletionReleaseSC: 'Deletion Release',
  FileTrustTimelock: 'Governance Timelock',
};

const eventSources = {
  FileRegistrationSC: [
    'event FileStorageRegistered(bytes32 indexed commitmentHash, bytes32 indexed sectorRoot, address indexed vkAddress, uint8 deadlineIndex, uint8 partitionIndex, uint64 serviceEnd)',
    'event PartitionLinked(bytes32 indexed commitmentHash, bytes32 indexed sectorRoot)',
    'event FileStoragePartitionMigrated(bytes32 indexed commitmentHash, bytes32 indexed sectorRoot, address indexed vkAddress, uint8 oldDeadlineIndex, uint8 oldPartitionIndex, uint8 newDeadlineIndex, uint8 newPartitionIndex)',
    'event PartitionMigrationConfirmed(bytes32 indexed commitmentHash, bytes32 indexed sectorRoot, address indexed vkAddress, uint8 oldDeadlineIndex, uint8 oldPartitionIndex, uint8 newDeadlineIndex, uint8 newPartitionIndex)',
    'event FileDeletionDeclared(bytes32 indexed commitmentHash, address indexed vkAddress, uint64 graceSeconds, uint64 declaredAt)',
    'event FileDeletionConfirmed(bytes32 indexed commitmentHash, address indexed vkAddress)',
  ],
  StorageProofSC: [
    'event SectorRegistered(bytes32 indexed sectorKey, address indexed vk, bytes32 indexed sectorId, bytes32 sectorRoot, uint64 expiration, uint32 sectorBlockCount, uint16 challengeCount)',
    'event SectorUpdated(bytes32 indexed sectorKey, address indexed vk, bytes32 indexed sectorId, bytes32 oldSectorRoot, bytes32 newSectorRoot, uint64 expiration, uint32 sectorBlockCount, uint16 challengeCount)',
    'event SectorStatusChanged(bytes32 indexed sectorKey, address indexed vk, bool active)',
    'event ChallengeOpened(bytes32 indexed sectorKey, address indexed vk, bytes32 indexed sectorId, uint64 round, bytes32 seed, uint64 deadline)',
    'event SectorProofSubmitted(bytes32 indexed sectorKey, address indexed vk, bytes32 indexed sectorId, uint64 round, bytes32 sectorRoot, bytes32 seed)',
    'event SectorProofMissed(bytes32 indexed sectorKey, address indexed vk, bytes32 indexed sectorId, uint64 round)',
    'event PartitionRegistered(bytes32 indexed partitionKey, address indexed vk, uint8 deadlineIndex, uint8 partitionIndex, uint8 partitionKind, uint256 sectorCount, uint64 committedBytes, uint64 expiration)',
    'event PartitionUpdated(bytes32 indexed partitionKey, address indexed vk, uint8 partitionKind, uint256 sectorCount, uint64 committedBytes)',
    'event PartitionContentVersionUpdated(bytes32 indexed partitionKey, address indexed vk, uint64 contentVersion, bytes32 contentHash)',
    'event PartitionDeactivated(bytes32 indexed partitionKey, address indexed vk, uint8 partitionKind)',
    'event PartitionChallengeOpened(bytes32 indexed partitionKey, address indexed vk, uint64 round, bytes32 seed, uint64 deadline)',
    'event PartitionProofSubmitted(bytes32 indexed partitionKey, address indexed vk, uint64 round, bytes32 seed)',
    'event PartitionProofSubmittedDeterministic(bytes32 indexed partitionKey, address indexed vk, uint64 round, bytes32 detSeed)',
    'event WrongProofAttempted(address indexed vk, uint32 attempts, uint64 timestamp)',
  ],
  CapacityProofSC: [
    'event VaultKeeperRegistrySet(address indexed registry)',
    'event StorageProofSet(address indexed storageProof)',
    'event FileRegistrationSet(address indexed fileRegistration)',
    'event PartitionSnapshotProofSet(address indexed partitionSnapshotProof)',
    'event MaxProofAgeSecondsSet(uint64 seconds_)',
    'event MaxQuoteReservationSecondsSet(uint64 seconds_)',
    'event MaxActiveTransferSecondsSet(uint64 seconds_)',
    'event MaxManifestOverheadBytesSet(uint64 bytes_)',
    'event CapacityDeclared(address indexed vk, uint64 totalCapacityBytes)',
    'event QuoteReserved(bytes32 indexed registrationCommitment, address indexed vk, uint64 reservedBytes, uint64 expiresAt)',
    'event QuoteReservationStateChanged(bytes32 indexed registrationCommitment, address indexed vk, uint8 oldState, uint8 newState, uint64 reservedBytes)',
    'event PartitionCapacityRegistered(bytes32 indexed partitionKey, address indexed vk, uint8 kind, uint64 contentVersion, bytes32 contentHash, uint64 registeredBytes, bool active)',
    'event PartitionCapacityProven(bytes32 indexed partitionKey, address indexed vk, uint8 kind, uint64 contentVersion, bytes32 contentHash, uint64 provedBytes, uint64 proofSequence)',
    'event ProofEpochStarted(address indexed vk, uint64 indexed epochId, uint64 targetRound, uint64 cutoffNonce, uint32 expectedPartitions, uint64 expectedBytes)',
    'event ProofEpochCompleted(address indexed vk, uint64 indexed epochId, uint64 targetRound, uint64 proofSequence, uint64 backedBytes)',
    'event ProofEpochAborted(address indexed vk, uint64 indexed epochId, uint64 targetRound)',
    'event ProofEpochCutoffMemberExcluded(address indexed vk, uint64 indexed epochId, bytes32 partitionKey, uint64 contentVersion, uint64 excludedBytes)',
  ],
  PartitionSnapshotProofSC: [
    'event VaultKeeperRegistrySet(address indexed registry)',
    'event PartitionVerifierSet(address indexed verifier)',
    'event CapacityProofSet(address indexed capacityProof)',
    'event PartitionSnapshotFrozen(bytes32 indexed partitionKey, address indexed vk, uint64 indexed contentVersion, bytes32 contentHash, uint64 proofEpochId, uint64 round, uint64 freezeBlock, uint64 deadline)',
    'event PartitionSnapshotSealed(bytes32 indexed partitionKey, uint64 indexed contentVersion, uint64 proofEpochId, uint64 round, bytes32 challengeAnchor, bytes32 seed)',
    'event PartitionSnapshotReanchored(bytes32 indexed partitionKey, uint64 indexed contentVersion, uint64 proofEpochId, uint64 round, uint64 freezeBlock)',
    'event PartitionSnapshotInvalidated(bytes32 indexed partitionKey, uint64 indexed contentVersion, bytes32 reason)',
    'event FrozenPartitionProofSubmitted(bytes32 indexed partitionKey, address indexed vk, uint64 indexed contentVersion, uint64 proofEpochId, uint64 round, bytes32 contentHash, bool acceptedAsCurrent)',
    'event FrozenPartitionProofAlreadyAccepted(bytes32 indexed partitionKey, uint64 indexed contentVersion, uint64 proofEpochId, uint64 round, bytes32 contentHash)',
  ],
  StorageRegistrationTimeout: [
    'event RegistrationTimeoutResolved(bytes32 indexed timeoutId, address indexed vk, bytes32 indexed paymentCommitment, bytes32 registrationCommitment, bytes32 commitmentHash, bool registeredLate, address doAddress)',
  ],
  GuardianRegistry: [
    'event GuardianRegistered(address indexed guardian, string metadataURI, uint256 stake, uint64 registeredAt)',
    'event GuardianUpdated(address indexed guardian, string metadataURI)',
    'event GuardianStatusChanged(address indexed guardian, bool active)',
    'event GuardianHeartbeat(address indexed guardian, uint64 timestamp)',
    'event GuardianStakeDeposited(address indexed guardian, uint256 amount, uint256 totalStake)',
    'event GuardianStakeWithdrawn(address indexed guardian, uint256 amount, uint256 remainingStake)',
    'event GuardianStakeSlashed(address indexed guardian, uint256 amount, uint256 remainingStake, address indexed recipient)',
    'event ReputationUpdated(address indexed guardian, uint32 reputationScore, uint32 completedJobs, uint32 failedJobs, uint32 disputes)',
  ],
  VaultKeeperRegistry: [
    'event VaultKeeperRegistered(address indexed vkAddress, uint256 storageFee, uint256 stake, uint64 registeredAt)',
    'event VaultKeeperUpdated(address indexed vkAddress, uint256 storageFee, uint256 stake)',
    'event VaultKeeperStatusChanged(address indexed vkAddress, bool active)',
    'event VaultKeeperHeartbeat(address indexed vkAddress, uint256 timestamp)',
    'event VaultKeeperSuspended(address indexed vkAddress, uint64 suspendedUntil)',
    'event VKLatestServiceEndUpdated(address indexed vk, uint64 serviceEnd)',
  ],
  DataVault: [
    'event BatchCreated(bytes32 indexed fileId, uint256 indexed batchId, address indexed dataOwner, string dataId, uint8 n, uint8 t, uint32 keyEpoch)',
    'event EncCidAdded(bytes32 indexed fileId, uint256 indexed batchId, uint256 index, string cid)',
    'event EncCidAddedV2(bytes32 indexed fileId, uint256 indexed batchId, uint256 index, string cid)',
    'event EncCidsBatchAdded(bytes32 indexed fileId, uint256 indexed batchId, uint256 count)',
    'event DataAccessRequestedV2(uint256 indexed requestId, bytes32 indexed fileId, address indexed requester, uint256 batchId, string dataId, uint32 keyEpoch, uint32 shareVersion, uint256[] indices)',
    'event ReencryptedCidsStored(uint256 indexed requestId, bytes32 indexed fileId, address indexed requester, string[] cids)',
    'event ReusableRequestCached(uint256 indexed requestId, bytes32 indexed fileId, address indexed requester)',
  ],
  AccessControlFT: [
    'event FilePolicyCreated(bytes32 indexed fileId, address indexed dataOwner, uint8 threshold, uint256 guardianCount)',
    'event FilePolicyUpdated(bytes32 indexed fileId, address indexed dataOwner, uint8 threshold, uint256 guardianCount)',
    'event FilePolicyStatusChanged(bytes32 indexed fileId, bool active)',
    'event FilePolicyModeSet(bytes32 indexed fileId, uint8 mode)',
    'event RequesterAddedToFile(bytes32 indexed fileId, address indexed requester)',
    'event RequesterRemovedFromFile(bytes32 indexed fileId, address indexed requester)',
    'event KeyGenRequestedForFile(bytes32 indexed fileId, address indexed dataOwner)',
    'event KeyGenRequestForFileCleared(bytes32 indexed fileId, address indexed dataOwner)',
    'event KeyGenRequestForFileExpired(bytes32 indexed fileId, address indexed dataOwner)',
    'event ReencRequestedForFile(bytes32 indexed fileId, address indexed requester)',
    'event ReencRequestForFileCleared(bytes32 indexed fileId, address indexed requester)',
  ],
  ZkDkgCoordinatorV2: [
    'event ZkDkgV2DealerMaterialAccepted(bytes32 indexed fileId, uint32 indexed keyEpoch, address indexed dealer, uint8 n, uint8 t)',
    'event ZkDkgV2Finalized(bytes32 indexed fileId, uint32 indexed keyEpoch, address indexed dataOwner, uint8 n, uint8 t, uint32 shareVersion, uint256 publicKeyX, uint256 publicKeyY)',
    'event V2DealerCommitmentsPublished(bytes32 indexed fileId, uint32 indexed keyEpoch, address indexed dealer)',
    'event V2EncryptedSharePublished(bytes32 indexed fileId, uint32 indexed keyEpoch, address indexed dealer, address guardian)',
    'event DkgKeyGenExpired(bytes32 indexed fileId, uint32 indexed keyEpoch, uint8 nonParticipantCount)',
    'event ZkDkgV2SamePkRefreshRequested(bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, uint8 newN, uint8 newT)',
    'event ZkDkgV2SamePkRefreshFinalized(bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, uint8 newN, uint8 newT)',
    'event V2RefreshExpired(bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, uint8 absentCount)',
  ],
  ZkDkgDisputeManager: [
    'event ZkDkgEncryptedShareDisputeOpened(bytes32 indexed disputeId, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 shareVersion, bool isRefresh, address receiver, address dealer, uint8 receiverIndex, uint8 dealerIndex, uint64 deadline)',
    'event ZkDkgEncryptedShareDisputeJustified(bytes32 indexed disputeId, address indexed dealer, address indexed receiver)',
    'event ZkDkgEncryptedShareDisputeExpired(bytes32 indexed disputeId, address indexed dealer, address indexed receiver)',
    'event ZkDkgDealerExcluded(bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, bool isRefresh, address dealer, uint8 dealerIndex)',
  ],
  TElGv2: [
    'event V2AccessPartialSubmitted(uint256 indexed requestId, bytes32 indexed fileId, address indexed guardian, uint8 shareIndex)',
    'event V2BatchAccessPartialSubmitted(uint256 indexed requestId, bytes32 indexed fileId, address indexed guardian, uint256 count)',
    'event PreReadyDeclared(uint256 indexed requestId, bytes32 indexed fileId, address indexed guardian)',
    'event PreBadPartialDetected(uint256 indexed requestId, bytes32 indexed fileId, address indexed guardian, uint8 shareIndex)',
    'event PreRequestExpired(uint256 indexed requestId, bytes32 indexed fileId, address indexed requester, uint8 absentCount)',
  ],
  GuardianShareProof: [
    'event GuardianPublicShareRegistered(address indexed guardian, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 shareVersion)',
    'event ShareProofSubmitted(address indexed guardian, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 shareVersion)',
    'event ShareProofMissed(address indexed guardian, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 shareVersion)',
  ],
  StorageReceiptDispute: [
    'event DisputeSubmitted(bytes32 indexed disputeId, address indexed vk, uint8 deadlineIndex, uint8 partitionIndex, bytes32 partitionRoot)',
    'event DisputeValid(bytes32 indexed disputeId, address indexed vk, string reason)',
    'event DisputeInvalid(bytes32 indexed disputeId, address indexed vk, string reason)',
    'event W6EnforcementApplied(bytes32 indexed disputeId, address indexed vk, uint8 violationLevel, uint256 stakeSlashed, uint32 reputationPenalty, uint32 totalValidDisputes, uint64 suspendedUntil, bool permanentlyRemoved)',
    'event VKSuspendedByDispute(address indexed vk, uint64 suspendedUntil, uint32 totalValidDisputes)',
    'event VKPermanentlyRemovedByDispute(address indexed vk, uint32 totalValidDisputes)',
    'event SectorRiskNotice(address indexed vk, bytes32 indexed sectorRoot, string reason, uint256 commitmentCount)',
    'event DeletionDisputeSubmitted(bytes32 indexed delDisputeId, address indexed vk, bytes32 indexed commitmentHash)',
    'event DeletionDisputeValid(bytes32 indexed delDisputeId, address indexed vk, bytes32 commitmentHash, string reason)',
    'event DeletionDisputeInvalid(bytes32 indexed delDisputeId, address indexed vk, string reason)',
    'event DeletionEnforcementApplied(bytes32 indexed delDisputeId, address indexed vk, uint256 stakeSlashed, uint32 repPenalty, uint32 totalDeletionDisputes)',
  ],
  ReputationManager: [
    'event DkgSuccessRecorded(address indexed guardian, uint32 completedDKG, uint32 reputationScore, uint256 speedScore, uint64 timestamp)',
    'event DkgFailureRecorded(address indexed guardian, uint32 failedDKG, uint32 reputationScore, uint32 penaltyPoints, uint8 reasonCode, uint64 timestamp)',
    'event DkgFailureWarned(address indexed guardian, uint32 failedDKG, uint8 reasonCode, uint64 timestamp)',
    'event PreSuccessRecorded(address indexed guardian, uint32 completedPRE, uint32 reputationScore, uint256 speedScore, uint64 timestamp)',
    'event PreFailureRecorded(address indexed guardian, uint32 failedPRE, uint32 reputationScore, uint32 penaltyPoints, uint8 reasonCode, uint64 timestamp)',
    'event DkgComplaintSubmitted(address indexed guardian, address indexed reporter, uint8 reasonCode, uint32 dkgComplaints, uint32 penaltyPoints, uint64 timestamp)',
    'event PreComplaintSubmitted(address indexed guardian, address indexed reporter, uint8 reasonCode, uint32 preComplaints, uint32 penaltyPoints, uint64 timestamp)',
    'event ShareProofSuccessRecorded(address indexed guardian, uint32 reputationScore, uint64 timestamp)',
    'event ShareProofMissedRecorded(address indexed guardian, uint32 missedShareProofs, uint32 reputationScore, uint32 penaltyPoints, uint64 timestamp)',
    'event ShareProofMissedWarned(address indexed guardian, uint32 missedShareProofs, uint64 timestamp)',
    'event VKProofSuccessRecorded(address indexed vk, uint32 reputationScore, uint64 timestamp)',
    'event VKProofMissedRecorded(address indexed vk, uint32 missedProofs, uint32 reputationScore, uint32 penaltyPoints, uint64 timestamp)',
    'event VKProofMissedWarned(address indexed vk, uint32 missedProofs, uint64 timestamp)',
    'event VKDisputePenaltyRecorded(address indexed vk, uint8 violationLevel, uint32 repPenalty, uint32 disputeComplaints, uint32 reputationScore, uint64 timestamp)',
    'event SeriousPenaltyTriggered(address indexed guardian, uint32 penaltyPoints, uint32 dkgComplaints, uint32 preComplaints, uint64 timestamp)',
    'event VKSeriousPenaltyTriggered(address indexed vk, uint32 penaltyPoints, uint64 timestamp)',
  ],
  StakingManager: [
    'event StakeDeposited(address indexed guardian, uint256 amount, uint256 totalStake)',
    'event StakeWithdrawn(address indexed guardian, uint256 amount, uint256 remainingStake)',
    'event StakeLocked(address indexed guardian, uint256 amount, uint256 lockedStake)',
    'event StakeUnlocked(address indexed guardian, uint256 amount, uint256 lockedStake)',
    'event StakeSlashed(address indexed guardian, uint256 amount, uint256 remainingStake, address indexed treasury)',
  ],
  RewardManager: [
    'event PolicyEscrowDeposited(bytes32 indexed fileId, address indexed payer, uint256 amountWei, uint256 balanceWei)',
    'event AccessEscrowDeposited(uint256 indexed requestId, bytes32 indexed fileId, address indexed requester, uint256 amountWei, uint256 balanceWei)',
    'event GuardianRewardCredited(address indexed guardian, uint256 amountWei)',
    'event GuardianMeasuredRewardCredited(address indexed guardian, uint256 amountWei)',
    'event GuardianAccessRewardCredited(address indexed guardian, uint256 indexed requestId, uint256 amountWei)',
    'event GuardianMeasuredAccessRewardCredited(address indexed guardian, uint256 indexed requestId, uint256 amountWei)',
    'event RewardsClaimed(address indexed guardian, uint256 amountWei)',
    'event GuardianJoinRewarded(address indexed guardian, uint256 amount)',
    'event GuardianShareProofRewarded(address indexed guardian, uint256 amount)',
    'event VKJoinRewarded(address indexed vk, uint256 amount)',
    'event VKProofRewarded(address indexed vk, uint256 amount)',
    'event VKFileRewarded(address indexed vk, uint256 amount)',
    'event VKCapacityRewarded(address indexed vk, uint256 provenBytes, uint256 amount)',
    'event VKCapacityRewardSet(uint256 perGbWei, uint256 capWei)',
    'event JoinRewardPoolDeposited(address indexed sender, uint256 amount, uint256 balance)',
    'event ProofRewardPoolDeposited(address indexed sender, uint256 amount, uint256 balance)',
    'event VKJoinRewardPoolDeposited(address indexed sender, uint256 amount, uint256 balance)',
    'event VKProofRewardPoolDeposited(address indexed sender, uint256 amount, uint256 balance)',
    'event VKFileRewardPoolDeposited(address indexed sender, uint256 amount, uint256 balance)',
    'event VKCapacityRewardPoolDeposited(address indexed sender, uint256 amount, uint256 balance)',
  ],
  // The early-network pool that pays Guardians for each finished DKG, each used PRE
  // part and each PRE ready-but-not-used. Its own contract, beside RewardManager.
  GuardianWorkReward: [
    'event GuardianRewarded(address indexed guardian, uint8 indexed kind, uint256 amount)',
    'event PoolDeposited(address indexed sender, uint256 amount, uint256 balance)',
    'event RewardsSet(uint256 dkgWei, uint256 preWei, uint256 preReadyWei, uint256 capWei)',
    'event CallerAuthorized(address indexed caller, bool authorized)',
  ],
  VKEscrow: [
    'event EscrowDeposited(bytes32 indexed paymentCommitment, bytes32 sizeCommitment, bytes32 linkCommitment, uint256 amount, uint64 serviceEnd, address depositor)',
    'event EscrowClaimed(bytes32 indexed paymentCommitment, address indexed recipient, uint256 amount, uint256 totalClaimed)',
    'event EscrowReclaimed(bytes32 indexed paymentCommitment, address indexed depositor, uint256 amount)',
    'event EscrowRefundedByDispute(bytes32 indexed paymentCommitment, address indexed depositor, uint256 amount)',
    'event EscrowClaimedOnDeletion(bytes32 indexed paymentCommitment, address indexed recipient, uint256 vkAmount, uint256 doRefund, uint64 confirmedAt)',
  ],
  // Four contracts that emit events and were never watched.
  //
  // Not a deliberate exclusion -- a gap. Between them they emit twenty-eight
  // event types: what capacity was certified and when it expires, how an
  // incremental batch opened and which partitions it accepted, every step of a
  // deletion from creation to confirmation, and every governance action the
  // timelock schedules or executes. All of it happened on chain and none of it
  // reached the index, so the screens fed by it had nothing to show and no way
  // to say why.
  //
  // (The libraries and the sixty-two ZK verifiers stay out on purpose: they
  // declare no events at all, so watching them would cost a log query per pass
  // to find nothing, for ever.)
  CapacityCertificationSC: [
    'event CapacityProofBound(address indexed capacityProof)',
    'event PartitionCertificationInvalidated(bytes32 indexed partitionKey, address indexed vk)',
    'event PartitionCertified(bytes32 indexed partitionKey, address indexed vk, uint8 kind, uint64 certifiedBytes, uint64 expirySlot, bytes32 identityHash)',
  ],
  CapacityIncrementalBatchSC: [
    'event CapacityCampaignClaimed(address indexed vk, uint8 kind, uint64 authorityId)',
    'event CapacityCampaignReleased(address indexed vk, uint8 kind, uint64 authorityId)',
    'event FullSweepCampaignClaimed(address indexed vk, uint64 indexed authorityId, uint8 mode)',
    'event IncrementalBatchAbandoned(address indexed vk, uint64 indexed batchId, uint8 reason, uint32 acceptedPartitions)',
    'event IncrementalBatchAborted(address indexed vk, uint64 indexed batchId, uint32 acceptedPartitions)',
    'event IncrementalBatchCompleted(address indexed vk, uint64 indexed batchId, uint32 acceptedPartitions, uint64 acceptedBytes)',
    'event IncrementalBatchOpened(address indexed vk, uint64 indexed batchId, uint64 targetRound, uint64 cutoffNonce, uint32 selectedPartitions, uint64 selectedBytes)',
    'event IncrementalMemberAccepted(uint64 indexed batchId, bytes32 indexed partitionKey, bytes32 identityHash)',
    'event IncrementalMemberSelected(uint64 indexed batchId, bytes32 indexed partitionKey, bytes32 identityHash, uint64 committedBytes)',
    'event SnapshotProofBound(address indexed snapshotProof)',
  ],
  DeletionReleaseSC: [
    'event ActiveReceiptAccepted(bytes32 indexed operationId, uint64 indexed revision, uint64 indexed proofAuthorityId, uint64 frozenSnapshotNonce, uint64 acceptedBlock)',
    'event EmptyTransitionReceiptAccepted(bytes32 indexed operationId, uint64 indexed revision, uint64 transitionNonce, uint64 acceptedBlock)',
    'event OperationConfirmed(bytes32 indexed operationId, bytes32 indexed partitionKey)',
    'event OperationCreated(bytes32 indexed operationId, bytes32 indexed partitionKey, address indexed vk, bytes32 fileCommitment, bytes32 pieceCommitment, uint64 fifoGeneration)',
    'event RecoveryQuarantineChanged(bytes32 indexed operationId, bool required, uint8 reason)',
    'event SuccessorResolved(bytes32 indexed operationId, uint64 indexed revision, bytes32 indexed partitionKey, uint8 route, uint64 contentVersion, bytes32 contentHash, uint64 registrationNonce, uint64 transitionNonce)',
    'event SuccessorSuperseded(bytes32 indexed operationId, uint64 indexed previousRevision, uint64 indexed newRevision, bytes32 previousIdentityHash, bytes32 newIdentityHash)',
  ],
  FileTrustTimelock: [
    'event CallExecuted(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data)',
    'event CallSalt(bytes32 indexed id, bytes32 salt)',
    'event CallScheduled(bytes32 indexed id, uint256 indexed index, address target, uint256 value, bytes data, bytes32 predecessor, uint256 delay)',
    'event Cancelled(bytes32 indexed id)',
    'event MinDelayChange(uint256 oldDuration, uint256 newDuration)',
    'event RoleAdminChanged(bytes32 indexed role, bytes32 indexed previousAdminRole, bytes32 indexed newAdminRole)',
    'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
    'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
  ],
};

const client = createPublicClient({ transport: http(rpcUrl, { timeout: 30_000 }) });

function stringify(value) {
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === 'bigint') return item.toString();
    return item;
  }, 2);
}

for(const [name,events] of Object.entries(recoveryEventSources)) {
  eventSources[name]=[...(eventSources[name]??[]),...events];
}

function asAddress(value) {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) ? value : null;
}

/**
 * What each watched contract's events look like, and how to decode them.
 *
 * `eventSources` decides *which* contracts are watched. What their events are
 * comes from the artifacts they were compiled into, because a signature is part
 * of the contract and the copy of it kept here drifts. A drifted copy still
 * parses and still hashes to a topic; it just hashes to a topic the chain never
 * emits, so every log from that contract is one this indexer does not recognise
 * and quietly skips.
 *
 * That had happened to more than half of them. Against a running chain the
 * written-out signatures decoded 576 of 1,074 logs, and seven contracts decoded
 * none of theirs at all -- the data vault among them, which is why the access
 * screens showed nothing while the chain held a request, a batch and six stored
 * CIDs. From the artifacts the same chain decodes all 1,074.
 *
 * The written-out signatures stay as the fallback, for an Explorer running
 * somewhere the chain repository is not.
 */
function buildDecoders(contracts, deployedPath) {
  const byTopic = new Map();
  const contractEventNames = new Map();
  const fellBack = [];

  const add = (contractName, address, item) => {
    try {
      byTopic.set(toEventHash(item), { contractName, address, item });
      contractEventNames.get(address.toLowerCase()).add(item.name);
    } catch {
      // An item viem cannot hash is one no log can match; nothing to record.
    }
  };

  for (const [contractName, sources] of Object.entries(eventSources)) {
    const address = asAddress(contracts[contractName]);
    if (!address) continue;

    contractEventNames.set(address.toLowerCase(), new Set());

    const compiled = artifactEvents(deployedPath, contractName);
    if (compiled) {
      for (const item of compiled) add(contractName, address, item);
      continue;
    }

    fellBack.push(contractName);
    for (const source of sources) {
      try {
        add(contractName, address, parseAbiItem(source));
      } catch {
        console.warn(`Skipping invalid event ABI for ${contractName}: ${source}`);
      }
    }
  }

  if (fellBack.length > 0) {
    // Named rather than passed over: this is the state in which a screen can go
    // empty without anything having gone wrong on the chain.
    console.warn(
      `  no compiled artifacts for ${fellBack.length} contract(s), using the ` +
      `signatures written into this script: ${fellBack.join(', ')}`,
    );
  }

  return { byTopic, contractEventNames };
}

function normalizeArgs(args) {
  if (!args) return {};
  if (Array.isArray(args)) {
    return Object.fromEntries(args.map((value, index) => [String(index), value]));
  }
  return args;
}

function applyEntityEvent(entities, event) {
  const a = event.args || {};
  const txHash = event.transactionHash;
  const blockNumber = event.blockNumber;

  if (event.name === 'FileStorageRegistered') {
    entities.files[a.commitmentHash] = {
      commitmentHash: a.commitmentHash,
      sectorRoot: a.sectorRoot,
      vkAddress: a.vkAddress,
      deadlineIndex: a.deadlineIndex,
      partitionIndex: a.partitionIndex,
      serviceEnd: a.serviceEnd,
      status: 'active',
      blockNumber,
      txHash,
    };
  }
  if (event.name === 'FileDeletionDeclared' && entities.files[a.commitmentHash]) {
    entities.files[a.commitmentHash].status = 'deletion_declared';
    entities.files[a.commitmentHash].deletionDeclaredTx = txHash;
  }
  if (event.name === 'FileDeletionConfirmed' && entities.files[a.commitmentHash]) {
    entities.files[a.commitmentHash].status = 'deleted';
    entities.files[a.commitmentHash].deletionConfirmedTx = txHash;
  }
  if (event.name === 'PartitionLinked' && entities.files[a.commitmentHash]) {
    entities.files[a.commitmentHash].partitionLinked = true;
  }

  if (event.name === 'SectorRegistered') {
    entities.sectors[a.sectorKey] = {
      sectorKey: a.sectorKey,
      sectorId: a.sectorId,
      sectorRoot: a.sectorRoot,
      vk: a.vk,
      expiration: a.expiration,
      sectorBlockCount: a.sectorBlockCount,
      challengeCount: a.challengeCount,
      active: true,
      blockNumber,
      txHash,
    };
  }
  if (event.name === 'SectorStatusChanged' && entities.sectors[a.sectorKey]) {
    entities.sectors[a.sectorKey].active = a.active;
  }

  if (event.name === 'PartitionRegistered') {
    entities.partitions[a.partitionKey] = {
      partitionKey: a.partitionKey,
      vk: a.vk,
      deadlineIndex: a.deadlineIndex,
      partitionIndex: a.partitionIndex,
      partitionKind: a.partitionKind,
      committedBytes: a.committedBytes,
      sectorCount: a.sectorCount,
      expiration: a.expiration,
      active: true,
      blockNumber,
      txHash,
    };
  }
  if (event.name === 'PartitionUpdated' && entities.partitions[a.partitionKey]) {
    entities.partitions[a.partitionKey].partitionKind = a.partitionKind;
    entities.partitions[a.partitionKey].committedBytes = a.committedBytes;
    entities.partitions[a.partitionKey].sectorCount = a.sectorCount;
    entities.partitions[a.partitionKey].updatedBlockNumber = blockNumber;
    entities.partitions[a.partitionKey].updatedTxHash = txHash;
  }
  if (event.name === 'PartitionContentVersionUpdated' && entities.partitions[a.partitionKey]) {
    entities.partitions[a.partitionKey].contentVersion = a.contentVersion;
    entities.partitions[a.partitionKey].contentHash = a.contentHash;
    entities.partitions[a.partitionKey].updatedBlockNumber = blockNumber;
    entities.partitions[a.partitionKey].updatedTxHash = txHash;
  }
  if (event.name === 'PartitionDeactivated' && entities.partitions[a.partitionKey]) {
    entities.partitions[a.partitionKey].active = false;
    entities.partitions[a.partitionKey].partitionKind = a.partitionKind;
    entities.partitions[a.partitionKey].sectorCount = 0n;
    entities.partitions[a.partitionKey].committedBytes = 0n;
    entities.partitions[a.partitionKey].updatedBlockNumber = blockNumber;
    entities.partitions[a.partitionKey].updatedTxHash = txHash;
  }

  if (event.name === 'GuardianRegistered') {
    entities.guardians[a.guardian] = {
      address: a.guardian,
      metadataURI: a.metadataURI,
      stake: a.stake,
      registeredAt: a.registeredAt,
      active: true,
      blockNumber,
      txHash,
    };
  }
  if (event.name === 'GuardianStatusChanged' && entities.guardians[a.guardian]) {
    entities.guardians[a.guardian].active = a.active;
  }
  if (event.name === 'GuardianHeartbeat' && entities.guardians[a.guardian]) {
    entities.guardians[a.guardian].lastHeartbeat = a.timestamp;
  }
  if (event.name === 'ReputationUpdated' && entities.guardians[a.guardian]) {
    entities.guardians[a.guardian].reputationScore = a.reputationScore;
    entities.guardians[a.guardian].completedJobs = a.completedJobs;
    entities.guardians[a.guardian].failedJobs = a.failedJobs;
    entities.guardians[a.guardian].disputes = a.disputes;
  }

  // The registry emits CapacityDeclared / VaultKeeperHeartbeat for VKs that joined via
  // the capacity path; VaultKeeperRegistered is not emitted there. Create the entity from
  // whichever event is seen first so the Explorer lists every live VK.
  const ensureVK = (addr) => {
    if (!addr) return null;
    if (!entities.vaultKeepers[addr]) {
      entities.vaultKeepers[addr] = { address: addr, active: true };
    }
    return entities.vaultKeepers[addr];
  };
  if (event.name === 'CapacityDeclared') {
    const vk = ensureVK(a.vk || a.vkAddress);
    if (vk) vk.declaredCapacityBytes = a.totalCapacityBytes;
  }
  if (event.name === 'VaultKeeperHeartbeat') ensureVK(a.vkAddress);
  if (event.name === 'CapacityProofAccepted' || event.name === 'PartitionRegistered') {
    ensureVK(a.vk || a.vkAddress);
  }

  if (event.name === 'VaultKeeperRegistered') {
    entities.vaultKeepers[a.vkAddress] = {
      address: a.vkAddress,
      storageFee: a.storageFee,
      stake: a.stake,
      registeredAt: a.registeredAt,
      active: true,
      blockNumber,
      txHash,
    };
  }
  if (event.name === 'VaultKeeperStatusChanged' && entities.vaultKeepers[a.vkAddress]) {
    entities.vaultKeepers[a.vkAddress].active = a.active;
  }
  if (event.name === 'VaultKeeperHeartbeat' && entities.vaultKeepers[a.vkAddress]) {
    entities.vaultKeepers[a.vkAddress].lastHeartbeat = a.timestamp;
  }
  if (event.name === 'VaultKeeperSuspended' && entities.vaultKeepers[a.vkAddress]) {
    entities.vaultKeepers[a.vkAddress].suspendedUntil = a.suspendedUntil;
  }

  if (event.name === 'ZkDkgV2Finalized' || event.name === 'ZkDkgV2SamePkRefreshFinalized' || event.name === 'DkgKeyGenExpired' || event.name === 'V2RefreshExpired') {
    const id = a.materialId ?? `${a.fileId}:${a.keyEpoch}:${a.shareVersion ?? 'fresh'}`;
    entities.dkgSessions[id] = {
      id,
      fileId: a.fileId,
      materialId: a.materialId,
      keyEpoch: a.keyEpoch,
      shareVersion: a.shareVersion,
      event: event.name,
      status: event.name.includes('Expired') ? 'expired' : 'finalized',
      blockNumber,
      txHash,
    };
  }
  if(event.name==='AttemptClosed' && a.fileId && [5,6].includes(Number(a.outcome))) {
    const id=a.materialId;
    entities.dkgSessions[id]={id,materialId:id,fileId:a.fileId,keyEpoch:a.epoch,shareVersion:a.version,
      event:event.name,status:Number(a.outcome)===5?'cancelled':'unactivated',blockNumber,txHash};
  }

  if (event.name === 'DataAccessRequestedV2') {
    entities.accessRequests[String(a.requestId)] = {
      requestId: a.requestId,
      fileId: a.fileId,
      requester: a.requester,
      batchId: a.batchId,
      dataId: a.dataId,
      keyEpoch: a.keyEpoch,
      shareVersion: a.shareVersion,
      fulfilled: false,
      blockNumber,
      txHash,
    };
  }
  if (event.name === 'ReencryptedCidsStored' && entities.accessRequests[String(a.requestId)]) {
    entities.accessRequests[String(a.requestId)].fulfilled = true;
    entities.accessRequests[String(a.requestId)].fulfilledTx = txHash;
  }
}

async function getLogsChunked(addresses, fromBlock, toBlock) {
  const logs = [];
  let cursor = fromBlock;
  while (cursor <= toBlock) {
    const end = cursor + chunkSize - 1n > toBlock ? toBlock : cursor + chunkSize - 1n;
    const chunk = await client.getLogs({ address: addresses, fromBlock: cursor, toBlock: end });
    logs.push(...chunk);
    console.log(`  logs ${cursor}-${end}: ${chunk.length}`);
    cursor = end + 1n;
  }
  return logs;
}

async function main() {
  const deployed = JSON.parse(await readFile(deployedPath, 'utf8'));
  const contracts = deployed.contracts || {};
  const knownContracts = Object.entries(contracts)
    .filter(([_name, address]) => asAddress(address))
    .map(([name, address]) => ({
      name,
      label: labels[name] || name,
      address,
    }));
  const indexedAddresses = knownContracts
    .filter(contract => eventSources[contract.name])
    .map(contract => contract.address);
  const addressToContract = Object.fromEntries(knownContracts.map(c => [c.address.toLowerCase(), c]));
  const { byTopic } = buildDecoders(contracts, deployedPath);
  const decoderHash = createHash('sha256')
    .update(JSON.stringify([...byTopic].map(([topic, decoder]) => [topic, decoder.item])))
    .digest('hex');

  if (process.env.INDEX_DRY_RUN === '1') {
    console.log(`FileTrust indexer dry run`);
    console.log(`  deployment: ${deployedPath}`);
    console.log(`  known contracts: ${knownContracts.length}`);
    console.log(`  indexed contracts: ${indexedAddresses.length}`);
    console.log(`  event decoders: ${byTopic.size}`);
    return;
  }

  const chainId = await client.getChainId();
  const latest = await client.getBlockNumber();

  // Where to start reading events.
  //
  // Re-reading from block zero on every run is what makes an index stop being
  // possible: a one-second chain produces about 31 million blocks a year, so
  // the work grows without limit and eventually exceeds any run window. An
  // index only has to look at what it has not seen, so a previous run's
  // end block is the natural starting point.
  //
  // A full rebuild is still available with INDEX_FROM_BLOCK, and is required
  // when the chain underneath has changed -- a different chain id, or a chain
  // that has moved backwards -- because the stored events then describe
  // something else.
  const previous = await readPreviousIndex(outDir);
  const plan = planResume({
    manifest: previous.manifest,
    latest,
    explicitFrom: process.env.INDEX_FROM_BLOCK ? BigInt(process.env.INDEX_FROM_BLOCK) : null,
    chainId,
    decoderHash,
    contracts: knownContracts,
  });
  const { resumable, reason } = plan;
  let { fromBlock } = plan;
  console.log(resumable
    ? `  ${reason}: continuing after block ${previous.manifest.toBlock} (${previous.events.length} events kept)`
    : `  building the index from scratch (${reason})`);

  // The store may be behind the files: see storeResumeBlock. Read again from
  // where it really stopped, so a pass that could not write it loses nothing.
  if (resumable && !process.env.INDEX_FROM_BLOCK) {
    const storeFrom = await storeResumeBlock({ chainId, contracts: knownContracts, filesFrom: fromBlock })
      .catch(() => null);
    if (storeFrom !== null) {
      console.log(`  the store stopped at block ${storeFrom - 1n}, behind the files; reading again from block ${storeFrom}`);
      fromBlock = storeFrom;
    }
  }
  let toBlock = process.env.INDEX_TO_BLOCK ? BigInt(process.env.INDEX_TO_BLOCK) : latest;
  if (recentBlockLimit > 0 && latest + 1n > BigInt(recentBlockLimit)) {
    toBlock = latest;
  }

  const blockStart = recentBlockLimit > 0 && toBlock + 1n > BigInt(recentBlockLimit)
    ? toBlock - BigInt(recentBlockLimit) + 1n
    : fromBlock;

  console.log(`FileTrust indexer`);
  console.log(`  RPC: ${rpcUrl}`);
  console.log(`  chainId: ${chainId}`);
  console.log(`  blocks: ${blockStart}-${toBlock}`);
  console.log(`  event logs: ${fromBlock}-${toBlock}`);
  console.log(`  contracts: ${indexedAddresses.length}`);

  // FTU paid by contracts inside these transactions, read from the node's call
  // trace while each block is in hand. One more request per block that holds
  // transactions -- the receipts already cost the same -- and none for the
  // blocks that hold none.
  const tracer = (await internalTracingWanted()) ? createInternalTracer(client) : null;
  const internal = tracer
    ? { rows: [], gaps: [], traced: [], fromBlock: blockStart, toBlock, mode: tracer.mode, supported: true }
    : null;

  const blocks = [];
  const transactions = [];
  for (let n = toBlock; n >= blockStart; n -= 1n) {
    const block = await client.getBlock({ blockNumber: n, includeTransactions: true });
    // The Cosmos chain has no block 0 and answers a request for it with block 1,
    // which is read again in its own turn. Taken twice, its row and its
    // transactions arrived twice in one write, and the store refused the batch.
    if (block.number !== n) continue;
    blocks.push({
      number: block.number,
      hash: block.hash,
      parentHash: block.parentHash,
      timestamp: block.timestamp,
      miner: block.miner,
      gasUsed: block.gasUsed,
      gasLimit: block.gasLimit,
      transactionCount: block.transactions.length,
      // For the block screens; null on a chain without EIP-1559.
      baseFeePerGas: block.baseFeePerGas ?? null,
      size: block.size,
    });
    // Receipts for the whole block in one call, rather than one call per
    // transaction. They carry the two things the block does not -- whether the
    // call succeeded and what it actually spent -- and without them the
    // transaction page has to ask the chain, which puts every reader's page load
    // on the RPC endpoint the network itself depends on.
    //
    // Best effort: a node that does not implement `eth_getBlockReceipts` leaves
    // the columns null, and the page falls back to the chain for those rows
    // exactly as it did before.
    const receipts = block.transactions.length === 0 ? new Map() : await client
      .request({ method: 'eth_getBlockReceipts', params: [`0x${n.toString(16)}`] })
      .then((list) => new Map((list ?? []).map((r) => [
        String(r.transactionHash).toLowerCase(),
        { status: Number(r.status === '0x1' || r.status === 1), gasUsed: BigInt(r.gasUsed ?? 0) },
      ])))
      .catch(() => new Map());

    for (const tx of block.transactions) {
      const receipt = receipts.get(String(tx.hash).toLowerCase());
      transactions.push({
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        blockHash: tx.blockHash,
        status: receipt?.status,
        gasUsed: receipt?.gasUsed,
        // Kept on the transaction rather than looked up in the block later.
        // Transactions are retained five deep for every block retained, so most
        // of them outlive the block they came from, and the list showed a dash
        // where the time should be for every transaction older than the block
        // window. The value is free here -- it is the block being read.
        blockTimestamp: block.timestamp,
        transactionIndex: tx.transactionIndex,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        gas: tx.gas,
        gasPrice: tx.gasPrice,
        input: tx.input,
      });
    }

    if (internal && block.transactions.length > 0) {
      const traced = await tracer.traceBlock(n, block.timestamp, block.transactions);
      if (traced.ok) {
        internal.rows.push(...traced.rows);
        internal.traced.push(n);
      } else if (!traced.unsupported) {
        internal.gaps.push({ blockNumber: n, reason: traced.reason });
      }
    }
  }

  const rawLogs = indexedAddresses.length > 0
    ? await getLogsChunked(indexedAddresses, fromBlock, toBlock)
    : [];

  const logs = [];
  const filetrustEvents = [];
  const entities = {
    files: {},
    sectors: {},
    partitions: {},
    guardians: {},
    vaultKeepers: {},
    dkgSessions: {},
    accessRequests: {},
  };

  for (const log of rawLogs.sort((a, b) => {
    if ((a.blockNumber ?? 0n) === (b.blockNumber ?? 0n)) return Number((a.logIndex ?? 0) - (b.logIndex ?? 0));
    return (a.blockNumber ?? 0n) > (b.blockNumber ?? 0n) ? 1 : -1;
  })) {
    const contract = addressToContract[log.address.toLowerCase()];
    const topic0 = log.topics[0];
    const decoder = topic0 ? byTopic.get(topic0) : undefined;
    const base = {
      address: log.address,
      contractName: contract?.name,
      contractLabel: contract?.label,
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      transactionIndex: log.transactionIndex,
      logIndex: log.logIndex,
      topics: log.topics,
      data: log.data,
    };
    logs.push(base);

    if (!decoder) continue;
    try {
      const decoded = decodeEventLog({
        abi: [decoder.item],
        data: log.data,
        topics: log.topics,
        strict: false,
      });
      const event = {
        ...base,
        name: decoded.eventName,
        args: normalizeArgs(decoded.args),
      };
      filetrustEvents.push(event);
      applyEntityEvent(entities, event);
    } catch (err) {
      filetrustEvents.push({
        ...base,
        name: decoder.item.name,
        decodeError: String(err?.message || err),
      });
    }
  }

  // Carry forward everything an earlier run indexed. Without this a resumed run
  // would publish only the newest blocks and the index would appear to lose its
  // history every time it caught up.
  const mergedEvents = resumable
    ? mergeById(previous.events, filetrustEvents, logIdentity)
    : filetrustEvents;
  const mergedLogs = resumable ? mergeById(previous.logs, logs, logIdentity) : logs;
  // Blocks and transactions back the "latest activity" lists, so they are
  // carried forward and capped rather than replaced. Without this a resumed run
  // publishes only the blocks it just read, and the page drops from hundreds of
  // transactions to none.
  //
  // The cap applies to a rebuild too. It used to be skipped there, on the
  // reasoning that there was nothing to carry forward -- but the cap is not
  // about carrying forward, it is what stops these files growing with the chain.
  // A full rebuild wrote every block it had ever seen: 17,565 of them, 6.2 MB,
  // to fill a table showing twenty-five. mergeRecent against an empty previous
  // also gives the rebuild the same newest-first order a resume produces, which
  // is the order the screens slice from.
  const mergedBlocks = mergeRecent(
    resumable ? (previous.blocks ?? []) : [], blocks, (b) => String(b.number), retainBlocks,
  );
  const mergedTransactions = mergeRecent(
    resumable ? (previous.transactions ?? []) : [], transactions, (t) => String(t.hash), retainTransactions,
  );

  const manifest = {
    generatedAt: new Date().toISOString(),
    chainId,
    decoderHash,
    // Where the index as a whole begins, not where this run happened to start,
    // so the next run resumes from the right place and a reader can tell what
    // the index actually covers.
    fromBlock: resumable ? BigInt(previous.manifest.fromBlock ?? 0) : fromBlock,
    scannedFrom: fromBlock,
    toBlock,
    blockStart,
    latestBlock: latest,
    counts: {
      blocks: mergedBlocks.length,
      transactions: mergedTransactions.length,
      logs: mergedLogs.length,
      filetrustEvents: mergedEvents.length,
      files: Object.keys(entities.files).length,
      sectors: Object.keys(entities.sectors).length,
      partitions: Object.keys(entities.partitions).length,
      guardians: Object.keys(entities.guardians).length,
      vaultKeepers: Object.keys(entities.vaultKeepers).length,
      dkgSessions: Object.keys(entities.dkgSessions).length,
      accessRequests: Object.keys(entities.accessRequests).length,
    },
    contracts: knownContracts,
  };

  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(path.join(outDir, 'manifest.json'), stringify(manifest)),
    writeFile(path.join(outDir, 'blocks.json'), stringify(mergedBlocks)),
    writeFile(path.join(outDir, 'transactions.json'), stringify(mergedTransactions)),
    writeFile(path.join(outDir, 'logs.json'), stringify(mergedLogs)),
    writeFile(path.join(outDir, 'filetrust-events.json'), stringify(mergedEvents)),
    writeFile(path.join(outDir, 'entities.json'), stringify({
      ...entities,
      files: Object.values(entities.files),
      sectors: Object.values(entities.sectors),
      partitions: Object.values(entities.partitions),
      guardians: Object.values(entities.guardians),
      vaultKeepers: Object.values(entities.vaultKeepers),
      dkgSessions: Object.values(entities.dkgSessions),
      accessRequests: Object.values(entities.accessRequests),
    })),
  ]);

  console.log(`  wrote ${outDir}`);
  console.log(`  ${manifest.counts.blocks} blocks, ${manifest.counts.transactions} txs, ${manifest.counts.filetrustEvents} decoded FileTrust events`);

  // And into the database, when one is configured.
  //
  // Both are written during the changeover, on purpose: the files keep the
  // Explorer working while the store is filling, and having the same run in both
  // is what makes the two answers comparable before anything is switched over.
  // The files stop being written once the API reads from the store.
  if (await storeConfigured()) {
    const result = await writeRunToStore({
      client,
      chainId,
      contracts: knownContracts,
      // Addresses come from the deployment; the function ABIs the entity
      // projection needs come from the compiled artifacts beside it -- whichever
      // chain's workspace this run actually deployed to, not always Hardhat's.
      blockchainRoot: process.env.EXPLORER_BLOCKCHAIN_ROOT || path.join(repoRoot, CHAIN_WORKSPACES[chain]),
      fullProjection: !resumable,
      allEvents: mergedEvents,
      newEvents: filetrustEvents,
      // The range those events are the *complete* contents of. The scan read
      // every log from every indexed contract between these blocks, so the store
      // can clear exactly this much and rewrite it without losing anything --
      // which is what lets a replay be safe instead of additive.
      logsFrom: fromBlock,
      logsTo: toBlock,
      // Every block and transaction this run read, not the capped lists the
      // files keep for the latest-activity tables. The store is the full
      // history: given the capped lists, a rebuild left it holding the newest
      // 1,000 blocks and 5,000 transactions, so an older block's page and a
      // wallet's "full history" were missing everything before them.
      blocks,
      transactions,
      counts: manifest.counts,
      lastBlock: toBlock,
      internal: internal && {
        ...internal,
        mode: tracer.mode,
        // A node that cannot trace at all says so on the first block that holds
        // a transaction; nothing was traced, and the screen says why.
        supported: tracer.mode !== 'none',
      },
    });
    console.log(
      `  store (${result.mode}): +${result.eventsWritten} events, ` +
      `+${result.blocksWritten} blocks, +${result.txWritten} txs`,
    );
    if (internal) {
      const gaps = internal.gaps.length ? `, ${internal.gaps.length} blocks to retry` : '';
      console.log(tracer.mode === 'none'
        ? '  contract payments: this node cannot trace calls (debug API off?)'
        : `  contract payments (${tracer.mode} traces): +${result.internalWritten ?? 0}${gaps}`);
      if (tracer.mode !== 'none' && result.mode !== 'skipped') {
        // Older blocks are extra work for this pass, never a reason to fail it.
        try {
          const caught = await catchUpInternalTransfers(tracer);
          if (caught && (caught.traced || caught.failed)) {
            console.log(`  contract payments, older blocks: ${caught.traced} traced, +${caught.written}` +
              (caught.failed ? `, ${caught.failed} to retry` : ''));
          }
        } catch (error) {
          console.log(`  contract payments, older blocks: skipped this pass (${error?.message ?? error})`);
        }
      }
    }
    const e = result.entities;
    if (e?.error) console.log(`  entities: not projected (${e.error})`);
    else if (e?.skipped) console.log(`  entities: skipped (${e.skipped})`);
    else if (Array.isArray(e)) {
      for (const r of e) {
        // A rollup has no "read" count: it is summed from the log rather than
        // read back from the chain, so saying "from undefined read" described a
        // number that does not exist.
        console.log(r.skipped ? `  entities ${r.kind}: skipped (${r.skipped})`
          : r.read === undefined ? `  rollup ${r.kind}: ${r.written} rows ${r.mode}`
          : `  entities ${r.kind}: ${r.written} refreshed from ${r.read} read` +
            (r.deferred ? `; ${r.deferred} incomplete reads retained for retry` : ''));
      }
    }
    await closeDb();
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
