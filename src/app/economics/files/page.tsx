'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { FullHash } from '@/components/ui/Hash';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { SearchBar } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedFileEconomics, useRollupCounts, FileEconomics } from '@/lib/hooks/useEconomics';
import { initialQueryParam } from '@/lib/browserState';

export default function EconomicsFilesPage() {
  // Summed in the store during ingest: a row here is a total over history,
  // which is the one thing a page of events cannot produce.
  const { rows: fileRows, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedFileEconomics();
  const { data: counts } = useRollupCounts();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));


  const rows = useMemo(() => {
    const all = fileRows;
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(row => row.fileId.toLowerCase().includes(q));
  }, [fileRows, search]);

  const columns: Column<FileEconomics>[] = [
    { key: 'fileId', header: 'File ID', cell: row => <FullHash value={row.fileId} href={`/files/${row.fileId}`} /> },
    { key: 'policyEscrow', header: 'Policy Escrow', cell: row => <FtuAmount wei={row.policyEscrowDeposited} decimals={6} className="font-mono text-xs text-ft-amber" /> },
    { key: 'policyRefund', header: 'Policy Refund', cell: row => <FtuAmount wei={row.policyEscrowRefunded} decimals={6} className="font-mono text-xs text-ft-red" /> },
    { key: 'accessEscrow', header: 'Access Escrow', cell: row => <FtuAmount wei={row.accessEscrowDeposited} decimals={6} className="font-mono text-xs text-ft-blue" /> },
    { key: 'rewards', header: 'Rewards Credited', cell: row => <FtuAmount wei={row.rewardsCredited} decimals={6} className="font-mono text-xs text-ft-green" /> },
    { key: 'requests', header: 'Requests', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.accessRequestCount}</span> },
    { key: 'events', header: 'Events', cell: row => <span className="font-mono text-xs text-[#64748b]">{row.eventCount}</span> },
  ];

  if (isLoading) return <LoadingState message="Loading file economics…" />;
  if (error) return <ErrorState message="Failed to load file economics" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader title="File Economics" subtitle={`${(counts?.files ?? fileRows.length).toLocaleString()} files with economic activity`} icon={FileText} iconColor="text-ft-amber" />
      <SearchBar placeholder="Search by file ID…" value={search} onChange={setSearch} className="max-w-lg" />
      <DataTable columns={columns} data={rows} keyExtractor={r => r.fileId} pageSize={30} emptyMessage="No files match your search" hasMore={hasMore} onLoadMore={loadMore} loadingMore={loadingMore} />
    </div>
  );
}
