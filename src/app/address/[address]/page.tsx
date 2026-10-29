'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ArrowRight, Download, WalletCards, XCircle } from 'lucide-react';
import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { FtuAmount } from '@/components/ui/FtuAmount';
import { LoadingState, ErrorState, Spinner } from '@/components/ui/Spinner';
import { InternalTransfersTable } from '@/components/wallet/InternalTransfersTable';
import { AddressActivity } from '@/components/wallet/AddressActivity';
import { useAddressAccount, useAddressRoles, AddressRoles } from '@/lib/hooks/useEvmExplorer';
import {
  Direction, InternalCoverage, WalletTx, methodLabel, txFee,
  useAddressInternalTransfers, useAddressSummary, useAddressTransactions, useMethodNames,
} from '@/lib/hooks/useWallet';
import { initialQueryParam } from '@/lib/browserState';
import { downloadCsv } from '@/lib/csv';
import { cn, formatBlockNumber, formatTimestamp, timeAgo } from '@/lib/utils';
import { formatUnits } from 'viem';

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-2.5 border-b border-bg-border last:border-0">
      <span className="w-36 shrink-0 text-xs text-[#64748b]">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

// The link is typed as a path in this app, so no chain string can become it.
type Role = {
  label: string,
  variant: 'purple' | 'cyan' | 'blue' | 'amber' | 'gray',
  href: `/${string}`,
  detail: string,
};

/// Each FileTrust role this address holds, with the screen that shows it.
function rolesOf(address: string, roles: AddressRoles | undefined): Role[] {
  if (!roles) return [];
  const list: Role[] = [];
  if (roles.guardian) {
    list.push({ label: 'Guardian', variant: 'purple', href: `/guardians/${address}`, detail: 'Guardian profile: stake, reputation, DKG and PRE work' });
  }
  if (roles.vaultKeeper) {
    list.push({ label: 'Vault Keeper', variant: 'cyan', href: `/vault-keepers/${address}`, detail: 'Vault Keeper profile: stake, capacity, proofs' });
  }
  if (roles.aclRole === 'data_owner') {
    list.push({ label: 'Data Owner', variant: 'blue', href: `/access/policies?q=${address}`, detail: 'File policies this address owns' });
  }
  if (roles.aclRole === 'requester') {
    list.push({ label: 'Requester', variant: 'amber', href: `/access?q=${address}&view=requests`, detail: 'Access requests this address made' });
  }
  if (roles.contractName) {
    list.push({ label: 'FileTrust contract', variant: 'gray', href: `/contracts/${roles.contractName}`, detail: `${roles.contractName}: ABI, source and bytecode` });
  }
  return list;
}

/// The reason a chain read failed, as the node or the proxy put it.
function errorReason(error: unknown): string {
  const e = error as { shortMessage?: string; details?: string; message?: string } | null;
  const text = [e?.shortMessage, e?.details].filter(Boolean).join(' — ') || e?.message || String(error ?? '');
  return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}

function When({ ts }: { ts?: bigint | string }) {
  if (ts === undefined || ts === null || ts === '') return <span className="text-xs text-[#64748b]">—</span>;
  const value = BigInt(ts);
  return <span className="text-xs text-[#64748b]" title={formatTimestamp(value)}>{timeAgo(value)}</span>;
}

const TABS = ['transactions', 'internal', 'activity'] as const;
type Tab = typeof TABS[number];

function DirectionPicker({ value, onChange }: { value: Direction; onChange: (d: Direction) => void }) {
  return (
    <div className="inline-flex rounded-md border border-bg-border overflow-hidden text-xs">
      {(['all', 'in', 'out'] as const).map(d => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(d)}
          className={cn('px-2.5 py-1 transition-colors', value === d ? 'bg-ft-blue/20 text-ft-blue' : 'text-[#94a3b8] hover:bg-bg-elevated')}
        >
          {d === 'all' ? 'All' : d === 'in' ? 'In' : 'Out'}
        </button>
      ))}
    </div>
  );
}

function CsvButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-md border border-bg-border px-2.5 py-1 text-xs text-[#94a3b8] hover:bg-bg-elevated disabled:opacity-40"
    >
      <Download size={12} /> Download CSV
    </button>
  );
}

/// What an internal list covers, so an empty one is not read as "none".
function coverageNote(coverage: InternalCoverage | undefined, available: boolean): string {
  if (!available || !coverage) return 'FTU paid by contracts needs the explorer database, and this explorer has none.';
  if (!coverage.available) {
    if (coverage.reason === 'unsupported') return 'This chain node cannot trace calls (its debug API is off), so payments made by contracts cannot be listed.';
    if (coverage.reason === 'not-migrated') return 'The explorer database needs an update (npm run db:migrate) before payments made by contracts can be listed.';
    return 'Payments made by contracts have not been read yet. They appear after the next index pass.';
  }
  const gaps = coverage.untracedBlocks > 0
    ? ` ${coverage.untracedBlocks.toLocaleString()} block(s) could not be checked yet and are retried.`
    : '';
  return coverage.complete
    ? `Payments made by contracts, for the whole indexed history.${gaps}`
    : `Payments made by contracts from block ${coverage.tracedFrom ?? '?'}; older blocks are being filled in.${gaps}`;
}

export default function AddressDetailPage() {
  const params = useParams();
  const address = params.address as `0x${string}`;
  const lower = address.toLowerCase();

  const account = useAddressAccount(address);
  const roles = useAddressRoles(address);
  const summary = useAddressSummary(address);
  const methods = useMethodNames();

  const [tab, setTab] = useState<Tab>(() => {
    const asked = initialQueryParam('tab');
    return (TABS as readonly string[]).includes(asked) ? asked as Tab : 'transactions';
  });
  const [txDirection, setTxDirection] = useState<Direction>('all');
  const [internalDirection, setInternalDirection] = useState<Direction>('all');

  const txs = useAddressTransactions(address, txDirection);
  // Read when its tab is opened; the tab's count comes from the summary.
  const internal = useAddressInternalTransfers(address, internalDirection, { enabled: tab === 'internal' });

  if (account.isLoading) return <LoadingState message="Loading address…" />;
  // Only the balance, nonce and code can fail this screen: they are what an
  // address page is. Everything below fails on its own.
  if (account.error || !account.data) {
    return (
      <ErrorState
        message="Could not read this address from the chain"
        detail={account.error ? errorReason(account.error) : undefined}
        retry={() => account.refetch()}
      />
    );
  }
  const data = account.data;
  const roleList = rolesOf(address, roles.data);
  const r = roles.data;
  const s = summary.data;

  const txColumns: Column<WalletTx>[] = [
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
        const label = methodLabel(methods.data, row);
        return (
          <span
            className="inline-block max-w-[9rem] truncate rounded border border-bg-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-[#94a3b8]"
            title={row.selector ? methods.data?.[row.selector]?.signature ?? row.selector : label}
          >
            {label}
          </span>
        );
      },
    },
    { key: 'block', header: 'Block', cell: row => <Hash value={formatBlockNumber(row.blockNumber)} href={`/blocks/${row.blockNumber}`} /> },
    { key: 'age', header: 'Age', cell: row => <When ts={row.blockTimestamp} /> },
    { key: 'from', header: 'From', cell: row => <Hash value={row.from} type="address" href={`/address/${row.from}`} /> },
    {
      key: 'direction', header: '',
      cell: row => {
        const out = row.from.toLowerCase() === lower;
        const inn = row.to?.toLowerCase() === lower;
        if (out && inn) return <Badge label="Self" variant="gray" />;
        return out ? <Badge label="Out" variant="amber" /> : <Badge label="In" variant="green" />;
      },
    },
    {
      key: 'to', header: 'To',
      cell: row => row.to
        ? <Hash value={row.to} type="address" href={`/address/${row.to}`} />
        : <span className="text-xs text-[#64748b]">Contract creation</span>,
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
  ];

  const first = txs.first;
  const txScope = !first ? ''
    : first.source === 'store' ? 'Full chain history, from the index'
    : first.source === 'files' ? 'Recent transactions kept by the index (the explorer has no database for older ones)'
    : `Last ${(first.scannedBlocks ?? 0).toLocaleString()} blocks${first.unreadableBlocks ? ` (${first.unreadableBlocks.toLocaleString()} could not be read)` : ''}, read from the chain (no index available)`;

  const txTotal = s && first?.source === 'store'
    ? Number(txDirection === 'in' ? s.transactions.received : txDirection === 'out' ? s.transactions.sent : s.transactions.total)
    : undefined;
  const internalTotal = s?.internal
    ? (internalDirection === 'in' ? Number(s.internal.received)
      : internalDirection === 'out' ? Number(s.internal.sent)
      : undefined)
    : undefined;
  const internalCount = s?.internal ? Number(s.internal.sent) + Number(s.internal.received) : undefined;

  const exportTransactions = () => downloadCsv(
    `transactions-${lower}.csv`,
    ['Tx Hash', 'Status', 'Method', 'Block', 'Time (UTC)', 'From', 'To', 'Direction', 'Value (FTU)', 'Fee (FTU)'],
    txs.rows.map(row => {
      const fee = txFee(row);
      return [
        row.hash, row.status ?? '', methodLabel(methods.data, row), row.blockNumber.toString(),
        row.blockTimestamp ? new Date(Number(row.blockTimestamp) * 1000).toISOString() : '',
        row.from, row.to ?? '',
        row.from.toLowerCase() === lower ? (row.to?.toLowerCase() === lower ? 'self' : 'out') : 'in',
        formatUnits(row.value, 18), fee === undefined ? '' : formatUnits(fee, 18),
      ];
    }),
  );
  const exportInternal = () => downloadCsv(
    `contract-payments-${lower}.csv`,
    ['Parent Tx Hash', 'Block', 'Time (UTC)', 'From', 'To', 'Direction', 'Value (FTU)', 'Type'],
    internal.rows.map(row => [
      row.transactionHash, row.blockNumber.toString(),
      row.blockTimestamp ? new Date(Number(row.blockTimestamp) * 1000).toISOString() : '',
      row.from, row.to, row.to.toLowerCase() === lower ? 'in' : 'out', formatUnits(row.value, 18), row.callType,
    ]),
  );

  const tabLabel = (t: Tab) => {
    if (t === 'transactions') {
      const n = s ? Number(s.transactions.total) : undefined;
      return `Transactions${n !== undefined ? ` (${n.toLocaleString()}${s?.transactions.capped ? '+' : ''})` : ''}`;
    }
    if (t === 'internal') return `Paid by contracts${internalCount !== undefined ? ` (${internalCount.toLocaleString()}${s?.internal?.capped ? '+' : ''})` : ''}`;
    return 'FileTrust Activity';
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link href="javascript:history.back()" className="inline-flex items-center gap-1.5 text-sm text-[#64748b] hover:text-[#94a3b8] transition-colors">
        <ArrowLeft size={14} /> Back
      </Link>

      <PageHeader
        title={data.label ?? 'Address'}
        subtitle={data.address}
        icon={WalletCards}
        iconColor={data.isContract ? 'text-ft-purple' : 'text-ft-green'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge label={data.isContract ? 'Contract' : 'Account'} variant={data.isContract ? 'purple' : 'green'} dot />
            {roleList.map(role => <Badge key={role.label} label={role.label} variant={role.variant} />)}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <SectionHeader title="Overview" />
          <div className="divide-y divide-bg-border">
            <InfoRow label="FTU balance">
              <FtuAmount wei={data.balance} decimals={8} className="font-mono text-xs text-ft-green" />
              <span className="ml-2 text-[11px] text-[#64748b]">free FTU in this wallet</span>
            </InfoRow>
            {r?.guardian && (
              <InfoRow label="Staked as Guardian">
                <FtuAmount wei={r.guardian.stake} decimals={6} className="font-mono text-xs text-ft-blue" />
                <span className="ml-2 text-[11px] text-[#64748b]">locked, not in the wallet balance</span>
              </InfoRow>
            )}
            {r?.vaultKeeper && (
              <InfoRow label="Staked as Vault Keeper">
                <FtuAmount wei={r.vaultKeeper.stake} decimals={6} className="font-mono text-xs text-ft-blue" />
                <span className="ml-2 text-[11px] text-[#64748b]">locked, not in the wallet balance</span>
              </InfoRow>
            )}
            {r && r.claimableRewards > 0n && (
              <InfoRow label="Rewards to claim">
                <FtuAmount wei={r.claimableRewards} decimals={6} className="font-mono text-xs text-ft-amber" />
                <span className="ml-2 text-[11px] text-[#64748b]">held by RewardManager until claimed</span>
              </InfoRow>
            )}
            <InfoRow label="Address"><Hash value={data.address} type="address" full copyVisible /></InfoRow>
            <InfoRow label="Code size">
              <span className="font-mono text-xs text-[#94a3b8]">
                {data.code && data.code !== '0x' ? `${Math.floor((data.code.length - 2) / 2).toLocaleString()} bytes` : '0 bytes (a wallet, not a contract)'}
              </span>
            </InfoRow>
          </div>
        </div>

        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <SectionHeader title="More info" />
          <div className="divide-y divide-bg-border">
            <InfoRow label="Transactions">
              {s ? (
                <span className="text-xs text-[#94a3b8]">
                  {Number(s.transactions.total).toLocaleString()}{s.transactions.capped ? '+' : ''}
                  <span className="ml-2 text-[#64748b]">
                    ({Number(s.transactions.sent).toLocaleString()} sent, {Number(s.transactions.received).toLocaleString()} received)
                  </span>
                </span>
              ) : (
                <span className="text-xs text-[#94a3b8]">{data.nonce.toLocaleString()} sent</span>
              )}
            </InfoRow>
            <InfoRow label="First activity">
              {s?.firstSeen ? (
                <span className="inline-flex items-center gap-2">
                  <Hash value={s.firstSeen.hash} chars={6} href={`/tx/${s.firstSeen.hash}`} />
                  <When ts={s.firstSeen.blockTimestamp} />
                </span>
              ) : <span className="text-xs text-[#64748b]">{summary.isLoading ? '…' : '—'}</span>}
            </InfoRow>
            <InfoRow label="Last activity">
              {s?.lastSeen ? (
                <span className="inline-flex items-center gap-2">
                  <Hash value={s.lastSeen.hash} chars={6} href={`/tx/${s.lastSeen.hash}`} />
                  <When ts={s.lastSeen.blockTimestamp} />
                </span>
              ) : <span className="text-xs text-[#64748b]">{summary.isLoading ? '…' : '—'}</span>}
            </InfoRow>
            <InfoRow label="Funded by">
              {s?.fundedBy ? (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Hash value={s.fundedBy.from} type="address" href={`/address/${s.fundedBy.from}`} />
                  <FtuAmount wei={BigInt(s.fundedBy.value)} decimals={6} className="font-mono text-xs text-ft-green" />
                  <span className="text-[11px] text-[#64748b]">
                    {s.fundedBy.kind === 'internal' ? 'paid by a contract in' : 'in'}
                  </span>
                  <Hash value={s.fundedBy.hash} chars={6} href={`/tx/${s.fundedBy.hash}`} />
                </span>
              ) : <span className="text-xs text-[#64748b]">{summary.isLoading ? '…' : '—'}</span>}
            </InfoRow>
            <InfoRow label="Nonce">
              <span className="font-mono text-xs text-[#94a3b8]">{data.nonce.toLocaleString()}</span>
              <span className="ml-2 text-[11px] text-[#64748b]">transactions this address has sent</span>
            </InfoRow>
          </div>
          {!s && !summary.isLoading && (
            <p className="mt-2 text-[11px] text-[#64748b]">Counts and first activity need the explorer database.</p>
          )}
        </div>
      </div>

      <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
        <SectionHeader title="On FileTrust" />
        {roles.isLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#64748b]"><Spinner size="sm" /> Reading roles…</div>
        ) : roles.error ? (
          <p className="text-xs text-ft-amber">The roles could not be read from the chain.</p>
        ) : roleList.length === 0 ? (
          <p className="text-xs text-[#64748b]">No FileTrust role: a plain wallet.</p>
        ) : (
          <div className="divide-y divide-bg-border">
            {roleList.map(item => (
              <Link key={item.label} href={item.href} className="flex items-center gap-3 py-2.5 group">
                <Badge label={item.label} variant={item.variant} />
                <span className="text-xs text-[#94a3b8] flex-1">{item.detail}</span>
                <ArrowRight size={14} className="text-[#64748b] group-hover:text-[#94a3b8]" />
              </Link>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-1 border-b border-bg-border mb-4" role="tablist">
          {TABS.map(t => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors',
                tab === t ? 'border-ft-blue text-ft-blue' : 'border-transparent text-[#64748b] hover:text-[#94a3b8]',
              )}
            >
              {tabLabel(t)}
            </button>
          ))}
        </div>

        {tab === 'transactions' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <DirectionPicker value={txDirection} onChange={setTxDirection} />
              <CsvButton onClick={exportTransactions} disabled={txs.rows.length === 0} />
              <span className="text-xs text-[#64748b]">{txScope}</span>
            </div>
            {txs.isLoading ? (
              <LoadingState message="Loading transactions…" />
            ) : txs.error ? (
              <ErrorState message="The transaction list could not be loaded" detail={errorReason(txs.error)} retry={() => txs.refetch()} />
            ) : (
              <DataTable
                columns={txColumns}
                data={txs.rows}
                keyExtractor={row => row.hash}
                pageSize={25}
                emptyMessage={first?.source === 'store'
                  ? (txDirection === 'all' ? 'This address has never sent or received a transaction on this chain' : 'None in this direction')
                  : 'No transactions for this address in this window'}
                hasMore={txs.hasMore}
                onLoadMore={txs.loadMore}
                loadingMore={txs.loadingMore}
                totalHint={txTotal}
              />
            )}
          </div>
        )}

        {tab === 'internal' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <DirectionPicker value={internalDirection} onChange={setInternalDirection} />
              <CsvButton onClick={exportInternal} disabled={internal.rows.length === 0} />
            </div>
            <p className="text-xs text-[#64748b]">
              Rewards, DKG and PRE fees, escrow refunds and returned stake are paid by contracts inside
              transactions, so they are not transactions of their own. {coverageNote(s?.internalCoverage, internal.available)}
            </p>
            {internal.isLoading ? (
              <LoadingState message="Loading payments…" />
            ) : internal.error ? (
              <ErrorState message="The payments could not be loaded" detail={errorReason(internal.error)} retry={() => internal.refetch()} />
            ) : (
              <InternalTransfersTable
                rows={internal.rows}
                address={lower}
                hasMore={internal.hasMore}
                onLoadMore={internal.loadMore}
                loadingMore={internal.loadingMore}
                totalHint={internalDirection === 'all' ? internalCount : internalTotal}
                emptyMessage={internal.available ? 'No contract has paid this address or taken FTU from it' : 'Not available on this explorer'}
              />
            )}
          </div>
        )}

        {tab === 'activity' && <AddressActivity address={lower} emitter={data.isContract} />}
      </div>
    </div>
  );
}
