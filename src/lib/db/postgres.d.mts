/// Types for the Postgres layer. The implementation is plain JavaScript so the
/// indexer can run it directly, without a TypeScript build step this project
/// does not have.
import type { Pool, PoolClient, PoolConfig } from 'pg';

export declare function postgresConfig(): PoolConfig;
export declare function db(): Pool;
export declare function closeDb(): Promise<void>;
export declare function dbReady(): Promise<boolean>;
export declare function withTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T>;
export declare function toBytes(hex: unknown): Buffer | null;
export declare function toHex(bytes: Buffer | Uint8Array | null | undefined): `0x${string}` | undefined;
