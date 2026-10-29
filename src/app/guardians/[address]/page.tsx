'use client';

import type { ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shield } from 'lucide-react';
import { Hash, Address } from '@/components/ui/Hash';
import { Badge, ActiveBadge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { WalletBalanceRow } from '@/components/ui/WalletBalance';
import { AddressActivity } from '@/components/wallet/AddressActivity';
import { SectionHeader } from '@/components/ui/PageHeader';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { DataTable, Column } from '@/components/ui/DataTable';
import { useGuardianDetail } from '@/lib/hooks/useGuardians';
import { effectiveHeartbeat, formatTimestamp, reputationColor, reputationLabel, timeAgo, formatBlockNumber } from '@/lib/utils';

export default function GuardianDetailPage() {
  const params = useParams();
  const address = params.address as `0x${string}`;
  const { data, isLoading, error, refetch } = useGuardianDetail(address);

  if (isLoading) return <LoadingState message="Loading guardian profile…" />;
  if (error || !data) return <ErrorState message="Guardian not found" retry={refetch} />;

  const { profile, lastActivityAt, heartbeatEvents, stakeEvents, slashEvents, reputationEvents } = data;
  const heartbeat = effectiveHeartbeat(profile?.lastHeartbeat, lastActivityAt);

  type EventRow = { label: string; detail: ReactNode; blockNumber: bigint; txHash: `0x${string}` };

  const allEvents: EventRow[] = [
    ...stakeEvents.map((e: any) => ({ label: 'Stake Deposited', detail: <FtuAmount wei={e.args?.amount ?? 0n} decimals={4} />, blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x' })),
    ...slashEvents.map((e: any) => ({ label: 'Stake Slashed', detail: <FtuAmount wei={e.args?.amount ?? 0n} decimals={4} />, blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x' })),
    ...heartbeatEvents.slice(-5).map((e: any) => ({ label: 'Heartbeat', detail: formatTimestamp(e.args?.timestamp ?? 0n), blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x' })),
    ...reputationEvents.map((e: any) => ({ label: 'Reputation Updated', detail: `Score: ${e.args?.reputationScore ?? '?'}`, blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x' })),
  ].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));

  const eventColumns: Column<EventRow>[] = [
    {
      key: 'label',
      header: 'Event',
      cell: row => {
        const v = row.label.includes('Slash') ? 'red' : row.label.includes('Reputation') ? 'purple' : row.label.includes('Stake') ? 'blue' : 'gray';
        return <Badge label={row.label} variant={v as any} />;
      },
    },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/guardians" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#94a3b8]">
        <ArrowLeft size={14} /> Back to Guardians
      </Link>

      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-bg-elevated border border-bg-border">
          <Shield size={24} className="text-ft-purple" />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[#e2e8f0]">Guardian</h1>
            {profile && <ActiveBadge active={profile.active} />}
          </div>
          <Address value={address} full />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5 space-y-4">
          <SectionHeader title="Profile" />
          {profile ? (
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Stake (locked)</dt>
                <dd><FtuAmount wei={profile.stake} decimals={6} className="text-ft-blue font-mono font-semibold" /></dd>
              </div>
              <WalletBalanceRow address={address} />
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Reputation Score</dt>
                <dd className={`font-bold text-xl ${reputationColor(profile.reputationScore)}`}>
                  {profile.reputationScore}
                  <span className="text-sm font-normal ml-2 text-[#64748b]">({reputationLabel(profile.reputationScore)})</span>
                </dd>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Completed</dt>
                  <dd className="text-ft-green font-semibold">{profile.completedJobs}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Failed</dt>
                  <dd className="text-ft-red font-semibold">{profile.failedJobs}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Disputes</dt>
                  <dd className={profile.disputes > 0 ? 'text-ft-amber font-semibold' : 'text-[#64748b]'}>{profile.disputes}</dd>
                </div>
              </div>
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Registered At</dt>
                <dd className="text-xs font-mono text-[#94a3b8]">
                  {profile.registeredAt > 0n ? formatTimestamp(profile.registeredAt) : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Last Heartbeat</dt>
                <dd className="text-xs font-mono text-[#94a3b8]">
                  {heartbeat > 0n ? `${timeAgo(heartbeat)} (${formatTimestamp(heartbeat)})` : '—'}
                </dd>
              </div>
              {profile.metadataURI && (
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Metadata URI</dt>
                  <dd className="text-xs text-ft-blue break-all">{profile.metadataURI}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-[#64748b]">Profile not found</p>
          )}
        </div>

        <div className="bg-bg-surface border border-bg-border rounded-xl p-5 space-y-4">
          <SectionHeader title="Activity Summary" />
          <div className="space-y-3">
            {[
              { label: 'Heartbeats', value: heartbeatEvents.length, color: 'text-ft-green' },
              { label: 'Stake Deposits', value: stakeEvents.length, color: 'text-ft-blue' },
              { label: 'Slashes', value: slashEvents.length, color: 'text-ft-red' },
              { label: 'Reputation Updates', value: reputationEvents.length, color: 'text-ft-purple' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-bg-border last:border-0">
                <span className="text-sm text-[#94a3b8]">{item.label}</span>
                <span className={`font-mono font-semibold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>

          {/* Reputation bar */}
          {profile && (
            <div className="pt-2">
              <div className="flex justify-between mb-1.5 text-xs">
                <span className="text-[#64748b]">Reputation</span>
                <span className={reputationColor(profile.reputationScore)}>{profile.reputationScore} / 1000</span>
              </div>
              <div className="h-2 bg-bg-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${profile.reputationScore >= 700 ? 'bg-ft-green' : profile.reputationScore >= 400 ? 'bg-ft-amber' : 'bg-ft-red'}`}
                  style={{ width: `${Math.min(100, profile.reputationScore / 10)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      <div>
        {/* Everything the index holds about this guardian, paged. The short list
            below is what is left without an index: read from the chain, and
            only stake, slashes, the last heartbeats and reputation. */}
        <SectionHeader title="FileTrust Activity" />
        <AddressActivity
          address={address}
          fallback={
            <DataTable
              columns={eventColumns}
              data={allEvents}
              keyExtractor={r => `${r.label}-${r.blockNumber}-${r.txHash}`}
              emptyMessage="No events found for this guardian"
            />
          }
        />
      </div>
    </div>
  );
}
