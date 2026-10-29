'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Medal, Server, Shield } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Address } from '@/components/ui/Hash';
import { Badge, ActiveBadge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { SearchBar } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import type { GuardianProfile } from '@/lib/hooks/useGuardians';
import type { VKProfile } from '@/lib/hooks/useVaultKeepers';
import { useGuardianRanking, useVaultKeeperRanking, type Ranked } from '@/lib/hooks/useRankings';
import { effectiveHeartbeat, formatSU, reputationColor, timeAgo } from '@/lib/utils';
import { useNowSeconds } from '@/lib/browserState';

type RankTab = 'guardians' | 'vault-keepers';

/// The search as typed, settled for a moment before it is sent: each one is a
/// query, and there is no need for one per keystroke.
function useSettled(value: string, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

function RankBadge({ rank }: { rank: number }) {
  const variant = rank === 1 ? 'amber' : rank <= 3 ? 'purple' : rank <= 10 ? 'cyan' : 'gray';
  return <Badge label={`#${rank}`} variant={variant} />;
}

export default function RankPage() {
  const router = useRouter();
  const [tab, setTab] = useState<RankTab>('guardians');
  const [search, setSearch] = useState('');
  const query = useSettled(search.trim());
  const now = useNowSeconds();
  // Scored and sorted in the store, a page at a time. The rank is the place on
  // the whole board, so a search shows where a participant really stands.
  const guardians = useGuardianRanking(query);
  const vks = useVaultKeeperRanking(query, now);

  const guardianColumns: Column<Ranked<GuardianProfile>>[] = [
    { key: 'rank', header: 'Rank', cell: row => <RankBadge rank={row.rank} /> },
    { key: 'address', header: 'Guardian', cell: row => <Address value={row.address} /> },
    { key: 'status', header: 'Status', cell: row => <ActiveBadge active={row.active} /> },
    { key: 'score', header: 'Score', cell: row => <span className="font-mono text-xs font-semibold text-ft-blue">{row.rankScore}</span> },
    { key: 'reputation', header: 'Reputation', cell: row => <span className={`text-xs font-semibold ${reputationColor(row.reputationScore)}`}>{row.reputationScore}</span> },
    { key: 'stake', header: 'Stake', cell: row => <FtuAmount wei={row.stake} decimals={4} className="font-mono text-xs text-[#e2e8f0]" /> },
    {
      key: 'jobs',
      header: 'Jobs',
      cell: row => (
        <span className="font-mono text-xs">
          <span className="text-ft-green">{row.completedJobs}</span>
          <span className="text-[#64748b]"> / </span>
          <span className={row.failedJobs > 0 ? 'text-ft-red' : 'text-[#64748b]'}>{row.failedJobs}</span>
        </span>
      ),
    },
    { key: 'disputes', header: 'Disputes', cell: row => <span className={`font-mono text-xs ${row.disputes > 0 ? 'text-ft-amber' : 'text-[#64748b]'}`}>{row.disputes}</span> },
    { key: 'heartbeat', header: 'Heartbeat', cell: row => { const hb = effectiveHeartbeat(row.lastHeartbeat, row.lastActivityAt); return <span className="text-xs text-[#64748b]">{hb > 0n ? timeAgo(hb) : '-'}</span>; } },
  ];

  const vkColumns: Column<Ranked<VKProfile>>[] = [
    { key: 'rank', header: 'Rank', cell: row => <RankBadge rank={row.rank} /> },
    { key: 'address', header: 'Vault Keeper', cell: row => <Address value={row.address} /> },
    {
      key: 'status',
      header: 'Status',
      cell: row => row.suspendedUntil > now ? <Badge label="Suspended" variant="amber" dot /> : <ActiveBadge active={row.active} />,
    },
    { key: 'score', header: 'Score', cell: row => <span className="font-mono text-xs font-semibold text-ft-blue">{row.rankScore}</span> },
    { key: 'reputation', header: 'Reputation', cell: row => <span className={`text-xs font-semibold ${reputationColor(row.reputation)}`}>{row.reputation}</span> },
    { key: 'stake', header: 'Stake', cell: row => <FtuAmount wei={row.stake} decimals={4} className="font-mono text-xs text-[#e2e8f0]" /> },
    { key: 'fee', header: 'Storage Fee', cell: row => <span className="font-mono text-xs text-ft-cyan">{formatSU(row.storageFee)} / GB-day</span> },
    { key: 'service', header: 'Max Days', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.maxServiceDays === 0 ? '∞' : row.maxServiceDays}</span> },
    { key: 'heartbeat', header: 'Heartbeat', cell: row => { const hb = effectiveHeartbeat(row.lastHeartbeat, row.lastActivityAt); return <span className="text-xs text-[#64748b]">{hb > 0n ? timeAgo(hb) : '-'}</span>; } },
  ];

  const current = tab === 'guardians' ? guardians : vks;
  if (current.isLoading && current.rows.length === 0 && !search) return <LoadingState message="Loading participant rankings…" />;
  if (guardians.error) return <ErrorState message="Failed to load Guardian rankings" retry={guardians.refetch} />;
  if (vks.error) return <ErrorState message="Failed to load Vault Keeper rankings" retry={vks.refetch} />;

  const topGuardian = guardians.top;
  const topVK = vks.top;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Rankings"
        subtitle="Guardian and Vault Keeper leaderboard by reputation, stake, activity, and penalties"
        icon={Medal}
        iconColor="text-ft-amber"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Guardians', value: guardians.total?.toLocaleString() ?? '-', color: 'text-ft-purple' },
          { label: 'Vault Keepers', value: vks.total?.toLocaleString() ?? '-', color: 'text-ft-cyan' },
          { label: 'Top Guardian', value: topGuardian ? `#${topGuardian.rankScore}` : '-', color: 'text-ft-amber' },
          { label: 'Top VK', value: topVK ? `#${topVK.rankScore}` : '-', color: 'text-ft-amber' },
        ].map(stat => (
          <div key={stat.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{stat.label}</p>
            <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="inline-flex bg-bg-surface border border-bg-border rounded-lg p-1 w-fit">
          <button
            onClick={() => setTab('guardians')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === 'guardians' ? 'bg-ft-purple/15 text-ft-purple' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
          >
            <Shield size={15} />
            Guardians
          </button>
          <button
            onClick={() => setTab('vault-keepers')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors ${tab === 'vault-keepers' ? 'bg-ft-cyan/15 text-ft-cyan' : 'text-[#64748b] hover:text-[#94a3b8]'}`}
          >
            <Server size={15} />
            Vault Keepers
          </button>
        </div>
        <SearchBar
          placeholder="Search by address..."
          value={search}
          onChange={setSearch}
          className="w-full md:max-w-md"
        />
      </div>

      {tab === 'guardians' ? (
        <DataTable
          columns={guardianColumns}
          data={guardians.rows}
          keyExtractor={r => r.address}
          loading={guardians.isLoading}
          pageSize={30}
          emptyMessage="No Guardian rankings found"
          onRowClick={row => router.push(`/guardians/${row.address}`)}
          hasMore={guardians.hasMore}
          onLoadMore={guardians.loadMore}
          loadingMore={guardians.loadingMore}
          totalHint={query ? undefined : guardians.total}
        />
      ) : (
        <DataTable
          columns={vkColumns}
          data={vks.rows}
          keyExtractor={r => r.address}
          loading={vks.isLoading}
          pageSize={30}
          emptyMessage="No Vault Keeper rankings found"
          onRowClick={row => router.push(`/vault-keepers/${row.address}`)}
          hasMore={vks.hasMore}
          onLoadMore={vks.loadMore}
          loadingMore={vks.loadingMore}
          totalHint={query ? undefined : vks.total}
        />
      )}
    </div>
  );
}
