/// What the dashboard calls FileTrust activity: which events, in which group,
/// and how one is described in a line.
///
/// One list for the feed and both charts, so they cannot disagree about what
/// counts. The feed used to read ten event types, and not the partition proofs
/// that are most of what a vault keeper does today, nor anything about PRE,
/// rewards or disputes.

import { formatFtu } from '@/lib/utils';

export type ActivityType =
  | 'file' | 'deletion' | 'escrow' | 'proof' | 'missed' | 'guardian' | 'vk'
  | 'dkg' | 'access' | 'pre' | 'reward' | 'dispute';

/// Chart labels, in the order the bars are drawn.
export const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  file: 'Files',
  deletion: 'Deletions',
  escrow: 'Escrow',
  proof: 'VK proofs',
  missed: 'Missed proofs',
  guardian: 'Guardians',
  vk: 'Vault Keepers',
  dkg: 'DKG',
  access: 'Access',
  pre: 'PRE',
  reward: 'Rewards',
  dispute: 'Disputes',
};

type Args = Record<string, unknown>;

interface ActivityKind {
  type: ActivityType;
  label: string;
  color: string;
  describe: (a: Args) => string;
}

const short = (value: unknown, n = 10) => {
  const text = String(value ?? '');
  return text.length > n + 2 ? `${text.slice(0, n)}…` : text || '—';
};

const ftu = (value: unknown) => {
  try {
    return formatFtu(BigInt(String(value ?? '0')), 6);
  } catch {
    return '—';
  }
};

export const ACTIVITY_KINDS: Record<string, ActivityKind> = {
  FileStorageRegistered: { type: 'file', label: 'Piece Registered', color: 'text-ft-blue', describe: a => `Piece ${short(a.commitmentHash, 12)} on VK ${short(a.vkAddress)}` },
  FilePolicyCreated: { type: 'file', label: 'File Policy Created', color: 'text-ft-blue', describe: a => `File ${short(a.fileId, 12)}, ${a.guardianCount ?? '?'} Guardians, threshold ${a.threshold ?? '?'}` },
  FileDeletionDeclared: { type: 'deletion', label: 'Deletion Declared', color: 'text-ft-amber', describe: a => `Piece ${short(a.commitmentHash, 12)}` },
  FileDeletionConfirmed: { type: 'deletion', label: 'Deletion Confirmed', color: 'text-ft-red', describe: a => `Piece ${short(a.commitmentHash, 12)}` },

  EscrowClaimed: { type: 'escrow', label: 'VK Storage Escrow Claimed', color: 'text-ft-cyan', describe: a => `${ftu(a.amount)} to ${short(a.recipient)}` },
  EscrowClaimedOnDeletion: { type: 'escrow', label: 'VK Deletion Escrow Claimed', color: 'text-ft-cyan', describe: a => `${ftu(a.vkAmount)} to ${short(a.recipient)}` },
  PolicyEscrowDeposited: { type: 'escrow', label: 'Policy Escrow Deposited', color: 'text-ft-cyan', describe: a => `${ftu(a.amountWei)} for file ${short(a.fileId, 12)}` },
  AccessEscrowDeposited: { type: 'escrow', label: 'Access Escrow Deposited', color: 'text-ft-cyan', describe: a => `${ftu(a.amountWei)} for request #${a.requestId ?? '?'}` },

  PartitionProofSubmitted: { type: 'proof', label: 'Partition Proof Submitted', color: 'text-ft-green', describe: a => `VK ${short(a.vk)} round ${a.round ?? '?'}` },
  PartitionProofSubmittedDeterministic: { type: 'proof', label: 'Partition Proof Submitted', color: 'text-ft-green', describe: a => `VK ${short(a.vk)} round ${a.round ?? '?'}` },
  SectorProofSubmitted: { type: 'proof', label: 'Sector Proof Submitted', color: 'text-ft-green', describe: a => `VK ${short(a.vk)} round ${a.round ?? '?'}` },
  SectorProofMissed: { type: 'missed', label: 'Proof Missed', color: 'text-ft-red', describe: a => `VK ${short(a.vk)} round ${a.round ?? '?'}` },

  GuardianRegistered: { type: 'guardian', label: 'Guardian Joined', color: 'text-ft-purple', describe: a => `${short(a.guardian)}, stake ${ftu(a.stake)}` },
  VaultKeeperRegistered: { type: 'vk', label: 'Vault Keeper Joined', color: 'text-ft-cyan', describe: a => `${short(a.vkAddress)}, stake ${ftu(a.stake)}` },

  KeyGenRequestedForFile: { type: 'dkg', label: 'Key Generation Requested', color: 'text-ft-purple', describe: a => `File ${short(a.fileId, 12)}` },
  ZkDkgV2Finalized: { type: 'dkg', label: 'DKG Finalized', color: 'text-ft-purple', describe: a => `File ${short(a.fileId, 12)}, N=${a.n ?? '?'} T=${a.t ?? '?'}, epoch ${a.keyEpoch ?? '?'}` },
  ZkDkgV2SamePkRefreshFinalized: { type: 'dkg', label: 'Key Refresh Finalized', color: 'text-ft-purple', describe: a => `File ${short(a.fileId, 12)}, N=${a.newN ?? '?'} T=${a.newT ?? '?'}` },
  DkgKeyGenExpired: { type: 'dkg', label: 'DKG Expired', color: 'text-ft-red', describe: a => `File ${short(a.fileId, 12)}, ${a.nonParticipantCount ?? '?'} Guardians absent` },
  V2RefreshExpired: { type: 'dkg', label: 'Key Refresh Expired', color: 'text-ft-red', describe: a => `File ${short(a.fileId, 12)}, ${a.absentCount ?? '?'} Guardians absent` },

  DataAccessRequestedV2: { type: 'access', label: 'Data Access Request', color: 'text-ft-amber', describe: a => `Request #${a.requestId ?? '?'} by ${short(a.requester)}` },
  ReencryptedCidsStored: { type: 'pre', label: 'PRE Completed', color: 'text-ft-green', describe: a => `Request #${a.requestId ?? '?'} for ${short(a.requester)}` },
  PreRequestExpired: { type: 'pre', label: 'PRE Expired', color: 'text-ft-red', describe: a => `Request #${a.requestId ?? '?'}, ${a.absentCount ?? '?'} Guardians absent` },
  PreBadPartialDetected: { type: 'pre', label: 'Bad PRE Part', color: 'text-ft-red', describe: a => `Request #${a.requestId ?? '?'} from Guardian ${short(a.guardian)}` },

  GuardianRewarded: {
    type: 'reward', label: 'Guardian Work Reward', color: 'text-ft-green',
    describe: a => `${ftu(a.amount)} to ${short(a.guardian)} (${['DKG', 'PRE used', 'PRE ready'][Number(a.kind)] ?? 'work'})`,
  },
  GuardianJoinRewarded: { type: 'reward', label: 'Guardian Join Reward', color: 'text-ft-green', describe: a => `${ftu(a.amount)} to ${short(a.guardian)}` },
  GuardianShareProofRewarded: { type: 'reward', label: 'Guardian Proof Reward', color: 'text-ft-green', describe: a => `${ftu(a.amount)} to ${short(a.guardian)}` },
  VKJoinRewarded: { type: 'reward', label: 'VK Join Reward', color: 'text-ft-green', describe: a => `${ftu(a.amount)} to ${short(a.vk)}` },
  VKProofRewarded: { type: 'reward', label: 'VK Proof Reward', color: 'text-ft-green', describe: a => `${ftu(a.amount)} to ${short(a.vk)}` },
  VKFileRewarded: { type: 'reward', label: 'VK File Reward', color: 'text-ft-green', describe: a => `${ftu(a.amount)} to ${short(a.vk)}` },
  VKCapacityRewarded: { type: 'reward', label: 'VK Space Reward', color: 'text-ft-green', describe: a => `${ftu(a.amount)} to ${short(a.vk)}` },
  RewardsClaimed: { type: 'reward', label: 'Rewards Claimed', color: 'text-ft-green', describe: a => `${ftu(a.amountWei)} by ${short(a.guardian)}` },

  DisputeSubmitted: { type: 'dispute', label: 'Storage Dispute', color: 'text-ft-red', describe: a => `Against VK ${short(a.vk)}` },
  DeletionDisputeSubmitted: { type: 'dispute', label: 'Deletion Dispute', color: 'text-ft-red', describe: a => `Against VK ${short(a.vk)}, piece ${short(a.commitmentHash, 12)}` },
  DkgComplaintSubmitted: { type: 'dispute', label: 'DKG Complaint', color: 'text-ft-red', describe: a => `Against Guardian ${short(a.guardian)}` },
  PreComplaintSubmitted: { type: 'dispute', label: 'PRE Complaint', color: 'text-ft-red', describe: a => `Against Guardian ${short(a.guardian)}` },
  VKSuspendedByDispute: { type: 'dispute', label: 'VK Suspended', color: 'text-ft-red', describe: a => `VK ${short(a.vk)}` },
};

export const ACTIVITY_EVENT_NAMES = Object.keys(ACTIVITY_KINDS);

export interface ActivityItem {
  type: ActivityType;
  label: string;
  description: string;
  blockNumber: bigint;
  txHash: `0x${string}`;
  color: string;
  contractLabel?: string;
}

/// One indexed event as a feed line, or null for an event that is not activity.
export function toActivityItem(event: {
  name?: string;
  args?: Args;
  blockNumber: string | bigint;
  transactionHash: string;
  contractLabel?: string;
}): ActivityItem | null {
  const kind = event.name ? ACTIVITY_KINDS[event.name] : undefined;
  if (!kind) return null;
  let description: string;
  try {
    description = kind.describe(event.args ?? {});
  } catch {
    description = '';
  }
  return {
    type: kind.type,
    label: kind.label,
    description,
    blockNumber: BigInt(event.blockNumber),
    txHash: event.transactionHash as `0x${string}`,
    color: kind.color,
    contractLabel: event.contractLabel,
  };
}

/// The newest events, grouped into at most `buckets` equal block ranges, oldest
/// first. Grouping by single block made a line of ones across whatever blocks
/// happened to hold an event; a range shows when the activity happened.
export function activityByBlockRange(items: Array<{ blockNumber: bigint }>, buckets = 20) {
  if (items.length === 0) return [];
  let min = items[0].blockNumber;
  let max = items[0].blockNumber;
  for (const item of items) {
    if (item.blockNumber < min) min = item.blockNumber;
    if (item.blockNumber > max) max = item.blockNumber;
  }
  const span = max - min + 1n;
  const size = (span + BigInt(buckets) - 1n) / BigInt(buckets);
  const count = Number((span + size - 1n) / size);
  const rows = Array.from({ length: count }, (_, i) => {
    const from = min + BigInt(i) * size;
    const to = from + size - 1n > max ? max : from + size - 1n;
    return { from, to, count: 0 };
  });
  for (const item of items) rows[Number((item.blockNumber - min) / size)].count += 1;
  return rows.map(r => ({
    block: `#${r.from.toLocaleString()}`,
    range: r.from === r.to ? `Block ${r.from.toLocaleString()}` : `Blocks ${r.from.toLocaleString()}–${r.to.toLocaleString()}`,
    count: r.count,
  }));
}

/// Event counts folded into the dashboard's groups, largest first.
export function countsByType(countsByEvent: Record<string, number>) {
  const totals = new Map<ActivityType, number>();
  for (const [name, n] of Object.entries(countsByEvent)) {
    const kind = ACTIVITY_KINDS[name];
    if (!kind || !(n > 0)) continue;
    totals.set(kind.type, (totals.get(kind.type) ?? 0) + n);
  }
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => ({ name: ACTIVITY_TYPE_LABEL[type], count }));
}
