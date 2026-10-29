'use client';

/// What the transaction page shows beyond the transaction itself, each read only
/// when it is wanted: the fields the index does not keep (when "More Details" is
/// opened), why a failed transaction failed, and what it changed (the State
/// tab). The page itself still loads from the index alone.

import { useQuery } from '@tanstack/react-query';
import type { Abi, AbiItem } from 'viem';
import { publicClient } from '@/lib/client';
import { ABI_REGISTRY } from '@/lib/abis/registry';
import { describeFailure, stateChangesFromDiff } from '@/lib/txState.mjs';
import { isUnsupportedTraceError } from '@/lib/internalTransfers.mjs';

/// The custom errors the deployed contracts define, gathered once.
let errorsAbi: Abi | null = null;
function knownErrors(): Abi {
  if (!errorsAbi) {
    const seen = new Set<string>();
    errorsAbi = ABI_REGISTRY
      .flatMap(entry => (entry.abi as readonly AbiItem[]).filter(item => item.type === 'error'))
      .filter((item) => {
        const key = JSON.stringify(item);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }) as Abi;
  }
  return errorsAbi;
}

export interface TxChainExtras {
  nonce: number;
  type: string;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}

/// Nonce, type and fee caps: on the chain, not in the index.
export function useTxChainExtras(hash: `0x${string}` | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['tx-chain-extras', hash?.toLowerCase()],
    enabled: enabled && !!hash,
    queryFn: async (): Promise<TxChainExtras> => {
      const tx = await publicClient.getTransaction({ hash: hash! });
      return {
        nonce: tx.nonce,
        type: tx.type,
        maxFeePerGas: tx.maxFeePerGas ?? undefined,
        maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? undefined,
      };
    },
    staleTime: Infinity,
    retry: false,
  });
}

/// The receipt, for what an indexed row can lack: the address a contract
/// creation made, and the outcome of a row stored before receipts were.
export function useTxReceipt(hash: `0x${string}` | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['tx-receipt', hash?.toLowerCase()],
    enabled: enabled && !!hash,
    queryFn: async () => {
      const receipt = await publicClient.getTransactionReceipt({ hash: hash! });
      return {
        status: receipt.status === 'success' ? 'success' as const : 'reverted' as const,
        contractAddress: receipt.contractAddress ?? null,
      };
    },
    staleTime: Infinity,
    retry: false,
  });
}

export type TraceAnswer<T> = { available: true; value: T } | { available: false; reason: string };

async function trace(hash: string, tracer: Record<string, unknown>): Promise<TraceAnswer<unknown>> {
  try {
    const frame = await publicClient.request({
      method: 'debug_traceTransaction' as any,
      params: [hash, tracer] as any,
    });
    return { available: true, value: frame };
  } catch (error) {
    return {
      available: false,
      reason: isUnsupportedTraceError(error)
        ? 'this chain node does not replay transactions'
        : 'the chain node did not answer',
    };
  }
}

/// Why a failed transaction failed: the node replays only its top call.
export function useTxFailure(hash: `0x${string}` | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['tx-failure', hash?.toLowerCase()],
    enabled: enabled && !!hash,
    queryFn: async (): Promise<TraceAnswer<{ error: string; reason: string | null } | null>> => {
      const answer = await trace(hash!, { tracer: 'callTracer', tracerConfig: { onlyTopCall: true } });
      if (!answer.available) return answer;
      return { available: true, value: describeFailure(answer.value, knownErrors()) };
    },
    staleTime: Infinity,
    retry: false,
  });
}

export interface StorageChange { slot: `0x${string}`; before: `0x${string}`; after: `0x${string}` }
export interface AccountChange {
  address: `0x${string}`;
  nonce: { before: number; after: number } | null;
  balance: { before: bigint; after: bigint } | null;
  created: boolean;
  storage: StorageChange[];
}

/// The accounts the transaction changed, from the node's state-diff replay.
export function useTxStateDiff(hash: `0x${string}` | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['tx-state-diff', hash?.toLowerCase()],
    enabled: enabled && !!hash,
    queryFn: async (): Promise<TraceAnswer<AccountChange[]>> => {
      const answer = await trace(hash!, { tracer: 'prestateTracer', tracerConfig: { diffMode: true } });
      if (!answer.available) return answer;
      return { available: true, value: stateChangesFromDiff(answer.value) as AccountChange[] };
    },
    staleTime: Infinity,
    retry: false,
  });
}
