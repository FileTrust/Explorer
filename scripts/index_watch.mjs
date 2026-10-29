#!/usr/bin/env node
/// Keep the Explorer's index current, forever.
///
/// The Explorer reads past events from an index rather than replaying the chain,
/// because replaying is refused outright once a chain outgrows its log-range cap
/// (Cosmos: 10,000 blocks, about three hours of a one-second chain) and grows
/// without limit even where it is allowed.
///
/// That only holds while something keeps the index current. Left alone it falls
/// behind, and the Explorer then serves a bounded recent window and says its
/// counts are partial -- correct, but not the whole story. This is the piece
/// that keeps it whole.
///
/// Cheap by construction: the indexer records where it stopped and reads only
/// new blocks, so a tick costs a moment regardless of how old the chain is.
///
/// Runs the indexer one at a time. If a tick takes longer than the interval --
/// the first build on an existing chain will -- the next simply starts when it
/// finishes, rather than piling a second copy on top of the first.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStoreGuard } from './store_guard.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const explorerRoot = path.resolve(here, '..');

// The settings the indexer reads, so the store check below looks at the same
// stores. Variables already set win, exactly as they do for the indexer.
const envLocal = path.join(explorerRoot, '.env.local');
if (existsSync(envLocal)) process.loadEnvFile(envLocal);

// Postgres and ClickHouse, checked before every pass and started again when one
// is down. See store_guard.mjs.
const guardStores = createStoreGuard({ explorerRoot });
const intervalMs = Math.max(5_000, Number(process.env.INDEX_WATCH_INTERVAL_MS || '60000'));

let stopping = false;
let consecutiveFailures = 0;

function runIndexerOnce() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(here, 'indexer.mjs')], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let tail = '';
    const keepTail = (chunk) => {
      tail = (tail + chunk.toString()).slice(-2000);
    };
    child.stdout.on('data', keepTail);
    child.stderr.on('data', keepTail);

    child.on('close', (code) => {
      if (code === 0) {
        consecutiveFailures = 0;
        // One line per tick, and only the part worth reading: a log that prints
        // a full index report every minute is a log nobody looks at.
        const summary = tail.trim().split('\n').filter(Boolean).pop() ?? 'ok';
        console.log(`[index-watch] ${new Date().toISOString()} ${summary}`);
      } else {
        consecutiveFailures += 1;
        // Do not give up: the chain may simply be restarting, and a watcher that
        // exits on the first failure leaves the index frozen without saying so.
        console.error(
          `[index-watch] ${new Date().toISOString()} indexer exited ${code} ` +
          `(failure ${consecutiveFailures})\n${tail.trim().split('\n').slice(-3).join('\n')}`,
        );
      }
      resolve();
    });

    child.on('error', (err) => {
      consecutiveFailures += 1;
      console.error(`[index-watch] could not start the indexer: ${err.message}`);
      resolve();
    });
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  console.log(`[index-watch] refreshing the Explorer index every ${intervalMs / 1000}s`);
  // Build immediately, so a freshly started stack is not showing partial counts
  // for a whole interval before the first tick.
  while (!stopping) {
    // A failed check must not stop the indexing itself: the files still advance,
    // and the indexer reads back whatever the store missed once it is up again.
    await guardStores().catch((err) => console.error(`[index-watch] store check failed: ${err.message}`));
    await runIndexerOnce();
    if (stopping) break;
    // Back off when the chain is unreachable, so a stopped node does not produce
    // a failure line every interval.
    const wait = consecutiveFailures > 3 ? intervalMs * 5 : intervalMs;
    await sleep(wait);
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
    console.log(`[index-watch] stopping on ${signal}`);
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[index-watch] stopped unexpectedly:', err);
  process.exitCode = 1;
});
