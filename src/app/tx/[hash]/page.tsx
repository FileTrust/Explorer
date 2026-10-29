'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ChevronLeft, ChevronRight, CornerDownRight, FileCode, XCircle, Zap } from 'lucide-react';
import { decodeFunctionData, formatUnits, type AbiFunction } from 'viem';
import { useTransaction, DecodedEvent, DecodedArg } from '@/lib/hooks/useTransaction';
import { LoadingState, Spinner } from '@/components/ui/Spinner';
import { Badge } from '@/components/ui/Badge';
import { DataTable, Column } from '@/components/ui/DataTable';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { Hash } from '@/components/ui/Hash';
import { InfoRow } from '@/components/ui/InfoRow';
import { Party } from '@/components/ui/Party';
import { PartitionSectorRecord } from '@/lib/hooks/useStorage';
import { cn, copyToClipboard, formatBytes, formatBlockNumber, timeAgo } from '@/lib/utils';
import { ADDRESS_TO_NAME } from '@/lib/addresses';
import { MethodInfo, methodLabel, useMethodNames, useTransactionInternalTransfers } from '@/lib/hooks/useWallet';
import { useChainStats } from '@/lib/hooks/useChainStats';
import { useTxChainExtras, useTxFailure, useTxReceipt, useTxStateDiff, type AccountChange } from '@/lib/hooks/useTxPage';
import { balanceChanges, type BalanceChange } from '@/lib/txState.mjs';
import { InternalTransfersTable } from '@/components/wallet/InternalTransfersTable';

const TABS = ['overview', 'payments', 'events', 'state'] as const;
type Tab = typeof TABS[number];

const TX_TYPES: Record<string, string> = {
  legacy: '0 (Legacy)',
  eip2930: '1 (EIP-2930, access list)',
  eip1559: '2 (EIP-1559)',
  eip4844: '3 (EIP-4844, blob)',
  eip7702: '4 (EIP-7702)',
};

function utc(ts: bigint): string {
  return new Date(Number(ts) * 1000).toUTCString().replace('GMT', 'UTC');
}

function gwei(wei: bigint): string {
  return `${formatUnits(wei, 9)} Gwei`;
}

/// The call's arguments, by name, read with the function's own definition.
/// Null when the function is not known here or the input does not fit it.
function decodeInputs(method: MethodInfo | undefined, input: `0x${string}`): Array<{ name: string; type: string; value: string }> | null {
  if (!method || input.length < 10) return null;
  try {
    const item = { type: 'function', name: method.name, inputs: method.inputs, outputs: [], stateMutability: 'nonpayable' } as AbiFunction;
    const { args } = decodeFunctionData({ abi: [item], data: input });
    return method.inputs.map((param, i) => ({
      name: param.name || `arg${i}`,
      type: param.type,
      value: stringifyArg((args ?? [])[i]),
    }));
  } catch {
    return null;
  }
}

function stringifyArg(value: unknown): string {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return `[${value.map(stringifyArg).join(', ')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).map(([k, v]) => `${k}: ${stringifyArg(v)}`).join(', ')}}`;
  }
  return String(value);
}

function AddrSpan({ value }: { value: string }) {
  return (
    <span className="font-mono text-xs">
      <span className="text-[#64748b]">{value.slice(0, 6)}</span>
      <span className="text-[#94a3b8]">{value.slice(6, -4)}</span>
      <span className="text-[#64748b]">{value.slice(-4)}</span>
    </span>
  );
}

function HashSpan({ value, full }: { value: string; full?: boolean }) {
  if (full) return <span className="font-mono text-xs text-[#64748b] break-all">{value}</span>;
  return (
    <span className="font-mono text-xs text-[#64748b]" title={value}>
      {value.slice(0, 10)}…{value.slice(-8)}
    </span>
  );
}

function ArgValue({ arg }: { arg: DecodedArg }) {
  const { type, value, raw } = arg;
  if (type === 'bool') {
    return (
      <span className={`font-mono text-xs font-semibold ${raw ? 'text-ft-green' : 'text-ft-red'}`}>
        {raw ? '✓ true' : '✗ false'}
      </span>
    );
  }
  if (type === 'address') return <AddrSpan value={value} />;
  if (type === 'bytes32' || type === 'bytes') return <HashSpan value={value} />;
  if (type === 'string') return <span className="font-mono text-xs text-[#e2e8f0] break-all">{value || '(empty)'}</span>;
  return <span className="font-mono text-xs text-ft-amber">{value}</span>;
}

function EventCard({ event, index }: { event: DecodedEvent; index: number }) {
  const isUnknown = event.eventName === 'Unknown Event';
  return (
    <div className="bg-bg-elevated border border-bg-border rounded-xl overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-bg-border">
        <span className="text-[10px] font-mono text-[#475569] bg-bg-surface border border-bg-border rounded px-1.5 py-0.5">
          #{index}
        </span>
        <span className={`font-semibold text-sm ${isUnknown ? 'text-[#64748b]' : 'text-ft-cyan'}`}>{event.eventName}</span>
        {event.purpose && <span className="text-xs text-[#64748b] italic">{event.purpose}</span>}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[10px] text-[#475569]">{event.contractLabel}</span>
          <AddrSpan value={event.contractAddress} />
        </div>
      </div>

      {event.args.length > 0 ? (
        <div className="divide-y divide-bg-border">
          {event.args.map(arg => (
            <div key={arg.name} className="flex items-start gap-4 px-4 py-2.5">
              <div className="w-36 shrink-0">
                <span className="text-xs font-semibold text-[#e2e8f0]">{arg.name}</span>
                <span className="ml-1.5 text-[10px] text-[#475569] font-mono">{arg.type}</span>
              </div>
              <div className="flex-1 min-w-0"><ArgValue arg={arg} /></div>
            </div>
          ))}
        </div>
      ) : event.topics.length > 0 || event.data !== '0x' ? (
        // Raw topics and data, for an event no ABI here could decode. Only the
        // chain-read path produces these: the index stores decoded arguments and
        // not the raw log, so an indexed event reaches the branch below instead.
        <div className="px-4 py-3">
          {event.topics.map((t, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <span className="text-[10px] text-[#475569] w-16 shrink-0">topic[{i}]</span>
              <HashSpan value={t} full />
            </div>
          ))}
          {event.data !== '0x' && (
            <div className="flex items-start gap-2 py-0.5 mt-1">
              <span className="text-[10px] text-[#475569] w-16 shrink-0">data</span>
              <span className="font-mono text-[10px] text-[#64748b] break-all">{event.data}</span>
            </div>
          )}
        </div>
      ) : (
        // An event with no arguments, served from the index, which does not keep
        // the raw log. Say which, so the blank is explained rather than merely empty.
        <div className="px-4 py-3">
          <span className="text-[10px] text-[#475569]">No arguments. Raw topics and data are not stored in the index.</span>
        </div>
      )}
    </div>
  );
}

function PartitionSectorTable({ partitionKey, sectors }: { partitionKey: `0x${string}`; sectors: PartitionSectorRecord[] }) {
  const columns: Column<PartitionSectorRecord>[] = [
    { key: 'slot', header: 'Slot', cell: sector => <span className="font-mono text-xs text-[#64748b]">#{sector.slot}</span> },
    { key: 'sectorId', header: 'Sector ID', cell: sector => <HashSpan value={sector.sectorId} /> },
    { key: 'sectorRoot', header: 'Sector Root', cell: sector => <HashSpan value={sector.sectorRoot} /> },
    {
      key: 'sectorBlockCount', header: 'Blocks', sortValue: sector => sector.sectorBlockCount,
      cell: sector => <span className="font-mono text-xs text-[#94a3b8]">{sector.sectorBlockCount.toLocaleString()}</span>,
    },
    {
      key: 'committedBytes', header: 'Bytes', sortValue: sector => sector.committedBytes,
      cell: sector => <span className="font-mono text-xs text-[#94a3b8]">{formatBytes(sector.committedBytes)}</span>,
    },
    { key: 'pieceCommitment', header: 'Piece Commitment', cell: sector => <HashSpan value={sector.pieceCommitment} /> },
  ];
  return (
    <DataTable
      columns={columns}
      data={sectors}
      keyExtractor={sector => `${partitionKey}-${sector.slot}`}
      pageSize={10}
      emptyMessage="No sector detail available for this partition"
    />
  );
}

/// The call's input, decoded when the function is known, or as the raw bytes.
function InputData({ input, method }: { input: `0x${string}`; method: MethodInfo | undefined }) {
  const decoded = decodeInputs(method, input);
  const [raw, setRaw] = useState(!decoded);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (await copyToClipboard(input)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {decoded && (
          <span className="inline-flex overflow-hidden rounded-md border border-bg-border">
            {(['decoded', 'raw'] as const).map(view => (
              <button
                key={view}
                type="button"
                onClick={() => setRaw(view === 'raw')}
                className={cn('px-2 py-0.5', (view === 'raw') === raw ? 'bg-bg-elevated text-[#e2e8f0]' : 'text-[#64748b] hover:text-[#94a3b8]')}
              >
                {view === 'decoded' ? 'Decoded' : 'Raw hex'}
              </button>
            ))}
          </span>
        )}
        <button type="button" onClick={copy} className="text-ft-blue hover:underline">{copied ? 'Copied' : 'Copy input'}</button>
        <span className="text-[#475569]">{((input.length - 2) / 2).toLocaleString()} bytes</span>
      </div>
      {!raw && decoded ? (
        <div className="space-y-1 rounded-lg border border-bg-border bg-bg-elevated p-3">
          {method && <div className="font-mono text-xs text-[#e2e8f0] break-all">Function: {method.signature}</div>}
          {decoded.map(arg => (
            <div key={arg.name} className="text-xs break-all">
              <span className="text-[#64748b]">{arg.name}</span>
              <span className="text-[#475569]"> ({arg.type}): </span>
              <span className="font-mono text-[#94a3b8]">
                {arg.value.length > 300 ? `${arg.value.slice(0, 300)}… (${arg.value.length} characters)` : arg.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg border border-bg-border bg-bg-elevated p-3 font-mono text-[10px] text-[#94a3b8]">
          {input}
        </pre>
      )}
    </div>
  );
}

function BalanceChangesTable({ rows }: { rows: BalanceChange[] }) {
  const columns: Column<BalanceChange>[] = [
    {
      key: 'address', header: 'Address',
      cell: row => row.address
        ? <Party address={row.address} />
        : <span className="text-xs text-[#94a3b8]">Fee pool <span className="text-[#64748b]">(paid to the validators)</span></span>,
    },
    {
      key: 'change', header: 'Change', unit: 'FTU',
      cell: row => (
        <span className={cn('font-mono text-xs', row.change < 0n ? 'text-ft-red' : 'text-ft-green')}>
          {row.change < 0n ? '−' : '+'}
          <FtuAmount wei={row.change < 0n ? -row.change : row.change} decimals={8} showUnit={false} />
        </span>
      ),
    },
  ];
  return (
    <DataTable
      columns={columns}
      data={rows}
      keyExtractor={row => row.address ?? 'fee-pool'}
      pageSize={25}
      emptyMessage="No FTU moved"
    />
  );
}

function StorageChanges({ accounts }: { accounts: AccountChange[] }) {
  // A balance alone is already in the table above, in full: the node's own view
  // leaves out the fee, which a Cosmos node takes before the call runs.
  const shown = accounts.filter(account => account.created || account.nonce || account.storage.length > 0);
  if (shown.length === 0) return <p className="text-xs text-[#64748b] px-1">No contract storage or account nonce changed.</p>;
  return (
    <div className="space-y-3">
      {shown.map(account => (
        <div key={account.address} className="rounded-xl border border-bg-border bg-bg-surface">
          <div className="flex flex-wrap items-center gap-2 border-b border-bg-border px-4 py-3">
            <Party address={account.address} />
            {account.created && <Badge label="Contract created" variant="green" />}
            {account.nonce && (
              <span className="text-xs text-[#64748b]">nonce {account.nonce.before} → {account.nonce.after}</span>
            )}
            {account.storage.length > 0 && (
              <span className="ml-auto text-xs text-[#64748b]">
                {account.storage.length.toLocaleString()} storage slot{account.storage.length === 1 ? '' : 's'} changed
              </span>
            )}
          </div>
          {account.storage.length > 0 && (
            <div className="divide-y divide-bg-border">
              {account.storage.slice(0, 100).map(change => (
                <div key={change.slot} className="grid grid-cols-1 gap-1 px-4 py-2 sm:grid-cols-3 sm:gap-3">
                  <span className="text-[10px] text-[#475569]">slot <HashSpan value={change.slot} /></span>
                  <span className="text-[10px] text-[#475569]">before <HashSpan value={change.before} /></span>
                  <span className="text-[10px] text-[#475569]">after <HashSpan value={change.after} /></span>
                </div>
              ))}
              {account.storage.length > 100 && (
                <p className="px-4 py-2 text-xs text-[#64748b]">and {(account.storage.length - 100).toLocaleString()} more</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function TxPage() {
  const params = useParams();
  const txHash = params.hash as `0x${string}`;
  const [tab, setTab] = useState<Tab>('overview');
  const [moreOpen, setMoreOpen] = useState(false);
  const { data: tx, isLoading, error } = useTransaction(txHash);
  const methods = useMethodNames();
  const stats = useChainStats();
  const internal = useTransactionInternalTransfers(tx ? txHash : undefined);
  // Read from the chain only when the page needs what the index lacks.
  const receipt = useTxReceipt(txHash, !!tx && tx.source === 'index' && (!tx.statusKnown || tx.to === null));
  const status = tx ? (tx.statusKnown ? tx.status : receipt.data?.status) : undefined;
  const failed = status === 'reverted';
  const failure = useTxFailure(txHash, failed);
  const extras = useTxChainExtras(txHash, moreOpen && !!tx && tx.source === 'index');
  const stateDiff = useTxStateDiff(txHash, tab === 'state' && !!tx && !failed && status !== undefined);

  if (isLoading) return <LoadingState message="Fetching transaction…" />;

  if (error || !tx) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-[#64748b] hover:text-ft-blue transition-colors">
          <ArrowLeft size={12} /> Back
        </Link>
        <div className="bg-bg-surface border border-bg-border rounded-xl p-8 text-center">
          <XCircle size={32} className="text-ft-red mx-auto mb-3" />
          <p className="text-[#e2e8f0] font-semibold">Transaction not found</p>
          <p className="text-xs text-[#64748b] mt-1 font-mono break-all">{txHash}</p>
          <p className="text-xs text-[#475569] mt-3">This hash does not match any transaction on the chain.</p>
        </div>
      </div>
    );
  }

  const selector = tx.input.length >= 10 ? tx.input.slice(0, 10).toLowerCase() : null;
  const method = selector ? methods.data?.[selector] : undefined;
  const fee = tx.gasPrice !== undefined ? tx.gasUsed * tx.gasPrice : undefined;
  const gasPercent = tx.gasLimit > 0n ? Number((tx.gasUsed * 10000n) / tx.gasLimit) / 100 : 0;
  const latest = stats.data?.blockNumber;
  const confirmations = latest !== undefined && latest >= tx.blockNumber ? latest - tx.blockNumber + 1n : undefined;
  const contractAddress = tx.contractAddress ?? receipt.data?.contractAddress ?? null;
  const payments = internal.data?.traced ? internal.data.rows : [];
  const purpose = tx.events.find(e => e.purpose)?.purpose;
  const toName = tx.to ? ADDRESS_TO_NAME[tx.to.toLowerCase()] : undefined;
  const fields = tx.source === 'chain'
    ? { nonce: tx.nonce, type: tx.type, maxFeePerGas: tx.maxFeePerGas, maxPriorityFeePerGas: tx.maxPriorityFeePerGas }
    : extras.data;
  const changes = status !== undefined
    ? balanceChanges({ from: tx.from, to: tx.to, value: tx.value, fee, failed, payments })
    : [];

  const tabLabel = (t: Tab) => ({
    overview: 'Overview',
    payments: `Contract payments${internal.data?.traced ? ` (${payments.length})` : ''}`,
    events: `Events (${tx.events.length})`,
    state: 'State',
  })[t];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <button type="button" onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 text-xs text-[#64748b] hover:text-ft-blue transition-colors">
        <ArrowLeft size={12} /> Back
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-lg font-semibold text-[#e2e8f0]">Transaction Details</h1>
        {(tx.senderPrevious !== undefined || tx.senderNext !== undefined) && (
          <span className="inline-flex items-center gap-1">
            {tx.senderPrevious
              ? <Link href={`/tx/${tx.senderPrevious}`} title="The sender's previous transaction" aria-label="The sender's previous transaction" className="rounded border border-bg-border p-0.5 text-[#94a3b8] hover:text-ft-blue"><ChevronLeft size={14} /></Link>
              : <span className="rounded border border-bg-border p-0.5 text-[#334155]"><ChevronLeft size={14} /></span>}
            {tx.senderNext
              ? <Link href={`/tx/${tx.senderNext}`} title="The sender's next transaction" aria-label="The sender's next transaction" className="rounded border border-bg-border p-0.5 text-[#94a3b8] hover:text-ft-blue"><ChevronRight size={14} /></Link>
              : <span className="rounded border border-bg-border p-0.5 text-[#334155]"><ChevronRight size={14} /></span>}
          </span>
        )}
      </div>

      {/* What the transaction did, in one sentence. */}
      <div className="flex items-start gap-3 rounded-xl border border-bg-border bg-bg-surface px-5 py-4">
        <FileCode size={18} className="mt-0.5 shrink-0 text-ft-blue" />
        <div className="min-w-0 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-[#64748b]">Transaction action</div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-[#e2e8f0]">
            <Hash value={tx.from} type="address" href={`/address/${tx.from}`} />
            {tx.to === null ? (
              <span>created a contract{contractAddress ? <> at <Hash value={contractAddress} type="address" href={`/address/${contractAddress}`} /></> : ''}</span>
            ) : !selector ? (
              <>
                <span>sent</span>
                <FtuAmount wei={tx.value} decimals={6} className="font-mono" />
                <span>to</span>
                <Hash value={tx.to} type="address" href={`/address/${tx.to}`} />
                {toName && <span className="text-ft-cyan">({toName})</span>}
              </>
            ) : (
              <>
                <span>called</span>
                <span className="rounded border border-bg-border bg-bg-elevated px-1.5 py-0.5 font-mono text-xs">{methodLabel(methods.data, { selector, to: tx.to })}</span>
                <span>on</span>
                {toName
                  ? <Link href={`/address/${tx.to}`} className="text-ft-cyan hover:underline">{toName}</Link>
                  : <Hash value={tx.to} type="address" href={`/address/${tx.to}`} />}
                {tx.value > 0n && <><span>with</span><FtuAmount wei={tx.value} decimals={6} className="font-mono" /></>}
              </>
            )}
          </div>
          {purpose && (
            <div className="flex items-center gap-1.5 text-xs text-ft-blue">
              <Zap size={12} className="shrink-0" /> {purpose}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-bg-border">
        {TABS.map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-2 text-sm -mb-px border-b-2 transition-colors',
              tab === t ? 'border-ft-blue text-[#e2e8f0]' : 'border-transparent text-[#64748b] hover:text-[#94a3b8]',
            )}
          >
            {tabLabel(t)}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="rounded-xl border border-bg-border bg-bg-surface px-5">
            <InfoRow label="Transaction Hash" help="The transaction's unique name: a fingerprint of everything it says.">
              <Hash value={tx.hash} full copyVisible wrap />
            </InfoRow>
            <InfoRow label="Status" help="Whether the transaction did what it asked. A failed transaction changes nothing, but still pays its fee.">
              {status === undefined ? (
                receipt.isLoading ? <Spinner /> : <span className="text-xs text-[#64748b]">not known: the index has no receipt and the chain did not answer</span>
              ) : (
                <span className="flex flex-col gap-1">
                  <span><Badge label={failed ? 'Failed' : 'Success'} variant={failed ? 'red' : 'green'} dot /></span>
                  {failed && (
                    failure.isLoading ? <span className="text-xs text-[#64748b]">Asking the node why…</span>
                      : failure.data?.available && failure.data.value
                        ? (
                          <span className="text-xs text-ft-red break-all">
                            {failure.data.value.reason ? `${failure.data.value.reason} — ` : ''}{failure.data.value.error}
                          </span>
                        )
                        : <span className="text-xs text-[#64748b]">The reason is not known: {failure.data && !failure.data.available ? failure.data.reason : 'the node gave none'}.</span>
                  )}
                </span>
              )}
            </InfoRow>
            <InfoRow label="Block" help="The block that holds the transaction. A block on this chain is final as soon as it is made.">
              <span className="flex flex-wrap items-center gap-2">
                <Link href={`/blocks/${tx.blockNumber}`} className="font-mono text-ft-blue hover:underline">{formatBlockNumber(tx.blockNumber)}</Link>
                <Badge label="Finalized" variant="green" />
                {confirmations !== undefined && (
                  <span className="text-xs text-[#64748b]">{confirmations.toLocaleString()} block confirmation{confirmations === 1n ? '' : 's'}</span>
                )}
              </span>
            </InfoRow>
            <InfoRow label="Timestamp" help="When the block holding the transaction was made.">
              {tx.blockTimestamp !== undefined
                ? <span>{timeAgo(tx.blockTimestamp)} <span className="text-[#94a3b8]">({utc(tx.blockTimestamp)})</span></span>
                : <span className="text-[#64748b]">—</span>}
            </InfoRow>
            <InfoRow label="From" help="The account that sent and signed the transaction, and paid its fee.">
              <Party address={tx.from} roles={tx.roles?.from} full copy />
            </InfoRow>
            <InfoRow label="To" help="The account or contract the transaction was sent to. FTU that contract paid out while it ran is listed under it.">
              {tx.to ? (
                <span className="flex flex-col gap-1.5">
                  <Party address={tx.to} roles={tx.roles?.to} full copy />
                  {payments.slice(0, 3).map(p => (
                    <span key={p.traceIndex} className="flex flex-wrap items-center gap-1.5 text-xs text-[#94a3b8]">
                      <CornerDownRight size={12} className="text-[#475569]" />
                      Paid <FtuAmount wei={p.value} decimals={6} className="font-mono text-ft-green" />
                      from <Hash value={p.from} type="address" href={`/address/${p.from}`} />
                      to <Hash value={p.to} type="address" href={`/address/${p.to}`} />
                    </span>
                  ))}
                  {payments.length > 3 && (
                    <button type="button" onClick={() => setTab('payments')} className="self-start text-xs text-ft-blue hover:underline">
                      and {payments.length - 3} more contract payments
                    </button>
                  )}
                </span>
              ) : (
                <span className="flex flex-wrap items-center gap-2 text-xs text-[#94a3b8]">
                  Contract creation
                  {contractAddress
                    ? <>: <Party address={contractAddress} full copy /></>
                    : receipt.isLoading ? <Spinner /> : null}
                </span>
              )}
            </InfoRow>
            <InfoRow label="Value" help="The FTU the sender attached to the transaction.">
              <FtuAmount wei={tx.value} decimals={6} className="font-mono" />
            </InfoRow>
            <InfoRow label="Transaction Fee" help="What the transaction paid for the gas it used: gas used times gas price. It goes to the validators.">
              {fee !== undefined ? <FtuAmount wei={fee} decimals={8} className="font-mono" /> : <span className="text-[#64748b]">—</span>}
            </InfoRow>
            <InfoRow label="Gas Price" help="The price paid for each unit of gas.">
              {tx.gasPrice !== undefined
                ? <span className="font-mono">{gwei(tx.gasPrice)} <span className="text-[#94a3b8]">({formatUnits(tx.gasPrice, 18)} FTU)</span></span>
                : <span className="text-[#64748b]">—</span>}
            </InfoRow>
          </div>

          <div className="rounded-xl border border-bg-border bg-bg-surface px-5">
            <button type="button" onClick={() => setMoreOpen(open => !open)} className="flex w-full items-center justify-between py-3 text-sm">
              <span className="font-semibold text-[#e2e8f0]">More Details</span>
              <span className="text-ft-blue">{moreOpen ? '− Click to show less' : '+ Click to show more'}</span>
            </button>
            {moreOpen && (
              <div className="border-t border-bg-border">
                <InfoRow label="Gas Limit & Usage" help="The most gas the sender allowed, and how much the transaction used.">
                  <span className="flex flex-wrap items-center gap-3 font-mono text-sm">
                    <span>{tx.gasLimit.toLocaleString()} <span className="text-[#475569]">|</span> {tx.gasUsed.toLocaleString()} <span className="text-[#94a3b8]">({gasPercent}%)</span></span>
                    <span className="block h-1.5 w-32 rounded-full bg-bg-elevated">
                      <span className="block h-1.5 rounded-full bg-ft-blue" style={{ width: `${Math.min(100, gasPercent)}%` }} />
                    </span>
                  </span>
                </InfoRow>
                <InfoRow label="Gas Fees" help="Base: the block's lowest price per gas. Max and Max Priority: the most the sender agreed to pay, and to tip, per gas.">
                  {extras.isLoading ? <Spinner /> : (
                    <span className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs text-[#94a3b8]">
                      <span><span className="text-[#64748b]">Base:</span> {tx.baseFeePerGas !== undefined ? gwei(tx.baseFeePerGas) : '—'}</span>
                      {fields?.maxFeePerGas !== undefined && <span><span className="text-[#64748b]">Max:</span> {gwei(fields.maxFeePerGas)}</span>}
                      {fields?.maxPriorityFeePerGas !== undefined && <span><span className="text-[#64748b]">Max Priority:</span> {gwei(fields.maxPriorityFeePerGas)}</span>}
                      {fields && fields.maxFeePerGas === undefined && <span className="text-[#64748b]">one gas price, set by the sender</span>}
                    </span>
                  )}
                </InfoRow>
                <InfoRow label="Burnt Fees" help="Ethereum burns part of every fee. FileTrust burns nothing.">
                  <span className="text-xs text-[#94a3b8]">None: FileTrust burns no fees; the whole fee goes to the validators.</span>
                </InfoRow>
                <InfoRow label="Other Attributes" help="Type: the transaction format. Nonce: how many transactions the sender had sent before it. Position: its place in the block.">
                  {extras.isLoading ? <Spinner /> : (
                    <span className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded border border-bg-border px-1.5 py-0.5 text-[#94a3b8]">Txn Type: {fields?.type ? (TX_TYPES[fields.type] ?? fields.type) : '—'}</span>
                      <span className="rounded border border-bg-border px-1.5 py-0.5 text-[#94a3b8]">Nonce: {fields?.nonce !== undefined ? fields.nonce.toLocaleString() : '—'}</span>
                      <span className="rounded border border-bg-border px-1.5 py-0.5 text-[#94a3b8]">Position In Block: {tx.transactionIndex !== undefined ? tx.transactionIndex : '—'}</span>
                    </span>
                  )}
                  {extras.error && <span className="mt-1 block text-xs text-[#64748b]">The chain did not answer for the type and nonce.</span>}
                </InfoRow>
                <InfoRow label="Input Data" help="What the transaction asked the contract to do: the function and its arguments.">
                  {tx.input === '0x'
                    ? <span className="text-xs text-[#64748b]">none (a plain payment)</span>
                    : <InputData input={tx.input} method={method} />}
                </InfoRow>
              </div>
            )}
          </div>

          {tx.partitionSectors.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider mb-3">Partition Sectors</h2>
              <div className="space-y-3">
                {tx.partitionSectors.map(group => (
                  <div key={group.partitionKey} className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 border-b border-bg-border flex items-center gap-3">
                      <span className="text-xs font-semibold text-[#e2e8f0]">Partition</span>
                      <HashSpan value={group.partitionKey} />
                      <span className="ml-auto text-[10px] text-[#64748b]">{group.sectors.length} sectors</span>
                    </div>
                    {group.sectors.length > 0
                      ? <PartitionSectorTable partitionKey={group.partitionKey} sectors={group.sectors} />
                      : <div className="px-4 py-3 text-xs text-[#64748b]">No sector detail available for this partition.</div>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FTU contracts moved while this transaction ran: rewards, fees,
          refunds, returned stake. */}
      {tab === 'payments' && (
        internal.isLoading ? <div className="flex justify-center py-6"><Spinner /></div>
          : !internal.data?.traced
            ? <p className="text-xs text-[#64748b] px-1">Not known: this transaction has not been traced yet, and the chain node did not answer a trace request.</p>
            : <InternalTransfersTable rows={internal.data.rows} emptyMessage="No contract paid FTU in this transaction" />
      )}

      {tab === 'events' && (
        tx.events.length === 0
          ? <p className="text-xs text-[#64748b] px-1">No events emitted</p>
          : (
            <div className="space-y-3">
              {tx.events.map((event, i) => <EventCard key={`${event.logIndex}-${i}`} event={event} index={i} />)}
            </div>
          )
      )}

      {tab === 'state' && (
        <div className="space-y-5">
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Balance changes</h2>
            <p className="text-xs text-[#64748b]">
              {failed
                ? 'The transaction failed, so only its fee was taken.'
                : 'FTU each address gained or lost: the value sent, the payments contracts made, and the fee.'}
              {!failed && !internal.data?.traced && !internal.isLoading && ' Contract payments are not known yet, so this may be incomplete.'}
            </p>
            {status === undefined ? <p className="text-xs text-[#64748b] px-1">Not known until the outcome is.</p> : <BalanceChangesTable rows={changes} />}
          </div>
          <div className="space-y-2">
            <h2 className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Contract storage</h2>
            {failed ? (
              <p className="text-xs text-[#64748b] px-1">A failed transaction is undone: no account or contract storage changed.</p>
            ) : stateDiff.isLoading || status === undefined ? (
              <div className="flex justify-center py-6"><Spinner /></div>
            ) : !stateDiff.data?.available ? (
              <p className="text-xs text-[#64748b] px-1">
                Not shown: the node replays a transaction to tell what it changed, and here {stateDiff.data?.reason ?? 'it did not answer'}.
              </p>
            ) : (
              <StorageChanges accounts={stateDiff.data.value} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
