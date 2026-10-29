import type { Abi } from 'viem';

export interface BalanceChange {
  /** Null for the fee row: the fee goes to the validators, not to one address. */
  address: string | null;
  feePool?: true;
  change: bigint;
}

export declare function balanceChanges(input: {
  from: string;
  to: string | null;
  value: bigint | string;
  fee: bigint | string | undefined;
  failed: boolean;
  payments?: Array<{ from: string; to: string; value: bigint | string }>;
}): BalanceChange[];

export declare function stateChangesFromDiff(diff: unknown): Array<{
  address: `0x${string}`;
  nonce: { before: number; after: number } | null;
  balance: { before: bigint; after: bigint } | null;
  created: boolean;
  storage: Array<{ slot: `0x${string}`; before: `0x${string}`; after: `0x${string}` }>;
}>;

export declare function describeFailure(frame: unknown, errorsAbi?: Abi): { error: string; reason: string | null } | null;
