'use client';

import { useQuery } from '@tanstack/react-query';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { FileRegistrationSCABI } from '@/lib/abis/FileRegistrationSC';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { getIndexedLogs } from '@/lib/indexedLogs';
import { usePagedWithJoins } from '@/lib/hooks/useEventCounts';

export interface FileRecord {
  commitmentHash: `0x${string}`;
  sectorRoot: `0x${string}`;
  vkAddress: `0x${string}`;
  deadlineIndex: number;
  partitionIndex: number;
  serviceEnd: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
  partitionLinked: boolean;
  deletionDeclared: boolean;
  deletionConfirmed: boolean;
  migrationCount: number;
}

export function useFiles() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['files'],
    queryFn: async (): Promise<FileRecord[]> => {
      const [registered, deletionDeclared, deletionConfirmed, migrations] = await Promise.all([
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'FileStorageRegistered')! as any,
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'FileDeletionDeclared')! as any,
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'FileDeletionConfirmed')! as any,
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'FileStoragePartitionMigrated')! as any,
        }).catch(() => []),
      ]);

      const deletionDeclaredSet = new Set(deletionDeclared.map(l => ((l as any).args).commitmentHash as string));
      const deletionConfirmedSet = new Set(deletionConfirmed.map(l => ((l as any).args).commitmentHash as string));
      const migrationCounts = new Map<string, number>();
      for (const m of migrations) {
        const h = ((m as any).args).commitmentHash as string;
        migrationCounts.set(h, (migrationCounts.get(h) ?? 0) + 1);
      }

      return registered.map(log => {
        const args = (log as any).args;
        return {
          commitmentHash: args.commitmentHash,
          sectorRoot: args.sectorRoot,
          vkAddress: args.vkAddress,
          deadlineIndex: args.deadlineIndex,
          partitionIndex: args.partitionIndex,
          serviceEnd: args.serviceEnd,
          blockNumber: log.blockNumber ?? 0n,
          txHash: log.transactionHash ?? '0x',
          partitionLinked: false,
          deletionDeclared: deletionDeclaredSet.has(args.commitmentHash),
          deletionConfirmed: deletionConfirmedSet.has(args.commitmentHash),
          migrationCount: migrationCounts.get(args.commitmentHash) ?? 0,
        };
      }).sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 8_000,
  });
}

export function useFileDetail(commitmentHash: `0x${string}`) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['file', commitmentHash],
    queryFn: async () => {
      const [record, allRegistered, deletionDeclared, deletionConfirmed, migrations, partitionLinked] = await Promise.all([
        publicClient.readContract({
          address: CONTRACTS.FileRegistrationSC,
          abi: FileRegistrationSCABI,
          functionName: 'getRecord',
          args: [commitmentHash],
        }).catch(() => null),
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'FileStorageRegistered')! as any,
          args: { commitmentHash },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'FileDeletionDeclared')! as any,
          args: { commitmentHash },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'FileDeletionConfirmed')! as any,
          args: { commitmentHash },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'FileStoragePartitionMigrated')! as any,
          args: { commitmentHash },
        }).catch(() => []),
        getIndexedLogs({
          address: CONTRACTS.FileRegistrationSC,
          event: FileRegistrationSCABI.find(e => e.name === 'PartitionLinked')! as any,
          args: { commitmentHash },
        }).catch(() => []),
      ]);
      return { record, events: { allRegistered, deletionDeclared, deletionConfirmed, migrations, partitionLinked } };
    },
    enabled: !!commitmentHash,
    refetchInterval,
  });
}

/**
 * The file table, a page at a time.
 *
 * A registration is the row; a declaration, a confirmation and any migrations
 * are later news about it, so they are joined over the block window the loaded
 * page covers rather than downloaded whole. See `usePagedWithJoins`.
 */
export function usePagedFiles(pageSize = 200) {
  return usePagedWithJoins<FileRecord>(
    'FileRegistrationSC', 'FileStorageRegistered',
    ['FileDeletionDeclared', 'FileDeletionConfirmed', 'FileStoragePartitionMigrated'],
    (rows, joined) => {
      const hashes = (name: string) =>
        new Set(joined[name].map(l => String(l.args.commitmentHash)));
      const declared = hashes('FileDeletionDeclared');
      const confirmed = hashes('FileDeletionConfirmed');

      const migrationCounts = new Map<string, number>();
      for (const m of joined.FileStoragePartitionMigrated) {
        const h = String(m.args.commitmentHash);
        migrationCounts.set(h, (migrationCounts.get(h) ?? 0) + 1);
      }

      return rows.map(({ args, blockNumber, transactionHash }) => {
        const a = args as Record<string, any>;
        const hash = String(a.commitmentHash);
        return {
          commitmentHash: a.commitmentHash,
          sectorRoot: a.sectorRoot,
          vkAddress: a.vkAddress,
          deadlineIndex: Number(a.deadlineIndex ?? 0),
          partitionIndex: Number(a.partitionIndex ?? 0),
          serviceEnd: (a.serviceEnd ?? 0n) as bigint,
          blockNumber: BigInt(blockNumber ?? 0),
          txHash: (transactionHash ?? '0x') as `0x${string}`,
          partitionLinked: false,
          deletionDeclared: declared.has(hash),
          deletionConfirmed: confirmed.has(hash),
          migrationCount: migrationCounts.get(hash) ?? 0,
        };
      });
    },
    pageSize,
  );
}
