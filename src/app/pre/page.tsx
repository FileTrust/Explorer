'use client';

import { useState, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { useDistinctArg } from '@/lib/hooks/useEventCounts';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address, FullHash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import {
  usePagedPRESessions, usePagedPREShares, usePagedPREGuardianStatus, usePagedPRERequests,
  PRESession, PREShare, GuardianPolicyStatus, PRERequest,
} from '@/lib/hooks/usePRE';
import { formatBlockNumber } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const viewOptions = [
  { label: 'Policy Sessions',    value: 'sessions' },
  { label: 'PRE Requests',       value: 'requests' },
  { label: 'Guardian Status',    value: 'guardian-status' },
  { label: 'Share Registrations', value: 'shares' },
];

function formatTs(ts: bigint): string {
  if (!ts) return '—';
  return new Date(Number(ts) * 1000).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: '2-digit',
  });
}

function GuardianPill({ guardians, variant }: { guardians: `0x${string}`[]; variant: 'green' | 'amber' | 'gray' | 'red' }) {
  const colors = {
    green: 'bg-ft-green/10 text-ft-green border-ft-green/20',
    amber: 'bg-ft-amber/10 text-ft-amber border-ft-amber/20',
    gray:  'bg-[#1e2a40] text-[#94a3b8] border-[#2d3f5e]',
    red:   'bg-ft-red/10 text-ft-red border-ft-red/20',
  };
  return (
    <div className="flex flex-wrap gap-1">
      {guardians.map(g => (
        <span key={g} className={`inline-block border rounded px-1.5 py-0.5 font-mono text-[10px] ${colors[variant]}`}>
          {g.slice(0, 6)}…{g.slice(-4)}
        </span>
      ))}
    </div>
  );
}

function ParticipationBadge({ active, ready }: { active: number; ready: number }) {
  if (ready === 0) return <span className="text-xs text-[#475569]">—</span>;
  const color = active === ready ? 'text-ft-green' : active > 0 ? 'text-ft-amber' : 'text-[#94a3b8]';
  return (
    <span className="inline-flex items-center gap-1 text-xs font-mono">
      <span className={`font-bold ${color}`}>{active}</span>
      <span className="text-[#475569]">/</span>
      <span className="text-[#94a3b8]">{ready}</span>
      <span className="text-[#475569] text-[10px] ml-0.5">did PRE / ready</span>
    </span>
  );
}

export default function PREPage() {
  // Counted in the store. A PRE policy session is identified by its policyId,
  // and one policy emits many events -- registrations, readiness, proofs -- so
  // counting rows would report one policy as several.
  //
  // Unverified against a known figure: this chain has no PRE sessions.
  const { data: storePolicies } = useDistinctArg('policyId', {
    contract: 'GuardianShareProof',
  });
  const { rows: sessions, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedPRESessions();
  const {
    rows: shares, isLoading: sharesLoading,
    hasMore: moreShares, loadMore: loadShares, loadingMore: loadingShares,
  } = usePagedPREShares();
  const {
    rows: guardianStatus, isLoading: gsLoading,
    hasMore: moreStatus, loadMore: loadStatus, loadingMore: loadingStatus,
  } = usePagedPREGuardianStatus();
  const {
    rows: requests, isLoading: reqLoading,
    hasMore: moreRequests, loadMore: loadRequests, loadingMore: loadingRequests,
  } = usePagedPRERequests();
  const [view, setView] = useState(() => (initialQueryParam('q') ? 'requests' : 'sessions'));
  // A link carrying ?q= is asking about a request, so it opens that tab.
  const [search, setSearch] = useState(() => initialQueryParam('q'));

  const filteredSessions = useMemo(() => {
    if (!search) return sessions;
    const q = search.toLowerCase();
    return sessions.filter(s =>
      s.policyId.toLowerCase().includes(q) || s.dataOwner.toLowerCase().includes(q)
    );
  }, [sessions, search]);

  const filteredRequests = useMemo(() => {
    if (!search) return requests;
    const q = search.toLowerCase();
    return requests.filter(r =>
      r.requestId.toString().includes(q) ||
      r.fileId.toLowerCase().includes(q) ||
      r.activeGuardians.some(g => g.toLowerCase().includes(q)) ||
      r.readyGuardians.some(g => g.toLowerCase().includes(q))
    );
  }, [requests, search]);

  const filteredShares = useMemo(() => {
    if (!search) return shares;
    const q = search.toLowerCase();
    return shares.filter(s =>
      s.policyId.toLowerCase().includes(q) || s.guardian.toLowerCase().includes(q)
    );
  }, [shares, search]);

  const filteredGuardianStatus = useMemo(() => {
    if (!search) return guardianStatus;
    const q = search.toLowerCase();
    return guardianStatus.filter(g =>
      g.guardian.toLowerCase().includes(q) || g.policyId.toLowerCase().includes(q)
    );
  }, [guardianStatus, search]);

  const activeSessionCount = sessions.filter(s => s.status === 'active').length;
  const totalReady = sessions.reduce((s, p) => s + p.readyCount, 0);
  const totalRequests = requests.length;
  const totalPREDone = requests.reduce((s, r) => s + r.activeGuardians.length, 0);

  const sessionColumns: Column<PRESession>[] = [
    {
      key: 'policyId',
      header: 'Policy ID',
      cell: row => <FullHash value={row.policyId} />,
    },
    {
      key: 'dataOwner',
      header: 'Data Owner',
      cell: row => <Address value={row.dataOwner} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: row => (
        <Badge
          label={row.status === 'active' ? 'Active' : 'Expired'}
          variant={row.status === 'active' ? 'green' : 'gray'}
          dot
        />
      ),
    },
    {
      key: 'readyCount',
      header: 'Guardians Ready',
      cell: row => (
        <span className="font-mono text-xs text-ft-purple font-bold">{row.readyCount}</span>
      ),
    },
    {
      key: 'provedCount',
      header: 'Share Proofs',
      cell: row => (
        <span className={`font-mono text-xs font-bold ${row.provedCount > 0 ? 'text-ft-green' : 'text-[#64748b]'}`}>
          {row.provedCount}
        </span>
      ),
    },
    {
      key: 'servicePeriod',
      header: 'Service Period',
      cell: row => (
        <span className="font-mono text-xs text-[#94a3b8]">
          {formatTs(row.serviceStart)} → {formatTs(row.serviceEnd)}
        </span>
      ),
    },
    {
      key: 'durationDays',
      header: 'Duration',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.durationDays.toString()}d</span>,
    },
    {
      key: 'block',
      header: 'Block',
      cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span>,
    },
  ];

  const requestColumns: Column<PRERequest>[] = [
    {
      key: 'requestId',
      header: 'Request ID',
      cell: row => <span className="font-mono text-xs text-ft-blue">#{row.requestId.toString()}</span>,
    },
    {
      key: 'fileId',
      header: 'File ID',
      cell: row => <FullHash value={row.fileId} />,
    },
    {
      key: 'status',
      header: 'Status',
      cell: row => {
        if (row.expired) return <Badge label={`Expired (${row.absentCount} absent)`} variant="red" dot />;
        if (row.activeGuardians.length > 0) return <Badge label="Completed" variant="green" dot />;
        return <Badge label="In Progress" variant="amber" dot />;
      },
    },
    {
      key: 'participation',
      header: 'Participation',
      cell: row => <ParticipationBadge active={row.activeGuardians.length} ready={row.readyGuardians.length} />,
    },
    {
      key: 'didPRE',
      header: 'Did PRE',
      cell: row => row.activeGuardians.length > 0
        ? <GuardianPill guardians={row.activeGuardians} variant="green" />
        : <span className="text-xs text-[#475569]">none yet</span>,
    },
    {
      key: 'readyOnly',
      header: 'Ready Only',
      cell: row => row.notUsedGuardians.length > 0
        ? <GuardianPill guardians={row.notUsedGuardians} variant="gray" />
        : <span className="text-xs text-[#475569]">—</span>,
    },
    {
      key: 'badPartials',
      header: 'Bad Partial',
      cell: row => row.badPartialGuardians.length > 0
        ? <GuardianPill guardians={row.badPartialGuardians} variant="red" />
        : <span className="text-xs text-[#475569]">—</span>,
    },
    {
      key: 'block',
      header: 'Block',
      cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span>,
    },
  ];

  const guardianStatusColumns: Column<GuardianPolicyStatus>[] = [
    {
      key: 'role',
      header: 'Role',
      cell: row => {
        if (row.status === 'proved') return <Badge label="Proved" variant="green" dot />;
        if (row.status === 'missed') return <Badge label="Missed Proof" variant="red" dot />;
        return <Badge label="Ready" variant="gray" dot />;
      },
    },
    {
      key: 'guardian',
      header: 'Guardian',
      cell: row => <Address value={row.guardian} />,
    },
    {
      key: 'shareIndex',
      header: 'Share #',
      cell: row => <span className="font-mono text-xs text-ft-purple">#{row.shareIndex}</span>,
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
      key: 'proofs',
      header: 'Share Proofs',
      cell: row => (
        <span className="font-mono text-xs">
          <span className="text-ft-green">{row.validProofCount}✓</span>
          {row.missedProofCount > 0 && (
            <span className="text-ft-red ml-1">{row.missedProofCount}✗</span>
          )}
        </span>
      ),
    },
    {
      key: 'registeredBlock',
      header: 'Registered',
      cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.registeredBlock)}</span>,
    },
    {
      key: 'lastProofBlock',
      header: 'Last Proof',
      cell: row => (
        <span className="font-mono text-xs text-[#64748b]">
          {row.lastProofBlock > 0n ? formatBlockNumber(row.lastProofBlock) : '—'}
        </span>
      ),
    },
  ];

  const shareColumns: Column<PREShare>[] = [
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
      key: 'shareIndex',
      header: 'Share Index',
      cell: row => <span className="font-mono text-xs text-ft-purple">#{row.shareIndex}</span>,
    },
    {
      key: 'shareVersion',
      header: 'Version',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">v{row.shareVersion}</span>,
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

  if (isLoading) return <LoadingState message="Loading PRE sessions…" />;
  if (error) return <ErrorState message="Failed to load PRE sessions" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="PRE Sessions"
        subtitle="Proxy Re-Encryption — policy service periods, guardian readiness, and per-request participation"
        icon={RefreshCw}
        iconColor="text-ft-cyan"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Policies', value: storePolicies ?? sessions.length, color: 'text-ft-cyan' },
          { label: 'Active Policies', value: activeSessionCount, color: activeSessionCount > 0 ? 'text-ft-green' : 'text-[#64748b]' },
          { label: 'PRE Requests', value: totalRequests, color: totalRequests > 0 ? 'text-ft-blue' : 'text-[#64748b]',
            sub: 'data access re-encryption requests' },
          { label: 'Guardians Ready', value: totalReady, color: 'text-ft-purple',
            sub: 'registered re-encryption key' },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value.toLocaleString()}</p>
            {'sub' in s && s.sub && <p className="text-[10px] text-[#475569] mt-0.5">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap items-center">
        <div className="flex rounded-lg overflow-hidden border border-bg-border">
          {viewOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setView(opt.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === opt.value
                  ? 'bg-ft-cyan/10 text-ft-cyan'
                  : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-bg-elevated'
              }`}
            >
              {opt.label}
              <span className="ml-1.5 text-[10px] font-mono opacity-60">
                {opt.value === 'sessions' ? sessions.length
                  : opt.value === 'requests' ? requests.length
                  : opt.value === 'guardian-status' ? guardianStatus.length
                  : shares.length}
              </span>
            </button>
          ))}
        </div>
        <SearchBar
          placeholder="Search by policy ID, request ID, or address…"
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-md"
        />
      </div>

      {/* Legend for Guardian Status tab */}
      {view === 'guardian-status' && (
        <div className="flex gap-4 flex-wrap text-xs text-[#64748b] px-1">
          <span><span className="text-ft-green font-semibold">● Proved</span> — registered re-encryption key + submitted periodic share proof</span>
          <span><span className="text-[#94a3b8] font-semibold">● Ready</span> — published re-encryption key, no periodic proof yet</span>
          <span><span className="text-ft-red font-semibold">● Missed Proof</span> — registered but missed periodic heartbeat</span>
        </div>
      )}

      {/* Legend for PRE Requests tab */}
      {view === 'requests' && requests.length > 0 && (
        <div className="flex gap-4 flex-wrap text-xs text-[#64748b] px-1">
          <span><span className="text-ft-green font-semibold">● Did PRE</span> — submitted re-encryption partial (V2AccessPartialSubmitted)</span>
          <span><span className="text-[#94a3b8] font-semibold">● Ready Only</span> — declared ready (PreReadyDeclared) but threshold met without them</span>
          <span><span className="text-ft-red font-semibold">● Bad Partial</span> — submitted an invalid partial (PreBadPartialDetected)</span>
        </div>
      )}

      {view === 'sessions' && (
        <DataTable
          columns={sessionColumns}
          data={filteredSessions}
          keyExtractor={r => r.policyId}
          pageSize={30}
          emptyMessage="No PRE policy sessions found"
          loading={isLoading}
          hasMore={hasMore}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
        />
      )}
      {view === 'requests' && (
        requests.length === 0 && !reqLoading ? (
          <div className="bg-bg-surface border border-bg-border rounded-xl p-10 text-center">
            <p className="text-[#64748b] text-sm">No PRE requests yet</p>
            <p className="text-[#475569] text-xs mt-1">
              Per-request guardian participation will appear here when data access re-encryption events
              (PreReadyDeclared, V2AccessPartialSubmitted) are emitted by the TElGv2 contract.
            </p>
          </div>
        ) : (
          <DataTable
            columns={requestColumns}
            data={filteredRequests}
            keyExtractor={r => r.requestId.toString()}
            pageSize={30}
            emptyMessage="No PRE requests match your search"
            loading={reqLoading}
            hasMore={moreRequests}
            onLoadMore={loadRequests}
            loadingMore={loadingRequests}
          />
        )
      )}
      {view === 'guardian-status' && (
        <DataTable
          columns={guardianStatusColumns}
          data={filteredGuardianStatus}
          keyExtractor={r => `${r.policyId}-${r.guardian}`}
          pageSize={30}
          emptyMessage="No guardian status data found"
          loading={gsLoading}
          hasMore={moreStatus}
          onLoadMore={loadStatus}
          loadingMore={loadingStatus}
        />
      )}
      {view === 'shares' && (
        <DataTable
          columns={shareColumns}
          data={filteredShares}
          keyExtractor={r => `${r.policyId}-${r.guardian}-${r.shareIndex}`}
          pageSize={30}
          emptyMessage="No guardian share registrations found"
          loading={sharesLoading}
          hasMore={moreShares}
          onLoadMore={loadShares}
          loadingMore={loadingShares}
        />
      )}
    </div>
  );
}
