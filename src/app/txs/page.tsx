'use client';

import { ListTree } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { usePagedTransactions, EvmTxSummary } from '@/lib/hooks/useEvmExplorer';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';

export default function TransactionsPage() {
  // A page at a time rather than 1,250 rows to show 30. The table pages through
  // what has arrived and asks for more only when someone wants it.
  const {
    data, isLoading, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage,
  } = usePagedTransactions();
  const txs: EvmTxSummary[] = data?.pages.flatMap(p => p.rows) ?? [];

  const columns: Column<EvmTxSummary>[] = [
    { key: 'hash', header: 'Tx Hash', cell: row => <Hash value={row.hash} chars={8} href={`/tx/${row.hash}`} /> },
    { key: 'block', header: 'Block', cell: row => <Hash value={formatBlockNumber(row.blockNumber)} href={`/blocks/${row.blockNumber}`} className="font-mono text-xs" /> },
    { key: 'from', header: 'From', cell: row => <Hash value={row.from} type="address" href={`/address/${row.from}`} /> },
    { key: 'to', header: 'To', cell: row => row.to ? <Hash value={row.to} type="address" href={`/address/${row.to}`} /> : <span className="text-xs text-[#64748b]">Contract creation</span> },
    { key: 'value', header: 'Value', cell: row => <FtuAmount wei={row.value} decimals={6} className="font-mono text-xs text-ft-green" /> },
    { key: 'gas', header: 'Gas Limit', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.gas.toLocaleString()}</span> },
    { key: 'time', header: 'Time', cell: row => <span className="text-xs text-[#64748b]">{row.blockTimestamp ? formatTimestamp(row.blockTimestamp) : '—'}</span> },
  ];

  if (isLoading) return <LoadingState message="Loading recent transactions…" />;
  if (error) return <ErrorState message="Failed to load transactions" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Transactions"
        subtitle={`${txs.length}${hasNextPage ? '+' : ''} transactions from recent blocks`}
        icon={ListTree}
        iconColor="text-ft-cyan"
      />

      <DataTable
        columns={columns}
        data={txs}
        keyExtractor={r => r.hash}
        pageSize={30}
        emptyMessage="No transactions found in recent blocks"
        onLoadMore={() => fetchNextPage()}
        hasMore={hasNextPage}
        loadingMore={isFetchingNextPage}
      />
    </div>
  );
}
