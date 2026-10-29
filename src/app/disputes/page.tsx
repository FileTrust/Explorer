'use client';

import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address, FullHash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedDisputes, useDisputeStats, disputeStats, type DisputeEvent } from '@/lib/hooks/useDisputes';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';

const TYPE_VARIANTS: Record<string, string> = {
  'Storage Dispute Submitted': 'amber',
  'Storage Dispute Valid': 'green',
  'Storage Dispute Invalid': 'gray',
  'Storage Enforcement Applied': 'red',
  'VK Suspended By Dispute': 'red',
  'VK Permanently Removed': 'red',
  'Sector Risk Notice': 'amber',
  'Deletion Dispute Submitted': 'amber',
  'Deletion Dispute Valid': 'green',
  'Deletion Dispute Invalid': 'gray',
  'Deletion Enforcement Applied': 'red',
  'ZK-DKG Dispute Opened': 'amber',
  'ZK-DKG Dispute Justified': 'green',
  'ZK-DKG Dispute Expired': 'red',
  'ZK-DKG Dealer Excluded': 'red',
  'VK Dispute Penalty': 'red',
  'VK Serious Penalty': 'red',
  'Guardian Serious Penalty': 'red',
  'DKG Complaint Submitted': 'amber',
  'PRE Complaint Submitted': 'amber',
  'DKG Failure Recorded': 'amber',
  'PRE Failure Recorded': 'amber',
};

export default function DisputesPage() {
  const { rows: disputes, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedDisputes();
  // Counted in the store. Totalling the rows was only right while the screen
  // downloaded every dispute event; paged, it would describe one page.
  const storeStats = useDisputeStats();
  const stats = storeStats.fromStore ? storeStats : disputeStats(disputes);

  const columns: Column<DisputeEvent>[] = [
    {
      key: 'type',
      header: 'Event Type',
      cell: row => <Badge label={row.type} variant={(TYPE_VARIANTS[row.type] ?? 'gray') as any} />,
    },
    {
      key: 'disputeId',
      header: 'Dispute ID',
      cell: row => row.disputeId !== undefined ? (
        <Hash value={row.disputeId} chars={6} />
      ) : <span className="text-[#64748b]">—</span>,
    },
    {
      key: 'actor',
      header: 'Actor',
      cell: row => {
        const primary = row.vk ?? row.guardian ?? row.dealer ?? row.receiver;
        if (!primary) return <span className="text-[#64748b]">—</span>;
        return (
          <div className="space-y-1">
            <Address value={primary} />
            {row.dealer && row.receiver && (
              <p className="text-[10px] text-[#64748b]">
                dealer <Hash value={row.dealer} chars={4} /> / receiver <Hash value={row.receiver} chars={4} />
              </p>
            )}
            {row.reporter && (
              <p className="text-[10px] text-[#64748b]">
                reporter <Hash value={row.reporter} chars={4} />
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'detail',
      header: 'Detail',
      cell: row => {
        if (row.commitmentHash) return <Hash value={row.commitmentHash} chars={8} href={`/files/${row.commitmentHash}`} />;
        if (row.fileId) return (
          <div className="space-y-1">
            <FullHash value={row.fileId} href={`/dkg?q=${row.fileId}`} />
            {row.detail && <p className="text-[10px] text-[#64748b]">{row.detail}</p>}
            {row.deadline && row.deadline > 0n && <p className="text-[10px] text-ft-amber">deadline {formatTimestamp(row.deadline)}</p>}
          </div>
        );
        if (row.sectorRoot) return <Hash value={row.sectorRoot} chars={8} href={`/storage/sectors?q=${row.sectorRoot}`} />;
        if (row.partitionRoot) return <Hash value={row.partitionRoot} chars={8} />;
        if (row.stakeSlashed !== undefined) return <span className="font-mono text-xs text-ft-red"><FtuAmount wei={row.stakeSlashed} decimals={6} /> slashed · rep -{row.reputationPenalty ?? 0}</span>;
        if (row.suspendedUntil && row.suspendedUntil > 0n) return <span className="text-xs text-ft-amber">Until {formatTimestamp(row.suspendedUntil)}</span>;
        if (row.deadline && row.deadline > 0n) return <span className="text-xs text-ft-amber">Deadline {formatTimestamp(row.deadline)}</span>;
        if (row.reason && row.detail) return (
          <div className="space-y-1">
            <p className="text-xs text-[#94a3b8]">{row.detail}</p>
            <p className="text-[10px] text-ft-amber">{row.reason}</p>
          </div>
        );
        if (row.reason) return <span className="text-xs text-[#94a3b8] truncate max-w-[150px] block">{row.reason}</span>;
        if (row.detail) return <span className="text-xs text-[#94a3b8]">{row.detail}</span>;
        if (row.permanentlyRemoved) return <Badge label="Permanent removal" variant="red" />;
        return <span className="text-[#64748b]">—</span>;
      },
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

  if (isLoading) return <LoadingState message="Loading dispute events…" />;
  if (error) return <ErrorState message="Failed to load disputes" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Disputes & Penalties"
        subtitle={`${stats.formal} formal disputes · ${stats.enforcement} enforcement and penalty events`}
        icon={AlertTriangle}
        iconColor="text-ft-red"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Events', value: stats.total, color: 'text-ft-red' },
          { label: 'Formal Disputes', value: stats.formal, color: 'text-ft-amber' },
          { label: 'Storage', value: stats.storage, color: 'text-ft-blue' },
          { label: 'Deletion', value: stats.deletion, color: 'text-ft-purple' },
          { label: 'ZK-DKG', value: stats.zkdkg, color: 'text-ft-cyan' },
          { label: 'Valid / Justified', value: stats.valid, color: 'text-ft-green' },
          { label: 'Invalid / Expired', value: stats.invalid + stats.expired, color: stats.invalid + stats.expired > 0 ? 'text-ft-red' : 'text-[#64748b]' },
          { label: 'Enforcement', value: stats.enforcement, color: stats.enforcement > 0 ? 'text-ft-red' : 'text-[#64748b]' },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {disputes.length === 0 && !isLoading && (
        <div className="bg-bg-surface border border-ft-green/20 rounded-xl p-6 text-center">
          <div className="text-3xl mb-2">✓</div>
          <p className="text-ft-green font-semibold">No disputes found</p>
          <p className="text-sm text-[#64748b] mt-1">All participants are behaving correctly</p>
        </div>
      )}

      <DataTable
        columns={columns}
        data={disputes}
        keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}-${r.disputeId ?? r.fileId ?? r.vk ?? r.guardian ?? r.dealer ?? r.receiver ?? r.detail ?? ''}`}
        pageSize={30}
        emptyMessage="No dispute events found"
        hasMore={hasMore}
        onLoadMore={loadMore}
        loadingMore={loadingMore}
      />
    </div>
  );
}
