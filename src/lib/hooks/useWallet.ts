'use client';

/// What one wallet did, the way a block explorer shows it: every transaction it
/// sent or received, every FTU a contract paid it or took from it, and every
/// FileTrust event about it -- each a page at a time, newest first.

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { toFunctionSelector, toFunctionSignature, type AbiFunction } from 'viem';
import { publicClient } from '@/lib/client';
import { ABI_REGISTRY } from '@/lib/abis/registry';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { scanRecentBlocksFor } from '@/lib/hooks/useEvmExplorer';
import { isUnsupportedTraceError, transfersFromCallTrace } from '@/lib/internalTransfers.mjs';
import type { IndexedFileTrustEvent } from '@/lib/indexedData';

export type Direction = 'all' | 'in' | 'out';

/// Where a list came from, which is what it covers: 'store' is all of history,
/// 'files' the recent transactions the file index keeps, 'scan' a window of
/// recent blocks read from the chain.
export type HistorySource = 'store' | 'files' | 'scan';

export interface WalletTx {
  hash: `0x${string}`;
  blockNumber: bigint;
  blockTimestamp?: bigint;
  from: `0x${string}`;
  to: `0x${string}` | null;
  value: bigint;
  gasPrice?: bigint;
  /** Known once the indexer stored the receipt. */
  gasUsed?: bigint;
  /** Undefined when nobody has looked at the receipt yet. */
  status?: 'success' | 'failed';
  /** The function called: the input's first four bytes, or null for a plain payment. */
  selector: `0x${string}` | null;
}

export interface InternalTransfer {
  transactionHash: `0x${string}`;
  traceIndex: number;
  blockNumber: bigint;
  blockTimestamp?: bigint;
  from: `0x${string}`;
  to: `0x${string}`;
  value: bigint;
  callType: string;
}

export interface Page<T> {
  rows: T[];
  nextCursor: string | null;
  source: HistorySource;
  scannedBlocks?: number;
  unreadableBlocks?: number;
}

const big = (value: unknown): bigint | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  try {
    return BigInt(value as string);
  } catch {
    return undefined;
  }
};

/// One page of an address dataset, with where it came from. Null when there is
/// no index to ask, which the caller must tell apart from an empty page.
async function fetchAddressPage(
  dataset: string,
  params: Record<string, string | number | undefined>,
): Promise<{ rows: Record<string, unknown>[]; nextCursor: string | null; source: HistorySource } | null> {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const res = await fetch(`/api/index/${dataset}?${query}`, { cache: 'default' }).catch(() => null);
  if (!res || !res.ok) return null;
  const body = await res.json().catch(() => null);
  if (!body || !Array.isArray(body.rows)) return null;
  return {
    rows: body.rows,
    nextCursor: typeof body.nextCursor === 'string' ? body.nextCursor : null,
    source: (res.headers.get('X-Index-Source') ?? '').startsWith('store') ? 'store' : 'files',
  };
}

function toWalletTx(row: Record<string, unknown>): WalletTx {
  const status = row.status;
  const selector = typeof row.selector === 'string' && /^0x[0-9a-fA-F]{8}$/.test(row.selector)
    ? row.selector.toLowerCase() as `0x${string}`
    : typeof row.input === 'string' && row.input.length >= 10
      ? row.input.slice(0, 10).toLowerCase() as `0x${string}`
      : null;
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
    selector,
  };
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

/**
 * Every transaction an address sent or received, a page at a time.
 *
 * From the store when there is one -- all of history, paged by cursor. Without
 * one, from the file index's recent transactions; without that either, from a
 * scan of the last blocks on the chain. The page says which, because the three
 * cover very different spans.
 */
export function useAddressTransactions(address: string | undefined, direction: Direction, pageSize = 50) {
  const refetchInterval = useAutoRefreshInterval();
  const lower = address?.toLowerCase();

  const query = useInfiniteQuery({
    queryKey: ['wallet-transactions', lower, direction, pageSize],
    enabled: !!lower,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }): Promise<Page<WalletTx>> => {
      const page = await fetchAddressPage('address-transactions', {
        address: lower, direction, limit: pageSize, cursor: pageParam,
      });
      if (page) return { rows: page.rows.map(toWalletTx), nextCursor: page.nextCursor, source: page.source };
      if (pageParam) return { rows: [], nextCursor: null, source: 'scan' };

      const scan = await scanRecentBlocksFor(lower!, 250);
      const rows = scan.transactions
        .filter(tx => direction === 'all'
          || (direction === 'out' && tx.from.toLowerCase() === lower)
          || (direction === 'in' && tx.to?.toLowerCase() === lower))
        .map(tx => toWalletTx({ ...tx, selector: null }));
      return {
        rows, nextCursor: null, source: 'scan',
        scannedBlocks: scan.scannedBlocks, unreadableBlocks: scan.unreadableBlocks,
      };
    },
    getNextPageParam: last => last.nextCursor ?? undefined,
    refetchInterval,
    retry: 1,
  });

  const pages = query.data?.pages ?? [];
  return {
    ...query,
    rows: pages.flatMap(p => p.rows),
    first: pages[0],
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
  };
}

/// FTU contracts paid to or took from an address, a page at a time. `available`
/// is false when the store has none to give -- no store, or an older one -- and
/// the screen says so rather than showing an empty list as "none".
export function useAddressInternalTransfers(
  address: string | undefined,
  direction: Direction,
  { pageSize = 50, enabled = true }: { pageSize?: number; enabled?: boolean } = {},
) {
  const refetchInterval = useAutoRefreshInterval();
  const lower = address?.toLowerCase();

  const query = useInfiniteQuery({
    queryKey: ['wallet-internal', lower, direction, pageSize],
    enabled: !!lower && enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await fetchAddressPage('address-internal', {
        address: lower, direction, limit: pageSize, cursor: pageParam,
      });
      if (!page) return { rows: [] as InternalTransfer[], nextCursor: null, available: false };
      return { rows: page.rows.map(toInternal), nextCursor: page.nextCursor, available: page.source === 'store' };
    },
    getNextPageParam: last => last.nextCursor ?? undefined,
    refetchInterval,
    retry: 1,
  });

  const pages = query.data?.pages ?? [];
  return {
    ...query,
    rows: pages.flatMap(p => p.rows),
    available: pages[0]?.available ?? false,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
  };
}

/**
 * Every FileTrust event about an address, newest first, a page at a time.
 *
 * "About" is the store's subject column: the guardian a DKG part names, the
 * keeper a proof names, the payer of an escrow. For a contract, `emitter` asks
 * instead for the events the contract itself sent.
 */
export function useAddressActivity(address: string | undefined, { emitter = false, pageSize = 50 } = {}) {
  const refetchInterval = useAutoRefreshInterval();
  const lower = address?.toLowerCase();

  const query = useInfiniteQuery({
    queryKey: ['wallet-activity', lower, emitter, pageSize],
    enabled: !!lower,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await fetchAddressPage('events', {
        ...(emitter ? { address: lower } : { subject: lower }),
        order: 'desc', limit: pageSize, cursor: pageParam,
      });
      if (!page) return { rows: [] as IndexedFileTrustEvent[], nextCursor: null, source: null as HistorySource | null };
      return { rows: page.rows as unknown as IndexedFileTrustEvent[], nextCursor: page.nextCursor, source: page.source as HistorySource | null };
    },
    getNextPageParam: last => last.nextCursor ?? undefined,
    refetchInterval,
    retry: 1,
  });

  const pages = query.data?.pages ?? [];
  return {
    ...query,
    rows: pages.flatMap(p => p.rows),
    source: pages[0]?.source ?? null,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => query.fetchNextPage(),
    loadingMore: query.isFetchingNextPage,
  };
}

export type InternalCoverage =
  | { available: false; reason: 'not-migrated' | 'not-traced' | 'unsupported' }
  | { available: true; mode: string | null; tracedFrom: string | null; tracedTo: string | null; complete: boolean; untracedBlocks: number };

export interface AddressSummary {
  transactions: { sent: string; received: string; total: string; capped: boolean };
  firstSeen: { hash: string; blockNumber: string; blockTimestamp: string } | null;
  lastSeen: { hash: string; blockNumber: string; blockTimestamp: string } | null;
  fundedBy: { hash: string; blockNumber: string; blockTimestamp: string; from: string; value: string; kind: 'transaction' | 'internal' } | null;
  internal: { sent: string; received: string; capped: boolean } | null;
  internalCoverage: InternalCoverage;
}

/// Counts, first and last activity, and who first funded the address. Null
/// without a store: the file index keeps only recent history, and counts from it
/// would read as totals.
export function useAddressSummary(address: string | undefined) {
  const refetchInterval = useAutoRefreshInterval();
  const lower = address?.toLowerCase();
  return useQuery({
    queryKey: ['wallet-summary', lower],
    enabled: !!lower,
    queryFn: async (): Promise<AddressSummary | null> => {
      const res = await fetch(`/api/index/address-summary?address=${lower}`, { cache: 'default' }).catch(() => null);
      if (!res || !res.ok) return null;
      const body = await res.json().catch(() => null);
      return body && typeof body === 'object' && body.transactions ? body as AddressSummary : null;
    },
    refetchInterval,
    retry: 1,
  });
}

/**
 * The FTU contracts moved inside one transaction.
 *
 * From the store when it has traced that block. Otherwise the node is asked
 * directly for this one transaction: one trace is cheap, and a transaction newer
 * than the last indexer pass is an ordinary case. `traced` is false when neither
 * could say, so the screen does not present "nothing" as "none".
 */
export function useTransactionInternalTransfers(hash: string | undefined) {
  return useQuery({
    queryKey: ['tx-internal', hash?.toLowerCase()],
    enabled: !!hash,
    queryFn: async (): Promise<{ traced: boolean; rows: InternalTransfer[]; source: 'store' | 'node' | null }> => {
      const res = await fetch(`/api/index/tx-internal?hash=${hash}`, { cache: 'default' }).catch(() => null);
      const body = res && res.ok ? await res.json().catch(() => null) : null;
      if (body?.traced) {
        return { traced: true, rows: (body.rows ?? []).map(toInternal), source: 'store' };
      }
      try {
        const frame = await publicClient.request({
          method: 'debug_traceTransaction' as any,
          params: [hash, { tracer: 'callTracer' }] as any,
        });
        const rows = transfersFromCallTrace(frame as any).map(t => ({
          transactionHash: hash as `0x${string}`,
          traceIndex: t.traceIndex,
          blockNumber: 0n,
          from: t.from as `0x${string}`,
          to: t.to as `0x${string}`,
          value: t.value,
          callType: t.callType,
        }));
        return { traced: true, rows, source: 'node' };
      } catch (error) {
        if (!isUnsupportedTraceError(error)) console.warn('trace failed', error);
        return { traced: false, rows: [], source: null };
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

// --- method names -----------------------------------------------------------

export interface MethodInfo {
  name: string;
  signature: string;
  inputs: AbiFunction['inputs'];
}

/// The functions the Explorer's own ABIs know, so names still show when the
/// server cannot read the compiled artifacts.
function bundledMethods(): Record<string, MethodInfo> {
  const out: Record<string, MethodInfo> = {};
  for (const entry of ABI_REGISTRY) {
    for (const item of entry.abi as AbiFunction[]) {
      if (item?.type !== 'function') continue;
      try {
        const selector = toFunctionSelector(item);
        if (!out[selector]) out[selector] = { name: item.name, signature: toFunctionSignature(item), inputs: item.inputs ?? [] };
      } catch { /* skip */ }
    }
  }
  return out;
}

/// Selector to function, from the deployment's artifacts, with the bundled ABIs
/// filling any gap. Loaded once per visit: it changes only with a redeploy.
export function useMethodNames() {
  return useQuery({
    queryKey: ['method-names'],
    queryFn: async (): Promise<Record<string, MethodInfo>> => {
      const local = bundledMethods();
      const res = await fetch('/api/methods').catch(() => null);
      const body = res && res.ok ? await res.json().catch(() => null) : null;
      return { ...local, ...(body?.methods ?? {}) };
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: 1,
  });
}

/// What to call one transaction in a list: the function's name, "Transfer" for
/// a plain payment, or the raw selector when the function is not known here.
export function methodLabel(
  methods: Record<string, MethodInfo> | undefined,
  tx: { selector: string | null; to: string | null },
): string {
  if (tx.to === null) return 'Create contract';
  if (!tx.selector) return 'Transfer';
  return methods?.[tx.selector.toLowerCase()]?.name ?? tx.selector;
}

/// The fee a transaction paid, when the receipt is known.
export function txFee(tx: { gasUsed?: bigint; gasPrice?: bigint }): bigint | undefined {
  return tx.gasUsed !== undefined && tx.gasPrice !== undefined ? tx.gasUsed * tx.gasPrice : undefined;
}
