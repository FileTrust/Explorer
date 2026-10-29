'use client';

import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { formatBlockNumber, formatTimestamp } from '@/lib/utils';
import { Party } from '@/components/ui/Party';
import type { InternalTransfer } from '@/lib/hooks/useWallet';

/**
 * FTU that contracts moved inside transactions.
 *
 * With `address`, each row is marked In or Out relative to it, as on a wallet
 * page. Without, as on a transaction page, the rows are the payments of that one
 * transaction and the parent transaction and block are left out.
 */
export function InternalTransfersTable({
  rows,
  address,
  withTransaction = false,
  hasMore,
  onLoadMore,
  loadingMore,
  totalHint,
  emptyMessage = 'No FTU was paid by a contract here',
}: {
  rows: InternalTransfer[];
  address?: string;
  /** Show each payment's transaction, as a block page does for its many. */
  withTransaction?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  totalHint?: number;
  emptyMessage?: string;
}) {
  const lower = address?.toLowerCase();
  const columns: Column<InternalTransfer>[] = [
    ...(address ? [
      { key: 'tx', header: 'Parent Tx', cell: (row: InternalTransfer) => <Hash value={row.transactionHash} chars={8} href={`/tx/${row.transactionHash}`} /> },
      { key: 'block', header: 'Block', cell: (row: InternalTransfer) => <Hash value={formatBlockNumber(row.blockNumber)} href={`/blocks/${row.blockNumber}`} /> },
      {
        key: 'time', header: 'Time',
        cell: (row: InternalTransfer) => <span className="text-xs text-[#64748b]">{row.blockTimestamp ? formatTimestamp(row.blockTimestamp) : '—'}</span>,
      },
    ] : withTransaction ? [
      { key: 'tx', header: 'Parent Tx', cell: (row: InternalTransfer) => <Hash value={row.transactionHash} chars={8} href={`/tx/${row.transactionHash}`} /> },
    ] : []),
    { key: 'from', header: 'From', cell: row => <Party address={row.from} /> },
    ...(lower ? [{
      key: 'direction', header: '',
      cell: (row: InternalTransfer) => row.to.toLowerCase() === lower
        ? <Badge label="In" variant="green" />
        : <Badge label="Out" variant="amber" />,
    }] : []),
    { key: 'to', header: 'To', cell: row => <Party address={row.to} /> },
    { key: 'value', header: 'Value', cell: row => <FtuAmount wei={row.value} decimals={6} className="font-mono text-xs text-ft-green" /> },
    {
      key: 'type', header: 'Type',
      cell: row => <span className="font-mono text-[10px] text-[#64748b]">{row.callType.toLowerCase()}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={rows}
      keyExtractor={row => `${row.transactionHash}:${row.traceIndex}`}
      pageSize={25}
      emptyMessage={emptyMessage}
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
      totalHint={totalHint}
    />
  );
}
