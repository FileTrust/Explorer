'use client';

import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Address } from '@/components/ui/Hash';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { SearchBar } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedEconomicParticipants, useRollupCounts, ParticipantEconomics } from '@/lib/hooks/useEconomics';
import { initialQueryParam } from '@/lib/browserState';

export default function EconomicsParticipantsPage() {
  // Summed in the store during ingest: a row here is a total over history,
  // which is the one thing a page of events cannot produce.
  const { rows: participants, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedEconomicParticipants();
  const { data: counts } = useRollupCounts();
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));


  const rows = useMemo(() => {
    const all = participants;
    if (!search) return all;
    const q = search.toLowerCase();
    return all.filter(row => row.address.toLowerCase().includes(q));
  }, [participants, search]);

  const columns: Column<ParticipantEconomics>[] = [
    { key: 'address', header: 'Address', cell: row => <Address value={row.address} /> },
    { key: 'rewards', header: 'Rewards', cell: row => <FtuAmount wei={row.rewards} decimals={6} className="font-mono text-xs text-ft-green" /> },
    { key: 'claimed', header: 'Claimed', cell: row => <FtuAmount wei={row.claimed} decimals={6} className="font-mono text-xs text-ft-cyan" /> },
    { key: 'pools', header: 'Pool Deposits', cell: row => <FtuAmount wei={row.poolDeposits} decimals={6} className="font-mono text-xs text-ft-blue" /> },
    { key: 'stake', header: 'Stake Deposits', cell: row => <FtuAmount wei={row.stakeDeposits} decimals={6} className="font-mono text-xs text-ft-purple" /> },
    { key: 'slashed', header: 'Slashed', cell: row => <FtuAmount wei={row.slashed} decimals={6} className="font-mono text-xs text-ft-red" /> },
    { key: 'escrow', header: 'Escrow Paid / Received', cell: row => <span className="font-mono text-xs text-[#94a3b8]"><FtuAmount wei={row.escrowPaid} /> / <FtuAmount wei={row.escrowReceived} /></span> },
    { key: 'events', header: 'Events', cell: row => <span className="font-mono text-xs text-[#64748b]">{row.eventCount}</span> },
  ];

  if (isLoading) return <LoadingState message="Loading participant economics…" />;
  if (error) return <ErrorState message="Failed to load participant economics" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader title="Economic Participants" subtitle={`${(counts?.participants ?? participants.length).toLocaleString()} addresses with economic activity`} icon={Users} iconColor="text-ft-green" />
      <SearchBar placeholder="Search by address…" value={search} onChange={setSearch} className="max-w-lg" />
      <DataTable columns={columns} data={rows} keyExtractor={r => r.address} pageSize={30} emptyMessage="No participants match your search" hasMore={hasMore} onLoadMore={loadMore} loadingMore={loadingMore} />
    </div>
  );
}
