/**
 * Empty the Explorer's index completely, so the next run starts from nothing.
 *
 * A fresh certification builds a fresh chain, and a fresh chain deserves a fresh
 * index. That does not happen on its own: the certification redeploys with the
 * same deployer and the same nonces, so every contract lands at the address it
 * had before. Chain id matches, the hash of the deployed addresses matches, and
 * the indexer's "is this the same deployment" check says yes -- to a chain that
 * was replaced an hour ago. The store then holds the previous run's events
 * alongside the new ones, and the screens report storage that does not exist.
 *
 * Measured once, and the reason this file exists: 2,829 events from a previous
 * chain still in the store while the new one was at block 597, and 126 stored
 * pieces on a network that had none.
 *
 * So the answer is not a cleverer check. It is that a fresh run says so, and
 * this is what "so" means -- every table the Explorer reads, plus the JSON index
 * the indexer resumes from, because leaving that behind would have it resume
 * into a chain that no longer has those blocks.
 *
 *   npm run index:reset
 */
import { existsSync } from 'node:fs';
import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The same settings file every other script reads -- when there is one. A
// deployment configured through the environment alone has none, and this
// stopped there with ENOENT instead of resetting anything.
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const explorerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { db, dbReady, closeDb } = await import('../src/lib/db/postgres.mjs');
const { eventStoreName } = await import('../src/lib/db/repository.mjs');

/// Every table the store owns. Named rather than discovered, so a table added
/// later is a deliberate decision here instead of a silent survivor.
const TABLES = [
  // The log and what is derived from it.
  'event', 'block', 'transaction', 'counter', 'indexer_checkpoint',
  // Current state, projected from the contracts.
  'vault_keeper', 'guardian', 'file_policy', 'partition_record', 'sector_record',
  'entity_dirty',
  // Totals over history.
  'economic_participant', 'file_economics', 'pre_request', 'rollup_state',
  // FTU paid by contracts inside transactions, and how far tracing has got.
  'internal_transfer', 'internal_trace_state', 'internal_trace_gap',
  // Which piece each storage payment paid for, read from the claims.
  'escrow_link', 'escrow_link_state',
];

if (!(await dbReady())) {
  console.log('no store configured or migrated; nothing to reset');
  process.exit(0);
}

const { rows: present } = await db().query(
  `SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = ANY($1)`,
  [TABLES],
);
const names = present.map((r) => r.table_name);
if (names.length > 0) {
  await db().query(`TRUNCATE ${names.join(', ')} CASCADE`);
  console.log(`cleared ${names.length} Postgres tables`);
}

if (eventStoreName() === 'clickhouse') {
  const { createClient } = await import('@clickhouse/client');
  const ch = createClient({
    url: process.env.CLICKHOUSE_URL,
    database: process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer',
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });
  await ch.command({ query: 'TRUNCATE TABLE IF EXISTS event' });
  await ch.close();
  console.log('cleared the ClickHouse event log');
}

// The JSON index too. The indexer resumes from its manifest, so leaving it would
// have the next run continue after a block the new chain has never reached.
const indexDir = path.join(explorerRoot, 'public', 'index');
try {
  const files = (await readdir(indexDir)).filter((f) => f.endsWith('.json'));
  await Promise.all(files.map((f) => unlink(path.join(indexDir, f))));
  if (files.length > 0) console.log(`removed ${files.length} files from public/index`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await closeDb();
console.log('the Explorer index is empty; the next indexer run starts from block 0');
