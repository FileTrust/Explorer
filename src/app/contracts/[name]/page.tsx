'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Braces, Code2, FileCode2, ListTree } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { copyToClipboard } from '@/lib/utils';

interface ContractArtifact {
  name: string;
  label: string;
  address: `0x${string}`;
  artifactPath: string;
  contractName: string;
  sourceName: string;
  inputSourceName?: string;
  buildInfoId?: string;
  compiler: {
    type?: string;
    version?: string;
    longVersion?: string;
    language?: string;
    optimizer?: { enabled?: boolean; runs?: number };
    evmVersion?: string;
    viaIR?: boolean;
  } | null;
  abi: AbiItem[];
  abiItemCount: number;
  bytecode?: string;
  deployedBytecode?: string;
  bytecodeBytes: number;
  deployedBytecodeBytes: number;
  linkReferences: Record<string, unknown>;
  deployedLinkReferences: Record<string, unknown>;
  immutableReferences: Record<string, unknown>;
  sourceCode?: string | null;
}

interface AbiItem {
  type: string;
  name?: string;
  stateMutability?: string;
  inputs?: Array<{ name?: string; type: string; indexed?: boolean }>;
  outputs?: Array<{ name?: string; type: string }>;
}

function Signature({ item }: { item: AbiItem }) {
  const inputs = (item.inputs ?? []).map(input => `${input.indexed ? 'indexed ' : ''}${input.type}${input.name ? ` ${input.name}` : ''}`).join(', ');
  const outputs = (item.outputs ?? []).map(output => `${output.type}${output.name ? ` ${output.name}` : ''}`).join(', ');
  return (
    <span className="font-mono text-xs text-[#cbd5e1]">
      {item.name ?? item.type}({inputs}){outputs ? ` returns (${outputs})` : ''}
    </span>
  );
}

function abiKey(item: AbiItem) {
  const inputs = (item.inputs ?? []).map(input => `${input.indexed ? 'indexed:' : ''}${input.type}:${input.name ?? ''}`).join(',');
  const outputs = (item.outputs ?? []).map(output => `${output.type}:${output.name ?? ''}`).join(',');
  return `${item.type}:${item.name ?? 'anonymous'}:${item.stateMutability ?? ''}:${inputs}:${outputs}`;
}

function CodeBlock({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-bg-border bg-[#020617] overflow-hidden">
      <div className="flex items-center justify-end border-b border-bg-border bg-bg-elevated px-3 py-2">
        <button
          onClick={async () => {
            const ok = await copyToClipboard(value);
            if (!ok) return;
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-xs text-[#94a3b8] hover:text-[#e2e8f0] transition-colors"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="max-h-[560px] overflow-auto p-4 text-xs leading-relaxed text-[#cbd5e1]">
        <code>{value}</code>
      </pre>
    </div>
  );
}

async function fetchArtifact(name: string): Promise<ContractArtifact> {
  const res = await fetch(`/api/contracts/${name}`, { cache: 'no-store' });
  if (!res.ok) {
    const detail = await res.json().catch(() => null);
    const message = typeof detail?.error === 'string'
      ? detail.error
      : 'Contract artifact not found';
    throw new Error(message);
  }
  return res.json();
}

export default function ContractDetailPage() {
  const params = useParams<{ name: string }>();
  const [tab, setTab] = useState<'abi' | 'source' | 'bytecode'>('abi');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['contract-artifact', params.name],
    queryFn: () => fetchArtifact(params.name),
    enabled: !!params.name,
  });

  const abiRows = useMemo(() => data?.abi.filter(item => item.type !== 'constructor') ?? [], [data]);
  const functionCount = abiRows.filter(item => item.type === 'function').length;
  const eventCount = abiRows.filter(item => item.type === 'event').length;

  const columns: Column<AbiItem>[] = [
    { key: 'type', header: 'Type', cell: row => <Badge label={row.type} variant={row.type === 'event' ? 'purple' : row.stateMutability === 'view' || row.stateMutability === 'pure' ? 'cyan' : 'amber'} /> },
    { key: 'name', header: 'Name', cell: row => <span className="font-mono text-xs text-[#e2e8f0]">{row.name ?? row.type}</span> },
    { key: 'signature', header: 'Signature', cell: row => <Signature item={row} /> },
    { key: 'mode', header: 'Mode', cell: row => <span className="text-xs text-[#64748b]">{row.stateMutability ?? '—'}</span> },
  ];

  if (isLoading) return <LoadingState message="Loading contract artifact…" />;
  if (error || !data) {
    const message = error instanceof Error
      ? `Failed to load contract artifact: ${error.message}`
      : 'Failed to load contract artifact';
    return <ErrorState message={message} retry={refetch} />;
  }

  const source = data.sourceCode ?? 'Source file not found for this artifact.';
  const abiJson = JSON.stringify(data.abi, null, 2);
  const bytecodeJson = JSON.stringify({
    bytecode: data.bytecode,
    deployedBytecode: data.deployedBytecode,
    linkReferences: data.linkReferences,
    deployedLinkReferences: data.deployedLinkReferences,
    immutableReferences: data.immutableReferences,
  }, null, 2);

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title={data.label}
        subtitle={`${data.contractName} contract artifact and ABI`}
        icon={FileCode2}
        iconColor="text-ft-purple"
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4 lg:col-span-2 space-y-3">
          <div>
            <p className="text-xs text-[#64748b] uppercase tracking-wider">Address</p>
            <Hash value={data.address} type="address" full href={`/address/${data.address}`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-[#64748b] uppercase tracking-wider">Source</p>
              <p className="font-mono text-xs text-[#cbd5e1] mt-1 break-all">{data.sourceName}</p>
            </div>
            <div>
              <p className="text-xs text-[#64748b] uppercase tracking-wider">Artifact</p>
              <p className="font-mono text-xs text-[#cbd5e1] mt-1 break-all">{data.artifactPath}</p>
            </div>
          </div>
        </div>

        <div className="bg-bg-surface border border-bg-border rounded-xl p-4 space-y-2">
          <p className="text-xs text-[#64748b] uppercase tracking-wider">Compiler</p>
          <p className="text-sm text-[#e2e8f0]">{data.compiler?.longVersion ?? data.compiler?.version ?? 'Unknown'}</p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Badge label={data.compiler?.optimizer?.enabled ? `Optimizer ${data.compiler.optimizer.runs ?? ''}` : 'Optimizer off'} variant={data.compiler?.optimizer?.enabled ? 'green' : 'gray'} />
            <Badge label={data.compiler?.viaIR ? 'viaIR' : 'No viaIR'} variant={data.compiler?.viaIR ? 'cyan' : 'gray'} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'ABI Items', value: data.abiItemCount.toLocaleString(), color: 'text-ft-purple' },
          { label: 'Functions', value: functionCount.toLocaleString(), color: 'text-ft-cyan' },
          { label: 'Events', value: eventCount.toLocaleString(), color: 'text-ft-amber' },
          { label: 'Deployed Code', value: `${data.deployedBytecodeBytes.toLocaleString()} bytes`, color: 'text-ft-green' },
        ].map(stat => (
          <div key={stat.label} className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <p className="text-xs text-[#64748b]">{stat.label}</p>
            <p className={`text-xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-1 border-b border-bg-border">
        {[
          { id: 'abi', label: 'ABI', icon: Braces },
          { id: 'source', label: 'Source', icon: Code2 },
          { id: 'bytecode', label: 'Bytecode', icon: ListTree },
        ].map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id as typeof tab)}
              className={`inline-flex items-center gap-2 px-3 py-2 text-sm border-b-2 transition-colors ${tab === item.id ? 'border-ft-purple text-[#e2e8f0]' : 'border-transparent text-[#64748b] hover:text-[#94a3b8]'}`}
            >
              <Icon size={15} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'abi' && (
        <div className="space-y-4">
          <DataTable
            columns={columns}
            data={abiRows}
            keyExtractor={abiKey}
            pageSize={30}
            emptyMessage="No ABI items found"
          />
          <CodeBlock value={abiJson} />
        </div>
      )}
      {tab === 'source' && <CodeBlock value={source} />}
      {tab === 'bytecode' && <CodeBlock value={bytecodeJson} />}
    </div>
  );
}
