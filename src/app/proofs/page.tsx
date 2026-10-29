'use client';

import { useState, useMemo } from 'react';
import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedProofs, useProofStats, ProofEvent } from '@/lib/hooks/useProofs';
import { formatBlockNumber } from '@/lib/utils';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { initialQueryParam } from '@/lib/browserState';

const typeOptions = [
  { label: 'All Types', value: 'all' },
  { label: 'Sector Proofs Submitted', value: 'submitted' },
  { label: 'Sector Proofs Missed', value: 'missed' },
  { label: 'Partition Proofs', value: 'partition_proof' },
  { label: 'Challenges Opened', value: 'challenge' },
  { label: 'Sectors Registered', value: 'sector_registered' },
  { label: 'Partitions Registered', value: 'partition_registered' },
  { label: 'Config / Setup', value: 'config' },
];

const TYPE_LABELS: Record<string, string> = {
  submitted: 'Proof Submitted',
  missed: 'Proof Missed',
  partition_proof: 'Partition Proof',
  challenge: 'Challenge Opened',
  sector_registered: 'Sector Registered',
  partition_registered: 'Partition Registered',
  config: 'Config/Setup',
};

const TYPE_VARIANTS: Record<string, string> = {
  submitted: 'green',
  missed: 'red',
  partition_proof: 'cyan',
  challenge: 'amber',
  sector_registered: 'blue',
  partition_registered: 'purple',
  config: 'gray',
};

export default function ProofsPage() {
  // A page at a time, ordered by the store.
  const { rows: proofs, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedProofs();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));
  const [typeFilter, setTypeFilter] = useState('all');


  const filtered = useMemo(() => {
    let result = proofs;
    if (typeFilter !== 'all') result = result.filter(p => p.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        p.key.toLowerCase().includes(q) ||
        p.vk.toLowerCase().includes(q) ||
        (p.sectorId?.toLowerCase().includes(q) ?? false)
      );
    }
    return result;
  }, [proofs, search, typeFilter]);

  // Counted in the store, not measured off the rows in hand. These were
  // `.filter().length` over whatever had been downloaded, which was the same
  // number only because the screen downloaded everything. Once the table pages,
  // that stops being true: the headline would count one page and shrink.
  const {
    sectorSubmitted, missed, partitionProofs: partProofs,
    challenges, configEvents, successRate, total,
  } = useProofStats();

  const pieData = [
    { name: 'Submitted', value: sectorSubmitted, color: '#10b981' },
    { name: 'Missed', value: missed, color: '#ef4444' },
    { name: 'Partition', value: partProofs, color: '#06b6d4' },
  ].filter(d => d.value > 0);

  const columns: Column<ProofEvent>[] = [
    {
      key: 'type',
      header: 'Type',
      cell: row => <Badge label={TYPE_LABELS[row.type] ?? row.type} variant={(TYPE_VARIANTS[row.type] ?? 'gray') as any} />,
    },
    {
      key: 'vk',
      header: 'Vault Keeper / Address',
      cell: row => row.type === 'config' && row.vk === '0x0000000000000000000000000000000000000000'
        ? <span className="text-[#64748b] text-xs">—</span>
        : <Address value={row.vk} />,
    },
    {
      key: 'key',
      header: 'Sector/Partition Key / Detail',
      cell: row => row.type === 'config'
        ? <span className="text-xs text-[#94a3b8]">{row.configLabel}</span>
        : <Hash value={row.key} chars={8} />,
    },
    {
      key: 'sectorId',
      header: 'Sector ID',
      cell: row => row.sectorId ? <Hash value={row.sectorId} chars={8} /> : <span className="text-[#64748b]">—</span>,
    },
    {
      key: 'round',
      header: 'Round',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.round?.toString() ?? '—'}</span>,
    },
    {
      key: 'deadline',
      header: 'Deadline',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.deadline?.toString() ?? '—'}</span>,
    },
    {
      key: 'block',
      header: 'Block',
      cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span>,
    },
    {
      key: 'tx',
      header: 'Tx',
      cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} />,
    },
  ];

  if (isLoading) return <LoadingState message="Loading storage proof events…" />;
  if (error) return <ErrorState message="Failed to load proof events" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Storage Proofs"
        subtitle={`${total.toLocaleString()} total proof events`}
        icon={Lock}
        iconColor="text-ft-green"
      />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: 'Submitted', value: sectorSubmitted, color: 'text-ft-green' },
          { label: 'Missed', value: missed, color: 'text-ft-red' },
          { label: 'Success Rate', value: `${successRate}%`, color: successRate >= 90 ? 'text-ft-green' : successRate >= 70 ? 'text-ft-amber' : 'text-ft-red' },
          { label: 'Partition Proofs', value: partProofs, color: 'text-ft-cyan' },
          { label: 'Challenges', value: challenges, color: 'text-ft-amber' },
          { label: 'Config Events', value: configEvents, color: 'text-[#64748b]' },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {pieData.length > 0 && (
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Proof Distribution</p>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#0e1420', border: '1px solid #1e2a40', borderRadius: 8, fontSize: 12 }} />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-3">
        <SearchBar
          placeholder="Search by key, vault keeper, sector ID…"
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-md"
        />
        <FilterSelect options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
      </div>

      <DataTable
        onLoadMore={loadMore}
        hasMore={hasMore}
        loadingMore={loadingMore}
        columns={columns}
        data={filtered}
        keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}-${r.key}`}
        pageSize={30}
        emptyMessage="No proof events match your filter"
      />
    </div>
  );
}
