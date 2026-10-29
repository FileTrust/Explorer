'use client';

import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedDeadlines, DeadlineSummary } from '@/lib/hooks/useStorage';
import { initialQueryParam } from '@/lib/browserState';

export default function DeadlinesPage() {
  const { rows: deadlines, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedDeadlines();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));


  const filtered = useMemo(() => {
    let rows = deadlines;
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(row =>
        row.vk.toLowerCase().includes(q) ||
        String(row.deadlineIndex).includes(q)
      );
    }
    return rows;
  }, [deadlines, search]);

  const columns: Column<DeadlineSummary>[] = [
    {
      key: 'health',
      header: 'Health',
      cell: row => <Badge label={row.health} variant={row.health === 'healthy' ? 'green' : row.health === 'warning' ? 'amber' : 'red'} dot />,
    },
    { key: 'vk', header: 'Vault Keeper', cell: row => <Hash value={row.vk} type="address" href={`/vault-keepers/${row.vk}`} /> },
    { key: 'deadline', header: 'Deadline', cell: row => <span className="font-mono text-xs text-ft-purple">DL{row.deadlineIndex}</span> },
    { key: 'partitions', header: 'Partitions', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.partitionCount}</span> },
    { key: 'sectors', header: 'Sectors', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.sectorCount.toLocaleString()}</span> },
    { key: 'challenges', header: 'Challenges', cell: row => <span className="font-mono text-xs text-ft-amber">{row.openedChallenges}</span> },
    { key: 'proofs', header: 'Proofs', cell: row => <span className="font-mono text-xs text-ft-green">{row.submittedProofs}</span> },
    { key: 'risk', header: 'Risk', cell: row => <span className={row.faulted > 0 ? 'font-mono text-xs text-ft-red' : 'font-mono text-xs text-[#64748b]'}>{row.faulted} faulted · {row.expiringSoon} expiring</span> },
  ];

  if (isLoading) return <LoadingState message="Loading deadlines…" />;
  if (error) return <ErrorState message="Failed to load deadlines" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader title="Deadlines" subtitle={`${deadlines.length.toLocaleString()} VK/deadline groups from partition registrations`} icon={CalendarClock} iconColor="text-ft-amber" />
      <SearchBar placeholder="Search by VK or deadline index…" value={search} onChange={setSearch} className="max-w-lg" />
      <DataTable columns={columns} data={filtered} keyExtractor={r => r.id} pageSize={30} emptyMessage="No deadlines match your search" hasMore={hasMore} onLoadMore={loadMore} loadingMore={loadingMore} />
    </div>
  );
}
