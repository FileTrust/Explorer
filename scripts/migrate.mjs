#!/usr/bin/env node
/// Apply the schema, to Postgres and to ClickHouse if it is configured.
///
/// Each file runs once and records itself in schema_migration. Statements are
/// written to be safe to re-run anyway (IF NOT EXISTS throughout), so a partial
/// apply can simply be run again rather than needing to be unpicked.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const explorerRoot = path.resolve(here, '..');

const envLocal = path.join(explorerRoot, '.env.local');
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

const { db, closeDb } = await import('../src/lib/db/postgres.mjs');

async function migratePostgres() {
  const dir = path.join(explorerRoot, 'db', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  await db().query(`
    CREATE TABLE IF NOT EXISTS schema_migration (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);

  const { rows } = await db().query('SELECT version FROM schema_migration');
  const done = new Set(rows.map((r) => r.version));

  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (done.has(version)) {
      console.log(`  postgres ${version} already applied`);
      continue;
    }
    const sql = await readFile(path.join(dir, file), 'utf8');
    await db().query(sql);
    console.log(`  postgres ${version} applied`);
  }
}

async function migrateClickHouse() {
  const url = process.env.CLICKHOUSE_URL;
  if (!url) {
    console.log('  clickhouse not configured (CLICKHOUSE_URL unset); the event log stays in postgres');
    return;
  }

  const { createClient } = await import('@clickhouse/client');
  const database = process.env.CLICKHOUSE_DATABASE || 'filetrust_explorer';
  const admin = createClient({
    url,
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });
  await admin.command({ query: `CREATE DATABASE IF NOT EXISTS ${database}` });
  await admin.close();

  const client = createClient({
    url,
    database,
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
  });

  const dir = path.join(explorerRoot, 'db', 'clickhouse');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(path.join(dir, file), 'utf8');
    // ClickHouse takes one statement per request, so the file is split on
    // semicolons -- but comments are removed first, and the order matters. A
    // prose semicolon inside a `--` comment splits the file mid-sentence, and
    // the tail of that comment then no longer starts with `--`, so it survives
    // the filter and arrives at the parser as the start of a statement. Which
    // is exactly what happened: "carrying them twice is cheaper than a
    // cross-store join" was sent to ClickHouse as SQL.
    const statements = sql
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await client.command({ query: statement });
    }
    console.log(`  clickhouse ${file.replace(/\.sql$/, '')} applied`);
  }
  await client.close();
}

async function main() {
  console.log('migrating');
  await migratePostgres();
  await migrateClickHouse();
  console.log('done');
}

main()
  .catch((error) => {
    console.error(error.message ?? error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
