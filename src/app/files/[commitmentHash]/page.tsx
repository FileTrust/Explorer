'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, ExternalLink } from 'lucide-react';
import { Hash, Address } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SectionHeader } from '@/components/ui/PageHeader';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { DataTable, Column } from '@/components/ui/DataTable';
import { FileCyclePanel } from '@/components/file-cycle/FileCyclePanel';
import { useFileLifecycle } from '@/lib/hooks/useFileLifecycle';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';
import { cn } from '@/lib/utils';

export default function FileDetailPage() {
  const params = useParams();
  const commitmentHash = params.commitmentHash as `0x${string}`;
  const { data, isLoading, error, refetch } = useFileLifecycle(commitmentHash);

  if (isLoading) return <LoadingState message="Loading piece details…" />;
  if (error || !data) return <ErrorState message="Piece not found or node unavailable" retry={refetch} />;

  const { record, fileEvents: events } = data;
  const isActive = !events.deletionDeclared.length && !events.deletionConfirmed.length;

  type HistoryRow = { type: string; blockNumber: bigint; txHash: `0x${string}`; detail: string };

  const history: HistoryRow[] = [
    ...events.allRegistered.map((e: any) => ({ type: 'Registered', blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x', detail: `VK: ${String(e.args?.vkAddress ?? '').slice(0, 10)}…` })),
    ...events.partitionLinked.map((e: any) => ({ type: 'Partition Linked', blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x', detail: `Sector: ${String(e.args?.sectorRoot ?? '').slice(0, 12)}…` })),
    ...events.migrations.map((e: any) => ({ type: 'Migration', blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x', detail: `DL${e.args?.oldDeadlineIndex}→DL${e.args?.newDeadlineIndex}` })),
    ...events.deletionDeclared.map((e: any) => ({ type: 'Deletion Declared', blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x', detail: `Grace: ${e.args?.graceSeconds}s` })),
    ...events.deletionConfirmed.map((e: any) => ({ type: 'Deletion Confirmed', blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x', detail: 'Piece removed' })),
  ].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));

  const historyColumns: Column<HistoryRow>[] = [
    {
      key: 'type',
      header: 'Event',
      cell: row => {
        const v = row.type === 'Registered' ? 'green' : row.type.includes('Deletion') ? 'red' : row.type === 'Migration' ? 'purple' : 'blue';
        return <Badge label={row.type} variant={v as any} />;
      },
    },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx Hash', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <Link href="/files" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#94a3b8] transition-colors">
        <ArrowLeft size={14} /> Back to Pieces
      </Link>

      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-bg-elevated border border-bg-border">
          <FileText size={24} className="text-ft-blue" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-bold text-[#e2e8f0]">Piece Commitment</h1>
            {isActive ? <Badge label="Active" variant="green" dot /> : <Badge label="Inactive" variant="red" dot />}
            {events.migrations.length > 0 && <Badge label={`${events.migrations.length} Migration(s)`} variant="purple" />}
          </div>
          <Hash value={commitmentHash} full className="mt-1" />
        </div>
      </div>

      <FileCyclePanel data={data} commitmentHash={commitmentHash} />

      {/* Main info grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5 space-y-4">
          <SectionHeader title="Storage Record" />
          {record ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Vault Keeper</dt>
                <dd><Address value={record.vkAddress} /></dd>
              </div>
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Sector Root</dt>
                <dd><Hash value={record.sectorRoot} chars={12} /></dd>
              </div>
              <div>
                <dt className="text-xs text-[#64748b] mb-1">ZK Piece Commitment</dt>
                <dd><Hash value={record.zkPieceCommitment} chars={12} /></dd>
              </div>
              <div className="flex gap-6">
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Deadline Index</dt>
                  <dd className="font-mono text-[#e2e8f0]">{record.deadlineIndex}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Partition Index</dt>
                  <dd className="font-mono text-[#e2e8f0]">{record.partitionIndex}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Partition Linked</dt>
                  <dd>
                    <Badge label={record.partitionLinked ? 'Yes' : 'No'} variant={record.partitionLinked ? 'green' : 'amber'} />
                  </dd>
                </div>
              </div>
              <div className="flex gap-6">
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Service End</dt>
                  <dd className="text-xs text-[#94a3b8] font-mono">
                    {record.serviceEnd > 0n ? formatTimestamp(record.serviceEnd) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Registered At</dt>
                  <dd className="text-xs text-[#94a3b8] font-mono">
                    {record.registeredAt > 0n ? formatTimestamp(record.registeredAt) : '—'}
                  </dd>
                </div>
              </div>
            </dl>
          ) : (
            <p className="text-sm text-[#64748b]">Record not found</p>
          )}
        </div>

        <div className="bg-bg-surface border border-bg-border rounded-xl p-5 space-y-4">
          <SectionHeader title="Linked Activity" />
          <div className="space-y-3">
            {[
              { label: 'Sectors', value: data.linkedSectorKeys.length, href: `/storage/sectors?q=${commitmentHash}`, color: 'text-ft-cyan' },
              { label: 'Partitions', value: data.linkedPartitionKeys.length, href: `/storage/partitions?q=${record?.vkAddress ?? commitmentHash}`, color: 'text-ft-purple' },
              { label: 'DKG Sessions', value: data.linkedDkg.length, href: `/dkg?q=${commitmentHash}`, color: 'text-ft-amber' },
              { label: 'Data Batches', value: data.linkedBatches.length, href: `/access?q=${commitmentHash}`, color: 'text-ft-blue' },
              { label: 'Access Requests', value: data.linkedAccess.length, href: `/access?q=${commitmentHash}&view=requests`, color: 'text-ft-green' },
              { label: 'PRE Requests', value: data.linkedPre.length, href: `/pre?q=${commitmentHash}`, color: 'text-ft-purple' },
              { label: 'Economics Events', value: data.linkedEconomicEvents.length, href: `/economics/files?q=${commitmentHash}`, color: 'text-ft-green' },
            ].map(item => (
              <Link key={item.label} href={item.href} className="flex items-center justify-between py-1.5 border-b border-bg-border last:border-0 hover:bg-bg-elevated/50 rounded px-1 transition-colors">
                <span className="text-sm text-[#94a3b8]">{item.label}</span>
                <span className={cn('font-mono font-semibold', item.color)}>{item.value}</span>
              </Link>
            ))}
          </div>

          <div className="pt-2 mt-2 border-t border-bg-border">
            <Link
              href={`/vault-keepers/${record?.vkAddress}`}
              className="inline-flex items-center gap-1.5 text-xs text-ft-blue hover:text-blue-300 transition-colors"
            >
              View Vault Keeper profile <ExternalLink size={11} />
            </Link>
          </div>
        </div>
      </div>

      {/* Event History */}
      <div>
        <SectionHeader title="Event History" count={history.length} />
        <DataTable
          columns={historyColumns}
          data={history}
          keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}`}
          emptyMessage="No events found"
        />
      </div>
    </div>
  );
}
