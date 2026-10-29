'use client';

import { useMemo, useState } from 'react';
import { WalletCards } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address, FullHash } from '@/components/ui/Hash';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedEconomicEvents, ESCROW_EVENTS, EconomicEvent } from '@/lib/hooks/useEconomics';
import { useEventCountsByName } from '@/lib/hooks/useEventCounts';
import { formatBlockNumber } from '@/lib/utils';
import { initialQueryParam } from '@/lib/browserState';

const typeOptions = [
  { label: 'All Escrows', value: 'all' },
  { label: 'Policy', value: 'policy_escrow' },
  { label: 'Access', value: 'access_escrow' },
  { label: 'VK Storage', value: 'vk_escrow' },
];

export default function EconomicsEscrowsPage() {
  // Only escrow events are asked for, and only a page at a time.
  const { rows: events, isLoading, error, refetch, hasMore, loadMore, loadingMore } = usePagedEconomicEvents(200, ESCROW_EVENTS);
  // Seeded from ?q= when a link carries one, then the user's.
  const [search, setSearch] = useState(() => initialQueryParam('q'));
  const [type, setType] = useState('all');


  // How many escrow events exist, counted in the store. `rows.length` is how
  // many are loaded and matching, which stopped being the same number the moment
  // the table paged.
  const { data: rewardCounts } = useEventCountsByName('RewardManager');
  const { data: vkEscrowCounts } = useEventCountsByName('VKEscrow');
  const escrowTotal = (rewardCounts || vkEscrowCounts)
    ? ESCROW_EVENTS.reduce((sum, name) =>
        sum + (rewardCounts?.[name] ?? 0) + (vkEscrowCounts?.[name] ?? 0), 0)
    : null;

  const rows = useMemo(() => {
    let all = events.filter(row => row.kind.includes('escrow'));
    if (type !== 'all') all = all.filter(row => row.kind === type);
    if (search) {
      const q = search.toLowerCase();
      all = all.filter(row =>
        row.actor?.toLowerCase().includes(q) ||
        row.fileId?.toLowerCase().includes(q) ||
        row.commitment?.toLowerCase().includes(q) ||
        row.requestId?.toString().includes(q)
      );
    }
    return all;
  }, [events, search, type]);

  const columns: Column<EconomicEvent>[] = [
    { key: 'type', header: 'Escrow Flow', cell: row => <Badge label={row.type} variant={row.type.includes('Refund') || row.type.includes('Reclaimed') ? 'red' : row.type.includes('Claim') ? 'green' : 'amber'} /> },
    { key: 'actor', header: 'Actor', cell: row => row.actor ? <Address value={row.actor} /> : <span className="text-[#64748b]">—</span> },
    { key: 'amount', header: 'Amount', cell: row => row.amount > 0n ? <FtuAmount wei={row.amount} decimals={6} className="font-mono text-xs text-ft-green" /> : <span className="text-[#64748b]">—</span> },
    { key: 'scope', header: 'File / Commitment', cell: row => row.fileId ? <FullHash value={row.fileId} href={`/files/${row.fileId}`} /> : row.commitment ? <Hash value={row.commitment} chars={8} /> : <span className="text-[#64748b]">—</span> },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  if (isLoading) return <LoadingState message="Loading escrows…" />;
  if (error) return <ErrorState message="Failed to load escrows" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader title="Escrows" subtitle={escrowTotal === null
          ? `${rows.length} matching escrow events`
          : rows.length === escrowTotal
            ? `${escrowTotal.toLocaleString()} escrow events`
            : `showing ${rows.length.toLocaleString()} of ${escrowTotal.toLocaleString()} escrow events`} icon={WalletCards} iconColor="text-ft-amber" />
      <div className="flex gap-3">
        <SearchBar placeholder="Search by actor, file, commitment, request…" value={search} onChange={setSearch} className="flex-1 max-w-lg" />
        <FilterSelect options={typeOptions} value={type} onChange={setType} />
      </div>
      <DataTable columns={columns} data={rows} keyExtractor={r => `${r.kind}-${r.type}-${r.blockNumber}-${r.txHash}`} pageSize={30} emptyMessage="No escrow events match your filters" hasMore={hasMore} onLoadMore={loadMore} loadingMore={loadingMore} />
    </div>
  );
}
