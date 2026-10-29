'use client';

import Link from 'next/link';
import { Banknote, Coins, FileText, Users, WalletCards } from 'lucide-react';
import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address, FullHash } from '@/components/ui/Hash';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { useEconomics, usePagedEconomicEvents, EconomicEvent } from '@/lib/hooks/useEconomics';
import { useEconomicsTotalsState } from '@/lib/hooks/useEconomicsTotals';
import { formatBlockNumber } from '@/lib/utils';

function kindVariant(kind: EconomicEvent['kind']) {
  if (kind === 'reward' || kind === 'claim') return 'green';
  if (kind === 'pool') return 'blue';
  if (kind.includes('escrow')) return 'amber';
  if (kind === 'stake') return 'purple';
  return 'gray';
}

export default function EconomicsPage() {
  // The four totals are summed in the store, and the table is the newest events
  // a page at a time. This screen used to download thirty-six whole event lists
  // to add them up in the browser; that is now only what happens without a store.
  const totals = useEconomicsTotalsState();
  const fallback = useEconomics({ enabled: totals.unavailable });
  const events = usePagedEconomicEvents(200);

  const columns: Column<EconomicEvent>[] = [
    { key: 'type', header: 'Flow', cell: row => <Badge label={row.type} variant={kindVariant(row.kind) as any} /> },
    { key: 'actor', header: 'Actor', cell: row => row.actor ? <Address value={row.actor} /> : <span className="text-[#64748b]">—</span> },
    { key: 'amount', header: 'Amount', cell: row => row.amount > 0n ? <FtuAmount wei={row.amount} decimals={6} className="font-mono text-xs text-ft-green" /> : <span className="text-[#64748b]">—</span> },
    { key: 'scope', header: 'Scope', cell: row => row.fileId ? <FullHash value={row.fileId} href={`/files/${row.fileId}`} /> : row.commitment ? <Hash value={row.commitment} chars={8} /> : <span className="text-[#64748b]">—</span> },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  const stats = totals.totals ?? fallback.data?.stats;
  if (totals.isLoading || (totals.unavailable && fallback.isLoading)) {
    return <LoadingState message="Loading protocol economics…" />;
  }
  if (!stats) return <ErrorState message="Failed to load economics" retry={() => fallback.refetch()} />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader title="Economics" subtitle="Protocol rewards, escrows, pools, staking, and claims" icon={Banknote} iconColor="text-ft-green" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Rewards Credited" value={<FtuAmount wei={stats.totalRewards} />} icon={Coins} iconColor="text-ft-green" subtitle={<><FtuAmount wei={stats.totalClaimed} decimals={4} /> claimed</>} />
        <StatCard title="Reward Pools" value={<FtuAmount wei={stats.totalPoolDeposits} />} icon={WalletCards} iconColor="text-ft-blue" subtitle="Pool deposits" />
        <StatCard title="Policy + Access Escrow" value={<FtuAmount wei={stats.totalPolicyEscrow + stats.totalAccessEscrow} />} icon={FileText} iconColor="text-ft-amber" subtitle="File/request escrows" />
        <StatCard title="VK Escrow" value={<FtuAmount wei={stats.totalVKEscrowDeposited} />} icon={Banknote} iconColor="text-ft-purple" subtitle={<><FtuAmount wei={stats.totalVKEscrowClaimed} decimals={4} /> claimed</>} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { href: '/economics/participants', label: 'Participants', detail: 'Rewards, claims, stake, escrow paid/received', icon: Users },
          { href: '/economics/files', label: 'Files', detail: 'Per-file policy/access escrow and reward totals', icon: FileText },
          { href: '/economics/escrows', label: 'Escrows', detail: 'Policy, access, and VK storage escrow flows', icon: WalletCards },
        ].map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.href} href={item.href} className="bg-bg-surface border border-bg-border rounded-xl p-4 hover:border-ft-green/40 hover:bg-bg-elevated transition-colors">
              <div className="flex items-center gap-2">
                <Icon size={16} className="text-ft-green" />
                <p className="text-sm font-semibold text-[#e2e8f0]">{item.label}</p>
              </div>
              <p className="text-xs text-[#64748b] mt-1">{item.detail}</p>
            </Link>
          );
        })}
      </div>

      <div>
        <SectionHeader title="Recent Economic Events" count={events.rows.length} />
        {events.error ? (
          <ErrorState message="Failed to load economic events" retry={() => events.refetch()} />
        ) : (
          <DataTable
            columns={columns}
            data={events.rows}
            keyExtractor={r => `${r.kind}-${r.type}-${r.blockNumber}-${r.txHash}-${r.actor ?? ''}`}
            loading={events.isLoading}
            pageSize={30}
            emptyMessage="No economic events found"
            hasMore={events.hasMore}
            onLoadMore={events.loadMore}
            loadingMore={events.loadingMore}
          />
        )}
      </div>
    </div>
  );
}
