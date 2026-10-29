'use client';

/// What the block page shows, the way a block explorer shows it: the header
/// from the chain, and from the index the block's fees, how its transactions
/// break down, its contract payments, its FileTrust events and who took part.
/// Each list is read a page at a time and only when its tab is open.

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { fetchIndexPage, type IndexedFileTrustEvent } from '@/lib/indexedData';
import { useAutoRefreshInterval } from '@/lib/refresh';
import type { InternalTransfer, WalletTx } from '@/lib/hooks/useWallet';

const big = (value: unknown): bigint | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return BigInt(value as string);
  } catch {
    return undefined;
  }
};

export interface BlockHeader {
  number: bigint;
  hash: `0x${string}`;
  parentHash: `0x${string}`;
  timestamp: bigint;
  /** The block before it, for "made N seconds after the previous block". */
  previousTimestamp?: bigint;
  miner: `0x${string}`;
  gasUsed: bigint;
  gasLimit: bigint;
  baseFeePerGas?: bigint;
  size?: bigint;
  extraData: `0x${string}`;
  stateRoot: `0x${string}`;
  transactionsRoot: `0x${string}`;
  receiptsRoot: `0x${string}`;
  transactionHashes: `0x${string}`[];
  /** The chain's newest block, for whether there is a next one. */
  latest: bigint;
}

/// The block itself, from the chain: one read for it and one for the block
/// before, whatever the chain's age.
export function useBlockHeader(id: string | undefined) {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: ['block-header', id],
    enabled: !!id,
    queryFn: async (): Promise<BlockHeader> => {
      if (!id) throw new Error('Missing block id');
      const block = /^0x[0-9a-fA-F]{64}$/.test(id)
        ? await publicClient.getBlock({ blockHash: id as `0x${string}` })
        : await publicClient.getBlock({ blockNumber: BigInt(id) });
      const number = block.number ?? 0n;
      const [previous, latest] = await Promise.all([
        number > 0n ? publicClient.getBlock({ blockNumber: number - 1n }).catch(() => null) : null,
        publicClient.getBlockNumber().catch(() => number),
      ]);
      return {
        number,
        hash: block.hash ?? '0x',
        parentHash: block.parentHash,
        timestamp: block.timestamp,
        previousTimestamp: previous?.timestamp,
        miner: block.miner,
        gasUsed: block.gasUsed,
        gasLimit: block.gasLimit,
        baseFeePerGas: block.baseFeePerGas ?? undefined,
        size: block.size ?? undefined,
        extraData: block.extraData,
        stateRoot: block.stateRoot,
        transactionsRoot: block.transactionsRoot,
        receiptsRoot: block.receiptsRoot,
        transactionHashes: block.transactions as `0x${string}`[],
        latest: latest > number ? latest : number,
      };
    },
    retry: false,
    // A block never changes, but the newest one gains a next block: until it
    // has one, read again so the "next" arrow appears when it does.
    refetchInterval: (query) => (query.state.data && query.state.data.number >= query.state.data.latest ? refetchInterval : false),
  });
}

export interface BlockMethodCount { method: string; count: number; failed: number }

export interface BlockStoreDetail {
  transactionCount: number;
  complete: boolean;
  failedCount: number;
  feesWei: bigint | null;
  methods: BlockMethodCount[];
  internalCount: number | null;
  eventCount: number;
}

/// The block's figures from the index. Null when the index does not hold the
/// block, or there is no index -- the page then shows what the chain gives.
export function useBlockStoreDetail(number: bigint | undefined) {
  return useQuery({
    queryKey: ['block-store-detail', number?.toString()],
    enabled: number !== undefined,
    queryFn: async (): Promise<BlockStoreDetail | null> => {
      const res = await fetch(`/api/index/block-detail?number=${number}`, { cache: 'default' }).catch(() => null);
      if (!res || !res.ok) return null;
      const body = await res.json().catch(() => null);
      if (!body || typeof body.transactionCount !== 'number') return null;
      return {
        transactionCount: body.transactionCount,
        complete: Boolean(body.complete),
        failedCount: Number(body.failedCount ?? 0),
        feesWei: big(body.feesWei) ?? null,
        methods: Array.isArray(body.methods) ? body.methods : [],
        internalCount: body.internalCount === null || body.internalCount === undefined ? null : Number(body.internalCount),
        eventCount: Number(body.eventCount ?? 0),
      };
    },
  });
}

/// A paged list of one block's rows, with `unavailable` when the index cannot
/// answer -- which the caller tells apart from an empty list.
function useBlockPages<T>(
  dataset: string,
  number: bigint | undefined,
  map: (row: Record<string, unknown>) => T,
  enabled: boolean,
  extra: Record<string, string | string[] | number | undefined> = {},
  pageSize = 50,
) {
  const refetchInterval = useAutoRefreshInterval();
  const query = useInfiniteQuery({
    queryKey: ['block-pages', dataset, number?.toString(), extra, pageSize],
    enabled: enabled && number !== undefined,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await fetchIndexPage<Record<string, unknown>>(dataset, {
        number: number?.toString(), ...extra, limit: pageSize, cursor: pageParam,
      });
      return page ?? { rows: [] as Record<string, unknown>[], nextCursor: null, unavailable: true };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval,
  });
  const pages = query.data?.pages ?? [];
  return {
    rows: pages.flatMap((page) => page.rows).map(map),
    unavailable: pages.length > 0 && 'unavailable' in pages[0],
    isLoading: query.isLoading,
    error: query.error,
    refetch: () => query.refetch(),
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
  };
}

function toWalletTx(row: Record<string, unknown>): WalletTx {
  const status = row.status;
  return {
    hash: row.hash as `0x${string}`,
    blockNumber: big(row.blockNumber) ?? 0n,
    blockTimestamp: big(row.blockTimestamp),
    from: row.from as `0x${string}`,
    to: (row.to ?? null) as `0x${string}` | null,
    value: big(row.value) ?? 0n,
    gasPrice: big(row.gasPrice),
    gasUsed: big(row.gasUsed),
    status: status === 1 || status === '1' ? 'success' : status === 0 || status === '0' ? 'failed' : undefined,
    selector: typeof row.selector === 'string' && /^0x[0-9a-fA-F]{8}$/.test(row.selector)
      ? row.selector.toLowerCase() as `0x${string}`
      : null,
  };
}

/// The block's transactions in block order, from the index.
export function useBlockTransactions(number: bigint | undefined, enabled: boolean) {
  return useBlockPages('block-transactions', number, toWalletTx, enabled);
}

/// The same transactions from the chain, for a block the index does not hold:
/// what the block carries, without the outcome and fee only receipts have.
export function useChainBlockTransactions(number: bigint | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['chain-block-transactions', number?.toString()],
    enabled: enabled && number !== undefined,
    queryFn: async (): Promise<WalletTx[]> => {
      const block = await publicClient.getBlock({ blockNumber: number!, includeTransactions: true });
      return (block.transactions as any[]).map((tx) => ({
        hash: tx.hash,
        blockNumber: block.number ?? 0n,
        blockTimestamp: block.timestamp,
        from: tx.from,
        to: tx.to ?? null,
        value: tx.value ?? 0n,
        gasPrice: tx.gasPrice ?? undefined,
        selector: typeof tx.input === 'string' && tx.input.length >= 10 ? tx.input.slice(0, 10).toLowerCase() : null,
      }));
    },
  });
}

function toInternal(row: Record<string, unknown>): InternalTransfer {
  return {
    transactionHash: row.transactionHash as `0x${string}`,
    traceIndex: Number(row.traceIndex ?? 0),
    blockNumber: big(row.blockNumber) ?? 0n,
    blockTimestamp: big(row.blockTimestamp),
    from: row.from as `0x${string}`,
    to: row.to as `0x${string}`,
    value: big(row.value) ?? 0n,
    callType: String(row.callType ?? 'CALL'),
  };
}

/// FTU contracts paid inside the block's transactions.
export function useBlockInternalTransfers(number: bigint | undefined, enabled: boolean) {
  return useBlockPages('block-internal', number, toInternal, enabled);
}

/// The FileTrust events in the block: the event list, limited to its one block.
export function useBlockEvents(number: bigint | undefined, enabled: boolean) {
  return useBlockPages<IndexedFileTrustEvent>(
    'events', number, (row) => row as unknown as IndexedFileTrustEvent, enabled,
    { fromBlock: number?.toString(), toBlock: number?.toString(), order: 'desc' }, 100,
  );
}

export interface BlockParticipant {
  address: `0x${string}`;
  transactionsSent: number;
  transactionsReceived: number;
  paymentsOut: number;
  paymentsIn: number;
  events: number;
  guardian: boolean;
  vaultKeeper: boolean;
}

/// Every address that took part in the block. Null without an index.
export function useBlockParticipants(number: bigint | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['block-participants', number?.toString()],
    enabled: enabled && number !== undefined,
    queryFn: async (): Promise<BlockParticipant[] | null> => {
      const page = await fetchIndexPage<BlockParticipant>('block-participants', { number: number?.toString() });
      return page ? page.rows : null;
    },
  });
}

export interface ConsensusInfo {
  available: true;
  chainId: string;
  height: string;
  time: string;
  appHash: string;
  proposer: { address: string; votingPower: string | null; thisNode: boolean; name: string | null };
  validators: { count: number; totalVotingPower: string };
  signatures: { signed: number; absent: number; nil: number; signedVotingPower: string };
}

/// Who proposed and signed the block, from the node's consensus side, when the
/// chain has one.
export function useBlockConsensus(number: bigint | undefined) {
  return useQuery({
    queryKey: ['block-consensus', number?.toString()],
    enabled: number !== undefined && number > 0n,
    queryFn: async (): Promise<ConsensusInfo | { available: false; reason?: string }> => {
      const res = await fetch(`/api/consensus?height=${number}`).catch(() => null);
      if (!res) return { available: false, reason: 'the Explorer server did not answer' };
      return res.json();
    },
    staleTime: 30_000,
  });
}
