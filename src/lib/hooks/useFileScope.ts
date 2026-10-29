'use client';

/// The parts of a file's cycle that are not already a list hook limited to one
/// file: its storage events, its money, its VK storage escrows and the receipts
/// of its transactions. Each reads only what concerns this file -- by its own
/// keys in the store -- instead of the whole network's history.

import { useQuery } from '@tanstack/react-query';
import { encodePacked, keccak256 } from 'viem';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { getIndexedLogs, type DecodedLog } from '@/lib/indexedLogs';
import { fetchIndexPage } from '@/lib/indexedData';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { storageEventRow, type StorageEventRow } from '@/lib/hooks/useStorage';
import { ECONOMIC_EVENT_NAMES, toEconomicEvent, type EconomicEvent } from '@/lib/hooks/useEconomics';
import type { VKStorageRelationship } from '@/lib/hooks/useVKStorageRelationships';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const isAddress = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && value.toLowerCase() !== ZERO_ADDRESS;
const isHash = (value: unknown): value is `0x${string}` =>
  typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

/// Asked in groups small enough for a URL.
const CHUNK = 100;
function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

const asRow = (log: DecodedLog) => ({
  name: log.eventName,
  args: log.args,
  blockNumber: String(log.blockNumber),
  transactionHash: log.transactionHash,
});

export interface FileStorage {
  events: StorageEventRow[];
  /** The piece's partition, once registered. */
  partitionKeys: `0x${string}`[];
  /** The sector named by the piece's sector root, once registered. */
  sectorKeys: `0x${string}`[];
}

/**
 * The storage events of the partition and sector a piece is recorded in.
 *
 * Both keys are the contract's own pure functions of the record -- keccak of the
 * keeper and the deadline and partition index, or of the keeper and the sector
 * root -- so they are computed here and each is one indexed lookup. The screen
 * used to replay every storage event on the network to find them.
 */
export function useFileStorageEvents(record: Record<string, any> | null | undefined) {
  const refetchInterval = useAutoRefreshInterval();
  const vk = record?.vkAddress ?? record?.[2];
  const deadline = record?.deadlineIndex;
  const partition = record?.partitionIndex;
  const sectorRoot = record?.sectorRoot;
  const keys: Array<{ kind: 'partition' | 'sector'; key: `0x${string}` }> = [];
  if (isAddress(vk) && deadline !== undefined && partition !== undefined) {
    keys.push({
      kind: 'partition',
      key: keccak256(encodePacked(['address', 'uint8', 'uint8'], [vk, Number(deadline), Number(partition)])),
    });
  }
  if (isAddress(vk) && isHash(sectorRoot)) {
    keys.push({ kind: 'sector', key: keccak256(encodePacked(['address', 'bytes32'], [vk, sectorRoot])) });
  }

  return useQuery({
    queryKey: ['file-storage-events', keys.map(k => k.key).join(',')],
    enabled: record !== undefined,
    queryFn: async (): Promise<FileStorage> => {
      const storage = CONTRACTS.StorageProofSC.toLowerCase();
      const perKey = await Promise.all(keys.map(({ key }) =>
        getIndexedLogs({ subject: key, shareSubject: true }).catch(() => [] as DecodedLog[])));
      const logs = perKey.map(rows => rows.filter(log => log.address.toLowerCase() === storage));
      // A key counts as linked once the chain has announced it.
      const announced = (i: number, names: string[]) => logs[i].some(log => names.includes(log.eventName ?? ''));
      return {
        events: logs.flat()
          .map(log => storageEventRow(asRow(log)))
          .filter((row): row is StorageEventRow => row !== null)
          .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1)),
        partitionKeys: keys.filter((k, i) => k.kind === 'partition'
          && announced(i, ['PartitionRegistered', 'PartitionDeactivated'])).map(k => k.key),
        sectorKeys: keys.filter((k, i) => k.kind === 'sector'
          && announced(i, ['SectorRegistered'])).map(k => k.key),
      };
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

/// The economic events about one file: everything the store has filed under its
/// id that is a payment, a reward or an escrow movement.
export function useFileEconomicEvents(fileId: `0x${string}`) {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: ['file-economic-events', fileId],
    queryFn: async (): Promise<EconomicEvent[]> => {
      const logs = await getIndexedLogs({ subject: fileId, shareSubject: true }).catch(() => [] as DecodedLog[]);
      return logs
        .filter(log => ECONOMIC_EVENT_NAMES.has(log.eventName ?? ''))
        .map(log => toEconomicEvent(asRow(log)))
        .filter((row): row is EconomicEvent => row !== null)
        .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

interface EscrowLink {
  paymentCommitment: `0x${string}`;
  claimTxHash: `0x${string}`;
  kind: 'claimed' | 'deletion';
  claimBlockNumber: string;
  claimLogIndex: number;
  recipient: `0x${string}` | null;
  registrationCommitment: `0x${string}` | null;
  commitmentHash: `0x${string}` | null;
  vkAddress: `0x${string}` | null;
  amount: string | null;
  serviceStart: string | null;
  serviceEnd: string | null;
  depositor: `0x${string}` | null;
}

async function fetchEscrowLinks(params: { commitment?: string; payments?: string[] }): Promise<EscrowLink[] | null> {
  const payments = params.payments ?? [];
  const groups = payments.length > 0 ? chunks(payments) : [[]];
  const pages = await Promise.all(groups.map((group, i) => fetchIndexPage<EscrowLink>('escrow-links', {
    commitment: i === 0 ? params.commitment : undefined,
    payment: group,
  })));
  if (pages.some(page => page === null)) return null;
  return pages.flatMap(page => page!.rows);
}

/**
 * VK storage escrow relationships, built from one escrow's events and the link
 * the indexer worked out from its claim.
 *
 * The same rules as `useVKStorageRelationships`, which builds them for the whole
 * network: a deposit names the data owner and the amount; a claim, once the
 * indexer has read it back to a registration, names the piece and its keeper;
 * a reclaim or a dispute refund closes it.
 */
export function buildRelationships(logs: DecodedLog[], links: EscrowLink[]): VKStorageRelationship[] {
  const byPayment = new Map<string, VKStorageRelationship>();
  const ordered = [...logs].sort((a, b) => (a.blockNumber === b.blockNumber
    ? a.logIndex - b.logIndex : (a.blockNumber < b.blockNumber ? -1 : 1)));
  const named = (name: string) => ordered.filter(log => log.eventName === name);

  for (const log of named('EscrowDeposited')) {
    const a = log.args as Record<string, any>;
    const paymentCommitment = a.paymentCommitment as `0x${string}`;
    byPayment.set(paymentCommitment.toLowerCase(), {
      paymentCommitment,
      doAddress: a.depositor,
      amount: BigInt(a.amount ?? 0n),
      serviceStart: 0n,
      serviceEnd: BigInt(a.serviceEnd ?? 0n),
      depositBlockNumber: log.blockNumber,
      depositTxHash: log.transactionHash,
      status: 'hidden_until_service_end',
      confidence: 'hidden_by_design',
    });
  }

  // Every claim, whether its event or only its link is at hand: a store built
  // before escrow events were filed by payment still has the links.
  const linkByTx = new Map(links.map(link => [`${link.paymentCommitment.toLowerCase()}:${link.claimTxHash.toLowerCase()}`, link]));
  type Terminal = {
    payment: `0x${string}`; txHash: `0x${string}`; block: bigint; log: number;
    deletion: boolean; claimAmount: bigint; recipient?: `0x${string}`;
  };
  const terminals = new Map<string, Terminal>();
  for (const name of ['EscrowClaimed', 'EscrowClaimedOnDeletion']) {
    for (const log of named(name)) {
      const a = log.args as Record<string, any>;
      const payment = a.paymentCommitment as `0x${string}`;
      terminals.set(`${payment.toLowerCase()}:${log.transactionHash.toLowerCase()}`, {
        payment, txHash: log.transactionHash, block: log.blockNumber, log: log.logIndex,
        deletion: name === 'EscrowClaimedOnDeletion',
        claimAmount: BigInt(a.amount ?? a.vkAmount ?? 0n), recipient: a.recipient,
      });
    }
  }
  for (const link of links) {
    const key = `${link.paymentCommitment.toLowerCase()}:${link.claimTxHash.toLowerCase()}`;
    if (!terminals.has(key)) {
      terminals.set(key, {
        payment: link.paymentCommitment, txHash: link.claimTxHash,
        block: BigInt(link.claimBlockNumber), log: link.claimLogIndex,
        deletion: link.kind === 'deletion', claimAmount: 0n, recipient: link.recipient ?? undefined,
      });
    }
  }
  // Ordinary claims first and deletion claims after, each in chain order -- the
  // order the network-wide builder applies them in, so the same one wins.
  const sorted = [...terminals.entries()].sort(([, a], [, b]) => {
    if (a.deletion !== b.deletion) return a.deletion ? 1 : -1;
    if (a.block !== b.block) return a.block < b.block ? -1 : 1;
    return a.log - b.log;
  });

  for (const [key, item] of sorted) {
    const paymentKey = item.payment.toLowerCase();
    const base = byPayment.get(paymentKey);
    const link = linkByTx.get(key);
    const revealed = Boolean(link?.registrationCommitment);
    let amount = base?.amount ?? item.claimAmount;
    let serviceStart = base?.serviceStart ?? 0n;
    let serviceEnd = base?.serviceEnd ?? 0n;
    let doAddress = base?.doAddress;
    if (revealed && link) {
      if (link.amount !== null) amount = BigInt(link.amount);
      if (link.serviceStart !== null) serviceStart = BigInt(link.serviceStart);
      if (link.serviceEnd !== null) serviceEnd = BigInt(link.serviceEnd);
      if (link.depositor) doAddress = link.depositor;
    }
    const commitmentHash = link?.commitmentHash ?? undefined;
    byPayment.set(paymentKey, {
      ...(base ?? { paymentCommitment: item.payment, doAddress: doAddress ?? ZERO_ADDRESS, amount, serviceStart, serviceEnd }),
      registrationCommitment: link?.registrationCommitment ?? undefined,
      commitmentHash,
      vkAddress: link?.vkAddress ?? item.recipient,
      doAddress: doAddress ?? base?.doAddress ?? ZERO_ADDRESS,
      amount,
      serviceStart,
      serviceEnd,
      claimBlockNumber: item.block,
      claimTxHash: item.txHash,
      status: item.deletion ? 'revealed_deletion' : 'revealed_claimed',
      confidence: commitmentHash ? 'exact_after_reveal' : 'hidden_by_design',
    });
  }

  for (const [name, status] of [['EscrowReclaimed', 'reclaimed'], ['EscrowRefundedByDispute', 'refunded_dispute']] as const) {
    for (const log of named(name)) {
      const key = String((log.args as Record<string, any>).paymentCommitment).toLowerCase();
      const base = byPayment.get(key);
      if (base) {
        byPayment.set(key, { ...base, status, claimBlockNumber: log.blockNumber, claimTxHash: log.transactionHash });
      }
    }
  }

  return [...byPayment.values()].sort((a, b) => {
    const left = b.claimBlockNumber ?? b.depositBlockNumber ?? 0n;
    const right = a.claimBlockNumber ?? a.depositBlockNumber ?? 0n;
    return left > right ? 1 : -1;
  });
}

export interface FileEscrows {
  /** The data owner's escrow deposits inside the file's cycle window. */
  candidateDeposits: EconomicEvent[];
  /** Every event of those escrows, and of any escrow a claim tied to this piece. */
  paymentEvents: EconomicEvent[];
  relationships: VKStorageRelationship[];
  /** False when the store has no escrow links to ask; the caller falls back. */
  linksAvailable: boolean;
}

/**
 * The VK storage escrows of one file.
 *
 * Two ways in, the same two the network-wide view used, each now one or two
 * indexed lookups: the data owner's deposits during this file's cycle (whose
 * keepers stay hidden until they claim), and any claim the indexer has tied to
 * this piece. Each escrow found is then read by its payment commitment.
 */
export function useFileEscrows({ id, doAddress, fromBlock, toBlock, enabled }: {
  id: `0x${string}`;
  doAddress?: `0x${string}`;
  fromBlock: bigint;
  toBlock: bigint;
  enabled: boolean;
}) {
  const refetchInterval = useAutoRefreshInterval();
  return useQuery({
    queryKey: ['file-escrows', id, doAddress ?? '', String(fromBlock), String(toBlock)],
    enabled,
    queryFn: async (): Promise<FileEscrows> => {
      const deposits = isAddress(doAddress)
        ? await getIndexedLogs({
          address: CONTRACTS.VKEscrow,
          eventName: 'EscrowDeposited',
          subject: doAddress,
          // No window at all when the cycle has no dated activity, as before.
          fromBlock: fromBlock > 0n ? fromBlock : undefined,
          toBlock: toBlock > 0n ? toBlock : undefined,
        }).catch(() => [] as DecodedLog[])
        : [];
      const ownDeposits = deposits.filter(log =>
        String((log.args as Record<string, any>).depositor ?? '').toLowerCase() === doAddress?.toLowerCase());
      const candidates = [...new Set(ownDeposits
        .map(log => String((log.args as Record<string, any>).paymentCommitment ?? '').toLowerCase())
        .filter(isHash))];

      const links = await fetchEscrowLinks({ commitment: id, payments: candidates });
      const linkedPayments = (links ?? [])
        .filter(link => link.commitmentHash?.toLowerCase() === id.toLowerCase())
        .map(link => link.paymentCommitment.toLowerCase());
      const payments = [...new Set([...candidates, ...linkedPayments])];

      const escrow = CONTRACTS.VKEscrow.toLowerCase();
      const perPayment = await Promise.all(payments.map(payment =>
        getIndexedLogs({ subject: payment, shareSubject: true }).catch(() => [] as DecodedLog[])));
      const paymentLogs = perPayment.flat().filter(log => log.address.toLowerCase() === escrow);
      // The deposits found by owner, in case the store filed none by payment yet.
      const seen = new Set(paymentLogs.map(log => `${log.transactionHash}:${log.logIndex}`));
      const allLogs = [...paymentLogs, ...ownDeposits.filter(log => !seen.has(`${log.transactionHash}:${log.logIndex}`))];

      const wantedPayments = new Set(payments);
      const relationships = buildRelationships(allLogs, (links ?? []).filter(link =>
        wantedPayments.has(link.paymentCommitment.toLowerCase())));

      return {
        candidateDeposits: ownDeposits.map(log => toEconomicEvent(asRow(log))).filter((row): row is EconomicEvent => row !== null),
        paymentEvents: allLogs.map(log => toEconomicEvent(asRow(log))).filter((row): row is EconomicEvent => row !== null),
        relationships,
        linksAvailable: links !== null,
      };
    },
    refetchInterval,
    staleTime: 10_000,
  });
}

export interface StoredReceipt {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  blockNumber: bigint;
  blockTimestamp?: bigint;
  gasUsed: bigint;
  gasPriceWei: bigint;
  gasFeeWei: bigint;
  eventCount: number;
  status: 'success' | 'reverted';
}

/// One transaction's receipt from the node, for one the store cannot answer.
async function receiptFromChain(hash: `0x${string}`): Promise<StoredReceipt | undefined> {
  try {
    const [tx, receipt] = await Promise.all([
      publicClient.getTransaction({ hash }),
      publicClient.getTransactionReceipt({ hash }),
    ]);
    const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber }).catch(() => undefined);
    const gasPriceWei = BigInt((receipt as any).effectiveGasPrice ?? (tx as any).gasPrice ?? 0n);
    return {
      hash,
      from: tx.from,
      to: tx.to ?? null,
      blockNumber: receipt.blockNumber,
      blockTimestamp: block?.timestamp,
      gasUsed: receipt.gasUsed,
      gasPriceWei,
      gasFeeWei: receipt.gasUsed * gasPriceWei,
      eventCount: receipt.logs.length,
      status: receipt.status === 'success' ? 'success' : 'reverted',
    };
  } catch {
    return undefined;
  }
}

/**
 * Receipts for a file's transactions: from the store in a few requests, and
 * from the node only for any the store does not hold a receipt for.
 */
export async function fetchReceipts(hashes: `0x${string}`[]): Promise<StoredReceipt[]> {
  type Row = {
    hash: `0x${string}`; blockNumber: string; blockTimestamp: string | null;
    from: `0x${string}`; to: `0x${string}` | null; gasUsed: string | null; gasPrice: string | null;
    status: number | null; eventCount: number;
  };
  const stored = new Map<string, StoredReceipt>();
  const pages = await Promise.all(chunks(hashes).map(group => fetchIndexPage<Row>('tx-receipts', { hash: group })));
  for (const row of pages.flatMap(page => page?.rows ?? [])) {
    if (row.status === null || row.gasUsed === null) continue;
    const gasUsed = BigInt(row.gasUsed);
    const gasPriceWei = BigInt(row.gasPrice ?? '0');
    stored.set(row.hash.toLowerCase(), {
      hash: row.hash,
      from: row.from,
      to: row.to,
      blockNumber: BigInt(row.blockNumber),
      blockTimestamp: row.blockTimestamp === null ? undefined : BigInt(row.blockTimestamp),
      gasUsed,
      gasPriceWei,
      gasFeeWei: gasUsed * gasPriceWei,
      eventCount: row.eventCount,
      status: row.status === 1 ? 'success' : 'reverted',
    });
  }
  const missing = hashes.filter(hash => !stored.has(hash.toLowerCase()));
  const fromChain = await Promise.all(missing.map(receiptFromChain));
  return [...stored.values(), ...fromChain.filter((row): row is StoredReceipt => row !== undefined)]
    .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
}
