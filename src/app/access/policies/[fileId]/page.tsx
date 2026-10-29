'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address, FullHash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePolicyDetail, PolicyEvent } from '@/lib/hooks/usePolicies';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex items-start gap-4 py-2.5 border-b border-bg-border last:border-0"><span className="w-36 shrink-0 text-xs text-[#64748b]">{label}</span><div className="flex-1 min-w-0">{children}</div></div>;
}

export default function PolicyDetailPage() {
  const params = useParams();
  const fileId = params.fileId as `0x${string}`;
  const { data, isLoading, error, refetch } = usePolicyDetail(fileId);

  const columns: Column<PolicyEvent>[] = [
    { key: 'type', header: 'Event', cell: row => <Badge label={row.type} variant={row.variant} /> },
    { key: 'actor', header: 'Actor', cell: row => row.actor ? <Address value={row.actor} /> : <span className="text-[#64748b]">—</span> },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  if (isLoading) return <LoadingState message="Loading policy…" />;
  if (error || !data?.policy) return <ErrorState message="Policy not found" retry={refetch} />;

  const { policy, events } = data;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link href="/access/policies" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#94a3b8]">
        <ArrowLeft size={14} /> Back to Policies
      </Link>

      <PageHeader
        title="File Policy"
        subtitle={<FullHash value={policy.fileId} />}
        icon={ShieldCheck}
        iconColor="text-ft-purple"
        actions={<Badge label={policy.active ? 'Active' : 'Inactive'} variant={policy.active ? 'green' : 'gray'} dot />}
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <SectionHeader title="Policy" />
          <div className="divide-y divide-bg-border">
            <InfoRow label="File ID"><FullHash value={policy.fileId} /></InfoRow>
            <InfoRow label="Data Owner"><Address value={policy.dataOwner} /></InfoRow>
            <InfoRow label="Mode"><Badge label={policy.mode === 'ZKDKG_V2' ? 'ZKDKG v2' : 'Legacy'} variant={policy.mode === 'ZKDKG_V2' ? 'purple' : 'gray'} /></InfoRow>
            <InfoRow label="Threshold"><span className="font-mono text-xs text-ft-amber">{policy.threshold} / {policy.selectedGuardians.length}</span></InfoRow>
            <InfoRow label="Allowed Requesters"><span className="font-mono text-xs text-[#94a3b8]">{policy.requesterCount}</span></InfoRow>
            <InfoRow label="Access Requests"><span className="font-mono text-xs text-ft-blue">{policy.accessRequestCount}</span></InfoRow>
            <InfoRow label="KeyGen">{policy.keyGenRequested ? <Badge label={policy.keyGenRequestedAt > 0n ? formatTimestamp(policy.keyGenRequestedAt) : 'Pending'} variant="amber" /> : <span className="text-xs text-[#64748b]">Not requested</span>}</InfoRow>
          </div>
        </div>

        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <SectionHeader title="Selected Guardians" count={policy.selectedGuardians.length} />
          <div className="space-y-2 max-h-80 overflow-auto">
            {policy.selectedGuardians.length === 0 ? (
              <p className="text-sm text-[#64748b]">No guardians selected</p>
            ) : policy.selectedGuardians.map((guardian, index) => (
              <Link key={guardian} href={`/guardians/${guardian}`} className="flex items-center justify-between bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 hover:border-ft-purple/40 transition-colors">
                <Address value={guardian} />
                <span className="font-mono text-xs text-[#64748b]">#{index + 1}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {[
          { href: `/file-cycle?fileId=${policy.fileId}`, label: 'Full file cycle' },
          { href: `/files/${policy.fileId}`, label: 'File record' },
          { href: `/dkg?q=${policy.fileId}`, label: 'DKG sessions' },
          { href: `/access?q=${policy.fileId}&view=requests`, label: 'Access requests' },
        ].map(item => (
          <Link key={item.href} href={item.href} className="bg-bg-surface border border-bg-border rounded-xl p-4 hover:bg-bg-elevated hover:border-ft-blue/40 transition-colors">
            <span className="text-sm font-semibold text-ft-blue">{item.label}</span>
          </Link>
        ))}
      </div>

      <div>
        <SectionHeader title="Policy History" count={events.length} />
        <DataTable columns={columns} data={events} keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}-${r.actor ?? ''}`} pageSize={30} emptyMessage="No policy events found" />
      </div>
    </div>
  );
}
