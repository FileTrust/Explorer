'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { FileCode2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { SearchBar, FilterSelect } from '@/components/ui/SearchBar';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { useKnownContracts, EvmContractSummary } from '@/lib/hooks/useEvmExplorer';

export default function ContractsPage() {
  const { data: contracts = [], isLoading, error, refetch } = useKnownContracts();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');

  // Sixty-two of the eighty-four are generated ZK verifiers, one per committee
  // size. Listed flat they bury the twenty-two that carry the protocol under
  // repetitions of a single thing, so the group is a filter rather than only a
  // label -- and the counts say plainly how the deployment is made up.
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of contracts) counts.set(row.group, (counts.get(row.group) ?? 0) + 1);
    return [
      { label: `All (${contracts.length})`, value: 'all' },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => ({ label: `${name} (${n})`, value: name })),
    ];
  }, [contracts]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return contracts.filter(row =>
      (group === 'all' || row.group === group)
      && (!q || row.name.toLowerCase().includes(q)
        || row.label.toLowerCase().includes(q)
        || row.address.toLowerCase().includes(q)));
  }, [contracts, query, group]);

  const columns: Column<EvmContractSummary>[] = [
    { key: 'label', header: 'Contract', cell: row => <Link href={`/contracts/${row.name}`} className="text-sm font-medium text-ft-blue hover:text-blue-300 hover:underline">{row.label}</Link> },
    { key: 'group', header: 'Type', cell: row => <Badge label={row.group} variant={row.group === 'ZK verifiers' ? 'gray' : 'purple'} /> },
    { key: 'name', header: 'Key', cell: row => <span className="font-mono text-xs text-[#64748b]">{row.name}</span> },
    { key: 'address', header: 'Address', cell: row => <Hash value={row.address} type="address" href={`/address/${row.address}`} /> },
    { key: 'artifact', header: 'Artifact', cell: row => <Link href={`/contracts/${row.name}`} className="font-mono text-xs text-ft-purple hover:text-purple-300 hover:underline">ABI / Source / Bytecode</Link> },
  ];

  if (isLoading) return <LoadingState message="Reading the deployment…" />;
  if (error) return <ErrorState message="Failed to load contract list" retry={refetch} />;

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <PageHeader
        title="Contracts"
        subtitle={`${contracts.length} contracts in this deployment`}
        icon={FileCode2}
        iconColor="text-ft-purple"
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar value={query} onChange={setQuery} placeholder="Search by name or address…" />
        <FilterSelect value={group} onChange={setGroup} options={groups} />
      </div>

      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={r => r.address}
        pageSize={30}
        emptyMessage="No contracts match this filter"
      />
    </div>
  );
}
