import { guardRead } from '@/lib/read-guard.mjs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { CONTRACTS, CONTRACT_LABELS, ContractName } from '@/lib/addresses';

export const dynamic = 'force-dynamic';

/**
 * Whether this name may be looked up at all.
 *
 * It used to be membership of the hand-written `CONTRACTS` map -- twenty names
 * out of the eighty-four the deployment puts on the chain. So the ABI, source
 * and bytecode of the other sixty-four, the ZK verifiers among them, were on
 * disk and readable and answered 404.
 *
 * A name is now anything that looks like a Solidity identifier, and the artifact
 * lookup below decides the rest: a name with no artifact still 404s, which is
 * the same answer for the same reason. The pattern is the guard that matters --
 * this name becomes a path, and `..` or a slash in it would read files that are
 * nobody's business.
 */
const CONTRACT_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isContractName(name: string): boolean {
  return CONTRACT_NAME.test(name) && name.length <= 128;
}

async function readJson(filePath: string) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

async function readText(filePath: string) {
  return readFile(filePath, 'utf8').catch(() => null);
}

async function hasDir(dirPath: string) {
  try {
    await readdir(dirPath);
    return true;
  } catch {
    return false;
  }
}

// The two chains keep their artifacts in different workspaces -- mirrors
// indexer.mjs's CHAIN_WORKSPACES, so a Cosmos deployment (which never
// compiles the plain Hardhat workspace) still finds its own artifacts
// instead of reporting "project root not found".
const CHAIN_WORKSPACES: Record<string, string> = {
  hardhat: 'Blockchain',
  cosmos: path.join('Blockchain 2', 'filetrust', 'evm'),
};

function chainWorkspace(): string {
  const chain = process.env.FILETRUST_CHAIN || 'hardhat';
  return CHAIN_WORKSPACES[chain] ?? CHAIN_WORKSPACES.hardhat;
}

async function hasFileTrustLayout(root: string) {
  const explorerDir = path.join(root, 'App', 'Explorer');
  const artifactDir = path.join(root, chainWorkspace(), 'artifacts', 'contracts');
  return (await hasDir(explorerDir)) && (await hasDir(artifactDir));
}

async function findFileTrustRoot(startDir: string): Promise<string | null> {
  let dir = path.resolve(startDir);
  while (true) {
    if (await hasFileTrustLayout(dir)) return dir;

    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function byteLength(hex: string | undefined) {
  if (!hex || hex === '0x') return 0;
  return Math.max(0, (hex.length - 2) / 2);
}

async function findArtifact(root: string, contractName: string): Promise<string | null> {
  const directPath = path.join(root, `${contractName}.sol`, `${contractName}.json`);
  try {
    await readFile(directPath, 'utf8');
    return directPath;
  } catch {}

  async function walk(dir: string): Promise<string | null> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = await walk(entryPath);
        if (found) return found;
      } else if (entry.name === `${contractName}.json`) {
        return entryPath;
      }
    }
    return null;
  }

  return walk(root);
}

async function handleGET(_request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!isContractName(name)) {
    return NextResponse.json({ error: 'Unknown contract' }, { status: 404 });
  }

  const configuredRoot = process.env.EXPLORER_BLOCKCHAIN_ROOT;
  const fileTrustRoot = configuredRoot ? null : await findFileTrustRoot(process.cwd());
  if (!configuredRoot && !fileTrustRoot) {
    return NextResponse.json({
      error: 'FileTrust project root not found',
      expectedLayout: 'FileTrust/Blockchain/artifacts/contracts',
    }, { status: 404 });
  }
  const blockchainRoot = configuredRoot || path.join(fileTrustRoot!, chainWorkspace());
  const artifactRoot = path.join(blockchainRoot, 'artifacts', 'contracts');
  const artifactPath = await findArtifact(artifactRoot, name);

  try {
    if (!artifactPath) throw new Error('Artifact not found');
    const artifact = await readJson(artifactPath);
    const buildInfo = artifact.buildInfoId
      ? await readJson(path.join(blockchainRoot, 'artifacts', 'build-info', `${artifact.buildInfoId}.json`)).catch(() => null)
      : null;
    const sourceCode = artifact.sourceName
      ? await readText(path.join(blockchainRoot, artifact.sourceName))
      : null;

    return NextResponse.json({
      name,
      // The hand-written maps still supply a friendly label and address for the
      // contracts they know, and say nothing about the rest rather than blocking
      // them: a generated verifier has no label worth inventing, and its address
      // belongs to the deployment file, not here.
      label: CONTRACT_LABELS[name as ContractName] ?? name,
      address: artifact.deployedAddress ?? CONTRACTS[name as ContractName] ?? null,
      artifactPath: path.relative(blockchainRoot, artifactPath),
      contractName: artifact.contractName,
      sourceName: artifact.sourceName,
      inputSourceName: artifact.inputSourceName,
      buildInfoId: artifact.buildInfoId,
      compiler: buildInfo ? {
        type: buildInfo.compilerType,
        version: buildInfo.solcVersion,
        longVersion: buildInfo.solcLongVersion,
        language: buildInfo.input?.language,
        optimizer: buildInfo.input?.settings?.optimizer,
        evmVersion: buildInfo.input?.settings?.evmVersion,
        viaIR: buildInfo.input?.settings?.viaIR,
      } : null,
      abi: artifact.abi ?? [],
      abiItemCount: Array.isArray(artifact.abi) ? artifact.abi.length : 0,
      bytecode: artifact.bytecode,
      deployedBytecode: artifact.deployedBytecode,
      bytecodeBytes: byteLength(artifact.bytecode),
      deployedBytecodeBytes: byteLength(artifact.deployedBytecode),
      linkReferences: artifact.linkReferences ?? {},
      deployedLinkReferences: artifact.deployedLinkReferences ?? {},
      immutableReferences: artifact.immutableReferences ?? {},
      sourceCode,
    });
  } catch (error) {
    return NextResponse.json({
      error: 'Artifact not found',
      expectedLayout: `FileTrust/Blockchain/artifacts/contracts/**/${name}.json`,
    }, { status: 404 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ name: string }> }) {
  return guardRead(request, () => handleGET(request, context), { ttlMs: 60000 });
}
