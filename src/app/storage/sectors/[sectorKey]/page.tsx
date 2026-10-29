'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, HardDrive } from 'lucide-react';
import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { useSectorDetail, StorageEventRow } from '@/lib/hooks/useStorage';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start gap-4 py-2.5 border-b border-bg-border last:border-0"><span className="w-36 shrink-0 text-xs text-[#64748b]">{label}</span><div className="flex-1 min-w-0">{children}</div></div>;
}

export default function SectorDetailPage() {
  const params = useParams();
  const sectorKey = params.sectorKey as `0x${string}`;
  const { data, isLoading, error, refetch } = useSectorDetail(sectorKey);

  const columns: Column<StorageEventRow>[] = [
    { key: 'type', header: 'Event', cell: row => <Badge label={row.type} variant={row.type.includes('Missed') ? 'red' : row.type.includes('Submitted') ? 'green' : 'blue'} /> },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail || '—'}</span> },
    { key: 'deadline', header: 'Deadline', cell: row => <span className="text-xs text-[#64748b]">{row.deadline ? formatTimestamp(row.deadline) : '—'}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  if (isLoading) return <LoadingState message="Loading sector…" />;
  if (error || !data?.sector) return <ErrorState message="Sector not found" retry={refetch} />;

  const sector = data.sector;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/storage/sectors" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#94a3b8]"><ArrowLeft size={14} /> Back to Sectors</Link>
      <PageHeader title="Sector" subtitle={sector.sectorKey} icon={HardDrive} iconColor="text-ft-blue" actions={<Badge label={sector.health} variant={sector.health === 'healthy' ? 'green' : sector.health === 'warning' ? 'amber' : 'red'} dot />} />
      <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
        <div className="divide-y divide-bg-border">
          <InfoRow label="Sector Key"><Hash value={sector.sectorKey} full /></InfoRow>
          <InfoRow label="Sector ID"><Hash value={sector.sectorId} full /></InfoRow>
          <InfoRow label="Sector Root"><Hash value={sector.sectorRoot} full /></InfoRow>
          <InfoRow label="Vault Keeper"><Hash value={sector.vk} type="address" href={`/vault-keepers/${sector.vk}`} /></InfoRow>
          <InfoRow label="Sector Blocks"><span className="font-mono text-xs text-[#94a3b8]">{sector.sectorBlockCount.toLocaleString()}</span></InfoRow>
          <InfoRow label="Proofs"><span className="font-mono text-xs text-ft-green">{sector.submittedProofs} submitted <span className="text-ft-red ml-2">{sector.missedProofs} missed</span></span></InfoRow>
          <InfoRow label="Expiration"><span className="text-xs text-[#94a3b8]">{sector.expiration > 0n ? formatTimestamp(sector.expiration) : '—'}</span></InfoRow>
          <InfoRow label="Registered Tx"><Hash value={sector.registeredTx} chars={8} href={`/tx/${sector.registeredTx}`} /></InfoRow>
        </div>
      </div>
      <div>
        <SectionHeader title="Sector History" count={data.events.length} />
        <DataTable columns={columns} data={data.events} keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}`} emptyMessage="No sector events found" />
      </div>
    </div>
  );
}
