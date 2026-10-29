/// Keeping the Explorer's two stores running.
///
/// The start script brings Postgres and ClickHouse up once. After that nothing
/// watched them: a store that crashed, was killed for memory, or did not come
/// back after a reboot stayed down, the indexer failed every minute, and the
/// Explorer went on answering from the file index -- while its health check, which
/// never asked ClickHouse, said "ok".
///
/// The index watcher already wakes every minute, so it is the one that checks.
/// When a configured store does not answer, it runs the same setup script the
/// start script used (`scripts/network/explorer_stores.py --keep-index`), which
/// starts whatever is down and touches nothing that is running. `--keep-index`
/// matters: a restart must never empty the index the way a fresh run does.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

/// The stores this Explorer is configured to use, read from the same settings
/// the indexer reads. A store that is not configured is not checked.
export function configuredStores(env = process.env) {
  const stores = [];
  if (env.DATABASE_URL || env.PGHOST || env.PGDATABASE) {
    let host = env.PGHOST || '127.0.0.1';
    let port = Number(env.PGPORT || 5432);
    if (env.DATABASE_URL) {
      try {
        const url = new URL(env.DATABASE_URL);
        host = url.hostname || host;
        port = Number(url.port || 5432);
      } catch { /* keep the PG* values */ }
    }
    stores.push({ name: 'Postgres', kind: 'tcp', host, port });
  }
  if (env.CLICKHOUSE_URL) {
    stores.push({ name: 'ClickHouse', kind: 'http', url: `${env.CLICKHOUSE_URL.replace(/\/+$/, '')}/ping` });
  }
  return stores;
}

function tcpOpen(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => { socket.destroy(); resolve(ok); };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function answers(store, timeoutMs = 3_000) {
  if (store.kind === 'tcp') return tcpOpen(store.host, store.port, timeoutMs);
  try {
    const res = await fetch(store.url, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/// The names of the configured stores that do not answer right now.
export async function downStores(env = process.env) {
  const stores = configuredStores(env);
  // Not `.map(answers)`: map passes the index as the second argument, which
  // became a timeout of 0 or 1 ms and reported every store but the first as down.
  const results = await Promise.all(stores.map(store => answers(store)));
  return stores.filter((_, i) => !results[i]).map(store => store.name);
}

/// The setup script that can start the stores: EXPLORER_STORES_SCRIPT when set,
/// otherwise where the monorepo keeps it relative to the Explorer.
export function findStoresScript(explorerRoot, env = process.env) {
  const candidates = [
    env.EXPLORER_STORES_SCRIPT,
    path.resolve(explorerRoot, 'explorer_stores.py'),
  ].filter(Boolean);
  return candidates.find(candidate => existsSync(candidate)) ?? null;
}

/// Run the setup script once and report how it went, with the end of its output.
export function startStores(script, { python = process.env.EXPLORER_STORES_PYTHON || 'python3', timeoutMs = 600_000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(python, [script, '--keep-index'], {
      cwd: path.dirname(script),
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    let tail = '';
    const keep = (chunk) => { tail = (tail + chunk.toString()).slice(-1500); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.on('close', (code) => { clearTimeout(timer); resolve({ ok: code === 0, code, tail: tail.trim() }); });
    child.on('error', (err) => { clearTimeout(timer); resolve({ ok: false, code: null, tail: err.message }); });
  });
}

/**
 * One check, and a restart when something is down -- at most once per
 * `retryMs`, so a store that will not start does not have the script run every
 * minute. Returns what it found, for the watcher's log.
 */
export function createStoreGuard({ explorerRoot, retryMs = 5 * 60_000, log = console.log, warn = console.error }) {
  let lastAttempt = 0;
  let warnedNoScript = false;
  return async function guard() {
    const down = await downStores();
    if (down.length === 0) {
      warnedNoScript = false;
      return { down };
    }
    const script = findStoresScript(explorerRoot);
    if (!script) {
      if (!warnedNoScript) {
        warn(`[index-watch] ${down.join(' and ')} not answering, and no explorer_stores.py here to start it ` +
          '(set EXPLORER_STORES_SCRIPT); the Explorer is answering from its file index meanwhile');
        warnedNoScript = true;
      }
      return { down, restarted: false };
    }
    if (Date.now() - lastAttempt < retryMs) return { down, restarted: false, waiting: true };
    lastAttempt = Date.now();
    warn(`[index-watch] ${down.join(' and ')} not answering; starting it again with ${script} --keep-index`);
    const result = await startStores(script);
    const still = await downStores();
    const lastLines = result.tail.split('\n').slice(-3).join(' | ');
    // Judged by whether the stores answer now, not by the script's exit code: it
    // also migrates, and a store that is back up is the point even when a later
    // step of the script complains.
    if (still.length === 0) {
      log(`[index-watch] ${down.join(' and ')} running again` +
        (result.ok ? '' : ` (the setup script still reported: ${lastLines})`));
    } else {
      warn(`[index-watch] could not start ${still.join(' and ')} (exit ${result.code}): ${lastLines}`);
    }
    return { down, restarted: true, ok: still.length === 0 };
  };
}
