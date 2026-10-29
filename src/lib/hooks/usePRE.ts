'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { GuardianShareProofABI } from '@/lib/abis/GuardianShareProof';
import { TElGv2ABI } from '@/lib/abis/TElGv2';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { fileScope, getIndexedLogs } from '@/lib/indexedLogs';
import { usePagedWithJoins, usePagedIndex, usePagedEventRows } from '@/lib/hooks/useEventCounts';

export interface PRESession {
  policyId: `0x${string}`;
  dataOwner: `0x${string}`;
  serviceStart: bigint;
  serviceEnd: bigint;
  durationDays: bigint;
  /** Guardians who registered their re-encryption public key (readiness for service) */
  readyCount: number;
  /** Guardians with at least one valid periodic share proof (health check) */
  provedCount: number;
  status: 'active' | 'expired';
  blockNumber: bigint;
  txHash: `0x${string}`;
}

export interface PREShare {
  policyId: `0x${string}`;
  keyEpoch: number;
  guardian: `0x${string}`;
  shareVersion: number;
  shareIndex: number;
  blockNumber: bigint;
  txHash: `0x${string}`;
}

/** Per-guardian status within a policy */
export interface GuardianPolicyStatus {
  guardian: `0x${string}`;
  policyId: `0x${string}`;
  keyEpoch: number;
  shareIndex: number;
  registered: boolean;
  hasValidProof: boolean;
  hasMissedProof: boolean;
  validProofCount: number;
  missedProofCount: number;
  /** 'proved' = registered + valid heartbeat; 'ready' = registered only; 'missed' = registered + missed but no valid */
  status: 'proved' | 'ready' | 'missed';
  registeredBlock: bigint;
  lastProofBlock: bigint;
}

/** Per-guardian participation in a specific PRE re-encryption request */
export interface PRERequestGuardian {
  guardian: `0x${string}`;
  declaredReady: boolean;
  submittedPartial: boolean;
  badPartial: boolean;
  shareIndex?: number;
}

/** A single PRE re-encryption request */
export interface PRERequest {
  requestId: bigint;
  fileId: `0x${string}`;
  readyGuardians: `0x${string}`[];
  activeGuardians: `0x${string}`[];
  badPartialGuardians: `0x${string}`[];
  expired: boolean;
  absentCount?: number;
  /** Guardians who declared ready but did NOT submit a partial */
  notUsedGuardians: `0x${string}`[];
  blockNumber: bigint;
  txHashes: `0x${string}`[];
}

function GSP(name: string) {
  return getIndexedLogs({
    address: CONTRACTS.GuardianShareProof,
    event: GuardianShareProofABI.find(e => e.name === name)! as any,
  }).catch(() => []);
}

function TElG(name: string, fileId?: string) {
  return getIndexedLogs({
    ...fileScope(fileId),
    address: CONTRACTS.TElGv2,
    event: TElGv2ABI.find(e => e.name === name)! as any,
  }).catch(() => []);
}

export function usePRESessions() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['pre-sessions'],
    queryFn: async (): Promise<PRESession[]> => {
      const [policies, shares, proofs] = await Promise.all([
        GSP('PolicyServicePeriodSet'),
        GSP('GuardianPublicShareRegistered'),
        GSP('ShareProofSubmitted'),
      ]);

      const now = BigInt(Math.floor(Date.now() / 1000));

      const readyByPolicy = new Map<string, Set<string>>();
      for (const s of shares) {
        const a = (s as any).args;
        const key = a.policyId as string;
        if (!readyByPolicy.has(key)) readyByPolicy.set(key, new Set());
        readyByPolicy.get(key)!.add((a.guardian as string).toLowerCase());
      }

      const provedByPolicy = new Map<string, Set<string>>();
      for (const p of proofs) {
        const a = (p as any).args;
        if (!a.valid) continue;
        const key = a.policyId as string;
        if (!provedByPolicy.has(key)) provedByPolicy.set(key, new Set());
        provedByPolicy.get(key)!.add((a.guardian as string).toLowerCase());
      }

      return policies.map(l => {
        const a = (l as any).args;
        const key = a.policyId as string;
        return {
          policyId: a.policyId,
          dataOwner: a.dataOwner,
          serviceStart: a.serviceStart ?? 0n,
          serviceEnd: a.serviceEnd ?? 0n,
          durationDays: a.durationDays ?? 0n,
          readyCount: readyByPolicy.get(key)?.size ?? 0,
          provedCount: provedByPolicy.get(key)?.size ?? 0,
          status: (a.serviceEnd ?? 0n) < now ? 'expired' : 'active',
          blockNumber: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? '0x',
        } satisfies PRESession;
      }).sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

export function usePREShares() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['pre-shares'],
    queryFn: async (): Promise<PREShare[]> => {
      const logs = await GSP('GuardianPublicShareRegistered');
      return logs.map(l => {
        const a = (l as any).args;
        return {
          policyId: a.policyId,
          keyEpoch: Number(a.keyEpoch),
          guardian: a.guardian,
          shareVersion: Number(a.shareVersion),
          shareIndex: Number(a.shareIndex),
          blockNumber: l.blockNumber ?? 0n,
          txHash: l.transactionHash ?? '0x',
        } satisfies PREShare;
      }).sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

export function usePREGuardianStatus() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['pre-guardian-status'],
    queryFn: async (): Promise<GuardianPolicyStatus[]> => {
      const [shares, proofs, missed] = await Promise.all([
        GSP('GuardianPublicShareRegistered'),
        GSP('ShareProofSubmitted'),
        GSP('ShareProofMissed'),
      ]);

      type RegInfo = { keyEpoch: number; shareIndex: number; block: bigint };
      const regMap = new Map<string, RegInfo>();
      for (const s of shares) {
        const a = (s as any).args;
        const key = `${a.policyId}:${(a.guardian as string).toLowerCase()}`;
        regMap.set(key, {
          keyEpoch: Number(a.keyEpoch),
          shareIndex: Number(a.shareIndex),
          block: s.blockNumber ?? 0n,
        });
      }

      const validCount = new Map<string, number>();
      const lastProofBlock = new Map<string, bigint>();
      for (const p of proofs) {
        const a = (p as any).args;
        if (!a.valid) continue;
        const key = `${a.policyId}:${(a.guardian as string).toLowerCase()}`;
        validCount.set(key, (validCount.get(key) ?? 0) + 1);
        const blk = p.blockNumber ?? 0n;
        if (!lastProofBlock.has(key) || blk > lastProofBlock.get(key)!) {
          lastProofBlock.set(key, blk);
        }
      }

      const missedCount = new Map<string, number>();
      for (const m of missed) {
        const a = (m as any).args;
        const key = `${a.policyId}:${(a.guardian as string).toLowerCase()}`;
        missedCount.set(key, (missedCount.get(key) ?? 0) + 1);
      }

      const result: GuardianPolicyStatus[] = [];
      for (const s of shares) {
        const a = (s as any).args;
        const policyId = a.policyId as `0x${string}`;
        const guardian = a.guardian as `0x${string}`;
        const key = `${policyId}:${guardian.toLowerCase()}`;
        const valid = validCount.get(key) ?? 0;
        const miss = missedCount.get(key) ?? 0;
        const hasValid = valid > 0;
        const hasMissed = miss > 0;
        result.push({
          guardian,
          policyId,
          keyEpoch: Number(a.keyEpoch),
          shareIndex: Number(a.shareIndex),
          registered: true,
          hasValidProof: hasValid,
          hasMissedProof: hasMissed,
          validProofCount: valid,
          missedProofCount: miss,
          status: hasValid ? 'proved' : hasMissed ? 'missed' : 'ready',
          registeredBlock: s.blockNumber ?? 0n,
          lastProofBlock: lastProofBlock.get(key) ?? 0n,
        });
      }

      return result.sort((a, b) => {
        const order = { proved: 0, ready: 1, missed: 2 };
        const od = order[a.status] - order[b.status];
        return od !== 0 ? od : a.shareIndex - b.shareIndex;
      });
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

/// `fileId` limits it to one file's requests.
export function usePRERequests({ fileId }: { fileId?: string } = {}) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['pre-requests', fileId ?? 'all'],
    queryFn: async (): Promise<PRERequest[]> => {
      const [readyLogs, partialLogs, batchLogs, badLogs, expiredLogs] = await Promise.all([
        TElG('PreReadyDeclared', fileId),
        TElG('V2AccessPartialSubmitted', fileId),
        TElG('V2BatchAccessPartialSubmitted', fileId),
        TElG('PreBadPartialDetected', fileId),
        TElG('PreRequestExpired', fileId),
      ]);

      // Collect all requestIds seen
      const requestMap = new Map<string, {
        requestId: bigint;
        fileId: `0x${string}`;
        ready: Set<string>;
        active: Set<string>;
        bad: Set<string>;
        expired: boolean;
        absentCount?: number;
        blockNumber: bigint;
        txHashes: Set<`0x${string}`>;
      }>();

      function getOrCreate(requestId: bigint, fileId: `0x${string}`, blockNumber: bigint) {
        const key = requestId.toString();
        if (!requestMap.has(key)) {
          requestMap.set(key, {
            requestId,
            fileId,
            ready: new Set(),
            active: new Set(),
            bad: new Set(),
            expired: false,
            blockNumber,
            txHashes: new Set(),
          });
        }
        const entry = requestMap.get(key)!;
        if (blockNumber < entry.blockNumber) entry.blockNumber = blockNumber;
        return entry;
      }

      for (const l of readyLogs) {
        const a = (l as any).args;
        const entry = getOrCreate(a.requestId as bigint, a.fileId as `0x${string}`, l.blockNumber ?? 0n);
        entry.ready.add((a.guardian as string).toLowerCase());
        entry.txHashes.add(l.transactionHash ?? '0x');
      }

      for (const l of partialLogs) {
        const a = (l as any).args;
        const entry = getOrCreate(a.requestId as bigint, a.fileId as `0x${string}`, l.blockNumber ?? 0n);
        entry.active.add((a.guardian as string).toLowerCase());
        entry.txHashes.add(l.transactionHash ?? '0x');
      }

      for (const l of batchLogs) {
        const a = (l as any).args;
        const entry = getOrCreate(a.requestId as bigint, a.fileId as `0x${string}`, l.blockNumber ?? 0n);
        // guardian is not indexed in V2BatchAccessPartialSubmitted
        if (a.guardian) entry.active.add((a.guardian as string).toLowerCase());
        entry.txHashes.add(l.transactionHash ?? '0x');
      }

      for (const l of badLogs) {
        const a = (l as any).args;
        const entry = getOrCreate(a.requestId as bigint, a.fileId as `0x${string}`, l.blockNumber ?? 0n);
        entry.bad.add((a.guardian as string).toLowerCase());
        entry.txHashes.add(l.transactionHash ?? '0x');
      }

      for (const l of expiredLogs) {
        const a = (l as any).args;
        const entry = getOrCreate(a.requestId as bigint, a.fileId as `0x${string}`, l.blockNumber ?? 0n);
        entry.expired = true;
        entry.absentCount = Number(a.absentCount);
        entry.txHashes.add(l.transactionHash ?? '0x');
      }

      return Array.from(requestMap.values()).map(r => {
        const activeArr = Array.from(r.active) as `0x${string}`[];
        const readyArr = Array.from(r.ready) as `0x${string}`[];
        const notUsed = readyArr.filter(g => !r.active.has(g));
        return {
          requestId: r.requestId,
          fileId: r.fileId,
          readyGuardians: readyArr,
          activeGuardians: activeArr,
          badPartialGuardians: Array.from(r.bad) as `0x${string}`[],
          expired: r.expired,
          absentCount: r.absentCount,
          notUsedGuardians: notUsed,
          blockNumber: r.blockNumber,
          txHashes: [...r.txHashes],
        } satisfies PRERequest;
      }).sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

/**
 * PRE service periods, a page at a time.
 *
 * A policy's service period is the row; guardian readiness and share proofs are
 * later news about it, joined over the window the loaded page covers.
 */
export function usePagedPRESessions(pageSize = 200) {
  return usePagedWithJoins<PRESession>(
    'GuardianShareProof', 'PolicyServicePeriodSet',
    ['GuardianPublicShareRegistered', 'ShareProofSubmitted'],
    (rows, joined) => {
      const now = BigInt(Math.floor(Date.now() / 1000));

      const bucket = (
        logs: Array<{ args: Record<string, unknown> }>,
        keep: (a: Record<string, any>) => boolean,
      ) => {
        const byPolicy = new Map<string, Set<string>>();
        for (const l of logs) {
          const a = l.args as Record<string, any>;
          if (!keep(a)) continue;
          const key = String(a.policyId);
          if (!byPolicy.has(key)) byPolicy.set(key, new Set());
          byPolicy.get(key)!.add(String(a.guardian).toLowerCase());
        }
        return byPolicy;
      };

      const ready = bucket(joined.GuardianPublicShareRegistered, () => true);
      // Only a proof that verified counts as proved.
      const proved = bucket(joined.ShareProofSubmitted, a => Boolean(a.valid));

      return rows.map(({ args, blockNumber, transactionHash }) => {
        const a = args as Record<string, any>;
        const key = String(a.policyId);
        const serviceEnd = (a.serviceEnd ?? 0n) as bigint;
        return {
          policyId: a.policyId,
          dataOwner: a.dataOwner,
          serviceStart: (a.serviceStart ?? 0n) as bigint,
          serviceEnd,
          durationDays: (a.durationDays ?? 0n) as bigint,
          readyCount: ready.get(key)?.size ?? 0,
          provedCount: proved.get(key)?.size ?? 0,
          status: serviceEnd < now ? 'expired' : 'active',
          blockNumber: BigInt(blockNumber ?? 0),
          txHash: (transactionHash ?? '0x') as `0x${string}`,
        } satisfies PRESession;
      });
    },
    pageSize,
  );
}

/**
 * PRE requests, a page at a time, from the rollup.
 *
 * This is the one table that could not be paged the way the others were. The
 * rule the other joins rely on is "later news about an earlier thing": a
 * deletion follows a registration, so bounding the join at the oldest loaded row
 * cannot miss anything. That rule does not hold here -- a request can appear in
 * an expiry with no readiness declaration before it, so no stream is reliably
 * first, and a window bounded below by the oldest loaded row would cut off
 * earlier events belonging to a row on the page.
 *
 * It is not a sum either: a row carries sets of guardian addresses. So the five
 * streams are collected into one row per request during ingest, and that table
 * pages like any other.
 */
export function usePagedPRERequests(pageSize = 200) {
  const paged = usePagedIndex<Record<string, unknown>>('pre-requests', {}, pageSize);
  return {
    ...paged,
    rows: paged.rows.map((row) => {
      const r = row as Record<string, any>;
      return {
        requestId: BigInt(r.requestId ?? 0),
        fileId: r.fileId as `0x${string}`,
        readyGuardians: (r.readyGuardians ?? []) as `0x${string}`[],
        activeGuardians: (r.activeGuardians ?? []) as `0x${string}`[],
        badPartialGuardians: (r.badPartialGuardians ?? []) as `0x${string}`[],
        notUsedGuardians: (r.notUsedGuardians ?? []) as `0x${string}`[],
        expired: Boolean(r.expired),
        absentCount: Number(r.absentCount ?? 0),
        blockNumber: BigInt(r.blockNumber ?? 0),
        txHashes: (r.txHashes ?? []) as `0x${string}`[],
      } satisfies PRERequest;
    }),
  };
}

/** Registered public shares, a page at a time. One row is one event. */
export function usePagedPREShares(pageSize = 200) {
  return usePagedEventRows<PREShare>('GuardianShareProof', ['GuardianPublicShareRegistered'], (row) => {
    const a = (row.args ?? {}) as Record<string, any>;
    return {
      policyId: a.policyId,
      keyEpoch: Number(a.keyEpoch ?? 0),
      guardian: a.guardian,
      shareVersion: Number(a.shareVersion ?? 0),
      shareIndex: Number(a.shareIndex ?? 0),
      blockNumber: BigInt(row.blockNumber ?? 0),
      txHash: (row.transactionHash ?? '0x') as `0x${string}`,
    } satisfies PREShare;
  }, pageSize);
}

/**
 * Guardian status per policy, a page at a time.
 *
 * The registration is the row; proofs and misses are later news about it, so
 * they are joined over the block window the loaded page covers. A guardian
 * cannot prove a share before registering it, which is what makes that window
 * exact rather than approximate.
 */
export function usePagedPREGuardianStatus(pageSize = 200) {
  return usePagedWithJoins<GuardianPolicyStatus>(
    'GuardianShareProof', 'GuardianPublicShareRegistered',
    ['ShareProofSubmitted', 'ShareProofMissed'],
    (rows, joined) => {
      const keyOf = (a: Record<string, any>) =>
        `${a.policyId}:${String(a.guardian).toLowerCase()}`;

      const validCount = new Map<string, number>();
      const lastProofBlock = new Map<string, bigint>();
      for (const p of joined.ShareProofSubmitted) {
        const a = p.args as Record<string, any>;
        // Only a proof that verified counts as a heartbeat.
        if (!a.valid) continue;
        const key = keyOf(a);
        validCount.set(key, (validCount.get(key) ?? 0) + 1);
        const block = BigInt(p.blockNumber ?? 0);
        if (block > (lastProofBlock.get(key) ?? 0n)) lastProofBlock.set(key, block);
      }
      const missedCount = new Map<string, number>();
      for (const m of joined.ShareProofMissed) {
        const key = keyOf(m.args as Record<string, any>);
        missedCount.set(key, (missedCount.get(key) ?? 0) + 1);
      }

      return rows.map(({ args, blockNumber }) => {
        const a = args as Record<string, any>;
        const key = keyOf(a);
        const valid = validCount.get(key) ?? 0;
        const miss = missedCount.get(key) ?? 0;
        return {
          guardian: a.guardian,
          policyId: a.policyId,
          keyEpoch: Number(a.keyEpoch ?? 0),
          shareIndex: Number(a.shareIndex ?? 0),
          registered: true,
          hasValidProof: valid > 0,
          hasMissedProof: miss > 0,
          validProofCount: valid,
          missedProofCount: miss,
          status: valid > 0 ? 'proved' : miss > 0 ? 'missed' : 'ready',
          registeredBlock: BigInt(blockNumber ?? 0),
          lastProofBlock: lastProofBlock.get(key) ?? 0n,
        } satisfies GuardianPolicyStatus;
      });
    },
    pageSize,
  );
}
