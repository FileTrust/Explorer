'use client';

import { useMemo, useState } from 'react';
import { Coins } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address, FullHash } from '@/components/ui/Hash';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { Badge } from '@/components/ui/Badge';
import { FilterSelect, SearchBar } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedRewards, usePagedStakingEvents, useRewardTotalsByType, guardianWorkLabel, RewardEvent, StakeEvent } from '@/lib/hooks/useRewards';
import { useEconomicsTotals } from '@/lib/hooks/useEconomicsTotals';
import { formatBlockNumber } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { initialQueryParam } from '@/lib/browserState';

const viewOptions = [
  { label: 'Rewards', value: 'rewards' },
  { label: 'Staking', value: 'staking' },
];

const REWARD_TYPE_LABELS: Record<string, string> = {
  guardian_reward: 'Guardian Reward',
  guardian_access_reward: 'Guardian Access Reward',
  guardian_join_reward: 'Guardian Join Reward',
  share_proof_reward: 'Share Proof Reward',
  vk_join_reward: 'VK Join Reward',
  vk_proof_reward: 'VK Proof Reward',
  vk_file_reward: 'VK File Reward',
  vk_capacity_reward: 'VK Space Reward',
  guardian_work_reward: 'Guardian DKG/PRE Reward',
  claimed: 'Claimed',
  policy_escrow: 'Policy Escrow',
  access_escrow: 'Access Escrow',
};

const REWARD_TYPE_VARIANTS: Record<string, string> = {
  guardian_reward: 'purple',
  guardian_access_reward: 'purple',
  guardian_join_reward: 'purple',
  share_proof_reward: 'purple',
  vk_join_reward: 'cyan',
  vk_proof_reward: 'cyan',
  vk_file_reward: 'cyan',
  vk_capacity_reward: 'cyan',
  guardian_work_reward: 'purple',
  claimed: 'green',
  policy_escrow: 'blue',
  access_escrow: 'amber',
};

const GUARDIAN_REWARD_TYPES = ['guardian_reward', 'guardian_access_reward', 'guardian_join_reward', 'share_proof_reward', 'guardian_work_reward'];

/** Every type that pays a participant, as opposed to a claim or an escrow deposit. */
const DISTRIBUTED_REWARD_TYPES = [
  ...GUARDIAN_REWARD_TYPES, 'vk_join_reward', 'vk_proof_reward', 'vk_file_reward', 'vk_capacity_reward',
];

/** A row's badge: a Guardian work reward names what it paid for (DKG, PRE, ready). */
function rewardRowLabel(row: RewardEvent): string {
  if (row.type === 'guardian_work_reward') return guardianWorkLabel(row.workKind);
  return REWARD_TYPE_LABELS[row.type] ?? row.type;
}

const formatGb = (bytes: bigint) => `${(Number(bytes) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 3 })} GB`;

const STAKE_TYPE_VARIANTS: Record<string, string> = {
  deposit: 'green',
  withdraw: 'blue',
  slash: 'red',
  lock: 'amber',
  unlock: 'gray',
};

export default function RewardsPage() {
  const {
    rows: rewards, isLoading: rewLoading, error: rewError, refetch: rewRefetch,
    hasMore: moreRewards, loadMore: loadRewards, loadingMore: loadingRewards,
  } = usePagedRewards();
  const {
    rows: staking, isLoading: stakeLoading,
    hasMore: moreStaking, loadMore: loadStaking, loadingMore: loadingStaking,
  } = usePagedStakingEvents();
  const [view, setView] = useState('rewards');
  const [typeFilter, setTypeFilter] = useState('all');
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));


  const rewardTypeOptions = [
    { label: 'All Types', value: 'all' },
    { label: 'Guardian Rewards', value: 'guardian_rewards' },
    ...Object.entries(REWARD_TYPE_LABELS)
      .filter(([k]) => k !== 'guardian_reward')
      .map(([k, v]) => ({ label: v, value: k })),
  ];

  const stakeTypeOptions = [
    { label: 'All Types', value: 'all' },
    { label: 'Deposits', value: 'deposit' },
    { label: 'Withdrawals', value: 'withdraw' },
    { label: 'Slashes', value: 'slash' },
    { label: 'Locks', value: 'lock' },
    { label: 'Unlocks', value: 'unlock' },
  ];

  const filteredRewards = useMemo(() => {
    let rows = rewards;
    if (typeFilter === 'guardian_rewards') {
      rows = rows.filter(r => GUARDIAN_REWARD_TYPES.includes(r.type));
    } else if (typeFilter !== 'all') {
      rows = rows.filter(r => r.type === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(r =>
        r.address.toLowerCase().includes(q) ||
        r.fileId?.toLowerCase().includes(q) ||
        r.requestId?.toString().includes(q) ||
        r.rewardType?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [rewards, search, typeFilter]);

  const filteredStaking = useMemo(() => {
    let rows = staking;
    if (typeFilter !== 'all') rows = rows.filter(s => s.type === typeFilter);
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(s => s.address.toLowerCase().includes(q));
    }
    return rows;
  }, [search, staking, typeFilter]);

  // Aggregate stats
  // The same four figures the economics screen shows, from the same events, so
  // they come from the same place: summed in the store, grouped by event name.
  // The reductions below still run and still answer from the rows in hand, which
  // is what an Explorer with no store falls back to.
  const storeTotals = useEconomicsTotals();

  const totalDistributed = useMemo(() => {
    return rewards.filter(r => DISTRIBUTED_REWARD_TYPES.includes(r.type))
      .reduce((s, r) => s + r.amount, 0n);
  }, [rewards]);

  const totalClaimed = useMemo(() => rewards.filter(r => r.type === 'claimed').reduce((s, r) => s + r.amount, 0n), [rewards]);
  const totalStaked = useMemo(() => staking.filter(s => s.type === 'deposit').reduce((s, e) => s + e.amount, 0n), [staking]);
  const totalSlashed = useMemo(() => staking.filter(s => s.type === 'slash').reduce((s, e) => s + e.amount, 0n), [staking]);

  // Chart data by type
  // Summed in the store when there is one. Adding up the rows in hand was only
  // ever right because the screen held every reward; paged, it would chart a
  // page and label it the network. The reduction stays as the no-store fallback.
  const storeByType = useRewardTotalsByType();
  const rewardChart = useMemo(() => {
    const map = new Map<string, number>();
    const add = (type: string, wei: bigint) => {
      const label = REWARD_TYPE_LABELS[type] ?? type;
      map.set(label, (map.get(label) ?? 0) + Number(wei) / 1e18);
    };
    if (storeByType) for (const [type, wei] of Object.entries(storeByType)) add(type, wei);
    else for (const r of rewards) add(r.type, r.amount);
    return [...map.entries()].map(([name, value]) => ({ name, value: parseFloat(value.toFixed(6)) }));
  }, [rewards, storeByType]);

  const rewardColumns: Column<RewardEvent>[] = [
    {
      key: 'type',
      header: 'Type',
      cell: row => (
        <div className="flex flex-col gap-0.5">
          <Badge label={rewardRowLabel(row)} variant={(REWARD_TYPE_VARIANTS[row.type] ?? 'gray') as any} />
          {row.type === 'vk_capacity_reward' && row.provenBytes !== undefined && (
            <span className="text-[10px] text-[#64748b]">for {formatGb(row.provenBytes)} proven</span>
          )}
        </div>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      cell: row => <Address value={row.address} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: row => <FtuAmount wei={row.amount} decimals={6} className="font-mono text-xs font-semibold text-ft-green" />,
    },
    {
      key: 'fileId',
      header: 'File ID',
      cell: row => row.fileId ? <FullHash value={row.fileId} /> : <span className="text-[#64748b]">—</span>,
    },
    {
      key: 'requestId',
      header: 'Request',
      cell: row => row.requestId !== undefined ? <span className="font-mono text-xs text-[#94a3b8]">#{row.requestId.toString()}</span> : <span className="text-[#64748b]">—</span>,
    },
    {
      key: 'serviceUnits',
      header: 'Service SU',
      cell: row => row.serviceUnits !== undefined ? <span className="font-mono text-xs text-[#94a3b8]">{row.serviceUnits.toLocaleString()}</span> : <span className="text-[#64748b]">—</span>,
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

  const stakeColumns: Column<StakeEvent>[] = [
    {
      key: 'type',
      header: 'Type',
      cell: row => <Badge label={row.type.charAt(0).toUpperCase() + row.type.slice(1)} variant={(STAKE_TYPE_VARIANTS[row.type] ?? 'gray') as any} />,
    },
    {
      key: 'address',
      header: 'Address',
      cell: row => <Address value={row.address} />,
    },
    {
      key: 'amount',
      header: 'Amount',
      cell: row => (
        <span className={`font-mono text-xs font-semibold ${row.type === 'slash' ? 'text-ft-red' : row.type === 'deposit' ? 'text-ft-green' : 'text-[#e2e8f0]'}`}>
          <FtuAmount wei={row.amount} decimals={6} />
        </span>
      ),
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

  if (rewLoading) return <LoadingState message="Loading reward and staking events…" />;
  if (rewError) return <ErrorState message="Failed to load reward data" retry={rewRefetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Rewards & Staking"
        subtitle="Guardian and vault keeper reward distribution and stake management"
        icon={Coins}
        iconColor="text-ft-green"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Distributed', value: <FtuAmount wei={storeTotals?.totalRewards ?? totalDistributed} />, color: 'text-ft-green' },
          { label: 'Total Claimed', value: <FtuAmount wei={storeTotals?.totalClaimed ?? totalClaimed} />, color: 'text-ft-cyan' },
          { label: 'Total Staked (deposits)', value: <FtuAmount wei={storeTotals?.totalStaked ?? totalStaked} />, color: 'text-ft-blue' },
          { label: 'Total Slashed', value: <FtuAmount wei={storeTotals?.totalSlashed ?? totalSlashed} />, color: (storeTotals?.totalSlashed ?? totalSlashed) > 0n ? 'text-ft-red' : 'text-[#64748b]' },
        ].map(s => (
          <div key={s.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{s.label}</p>
            <p className={`text-base font-bold mt-1 font-mono ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {rewardChart.length > 0 && (
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider mb-3">Reward Distribution (FTU)</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={rewardChart} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a40" />
              <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: '#0e1420', border: '1px solid #1e2a40', borderRadius: 8, fontSize: 12 }} itemStyle={{ color: '#10b981' }} />
              <Bar dataKey="value" fill="#10b981" radius={[4, 4, 0, 0]} name="FTU" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="flex gap-3 flex-wrap">
        <div className="flex rounded-lg overflow-hidden border border-bg-border">
          {viewOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setView(opt.value); setTypeFilter('all'); }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${view === opt.value ? 'bg-ft-green/10 text-ft-green' : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-bg-elevated'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <FilterSelect
          options={view === 'rewards' ? rewardTypeOptions : stakeTypeOptions}
          value={typeFilter}
          onChange={v => setTypeFilter(v)}
        />
        <SearchBar
          placeholder={view === 'rewards' ? 'Search by address, file ID, request…' : 'Search by address…'}
          value={search}
          onChange={setSearch}
          className="flex-1 max-w-md"
        />
      </div>

      {view === 'rewards' ? (
        <DataTable
          columns={rewardColumns}
          data={filteredRewards}
          keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}-${r.address}`}
          pageSize={30}
          emptyMessage="No reward events found"
          hasMore={moreRewards}
          onLoadMore={loadRewards}
          loadingMore={loadingRewards}
        />
      ) : (
        <DataTable
          columns={stakeColumns}
          data={filteredStaking}
          keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}`}
          pageSize={30}
          emptyMessage="No staking events found"
          loading={stakeLoading}
          hasMore={moreStaking}
          onLoadMore={loadStaking}
          loadingMore={loadingStaking}
        />
      )}
    </div>
  );
}
