'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Shield } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Address } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedGuardianProfiles, useGuardians, GuardianProfile } from '@/lib/hooks/useGuardians';
import { formatTimestamp, reputationColor, reputationLabel, timeAgo } from '@/lib/utils';

import { heartbeatFresh } from '@/lib/heartbeat.mjs';
import { useNowSeconds } from '@/lib/browserState';

const statusOptions = [
  { label: 'All Participation', value: 'all' },
  { label: 'Enabled', value: 'active' },
  { label: 'Disabled', value: 'inactive' },
];

export default function GuardiansPage() {
  const router = useRouter();
  const now = useNowSeconds();
  // A page at a time, as with vault keepers.
  const { rows: guardians, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedGuardianProfiles();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    let result = guardians;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(g => g.address.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      result = result.filter(g => (statusFilter === 'active') === g.active);
    }
    return result.sort((a, b) => b.reputationScore - a.reputationScore);
  }, [guardians, search, statusFilter]);

  const columns: Column<GuardianProfile>[] = [
    {
      key: 'rank',
      header: '#',
      cell: (_, idx: number) => <span className="text-xs text-[#64748b]">{idx + 1}</span>,
    },
    {
      key: 'address',
      header: 'Address',
      cell: row => <Address value={row.address} />,
    },
    {
      key: 'status',
      header: 'Participation',
      cell: row => <Badge label={row.active ? 'Enabled' : 'Disabled'} variant={row.active ? 'green' : 'gray'} dot />,
    },
    {
      key: 'heartbeatStatus',
      header: 'Heartbeat',
      cell: row => <Badge label={heartbeatFresh(row.lastHeartbeat, now) ? 'Fresh' : 'Stale'} variant={heartbeatFresh(row.lastHeartbeat, now) ? 'green' : 'amber'} dot />,
    },
    {
      key: 'stake',
      header: 'Stake',
      cell: row => <FtuAmount wei={row.stake} decimals={4} className="font-mono text-xs text-ft-blue" />,
    },
    {
      key: 'availableStake',
      header: 'Available',
      cell: row => <FtuAmount wei={row.availableStake} decimals={4} className="font-mono text-xs text-ft-green" />,
    },
    {
      key: 'lockedStake',
      header: 'Locked',
      cell: row => <FtuAmount wei={row.lockedStake} decimals={4} className="font-mono text-xs text-ft-amber" />,
    },
    {
      key: 'reputation',
      header: 'Reputation',
      cell: row => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${row.reputationScore >= 700 ? 'bg-ft-green' : row.reputationScore >= 400 ? 'bg-ft-amber' : 'bg-ft-red'}`}
              style={{ width: `${Math.min(100, row.reputationScore / 10)}%` }}
            />
          </div>
          <span className={`text-xs font-semibold ${reputationColor(row.reputationScore)}`}>
            {row.reputationScore}
          </span>
        </div>
      ),
    },
    {
      key: 'dkg',
      header: 'DKG OK/Fail',
      cell: row => (
        <span className="text-xs font-mono">
          <span className="text-ft-green">{row.completedDKG}</span>
          <span className="text-[#64748b]"> / </span>
          <span className="text-ft-red">{row.failedDKG}</span>
        </span>
      ),
    },
    {
      key: 'pre',
      header: 'PRE OK/Fail',
      cell: row => (
        <span className="text-xs font-mono">
          <span className="text-ft-green">{row.completedPRE}</span>
          <span className="text-[#64748b]"> / </span>
          <span className="text-ft-red">{row.failedPRE}</span>
        </span>
      ),
    },
    {
      key: 'complaints',
      header: 'Complaints',
      cell: row => (
        <span className={`text-xs font-mono ${row.disputes > 0 ? 'text-ft-amber' : 'text-[#64748b]'}`}>
          {row.dkgComplaints + row.preComplaints}
        </span>
      ),
    },
    {
      key: 'penalty',
      header: 'Penalty',
      cell: row => <span className={`text-xs font-mono ${row.penaltyPoints > 0 ? 'text-ft-red' : 'text-[#64748b]'}`}>{row.penaltyPoints}</span>,
    },
    {
      key: 'readyButNotUsedPRE',
      header: 'PRE Ready',
      cell: row => <span className="text-xs font-mono text-[#94a3b8]">{row.readyButNotUsedPRE}</span>,
    },
    {
      key: 'shareProofPenalties',
      header: 'Share Miss',
      cell: row => <span className={`text-xs font-mono ${row.missedShareProofPenalties > 0 ? 'text-ft-amber' : 'text-[#64748b]'}`}>{row.missedShareProofPenalties}</span>,
    },
    {
      key: 'lastActivity',
      header: 'Last Activity',
      cell: row => <span className="text-xs text-[#64748b]">{row.lastActivityAt > 0n ? timeAgo(row.lastActivityAt) : '—'}</span>,
    },
    {
      key: 'heartbeat',
      header: 'Last Heartbeat',
      cell: row => {
        const hb = row.lastHeartbeat;
        return (
          <span className="text-xs text-[#64748b]">
            {hb > 0n ? timeAgo(hb) : '—'}
          </span>
        );
      },
    },
    {
      key: 'dkgSu',
      header: 'DKG SU',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{(row.dkgMaterialSu + row.dkgShareKeySu).toLocaleString()}</span>,
    },
    {
      key: 'preSu',
      header: 'PRE SU',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.preBatchPartialSu.toLocaleString()}</span>,
    },
    {
      key: 'custodySu',
      header: 'Custody SU',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.dailyShareCustodySu.toLocaleString()}</span>,
    },
  ];

  if (isLoading) return <LoadingState message="Loading guardians from registry…" />;
  if (error) return <ErrorState message="Failed to load guardians" retry={refetch} />;

  const activeCount = guardians.filter(g => g.active).length;
  const totalStake = guardians.reduce((s, g) => s + g.stake, 0n);
  const avgRep = guardians.length > 0 ? Math.round(guardians.reduce((s, g) => s + g.reputationScore, 0) / guardians.length) : 0;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Guardians"
        subtitle={`${guardians.length} registered · ${activeCount} enabled`}
        icon={Shield}
        iconColor="text-ft-purple"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: guardians.length.toString(), color: 'text-ft-purple' },
          { label: 'Enabled', value: activeCount.toString(), color: 'text-ft-green' },
          { label: 'Total Stake', value: <FtuAmount wei={totalStake} decimals={3} />, color: 'text-ft-blue' },
          { label: 'Avg Reputation', value: avgRep.toString(), color: reputationColor(avgRep) },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <SearchBar
          placeholder="Search by address…"
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-md"
        />
        <FilterSelect options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
      </div>

      <DataTable
        onLoadMore={loadMore}
        hasMore={hasMore}
        loadingMore={loadingMore}
        columns={columns as any}
        data={filtered}
        keyExtractor={r => r.address}
        pageSize={30}
        emptyMessage="No guardians match your search"
        onRowClick={row => router.push(`/guardians/${row.address}`)}
      />
    </div>
  );
}
