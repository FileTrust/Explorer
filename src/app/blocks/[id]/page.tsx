'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Boxes, CheckCircle2, ChevronLeft, ChevronRight, Download, XCircle } from 'lucide-react';
import { formatUnits, hexToString } from 'viem';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { InfoRow } from '@/components/ui/InfoRow';
import { Party } from '@/components/ui/Party';
import { LoadingState, ErrorState, Spinner } from '@/components/ui/Spinner';
import { InternalTransfersTable } from '@/components/wallet/InternalTransfersTable';
import { ArgsSummary, eventVariant } from '@/components/wallet/AddressActivity';
import { ADDRESS_TO_NAME } from '@/lib/addresses';
import { downloadCsv } from '@/lib/csv';
import { cn, formatBlockNumber, timeAgo } from '@/lib/utils';
import { methodLabel, txFee, useMethodNames, type MethodInfo, type WalletTx } from '@/lib/hooks/useWallet';
import {
  useBlockConsensus, useBlockEvents, useBlockHeader, useBlockInternalTransfers, useBlockParticipants,
  useBlockStoreDetail, useBlockTransactions, useChainBlockTransactions,
  type BlockMethodCount, type BlockParticipant, type ConsensusInfo,
} from '@/lib/hooks/useBlockPage';
import type { IndexedFileTrustEvent } from '@/lib/indexedData';

const TABS = ['transactions', 'payments', 'events', 'participants', 'consensus'] as const;
type Tab = typeof TABS[number];

/// Gas used against the limit, as a half dial.
function GasGauge({ percent }: { percent: number }) {
  const p = Math.max(0, Math.min(100, percent));
  const r = 14;
  const length = Math.PI * r;
  return (
    <svg width="40" height="22" viewBox="0 0 40 22" role="img" aria-label={`${p.toFixed(2)}% of the gas limit used`}>
      <title>{`${p.toFixed(2)}% of the gas limit used`}</title>
      <path d="M6 20 A14 14 0 0 1 34 20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="text-bg-border" />
      <path
        d="M6 20 A14 14 0 0 1 34 20" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
        className="text-ft-blue" strokeDasharray={`${(length * p) / 100} ${length}`}
      />
    </svg>
  );
}

/// The block's transactions by what they called: one bar per method, longest
/// first, folding the tail into "Other" so the chart stays readable.
function MethodBars({ methods, names, failed }: {
  methods: BlockMethodCount[]; names: Record<string, MethodInfo> | undefined; failed: number;
}) {
  const label = (m: BlockMethodCount) => methodLabel(names, {
    selector: m.method === 'create' || m.method === 'transfer' ? null : m.method,
    to: m.method === 'create' ? null : '0x',
  });
  const rows = methods.slice(0, 7).map(m => ({ name: label(m), count: m.count, title: m.method }));
  const rest = methods.slice(7).reduce((sum, m) => sum + m.count, 0);
  if (rest > 0) rows.push({ name: 'Other', count: rest, title: `${methods.length - 7} other methods` });
  const max = Math.max(1, ...rows.map(r => r.count));
  return (
    <div className="space-y-1.5">
      {rows.map(row => (
        <div key={row.name} className="flex items-center gap-2" title={`${row.name}: ${row.count} (${row.title})`}>
          <span className="w-40 truncate font-mono text-[11px] text-[#94a3b8]">{row.name}</span>
          <span className="h-2 flex-1 max-w-[220px]">
            <span className="block h-2 rounded-r bg-ft-blue" style={{ width: `${(row.count / max) * 100}%`, minWidth: 4 }} />
          </span>
          <span className="w-10 text-right font-mono text-xs text-[#e2e8f0]">{row.count.toLocaleString()}</span>
        </div>
      ))}
      {failed > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-ft-red">
          <XCircle size={12} /> {failed.toLocaleString()} failed
        </div>
      )}
    </div>
  );
}

/// The extra data a block producer can write, as text when it is text.
function extraDataText(hex: `0x${string}`): string | null {
  if (!hex || hex === '0x') return null;
  try {
    const text = hexToString(hex).replace(/\0/g, '');
    return /^[\x20-\x7e]+$/.test(text) ? text : null;
  } catch {
    return null;
  }
}

function utc(ts: bigint): string {
  return new Date(Number(ts) * 1000).toUTCString().replace('GMT', 'UTC');
}

function TxTable({ rows, names, hasMore, onLoadMore, loadingMore, receipts }: {
  rows: WalletTx[];
  names: Record<string, MethodInfo> | undefined;
  hasMore?: boolean;
  onLoadMore?: () => void;
  loadingMore?: boolean;
  /** False when the rows come from the chain, which has no outcome or fee. */
  receipts: boolean;
}) {
  const columns: Column<WalletTx>[] = [
    {
      key: 'hash', header: 'Tx Hash',
      cell: row => (
        <span className="inline-flex items-center gap-1">
          {row.status === 'failed' && <span title="Failed"><XCircle size={12} className="text-ft-red" /></span>}
          <Hash value={row.hash} chars={8} href={`/tx/${row.hash}`} />
        </span>
      ),
    },
    {
      key: 'method', header: 'Method',
      cell: row => {
        const label = methodLabel(names, row);
        return (
          <span
            className="inline-block max-w-[9rem] truncate rounded border border-bg-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-[#94a3b8]"
            title={row.selector ? names?.[row.selector]?.signature ?? row.selector : label}
          >
            {label}
          </span>
        );
      },
    },
    { key: 'from', header: 'From', cell: row => <Party address={row.from} /> },
    {
      key: 'to', header: 'To',
      cell: row => row.to ? <Party address={row.to} /> : <span className="text-xs text-[#64748b]">Contract creation</span>,
    },
    { key: 'value', header: 'Value', cell: row => <FtuAmount wei={row.value} decimals={6} className="font-mono text-xs text-ft-green" /> },
    {
      key: 'fee', header: 'Fee',
      cell: row => {
        const fee = txFee(row);
        return fee === undefined
          ? <span className="text-xs text-[#475569]">—</span>
          : <FtuAmount wei={fee} decimals={8} className="font-mono text-[11px] text-[#64748b]" />;
      },
    },
    ...(receipts ? [{
      key: 'status', header: 'Status',
      cell: (row: WalletTx) => row.status === 'failed'
        ? <Badge label="Failed" variant="red" />
        : row.status === 'success' ? <Badge label="Success" variant="green" /> : <span className="text-xs text-[#475569]">—</span>,
    }] : []),
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      keyExtractor={row => row.hash}
      pageSize={25}
      emptyMessage="This block has no transactions"
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
    />
  );
}

function EventsTable({ rows, hasMore, onLoadMore, loadingMore }: {
  rows: IndexedFileTrustEvent[]; hasMore: boolean; onLoadMore: () => void; loadingMore: boolean;
}) {
  const columns: Column<IndexedFileTrustEvent>[] = [
    { key: 'event', header: 'Event', cell: row => <Badge label={row.name ?? 'Unknown'} variant={eventVariant(row.name ?? '')} /> },
    {
      key: 'contract', header: 'Contract',
      cell: row => row.contractName
        ? <Link href={`/contracts/${row.contractName}`} className="text-xs text-ft-blue hover:underline">{row.contractLabel ?? row.contractName}</Link>
        : <span className="text-xs text-[#64748b]">{row.contractLabel ?? '—'}</span>,
    },
    { key: 'details', header: 'Details', cell: row => <ArgsSummary args={row.args} address="" /> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.transactionHash} chars={6} href={`/tx/${row.transactionHash}`} /> },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      keyExtractor={row => `${row.transactionHash}:${row.logIndex}`}
      pageSize={25}
      emptyMessage="No FileTrust events in this block"
      hasMore={hasMore}
      onLoadMore={onLoadMore}
      loadingMore={loadingMore}
    />
  );
}

function ParticipantsTable({ rows, miner }: { rows: BlockParticipant[]; miner: string }) {
  const columns: Column<BlockParticipant>[] = [
    { key: 'address', header: 'Address', cell: row => <Party address={row.address} /> },
    {
      key: 'role', header: 'Role',
      cell: row => {
        const roles: React.ReactNode[] = [];
        if (row.guardian) roles.push(<Badge key="g" label="Guardian" variant="purple" />);
        if (row.vaultKeeper) roles.push(<Badge key="vk" label="Vault Keeper" variant="cyan" />);
        if (ADDRESS_TO_NAME[row.address.toLowerCase()]) roles.push(<Badge key="c" label="FileTrust contract" variant="gray" />);
        if (row.address.toLowerCase() === miner.toLowerCase()) roles.push(<Badge key="v" label="Validator" variant="blue" />);
        return roles.length ? <span className="flex flex-wrap gap-1">{roles}</span> : <span className="text-xs text-[#475569]">—</span>;
      },
    },
    {
      key: 'txs', header: 'Transactions',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.transactionsSent} sent · {row.transactionsReceived} received</span>,
    },
    {
      key: 'payments', header: 'Contract payments',
      cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.paymentsIn} in · {row.paymentsOut} out</span>,
    },
    { key: 'events', header: 'FileTrust events', cell: row => <span className="font-mono text-xs text-[#94a3b8]">{row.events}</span> },
  ];
  return (
    <DataTable columns={columns} data={rows} keyExtractor={row => row.address} pageSize={25} emptyMessage="Nobody took part in this block" />
  );
}

function ConsensusPanel({ data, loading }: { data: ConsensusInfo | { available: false; reason?: string } | undefined; loading: boolean }) {
  if (loading) return <LoadingState message="Asking the node's consensus side…" />;
  if (!data || !data.available) {
    return (
      <p className="rounded-xl border border-bg-border bg-bg-surface p-5 text-sm text-[#94a3b8]">
        Consensus details come from the node&apos;s Cosmos side (its CometBFT RPC, port 26657), and this Explorer
        cannot reach it{data && 'reason' in data && data.reason ? ` (${data.reason})` : ''}. A Hardhat chain has none.
      </p>
    );
  }
  const total = BigInt(data.validators.totalVotingPower || '0');
  const signedShare = total > 0n ? Number((BigInt(data.signatures.signedVotingPower) * 10000n) / total) / 100 : 0;
  return (
    <div className="rounded-xl border border-bg-border bg-bg-surface px-5">
      <InfoRow label="Chain ID">{data.chainId}</InfoRow>
      <InfoRow label="Proposer" help="The validator that proposed this block. Its consensus address is the one the validator signs blocks with; it is not an FTU wallet.">
        <span className="flex flex-wrap items-center gap-2">
          {data.proposer.name && <span className="font-semibold">{data.proposer.name}</span>}
          {data.proposer.thisNode && <Badge label="this node" variant="blue" />}
          <span className="font-mono text-xs text-[#94a3b8] break-all">{data.proposer.address}</span>
        </span>
      </InfoRow>
      {data.proposer.votingPower && (
        <InfoRow label="Proposer voting power">{BigInt(data.proposer.votingPower).toLocaleString()}</InfoRow>
      )}
      <InfoRow label="Validators" help="How many validators were in the active set at this height.">
        {data.validators.count.toLocaleString()} (total voting power {total.toLocaleString()})
      </InfoRow>
      <InfoRow label="Signatures" help="Validators that signed this block. A block is final once validators with more than two thirds of the voting power have signed it.">
        <span className="inline-flex items-center gap-1.5">
          <CheckCircle2 size={14} className="text-ft-green" />
          {data.signatures.signed.toLocaleString()} of {data.validators.count.toLocaleString()} signed
          <span className="text-[#64748b]">({signedShare}% of the voting power)</span>
        </span>
        {(data.signatures.absent > 0 || data.signatures.nil > 0) && (
          <span className="mt-1 block text-xs text-[#64748b]">{data.signatures.absent} absent · {data.signatures.nil} voted nil</span>
        )}
      </InfoRow>
      <InfoRow label="App hash" help="The chain's state after the previous block, as the consensus side records it.">
        <Hash value={data.appHash} full copyVisible wrap />
      </InfoRow>
    </div>
  );
}

export default function BlockDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [tab, setTab] = useState<Tab>('transactions');
  const [moreOpen, setMoreOpen] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

  const header = useBlockHeader(id);
  const number = header.data?.number;
  const store = useBlockStoreDetail(number);
  const methods = useMethodNames();
  const consensus = useBlockConsensus(number);
  // The index answers when it holds this block; otherwise the chain does.
  const indexed = store.data != null;
  const storeTxs = useBlockTransactions(number, tab === 'transactions' && indexed);
  const chainTxs = useChainBlockTransactions(number, tab === 'transactions' && store.isFetched && !indexed);
  const payments = useBlockInternalTransfers(number, tab === 'payments');
  const events = useBlockEvents(number, tab === 'events');
  const participants = useBlockParticipants(number, tab === 'participants');

  if (header.isLoading) return <LoadingState message="Loading block…" />;
  if (header.error || !header.data) return <ErrorState message="Block not found" retry={() => header.refetch()} />;

  const block = header.data;
  const s = store.data;
  const gasPercent = block.gasLimit > 0n ? Number((block.gasUsed * 10000n) / block.gasLimit) / 100 : 0;
  const after = block.previousTimestamp !== undefined ? Number(block.timestamp - block.previousTimestamp) : undefined;
  const c = consensus.data && consensus.data.available ? consensus.data : null;
  const extraText = extraDataText(block.extraData);
  const txCount = block.transactionHashes.length;

  const go = (t: Tab) => setTab(t);
  // From a link in the overview: open the tab and bring it into view.
  const show = (t: Tab) => {
    setTab(t);
    tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const tabLabel = (t: Tab) => ({
    transactions: `Transactions (${txCount.toLocaleString()})`,
    payments: `Contract payments${s?.internalCount != null ? ` (${s.internalCount.toLocaleString()})` : ''}`,
    events: `FileTrust events${s ? ` (${s.eventCount.toLocaleString()})` : ''}`,
    participants: 'Participants',
    consensus: 'Consensus info',
  })[t];

  const txRows = indexed ? storeTxs.rows : (chainTxs.data ?? []);
  const exportTransactions = () => downloadCsv(
    `block-${block.number}-transactions.csv`,
    ['Tx Hash', 'Status', 'Method', 'From', 'To', 'Value (FTU)', 'Fee (FTU)'],
    txRows.map(row => {
      const fee = txFee(row);
      return [row.hash, row.status ?? '', methodLabel(methods.data, row), row.from, row.to ?? '',
        formatUnits(row.value, 18), fee === undefined ? '' : formatUnits(fee, 18)];
    }),
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link href="/blocks" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#94a3b8] transition-colors">
        <ArrowLeft size={14} /> Back to Blocks
      </Link>

      <PageHeader title={`Block ${formatBlockNumber(block.number)}`} subtitle={utc(block.timestamp)} icon={Boxes} iconColor="text-ft-blue" />

      <div className="rounded-xl border border-bg-border bg-bg-surface px-5">
        <InfoRow label="Block Height" help="The block's number: how many blocks came before it.">
          <span className="inline-flex items-center gap-2">
            <span className="font-mono">{block.number.toString()}</span>
            {block.number > 1n
              ? <Link href={`/blocks/${block.number - 1n}`} aria-label="Previous block" className="rounded border border-bg-border p-0.5 text-[#94a3b8] hover:text-ft-blue"><ChevronLeft size={14} /></Link>
              : <span className="rounded border border-bg-border p-0.5 text-[#334155]"><ChevronLeft size={14} /></span>}
            {block.number < block.latest
              ? <Link href={`/blocks/${block.number + 1n}`} aria-label="Next block" className="rounded border border-bg-border p-0.5 text-[#94a3b8] hover:text-ft-blue"><ChevronRight size={14} /></Link>
              : <span className="rounded border border-bg-border p-0.5 text-[#334155]"><ChevronRight size={14} /></span>}
          </span>
        </InfoRow>
        <InfoRow label="Status" help="This chain finalizes a block when it is made: once validators with more than two thirds of the voting power sign it, it can never change. There is no waiting for confirmations.">
          <Badge label="Finalized" variant="green" dot />
        </InfoRow>
        <InfoRow label="Timestamp" help="When the block was made, by the chain's clock.">
          <span>{timeAgo(block.timestamp)} <span className="text-[#94a3b8]">({utc(block.timestamp)})</span></span>
          {after !== undefined && <span className="block text-xs text-[#64748b]">made {after.toLocaleString()} s after the previous block</span>}
        </InfoRow>
        <InfoRow label="Transactions" help="Transactions in this block; FTU that contracts paid inside them (rewards, fees, refunds), which are not transactions of their own; and the FileTrust events they emitted.">
          <button type="button" onClick={() => show('transactions')} className="text-ft-blue hover:underline">
            {txCount.toLocaleString()} transaction{txCount === 1 ? '' : 's'}
          </button>
          {s && s.failedCount > 0 && <span className="text-ft-red"> ({s.failedCount} failed)</span>}
          {s?.internalCount != null && (
            <> and <button type="button" onClick={() => show('payments')} className="text-ft-blue hover:underline">
              {s.internalCount.toLocaleString()} contract payment{s.internalCount === 1 ? '' : 's'}
            </button></>
          )}
          {' '}in this block
          {s && (
            <> · <button type="button" onClick={() => show('events')} className="text-ft-blue hover:underline">
              {s.eventCount.toLocaleString()} FileTrust event{s.eventCount === 1 ? '' : 's'}
            </button></>
          )}
        </InfoRow>
        {s && s.methods.length > 0 && (
          <InfoRow label="Transaction kinds" help="This block's transactions by the function they called.">
            <MethodBars methods={s.methods} names={methods.data} failed={s.failedCount} />
          </InfoRow>
        )}
        <InfoRow label="Validator" help="The validator that proposed this block. On FileTrust's Cosmos chain the block's fees go to the chain's fee pool, which pays them out to all validators by stake.">
          <span className="flex flex-wrap items-center gap-2">
            {c?.proposer.name && <span className="font-semibold">{c.proposer.name}</span>}
            <Party address={block.miner} />
          </span>
        </InfoRow>
        <InfoRow label="Block Reward" help="The fees this block's transactions paid, which go to the validators: nothing is burned on this chain. New coins the chain itself creates for validators are made on its Cosmos side and are not counted here.">
          {s?.feesWei != null
            ? <span><FtuAmount wei={s.feesWei} decimals={8} className="font-mono" /> <span className="text-xs text-[#64748b]">(transaction fees, paid to validators)</span></span>
            : txCount === 0
              ? <span className="font-mono">0 FTU</span>
              : <span className="text-xs text-[#64748b]">needs the explorer database, which does not hold this block</span>}
        </InfoRow>
        <InfoRow label="Size" help="The block's size in bytes.">
          <span className="font-mono">{block.size !== undefined ? `${block.size.toLocaleString()} bytes` : '—'}</span>
        </InfoRow>
        <InfoRow label="Gas Used" help="Gas the block's transactions used, against the most a block may use.">
          <span className="inline-flex items-center gap-3">
            <span className="font-mono">{block.gasUsed.toLocaleString()} <span className="text-[#94a3b8]">({gasPercent}%)</span></span>
            <GasGauge percent={gasPercent} />
          </span>
        </InfoRow>
        <InfoRow label="Gas Limit" help="The most gas one block may use.">
          <span className="font-mono">{block.gasLimit.toLocaleString()}</span>
        </InfoRow>
        <InfoRow label="Base Fee Per Gas" help="The lowest price per unit of gas a transaction had to pay in this block.">
          {block.baseFeePerGas !== undefined
            ? <span className="font-mono">{formatUnits(block.baseFeePerGas, 18)} FTU <span className="text-[#94a3b8]">({formatUnits(block.baseFeePerGas, 9)} Gwei)</span></span>
            : <span className="text-[#64748b]">—</span>}
        </InfoRow>
        <InfoRow label="Extra Data" help="Free bytes the block producer may write into the block.">
          {block.extraData === '0x'
            ? <span className="text-[#64748b]">none</span>
            : <span className="font-mono text-xs break-all">{extraText ? `${extraText} ` : ''}(Hex: {block.extraData})</span>}
        </InfoRow>
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-surface px-5">
        <button type="button" onClick={() => setMoreOpen(open => !open)} className="flex w-full items-center justify-between py-3 text-sm">
          <span className="font-semibold text-[#e2e8f0]">More Details</span>
          <span className="text-ft-blue">{moreOpen ? '− Click to show less' : '+ Click to show more'}</span>
        </button>
        {moreOpen && (
          <div className="border-t border-bg-border">
            <InfoRow label="Hash"><Hash value={block.hash} full copyVisible wrap /></InfoRow>
            <InfoRow label="Parent Hash"><Hash value={block.parentHash} full copyVisible wrap href={`/blocks/${block.parentHash}`} /></InfoRow>
            <InfoRow label="State Root" help="A fingerprint of every account and contract after this block."><Hash value={block.stateRoot} full copyVisible wrap /></InfoRow>
            <InfoRow label="Transactions Root" help="A fingerprint of this block's transactions."><Hash value={block.transactionsRoot} full copyVisible wrap /></InfoRow>
            <InfoRow label="Receipts Root" help="A fingerprint of the outcomes of this block's transactions."><Hash value={block.receiptsRoot} full copyVisible wrap /></InfoRow>
          </div>
        )}
      </div>

      <div ref={tabsRef} className="space-y-3 scroll-mt-4">
        <div className="flex flex-wrap gap-1 border-b border-bg-border">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => go(t)}
              className={cn(
                'px-3 py-2 text-sm -mb-px border-b-2 transition-colors',
                tab === t ? 'border-ft-blue text-[#e2e8f0]' : 'border-transparent text-[#64748b] hover:text-[#94a3b8]',
              )}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        {tab === 'transactions' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748b]">
              <span>{indexed ? 'In block order, from the explorer index' : 'Read from the chain: the explorer database does not hold this block, so outcomes and fees are not shown'}</span>
              {txRows.length > 0 && (
                <button
                  type="button"
                  onClick={exportTransactions}
                  title="Downloads the rows loaded so far"
                  className="inline-flex items-center gap-1.5 rounded-md border border-bg-border px-2.5 py-1 text-xs text-[#94a3b8] hover:bg-bg-elevated"
                >
                  <Download size={12} /> Download CSV
                </button>
              )}
            </div>
            {(indexed ? storeTxs.isLoading : chainTxs.isLoading || !store.isFetched)
              ? <div className="flex justify-center py-6"><Spinner /></div>
              : <TxTable
                  rows={txRows}
                  names={methods.data}
                  receipts={indexed}
                  hasMore={indexed && storeTxs.hasMore}
                  onLoadMore={storeTxs.loadMore}
                  loadingMore={storeTxs.loadingMore}
                />}
          </div>
        )}

        {tab === 'payments' && (
          payments.isLoading ? <div className="flex justify-center py-6"><Spinner /></div>
            : payments.unavailable
              ? <p className="text-xs text-[#64748b] px-1">Contract payments need the explorer database, and it has not read this block&apos;s.</p>
              : <InternalTransfersTable
                  rows={payments.rows}
                  withTransaction
                  hasMore={payments.hasMore}
                  onLoadMore={payments.loadMore}
                  loadingMore={payments.loadingMore}
                  emptyMessage="No FTU was paid by a contract in this block"
                />
        )}

        {tab === 'events' && (
          events.isLoading ? <div className="flex justify-center py-6"><Spinner /></div>
            : events.unavailable
              ? <p className="text-xs text-[#64748b] px-1">FileTrust events need the explorer index, and this explorer has none yet.</p>
              : (
                <div className="space-y-2">
                  {!indexed && (
                    <p className="text-xs text-[#64748b] px-1">
                      From the recent events the index keeps; the explorer database does not hold this block, so older events may be missing.
                    </p>
                  )}
                  <EventsTable rows={events.rows} hasMore={events.hasMore} onLoadMore={events.loadMore} loadingMore={events.loadingMore} />
                </div>
              )
        )}

        {tab === 'participants' && (
          participants.isLoading ? <div className="flex justify-center py-6"><Spinner /></div>
            : participants.data == null
              ? <p className="text-xs text-[#64748b] px-1">Participants need the explorer database, and it does not hold this block.</p>
              : <ParticipantsTable rows={participants.data} miner={block.miner} />
        )}

        {tab === 'consensus' && <ConsensusPanel data={consensus.data} loading={consensus.isLoading} />}
      </div>
    </div>
  );
}
