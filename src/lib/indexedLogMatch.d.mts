/// Types for the matcher. The implementation is plain JavaScript so that it can
/// be run directly by the test runner, without a TypeScript build step that this
/// project does not have.
export declare function sameValue(actual: unknown, wanted: unknown): boolean;
export declare function matchesArgs(
  args: Record<string, unknown>,
  wanted?: Record<string, unknown>,
): boolean;
export declare function windowStart(head: bigint, size: bigint): bigint;
export declare function reviveBigInts(value: unknown): unknown;
export declare function reviveArgs(
  args?: Record<string, unknown>,
): Record<string, unknown>;
export declare const SUBJECT_ADDRESS_ARGS: string[];
export declare const SUBJECT_KEY_ARGS: string[];
export declare function subjectFromArgs(args?: Record<string, unknown>): string | null;
export declare function subjectsOf(args?: Record<string, unknown>): { address: string | null; key: string | null };
