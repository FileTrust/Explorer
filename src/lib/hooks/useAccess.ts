'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { DataVaultABI } from '@/lib/abis/DataVault';
import { TElGv2ABI } from '@/lib/abis/TElGv2';
import { ZkDkgCoordinatorV2ABI } from '@/lib/abis/ZkDkgCoordinatorV2';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { fileScope, getIndexedLogs } from '@/lib/indexedLogs';
import { usePagedIndex } from '@/lib/hooks/useEventCounts';
import { reviveArgs } from '@/lib/indexedLogMatch.mjs';
import { useQueries } from '@tanstack/react-query';

export interface AccessRequest {
  requestId: bigint;
  fileId: `0x${string}`;
  requester: `0x${string}`;
  batchId: bigint;
  dataId: string;
  keyEpoch: number;
  shareVersion: number;
  pieceCount: number;
  fulfilled: boolean;
  /// Guardians that have submitted a partial, and how many the DKG committee
  /// requires. Carried beside `fulfilled` so a request that is still short can
  /// say how short rather than only that it is not done.
  sharesSubmitted: number;
  sharesRequired: number;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export interface DataBatch {
  fileId: `0x${string}`;
  batchId: bigint;
  dataOwner: `0x${string}`;
  dataId: string;
  n: number;
  t: number;
  keyEpoch: number;
  pieceCount: number;
  cidTxHashes: `0x${string}`[];
  c1TxHash?: `0x${string}`;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

/// `fileId` limits it to one file's requests.
export function useAccessRequests({ fileId }: { fileId?: string } = {}) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['access-requests', fileId ?? 'all'],
    queryFn: async (): Promise<AccessRequest[]> => {
      // Same rule as the paged hook: the guardians' shares against the DKG
      // committee's threshold, read from TElGv2 where v2 actually records them.
      // See `shareProgress` for why the vault's own event cannot answer this,
      // and why the committee's threshold is not the batch's.
      const [requests, perRequest, perBatch, committees] = await Promise.all([
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.DataVault,
          event: DataVaultABI.find(e => e.name === 'DataAccessRequestedV2')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.TElGv2,
          event: TElGv2ABI.find(e => e.name === 'V2AccessPartialSubmitted')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.TElGv2,
          event: TElGv2ABI.find(e => e.name === 'V2BatchAccessPartialSubmitted')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.ZkDkgCoordinatorV2,
          event: ZkDkgCoordinatorV2ABI.find(e => e.name === 'ZkDkgV2Finalized')! as any,
        }).catch(() => []),
      ]);

      const { guardians, threshold } = shareProgress(
        perRequest as any, perBatch as any, committees as any,
      );

      return requests.map(l => {
        const a = (l as any).args;
        const submitted = guardians.get(String(a.requestId))?.size ?? 0;
        const required = threshold.get(committeeKey(a.fileId, a.keyEpoch, a.shareVersion)) ?? 0;
        return {
          requestId: a.requestId,
          fileId: a.fileId,
          requester: a.requester,
          batchId: a.batchId,
          dataId: a.dataId ?? '',
          keyEpoch: Number(a.keyEpoch),
          shareVersion: Number(a.shareVersion),
          pieceCount: Array.isArray(a.indices) ? a.indices.length : 0,
          fulfilled: required > 0 && submitted >= required,
          sharesSubmitted: submitted,
          sharesRequired: required,
          blockNumber: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? '0x',
        } as AccessRequest;
      }).sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

/// `fileId` limits it to one file's batches.
export function useDataBatches({ fileId }: { fileId?: string } = {}) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['data-batches', fileId ?? 'all'],
    queryFn: async (): Promise<DataBatch[]> => {
      const [logs, bulkCids, singleCids, c1Logs] = await Promise.all([
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.DataVault,
          event: DataVaultABI.find(e => e.name === 'BatchCreated')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.DataVault,
          event: DataVaultABI.find(e => e.name === 'EncCidsBatchAdded')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.DataVault,
          event: DataVaultABI.find(e => e.name === 'EncCidAddedV2')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.DataVault,
          event: DataVaultABI.find(e => e.name === 'V2BatchC1Set')! as any,
        }).catch(() => []),
      ]);

      const bulkCounts = new Map<string, number>();
      const bulkTxs = new Map<string, Set<`0x${string}`>>();
      for (const l of bulkCids) {
        const a = (l as any).args;
        const key = `${String(a.fileId).toLowerCase()}:${String(a.batchId)}`;
        bulkCounts.set(key, (bulkCounts.get(key) ?? 0) + Number(a.count ?? 0));
        if (!bulkTxs.has(key)) bulkTxs.set(key, new Set());
        bulkTxs.get(key)!.add(l.transactionHash ?? '0x');
      }

      const singleCounts = new Map<string, number>();
      const singleTxs = new Map<string, Set<`0x${string}`>>();
      for (const l of singleCids) {
        const a = (l as any).args;
        if (a.valid === false) continue;
        const key = `${String(a.fileId).toLowerCase()}:${String(a.batchId)}`;
        singleCounts.set(key, (singleCounts.get(key) ?? 0) + 1);
        if (!singleTxs.has(key)) singleTxs.set(key, new Set());
        singleTxs.get(key)!.add(l.transactionHash ?? '0x');
      }

      const c1ByBatch = new Map<string, `0x${string}`>();
      for (const l of c1Logs) {
        const a = (l as any).args;
        const key = `${String(a.fileId).toLowerCase()}:${String(a.batchId)}`;
        c1ByBatch.set(key, l.transactionHash ?? '0x');
      }

      return logs.map(l => {
        const a = (l as any).args;
        const key = `${String(a.fileId).toLowerCase()}:${String(a.batchId)}`;
        const bulkCount = bulkCounts.get(key) ?? 0;
        const singleCount = singleCounts.get(key) ?? 0;
        const cidTxHashes = [...new Set([
          ...(bulkTxs.get(key) ? [...bulkTxs.get(key)!] : []),
          ...(singleTxs.get(key) ? [...singleTxs.get(key)!] : []),
        ])];
        return {
          fileId: a.fileId,
          batchId: a.batchId,
          dataOwner: a.dataOwner,
          dataId: a.dataId ?? '',
          n: Number(a.n),
          t: Number(a.t),
          keyEpoch: Number(a.keyEpoch),
          pieceCount: bulkCount > 0 ? bulkCount : singleCount,
          cidTxHashes,
          c1TxHash: c1ByBatch.get(key),
          blockNumber: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? '0x',
        } as DataBatch;
      }).sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

/**
 * The two access tables, a page at a time.
 *
 * Each row is one primary event -- a request, or a batch -- but the row is not
 * complete without a second stream: whether the request was fulfilled, and how
 * many pieces the batch ended up holding. Those cannot be paged alongside it,
 * and downloading them whole is what this is trying to stop.
 *
 * They do not have to be. A fulfilment is recorded at or after the request it
 * fulfils, and a piece is added at or after the batch that holds it, so every
 * joining row for a loaded page lies at or above the oldest block on that page.
 * Bounding the join there is exact, not approximate: nothing that belongs to a
 * loaded row can sit below it. The table is newest-first, so that window is the
 * recent tail and grows only as the reader asks for more.
 */
function joinFrom(rows: Array<{ blockNumber: string }>): string | undefined {
  if (rows.length === 0) return undefined;
  return rows.reduce((lowest, r) => (BigInt(r.blockNumber) < BigInt(lowest) ? r.blockNumber : lowest), rows[0].blockNumber);
}

async function fetchJoin(event: string, fromBlock: string | undefined, contract = 'DataVault') {
  if (fromBlock === undefined) return [];
  const query = new URLSearchParams({ contract, event, fromBlock, limit: '5000' });
  const res = await fetch(`/api/index/events?${query}`, { cache: 'default' }).catch(() => null);
  if (!res || !res.ok) return [];
  const body = await res.json();
  return (body?.rows ?? []) as Array<{ args?: Record<string, unknown>; transactionHash?: string }>;
}

/**
 * The same join, bounded the other way.
 *
 * `fetchJoin` asks from the page's oldest block forward, which is right for
 * anything recorded *because* of a row: a partial answers a request, so it
 * cannot precede it. A committee is the opposite. The DKG finalises before
 * anybody can request against it -- here at block 5,671 against a request at
 * 6,157 -- so asking forward from the request excludes the very row that says
 * how many shares it needs. Every request then had a threshold of nothing and
 * read as pending, which is exactly what it did.
 */
async function fetchJoinBefore(event: string, toBlock: string | undefined, contract: string) {
  if (toBlock === undefined) return [];
  const query = new URLSearchParams({ contract, event, toBlock, limit: '5000' });
  const res = await fetch(`/api/index/events?${query}`, { cache: 'default' }).catch(() => null);
  if (!res || !res.ok) return [];
  const body = await res.json();
  return (body?.rows ?? []) as Array<{ args?: Record<string, unknown>; transactionHash?: string }>;
}

/// The newest block on the page, which bounds a backward join.
function joinTo(rows: Array<{ blockNumber: string }>): string | undefined {
  if (rows.length === 0) return undefined;
  return rows.reduce((h, r) => (BigInt(r.blockNumber) > BigInt(h) ? r.blockNumber : h), rows[0].blockNumber);
}

/**
 * Whether each request has the guardian shares it needs, and how many it has.
 *
 * Fulfilment used to be read from the vault's `ReencryptedCidsStored`. That event
 * cannot fire on a v2 deployment: it comes from `storeReencryptedCids`, which is
 * `onlyTelg`, and `DataVault.telg` is the zero address because the deployment
 * wires that hook only for the legacy v1 contract. Every request therefore read
 * as pending forever, however complete it was.
 *
 * Under v2 the guardians do the re-encryption and write their parts to TElGv2 --
 * the values themselves, `E1x/E1y/E2x/E2y`, not a reference to them. The request
 * is answerable once the committee's threshold of them has been submitted,
 * because that is what the threshold means: the requester can combine them and
 * recover the key.
 *
 * The threshold is the **DKG committee's**, from `ZkDkgV2Finalized`, keyed by
 * file and key epoch and share version. It is not the `t` in `BatchCreated`:
 * that one belongs to the erasure coding, and says how many of the six stored
 * pieces rebuild the file. The two are unrelated and here they differ -- the
 * committee is 3 of 5, the pieces are 4 of 6. Taking the pieces' figure calls a
 * finished request unfinished, which is precisely what it did: three guardians
 * had answered, three were needed, and the screen asked for four.
 *
 * Guardians are counted distinctly across both partial events. A guardian that
 * submits the per-request and the per-batch form is one guardian, and counting it
 * twice would declare a threshold met two shares early.
 */
function shareProgress(
  perRequest: Array<{ args?: Record<string, unknown> }>,
  perBatch: Array<{ args?: Record<string, unknown> }>,
  committees: Array<{ args?: Record<string, unknown> }>,
) {
  const guardians = new Map<string, Set<string>>();
  for (const row of [...perRequest, ...perBatch]) {
    const a = row.args ?? {};
    const id = String(a.requestId);
    const guardian = String(a.guardian ?? '').toLowerCase();
    if (!guardian) continue;
    if (!guardians.has(id)) guardians.set(id, new Set());
    guardians.get(id)!.add(guardian);
  }

  // Keyed by file, epoch and share version together, because a file re-keyed for
  // a new epoch gets a fresh committee and an old request must keep being judged
  // by the committee that actually held its shares.
  const threshold = new Map<string, number>();
  for (const row of committees) {
    const a = row.args ?? {};
    threshold.set(committeeKey(a.fileId, a.keyEpoch, a.shareVersion), Number(a.t ?? 0));
  }

  return { guardians, threshold };
}

function committeeKey(fileId: unknown, keyEpoch: unknown, shareVersion: unknown) {
  return `${String(fileId).toLowerCase()}:${String(keyEpoch)}:${String(shareVersion)}`;
}

type RawRow = { name?: string; args?: Record<string, unknown>; blockNumber: string; transactionHash: string };

export function usePagedAccessRequests(pageSize = 200) {
  const paged = usePagedIndex<RawRow>('events', { contract: 'DataVault', event: 'DataAccessRequestedV2' }, pageSize);
  const fromBlock = joinFrom(paged.rows);
  const toBlock = joinTo(paged.rows);
  // Partials answer a request, so they lie at or after it and join forward. The
  // committee is agreed before any request can name it, so it joins backward.
  const [perRequest, perBatch] = useQueries({
    queries: (['V2AccessPartialSubmitted', 'V2BatchAccessPartialSubmitted'] as const).map(name => ({
      queryKey: ['access-shares', 'TElGv2', name, fromBlock],
      queryFn: () => fetchJoin(name, fromBlock, 'TElGv2'),
      enabled: fromBlock !== undefined,
      staleTime: 10_000,
    })),
  });
  const { data: committeeRows } = useQuery({
    queryKey: ['access-committee', toBlock],
    queryFn: () => fetchJoinBefore('ZkDkgV2Finalized', toBlock, 'ZkDkgCoordinatorV2'),
    enabled: toBlock !== undefined,
    staleTime: 10_000,
  });
  const committees = { data: committeeRows };

  const { guardians, threshold } = shareProgress(
    perRequest.data ?? [], perBatch.data ?? [], committees.data ?? [],
  );

  const rows: AccessRequest[] = paged.rows.map((row) => {
    const a = reviveArgs(row.args ?? {}) as Record<string, any>;
    const submitted = guardians.get(String(a.requestId))?.size ?? 0;
    const required = threshold.get(committeeKey(a.fileId, a.keyEpoch, a.shareVersion)) ?? 0;
    return {
      requestId: a.requestId,
      fileId: a.fileId,
      requester: a.requester,
      batchId: a.batchId,
      dataId: a.dataId ?? '',
      keyEpoch: Number(a.keyEpoch ?? 0),
      shareVersion: Number(a.shareVersion ?? 0),
      pieceCount: Array.isArray(a.indices) ? a.indices.length : 0,
      // A threshold of zero is a batch this page has not read, not a batch that
      // needs nothing: without it, every request would report itself complete.
      fulfilled: required > 0 && submitted >= required,
      sharesSubmitted: submitted,
      sharesRequired: required,
      blockNumber: BigInt(row.blockNumber ?? 0),
      txHash: (row.transactionHash ?? '0x') as `0x${string}`,
    };
  });

  return { ...paged, rows };
}

export function usePagedDataBatches(pageSize = 200) {
  const paged = usePagedIndex<RawRow>('events', { contract: 'DataVault', event: 'BatchCreated' }, pageSize);
  const fromBlock = joinFrom(paged.rows);
  const [bulk, single, c1] = useQueries({
    queries: (['EncCidsBatchAdded', 'EncCidAddedV2', 'V2BatchC1Set'] as const).map(name => ({
      queryKey: ['batch-join', name, fromBlock],
      queryFn: () => fetchJoin(name, fromBlock),
      enabled: fromBlock !== undefined,
      staleTime: 10_000,
    })),
  });

  const keyOf = (a: Record<string, unknown>) =>
    `${String(a.fileId).toLowerCase()}:${String(a.batchId)}`;

  const bulkCounts = new Map<string, number>();
  const txsByKey = new Map<string, Set<`0x${string}`>>();
  const noteTx = (key: string, tx: string | undefined) => {
    if (!txsByKey.has(key)) txsByKey.set(key, new Set());
    txsByKey.get(key)!.add((tx ?? '0x') as `0x${string}`);
  };
  for (const l of bulk.data ?? []) {
    const a = l.args ?? {};
    const key = keyOf(a);
    bulkCounts.set(key, (bulkCounts.get(key) ?? 0) + Number(a.count ?? 0));
    noteTx(key, l.transactionHash);
  }
  const singleCounts = new Map<string, number>();
  for (const l of single.data ?? []) {
    const a = l.args ?? {};
    // An invalidated CID is not a piece.
    if (a.valid === false || a.valid === 'false') continue;
    const key = keyOf(a);
    singleCounts.set(key, (singleCounts.get(key) ?? 0) + 1);
    noteTx(key, l.transactionHash);
  }
  const c1ByBatch = new Map<string, `0x${string}`>();
  for (const l of c1.data ?? []) {
    c1ByBatch.set(keyOf(l.args ?? {}), (l.transactionHash ?? '0x') as `0x${string}`);
  }

  const rows: DataBatch[] = paged.rows.map((row) => {
    const a = reviveArgs(row.args ?? {}) as Record<string, any>;
    const key = `${String(a.fileId).toLowerCase()}:${String(a.batchId)}`;
    const bulkCount = bulkCounts.get(key) ?? 0;
    return {
      fileId: a.fileId,
      batchId: a.batchId,
      dataOwner: a.dataOwner,
      dataId: a.dataId ?? '',
      n: Number(a.n ?? 0),
      t: Number(a.t ?? 0),
      keyEpoch: Number(a.keyEpoch ?? 0),
      pieceCount: bulkCount > 0 ? bulkCount : (singleCounts.get(key) ?? 0),
      cidTxHashes: [...(txsByKey.get(key) ?? [])],
      c1TxHash: c1ByBatch.get(key),
      blockNumber: BigInt(row.blockNumber ?? 0),
      txHash: (row.transactionHash ?? '0x') as `0x${string}`,
    };
  });

  return { ...paged, rows };
}
