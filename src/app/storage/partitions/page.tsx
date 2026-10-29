'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers3 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedPartitions, usePartitionCounts, useStorage, PartitionRecord, StorageHealth } from '@/lib/hooks/useStorage';
import { formatBlockNumber, formatBytes, formatTimestamp } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const healthOptions = [
  { label: 'All Health', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Expired', value: 'expired' },
  { label: 'Inactive', value: 'inactive' },
];

function HealthBadge({ health }: { health: StorageHealth }) {
  const variant = health === 'healthy' ? 'green' : health === 'warning' ? 'amber' : health === 'expired' ? 'red' : 'gray';
  return <Badge label={health[0].toUpperCase() + health.slice(1)} variant={variant as any} dot />;
}

export default function PartitionsPage() {
  const router = useRouter();
  // A page of projected rows, and the four figures beside them counted in the
  // store. Building both from a browser-side replay of fifteen event streams is
  // what this replaces.
  const { rows: partitions, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedPartitions();
  const { data: counts } = usePartitionCounts();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));
  const [health, setHealth] = useState('all');


  const filtered = useMemo(() => {
    let rows = partitions;
    if (health !== 'all') rows = rows.filter(row => row.health === health);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(row =>
        row.partitionKey.toLowerCase().includes(q) ||
        row.vk.toLowerCase().includes(q) ||
        String(row.deadlineIndex).includes(q) ||
        String(row.partitionIndex).includes(q)
      );
    }
    return rows;
  }, [partitions, health, search]);

  const columns: Column<PartitionRecord>[] = [
    { key: 'health', header: 'Health', cell: row => <HealthBadge health={row.health} /> },
    { key: 'key', header: 'Partition Key', cell: row => <Hash value={row.partitionKey} chars={8} /> },
    { key: 'vk', header: 'VK', cell: row => <Hash value={row.vk} type="address" href={`/vault-keepers/${row.vk}`} /> },
    { key: 'deadline', header: 'Deadline', cell: row => <span className="font-mono text-xs text-ft-purple">DL{row.deadlineIndex} / P{row.partitionIndex}</span> },
    { key: 'kind', header: 'Kind', cell: row => <Badge label={row.partitionKind === 2 ? 'Capacity' : 'Data'} variant={row.partitionKind === 2 ? 'cyan' : 'purple'} /> },
    { key: 'bytes', header: 'Bytes', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{formatBytes(row.committedBytes)}</span> },
    { key: 'sectors', header: 'Sectors', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.sectorCount.toLocaleString()}</span> },
    { key: 'proofs', header: 'Proofs', cell: row => <span className="font-mono text-xs text-ft-green">{row.submittedProofs}</span> },
    { key: 'challenges', header: 'Challenges', cell: row => <span className="font-mono text-xs text-ft-amber">{row.openedChallenges}</span> },
    { key: 'expiration', header: 'Expiration', cell: row => <span className="text-xs text-[#64748b]">{row.expiration > 0n ? formatTimestamp(row.expiration) : '—'}</span> },
    { key: 'block', header: 'Registered', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.registeredBlock)}</span> },
  ];

  if (isLoading) return <LoadingState message="Loading partitions…" />;
  if (error) return <ErrorState message="Failed to load partitions" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Partitions"
        subtitle={counts
          ? `${counts.active} active (${counts.data} data · ${counts.capacity} capacity) · ${counts.inactive} inactive`
          : `${partitions.length} partitions`}
        icon={Layers3}
        iconColor="text-ft-purple"
      />
      <div className="flex gap-3">
        <SearchBar placeholder="Search by partition key, VK, deadline, partition…" value={search} onChange={setSearch} className="flex-1 max-w-lg" />
        <FilterSelect options={healthOptions} value={health} onChange={setHealth} />
      </div>
      <DataTable columns={columns} data={filtered} keyExtractor={r => r.partitionKey} pageSize={30} emptyMessage="No partitions match your filters" onRowClick={row => router.push(`/storage/partitions/${row.partitionKey}`)} hasMore={hasMore} onLoadMore={loadMore} loadingMore={loadingMore} />
    </div>
  );
}
