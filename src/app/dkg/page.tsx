'use client';

import { useState, useMemo } from 'react';
import { Key } from 'lucide-react';
import { useEventCountsByName, useEventCountsByArg } from '@/lib/hooks/useEventCounts';
import { dkgAttemptTotals, dkgSessionScope } from '@/lib/dkgSessionScope.mjs';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, FullHash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedDKG, DKGSession } from '@/lib/hooks/useDKG';
import { formatBlockNumber } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const statusOptions = [
  { label: 'All Status', value: 'all' },
  { label: 'Finalized', value: 'finalized' },
  { label: 'Expired', value: 'expired' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Unactivated', value: 'unactivated' },
];

export default function DKGPage() {
  const { data: eventCounts } = useEventCountsByName('ZkDkgCoordinatorV2');
  const { data: closedCounts } = useEventCountsByArg('ZkDkgCoordinatorV2', 'outcome', ['AttemptClosed']);
  const { rows: sessions, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedDKG();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));
  const [statusFilter, setStatusFilter] = useState('all');


  const filtered = useMemo(() => {
    let result = sessions;
    if (statusFilter !== 'all') result = result.filter(s => s.status === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(s => s.fileId.toLowerCase().includes(q) || s.materialId?.toLowerCase().includes(q) || String(s.keyEpoch).includes(q));
    }
    return result;
  }, [sessions, search, statusFilter]);

  const storedTotals = eventCounts && closedCounts ? dkgAttemptTotals(eventCounts, closedCounts) : null;
  const finalized = storedTotals?.finalized ?? sessions.filter(s => s.status === 'finalized').length;
  const expired = storedTotals?.expired ?? sessions.filter(s => s.status === 'expired').length;
  const total = storedTotals?.total ?? sessions.length;

  const profileStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      if (s.n && s.t) {
        const k = `${s.n}:${s.t}`;
        map.set(k, (map.get(k) ?? 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [sessions]);

  const columns: Column<DKGSession>[] = [
    {
      key: 'materialId',
      header: 'Attempt',
      cell: row => <Hash value={row.materialId ?? row.txHash} chars={6} />,
    },
    {
      key: 'fileId',
      header: 'File ID (Policy)',
      cell: row => <FullHash value={row.fileId} />,
    },
    {
      key: 'keyEpoch',
      header: 'Key Epoch',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.keyEpoch}</span>,
    },
    {
      key: 'type',
      header: 'Type',
      cell: row => (
        <Badge
          label={row.type === 'fresh' ? 'Fresh DKG' : 'Key Refresh'}
          variant={row.type === 'fresh' ? 'blue' : 'purple'}
          dot
        />
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: row => <Badge label={row.status === 'finalized' ? 'Finalized' : row.status === 'cancelled' ? 'Cancelled' : row.status === 'unactivated' ? 'Unactivated' : 'Expired'} variant={row.status === 'finalized' ? 'green' : 'red'} dot />,
    },
    {
      key: 'committee',
      header: 'Committee (N:T)',
      cell: row => row.n && row.t ? (
        <span className="font-mono text-xs text-ft-purple">{row.n}:{row.t}</span>
      ) : <span className="text-[#64748b]">—</span>,
    },
    {
      key: 'shareVersion',
      header: 'Share Version',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.shareVersion ?? '—'}</span>,
    },
    {
      key: 'dealers',
      header: 'Dealers',
      cell: row => (
        <span className={`font-mono text-xs ${row.dealerCount > 0 ? 'text-ft-green' : 'text-[#64748b]'}`}>
          {row.dealerCount}
        </span>
      ),
    },
    {
      key: 'nonParticipants',
      header: 'Non-Participants',
      cell: row => row.nonParticipantCount !== undefined ? (
        <span className={`font-mono text-xs ${row.nonParticipantCount > 0 ? 'text-ft-red' : 'text-[#64748b]'}`}>
          {row.nonParticipantCount}
        </span>
      ) : <span className="text-[#64748b]">—</span>,
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

  if (isLoading) return <LoadingState message="Loading DKG sessions from coordinator…" />;
  if (error) return <ErrorState message="Failed to load DKG sessions" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="DKG Sessions"
        subtitle={`${total} ${storedTotals ? 'total' : 'loaded'} attempts · ZK Distributed Key Generation`}
        icon={Key}
        iconColor="text-ft-amber"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: storedTotals ? 'Total Attempts' : 'Loaded Attempts', value: total, color: 'text-ft-amber' },
          { label: 'Finalized', value: finalized, color: 'text-ft-green' },
          { label: 'Expired', value: expired, color: expired > 0 ? 'text-ft-red' : 'text-[#64748b]' },
          { label: 'Success Rate', value: total > 0 ? `${Math.round(finalized / total * 100)}%` : '—', color: 'text-ft-cyan' },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {profileStats.length > 0 && (
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Top Committee Profiles</p>
          <div className="flex flex-wrap gap-2">
            {profileStats.map(([profile, count]) => (
              <div key={profile} className="flex items-center gap-2 px-3 py-1.5 bg-bg-elevated border border-bg-border rounded-lg">
                <span className="font-mono text-sm font-semibold text-ft-purple">N:T = {profile}</span>
                <span className="text-xs text-[#64748b]">{count} sessions</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <SearchBar
          placeholder="Search by file ID, attempt or key epoch…"
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-md"
        />
        <FilterSelect options={statusOptions} value={statusFilter} onChange={setStatusFilter} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={r => dkgSessionScope(r, r.type === 'refresh')}
        pageSize={30}
        emptyMessage="No DKG sessions found"
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
      />
    </div>
  );
}
