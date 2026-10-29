'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Layers3 } from 'lucide-react';
import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePartitionDetail, StorageEventRow, PartitionSectorRecord } from '@/lib/hooks/useStorage';
import { formatBlockNumber, formatBytes, formatTimestamp } from '@/lib/utils';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start gap-4 py-2.5 border-b border-bg-border last:border-0"><span className="w-36 shrink-0 text-xs text-[#64748b]">{label}</span><div className="flex-1 min-w-0">{children}</div></div>;
}

export default function PartitionDetailPage() {
  const params = useParams();
  const partitionKey = params.partitionKey as `0x${string}`;
  const { data, isLoading, error, refetch } = usePartitionDetail(partitionKey);

  const columns: Column<StorageEventRow>[] = [
    { key: 'type', header: 'Event', cell: row => <Badge label={row.type} variant={row.type.includes('Submitted') ? 'green' : row.type.includes('Challenge') ? 'amber' : 'purple'} /> },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail || '—'}</span> },
    { key: 'deadline', header: 'Deadline', cell: row => <span className="text-xs text-[#64748b]">{row.deadline ? formatTimestamp(row.deadline) : '—'}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  const sectorColumns: Column<PartitionSectorRecord>[] = [
    { key: 'slot', header: 'Slot', cell: row => <span className="font-mono text-xs text-[#64748b]">#{row.slot}</span> },
    { key: 'sectorId', header: 'Sector ID', cell: row => <Hash value={row.sectorId} chars={8} /> },
    { key: 'sectorRoot', header: 'Sector Root', cell: row => <Hash value={row.sectorRoot} chars={8} /> },
    { key: 'blocks', header: 'Blocks', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.sectorBlockCount.toLocaleString()}</span> },
    { key: 'bytes', header: 'Bytes', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{formatBytes(row.committedBytes)}</span> },
    { key: 'pieceCommitment', header: 'Piece Commitment', cell: row => <Hash value={row.pieceCommitment} chars={8} /> },
  ];

  if (isLoading) return <LoadingState message="Loading partition…" />;
  if (error || !data?.partition) return <ErrorState message="Partition not found" retry={refetch} />;

  const partition = data.partition;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/storage/partitions" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#94a3b8]"><ArrowLeft size={14} /> Back to Partitions</Link>
      <PageHeader title="Partition" subtitle={partition.partitionKey} icon={Layers3} iconColor="text-ft-purple" actions={<Badge label={partition.health} variant={partition.health === 'healthy' ? 'green' : partition.health === 'warning' ? 'amber' : 'red'} dot />} />
      <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
        <div className="divide-y divide-bg-border">
          <InfoRow label="Partition Key"><Hash value={partition.partitionKey} full /></InfoRow>
          <InfoRow label="Vault Keeper"><Hash value={partition.vk} type="address" href={`/vault-keepers/${partition.vk}`} /></InfoRow>
          <InfoRow label="Deadline Lane"><span className="font-mono text-xs text-ft-purple">DL{partition.deadlineIndex} / P{partition.partitionIndex}</span></InfoRow>
          <InfoRow label="Kind"><Badge label={partition.partitionKind === 2 ? 'Capacity' : 'Data'} variant={partition.partitionKind === 2 ? 'cyan' : 'purple'} /></InfoRow>
          <InfoRow label="Committed Bytes"><span className="font-mono text-xs text-[#94a3b8]">{formatBytes(partition.committedBytes)}</span></InfoRow>
          <InfoRow label="Sector Count"><span className="font-mono text-xs text-[#94a3b8]">{partition.sectorCount.toLocaleString()}</span></InfoRow>
          <InfoRow label="Proofs"><span className="font-mono text-xs text-ft-green">{partition.submittedProofs} submitted</span></InfoRow>
          <InfoRow label="Challenges"><span className="font-mono text-xs text-ft-amber">{partition.openedChallenges} opened</span></InfoRow>
          <InfoRow label="Expiration"><span className="text-xs text-[#94a3b8]">{partition.expiration > 0n ? formatTimestamp(partition.expiration) : '—'}</span></InfoRow>
          <InfoRow label="Registered Tx"><Hash value={partition.registeredTx} chars={8} href={`/tx/${partition.registeredTx}`} /></InfoRow>
        </div>
      </div>
      <div>
        <SectionHeader title="Partition Sectors" count={data.sectors.length} />
        <DataTable columns={sectorColumns} data={data.sectors} keyExtractor={r => `${partition.partitionKey}-${r.slot}`} emptyMessage="No sector details found for this partition" />
      </div>
      <div>
        <SectionHeader title="Partition History" count={data.events.length} />
        <DataTable columns={columns} data={data.events} keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}`} emptyMessage="No partition events found" />
      </div>
    </div>
  );
}
