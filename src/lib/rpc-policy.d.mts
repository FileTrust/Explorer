export declare const MAX_REQUEST_BYTES: number;
export declare const MAX_RESPONSE_BYTES: number;
export declare const MAX_BATCH: number;
export declare class RpcPolicyError extends Error {
  status: number;
  code: number;
  constructor(message: string, status?: number, code?: number);
}
export interface RpcCall {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  // The runtime policy validates the method-specific JSON parameter shapes.
  params: any[];
}
export declare function validateRpcPayload(payload: unknown): { calls: RpcCall[]; batch: boolean };
export declare function boundLogRanges(calls: RpcCall[], latestBlock: unknown): void;
export declare function readLimitedBody(message: Request | Response, maxBytes: number, signal?: AbortSignal): Promise<string>;
export declare function createRpcBudget(options?: {
  now?: () => number; capacity?: number; refill?: number; concurrent?: number;
}): (calls: Array<{ method: string }>) => () => void;
