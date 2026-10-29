'use client';

import { useQuery } from '@tanstack/react-query';
import { concat, decodeFunctionData, keccak256 } from 'viem';
import { publicClient } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { VKEscrowABI } from '@/lib/abis/VKEscrow';
import { FileRegistrationSCABI } from '@/lib/abis/FileRegistrationSC';
import { useAutoRefreshInterval } from '@/lib/refresh';
import { getIndexedLogs } from '@/lib/indexedLogs';

const ZERO_HASH = '0x0000000000000000000000000000000000000000000000000000000000000000' as `0x${string}`;

export interface VKStorageRelationship {
  paymentCommitment: `0x${string}`;
  registrationCommitment?: `0x${string}`;
  commitmentHash?: `0x${string}`;
  doAddress: `0x${string}`;
  vkAddress?: `0x${string}`;
  amount: bigint;
  serviceStart: bigint;
  serviceEnd: bigint;
  depositBlockNumber?: bigint;
  claimBlockNumber?: bigint;
  depositTxHash?: `0x${string}`;
  claimTxHash?: `0x${string}`;
  status: 'hidden_until_service_end' | 'revealed_claimed' | 'revealed_deletion' | 'reclaimed' | 'refunded_dispute';
  confidence: 'exact_after_reveal' | 'hidden_by_design';
}

function vkEvent(name: string) {
  return VKEscrowABI.find(e => e.name === name)! as any;
}

function isHex32(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function packedHash(...values: `0x${string}`[]): `0x${string}` {
  return keccak256(concat(values));
}

/// `enabled: false` lets a screen that has the indexer's escrow links skip this:
/// it reads every claim on the network back from the node.
export function useVKStorageRelationships({ enabled = true }: { enabled?: boolean } = {}) {
  const refetchInterval = useAutoRefreshInterval();

  return useQuery({
    queryKey: ['vk-storage-relationships'],
    enabled,
    queryFn: async (): Promise<VKStorageRelationship[]> => {
      const [deposits, claims, deletionClaims, reclaims, disputeRefunds] = await Promise.all([
        getIndexedLogs({ address: CONTRACTS.VKEscrow, event: vkEvent('EscrowDeposited') }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.VKEscrow, event: vkEvent('EscrowClaimed') }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.VKEscrow, event: vkEvent('EscrowClaimedOnDeletion') }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.VKEscrow, event: vkEvent('EscrowReclaimed') }).catch(() => []),
        getIndexedLogs({ address: CONTRACTS.VKEscrow, event: vkEvent('EscrowRefundedByDispute') }).catch(() => []),
      ]);

      const byPayment = new Map<string, VKStorageRelationship>();

      for (const log of deposits) {
        const a = (log as any).args;
        const paymentCommitment = a.paymentCommitment as `0x${string}`;
        byPayment.set(paymentCommitment.toLowerCase(), {
          paymentCommitment,
          doAddress: a.depositor,
          amount: BigInt(a.amount ?? 0n),
          serviceStart: 0n,
          serviceEnd: BigInt(a.serviceEnd ?? 0n),
          depositBlockNumber: log.blockNumber ?? 0n,
          depositTxHash: log.transactionHash ?? '0x',
          status: 'hidden_until_service_end',
          confidence: 'hidden_by_design',
        });
      }

      const terminal = [
        ...claims.map(log => ({ log, status: 'revealed_claimed' as const })),
        ...deletionClaims.map(log => ({ log, status: 'revealed_deletion' as const })),
      ];

      for (const item of terminal) {
        const log = item.log;
        const a = (log as any).args;
        const paymentCommitment = a.paymentCommitment as `0x${string}`;
        const key = paymentCommitment.toLowerCase();
        const base = byPayment.get(key);

        let registrationCommitment: `0x${string}` | undefined;
        let commitmentHash: `0x${string}` | undefined;
        let serviceStart = base?.serviceStart ?? 0n;
        let serviceEnd = base?.serviceEnd ?? 0n;
        let amount = base?.amount ?? BigInt(a.amount ?? a.vkAmount ?? 0n);
        let doAddress = base?.doAddress;

        try {
          const tx = await publicClient.getTransaction({ hash: log.transactionHash ?? '0x' });
          const decoded = decodeFunctionData({ abi: VKEscrowABI, data: tx.input });
          if (decoded.functionName === 'claimEscrow' || decoded.functionName === 'claimEscrowOnDeletion') {
            const [nullifier, secret, regNullifier, regSecret, linkNonce] = decoded.args as readonly `0x${string}`[];
            const computedPayment = packedHash(nullifier, secret);
            if (computedPayment.toLowerCase() === key && isHex32(linkNonce)) {
              registrationCommitment = packedHash(regNullifier, regSecret);
              const status = await publicClient.readContract({
                address: CONTRACTS.VKEscrow,
                abi: VKEscrowABI,
                functionName: 'escrowStatus',
                args: [paymentCommitment],
              }).catch(() => undefined);
              if (status) {
                amount = BigInt(status[0] ?? amount);
                serviceStart = BigInt(status[1] ?? serviceStart);
                serviceEnd = BigInt(status[2] ?? serviceEnd);
                doAddress = status[7] as `0x${string}`;
              }

              const resolved = await publicClient.readContract({
                address: CONTRACTS.FileRegistrationSC,
                abi: FileRegistrationSCABI,
                functionName: 'registrationCommitmentToCommitmentHash',
                args: [registrationCommitment],
              }).catch(() => ZERO_HASH);
              if (resolved && resolved !== ZERO_HASH) {
                commitmentHash = resolved as `0x${string}`;
              }
            }
          }
        } catch {
          // If the input cannot be decoded, keep the claim event as an unresolved relationship.
        }

        const record = commitmentHash ? await publicClient.readContract({
          address: CONTRACTS.FileRegistrationSC,
          abi: FileRegistrationSCABI,
          functionName: 'getRecord',
          args: [commitmentHash],
        }).catch(() => undefined) : undefined;

        byPayment.set(key, {
          ...(base ?? {
            paymentCommitment,
            doAddress: doAddress ?? '0x0000000000000000000000000000000000000000',
            amount,
            serviceStart,
            serviceEnd,
          }),
          registrationCommitment,
          commitmentHash,
          vkAddress: ((record as any)?.vkAddress as `0x${string}` | undefined) ?? ((record as any)?.[2] as `0x${string}` | undefined) ?? a.recipient,
          doAddress: doAddress ?? base?.doAddress ?? '0x0000000000000000000000000000000000000000',
          amount,
          serviceStart,
          serviceEnd,
          claimBlockNumber: log.blockNumber ?? 0n,
          claimTxHash: log.transactionHash ?? '0x',
          status: item.status,
          confidence: commitmentHash ? 'exact_after_reveal' : 'hidden_by_design',
        });
      }

      for (const log of reclaims) {
        const a = (log as any).args;
        const key = String(a.paymentCommitment).toLowerCase();
        const base = byPayment.get(key);
        if (base) {
          byPayment.set(key, {
            ...base,
            status: 'reclaimed',
            claimBlockNumber: log.blockNumber ?? 0n,
            claimTxHash: log.transactionHash ?? '0x',
          });
        }
      }

      for (const log of disputeRefunds) {
        const a = (log as any).args;
        const key = String(a.paymentCommitment).toLowerCase();
        const base = byPayment.get(key);
        if (base) {
          byPayment.set(key, {
            ...base,
            status: 'refunded_dispute',
            claimBlockNumber: log.blockNumber ?? 0n,
            claimTxHash: log.transactionHash ?? '0x',
          });
        }
      }

      return [...byPayment.values()].sort((a, b) => {
        const left = b.claimBlockNumber ?? b.depositBlockNumber ?? 0n;
        const right = a.claimBlockNumber ?? a.depositBlockNumber ?? 0n;
        return left > right ? 1 : -1;
      });
    },
    refetchInterval,
    staleTime: 10_000,
  });
}
