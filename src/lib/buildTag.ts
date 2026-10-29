import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * An identifier for the running code, folded into every cache validator.
 *
 * The API's ETags say "same question, same checkpoint block, same answer", and
 * that is true of the data. It is not true of the code that shapes the data. A
 * deploy that fixes how a query is built produces a different answer at the very
 * same block, and a browser holding the old body will keep replaying it -- the
 * validator has not changed, so the server keeps replying 304 and the fix never
 * reaches the screen. That happened here: a query fix landed, the chain had not
 * moved, and every request came back 304 with the pre-fix body.
 *
 * The build id is the right ingredient because it is stable for a given build
 * and identical across every replica serving it, so replicas still share cache
 * entries and a deploy invalidates them exactly once. Process start time would
 * also be correct, but it would split the cache per replica and re-download
 * everything on every restart.
 *
 * Read once, at module load: it cannot change while the process lives.
 */
function readBuildTag(): string {
  try {
    return readFileSync(join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim().slice(0, 16);
  } catch {
    // Development, where there is no build id. Per-process is enough: the dev
    // server restarts on a code change, which is exactly when caches must drop.
    return `dev${Math.floor(Date.now() / 1000).toString(36)}`;
  }
}

export const BUILD_TAG = readBuildTag();
