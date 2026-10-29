// Generated from the compiled Cosmos recovery-v1 artifacts.
export const recoveryEventSources = {
  "ZkDkgCoordinatorV2": [
    "event AttemptClosed(bytes32 indexed materialId, bytes32 indexed fileId, uint32 epoch, uint32 version, uint8 outcome, uint8 faults)",
    "event AttemptControllerSet(address indexed controller)",
    "event DisputeManagerSet(address indexed disputeManager)",
    "event DkgKeyGenDeadlineSet(uint64 duration)",
    "event DkgKeyGenExpired(bytes32 materialId, bytes32 indexed fileId, uint32 indexed keyEpoch, uint8 nonParticipantCount)",
    "event GuardianShareProofSet(address indexed guardianShareProof)",
    "event GuardianWorkRewardSet(address indexed reward)",
    "event MaxInactivitySecondsSet(uint256 maxInactivitySeconds)",
    "event RefreshMaterialsReady(bytes32 indexed materialId, bytes32 indexed fileId, uint32 epoch, uint32 version, uint32 contributors)",
    "event ReputationManagerSet(address indexed manager)",
    "event RewardManagerSet(address indexed manager)",
    "event StakingManagerSet(address indexed manager)",
    "event V2DealerCommitmentsPublished(bytes32 materialId, bytes32 indexed fileId, uint256 indexed keyEpoch, uint256 indexed shareVersion, uint256 dealerIndex, address dealer)",
    "event V2EncryptedSharePublished(bytes32 materialId, bytes32 indexed fileId, uint256 indexed keyEpoch, uint256 indexed shareVersion, uint256 fromIndex, uint256 toIndex, address dealer, address recipient)",
    "event V2RefreshAbsentPenalized(bytes32 materialId, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, uint8 absentCount)",
    "event V2RefreshExpired(bytes32 materialId, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, uint8 absentCount)",
    "event ZkDkgV2DealerMaterialAccepted(bytes32 materialId, bytes32 indexed fileId, uint32 indexed keyEpoch, address indexed dealer, uint8 dealerIndex)",
    "event ZkDkgV2Finalized(bytes32 materialId, bytes32 indexed fileId, address indexed dataOwner, uint32 indexed keyEpoch, uint32 shareVersion, uint8 t, uint8 n, uint256 publicKeyX, uint256 publicKeyY)",
    "event ZkDkgV2SamePkRefreshFinalized(bytes32 materialId, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, uint8 newT, uint8 newN)",
    "event ZkDkgV2SamePkRefreshRequested(bytes32 materialId, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, uint32 oldShareVersion, uint8 oldT, uint8 oldN, uint8 newT, uint8 newN)"
  ],
  "ZkDkgDisputeManager": [
    "event DkgContractSet(address indexed dkg)",
    "event ReputationManagerSet(address indexed manager)",
    "event RewardManagerSet(address indexed manager)",
    "event StakingManagerSet(address indexed manager)",
    "event ZkDkgBabyJubjubMaterialPublished(bytes32 materialId, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, bool isRefresh, address dealer, uint8 dealerIndex, bytes32 commitmentHash, bytes32 encryptedShareHash)",
    "event ZkDkgCoordinatorV2Set(address indexed coordinator)",
    "event ZkDkgDealerExcluded(bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 indexed shareVersion, bool isRefresh, address dealer, uint8 dealerIndex)",
    "event ZkDkgDisputePeriodSet(uint64 period)",
    "event ZkDkgEncryptedShareDisputeExpired(bytes32 indexed disputeId, address indexed dealer, address indexed receiver)",
    "event ZkDkgEncryptedShareDisputeJustified(bytes32 indexed disputeId, address indexed dealer, address indexed receiver)",
    "event ZkDkgEncryptedShareDisputeOpened(bytes32 indexed disputeId, bytes32 indexed fileId, uint32 indexed keyEpoch, uint32 shareVersion, bool isRefresh, address receiver, address dealer, uint8 receiverIndex, uint8 dealerIndex, uint64 deadline)",
    "event ZkDkgShareVerifierForCommitteeSet(uint8 indexed participantCount, uint8 indexed threshold, address indexed verifier)",
    "event ZkDkgShareVerifierForParticipantCountSet(uint8 indexed participantCount, address indexed verifier)",
    "event ZkDkgShareVerifierSet(address indexed verifier)"
  ],
  "DkgAttemptController": [
    "event AttemptAccounted(bytes32 indexed materialId, uint8 outcome, uint8 faults, uint256 compensation)",
    "event AttemptBound(bytes32 indexed materialId, bytes32 indexed registryId, bytes32 indexed fileId, bytes32 contextHash)",
    "event AttemptPrepared(bytes32 indexed materialId, bytes32 requestHash, address evidence)",
    "event MaterialStageReady(bytes32 indexed materialId, uint64 readyAt)",
    "event ReputationDeferred(bytes32 indexed materialId, address indexed guardian)"
  ],
  "DkgAttemptRegistry": [
    "event AttemptClosed(bytes32 indexed attemptId, uint8 outcome)",
    "event AttemptOpened(bytes32 indexed attemptId, bytes32 indexed fileId, address indexed dataOwner, uint64 sequence, bytes32 termsHash)",
    "event AttemptStarted(bytes32 indexed attemptId, uint64 workDeadline)",
    "event DutyAccepted(bytes32 indexed attemptId, address indexed guardian)",
    "event EIP712DomainChanged()"
  ],
  "DkgAttemptEscrow": [
    "event AttemptFunded(bytes32 indexed attemptId, address indexed dataOwner, bytes32 priceHash, uint256 amount)",
    "event AttemptRefunded(bytes32 indexed attemptId, address indexed dataOwner, uint256 amount)",
    "event BondReserved(bytes32 indexed attemptId, address indexed guardian, uint256 amount)",
    "event BondReturned(bytes32 indexed attemptId, address indexed guardian, uint256 amount)",
    "event Claimed(address indexed account, address indexed recipient, uint256 amount)",
    "event CompensationCredited(bytes32 indexed attemptId, address indexed guardian, address indexed dataOwner, uint256 amount)",
    "event WorkCredited(bytes32 indexed attemptId, address indexed guardian, uint8 action, uint256 amount)"
  ],
  "DkgCommitmentBook": []
};
