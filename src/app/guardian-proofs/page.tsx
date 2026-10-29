'use client';

import { useState, useMemo } from 'react';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address, FullHash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedGuardianProofs, useGuardianProofStats, GuardianProofEvent } from '@/lib/hooks/useGuardianProofs';
import { formatBlockNumber } from '@/lib/utils';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const typeOptions = [
  { label: 'All Activity', value: 'all' },
  { label: 'Submitted (Valid)', value: 'valid' },
  { label: 'Submitted (Invalid)', value: 'invalid' },
  { label: 'Missed', value: 'missed' },
];

export default function GuardianProofsPage() {
  const { rows: events, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedGuardianProofs();
  const stats = useGuardianProofStats();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const filtered = useMemo(() => {
    let result = events;
    if (typeFilter === 'valid') result = result.filter(e => e.type === 'submitted' && e.valid);
    else if (typeFilter === 'invalid') result = result.filter(e => e.type === 'submitted' && !e.valid);
    else if (typeFilter === 'missed') result = result.filter(e => e.type === 'missed');
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(e =>
        e.guardian.toLowerCase().includes(q) || e.policyId.toLowerCase().includes(q)
      );
    }
    return result;
  }, [events, typeFilter, search]);

  const pieData = [
    { name: 'Valid', value: stats.valid, color: '#10b981' },
    { name: 'Invalid', value: stats.invalid, color: '#f59e0b' },
    { name: 'Missed', value: stats.missed, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const columns: Column<GuardianProofEvent>[] = [
    {
      key: 'result',
      header: 'Result',
      cell: row => {
        if (row.type === 'missed') return <Badge label="Missed" variant="red" dot />;
        return <Badge label={row.valid ? 'Valid' : 'Invalid'} variant={row.valid ? 'green' : 'amber'} dot />;
      },
    },
    {
      key: 'guardian',
      header: 'Guardian',
      cell: row => <Address value={row.guardian} />,
    },
    {
      key: 'policyId',
      header: 'Policy ID',
      cell: row => <FullHash value={row.policyId} />,
    },
    {
      key: 'keyEpoch',
      header: 'Key Epoch',
      cell: row => <span className="font-mono text-xs text-ft-amber">{row.keyEpoch}</span>,
    },
    {
      key: 'proofEpoch',
      header: 'Proof Epoch',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.proofEpoch.toString()}</span>,
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

  if (isLoading) return <LoadingState message="Loading guardian proof activity…" />;
  if (error) return <ErrorState message="Failed to load guardian proofs" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Guardian Proofs"
        subtitle={`${events.length.toLocaleString()} total proof events across ${stats.uniqueGuardians} guardian${stats.uniqueGuardians !== 1 ? 's' : ''}`}
        icon={ShieldCheck}
        iconColor="text-ft-green"
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Submitted', value: stats.submitted, color: 'text-ft-blue' },
          { label: 'Valid', value: stats.valid, color: 'text-ft-green' },
          { label: 'Invalid', value: stats.invalid, color: 'text-ft-amber' },
          { label: 'Missed', value: stats.missed, color: 'text-ft-red' },
          {
            label: 'Success Rate',
            value: `${stats.successRate}%`,
            color: stats.successRate >= 90 ? 'text-ft-green' : stats.successRate >= 70 ? 'text-ft-amber' : 'text-ft-red',
          },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>
              {typeof s.value === 'number' ? s.value.toLocaleString() : s.value}
            </p>
          </div>
        ))}
      </div>

      {pieData.length > 0 && (
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Proof Distribution</p>
          <ResponsiveContainer width="100%" height={150}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0e1420', border: '1px solid #1e2a40', borderRadius: 8, fontSize: 12 }}
              />
              <Legend iconType="circle" wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-3">
        <SearchBar
          placeholder="Search by guardian address or policy ID…"
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-md"
        />
        <FilterSelect options={typeOptions} value={typeFilter} onChange={setTypeFilter} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={r => `${r.guardian}-${r.policyId}-${r.proofEpoch}-${r.type}`}
        pageSize={30}
        emptyMessage="No guardian proof events match your filter"
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
      />
    </div>
  );
}
