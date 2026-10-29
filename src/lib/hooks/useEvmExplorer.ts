'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { getNativeBalance, publicClient } from '@/lib/client';
import { ADDRESS_TO_NAME, CONTRACTS, CONTRACT_LABELS, ContractName } from '@/lib/addresses';
import { GuardianRegistryABI } from '@/lib/abis/GuardianRegistry';
import { VaultKeeperRegistryABI } from '@/lib/abis/VaultKeeperRegistry';
import { AccessControlFTABI } from '@/lib/abis/AccessControlFT';
import { RewardManagerABI } from '@/lib/abis/RewardManager';
import { fetchIndexPage, fetchIndexedTransactions, toBigInt, type IndexedBlock } from '@/lib/indexedData';
import { useAutoRefreshInterval } from '@/lib/refresh';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export interface EvmBlockSummary {
  number: bigint;
  hash: `0x${string}`;
  parentHash: `0x${string}`;
  timestamp: bigint;
  miner: `0x${string}`;
  gasUsed: bigint;
  gasLimit: bigint;
  txCount: number;
  size?: bigint;
  baseFeePerGas?: bigint;
  /** What the block's transactions paid in fees: from the explorer database
   *  only, and null there when it is missing a receipt to add up. */
  feesWei?: bigint | null;
}

export interface EvmTxSummary {
  hash: `0x${string}`;
  blockNumber: bigint;
  blockTimestamp?: bigint;
  from: `0x${string}`;
  to: `0x${string}` | null;
  value: bigint;
  gas: bigint;
  gasPrice?: bigint;
  input: `0x${string}`;
}

export interface EvmContractSummary {
  name: string;
  label: string;
  address: `0x${string}`;
  group: string;
}

function toBlockSummary(block: any): EvmBlockSummary {
  return {
    number: block.number ?? 0n,
    hash: block.hash ?? ZERO_HASH,
    parentHash: block.parentHash ?? ZERO_HASH,
    timestamp: block.timestamp ?? 0n,
    miner: block.miner ?? block.author ?? '0x0000000000000000000000000000000000000000',
    gasUsed: block.gasUsed ?? 0n,
    gasLimit: block.gasLimit ?? 0n,
    txCount: Array.isArray(block.transactions) ? block.transactions.length : 0,
    size: block.size,
    baseFeePerGas: block.baseFeePerGas ?? undefined,
  };
}

function indexedBlockToSummary(block: IndexedBlock): EvmBlockSummary {
  return {
    number: toBigInt(block.number),
    hash: block.hash,
    parentHash: block.parentHash,
    timestamp: toBigInt(block.timestamp),
    miner: block.miner,
    gasUsed: toBigInt(block.gasUsed),
    gasLimit: toBigInt(block.gasLimit),
    txCount: block.transactionCount,
    size: block.size === undefined || block.size === null ? undefined : toBigInt(block.size),
    baseFeePerGas: block.baseFeePerGas === undefined || block.baseFeePerGas === null ? undefined : toBigInt(block.baseFeePerGas),
    feesWei: block.feesWei === undefined ? undefined : block.feesWei === null ? null : toBigInt(block.feesWei),
  };
}

function toTxSummary(tx: any, timestamp?: bigint): EvmTxSummary {
  return {
    hash: tx.hash,
    blockNumber: tx.blockNumber ?? 0n,
    blockTimestamp: timestamp,
    from: tx.from,
    to: tx.to ?? null,
    value: tx.value ?? 0n,
    gas: tx.gas ?? 0n,
    gasPrice: tx.gasPrice,
    input: tx.input ?? '0x',
  };
}

/** How many blocks the list reads at a time. */
export const BLOCK_PAGE_SIZE = 50;

/**
 * The newest blocks, a page at a time.
 *
 * From the explorer index when it has them -- with each block's fees, which the
 * chain cannot give without reading every receipt -- and otherwise from the
 * chain, walking down from its newest block. Either way "load more" continues
 * below the oldest row shown, on the chain where the index ends. The chain's
 * pages carry a `chain:` cursor, which tells them apart from the index's.
 */
export function useBlockList(pageSize = BLOCK_PAGE_SIZE) {
  const refetchInterval = useAutoRefreshInterval();

  return useInfiniteQuery({
    queryKey: ['evm-block-list', pageSize],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!pageParam?.startsWith('chain:')) {
        const page = await fetchIndexPage<IndexedBlock>('blocks', { limit: pageSize, cursor: pageParam });
        // An index with no blocks yet is a fresh one; the chain still has them.
        if (page && (page.rows.length > 0 || pageParam)) {
          const rows = page.rows.map(indexedBlockToSummary);
          // Where the index ends -- the file index keeps a recent window, the
          // database starts where indexing did -- the chain goes on below it.
          const oldest = rows[rows.length - 1]?.number;
          const nextCursor = page.nextCursor ?? (oldest !== undefined && oldest > 0n ? `chain:${oldest - 1n}` : null);
          return { rows, nextCursor, source: 'index' as const };
        }
      }
      const top = pageParam?.startsWith('chain:') ? BigInt(pageParam.slice('chain:'.length)) : await publicClient.getBlockNumber();
      const count = top + 1n < BigInt(pageSize) ? top + 1n : BigInt(pageSize);
      const numbers = Array.from({ length: Number(count) }, (_, i) => top - BigInt(i));
      const blocks = await Promise.all(numbers.map(blockNumber => publicClient.getBlock({ blockNumber })));
      // A Cosmos node answers block 0 with block 1; keep only the block asked for.
      const rows = blocks.filter((block, i) => block.number === numbers[i]).map(toBlockSummary);
      const lowest = numbers[numbers.length - 1];
      return {
        rows,
        nextCursor: lowest !== undefined && lowest > 0n ? `chain:${lowest - 1n}` : null,
        source: 'chain' as const,
      };
    },
    getNextPageParam: last => last.nextCursor ?? undefined,
    refetchInterval,
    staleTime: 6_000,
  });
}

/** How many transactions the list asks for at a time.
 *
 *  It used to ask for 1,250 to show 30 -- 2.4 MB for a screenful, and the same
 *  cost again on every refresh. A page is what the table displays plus enough to
 *  page through a few times without waiting; the rest arrives if it is wanted. */
export const TX_PAGE_SIZE = 100;

/** An indexed transaction row to the shape the table reads. Distinct from
 *  toTxSummary above, which converts one the chain returned: that one already
 *  holds bigints, this one holds the digits JSON carried them as. */
function indexedTxToSummary(tx: {
  hash: `0x${string}`; blockNumber: string; blockTimestamp?: string;
  from: `0x${string}`; to: `0x${string}` | null; value: string; gas: string;
  gasPrice?: string; input: `0x${string}`;
}): EvmTxSummary {
  return {
    hash: tx.hash,
    blockNumber: toBigInt(tx.blockNumber),
    blockTimestamp: tx.blockTimestamp ? toBigInt(tx.blockTimestamp) : undefined,
    from: tx.from,
    to: tx.to ?? null,
    value: toBigInt(tx.value),
    gas: toBigInt(tx.gas),
    gasPrice: tx.gasPrice ? toBigInt(tx.gasPrice) : undefined,
    input: tx.input,
  };
}

/**
 * Transactions a page at a time, continuing from a cursor.
 *
 * Returns null while there is no store to page through, so the caller falls back
 * to the whole-list hook and an Explorer without a database behaves as it did.
 */
export function usePagedTransactions(pageSize = TX_PAGE_SIZE) {
  const refetchInterval = useAutoRefreshInterval();

  return useInfiniteQuery({
    queryKey: ['evm-transactions-paged', pageSize],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const page = await fetchIndexPage<{
        hash: `0x${string}`; blockNumber: string; blockTimestamp?: string;
        from: `0x${string}`; to: `0x${string}` | null; value: string; gas: string;
        gasPrice?: string; input: `0x${string}`;
      }>('transactions', { limit: pageSize, withBlockTime: '1', cursor: pageParam });
      if (!page) return { rows: [] as EvmTxSummary[], nextCursor: null };
      return { rows: page.rows.map(indexedTxToSummary), nextCursor: page.nextCursor };
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval,
    staleTime: 10_000,
  });
}

export function useRecentTransactions(blockCount = 25) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['evm-transactions', blockCount],
    queryFn: async (): Promise<EvmTxSummary[]> => {
      // Only as many transactions as the table shows, with each row's block time
      // joined on by the route. Looking the times up here meant downloading every
      // block the index holds to read one field from a few of them.
      const indexedTxs = await fetchIndexedTransactions(blockCount * 25, true);
      if (indexedTxs?.length) {
        return indexedTxs
          .slice(0, blockCount * 25)
          .map(tx => ({
            hash: tx.hash,
            blockNumber: toBigInt(tx.blockNumber),
            blockTimestamp: tx.blockTimestamp ? toBigInt(tx.blockTimestamp) : undefined,
            from: tx.from,
            to: tx.to ?? null,
            value: toBigInt(tx.value),
            gas: toBigInt(tx.gas),
            gasPrice: tx.gasPrice ? toBigInt(tx.gasPrice) : undefined,
            input: tx.input,
          }))
          .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
      }

      const latest = await publicClient.getBlockNumber();
      const count = Number(latest < BigInt(blockCount) ? latest + 1n : BigInt(blockCount));
      const blocks = await Promise.all(
        Array.from({ length: count }, (_, i) => latest - BigInt(i)).map(blockNumber =>
          publicClient.getBlock({ blockNumber, includeTransactions: true })
        )
      );

      return blocks
        .flatMap(block => (block.transactions as any[]).map(tx => toTxSummary(tx, block.timestamp)))
        .sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
    },
    refetchInterval,
    staleTime: 6_000,
  });
}

/**
 * What an address is now: its FTU balance, nonce and code.
 *
 * Kept apart from the history and the roles below. The address screen used to
 * load all of it as one query, so whichever part failed -- a store query, or one
 * of the 250 blocks the fallback reads over RPC on a busy chain -- turned the
 * whole screen into "Could not read this address from the chain" while the
 * balance had been read perfectly well. These three reads are the only ones the
 * screen cannot do without.
 */
export function useAddressAccount(address: `0x${string}` | undefined) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['evm-address-account', address?.toLowerCase()],
    enabled: !!address,
    queryFn: async () => {
      if (!address) throw new Error('Missing address');
      const normalized = address.toLowerCase() as `0x${string}`;
      const [balance, nonce, code] = await Promise.all([
        getNativeBalance(normalized),
        publicClient.getTransactionCount({ address: normalized }),
        publicClient.getBytecode({ address: normalized }),
      ]);
      return {
        address,
        label: ADDRESS_TO_NAME[normalized],
        balance,
        nonce,
        code,
        isContract: !!code && code !== '0x',
      };
    },
    retry: 1,
    refetchInterval,
  });
}

export interface AddressHistory {
  transactions: EvmTxSummary[];
  /**
   * Where the list came from, which is what it covers: 'store' is all of
   * history; 'files' is the recent transactions the file index keeps; 'scan' is
   * a window of recent blocks read from the chain.
   */
  source: 'store' | 'files' | 'scan';
  scannedBlocks?: number;
  /** Blocks the scan could not read; the list is then missing what they held. */
  unreadableBlocks?: number;
}

/// The old behaviour, kept for a deployment with no index behind it. Bounded and
/// recent by construction; that is the trade for needing no store at all. The
/// wallet screen pages the index (useWallet.ts) and comes here only without one.
///
/// Read a few blocks at a time rather than all at once, and a block that cannot
/// be read is counted and skipped rather than failing the list: every block used
/// to be requested in one `Promise.all`, so on a busy chain one slow block lost
/// all the others. Only when no block at all can be read is it an error.
const SCAN_BATCH = 20;

export async function scanRecentBlocksFor(normalized: string, depth: number): Promise<AddressHistory> {
  const latest = await publicClient.getBlockNumber();
  const count = Number(latest < BigInt(depth) ? latest + 1n : BigInt(depth));
  const numbers = Array.from({ length: count }, (_, i) => latest - BigInt(i));
  const transactions: EvmTxSummary[] = [];
  let unreadable = 0;
  for (let i = 0; i < numbers.length; i += SCAN_BATCH) {
    const settled = await Promise.allSettled(numbers.slice(i, i + SCAN_BATCH).map(blockNumber =>
      publicClient.getBlock({ blockNumber, includeTransactions: true })
    ));
    for (const result of settled) {
      if (result.status === 'rejected') { unreadable += 1; continue; }
      const block = result.value;
      for (const tx of block.transactions as any[]) {
        const summary = toTxSummary(tx, block.timestamp);
        if (summary.from.toLowerCase() === normalized || summary.to?.toLowerCase() === normalized) {
          transactions.push(summary);
        }
      }
    }
  }
  if (count > 0 && unreadable === count) throw new Error('No block could be read from the chain');
  transactions.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
  return { source: 'scan', transactions, scannedBlocks: count, unreadableBlocks: unreadable };
}

/** What an address is on FileTrust, beside being a wallet. */
export interface AddressRoles {
  guardian: { stake: bigint; active: boolean } | null;
  vaultKeeper: { stake: bigint; active: boolean } | null;
  /** From AccessControlFT: a data owner once it creates a file policy, a requester once allowed to read one. */
  aclRole: 'data_owner' | 'requester' | 'shareholder' | null;
  /** DKG/PRE fees RewardManager holds for this address until it claims them. */
  claimableRewards: bigint;
  /** The deployment's own name for this address, when it is one of its contracts. */
  contractName: string | null;
}

const ACL_ROLES: Record<number, AddressRoles['aclRole']> = { 1: 'shareholder', 2: 'data_owner', 3: 'requester' };
const isDeployed = (address: string) => /^0x[0-9a-fA-F]{40}$/.test(address) && !/^0x0{40}$/i.test(address);

/// Each read stands alone: a contract this deployment lacks, or a read that
/// fails, leaves that one role unknown rather than failing the others.
export function useAddressRoles(address: `0x${string}` | undefined) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['evm-address-roles', address?.toLowerCase()],
    enabled: !!address,
    queryFn: async (): Promise<AddressRoles> => {
      if (!address) throw new Error('Missing address');
      const normalized = address.toLowerCase() as `0x${string}`;
      const read = <T,>(contract: string, abi: readonly unknown[], functionName: string): Promise<T | null> =>
        isDeployed(contract)
          ? (publicClient.readContract({
              address: contract as `0x${string}`, abi: abi as any, functionName, args: [normalized],
            }) as Promise<T>).catch(() => null)
          : Promise.resolve(null);

      const [guardian, vaultKeeper, aclRole, claimable] = await Promise.all([
        read<any>(CONTRACTS.GuardianRegistry, GuardianRegistryABI, 'getGuardian'),
        read<any>(CONTRACTS.VaultKeeperRegistry, VaultKeeperRegistryABI, 'getVaultKeeper'),
        read<number | bigint>(CONTRACTS.AccessControlFT, AccessControlFTABI, 'getRole'),
        read<bigint>(CONTRACTS.RewardManager, RewardManagerABI, 'claimableReward'),
      ]);
      const contractName = (Object.entries(CONTRACTS) as Array<[string, string]>)
        .find(([, contractAddress]) => contractAddress.toLowerCase() === normalized)?.[0] ?? null;

      return {
        guardian: guardian && BigInt(guardian.registeredAt ?? 0n) > 0n
          ? { stake: BigInt(guardian.stake ?? 0n), active: Boolean(guardian.active) }
          : null,
        vaultKeeper: vaultKeeper && BigInt(vaultKeeper.registeredAt ?? 0n) > 0n
          ? { stake: BigInt(vaultKeeper.stake ?? 0n), active: Boolean(vaultKeeper.active) }
          : null,
        aclRole: aclRole === null ? null : ACL_ROLES[Number(aclRole)] ?? null,
        claimableRewards: claimable ?? 0n,
        contractName,
      };
    },
    retry: 1,
    refetchInterval,
  });
}

/// One address's FTU balance, for the Guardian and Vault Keeper screens: their
/// profile shows the stake, which is locked, and this is what the wallet holds.
export function useWalletBalance(address: `0x${string}` | undefined) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['evm-wallet-balance', address?.toLowerCase()],
    enabled: !!address,
    queryFn: () => getNativeBalance(address!),
    refetchInterval,
  });
}

export function useKnownContracts() {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['evm-known-contracts'],
    queryFn: async (): Promise<EvmContractSummary[]> => {
      // From the deployment, not from a map kept by hand. That map held twenty
      // of the eighty-four contracts this deployment puts on the chain, so the
      // screen meant to show what the protocol is made of showed a quarter of
      // it.
      //
      // No per-contract chain read either. Balance and code status cost two
      // calls each, which was tolerable for twenty and is a hundred and
      // sixty-eight for eighty-four -- on a page that is a directory. Both are
      // on the contract's own page, one contract at a time, where they are worth
      // fetching.
      const res = await fetch('/api/contracts', { cache: 'no-store' }).catch(() => null);
      if (res?.ok) {
        const body = await res.json().catch(() => null);
        if (Array.isArray(body?.rows) && body.rows.length > 0) return body.rows;
      }
      // The deployment file is not readable from here: fall back to the names
      // compiled into the bundle rather than showing nothing.
      // A contract this deployment does not have carries the zero address; it is not listed.
      return (Object.entries(CONTRACTS) as Array<[ContractName, `0x${string}`]>)
        .filter(([, address]) => !/^0x0{40}$/i.test(address))
        .map(([name, address]) => ({
          name,
          label: CONTRACT_LABELS[name],
          address,
          group: 'Protocol',
        }));
    },
    refetchInterval,
  });
}
