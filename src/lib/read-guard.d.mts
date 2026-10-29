export declare function createReadGuard(options?: {
  now?: () => number; concurrent?: number; capacity?: number; refill?: number; maxEntries?: number; maxBytes?: number;
}): (request: Request, operation: () => Promise<Response>, options?: {ttlMs?: number; ignoreQuery?: boolean}) => Promise<Response>;
export declare const guardRead: ReturnType<typeof createReadGuard>;
