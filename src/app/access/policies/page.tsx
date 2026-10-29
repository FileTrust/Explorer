'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Address, FullHash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedPolicies, useFilePolicyCounts, usePolicies, FilePolicy } from '@/lib/hooks/usePolicies';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const statusOptions = [
  { label: 'All Status', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'KeyGen Pending', value: 'keygen' },
];

const modeOptions = [
  { label: 'All Modes', value: 'all' },
  { label: 'ZKDKG v2', value: 'ZKDKG_V2' },
  { label: 'Legacy', value: 'LEGACY' },
];

export default function PoliciesPage() {
  const router = useRouter();
  // A page of projected rows, with the four figures beside them counted in the
  // store rather than filtered out of whatever had been downloaded.
  const { rows: policies, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedPolicies();
  const { data: counts } = useFilePolicyCounts();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));
  const [status, setStatus] = useState('all');
  const [mode, setMode] = useState('all');


  const filtered = useMemo(() => {
    let rows = policies;
    if (status === 'active') rows = rows.filter(row => row.active);
    if (status === 'inactive') rows = rows.filter(row => !row.active);
    if (status === 'keygen') rows = rows.filter(row => row.keyGenRequested);
    if (mode !== 'all') rows = rows.filter(row => row.mode === mode);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(row =>
        row.fileId.toLowerCase().includes(q) ||
        row.dataOwner.toLowerCase().includes(q) ||
        row.selectedGuardians.some(g => g.toLowerCase().includes(q))
      );
    }
    return rows;
  }, [mode, policies, search, status]);

  const columns: Column<FilePolicy>[] = [
    { key: 'status', header: 'Status', cell: row => <Badge label={row.active ? 'Active' : 'Inactive'} variant={row.active ? 'green' : 'gray'} dot /> },
    { key: 'fileId', header: 'File ID', cell: row => <FullHash value={row.fileId} /> },
    { key: 'owner', header: 'Data Owner', cell: row => <Address value={row.dataOwner} /> },
    { key: 'mode', header: 'Mode', cell: row => <Badge label={row.mode === 'ZKDKG_V2' ? 'ZKDKG v2' : 'Legacy'} variant={row.mode === 'ZKDKG_V2' ? 'purple' : 'gray'} /> },
    { key: 'threshold', header: 'Threshold', cell: row => <span className="font-mono text-xs text-ft-amber">{row.threshold} / {row.selectedGuardians.length}</span> },
    { key: 'requesters', header: 'Requesters', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.requesterCount}</span> },
    { key: 'keygen', header: 'KeyGen', cell: row => row.keyGenRequested ? <Badge label={row.keyGenRequestedAt > 0n ? formatTimestamp(row.keyGenRequestedAt) : 'Pending'} variant="amber" /> : <span className="text-xs text-[#64748b]">—</span> },
    { key: 'access', header: 'Access Req', cell: row => <span className="font-mono text-xs text-ft-blue">{row.accessRequestCount}</span> },
    { key: 'block', header: 'Created', cell: row => row.createdBlock ? <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.createdBlock)}</span> : <span className="text-xs text-[#64748b]">—</span> },
  ];

  if (isLoading) return <LoadingState message="Loading file policies…" />;
  if (error) return <ErrorState message="Failed to load file policies" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="File Policies"
        subtitle={`${(counts?.total ?? policies.length).toLocaleString()} policy records from AccessControlFT`}
        icon={ShieldCheck}
        iconColor="text-ft-purple"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Policies', value: counts?.total ?? policies.length, color: 'text-ft-purple' },
          { label: 'Active', value: counts?.active ?? policies.filter(p => p.active).length, color: 'text-ft-green' },
          { label: 'ZKDKG v2', value: counts?.zkdkgV2 ?? policies.filter(p => p.mode === 'ZKDKG_V2').length, color: 'text-ft-blue' },
          { label: 'KeyGen Pending', value: counts?.keyGenPending ?? policies.filter(p => p.keyGenRequested).length, color: 'text-ft-amber' },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <SearchBar placeholder="Search by file ID, data owner, guardian…" value={search} onChange={setSearch} className="flex-1 max-w-lg" />
        <FilterSelect options={statusOptions} value={status} onChange={setStatus} />
        <FilterSelect options={modeOptions} value={mode} onChange={setMode} />
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        keyExtractor={r => r.fileId}
        pageSize={30}
        emptyMessage="No policies match your filters"
        onRowClick={row => router.push(`/access/policies/${row.fileId}`)}
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
      />
    </div>
  );
}
