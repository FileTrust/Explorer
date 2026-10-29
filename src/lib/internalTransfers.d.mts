/// Types for internalTransfers.mjs, which stays plain JavaScript so the indexer
/// can run it directly.

export interface CallFrame {
  type?: string;
  from?: string;
  to?: string;
  value?: string;
  error?: string;
  calls?: CallFrame[];
}

export interface InternalTransfer {
  traceIndex: number;
  from: string;
  to: string;
  value: bigint;
  callType: string;
}

export declare function transfersFromCallTrace(frame: CallFrame | null | undefined): InternalTransfer[];
export declare function isUnsupportedTraceError(error: unknown): boolean;
