'use client';

import { useQuery } from '@tanstack/react-query';
import { decodeEventLog } from 'viem';
import { publicClient } from '@/lib/client';
import { ADDRESS_TO_REGISTRY, EVENT_PURPOSE } from '@/lib/abis/registry';
import { ADDRESS_TO_NAME } from '@/lib/addresses';
import { readPartitionSectorRecords, PartitionSectorRecord } from '@/lib/hooks/useStorage';

export interface DecodedArg {
  name: string;
  type: string;
  value: string;
  raw: any;
}

export interface DecodedEvent {
  contractLabel: string;
  contractAddress: `0x${string}`;
  eventName: string;
  purpose?: string;
  args: DecodedArg[];
  logIndex: number;
  topics: readonly `0x${string}`[];
  data: `0x${string}`;
}

export interface TransactionPartitionSectors {
  partitionKey: `0x${string}`;
  sectors: PartitionSectorRecord[];
}

export interface TransactionDetail {
  hash: `0x${string}`;
  from: `0x${string}`;
  to: `0x${string}` | null;
  toLabel?: string;
  blockNumber: bigint;
  blockTimestamp?: bigint;
  gasUsed: bigint;
  gasLimit: bigint;
  /** What one unit of gas cost, so the fee can be shown; unknown on old rows. */
  gasPrice?: bigint;
  status: 'success' | 'reverted';
  /** False for an indexed row stored before receipts were: its status is not known. */
  statusKnown: boolean;
  value: bigint;
  input: `0x${string}`;
  events: DecodedEvent[];
  partitionSectors: TransactionPartitionSectors[];
  primaryPurpose: string;
  /** Where the answer came from: the index, or the chain for one it does not hold. */
  source: 'index' | 'chain';
  transactionIndex?: number;
  baseFeePerGas?: bigint;
  /** The sender's transactions either side of this one; the index only. */
  senderPrevious?: `0x${string}` | null;
  senderNext?: `0x${string}` | null;
  /** Guardian / Vault Keeper, for the sender and the receiver; the index only. */
  roles?: { from: string[]; to: string[] };
  /** Only on the chain path; the page asks the chain for them when wanted. */
  nonce?: number;
  type?: string;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  contractAddress?: `0x${string}` | null;
}

function formatValue(value: any, type: string): string {
  if (value === undefined || value === null) return '—';
  if (type === 'bool') return value ? 'true' : 'false';
  if (type === 'address') return value as string;
  if (type === 'string') return value as string;
  if (typeof value === 'bigint') {
    if (type.startsWith('bytes')) return value.toString(16).padStart(Number(type.slice(5)) * 2, '0');
    return value.toString();
  }
  if (type.startsWith('bytes') && typeof value === 'string') return value;
  return String(value);
}

/**
 * The transaction, from the index when it holds it.
 *
 * This screen was the last one still asking the chain for its main answer. It
 * works, and it is quick against a local node, and it also means every reader's
 * page load lands on the RPC endpoint the network itself depends on -- which is
 * the thing the rest of the Explorer was built to stop. The store already had
 * the call; migration 012 added what the receipt says about its result.
 *
 * Returns null rather than throwing when the transaction is not indexed. That is
 * ordinary, not exceptional: one newer than the last indexer run, or older than
 * whatever retention keeps. The caller reads the chain for those.
 *
 * Raw topics and data are the one thing lost by not asking the chain. They are
 * not stored, deliberately: three words plus a payload on every log of every
 * event is a great many bytes to keep for a debugging panel, and the decoded
 * arguments above it say the same thing in a readable form. The page renders
 * either way -- that section is simply empty on an indexed transaction. Fetching
 * them lazily would put the chain back in the page load, which is the whole
 * thing being avoided.
 */
async function transactionFromIndex(hash: `0x${string}`): Promise<TransactionDetail | null> {
  const res = await fetch(`/api/index/transaction?hash=${hash}`, { cache: 'default' }).catch(() => null);
  if (!res || !res.ok) return null;
  const row = await res.json().catch(() => null);
  if (!row?.hash) return null;

  const events: DecodedEvent[] = (row.events ?? []).map((event: {
    address: string; contractLabel?: string; contractName?: string;
    name?: string; logIndex?: number; args?: Record<string, unknown>;
  }) => {
    const reg = ADDRESS_TO_REGISTRY.get(String(event.address).toLowerCase());
    const eventDef = (reg?.abi as Array<{ type: string; name?: string; inputs?: Array<{ name: string; type: string }> }> | undefined)
      ?.find(e => e.type === 'event' && e.name === event.name);
    const inputs = eventDef?.inputs ?? [];
    return {
      contractLabel: event.contractLabel ?? event.contractName ?? String(event.address),
      contractAddress: event.address as `0x${string}`,
      eventName: event.name ?? 'Unknown Event',
      purpose: EVENT_PURPOSE[event.name ?? ''],
      args: Object.entries(event.args ?? {}).map(([name, value]) => {
        const type = inputs.find(i => i.name === name)?.type ?? 'unknown';
        return { name, type, value: formatValue(value, type), raw: value };
      }),
      logIndex: Number(event.logIndex ?? 0),
      topics: [],
      data: '0x' as `0x${string}`,
    };
  });

  const to = (row.to ?? null) as `0x${string}` | null;
  const partitionSectors = await partitionSectorsFor(events);

  return {
    hash: row.hash as `0x${string}`,
    from: row.from as `0x${string}`,
    to,
    toLabel: to ? ADDRESS_TO_NAME[to.toLowerCase()] : undefined,
    blockNumber: BigInt(row.blockNumber),
    blockTimestamp: row.blockTimestamp ? BigInt(row.blockTimestamp) : undefined,
    // A row indexed before receipts were collected reports null, which is not
    // the same as a failure -- say nothing rather than say "reverted".
    gasUsed: BigInt(row.gasUsed ?? 0),
    gasLimit: BigInt(row.gas ?? 0),
    gasPrice: row.gasPrice == null ? undefined : BigInt(row.gasPrice),
    status: row.status === null ? 'success' : (row.status === 1 ? 'success' : 'reverted'),
    statusKnown: row.status !== null && row.status !== undefined,
    value: BigInt(row.value ?? 0),
    input: (row.input ?? '0x') as `0x${string}`,
    events,
    partitionSectors,
    source: 'index',
    transactionIndex: row.transactionIndex === undefined ? undefined : Number(row.transactionIndex),
    baseFeePerGas: row.baseFeePerGas == null ? undefined : BigInt(row.baseFeePerGas),
    senderPrevious: row.senderPrevious ?? null,
    senderNext: row.senderNext ?? null,
    roles: row.roles,
    primaryPurpose: events.find(e => e.purpose)?.purpose
      ?? (to && ADDRESS_TO_NAME[to.toLowerCase()]
        ? `Contract Call → ${ADDRESS_TO_NAME[to.toLowerCase()]}`
        : 'Contract Interaction'),
  };
}

/// The partition sectors a transaction touched. Shared by both paths so they
/// cannot disagree about which events count as partition activity.
async function partitionSectorsFor(events: DecodedEvent[]) {
  const partitionEventNames = new Set([
    'PartitionRegistered',
    'PartitionUpdated',
    'PartitionChallengeOpened',
    'PartitionProofSubmitted',
    'PartitionProofSubmittedDeterministic',
  ]);
  const partitionKeys = [...new Set(events
    .filter(e => partitionEventNames.has(e.eventName))
    .map(e => e.args.find(arg => arg.name === 'partitionKey')?.value)
    .filter((value): value is `0x${string}` => /^0x[0-9a-fA-F]{64}$/.test(String(value ?? ''))))];
  return Promise.all(partitionKeys.map(async partitionKey => ({
    partitionKey,
    sectors: await readPartitionSectorRecords(partitionKey).catch(() => []),
  })));
}

export function useTransaction(hash: `0x${string}` | undefined) {
  return useQuery({
    queryKey: ['tx', hash],
    enabled: !!hash,
    queryFn: async (): Promise<TransactionDetail> => {
      if (!hash) throw new Error('No hash');

      const indexed = await transactionFromIndex(hash);
      if (indexed) return indexed;

      // Not indexed: too new, or older than retention. Ask the chain, which is
      // the same thing this did for every transaction until now.
      const [tx, receipt] = await Promise.all([
        publicClient.getTransaction({ hash }),
        publicClient.getTransactionReceipt({ hash }),
      ]);

      let blockTimestamp: bigint | undefined;
      let baseFeePerGas: bigint | undefined;
      try {
        const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
        blockTimestamp = block.timestamp;
        baseFeePerGas = block.baseFeePerGas ?? undefined;
      } catch { /* non-fatal */ }

      const toLabel = tx.to ? (ADDRESS_TO_NAME[tx.to.toLowerCase()] ?? undefined) : undefined;

      const events: DecodedEvent[] = [];

      for (const log of receipt.logs) {
        const reg = ADDRESS_TO_REGISTRY.get(log.address.toLowerCase());
        let decoded: DecodedEvent | null = null;

        if (reg) {
          try {
            const result = decodeEventLog({
              abi: reg.abi as any,
              data: log.data,
              topics: log.topics,
              strict: false,
            }) as { eventName?: string; args?: Record<string, unknown> };

            const eventDef = reg.abi.find((e: any) => e.type === 'event' && e.name === result.eventName);
            const inputs: Array<{ name: string; type: string }> = eventDef?.inputs ?? [];

            const args: DecodedArg[] = Object.entries(result.args ?? {}).map(([k, v]) => {
              const inputDef = inputs.find((i: any) => i.name === k);
              return {
                name: k,
                type: inputDef?.type ?? 'unknown',
                value: formatValue(v, inputDef?.type ?? 'unknown'),
                raw: v,
              };
            });

            decoded = {
              contractLabel: reg.label,
              contractAddress: log.address as `0x${string}`,
              eventName: result.eventName ?? 'Unknown',
              purpose: EVENT_PURPOSE[result.eventName ?? ''],
              args,
              logIndex: log.logIndex ?? 0,
              topics: log.topics,
              data: log.data,
            };
          } catch { /* decode failed — show raw below */ }
        }

        if (!decoded) {
          const fallbackLabel = ADDRESS_TO_NAME[log.address.toLowerCase()] ?? log.address;
          decoded = {
            contractLabel: fallbackLabel,
            contractAddress: log.address as `0x${string}`,
            eventName: 'Unknown Event',
            args: [],
            logIndex: log.logIndex ?? 0,
            topics: log.topics,
            data: log.data,
          };
        }

        events.push(decoded);
      }

      const partitionSectors = await partitionSectorsFor(events);

      // Determine the primary purpose from the first recognized event
      const primaryPurpose =
        events.find(e => e.purpose)?.purpose ??
        (toLabel ? `Contract Call → ${toLabel}` : 'Contract Interaction');

      return {
        hash,
        from: tx.from,
        to: tx.to ?? null,
        toLabel,
        blockNumber: receipt.blockNumber,
        blockTimestamp,
        gasUsed: receipt.gasUsed,
        gasLimit: tx.gas,
        gasPrice: receipt.effectiveGasPrice ?? tx.gasPrice,
        status: receipt.status === 'success' ? 'success' : 'reverted',
        statusKnown: true,
        value: tx.value,
        input: tx.input,
        events,
        partitionSectors,
        primaryPurpose,
        source: 'chain',
        transactionIndex: receipt.transactionIndex,
        baseFeePerGas,
        nonce: tx.nonce,
        type: tx.type,
        maxFeePerGas: tx.maxFeePerGas ?? undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? undefined,
        contractAddress: receipt.contractAddress ?? null,
      };
    },
    retry: false,
  });
}
