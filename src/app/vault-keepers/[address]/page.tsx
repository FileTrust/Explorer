'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Server } from 'lucide-react';
import { Address } from '@/components/ui/Hash';
import { Hash } from '@/components/ui/Hash';
import { Badge, ActiveBadge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { WalletBalanceRow } from '@/components/ui/WalletBalance';
import { AddressActivity } from '@/components/wallet/AddressActivity';
import { SectionHeader } from '@/components/ui/PageHeader';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { DataTable, Column } from '@/components/ui/DataTable';
import { useVaultKeeperDetail } from '@/lib/hooks/useVaultKeepers';
import { effectiveHeartbeat, formatSU, formatTimestamp, timeAgo, formatBlockNumber, reputationColor, reputationLabel } from '@/lib/utils';
import { useNowSeconds } from '@/lib/browserState';

export default function VaultKeeperDetailPage() {
  const params = useParams();
  const address = params.address as `0x${string}`;
  const { data, isLoading, error, refetch } = useVaultKeeperDetail(address);

  const now = useNowSeconds();

  if (isLoading) return <LoadingState message="Loading vault keeper profile…" />;
  if (error || !data) return <ErrorState message="Vault keeper not found" retry={refetch} />;

  const { profile, reputation, lastActivityAt, registeredEvents, heartbeatEvents, suspendedEvents, statusEvents } = data;
  const heartbeat = effectiveHeartbeat(profile?.lastHeartbeat, lastActivityAt);
  const isSuspended = profile && profile.suspendedUntil > now;

  type EventRow = { label: string; detail: string; blockNumber: bigint; txHash: `0x${string}` };
  const allEvents: EventRow[] = [
    ...registeredEvents.map((e: any) => ({ label: 'Registered', detail: `Fee: ${formatSU(e.args?.storageFee ?? 0n)} / GB-day`, blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x' })),
    ...statusEvents.map((e: any) => ({ label: e.args?.active ? 'Activated' : 'Deactivated', detail: '', blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x' })),
    ...suspendedEvents.map((e: any) => ({ label: 'Suspended', detail: `Until: ${formatTimestamp(e.args?.suspendedUntil ?? 0n)}`, blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x' })),
    ...heartbeatEvents.slice(-10).map((e: any) => ({ label: 'Heartbeat', detail: formatTimestamp(e.args?.timestamp ?? 0n), blockNumber: e.blockNumber ?? 0n, txHash: e.transactionHash ?? '0x' })),
  ].sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));

  const eventColumns: Column<EventRow>[] = [
    {
      key: 'label',
      header: 'Event',
      cell: row => {
        const v = row.label === 'Suspended' ? 'amber' : row.label === 'Registered' ? 'cyan' : row.label.includes('Deac') ? 'red' : 'gray';
        return <Badge label={row.label} variant={v as any} />;
      },
    },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <Link href="/vault-keepers" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#94a3b8]">
        <ArrowLeft size={14} /> Back to Vault Keepers
      </Link>

      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-bg-elevated border border-bg-border">
          <Server size={24} className="text-ft-cyan" />
        </div>
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold text-[#e2e8f0]">Vault Keeper</h1>
            {profile && <ActiveBadge active={profile.active} />}
            {isSuspended && <Badge label="Suspended" variant="amber" dot />}
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
                <dt className="text-xs text-[#64748b] mb-1">Storage Fee</dt>
                <dd className="text-ft-blue font-mono font-semibold">{formatSU(profile.storageFee)} / GB-day</dd>
              </div>
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Stake (locked)</dt>
                <dd><FtuAmount wei={profile.stake} decimals={4} className="font-mono text-[#e2e8f0] font-semibold" /></dd>
              </div>
              <WalletBalanceRow address={address} />
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Reputation</dt>
                <dd className={`font-bold text-xl ${reputationColor(reputation)}`}>
                  {reputation}
                  <span className="text-sm font-normal ml-2 text-[#64748b]">({reputationLabel(reputation)})</span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#64748b] mb-1">Max Service Days</dt>
                <dd className="font-mono text-[#e2e8f0]">{profile.maxServiceDays === 0 ? '∞ Unlimited' : `${profile.maxServiceDays} days`}</dd>
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
              {isSuspended && (
                <div>
                  <dt className="text-xs text-[#64748b] mb-1">Suspended Until</dt>
                  <dd className="text-xs font-mono text-ft-amber">{formatTimestamp(profile.suspendedUntil)}</dd>
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
              { label: 'Status Changes', value: statusEvents.length, color: 'text-ft-blue' },
              { label: 'Suspensions', value: suspendedEvents.length, color: suspendedEvents.length > 0 ? 'text-ft-amber' : 'text-[#64748b]' },
              { label: 'Total Events', value: allEvents.length, color: 'text-[#94a3b8]' },
            ].map(item => (
              <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-bg-border last:border-0">
                <span className="text-sm text-[#94a3b8]">{item.label}</span>
                <span className={`font-mono font-semibold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div>
        {/* Everything the index holds about this vault keeper, paged. The short list
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
              emptyMessage="No events found for this vault keeper"
            />
          }
        />
      </div>
    </div>
  );
}
