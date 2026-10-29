import { guardRead } from '@/lib/read-guard.mjs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { toFunctionSelector, toFunctionSignature, type AbiFunction } from 'viem';

export const dynamic = 'force-dynamic';

/**
 * Every function the deployed contracts define, by selector.
 *
 * A transaction's input starts with four bytes naming the function it calls.
 * The lists showed those bytes raw -- `0x8a4e2f1b` -- which tells a reader
 * nothing. The names are in the compiled artifacts the deployment was made
 * from, the same files the indexer decodes events with, so they cannot drift
 * from what is on the chain.
 *
 * Read once and kept, because they change only with a redeploy, and a redeploy
 * rebuilds and restarts this server.
 */

export interface MethodInfo {
  name: string;
  signature: string;
  inputs: AbiFunction['inputs'];
}

const CHAIN_WORKSPACES: Record<string, string> = {
  hardhat: 'Blockchain',
  cosmos: path.join('Blockchain 2', 'filetrust', 'evm'),
};

/// Where the artifacts may be, most specific first: beside the deployment the
/// run named, then the chain's workspace found from this app's own directory.
function artifactDirs(): string[] {
  const dirs: string[] = [];
  if (process.env.EXPLORER_BLOCKCHAIN_ROOT) {
    dirs.push(path.join(process.env.EXPLORER_BLOCKCHAIN_ROOT, 'artifacts', 'contracts'));
  }
  const deployed = process.env.DEPLOYED_ADDRESSES_PATH;
  if (deployed) {
    dirs.push(path.join(path.dirname(deployed), 'artifacts', 'contracts'));
    dirs.push(path.join(path.dirname(deployed), '..', 'artifacts', 'contracts'));
  }
  const workspace = CHAIN_WORKSPACES[process.env.FILETRUST_CHAIN || 'hardhat'] ?? CHAIN_WORKSPACES.hardhat;
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    dirs.push(path.join(dir, workspace, 'artifacts', 'contracts'));
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return dirs;
}

async function artifactFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith('.json') && !entry.name.endsWith('.dbg.json')) out.push(full);
    }
  }
  return out;
}

let cached: { at: number; methods: Record<string, MethodInfo>; source: string | null } | null = null;
const CACHE_MS = 10 * 60_000;

async function loadMethods() {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached;

  const methods: Record<string, MethodInfo> = {};
  let source: string | null = null;
  for (const dir of artifactDirs()) {
    const files = await artifactFiles(dir);
    if (files.length === 0) continue;
    source = dir;
    for (const file of files) {
      let abi: unknown;
      try {
        abi = JSON.parse(await readFile(file, 'utf8'))?.abi;
      } catch {
        continue;
      }
      if (!Array.isArray(abi)) continue;
      for (const item of abi as AbiFunction[]) {
        if (item?.type !== 'function' || typeof item.name !== 'string') continue;
        try {
          const selector = toFunctionSelector(item);
          // The first definition wins. Two contracts sharing a function share
          // its selector and its name, so there is nothing to choose between.
          if (!methods[selector]) {
            methods[selector] = { name: item.name, signature: toFunctionSignature(item), inputs: item.inputs ?? [] };
          }
        } catch { /* an item viem cannot read is one name fewer, not a failure */ }
      }
    }
    break;
  }
  cached = { at: Date.now(), methods, source };
  return cached;
}

async function handleGET() {
  const { methods, source } = await loadMethods();
  return NextResponse.json(
    { methods, count: Object.keys(methods).length, fromArtifacts: source !== null },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}

export async function GET(request: Request) {
  return guardRead(request, () => handleGET(), { ttlMs: 60000, ignoreQuery: true });
}
