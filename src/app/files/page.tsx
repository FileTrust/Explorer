'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { useDistinctArg } from '@/lib/hooks/useEventCounts';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedFiles, FileRecord } from '@/lib/hooks/useFiles';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const statusOptions = [
  { label: 'All Status', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Deletion Declared', value: 'deletion_declared' },
  { label: 'Deletion Confirmed', value: 'deletion_confirmed' },
  { label: 'Migrated', value: 'migrated' },
];

export default function FilesPage() {
  // Counted in the store, distinctly.
  //
  // "Total piece commitments" is not how many registration events there were --
  // a commitment can be registered, migrated and relinked, and counting rows
  // would report each of those as another file. It is how many distinct
  // commitment hashes appear among the registrations, which is a question the
  // store answers exactly and a downloaded page cannot answer at all.
  const { data: registeredCount } = useDistinctArg('commitmentHash', {
    contract: 'FileRegistrationSC', event: 'FileStorageRegistered',
  });
  const { data: deletedCount } = useDistinctArg('commitmentHash', {
    contract: 'FileRegistrationSC', event: 'FileDeletionConfirmed',
  });
  // The remaining two stats, on the same footing as the first two. They were
  // counts over the downloaded rows, which stopped being the whole set when the
  // table began paging.
  const { data: declaredCount } = useDistinctArg('commitmentHash', {
    contract: 'FileRegistrationSC', event: 'FileDeletionDeclared',
  });
  const { data: migratedCount } = useDistinctArg('commitmentHash', {
    contract: 'FileRegistrationSC', event: 'FileStoragePartitionMigrated',
  });
  const router = useRouter();
  const { rows: files, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedFiles();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));
  const [statusFilter, setStatusFilter] = useState('all');


  const filtered = useMemo(() => {
    let result = files;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(f =>
        f.commitmentHash.toLowerCase().includes(q) ||
        f.sectorRoot.toLowerCase().includes(q) ||
        f.vkAddress.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') {
      result = result.filter(f => {
        if (statusFilter === 'active') return !f.deletionDeclared && !f.deletionConfirmed;
        if (statusFilter === 'deletion_declared') return f.deletionDeclared && !f.deletionConfirmed;
        if (statusFilter === 'deletion_confirmed') return f.deletionConfirmed;
        if (statusFilter === 'migrated') return f.migrationCount > 0;
        return true;
      });
    }
    return result;
  }, [files, search, statusFilter]);

  const columns: Column<FileRecord>[] = [
    {
      key: 'commitment',
      header: 'Commitment Hash',
      cell: row => <Hash value={row.commitmentHash} chars={10} />,
    },
    {
      key: 'vk',
      header: 'Vault Keeper',
      cell: row => <Address value={row.vkAddress} />,
    },
    {
      key: 'sector',
      header: 'Sector Root',
      cell: row => <Hash value={row.sectorRoot} chars={8} />,
    },
    {
      key: 'partition',
      header: 'Partition',
      cell: row => (
        <span className="font-mono text-xs text-[#94a3b8]">
          DL{row.deadlineIndex} / P{row.partitionIndex}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: row => {
        if (row.deletionConfirmed) return <Badge label="Deleted" variant="red" dot />;
        if (row.deletionDeclared) return <Badge label="Deletion Pending" variant="amber" dot />;
        if (row.migrationCount > 0) return <Badge label={`Migrated ×${row.migrationCount}`} variant="purple" dot />;
        return <Badge label="Active" variant="green" dot />;
      },
    },
    {
      key: 'serviceEnd',
      header: 'Service End',
      cell: row => (
        <span className="text-xs text-[#94a3b8] font-mono">
          {row.serviceEnd > 0n ? formatTimestamp(row.serviceEnd) : '—'}
        </span>
      ),
    },
    {
      key: 'block',
      header: 'Block',
      cell: row => (
        <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span>
      ),
    },
    {
      key: 'tx',
      header: 'Tx Hash',
      cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} />,
    },
  ];

  if (isLoading) return <LoadingState message="Fetching piece registrations…" />;
  if (error) return <ErrorState message="Failed to load pieces. Is the Hardhat node running?" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
        <PageHeader
        title="Registered Pieces"
        subtitle={`${(registeredCount ?? files.length).toLocaleString()} total piece commitments`}
        icon={FileText}
        iconColor="text-ft-blue"
        actions={
          <div className="flex items-center gap-2 text-xs text-[#64748b] bg-bg-surface border border-bg-border rounded-lg px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-ft-blue" />
            Live
          </div>
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: registeredCount ?? files.length, color: 'text-ft-blue' },
          // Active is registered minus confirmed-deleted when both come from the
          // store, so the two figures agree with each other rather than one
          // being a total and the other a count of what happened to be fetched.
          {
            label: 'Active',
            value: registeredCount != null && deletedCount != null
              ? registeredCount - deletedCount
              : files.filter(f => !f.deletionDeclared && !f.deletionConfirmed).length,
            color: 'text-ft-green',
          },
          // Declared-but-not-yet-confirmed, the same subtraction Active uses:
          // a confirmation follows a declaration, so the difference is the ones
          // still waiting.
          {
            label: 'Deletion Declared',
            value: declaredCount != null && deletedCount != null
              ? Math.max(0, declaredCount - deletedCount)
              : files.filter(f => f.deletionDeclared && !f.deletionConfirmed).length,
            color: 'text-ft-amber',
          },
          {
            label: 'Migrated',
            value: migratedCount ?? files.filter(f => f.migrationCount > 0).length,
            color: 'text-ft-purple',
          },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <SearchBar
          placeholder="Search by commitment, sector root, vault keeper…"
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-lg"
        />
        <FilterSelect options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={r => r.commitmentHash}
        pageSize={30}
        emptyMessage="No pieces match your search"
        onRowClick={row => router.push(`/files/${row.commitmentHash}`)}
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
      />
    </div>
  );
}
