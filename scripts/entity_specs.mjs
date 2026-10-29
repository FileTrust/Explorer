/// What each kind of entity is, as data rather than as another copy of the code.
///
/// The vault keeper projection was written by hand, and shipped two fields read
/// off the wrong struct -- both returning zero instead of failing, so two columns
/// silently went blank. Writing that same 120 lines again for guardians,
/// partitions, files and policies would be four more chances at the same
/// mistake, in four places to fix it.
///
/// So a spec says which contract lists the entities, which calls to make per
/// entity, and how to turn the answers into the row a screen reads. The engine
/// in project_entities.mjs does the batching, the dirty-set drain, the upsert
/// and the counter, once. Adding an entity type is data; the verifier covers
/// every spec without being told about it.
///
/// `map` receives the address and one named result per read, each already
/// unwrapped from viem's success/failure envelope and null when the call failed.
/// Positional fallbacks (`x?.name ?? x?.[3]`) are kept from the screens they came
/// from: a struct viem returns unnamed still answers by index, and losing a field
/// to a naming difference shows up as a zero rather than an error.

const num = (v, d = 0) => Number(v ?? d);
const big = (v) => BigInt(v ?? 0n);

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/// Whether a getter answered about a real entity.
///
/// These registries do not revert for an unknown address -- they return a struct
/// of zeros, which is truthy, so "did the call succeed" is not the same question
/// as "does this entity exist". Ten vault keepers were written into the guardian
/// table before this existed, every one of them reading `active: false` and
/// looking like a real record of a guardian that had done nothing.
/// `index` because viem decodes some structs as named objects and others as
/// plain arrays, depending on whether the ABI names its outputs. Checking only
/// the name reads undefined on a positional one, which falls through to the zero
/// address and rejects every row -- 129 partitions were read and none written
/// before this took the index too.
const registered = (struct, addressField, index) => {
  if (!struct) return false;
  const value = struct[addressField] ?? (index === undefined ? undefined : struct[index]);
  return String(value ?? ZERO_ADDRESS).toLowerCase() !== ZERO_ADDRESS;
};

export const ENTITY_SPECS = [
  {
    kind: 'vault_keeper',
    table: 'vault_keeper',
    /// The interface the screen reads this row as. The verifier parses it and
    /// checks every field is produced -- a projection that silently drops one is
    /// not a smaller answer, it is a screen that throws on the field it expected.
    profileType: { file: 'src/lib/hooks/useVaultKeepers.ts', name: 'VKProfile' },
    /// Events naming any of these are about this kind of entity.
    ///
    /// `vkAddress` is the same keeper under a different argument name, and
    /// leaving it out was not a small gap: the heartbeat is the event a keeper
    /// emits most often, and it names itself that way. So did the whole file
    /// deletion and partition migration family. A keeper whose only recent
    /// events were heartbeats was never marked as needing a re-read, and its row
    /// stopped moving -- while the chain had it open for admission with its
    /// reputation up, the screens went on showing closed at the score it
    /// registered with.
    subjectArgs: ['vk', 'vaultKeeper', 'vkAddress'],
    list: { contract: 'VaultKeeperRegistry', fn: 'getAllVaultKeepers' },
    reads: [
      { as: 'p', contract: 'VaultKeeperRegistry', fn: 'getVaultKeeper' },
      { as: 'registryRep', contract: 'VaultKeeperRegistry', fn: 'getVKReputation' },
      { as: 'stats', contract: 'ReputationManager', fn: 'getVKStats' },
      { as: 'capacity', contract: 'VaultKeeperRegistry', fn: 'getVaultKeeperCapacity' },
      { as: 'serviceEnd', contract: 'VaultKeeperRegistry', fn: 'latestServiceEnd' },
      { as: 'endpoint', contract: 'VaultKeeperRegistry', fn: 'getVaultKeeperEndpoint' },
      { as: 'available', contract: 'StakingManager', fn: 'availableStake' },
      { as: 'locked', contract: 'StakingManager', fn: 'lockedStakeOf' },
      { as: 'admission', contract: 'VaultKeeperRegistry', fn: 'getAdmissionStatus' },
      { as: 'admissionOpen', contract: 'VaultKeeperRegistry', fn: 'isAdmissionOpen' },
      // getAdmissionStatus carries no reason, so WHY a keeper admits nothing needs
      // its own read. Without it the table can only say "admitting nothing", which
      // reads the same for a keeper that is full and one that is mid-proof.
      { as: 'closureReason', contract: 'VaultKeeperRegistry', fn: 'admissionClosureReason' },
      // The storage screen read these five per keeper on its own, from the same
      // registry, for the same set of keepers. One projection now answers both
      // screens rather than each paying the round trips separately.
      { as: 'accounting', contract: 'CapacityProofSC', fn: 'capacityAccountingOf' },
      { as: 'epoch', contract: 'CapacityProofSC', fn: 'getActiveProofEpoch' },
      { as: 'checkpoint', contract: 'CapacityProofSC', fn: 'capacityCheckpointOf' },
    ],
    /// Absent, or a zero struct, means "not registered" -- no row, rather than a
    /// keeper with every field zero that reads as real.
    exists: ({ p }) => registered(p, 'vkAddress', 0),
    map: ({ address, p, registryRep, stats, capacity, serviceEnd, endpoint, available, locked,
      admission, admissionOpen, closureReason, accounting, epoch, checkpoint }) => {
      // "Could not read" and "read, and it is closed" are different answers. A
      // screen showing the first as the second reports a keeper refusing work
      // when the truth is that nobody asked it.
      const readable = admission !== null && admissionOpen !== null;
      const closed = readable ? Boolean(admission?.closed ?? admission?.[0] ?? false) : false;
      const open = readable ? Boolean(admissionOpen) : false;
      return {
        address,
        storageFee: p.storageFee,
        stake: p.stake,
        availableStake: big(available),
        lockedStake: big(locked),
        active: Boolean(p.active),
        registeredAt: big(p.registeredAt),
        lastHeartbeat: big(p.lastHeartbeat),
        suspendedUntil: big(p.suspendedUntil),
        maxServiceDays: num(p.maxServiceDays),
        reputation: num(stats?.reputationScore ?? stats?.[0] ?? registryRep),
        penaltyPoints: num(stats?.penaltyPoints ?? stats?.[1]),
        disputeComplaints: num(stats?.disputeComplaints ?? stats?.[2]),
        disputePenaltyPoints: num(stats?.disputePenaltyPoints ?? stats?.[3]),
        missedProofs: num(stats?.missedProofs ?? stats?.[4]),
        totalMissedPenalties: num(stats?.totalMissedPenalties ?? stats?.[5]),
        lastActivityAt: big(stats?.lastActivityAt ?? stats?.[6]),
        maxPieceSizeBytes: big(capacity),
        latestServiceEnd: big(serviceEnd),
        endpointHash: endpoint?.endpointHash ?? endpoint?.[0],
        endpointSeq: big(endpoint?.seq ?? endpoint?.[1]),
        endpointUpdatedAt: big(endpoint?.updatedAt ?? endpoint?.[2]),
        admissionOpen: open,
        admissionState: !readable ? 'unavailable' : closed ? 'capacity_closed' : open ? 'open' : 'ineligible',
        admissionReadAvailable: readable,
        admissionClosed: closed,
        admissionClosedAt: big(admission?.closedAt ?? admission?.[1]),
        reportedAdmissionFreeBytes: big(admission?.reportedFreeBytes ?? admission?.[2]),
        admissionClosureReason: num(closureReason),

        // Capacity accounting, for the storage screen. Positional throughout
        // because that is how the screen read it.
        capacity: {
          // Fail closed for reporting: a keeper whose status could not be read
          // stays in active proof coverage, so an RPC error cannot make fleet
          // health look better than it is.
          active: p === null ? true : Boolean(p.active ?? p[3]),
          declared: big(accounting[0]),
          registeredFree: big(accounting?.[1]),
          registeredData: big(accounting?.[2]),
          provedFree: big(accounting?.[3]),
          provedData: big(accounting?.[4]),
          quoteReserved: big(accounting?.[5]),
          allocatedStored: big(accounting?.[6]),
          conservativeFree: big(accounting?.[7]),
          latestCapacityProofAt: big(accounting?.[8]),
          proofFresh: Boolean(accounting?.[9]),
          checkpointFree: big(checkpoint?.[0]),
          checkpointData: big(checkpoint?.[1]),
          checkpointAllocated: big(checkpoint?.[2]),
          checkpointBacked: big(checkpoint?.[3]),
          epochExpectedPartitions: num(epoch?.[3]),
          epochProvenPartitions: num(epoch?.[4]),
          epochActive: Boolean(epoch?.[6]),
        },
      };
    },
    /// Lifted out of the JSON so the list can filter and sort without reading it.
    columns: {
      active: (r) => r.active,
      stake: (r) => String(r.stake),
      available_stake: (r) => String(r.availableStake),
      locked_stake: (r) => String(r.lockedStake),
      reputation: (r) => r.reputation,
      storage_fee: (r) => String(r.storageFee),
      admission_open: (r) => r.admissionOpen,
      reported_free_bytes: (r) => String(r.reportedAdmissionFreeBytes),
      missed_proofs: (r) => r.missedProofs,
      disputes: (r) => r.disputeComplaints,
    },
  },

  {
    kind: 'guardian',
    table: 'guardian',
    profileType: { file: 'src/lib/hooks/useGuardians.ts', name: 'GuardianProfile' },
    subjectArgs: ['guardian', 'dealer'],
    list: { contract: 'GuardianRegistry', fn: 'getAllGuardians' },
    reads: [
      { as: 'p', contract: 'GuardianRegistry', fn: 'getGuardian' },
      { as: 'service', contract: 'GuardianRegistry', fn: 'getGuardianServiceInfo' },
      { as: 'stats', contract: 'ReputationManager', fn: 'getGuardianStats' },
      { as: 'shareProofPenalties', contract: 'ReputationManager', fn: 'getTotalShareProofPenalties' },
      { as: 'available', contract: 'StakingManager', fn: 'availableStake' },
      { as: 'locked', contract: 'StakingManager', fn: 'lockedStakeOf' },
    ],
    exists: ({ p }) => registered(p, 'guardianAddress', 0),
    map: ({ address, p, service, stats, shareProofPenalties, available, locked }) => {
      const completedDKG = num(stats?.completedDKG ?? stats?.[1]);
      const failedDKG = num(stats?.failedDKG ?? stats?.[2]);
      const completedPRE = num(stats?.completedPRE ?? stats?.[3]);
      const failedPRE = num(stats?.failedPRE ?? stats?.[4]);
      const dkgComplaints = num(stats?.dkgComplaints ?? stats?.[5]);
      const preComplaints = num(stats?.preComplaints ?? stats?.[6]);
      return {
        address,
        stake: p.stake,
        availableStake: big(available),
        lockedStake: big(locked),
        reputationScore: num(stats?.reputationScore ?? stats?.[0] ?? p.reputationScore),
        // The `||` fallbacks are the screen's: a zero from the stats contract
        // means "no jobs recorded there", and the registry's own tally is the
        // better answer than a confident zero.
        completedJobs: completedDKG + completedPRE || num(p.completedJobs),
        failedJobs: failedDKG + failedPRE || num(p.failedJobs),
        disputes: dkgComplaints + preComplaints || num(p.disputes),
        completedDKG,
        failedDKG,
        completedPRE,
        failedPRE,
        dkgComplaints,
        preComplaints,
        penaltyPoints: num(stats?.penaltyPoints ?? stats?.[7]),
        readyButNotUsedPRE: num(stats?.readyButNotUsedPRE ?? stats?.[9]),
        missedShareProofPenalties: num(shareProofPenalties),
        lastActivityAt: big(stats?.lastActivityAt ?? stats?.[8]),
        active: Boolean(p.active),
        registeredAt: big(p.registeredAt),
        lastHeartbeat: big(p.lastHeartbeat),
        metadataURI: p.metadataURI ?? '',
        // getGuardianServiceInfo returns the service-unit rates. These were left
        // out of the first version of this spec, and the screen -- which reads
        // them without checking -- went blank rather than showing a gap.
        dkgMaterialSu: big(service?.dkgMaterialSu ?? service?.[0]),
        dkgShareKeySu: big(service?.dkgShareKeySu ?? service?.[1]),
        preBatchPartialSu: big(service?.preBatchPartialSu ?? service?.[2]),
        dailyShareCustodySu: big(service?.dailyShareCustodySu ?? service?.[3]),
        maxServiceDays: big(service?.maxServiceDays ?? service?.[4]),
      };
    },
    columns: {
      active: (r) => r.active,
      stake: (r) => String(r.stake),
      reputation: (r) => r.reputationScore,
      completed: (r) => r.completedJobs,
      failed: (r) => r.failedJobs,
      disputes: (r) => r.disputes,
    },
  },

  {
    kind: 'file_policy',
    table: 'file_policy',
    /// The map calls it fileId; the table column is still `address`, so the
    /// framework's one key column serves every kind.
    keyField: 'fileId',
    /// A fileId, not an address, so thirty-two bytes.
    keyBytes: 32,
    subjectArgs: ['fileId'],
    list: { contract: 'AccessControlFT', fn: 'getAllFileIds' },
    reads: [
      { as: 'p', contract: 'AccessControlFT', fn: 'getFilePolicy' },
      { as: 'mode', contract: 'AccessControlFT', fn: 'getFilePolicyMode' },
      { as: 'keyGenRequested', contract: 'AccessControlFT', fn: 'hasRequestedKeyGenForFile' },
      { as: 'keyGenRequestedAt', contract: 'AccessControlFT', fn: 'getKeyGenRequestedAtForFile' },
    ],
    /// `exists` is a field on the policy struct here rather than a non-zero
    /// address, because a file id that was never registered still returns a
    /// struct -- the same trap the registries set, wearing a different hat.
    exists: ({ p }) => Boolean(p) && Boolean(p.exists ?? p[0]),
    map: ({ address, p, mode, keyGenRequested, keyGenRequestedAt }) => ({
      fileId: address,
      exists: Boolean(p.exists ?? p[0]),
      active: Boolean(p.active ?? p[1]),
      dataOwner: p.dataOwner ?? p[2],
      threshold: num(p.threshold ?? p[3]),
      mode: num(mode) === 1 ? 'ZKDKG_V2' : 'LEGACY',
      selectedGuardians: p.selectedGuardians ?? p[4] ?? [],
      requesterCount: num(p.requesterCount ?? p[5]),
      keyGenRequested: Boolean(keyGenRequested),
      keyGenRequestedAt: big(keyGenRequestedAt),
      accessRequestCount: 0,
      updatedCount: 0,
    }),
    /// The block a policy was created in is the creating event's own block, so
    /// it can only come from the log. The table shows it as "Created".
    firstBlockOf: ['FilePolicyCreated'],
    columns: {
      active: (r) => r.active,
      threshold: (r) => r.threshold,
      mode: (r) => (r.mode === 'ZKDKG_V2' ? 1 : 0),
      requester_count: (r) => r.requesterCount,
      key_gen_requested: (r) => r.keyGenRequested,
    },
  },

  {
    kind: 'partition_record',
    table: 'partition_record',
    keyBytes: 32,
    keyField: 'partitionKey',
    subjectArgs: ['partitionKey'],
    /// Partitions are only listable through their keeper -- there is no global
    /// roll -- so the parents are read from the rows the keeper spec already
    /// produced. The framework reads a list per parent for this case.
    list: {
      contract: 'StorageProofSC',
      fn: 'getVkPartitionKeys',
      perParent: { table: 'vault_keeper' },
    },
    reads: [
      { as: 'p', contract: 'StorageProofSC', fn: 'partitions' },
      { as: 'status', contract: 'StorageProofSC', fn: 'getPartitionProofStatus' },
    ],
    /// Counted from the event log per partition, because these are things that
    /// happened rather than state the contract holds. Without them the row can
    /// back the counts on the screen but not the table beside them.
    tallyEvents: [
      'PartitionProofSubmitted', 'PartitionProofSubmittedDeterministic',
      'PartitionChallengeOpened',
    ],
    /// Two columns the table shows that the contract does not hold. The sector
    /// count lives only in the event that announced the partition, and an update
    /// supersedes the registration, so the newest of the two wins. The block is
    /// the registering event's own, which is why it can only come from the log.
    eventFacts: [
      { event: 'PartitionRegistered', arg: 'sectorCount', as: 'sectorCount' },
      { event: 'PartitionUpdated', arg: 'sectorCount', as: 'sectorCount' },
    ],
    firstBlockOf: ['PartitionRegistered'],
    /// A key never registered still returns a struct, with a zero vk.
    exists: ({ p }) => registered(p, 'vk', 0),
    map: ({ address, p, status }) => ({
      partitionKey: address,
      vk: p.vk ?? p[0],
      deadlineIndex: num(p.deadlineIndex ?? p[2]),
      partitionIndex: num(p.partitionIndex ?? p[3]),
      partitionKind: num(p.partitionKind ?? p[4]),
      committedBytes: big(p.committedBytes ?? p[5]),
      expiration: big(p.expiration ?? p[6]),
      // Active comes from the proof status rather than the struct: a partition
      // is deactivated through its own call, and the counts on screen are a set
      // difference between registrations and deactivations that no aggregate
      // over the event log can express.
      active: Boolean(status?.active ?? status?.[1] ?? false),
      lastProofRound: big(status?.lastProofRound ?? status?.[2]),
      registeredAt: big(status?.registeredAt ?? status?.[3]),
      submittedProofs: 0,
      openedChallenges: 0,
      // Filled from the event log below.
      sectorCount: 0,
      firstBlock: '0',
    }),
    /// Applied after the reads, once the tallies are in hand.
    withTallies: (row, t) => ({
      ...row,
      submittedProofs: (t.PartitionProofSubmitted ?? 0)
        + (t.PartitionProofSubmittedDeterministic ?? 0),
      openedChallenges: t.PartitionChallengeOpened ?? 0,
    }),
    columns: {
      vk: (r) => Buffer.from(String(r.vk).replace(/^0x/, ''), 'hex'),
      kind: (r) => r.partitionKind,
      active: (r) => r.active,
      registered_bytes: (r) => String(r.committedBytes),
      // Promoted so the deadlines screen is a GROUP BY rather than a replay of
      // the log in the browser. `deadline` is the deadline *index* the contract
      // uses and the screen shows as "DL0"; `expiration` is the timestamp.
      deadline: (r) => r.deadlineIndex,
      sector_count: (r) => String(r.sectorCount ?? 0),
      proofs: (r) => r.submittedProofs,
      challenges: (r) => r.openedChallenges,
      expiration: (r) => (Number(r.expiration) > 0
        ? new Date(Number(r.expiration) * 1000).toISOString()
        : null),
    },
  },

  {
    kind: 'sector_record',
    table: 'sector_record',
    keyBytes: 32,
    keyField: 'sectorKey',
    subjectArgs: ['sectorKey'],
    list: {
      contract: 'StorageProofSC',
      fn: 'getVkSectorKeys',
      perParent: { table: 'vault_keeper' },
    },
    reads: [
      { as: 'p', contract: 'StorageProofSC', fn: 'sectors' },
    ],
    /// What happened to each sector, counted from the log as it is for
    /// partitions. The sector list shows these per row, and the storage screen
    /// calls an active sector with a missed proof "faulted". Without them every
    /// sector read zero proofs once a store was configured.
    tallyEvents: ['SectorProofSubmitted', 'SectorProofMissed', 'ChallengeOpened'],
    firstBlockOf: ['SectorRegistered'],
    exists: ({ p }) => registered(p, 'vk', 0),
    map: ({ address, p }) => ({
      sectorKey: address,
      vk: p.vk ?? p[0],
      sectorId: p.sectorId ?? p[1],
      sectorRoot: p.sectorRoot ?? p[2],
      expiration: big(p.expiration ?? p[3]),
      registeredAt: big(p.registeredAt ?? p[4]),
      updatedAt: big(p.updatedAt ?? p[5]),
      lastProofRound: big(p.lastProofRound ?? p[6]),
      sectorBlockCount: num(p.sectorBlockCount ?? p[7]),
      challengeCount: num(p.challengeCount ?? p[8]),
      active: Boolean(p.active ?? p[9]),
      // Filled from the event log below.
      submittedProofs: 0,
      missedProofs: 0,
      openedChallenges: 0,
      firstBlock: '0',
    }),
    withTallies: (row, t) => ({
      ...row,
      submittedProofs: t.SectorProofSubmitted ?? 0,
      missedProofs: t.SectorProofMissed ?? 0,
      openedChallenges: t.ChallengeOpened ?? 0,
    }),
    columns: {
      vk: (r) => Buffer.from(String(r.vk).replace(/^0x/, ''), 'hex'),
      active: (r) => r.active,
      sector_blocks: (r) => r.sectorBlockCount,
      challenge_count: (r) => r.challengeCount,
      // Promoted so the storage screen's health counts are one grouped query.
      expiration: (r) => (Number(r.expiration) > 0
        ? new Date(Number(r.expiration) * 1000).toISOString()
        : null),
      submitted_proofs: (r) => r.submittedProofs,
      missed_proofs: (r) => r.missedProofs,
    },
  },
];

export function specFor(kind) {
  return ENTITY_SPECS.find((s) => s.kind === kind);
}
