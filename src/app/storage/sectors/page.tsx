'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { HardDrive } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedSectors, useSectorCounts, useStorage, SectorRecord, StorageHealth } from '@/lib/hooks/useStorage';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const healthOptions = [
  { label: 'All Health', value: 'all' },
  { label: 'Healthy', value: 'healthy' },
  { label: 'Warning', value: 'warning' },
  { label: 'Faulted', value: 'faulted' },
  { label: 'Expired', value: 'expired' },
  { label: 'Inactive', value: 'inactive' },
];

function HealthBadge({ health }: { health: StorageHealth }) {
  const variant = health === 'healthy' ? 'green' : health === 'warning' ? 'amber' : health === 'faulted' || health === 'expired' ? 'red' : 'gray';
  return <Badge label={health[0].toUpperCase() + health.slice(1)} variant={variant as any} dot />;
}

export default function SectorsPage() {
  const router = useRouter();
  const { rows: sectors, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedSectors();
  const { data: counts } = useSectorCounts();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));
  const [health, setHealth] = useState('all');


  const filtered = useMemo(() => {
    let rows = sectors;
    if (health !== 'all') rows = rows.filter(row => row.health === health);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(row =>
        row.sectorKey.toLowerCase().includes(q) ||
        row.sectorId.toLowerCase().includes(q) ||
        row.sectorRoot.toLowerCase().includes(q) ||
        row.vk.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [sectors, health, search]);

  const columns: Column<SectorRecord>[] = [
    { key: 'health', header: 'Health', cell: row => <HealthBadge health={row.health} /> },
    { key: 'key', header: 'Sector Key', cell: row => <Hash value={row.sectorKey} chars={8} /> },
    { key: 'id', header: 'Sector ID', cell: row => <Hash value={row.sectorId} chars={8} /> },
    { key: 'vk', header: 'VK', cell: row => <Hash value={row.vk} type="address" href={`/vault-keepers/${row.vk}`} /> },
    { key: 'blocks', header: 'Blocks', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.sectorBlockCount.toLocaleString()}</span> },
    { key: 'proofs', header: 'Proofs', cell: row => <span className="font-mono text-xs text-ft-green">{row.submittedProofs}<span className="text-ft-red ml-1">/ {row.missedProofs}</span></span> },
    { key: 'expiration', header: 'Expiration', cell: row => <span className="text-xs text-[#64748b]">{row.expiration > 0n ? formatTimestamp(row.expiration) : '—'}</span> },
    { key: 'block', header: 'Registered', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.registeredBlock)}</span> },
  ];

  if (isLoading) return <LoadingState message="Loading sectors…" />;
  if (error) return <ErrorState message="Failed to load sectors" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader title="Sectors" subtitle={`${(counts?.total ?? sectors.length).toLocaleString()} tracked sector records`} icon={HardDrive} iconColor="text-ft-blue" />
      <div className="flex gap-3">
        <SearchBar placeholder="Search by sector key, sector ID, root, VK…" value={search} onChange={setSearch} className="flex-1 max-w-lg" />
        <FilterSelect options={healthOptions} value={health} onChange={setHealth} />
      </div>
      <DataTable columns={columns} data={filtered} keyExtractor={r => r.sectorKey} pageSize={30} emptyMessage="No sectors match your filters" onRowClick={row => router.push(`/storage/sectors/${row.sectorKey}`)} hasMore={hasMore} onLoadMore={loadMore} loadingMore={loadingMore} />
    </div>
  );
}
