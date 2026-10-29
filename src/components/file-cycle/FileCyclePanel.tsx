'use client';

import Link from 'next/link';
import { type ReactNode } from 'react';
import { Activity, AlertTriangle, Banknote, Coins, Database, FileKey2, Fuel, KeyRound, LockKeyhole, ReceiptText, Server, type LucideIcon } from 'lucide-react';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash, Address } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { FtuUsdc } from '@/components/ui/FtuAmount';
import { SectionHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { FileLifecycleData, LifecycleReceipt, LifecycleRelationshipRow, LifecycleRow, LifecycleStep } from '@/lib/hooks/useFileLifecycle';
import { cn, formatBlockNumber, formatFtu, formatFullFtu, formatTimestamp } from '@/lib/utils';

function stepStyle(status: LifecycleStep['status']) {
  if (status === 'complete') return { icon: Activity, text: 'text-ft-green', border: 'border-ft-green/25 bg-ft-green/5' };
  if (status === 'active') return { icon: Activity, text: 'text-ft-blue', border: 'border-ft-blue/25 bg-ft-blue/5' };
  if (status === 'warning') return { icon: Activity, text: 'text-ft-amber', border: 'border-ft-amber/25 bg-ft-amber/5' };
  if (status === 'failed') return { icon: Activity, text: 'text-ft-red', border: 'border-ft-red/25 bg-ft-red/5' };
  return { icon: Activity, text: 'text-[#64748b]', border: 'border-bg-border bg-bg-surface' };
}

function FtuValue({ value }: { value: bigint }) {
  return <span title={formatFullFtu(value)}>{formatFtu(value, 4, true)}<FtuUsdc amountWei={value} /></span>;
}

function InfoLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-bg-border py-2 last:border-0">
      <span className="text-xs text-[#64748b]">{label}</span>
      <span className="min-w-0 text-right text-xs font-mono text-[#e2e8f0]">{children}</span>
    </div>
  );
}

function StageCard({
  title,
  icon: Icon,
  children,
  color = 'text-ft-blue',
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-bg-border bg-bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon size={15} className={color} />
        <h3 className="text-sm font-semibold text-[#e2e8f0]">{title}</h3>
      </div>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function txPurpose(data: FileLifecycleData, hash: `0x${string}`): string {
  const direct = data.rows.find(row => row.txHash?.toLowerCase() === hash.toLowerCase());
  if (direct) return direct.type;
  if (data.linkedDkg.some(row => row.materialTxHashes.some(tx => tx.toLowerCase() === hash.toLowerCase()))) return 'DKG Dealer Material';
  if (data.linkedBatches.some(row => row.c1TxHash?.toLowerCase() === hash.toLowerCase())) return 'DataVault Batch C1';
  if (data.linkedBatches.some(row => row.cidTxHashes.some(tx => tx.toLowerCase() === hash.toLowerCase()))) return 'Encrypted CID Pieces';
  if (data.linkedPre.some(row => row.txHashes.some(tx => tx.toLowerCase() === hash.toLowerCase()))) return 'PRE Guardian Action';
  return 'Cycle Transaction';
}

export function FileCyclePanel({ data, commitmentHash }: { data: FileLifecycleData; commitmentHash: `0x${string}` }) {
  const { costSummary, receiptSummary } = data;
  const firstActivity = data.chronologicalRows[0];
  const lastActivity = data.chronologicalRows[data.chronologicalRows.length - 1];
  const pieceEvents = data.linkedBatches.reduce((sum, row) => sum + (row.pieceCount || row.n), 0);
  const fulfilledAccess = data.linkedAccess.filter(row => row.fulfilled).length;
  const prePartials = data.linkedPre.reduce((sum, row) => sum + row.activeGuardians.length, 0);
  const dkgMaterials = data.linkedDkg.reduce((sum, row) => sum + row.dealerCount, 0);
  const revealedStorageLinks = data.relationshipRows.filter(row =>
    row.kind === 'DO-VK' && (row.status === 'exact_after_reveal' || row.status === 'revealed_deletion')
  ).length;
  const deletionRelationshipRows = data.relationshipRows.filter(row => row.kind === 'DO-VK' && row.status === 'revealed_deletion');
  const deletionStorageLinks = deletionRelationshipRows.length;
  const latestDeletionRelationship = [...deletionRelationshipRows].sort((a, b) => {
    const left = b.blockNumber ?? 0n;
    const right = a.blockNumber ?? 0n;
    return left > right ? 1 : -1;
  })[0];
  const hiddenStorageEscrows = data.relationshipRows.filter(row => row.kind === 'DO-VK' && row.status === 'hidden_until_service_end').length;

  const lifecycleColumns: Column<LifecycleRow>[] = [
    {
      key: 'type',
      header: 'Activity',
      sortValue: row => row.type,
      cell: row => <Badge label={row.type} variant={row.variant} />,
    },
    {
      key: 'detail',
      header: 'Detail',
      sortValue: row => row.detail,
      cell: row => row.href ? (
        <Link href={row.href} className="text-xs text-ft-blue hover:text-blue-300">{row.detail}</Link>
      ) : <span className="text-xs text-[#94a3b8]">{row.detail}</span>,
    },
    {
      key: 'block',
      header: 'Block',
      sortValue: row => row.blockNumber,
      cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span>,
    },
    {
      key: 'tx',
      header: 'Tx',
      sortValue: row => row.txHash ?? '',
      cell: row => row.txHash ? <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> : <span className="text-[#64748b]">-</span>,
    },
  ];

  const receiptColumns: Column<LifecycleReceipt>[] = [
    {
      key: 'hash',
      header: 'Tx',
      sortValue: row => row.hash,
      cell: row => <Hash value={row.hash} chars={6} href={`/tx/${row.hash}`} />,
    },
    {
      key: 'purpose',
      header: 'Purpose',
      sortValue: row => txPurpose(data, row.hash),
      cell: row => <Badge label={txPurpose(data, row.hash)} variant={row.status === 'success' ? 'blue' : 'red'} />,
    },
    {
      key: 'from',
      header: 'Sender',
      sortValue: row => row.from,
      cell: row => <Address value={row.from} />,
    },
    {
      key: 'gasFee',
      header: 'Gas / Fee',
      sortValue: row => row.gasFeeWei,
      cell: row => (
        <div className="font-mono text-xs">
          <div className="text-[#94a3b8]">{row.gasUsed.toLocaleString()}</div>
          <div className="text-ft-amber" title={formatFullFtu(row.gasFeeWei)}>{formatFtu(row.gasFeeWei, 6, true)}</div>
        </div>
      ),
    },
    {
      key: 'block',
      header: 'Block',
      sortValue: row => row.blockNumber,
      cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span>,
    },
  ];

  const relationshipColumns: Column<LifecycleRelationshipRow>[] = [
    {
      key: 'kind',
      header: 'Relation',
      sortValue: row => row.kind,
      cell: row => <Badge label={row.kind} variant={row.kind === 'DO-VK' ? 'cyan' : 'purple'} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: row => row.status,
      cell: row => {
        if (row.status === 'revealed_deletion') return <Badge label="Deletion reveal" variant="red" dot />;
        if (row.status === 'exact_after_reveal') return <Badge label="Exact after reveal" variant="green" dot />;
        if (row.status === 'hidden_until_service_end') return <Badge label="VK hidden" variant="amber" dot />;
        return <Badge label="Policy inferred" variant="blue" dot />;
      },
    },
    {
      key: 'parties',
      header: 'Parties',
      sortValue: row => `${row.doAddress ?? ''}-${row.vkAddress ?? ''}-${row.requester ?? ''}`,
      cell: row => (
        <div className="space-y-1 text-xs">
          {row.kind === 'DO-VK' ? (
            <>
              <div className="flex flex-wrap items-center gap-1"><span className="text-[#64748b]">DO</span>{row.doAddress ? <Address value={row.doAddress} /> : <span>-</span>}</div>
              <div className="flex flex-wrap items-center gap-1"><span className="text-[#64748b]">VK</span>{row.vkAddress ? <Address value={row.vkAddress} /> : <span className="text-ft-amber">hidden until claim</span>}</div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1"><span className="text-[#64748b]">VK</span>{row.vkAddress ? <Address value={row.vkAddress} /> : <span>-</span>}</div>
              <div className="flex flex-wrap items-center gap-1"><span className="text-[#64748b]">REQ</span>{row.requester ? <Address value={row.requester} /> : <span>-</span>}</div>
            </>
          )}
        </div>
      ),
    },
    {
      key: 'commitment',
      header: 'Commitment',
      sortValue: row => row.commitmentHash ?? row.paymentCommitment ?? '',
      cell: row => row.commitmentHash
        ? <Hash value={row.commitmentHash} chars={6} href={`/files/${row.commitmentHash}`} />
        : row.paymentCommitment ? <Hash value={row.paymentCommitment} chars={6} /> : <span className="text-[#64748b]">-</span>,
    },
    {
      key: 'amount',
      header: 'Amount',
      sortValue: row => row.amount,
      cell: row => row.amount > 0n ? <span className="font-mono text-xs text-ft-green"><FtuValue value={row.amount} /></span> : <span className="text-[#64748b]">-</span>,
    },
    {
      key: 'tx',
      header: 'Tx',
      sortValue: row => row.txHash ?? '',
      cell: row => row.txHash ? <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> : <span className="text-[#64748b]">-</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bg-border bg-bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Badge label="Cycle Details" variant="green" dot />
          <span className="text-xs text-[#64748b]">Full file activity and cost summary</span>
        </div>
        <Hash value={commitmentHash} chars={10} href={`/files/${commitmentHash}`} />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <StatCard
          title="Full DO+REQ Cost"
          value={<FtuValue value={costSummary.fullCycleCostWei} />}
          subtitle="Net escrows + DO/REQ receipt gas"
          icon={Banknote}
          iconColor="text-ft-green"
          loading={data.receiptsLoading}
          help="Total payer-side cycle cost from escrow events and transaction activity. Rewards are shown separately because they are distributions from escrow/pools."
        />
        <StatCard
          title="DO Cost"
          value={<FtuValue value={(costSummary.policyEscrowDeposited - costSummary.policyEscrowRefunded) + costSummary.vkEscrowDeposited + costSummary.doGasWei} />}
          subtitle="Policy/storage escrow + DO gas"
          icon={FileKey2}
          iconColor="text-ft-blue"
          loading={data.receiptsLoading}
          help="Data-owner cost from policy escrow, candidate VK storage escrow deposits from the selected DO/policy block window, and receipt gas paid by the data-owner address."
        />
        <StatCard
          title="REQ Cost"
          value={<FtuValue value={(costSummary.accessEscrowDeposited - costSummary.accessEscrowRefunded) + costSummary.requesterGasWei} />}
          subtitle={`${costSummary.requesterCount} requester(s)`}
          icon={LockKeyhole}
          iconColor="text-ft-purple"
          loading={data.receiptsLoading}
          help="Requester cost from access escrow minus refunds plus receipt gas paid by requesters seen in access-request events."
        />
        <StatCard
          title="Rewards Credited"
          value={<FtuValue value={costSummary.rewardsCredited} />}
          subtitle={`${costSummary.rewardEventCount} reward event(s)`}
          icon={Coins}
          iconColor="text-ft-amber"
          help="Guardian and VK rewards credited by RewardManager events linked to this file or its access requests."
        />
        <StatCard
          title="Cycle Gas"
          value={<FtuValue value={receiptSummary.gasFeeWei} />}
          subtitle={`${receiptSummary.gasUsed.toLocaleString()} gas used`}
          icon={Fuel}
          iconColor="text-ft-cyan"
          loading={data.receiptsLoading}
          help="Total receipt gas fee for all discovered transactions in this file cycle, including DO, requester, Guardian, and VK senders."
        />
        <StatCard
          title="Cycle Txs"
          value={receiptSummary.txCount.toLocaleString()}
          subtitle={`${receiptSummary.eventCount} receipt event(s)`}
          icon={ReceiptText}
          iconColor="text-ft-blue"
          loading={data.receiptsLoading}
          help="Unique transactions discovered from the file policy, storage, DataVault, DKG, PRE, access, and economics events."
        />
      </div>

      <div className="rounded-xl border border-bg-border bg-bg-surface p-5">
        <SectionHeader title="Full Cycle Steps" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {data.steps.map(step => {
            const style = stepStyle(step.status);
            const Icon = style.icon;
            return (
              <div key={step.key} className={cn('min-h-[122px] rounded-xl border p-3', style.border)}>
                <div className="flex items-center gap-2">
                  <Icon size={15} className={style.text} />
                  <span className="text-sm font-semibold text-[#e2e8f0]">{step.label}</span>
                </div>
                <p className={cn('mt-2 text-xs font-semibold', style.text)}>{step.status}</p>
                <p className="mt-1 text-xs text-[#64748b]">{step.detail}</p>
                {step.txHash && (
                  <div className="mt-2">
                    <Hash value={step.txHash} chars={5} href={`/tx/${step.txHash}`} className="text-xs" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <StageCard title="Policy" icon={FileKey2} color="text-ft-purple">
          <InfoLine label="Mode">{data.policy?.mode ?? 'No policy'}</InfoLine>
          <InfoLine label="Threshold">{data.policy ? `${data.policy.threshold} / ${data.policy.selectedGuardians.length}` : '-'}</InfoLine>
          <InfoLine label="Data Owner">{data.policy?.dataOwner ? <Address value={data.policy.dataOwner} /> : '-'}</InfoLine>
          <InfoLine label="Policy Events">{data.policyEvents.length}</InfoLine>
        </StageCard>

        <StageCard title="Storage" icon={Server} color="text-ft-cyan">
          <InfoLine label="Vault Keeper">{data.record?.vkAddress ? <Address value={data.record.vkAddress} /> : revealedStorageLinks > 0 ? `${revealedStorageLinks} revealed` : hiddenStorageEscrows > 0 ? 'Hidden until claim' : '-'}</InfoLine>
          <InfoLine label="Partition">{data.record ? `DL${data.record.deadlineIndex} / P${data.record.partitionIndex}` : '-'}</InfoLine>
          <InfoLine label="Storage Escrows">{data.linkedVkRelationships.length}</InfoLine>
          <InfoLine label="Revealed DO-VK">{revealedStorageLinks}</InfoLine>
          <InfoLine label="Deletion Reveals">{deletionStorageLinks}</InfoLine>
          <InfoLine label="Proof Events">{data.linkedStorageEvents.filter(row => row.type.includes('Proof')).length}</InfoLine>
          <InfoLine label="Service End">{data.record?.serviceEnd > 0n ? formatTimestamp(data.record.serviceEnd) : '-'}</InfoLine>
        </StageCard>

        <StageCard title="DataVault" icon={Database} color="text-ft-blue">
          <InfoLine label="Batches">{data.linkedBatches.length}</InfoLine>
          <InfoLine label="Piece Events">{pieceEvents}</InfoLine>
          <InfoLine label="IDA">{data.linkedBatches[0] ? `N${data.linkedBatches[0].n}:T${data.linkedBatches[0].t}` : '-'}</InfoLine>
          <InfoLine label="Data Owner">{data.linkedBatches[0]?.dataOwner ? <Address value={data.linkedBatches[0].dataOwner} /> : '-'}</InfoLine>
        </StageCard>

        <StageCard title="DKG" icon={KeyRound} color="text-ft-amber">
          <InfoLine label="Sessions">{data.linkedDkg.length}</InfoLine>
          <InfoLine label="Finalized">{data.linkedDkg.filter(row => row.status === 'finalized').length}</InfoLine>
          <InfoLine label="Dealer Materials">{dkgMaterials}</InfoLine>
          <InfoLine label="Latest N/T">{data.linkedDkg[0]?.n && data.linkedDkg[0]?.t ? `N${data.linkedDkg[0].n}:T${data.linkedDkg[0].t}` : '-'}</InfoLine>
        </StageCard>

        <StageCard title="Access / PRE" icon={LockKeyhole} color="text-ft-green">
          <InfoLine label="Access Requests">{data.linkedAccess.length}</InfoLine>
          <InfoLine label="Fulfilled">{fulfilledAccess}</InfoLine>
          <InfoLine label="PRE Requests">{data.linkedPre.length}</InfoLine>
          <InfoLine label="PRE Partials">{prePartials}</InfoLine>
        </StageCard>

        <StageCard title="Economics" icon={Banknote} color="text-ft-green">
          <InfoLine label="Policy Escrow"><FtuValue value={costSummary.policyEscrowDeposited - costSummary.policyEscrowRefunded} /></InfoLine>
          <InfoLine label="Access Escrow"><FtuValue value={costSummary.accessEscrowDeposited - costSummary.accessEscrowRefunded} /></InfoLine>
          <InfoLine label="VK Escrow"><FtuValue value={costSummary.vkEscrowDeposited} /></InfoLine>
          <InfoLine label="Other Gas"><FtuValue value={costSummary.otherGasWei} /></InfoLine>
        </StageCard>

        <StageCard title="Deletion" icon={AlertTriangle} color="text-ft-red">
          <InfoLine label="File Declared">{data.fileEvents.deletionDeclared.length}</InfoLine>
          <InfoLine label="File Confirmed">{data.fileEvents.deletionConfirmed.length}</InfoLine>
          <InfoLine label="Piece Claims">{deletionStorageLinks}</InfoLine>
          <InfoLine label="Latest Tx">{latestDeletionRelationship?.txHash ? <Hash value={latestDeletionRelationship.txHash} chars={6} href={`/tx/${latestDeletionRelationship.txHash}`} /> : '-'}</InfoLine>
        </StageCard>
      </div>

      <div>
        <SectionHeader title="DO / VK / REQ Relationships" count={data.relationshipRows.length} />
        <DataTable
          columns={relationshipColumns}
          data={data.relationshipRows}
          keyExtractor={row => `${row.kind}-${row.status}-${row.paymentCommitment ?? row.commitmentHash ?? ''}-${row.requester ?? row.vkAddress ?? ''}`}
          pageSize={12}
          emptyMessage="No DO/VK/REQ relationship can be derived for this cycle"
        />
      </div>

      <div>
        <SectionHeader title="Transaction Receipts" count={receiptSummary.txCount} />
        <DataTable
          columns={receiptColumns}
          data={receiptSummary.receipts}
          keyExtractor={row => row.hash}
          loading={data.receiptsLoading}
          pageSize={20}
          emptyMessage="No transactions were discovered for this cycle"
        />
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionHeader title="Chronological File Cycle" count={data.chronologicalRows.length} className="mb-0" />
          {firstActivity && lastActivity && (
            <span className="text-xs text-[#64748b]">
              {formatBlockNumber(firstActivity.blockNumber)} {'->'} {formatBlockNumber(lastActivity.blockNumber)}
            </span>
          )}
        </div>
        <DataTable
          columns={lifecycleColumns}
          data={data.chronologicalRows}
          keyExtractor={row => `${row.type}-${row.blockNumber}-${row.txHash ?? row.detail}`}
          pageSize={30}
          emptyMessage="No linked cycle activity found"
        />
      </div>
    </div>
  );
}
