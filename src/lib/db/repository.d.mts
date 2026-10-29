/// Types for the repository. The implementation is plain JavaScript so the
/// indexer can run it directly, without a TypeScript build step this project
/// does not have.
import type {
  IndexedBlock,
  IndexedFileTrustEvent,
  IndexedManifest,
  IndexedTransaction,
} from '@/lib/indexedData';

export interface EventCursor {
  blockNumber: string | bigint;
  logIndex: number;
}

export interface EventQuery {
  addresses?: string[];
  contracts?: string[];
  events?: string[];
  /** An address or a 32-byte key the events are about. Matched on its own index. */
  subject?: string;
  fromBlock?: string | bigint;
  toBlock?: string | bigint;
  limit?: number;
  cursor?: EventCursor;
}

export declare function eventStoreName(): 'postgres' | 'clickhouse';
export declare function resetDimensions(): void;

/** Null when there is no store to answer from, which is different from a store
 *  holding nothing. Only the first should send a screen to its chain window. */
export declare function getStatus(): Promise<(IndexedManifest & { store: string }) | null>;

export declare function getEvents(query?: EventQuery): Promise<IndexedFileTrustEvent[]>;
export interface AggregateResult {
  op: string;
  total: string;
  groupedBy?: string;
  groups?: Array<{ key: string; value: string }>;
}

/** Answer a question about the events instead of shipping them. Values are
 *  decimal strings: a sum of wei does not fit in a double. */
export declare function aggregateEvents(query?: {
  op?: 'count' | 'sum' | 'distinct';
  addresses?: string[]; contracts?: string[]; events?: string[];
  arg?: string | string[]; field?: string;
  /** 'event', 'contract', or 'arg:<argument name>' to group on an argument's value. */
  groupBy?: string;
  fromBlock?: string; toBlock?: string;
}): Promise<AggregateResult>;

export declare function getBlocks(options?: { limit?: number; cursor?: { number?: string | number } }): Promise<Array<IndexedBlock & {
  /** Null before migration 017, or on a chain without EIP-1559. */
  baseFeePerGas: string | null;
  size: number | null;
  /** Null when a transaction's receipt is not stored. */
  feesWei: string | null;
}>>;

export interface BlockMethodCount { method: string; count: number; failed: number }
export declare function getBlockDetail(number: string | number): Promise<{
  number: string;
  transactionCount: number;
  complete: boolean;
  failedCount: number;
  feesWei: string | null;
  methods: BlockMethodCount[];
  internalCount: number | null;
  eventCount: number;
  previousTimestamp: string | null;
} | null>;
export declare function getBlockTransactions(
  number: string | number,
  options?: { limit?: number; cursor?: { transactionIndex?: number } },
): Promise<Array<IndexedTransaction & {
  status: number | null; gasUsed: string | null; selector: string | null; blockTimestamp: string;
}> | null>;
export declare function getBlockInternalTransfers(
  number: string | number,
  options?: { limit?: number; cursor?: { transactionIndex?: number; traceIndex?: number } },
): Promise<InternalTransferRow[] | null>;
export declare function getBlockParticipants(number: string | number): Promise<Array<{
  address: string;
  transactionsSent: number;
  transactionsReceived: number;
  paymentsOut: number;
  paymentsIn: number;
  events: number;
  guardian: boolean;
  vaultKeeper: boolean;
}> | null>;
export declare function getTransactions(options?: { limit?: number }): Promise<IndexedTransaction[]>;

/** Every transaction an address sent or received, newest first, from the two
 *  indexes the transaction table has carried since the first migration.
 *
 *  Null when there is no store to ask -- which the caller must tell apart from
 *  an empty array: the first means fall back to scanning the chain, the second
 *  means this address has genuinely never transacted. */
export type AddressDirection = 'all' | 'in' | 'out';

export declare function getAddressTransactions(
  address: string,
  options?: {
    limit?: number;
    cursor?: { blockNumber?: string | number; transactionIndex?: number };
    direction?: AddressDirection;
  },
): Promise<Array<IndexedTransaction & {
  status: number | null;
  gasUsed: string | null;
  /** The function selector: the first four bytes of the input, or null. */
  selector: string | null;
}> | null>;

/** FTU a contract moved inside a transaction, read from the node's call trace. */
export interface InternalTransferRow {
  transactionHash: string;
  traceIndex: number;
  blockNumber: string;
  blockTimestamp: string;
  transactionIndex: number;
  from: string;
  to: string;
  value: string;
  callType: string;
}

/** What an empty list of contract payments means. */
export type InternalCoverage =
  | { available: false; reason: 'not-migrated' | 'not-traced' | 'unsupported' }
  | {
    available: true;
    mode: string | null;
    tracedFrom: string | null;
    tracedTo: string | null;
    /** Every transaction the store holds has been traced. */
    complete: boolean;
    /** Blocks that could not be traced yet and are retried. */
    untracedBlocks: number;
  };

export declare function getAddressInternalTransfers(
  address: string,
  options?: {
    limit?: number;
    cursor?: { blockNumber?: string | number; transactionIndex?: number; traceIndex?: number };
    direction?: AddressDirection;
  },
): Promise<InternalTransferRow[] | null>;

export declare function getTransactionInternalTransfers(hash: string): Promise<{
  coverage: InternalCoverage;
  /** Whether this transaction's block has been traced. */
  traced: boolean;
  rows: InternalTransferRow[];
} | null>;

export interface ActivityPoint { hash: string; blockNumber: string; blockTimestamp: string }

export declare function getAddressSummary(address: string): Promise<{
  transactions: { sent: string; received: string; total: string; capped: boolean };
  firstSeen: ActivityPoint | null;
  lastSeen: ActivityPoint | null;
  fundedBy: (ActivityPoint & { from: string; value: string; kind: 'transaction' | 'internal' }) | null;
  internal: { sent: string; received: string; capped: boolean } | null;
  internalCoverage: InternalCoverage;
} | null>;

/** Null when the projection has not run, which a screen must tell apart from an
 *  empty network: the first means fall back to the chain, the second means the
 *  network really has no vault keepers. */
interface EntityQuery { limit?: number; cursor?: string; activeOnly?: boolean }
export declare function getVaultKeepers(options?: EntityQuery): Promise<Record<string, unknown>[] | null>;
export declare function getGuardians(options?: EntityQuery): Promise<Record<string, unknown>[] | null>;
export declare function getFilePolicies(options?: EntityQuery): Promise<Record<string, unknown>[] | null>;
export declare function getPartitions(options?: EntityQuery): Promise<Record<string, unknown>[] | null>;
export declare function getSectors(options?: EntityQuery): Promise<Record<string, unknown>[] | null>;
export declare function getFilePolicyCounts(): Promise<{
  total: number; active: number; zkdkgV2: number; keyGenPending: number;
} | null>;
export declare function getSectorCounts(): Promise<{
  active: number; inactive: number; total: number;
  /** ZK blocks held by active sectors, as decimal digits. */
  activeBlocks: string;
  /** Active, past their expiration. */
  expired: number;
  /** Active, not expired, with a missed proof. */
  faulted: number;
  /** Expiring within seven days, active or not. */
  expiringSoon: number;
} | null>;

export interface PriceAverage { average: number; count: number }
export declare function getNetworkSummary(): Promise<{
  guardians: {
    count: number;
    dkgMaterialSu: PriceAverage;
    dkgShareKeySu: PriceAverage;
    preBatchPartialSu: PriceAverage;
  } | null;
  vaultKeepers: {
    count: number;
    storageFee: PriceAverage;
    /** Bytes as decimal digits. */
    capacity: {
      totalCapacityBytes: string;
      activeDeclaredCapacityBytes: string;
      activeConservativeAvailableBytes: string;
      activeRegisteredDataBytes: string;
      freshActiveProofCapacityBytes: string;
      activeCapacityDivergenceBytes: string;
    };
  } | null;
} | null>;

interface RankQuery { limit?: number; cursor?: string; search?: string }
export declare function getGuardianRanking(options?: RankQuery): Promise<Array<Record<string, unknown> & {
  rank: number; rankScore: number;
}> | null>;
export declare function getVaultKeeperRanking(options?: RankQuery): Promise<Array<Record<string, unknown> & {
  rank: number; rankScore: number;
}> | null>;
export declare function getPartitionCounts(): Promise<{
  active: number; inactive: number; data: number; capacity: number; total: number;
} | null>;

export declare function getEconomicParticipants(options?: EntityQuery): Promise<Record<string, unknown>[] | null>;
export declare function getFileEconomics(options?: EntityQuery): Promise<Record<string, unknown>[] | null>;
export declare function getTransactionDetail(hash: string): Promise<{
  hash: string; blockNumber: string; blockHash?: string; blockTimestamp: string;
  transactionIndex: number; from: string; to: string | null; value: string;
  gas: string; gasPrice?: string; input: string;
  status: number | null; gasUsed: string | null;
  events: IndexedFileTrustEvent[];
  /** Of the block it is in; null when the store has not recorded it. */
  baseFeePerGas: string | null;
  /** The sender's transactions just before and after this one. */
  senderPrevious: string | null; senderNext: string | null;
  roles: { from: Array<'guardian' | 'vault-keeper'>; to: Array<'guardian' | 'vault-keeper'> };
} | null>;

export declare function getDeadlines(options?: { limit?: number; cursor?: string }): Promise<Array<{
  id: string; vk: string; deadlineIndex: number; partitionCount: number;
  sectorCount: string; openedChallenges: number; submittedProofs: number;
  expiringSoon: number; faulted: number; health: string;
}> | null>;
export declare function getPreRequests(options?: { limit?: number; cursor?: string }): Promise<Array<{
  requestId: string; fileId: string; readyGuardians: string[]; activeGuardians: string[];
  badPartialGuardians: string[]; notUsedGuardians: string[]; expired: boolean;
  absentCount: number; blockNumber: string; txHashes: string[];
}> | null>;
export declare function getTransactionReceipts(hashes?: string[]): Promise<Array<{
  hash: string; blockNumber: string; blockTimestamp: string | null;
  from: string; to: string | null; gasUsed: string | null; gasPrice: string | null;
  status: number | null; eventCount: number;
}> | null>;
export interface EscrowLinkRow {
  paymentCommitment: string;
  claimTxHash: string;
  kind: 'claimed' | 'deletion';
  claimBlockNumber: string;
  claimLogIndex: number;
  recipient: string | null;
  registrationCommitment: string | null;
  commitmentHash: string | null;
  vkAddress: string | null;
  amount: string | null;
  serviceStart: string | null;
  serviceEnd: string | null;
  depositor: string | null;
  resolvedTo: string;
}
export declare function getEscrowLinks(query?: {
  commitment?: string; payments?: string[];
}): Promise<EscrowLinkRow[] | null>;
export declare function getRollupCounts(): Promise<{
  participants: number; files: number; preRequests: number;
} | null>;

export declare function getEntityFreshness(): Promise<{
  vaultKeepers: number;
  guardians: number;
  syncedBlock: string;
  awaitingRefresh: number;
} | null>;

export declare function toBytes(hex: unknown): Buffer | null;
export declare function toHex(bytes: Buffer | Uint8Array | null | undefined): `0x${string}` | undefined;
