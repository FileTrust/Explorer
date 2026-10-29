/// The Postgres connection, shared by the Explorer and the indexer.
///
/// Plain JavaScript with types beside it in postgres.d.mts, following
/// indexedLogMatch.mjs: the indexer is a bare node process with no TypeScript
/// build step, and both sides need the same connection and the same helpers.
import pg from 'pg';

const { Pool, types } = pg;

// int8 arrives as a string by default because JavaScript numbers cannot hold
// every bigint. Block numbers and byte counts here are read as BigInt, so parse
// them as such rather than letting a silent precision loss through.
types.setTypeParser(20, (value) => BigInt(value));
// numeric(78,0) is uint256; it must stay exact, so keep the text and let the
// caller decide. Postgres returns it as a string already, which is what we want.

// Next may bundle this module separately for API routes. Keep one pool per
// Node process so route bundles cannot multiply the connection budget.
const POOL_KEY = Symbol.for('filetrust.explorer.postgres.pool');

/// Connection settings, from the environment the Explorer already uses.
export function postgresConfig() {
  const url = process.env.DATABASE_URL;
  if (url) return { connectionString: url };
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'filetrust',
    password: process.env.PGPASSWORD || undefined,
    database: process.env.PGDATABASE || 'filetrust_explorer',
  };
}

/// The shared pool. One per process: the Explorer serves many readers from it,
/// and the indexer writes through it, so it is sized rather than per-request.
export function db() {
  if (!globalThis[POOL_KEY]) {
    const pool = new Pool({
      ...postgresConfig(),
      max: Number(process.env.PGPOOL_MAX || '10'),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      // A screen that has already given up should not hold a connection while
      // the query behind it keeps running.
      statement_timeout: Number(process.env.PGSTATEMENT_TIMEOUT_MS || '15000'),
    });
    pool.on('error', (error) => {
      console.error('[postgres] idle client error:', error.message);
    });
    globalThis[POOL_KEY] = pool;
  }
  return globalThis[POOL_KEY];
}

export async function closeDb() {
  if (globalThis[POOL_KEY]) {
    const closing = globalThis[POOL_KEY];
    delete globalThis[POOL_KEY];
    await closing.end();
  }
}

/// Whether Postgres is reachable and migrated. Used to decide whether to serve
/// from the store or fall back, rather than failing a page.
export async function dbReady() {
  try {
    const { rows } = await db().query(
      `SELECT count(*)::int AS n FROM schema_migration WHERE version = '001_init'`,
    );
    return rows[0]?.n === 1;
  } catch {
    return false;
  }
}

/// Run one statement in a transaction, releasing the client either way.
export async function withTransaction(run) {
  const client = await db().connect();
  try {
    await client.query('BEGIN');
    const result = await run(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { /* the client is going back anyway */ }
    throw error;
  } finally {
    client.release();
  }
}

// --- byte helpers -----------------------------------------------------------
// Addresses and hashes are bytea in the store and 0x text everywhere else. Doing
// the conversion in one place is what keeps "is this hex or is this bytes"
// from becoming a question asked at every call site.

/// `0x…` to a Buffer. Returns null for absent input so a nullable column stays
/// nullable rather than becoming an empty string.
export function toBytes(hex) {
  if (typeof hex !== 'string' || !hex.startsWith('0x')) return null;
  const body = hex.slice(2);
  if (body.length === 0 || body.length % 2 !== 0) return null;
  if (!/^[0-9a-fA-F]+$/.test(body)) return null;
  return Buffer.from(body, 'hex');
}

/// A Buffer back to lowercase `0x…`.
export function toHex(bytes) {
  if (!bytes) return undefined;
  return `0x${Buffer.from(bytes).toString('hex')}`;
}
