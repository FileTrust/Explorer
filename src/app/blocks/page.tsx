'use client';

import { useRouter } from 'next/navigation';
import { Boxes } from 'lucide-react';
import { formatUnits } from 'viem';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { ADDRESS_TO_NAME } from '@/lib/addresses';
import { useBlockList, EvmBlockSummary } from '@/lib/hooks/useEvmExplorer';
import { formatBlockNumber, formatTimestamp, timeAgo } from '@/lib/utils';

function gasPercent(row: EvmBlockSummary) {
  return row.gasLimit > 0n ? Number((row.gasUsed * 10000n) / row.gasLimit) / 100 : 0;
}

/// Gas used as a number, its share of the limit, and a thin bar of that share.
function GasCell({ row }: { row: EvmBlockSummary }) {
  const percent = gasPercent(row);
  return (
    <span className="inline-flex flex-col gap-1" title={`${row.gasUsed.toLocaleString()} of ${row.gasLimit.toLocaleString()} gas`}>
      <span className="font-mono text-xs text-[#94a3b8]">
        {row.gasUsed.toLocaleString()}
        <span className="text-[#64748b] ml-1">({percent}%)</span>
      </span>
      <span className="block h-1 w-24 rounded-full bg-bg-elevated">
        <span className="block h-1 rounded-full bg-ft-blue" style={{ width: `${Math.min(100, percent)}%` }} />
      </span>
    </span>
  );
}

export default function BlocksPage() {
  const router = useRouter();
  const { data, isLoading, error, refetch, hasNextPage, fetchNextPage, isFetchingNextPage } = useBlockList();
  const blocks = data?.pages.flatMap(page => page.rows) ?? [];
  const fromIndex = data?.pages[0]?.source === 'index';
  const withFees = blocks.some(row => row.feesWei !== undefined);

  const columns: Column<EvmBlockSummary>[] = [
    {
      key: 'number',
      header: 'Block',
      cell: row => <Hash value={formatBlockNumber(row.number)} href={`/blocks/${row.number}`} />,
    },
    {
      key: 'age',
      header: 'Age',
      cell: row => <span className="text-xs text-[#94a3b8]" title={formatTimestamp(row.timestamp)}>{timeAgo(row.timestamp)}</span>,
    },
    {
      key: 'txs',
      header: 'Txns',
      cell: row => <span className="font-mono text-xs text-[#e2e8f0]">{row.txCount.toLocaleString()}</span>,
    },
    {
      key: 'validator',
      header: 'Validator',
      cell: row => {
        const name = ADDRESS_TO_NAME[row.miner.toLowerCase()];
        return (
          <span className="inline-flex flex-col">
            <Hash value={row.miner} type="address" href={`/address/${row.miner}`} />
            {name && <span className="text-[10px] text-ft-cyan">{name}</span>}
          </span>
        );
      },
    },
    { key: 'gas', header: 'Gas Used', cell: row => <GasCell row={row} /> },
    {
      key: 'limit',
      header: 'Gas Limit',
      cell: row => <span className="font-mono text-xs text-[#64748b]">{row.gasLimit.toLocaleString()}</span>,
    },
    {
      key: 'base',
      header: 'Base Fee',
      unit: 'Gwei',
      cell: row => row.baseFeePerGas === undefined
        ? <span className="text-xs text-[#475569]">—</span>
        : <span className="font-mono text-xs text-[#94a3b8]">{formatUnits(row.baseFeePerGas, 9)}</span>,
    },
    ...(withFees ? [{
      key: 'fees',
      header: 'Fees',
      unit: 'FTU',
      cell: (row: EvmBlockSummary) => row.feesWei === undefined || row.feesWei === null
        ? <span className="text-xs text-[#475569]" title={row.feesWei === null ? 'A receipt is missing from the index' : 'Not in the explorer database'}>—</span>
        : <FtuAmount wei={row.feesWei} decimals={8} showUnit={false} className="font-mono text-xs text-[#94a3b8]" />,
    }] : []),
  ];

  if (isLoading) return <LoadingState message="Loading recent blocks…" />;
  if (error) return <ErrorState message="Failed to load blocks. Is the RPC node running?" retry={() => refetch()} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Blocks"
        subtitle={fromIndex
          ? 'Newest first, from the explorer index; older blocks load as you page'
          : 'Newest first, read from the chain'}
        icon={Boxes}
        iconColor="text-ft-blue"
      />

      <DataTable
        columns={columns}
        data={blocks}
        keyExtractor={r => r.number.toString()}
        pageSize={25}
        emptyMessage="No blocks found"
        onRowClick={row => router.push(`/blocks/${row.number}`)}
        hasMore={Boolean(hasNextPage)}
        onLoadMore={() => fetchNextPage()}
        loadingMore={isFetchingNextPage}
      />
    </div>
  );
}
