'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Database, ShieldCheck } from 'lucide-react';
import { useEventCount } from '@/lib/hooks/useEventCounts';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address, FullHash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedAccessRequests, usePagedDataBatches, AccessRequest, DataBatch } from '@/lib/hooks/useAccess';
import { formatBlockNumber } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const viewOptions = [
  { label: 'Access Requests', value: 'requests' },
  { label: 'Data Batches', value: 'batches' },
];

export default function AccessPage() {
  // Counted in the store. Each access request is one DataAccessRequestedV2
  // event, so this is a plain count rather than a distinct one -- unlike DKG
  // sessions or file commitments, where one thing emits several events.
  //
  // Unverified against a known figure: this chain has no access requests, so it
  // reads zero either way.
  const { data: storeRequests } = useEventCount({
    contract: 'DataVault', event: 'DataAccessRequestedV2',
  });
  const {
    rows: requests, isLoading: reqLoading, error: reqError, refetch: reqRefetch,
    hasMore: moreRequests, loadMore: loadRequests, loadingMore: loadingRequests,
  } = usePagedAccessRequests();
  const {
    rows: batches, isLoading: batchLoading,
    hasMore: moreBatches, loadMore: loadBatches, loadingMore: loadingBatches,
  } = usePagedDataBatches();
  // Both seeded from the link that opened this page, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));
  const [view, setView] = useState(() => {
    const asked = initialQueryParam('view');
    return asked === 'requests' || asked === 'batches' ? asked : 'batches';
  });
  const [filter, setFilter] = useState('all');

  const statusOptions = [
    { label: 'All Status', value: 'all' },
    { label: 'Fulfilled', value: 'fulfilled' },
    { label: 'Pending', value: 'pending' },
  ];

  const filteredRequests = useMemo(() => {
    let result = requests;
    if (filter !== 'all') result = result.filter(r => filter === 'fulfilled' ? r.fulfilled : !r.fulfilled);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r =>
        r.fileId.toLowerCase().includes(q) ||
        r.requester.toLowerCase().includes(q) ||
        r.dataId.toLowerCase().includes(q) ||
        r.requestId.toString().includes(q)
      );
    }
    return result;
  }, [requests, search, filter]);

  const filteredBatches = useMemo(() => {
    if (!search) return batches;
    const q = search.toLowerCase();
    return batches.filter(b =>
      b.fileId.toLowerCase().includes(q) ||
      b.dataOwner.toLowerCase().includes(q) ||
      b.dataId.toLowerCase().includes(q)
    );
  }, [batches, search]);

  const requestColumns: Column<AccessRequest>[] = [
    {
      key: 'requestId',
      header: 'Request ID',
      cell: row => <span className="font-mono text-xs text-ft-amber">#{row.requestId.toString()}</span>,
    },
    {
      key: 'fileId',
      header: 'File ID',
      cell: row => <FullHash value={row.fileId} />,
    },
    {
      key: 'requester',
      header: 'Requester',
      cell: row => <Address value={row.requester} />,
    },
    {
      key: 'status',
      header: 'Status',
      // Pending says how far short it is. "Pending" alone is the same word for a
      // request nobody has answered and one waiting on its last guardian, and
      // the difference is the whole question anyone asks of this screen.
      cell: row => (
        <div className="flex items-center gap-2">
          <Badge
            label={row.fulfilled ? 'Fulfilled' : 'Pending'}
            variant={row.fulfilled ? 'green' : 'amber'}
            dot
          />
          {row.sharesRequired > 0 && (
            <span className="text-[10px] font-mono text-[#64748b]">
              {row.sharesSubmitted}/{row.sharesRequired} shares
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'batchId',
      header: 'Batch',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">#{row.batchId.toString()}</span>,
    },
    {
      key: 'pieces',
      header: 'Pieces',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.pieceCount}</span>,
    },
    {
      key: 'keyEpoch',
      header: 'Key Epoch',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.keyEpoch}</span>,
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

  const batchColumns: Column<DataBatch>[] = [
    {
      key: 'fileId',
      header: 'File ID',
      cell: row => <FullHash value={row.fileId} />,
    },
    {
      key: 'batchId',
      header: 'Batch ID',
      cell: row => <span className="font-mono text-xs text-ft-amber">#{row.batchId.toString()}</span>,
    },
    {
      key: 'dataOwner',
      header: 'Data Owner',
      cell: row => <Address value={row.dataOwner} />,
    },
    {
      key: 'committee',
      header: 'Committee',
      cell: row => <span className="font-mono text-xs text-ft-purple">N={row.n} T={row.t}</span>,
    },
    {
      key: 'keyEpoch',
      header: 'Key Epoch',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.keyEpoch}</span>,
    },
    {
      key: 'dataId',
      header: 'Data ID',
      cell: row => <span className="text-xs text-[#94a3b8] truncate max-w-[120px] block" title={row.dataId}>{row.dataId || '—'}</span>,
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

  if (reqLoading) return <LoadingState message="Loading data access events…" />;
  if (reqError) return <ErrorState message="Failed to load access data" retry={reqRefetch} />;

  const fulfilled = requests.filter(r => r.fulfilled).length;
  const pending = requests.filter(r => !r.fulfilled).length;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Data Access"
        subtitle="Re-encryption requests and data batches"
        icon={Database}
        iconColor="text-ft-amber"
        actions={
          <Link href="/access/policies" className="inline-flex items-center gap-1.5 bg-bg-surface border border-bg-border rounded-lg px-3 py-2 text-sm text-ft-purple hover:border-ft-purple/40 transition-colors">
            <ShieldCheck size={14} /> Policies
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Requests', value: storeRequests ?? requests.length, color: 'text-ft-amber' },
          { label: 'Fulfilled', value: fulfilled, color: 'text-ft-green' },
          { label: 'Pending', value: pending, color: pending > 0 ? 'text-ft-amber' : 'text-[#64748b]' },
          { label: 'Data Batches', value: batches.length, color: 'text-ft-purple' },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-bg-border">
          {viewOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setView(opt.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${view === opt.value ? 'bg-ft-blue/10 text-ft-blue' : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-bg-elevated'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <SearchBar
          placeholder={view === 'requests' ? "Search by file, requester, data ID…" : "Search by file, owner, data ID…"}
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-md"
        />
        {view === 'requests' && (
          <FilterSelect options={statusOptions} value={filter} onChange={setFilter} />
        )}
      </div>

      {view === 'requests' ? (
        <DataTable
          columns={requestColumns}
          data={filteredRequests}
          keyExtractor={r => `${r.requestId}-${r.fileId}`}
          pageSize={30}
          emptyMessage="No access requests found"
          loading={reqLoading}
          hasMore={moreRequests}
          onLoadMore={loadRequests}
          loadingMore={loadingRequests}
        />
      ) : (
        <DataTable
          columns={batchColumns}
          data={filteredBatches}
          keyExtractor={r => `${r.fileId}-${r.batchId}`}
          pageSize={30}
          emptyMessage="No data batches found"
          loading={batchLoading}
          hasMore={moreBatches}
          onLoadMore={loadBatches}
          loadingMore={loadingBatches}
        />
      )}
    </div>
  );
}
