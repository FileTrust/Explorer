'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { AccessControlFTABI } from '@/lib/abis/AccessControlFT';
import { DataVaultABI } from '@/lib/abis/DataVault';
import { CONTRACTS as ADDRESSES } from '@/lib/addresses';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { usePagedIndex } from '@/lib/hooks/useEventCounts';
import { reviveArgs } from '@/lib/indexedLogMatch.mjs';
import { fetchIndexedFilePolicies } from '@/lib/indexedData';
import { fileScope, getIndexedLogs } from '@/lib/indexedLogs';

export interface FilePolicy {
  fileId: `0x${string}`;
  exists: boolean;
  active: boolean;
  dataOwner: `0x${string}`;
  threshold: number;
  mode: 'LEGACY' | 'ZKDKG_V2';
  selectedGuardians: `0x${string}`[];
  requesterCount: number;
  keyGenRequested: boolean;
  keyGenRequestedAt: bigint;
  accessRequestCount: number;
  createdBlock?: bigint;
  createdTx?: `0x${string}`;
  updatedCount: number;
}

export interface PolicyEvent {
  type: string;
  fileId: `0x${string}`;
  actor?: `0x${string}`;
  blockNumber: bigint;
  txHash: `0x${string}`;
  detail: string;
  variant: 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'cyan' | 'gray';
}

function eventOf(name: string) {
  return AccessControlFTABI.find(e => e.name === name)! as any;
}

function modeName(mode: number | bigint) {
  return Number(mode) === 1 ? 'ZKDKG_V2' : 'LEGACY';
}

/// `fileId` limits it to one file: its policy, read once, and its events, from
/// one indexed request about that file.
export function usePolicies({ fileId }: { fileId?: `0x${string}` } = {}) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['file-policies', fileId ?? 'all'],
    queryFn: async (): Promise<{ policies: FilePolicy[]; events: PolicyEvent[] }> => {
      // Projected rows first. The chain path below lists every file id and then
      // makes four reads against each, so its cost follows the number of files --
      // the entity here that grows without any bound at all.
      const projected = fileId ? null : await fetchIndexedFilePolicies();

      const fileIds: readonly `0x${string}`[] = fileId
        ? [fileId]
        : projected
        ? projected.map(row => (row as { fileId: `0x${string}` }).fileId)
        : await publicClient.readContract({
          address: CONTRACTS.AccessControlFT,
          abi: AccessControlFTABI,
          functionName: 'getAllFileIds',
        }).catch(() => [] as `0x${string}`[]);
      const scope = fileScope(fileId);

      const [created, updated, status, modes, requesterAdded, requesterRemoved, keyReq, keyCleared, keyExpired, reencReq, reencCleared, accessReq] = await Promise.all([
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('FilePolicyCreated') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('FilePolicyUpdated') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('FilePolicyStatusChanged') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('FilePolicyModeSet') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('RequesterAddedToFile') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('RequesterRemovedFromFile') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('KeyGenRequestedForFile') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('KeyGenRequestForFileCleared') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('KeyGenRequestForFileExpired') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('ReencRequestedForFile') }).catch(() => []),
        getIndexedLogs({ ...scope, address: CONTRACTS.AccessControlFT, event: eventOf('ReencRequestForFileCleared') }).catch(() => []),
        getIndexedLogs({ ...scope, address: ADDRESSES.DataVault, event: DataVaultABI.find(e => e.name === 'DataAccessRequestedV2')! as any }).catch(() => []),
      ]);

      const requesterSets = new Map<string, Set<string>>();
      for (const log of requesterAdded) {
        const a = (log as any).args;
        const key = a.fileId as string;
        if (!requesterSets.has(key)) requesterSets.set(key, new Set());
        requesterSets.get(key)!.add((a.requester as string).toLowerCase());
      }
      for (const log of requesterRemoved) {
        const a = (log as any).args;
        requesterSets.get(a.fileId as string)?.delete((a.requester as string).toLowerCase());
      }

      const createdById = new Map<string, any>();
      const updatedCounts = new Map<string, number>();
      const accessCounts = new Map<string, number>();
      for (const log of created) createdById.set((log as any).args.fileId, log);
      for (const log of updated) {
        const id = (log as any).args.fileId as string;
        updatedCounts.set(id, (updatedCounts.get(id) ?? 0) + 1);
      }
      for (const log of accessReq) {
        const id = (log as any).args.fileId as string;
        accessCounts.set(id, (accessCounts.get(id) ?? 0) + 1);
      }

      const read = await Promise.all(fileIds.map(async fileId => {
        const [policy, mode, keyGenRequested, keyGenRequestedAt] = await Promise.all([
          // One file asked for by id may have no policy at all -- it can be a
          // piece's hash -- which is an empty answer, not a failed page.
          scope.subject
            ? publicClient.readContract({ address: CONTRACTS.AccessControlFT, abi: AccessControlFTABI, functionName: 'getFilePolicy', args: [fileId] }).catch(() => null)
            : publicClient.readContract({ address: CONTRACTS.AccessControlFT, abi: AccessControlFTABI, functionName: 'getFilePolicy', args: [fileId] }),
          publicClient.readContract({ address: CONTRACTS.AccessControlFT, abi: AccessControlFTABI, functionName: 'getFilePolicyMode', args: [fileId] }).catch(() => 0),
          publicClient.readContract({ address: CONTRACTS.AccessControlFT, abi: AccessControlFTABI, functionName: 'hasRequestedKeyGenForFile', args: [fileId] }).catch(() => false),
          publicClient.readContract({ address: CONTRACTS.AccessControlFT, abi: AccessControlFTABI, functionName: 'getKeyGenRequestedAtForFile', args: [fileId] }).catch(() => 0n),
        ]);
        if (!policy || (scope.subject && !policy[0])) return null;
        const createLog = createdById.get(fileId);
        return {
          fileId,
          exists: policy[0],
          active: policy[1],
          dataOwner: policy[2],
          threshold: Number(policy[3]),
          selectedGuardians: [...policy[4]],
          mode: modeName(mode),
          requesterCount: requesterSets.get(fileId)?.size ?? 0,
          keyGenRequested: Boolean(keyGenRequested),
          keyGenRequestedAt: BigInt(keyGenRequestedAt),
          accessRequestCount: accessCounts.get(fileId) ?? 0,
          createdBlock: createLog?.blockNumber,
          createdTx: createLog?.transactionHash,
          updatedCount: updatedCounts.get(fileId) ?? 0,
        } satisfies FilePolicy;
      }));
      const policies = read.filter((row): row is NonNullable<typeof row> => row !== null);

      const events: PolicyEvent[] = [];
      const addEvent = (type: string, log: any, detail: string, variant: PolicyEvent['variant'], actor?: `0x${string}`) => {
        events.push({ type, fileId: log.args.fileId, actor, blockNumber: log.blockNumber ?? 0n, txHash: log.transactionHash ?? '0x', detail, variant });
      };
      for (const l of created) addEvent('Policy Created', l as any, `Threshold ${(l as any).args.threshold} · ${(l as any).args.guardianCount} guardians`, 'green', (l as any).args.dataOwner);
      for (const l of updated) addEvent('Policy Updated', l as any, `Threshold ${(l as any).args.threshold} · ${(l as any).args.guardianCount} guardians`, 'blue', (l as any).args.dataOwner);
      for (const l of status) addEvent('Policy Status', l as any, (l as any).args.active ? 'Active' : 'Inactive', (l as any).args.active ? 'green' : 'gray');
      for (const l of modes) addEvent('Policy Mode', l as any, modeName((l as any).args.mode), 'purple');
      for (const l of requesterAdded) addEvent('Requester Added', l as any, 'Allowed requester', 'cyan', (l as any).args.requester);
      for (const l of requesterRemoved) addEvent('Requester Removed', l as any, 'Requester revoked', 'red', (l as any).args.requester);
      for (const l of keyReq) addEvent('KeyGen Requested', l as any, 'DKG requested', 'amber', (l as any).args.dataOwner);
      for (const l of keyCleared) addEvent('KeyGen Cleared', l as any, 'DKG flag cleared', 'green', (l as any).args.dataOwner);
      for (const l of keyExpired) addEvent('KeyGen Expired', l as any, 'DKG request expired', 'red', (l as any).args.dataOwner);
      for (const l of reencReq) addEvent('Reenc Requested', l as any, 'PRE requested', 'amber', (l as any).args.requester);
      for (const l of reencCleared) addEvent('Reenc Cleared', l as any, 'PRE flag cleared', 'green', (l as any).args.requester);

      return {
        policies: policies.sort((a, b) => ((b.createdBlock ?? 0n) > (a.createdBlock ?? 0n) ? 1 : -1)),
        events: events.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1)),
      };
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

export function usePolicyDetail(fileId: `0x${string}`) {
  // This file only: its policy and its events, not the whole network's.
  const policies = usePolicies({ fileId });
  return {
    ...policies,
    data: policies.data ? {
      policy: policies.data.policies.find(policy => policy.fileId.toLowerCase() === fileId.toLowerCase()),
      events: policies.data.events.filter(event => event.fileId.toLowerCase() === fileId.toLowerCase()),
    } : undefined,
  };
}

/**
 * File policies a page at a time, from the projected rows.
 *
 * `usePolicies` still returns the whole set, because the detail screens and the
 * lifecycle view reduce over it. This is for the table that lists them.
 */
export function usePagedPolicies(pageSize = 200) {
  const paged = usePagedIndex<Record<string, unknown>>('file-policies', {}, pageSize);
  return {
    ...paged,
    rows: paged.rows.map((row) => {
      const r = reviveArgs(row) as Record<string, unknown>;
      // The creating event's own block. The projection stores it under the name
      // the framework gives every such fact; the table reads it as "Created".
      const { firstBlock, ...rest } = r as { firstBlock?: bigint };
      return { ...rest, createdBlock: firstBlock } as unknown as FilePolicy;
    }),
  };
}

/** The four figures beside the table, counted in the store. */
export function useFilePolicyCounts() {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: ['file-policy-counts'],
    queryFn: async () => {
      const res = await fetch('/api/index/file-policy-counts', { cache: 'default' }).catch(() => null);
      if (!res || !res.ok) return null;
      return res.json() as Promise<{
        total: number; active: number; zkdkgV2: number; keyGenPending: number;
      } | null>;
    },
    refetchInterval,
    staleTime: 10_000,
  });
}
