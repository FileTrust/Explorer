'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Server } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Address } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedVKProfiles, useVaultKeepers, VKProfile } from '@/lib/hooks/useVaultKeepers';
import { formatBytes, formatTimestamp, timeAgo, reputationColor } from '@/lib/utils';
import { admissionClosure } from '@/lib/admissionClosure';
import { useNowSeconds } from '@/lib/browserState';

import { heartbeatFresh } from '@/lib/heartbeat.mjs';

const statusOptions = [
  { label: 'All Participation', value: 'all' },
  { label: 'Enabled', value: 'active' },
  { label: 'Disabled', value: 'inactive' },
  { label: 'Suspended', value: 'suspended' },
];

export default function VaultKeepersPage() {
  const router = useRouter();
  // A page at a time. The table holds a screenful and asks for more; at ten
  // thousand keepers the alternative is ten thousand rows in the browser.
  const { rows: vks, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedVKProfiles();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const now = useNowSeconds();

  // A VK that closes admission publishes zero admissible bytes, which reads as
  // "this VK has no disk left" when it usually means "this VK is busy proving
  // and will not take more right now". Remember the last non-zero figure each VK
  // reported while open, so a closure can show what it had a moment ago.
  //
  // Accumulated in an effect rather than while rendering. Writing a ref during
  // render is a real hazard and not only a lint rule: React may render a
  // component without committing it, and this one would have remembered a
  // figure from a render that never reached the screen.
  const lastFreeSeen = useRef<Map<string, bigint>>(new Map());
  useEffect(() => {
    for (const vk of vks) {
      if (vk.admissionReadAvailable && vk.reportedAdmissionFreeBytes > 0n) {
        lastFreeSeen.current.set(vk.address, vk.reportedAdmissionFreeBytes);
      }
    }
  }, [vks]);

  const filtered = useMemo(() => {
    let result = vks;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(vk => vk.address.toLowerCase().includes(q));
    }
    if (statusFilter !== 'all') {
      if (statusFilter === 'suspended') result = result.filter(vk => vk.suspendedUntil > now);
      else result = result.filter(vk => vk.suspendedUntil <= now && (statusFilter === 'active') === vk.active);
    }
    return result.sort((a, b) => b.reputation - a.reputation);
  }, [vks, search, statusFilter, now]);

  const columns: Column<VKProfile>[] = [
    {
      key: 'address',
      header: 'Address',
      cell: row => <Address value={row.address} />,
    },
    {
      key: 'status',
      header: 'Participation',
      cell: row => {
        if (row.suspendedUntil > now) return <Badge label="Suspended" variant="amber" dot />;
        return <Badge label={row.active ? 'Enabled' : 'Disabled'} variant={row.active ? 'green' : 'gray'} dot />;
      },
    },
    {
      key: 'heartbeatStatus',
      header: 'Heartbeat',
      cell: row => <Badge label={heartbeatFresh(row.lastHeartbeat, now) ? 'Fresh' : 'Stale'} variant={heartbeatFresh(row.lastHeartbeat, now) ? 'green' : 'amber'} dot />,
    },
    {
      key: 'storageFee',
      header: 'Storage Fee',
      unit: 'SU / GB-day',
      cell: row => <span className="font-mono text-xs text-ft-blue">{row.storageFee.toLocaleString()}</span>,
    },
    {
      key: 'stake',
      header: 'Stake',
      unit: 'FTU',
      cell: row => <FtuAmount wei={row.stake} decimals={4} showUnit={false} className="font-mono text-xs text-[#e2e8f0]" />,
    },
    {
      key: 'availableStake',
      header: 'Available',
      unit: 'FTU',
      cell: row => <FtuAmount wei={row.availableStake} decimals={4} showUnit={false} className="font-mono text-xs text-ft-green" />,
    },
    {
      key: 'lockedStake',
      header: 'Locked',
      unit: 'FTU',
      cell: row => <FtuAmount wei={row.lockedStake} decimals={4} showUnit={false} className="font-mono text-xs text-ft-amber" />,
    },
    {
      key: 'admission',
      header: 'Admission',
      cell: row => {
        if (row.admissionState === 'open') return <Badge label="Open" variant="green" dot />;
        if (row.admissionState === 'capacity_closed') {
          // Say WHY, here rather than in Reported Free.
          //
          // "Capacity Closed" reads identically for a keeper genuinely out of
          // room -- which stays that way until something is deleted -- and one
          // part-way through a capacity proof that reopens by itself in a couple
          // of minutes. Opposite facts for anyone choosing where to put a file.
          //
          // The reason first went into the Reported Free cell, which only showed
          // it when reported free was exactly 0. A keeper closed on
          // oldest_dirty_hard_lag while still reporting 0.08 GB therefore showed
          // a number and no reason at all -- the common case, and worse than
          // before. Status belongs in the status column, where the free figure
          // cannot hide it.
          const closure = admissionClosure(row.admissionClosureReason);
          return (
            <span title={closure.detail}>
              <Badge
                label={closure.label}
                variant={closure.full ? 'red' : 'amber'}
                dot
              />
            </span>
          );
        }
        if (row.admissionState === 'ineligible') return <Badge label="Ineligible" variant="amber" dot />;
        return <Badge label="Admission Pending" variant="gray" dot />;
      },
    },
    {
      key: 'admissionFree',
      header: 'Reported Free',
      cell: row => {
        // Only an unreadable admission record deserves the dash.
        if (!row.admissionReadAvailable) {
          return <span className="font-mono text-xs text-[#e2e8f0]">—</span>;
        }
        // This column is the NUMBER. The reason lives in Admission, which shows
        // it whatever this figure happens to be.
        //
        // Zero is a true answer but a misleading one alone: it is the space this
        // keeper will admit right now, not the space it owns. So when it reaches
        // zero, show what it last had if we watched it go.
        const previous = lastFreeSeen.current.get(row.address);
        const none = row.reportedAdmissionFreeBytes === 0n;
        return (
          <span
            className={`font-mono text-xs ${none ? 'text-ft-amber' : 'text-[#e2e8f0]'}`}
            title={
              none
                ? 'The space this Vault Keeper will admit right now, not the space it ' +
                  'owns. See Admission for why it is admitting nothing.'
                : 'The space this Vault Keeper will admit right now.'
            }
          >
            {formatBytes(row.reportedAdmissionFreeBytes)}
            {none && previous !== undefined && (
              <span className="ml-1 text-[#64748b]">(was {formatBytes(previous)})</span>
            )}
          </span>
        );
      },
    },
    {
      key: 'reputation',
      header: 'Reputation',
      cell: row => (
        <span className={`text-xs font-semibold ${reputationColor(row.reputation)}`}>
          {row.reputation}
        </span>
      ),
    },
    {
      key: 'missedProofs',
      header: 'Missed Proofs',
      cell: row => <span className={`font-mono text-xs ${row.missedProofs > 0 ? 'text-ft-amber' : 'text-[#64748b]'}`}>{row.missedProofs}</span>,
    },
    {
      key: 'disputes',
      header: 'Disputes',
      cell: row => <span className={`font-mono text-xs ${row.disputeComplaints > 0 ? 'text-ft-red' : 'text-[#64748b]'}`}>{row.disputeComplaints}</span>,
    },
    {
      key: 'penalty',
      header: 'Penalty',
      cell: row => <span className={`font-mono text-xs ${row.penaltyPoints > 0 ? 'text-ft-red' : 'text-[#64748b]'}`}>{row.penaltyPoints}</span>,
    },
    {
      key: 'maxPieceSize',
      header: 'Max Piece',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.maxPieceSizeBytes > 0n ? formatBytes(row.maxPieceSizeBytes) : '∞'}</span>,
    },
    {
      key: 'maxServiceDays',
      header: 'Max Days',
      cell: row => (
        <span className="font-mono text-xs text-[#94a3b8]">
          {row.maxServiceDays === 0 ? '∞' : row.maxServiceDays}
        </span>
      ),
    },
    {
      key: 'latestServiceEnd',
      header: 'Service End',
      cell: row => <span className="text-xs text-[#64748b]">{row.latestServiceEnd > 0n ? formatTimestamp(row.latestServiceEnd) : '—'}</span>,
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
      key: 'endpointSeq',
      header: 'Endpoint Seq',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.endpointSeq.toLocaleString()}</span>,
    },
  ];

  if (isLoading) return <LoadingState message="Loading vault keepers from registry…" />;
  if (error) return <ErrorState message="Failed to load vault keepers" retry={refetch} />;

  const activeCount = vks.filter(vk => vk.active && vk.suspendedUntil <= now).length;
  const suspendedCount = vks.filter(vk => vk.suspendedUntil > now).length;
  const totalStake = vks.reduce((s, vk) => s + vk.stake, 0n);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Vault Keepers"
        subtitle={`${vks.length} registered · ${activeCount} enabled`}
        icon={Server}
        iconColor="text-ft-cyan"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total', value: vks.length.toString(), color: 'text-ft-cyan' },
          { label: 'Enabled', value: activeCount.toString(), color: 'text-ft-green' },
          { label: 'Suspended', value: suspendedCount.toString(), color: suspendedCount > 0 ? 'text-ft-amber' : 'text-[#64748b]' },
          { label: 'Total Stake', value: <FtuAmount wei={totalStake} decimals={3} />, color: 'text-ft-blue' },
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
        columns={columns}
        data={filtered}
        keyExtractor={r => r.address}
        pageSize={30}
        emptyMessage="No vault keepers match your search"
        onRowClick={row => router.push(`/vault-keepers/${row.address}`)}
      />
    </div>
  );
}
