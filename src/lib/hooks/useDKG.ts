'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { ZkDkgCoordinatorV2ABI } from '@/lib/abis/ZkDkgCoordinatorV2';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { fileScope, getIndexedLogs } from '@/lib/indexedLogs';
import { usePagedWithJoins } from '@/lib/hooks/useEventCounts';
import { dkgDealerMaterials, dkgSessionScope } from '@/lib/dkgSessionScope.mjs';

export interface DKGSession {
  fileId: `0x${string}`;
  keyEpoch: number;
  /** 'fresh' = new key generated; 'refresh' = same public key, reshared among guardians */
  type: 'fresh' | 'refresh';
  status: 'finalized' | 'expired' | 'in_progress' | 'cancelled' | 'unactivated';
  materialId?: `0x${string}`;
  dataOwner?: `0x${string}`;
  n?: number;
  t?: number;
  shareVersion?: number;
  publicKeyX?: bigint;
  publicKeyY?: bigint;
  nonParticipantCount?: number;
  blockNumber: bigint;
  txHash: `0x${string}`;
  dealerCount: number;
  materialTxHashes: `0x${string}`[];
}

/// `fileId` limits it to one file's rounds.
export function useDKG({ fileId }: { fileId?: string } = {}) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['dkg', fileId ?? 'all'],
    queryFn: async (): Promise<DKGSession[]> => {
      const [finalized, refreshFinalized, expired, refreshExpired, dealerMaterials, closed, commitments] = await Promise.all([
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.ZkDkgCoordinatorV2,
          event: ZkDkgCoordinatorV2ABI.find(e => e.name === 'ZkDkgV2Finalized')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.ZkDkgCoordinatorV2,
          event: ZkDkgCoordinatorV2ABI.find(e => e.name === 'ZkDkgV2SamePkRefreshFinalized')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.ZkDkgCoordinatorV2,
          event: ZkDkgCoordinatorV2ABI.find(e => e.name === 'DkgKeyGenExpired')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.ZkDkgCoordinatorV2,
          event: ZkDkgCoordinatorV2ABI.find(e => e.name === 'V2RefreshExpired')! as any,
        }).catch(() => []),
        getIndexedLogs({
          ...fileScope(fileId),
          address: CONTRACTS.ZkDkgCoordinatorV2,
          event: ZkDkgCoordinatorV2ABI.find(e => e.name === 'ZkDkgV2DealerMaterialAccepted')! as any,
        }).catch(() => []),
        getIndexedLogs({ ...fileScope(fileId), address: CONTRACTS.ZkDkgCoordinatorV2,
          event: ZkDkgCoordinatorV2ABI.find(e=>e.name==='AttemptClosed')! as any }).catch(()=>[]),
        getIndexedLogs({ ...fileScope(fileId), address: CONTRACTS.ZkDkgCoordinatorV2,
          event: ZkDkgCoordinatorV2ABI.find(e=>e.name==='V2DealerCommitmentsPublished')! as any }).catch(()=>[]),
      ]);

      const { counts: dealerCountMap, transactions: materialTxMap } = dkgDealerMaterials(dealerMaterials, commitments);

      const finalizedKeys = new Set([
        ...finalized.map(f => dkgSessionScope((f as any).args)),
        ...refreshFinalized.map(f => dkgSessionScope((f as any).args,true)),
      ]);

      const sessions: DKGSession[] = [];

      for (const f of finalized) {
        const a = (f as any).args;
        const key = dkgSessionScope(a, Number(a.shareVersion) > 1);
        sessions.push({
          fileId: a.fileId,
          materialId: a.materialId,
          keyEpoch: Number(a.keyEpoch),
          type: 'fresh',
          status: 'finalized',
          dataOwner: a.dataOwner,
          n: Number(a.n),
          t: Number(a.t),
          shareVersion: Number(a.shareVersion),
          publicKeyX: a.publicKeyX,
          publicKeyY: a.publicKeyY,
          blockNumber: f.blockNumber ?? 0n,
          txHash: f.transactionHash ?? '0x',
          dealerCount: dealerCountMap.get(key) ?? 0,
          materialTxHashes: [...(materialTxMap.get(key) ?? new Set<`0x${string}`>())],
        });
      }

      for (const f of refreshFinalized) {
        const a = (f as any).args;
        const key = dkgSessionScope(a, Number(a.shareVersion) > 1);
        sessions.push({
          fileId: a.fileId,
          materialId: a.materialId,
          keyEpoch: Number(a.keyEpoch),
          type: 'refresh',
          status: 'finalized',
          n: Number(a.newN),
          t: Number(a.newT),
          shareVersion: Number(a.shareVersion),
          blockNumber: f.blockNumber ?? 0n,
          txHash: f.transactionHash ?? '0x',
          dealerCount: dealerCountMap.get(key) ?? 0,
          materialTxHashes: [...(materialTxMap.get(key) ?? new Set<`0x${string}`>())],
        });
      }

      for (const e of expired) {
        const a = (e as any).args;
        const key = dkgSessionScope(a, Number(a.shareVersion) > 1);
        if (!finalizedKeys.has(key)) {
          sessions.push({
            fileId: a.fileId,
            materialId: a.materialId,
            keyEpoch: Number(a.keyEpoch),
            type: 'fresh',
            status: 'expired',
            nonParticipantCount: Number(a.nonParticipantCount),
            blockNumber: e.blockNumber ?? 0n,
            txHash: e.transactionHash ?? '0x',
            dealerCount: dealerCountMap.get(key) ?? 0,
            materialTxHashes: [...(materialTxMap.get(key) ?? new Set<`0x${string}`>())],
          });
        }
      }

      for (const e of refreshExpired) {
        const a = (e as any).args;
        const key = dkgSessionScope(a,true);
        if (!finalizedKeys.has(key)) {
          sessions.push({
            fileId: a.fileId,
            materialId: a.materialId,
            keyEpoch: Number(a.keyEpoch),
            type: 'refresh',
            status: 'expired',
            nonParticipantCount: Number(a.absentCount),
            shareVersion: Number(a.shareVersion),
            blockNumber: e.blockNumber ?? 0n,
            txHash: e.transactionHash ?? '0x',
            dealerCount: dealerCountMap.get(key) ?? 0,
            materialTxHashes: [...(materialTxMap.get(key) ?? new Set<`0x${string}`>())],
          });
        }
      }

      for(const event of closed) {
        const a=(event as any).args;
        if(![5,6].includes(Number(a.outcome)))continue;
        const key=dkgSessionScope(a);
        sessions.push({fileId:a.fileId,materialId:a.materialId,keyEpoch:Number(a.epoch),shareVersion:Number(a.version),
          type:Number(a.version)>1?'refresh':'fresh',status:Number(a.outcome)===5?'cancelled':'unactivated',
          blockNumber:event.blockNumber??0n,txHash:event.transactionHash??'0x',
          dealerCount:dealerCountMap.get(key)??0,materialTxHashes:[...(materialTxMap.get(key)??[])]});
      }
      return sessions.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

/**
 * DKG sessions, a page at a time.
 *
 * A session is either finalized or it expires, so four streams are the rows and
 * dealer material is later news joined over the window they cover. The two
 * finalization streams are joined as well as paged: an expiry is only shown when
 * the same session did not finalize, and that check has to see finalizations
 * beyond the page it is looking at.
 */
const DKG_ROW_EVENTS = [
  'ZkDkgV2Finalized', 'ZkDkgV2SamePkRefreshFinalized',
  'DkgKeyGenExpired', 'V2RefreshExpired',
  'AttemptClosed',
] as const;

export function usePagedDKG(pageSize = 200) {
  return usePagedWithJoins<DKGSession>(
    'ZkDkgCoordinatorV2', DKG_ROW_EVENTS,
    ['ZkDkgV2DealerMaterialAccepted', 'V2DealerCommitmentsPublished', 'ZkDkgV2Finalized', 'ZkDkgV2SamePkRefreshFinalized'],
    (rows, joined) => {
      const { counts: dealerCount, transactions: materialTx } = dkgDealerMaterials(
        joined.ZkDkgV2DealerMaterialAccepted, joined.V2DealerCommitmentsPublished,
      );

      const finalizedKeys = new Set([
        ...joined.ZkDkgV2Finalized.map(f => {
          const a = f.args as Record<string, any>;
          return dkgSessionScope(a);
        }),
        ...joined.ZkDkgV2SamePkRefreshFinalized.map(f => {
          const a = f.args as Record<string, any>;
          return dkgSessionScope(a,true);
        }),
      ]);

      const sessions: DKGSession[] = [];
      for (const { name, args, blockNumber, transactionHash } of rows) {
        const a = args as Record<string, any>;
        const key = dkgSessionScope(a, Number(a.shareVersion) > 1);
        const at = {
          fileId: a.fileId as `0x${string}`,
          materialId: a.materialId as `0x${string}` | undefined,
          keyEpoch: Number(a.keyEpoch ?? 0),
          blockNumber: BigInt(blockNumber ?? 0),
          txHash: (transactionHash ?? '0x') as `0x${string}`,
          dealerCount: dealerCount.get(key) ?? 0,
          materialTxHashes: [...(materialTx.get(key) ?? new Set<`0x${string}`>())],
        };

        if (name === 'ZkDkgV2Finalized') {
          sessions.push({
            ...at, type: 'fresh', status: 'finalized', dataOwner: a.dataOwner,
            n: Number(a.n ?? 0), t: Number(a.t ?? 0), shareVersion: Number(a.shareVersion ?? 0),
            publicKeyX: a.publicKeyX, publicKeyY: a.publicKeyY,
          });
        } else if (name === 'ZkDkgV2SamePkRefreshFinalized') {
          sessions.push({
            ...at, type: 'refresh', status: 'finalized',
            n: Number(a.newN ?? 0), t: Number(a.newT ?? 0), shareVersion: Number(a.shareVersion ?? 0),
          });
        } else if (name === 'DkgKeyGenExpired') {
          if (finalizedKeys.has(key)) continue;
          sessions.push({
            ...at, type: 'fresh', status: 'expired',
            nonParticipantCount: Number(a.nonParticipantCount ?? 0),
          });
        } else if (name === 'V2RefreshExpired') {
          if (finalizedKeys.has(dkgSessionScope(a,true))) continue;
          sessions.push({
            ...at, type: 'refresh', status: 'expired',
            nonParticipantCount: Number(a.absentCount ?? 0),
            shareVersion: Number(a.shareVersion ?? 0),
          });
        } else if(name==='AttemptClosed' && [5,6].includes(Number(a.outcome))) {
          sessions.push({...at,keyEpoch:Number(a.epoch),shareVersion:Number(a.version),
            type:Number(a.version)>1?'refresh':'fresh',status:Number(a.outcome)===5?'cancelled':'unactivated'});
        }
      }
      return sessions;
    },
    pageSize,
  );
}
