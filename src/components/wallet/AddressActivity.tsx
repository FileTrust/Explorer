'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { formatBlockNumber } from '@/lib/utils';
import { useAddressActivity } from '@/lib/hooks/useWallet';
import type { IndexedFileTrustEvent } from '@/lib/indexedData';

/// Argument names that hold an FTU amount in wei, so they are shown as FTU.
const AMOUNT_ARG = /amount|reward|fee|stake|value|paid|price|refund|deposit|payout|balance/i;

export function eventVariant(name: string): 'green' | 'red' | 'amber' | 'blue' | 'purple' | 'cyan' | 'gray' {
  if (/slash|fail|miss|expired|reject|dispute|wrong/i.test(name)) return 'red';
  if (/reward|paid|claim|refund|release/i.test(name)) return 'green';
  if (/stake|deposit|escrow/i.test(name)) return 'blue';
  if (/dkg|pre|reencrypt|share|key/i.test(name)) return 'purple';
  if (/proof|partition|sector|capacity/i.test(name)) return 'cyan';
  if (/heartbeat/i.test(name)) return 'gray';
  return 'amber';
}

/// A few arguments, readable, leaving out the address the page is about -- it
/// would repeat on every row.
export function ArgsSummary({ args, address }: { args: Record<string, unknown> | undefined; address: string }) {
  const entries = Object.entries(args ?? {})
    .filter(([key, value]) => !/^\d+$/.test(key) && String(value).toLowerCase() !== address)
    .slice(0, 3);
  if (entries.length === 0) return <span className="text-xs text-[#475569]">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      {entries.map(([key, value]) => {
        const text = typeof value === 'string' ? value : JSON.stringify(value);
        return (
          <span key={key} className="text-[11px] text-[#94a3b8]">
            <span className="text-[#64748b]">{key}: </span>
            {AMOUNT_ARG.test(key) && /^\d+$/.test(text)
              ? <FtuAmount wei={BigInt(text)} decimals={6} className="font-mono text-[11px] text-ft-green" />
              : /^0x[0-9a-fA-F]{40}$/.test(text)
                ? <Hash value={text} type="address" href={`/address/${text}`} />
                : <span className="font-mono">{text.length > 22 ? `${text.slice(0, 10)}…${text.slice(-6)}` : text}</span>}
          </span>
        );
      })}
    </span>
  );
}

/**
 * Every FileTrust event about an address, newest first, paged from the index.
 *
 * Heartbeats are hidden by default: a keeper or guardian sends one every few
 * minutes, and a list of them buries the work. One click shows them.
 */
export function AddressActivity({ address, emitter = false, fallback }: {
  address: string;
  emitter?: boolean;
  /** Shown instead when there is no index to page, so a screen keeps what it had. */
  fallback?: React.ReactNode;
}) {
  const lower = address.toLowerCase();
  const activity = useAddressActivity(lower, { emitter });
  const [showHeartbeats, setShowHeartbeats] = useState(false);

  const rows = useMemo(
    () => (showHeartbeats ? activity.rows : activity.rows.filter(row => !/heartbeat/i.test(row.name ?? ''))),
    [activity.rows, showHeartbeats],
  );
  const heartbeats = activity.rows.length - activity.rows.filter(row => !/heartbeat/i.test(row.name ?? '')).length;

  const columns: Column<IndexedFileTrustEvent>[] = [
    {
      key: 'event', header: 'Event',
      cell: row => <Badge label={row.name ?? 'Unknown'} variant={eventVariant(row.name ?? '')} />,
    },
    {
      key: 'contract', header: 'Contract',
      cell: row => row.contractName
        ? <Link href={`/contracts/${row.contractName}`} className="text-xs text-ft-blue hover:underline">{row.contractLabel ?? row.contractName}</Link>
        : <span className="text-xs text-[#64748b]">{row.contractLabel ?? '—'}</span>,
    },
    { key: 'details', header: 'Details', cell: row => <ArgsSummary args={row.args} address={lower} /> },
    { key: 'block', header: 'Block', cell: row => <Hash value={formatBlockNumber(BigInt(row.blockNumber))} href={`/blocks/${row.blockNumber}`} /> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.transactionHash} chars={6} href={`/tx/${row.transactionHash}`} /> },
  ];

  if (activity.isLoading) return <LoadingState message="Loading FileTrust activity…" />;
  if (activity.error) {
    return <ErrorState message="The FileTrust activity could not be loaded" retry={() => activity.refetch()} />;
  }
  if (activity.source === null) {
    if (fallback) return <>{fallback}</>;
    return (
      <p className="text-xs text-[#64748b] px-1">
        FileTrust activity needs the explorer index, and this explorer has none yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748b]">
        <span>
          {activity.source === 'store'
            ? (emitter ? 'Events this contract emitted, full history' : 'FileTrust events about this address, full history')
            : 'Recent FileTrust events kept by the index'}
        </span>
        {(heartbeats > 0 || showHeartbeats) && (
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={showHeartbeats} onChange={e => setShowHeartbeats(e.target.checked)} />
            Show heartbeats{heartbeats > 0 ? ` (${heartbeats.toLocaleString()} loaded)` : ''}
          </label>
        )}
      </div>
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={row => `${row.transactionHash}:${row.logIndex}`}
        pageSize={25}
        emptyMessage={activity.hasMore ? 'Only heartbeats in what is loaded so far' : 'No FileTrust events about this address'}
        hasMore={activity.hasMore}
        onLoadMore={activity.loadMore}
        loadingMore={activity.loadingMore}
      />
      {/* An empty table has no pager, so the way to the next page is here. */}
      {rows.length === 0 && activity.hasMore && (
        <button
          type="button"
          onClick={() => activity.loadMore()}
          disabled={activity.loadingMore}
          className="rounded bg-bg-elevated px-2 py-1 text-xs text-[#94a3b8] hover:text-[#e2e8f0] disabled:opacity-50"
        >
          {activity.loadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}
