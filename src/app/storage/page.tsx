'use client';

import Link from 'next/link';
import { Database, HardDrive, Layers3, CalendarClock, AlertTriangle } from 'lucide-react';
import { PageHeader, SectionHeader } from '@/components/ui/PageHeader';
import { StatCard } from '@/components/ui/StatCard';
import { LiveCapacitySummary } from '@/components/storage/LiveCapacitySummary';
import { DataTable, Column } from '@/components/ui/DataTable';
import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/Spinner';
import { useStorageOverview, StorageEventRow } from '@/lib/hooks/useStorage';
import { formatBlockNumber, formatBytes, formatTimestamp } from '@/lib/utils';

function eventVariant(type: string) {
  if (type.includes('Missed')) return 'red';
  if (type.includes('Submitted')) return 'green';
  if (type.includes('Challenge')) return 'amber';
  if (type.includes('Partition')) return 'purple';
  return 'blue';
}

export default function StoragePage() {
  // Counts and sums from the store, and the newest events a page at a time.
  const { stats, events, eventsPaging, isLoading, error, refetch } = useStorageOverview();

  const columns: Column<StorageEventRow>[] = [
    { key: 'type', header: 'Event', cell: row => <Badge label={row.type} variant={eventVariant(row.type) as any} /> },
    { key: 'key', header: 'Key', cell: row => <Hash value={row.key} chars={8} /> },
    { key: 'vk', header: 'VK', cell: row => <Hash value={row.vk} type="address" href={`/vault-keepers/${row.vk}`} /> },
    { key: 'detail', header: 'Detail', cell: row => <span className="text-xs text-[#94a3b8]">{row.detail || '—'}</span> },
    { key: 'deadline', header: 'Deadline', cell: row => <span className="text-xs text-[#64748b]">{row.deadline ? formatTimestamp(row.deadline) : '—'}</span> },
    { key: 'block', header: 'Block', cell: row => <span className="font-mono text-xs text-[#64748b]">{formatBlockNumber(row.blockNumber)}</span> },
    { key: 'tx', header: 'Tx', cell: row => <Hash value={row.txHash} chars={6} href={`/tx/${row.txHash}`} /> },
  ];

  if (isLoading) return <LoadingState message="Loading storage state…" />;
  if (error || !stats) return <ErrorState message="Failed to load storage state" retry={refetch} />;

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Storage"
        subtitle="FileTrust sectors, partitions, deadlines, and proof health"
        icon={Database}
        iconColor="text-ft-cyan"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Declared Capacity" value={stats.totalCapacityBytes > 0n ? formatBytes(stats.totalCapacityBytes) : 'Not declared'} icon={HardDrive} iconColor="text-ft-cyan" subtitle="registered by all VKs" />
        <StatCard
          title="Conservative Free Capacity"
          value={stats.activeDeclaredCapacityBytes > 0n ? formatBytes(stats.activeConservativeAvailableBytes) : '—'}
          icon={Database}
          iconColor="text-ft-green"
          subtitle={stats.activeDeclaredCapacityBytes > 0n ? (
            <LiveCapacitySummary
              activeCapacityBytes={stats.activeDeclaredCapacityBytes}
              freshCapacityBytes={stats.freshActiveProofCapacityBytes}
              registeredDataBytes={stats.activeRegisteredDataBytes}
              divergenceBytes={stats.activeCapacityDivergenceBytes}
            />
          ) : 'no proofs yet'}
          help="Capacity that active Vault Keepers can safely admit now. Proof health is weighted by active capacity: deactivated VKs are excluded, while stale active VKs remain visible. Current divergence is the unmatched byte difference between current registrations and current proofs. File pieces stored is the current registered piece storage across active VKs, including redundancy across VKs."
        />
        <StatCard title="ZK Blocks" value={stats.activeSectorBlocks.toLocaleString()} icon={Database} iconColor="text-ft-blue" subtitle={stats.zkBlockSizeBytes > 0n ? `${stats.zkBlockSizeBytes.toString()} bytes per block` : 'block size unavailable'} />
        <StatCard title="Sectors" value={stats.sectorCount.toLocaleString()} icon={HardDrive} iconColor="text-ft-blue" subtitle={`${stats.activeSectors} active`} />
        <StatCard
          title="Active Proof Partitions"
          value={stats.activePartitions.toLocaleString()}
          icon={Layers3}
          iconColor="text-ft-purple"
          subtitle={(
            <div className="space-y-0.5 leading-4">
              <div>{stats.dataPartitionCount.toLocaleString()} active data partitions</div>
              <div>{stats.capacityPartitionCount.toLocaleString()} active capacity partitions</div>
              <div>{stats.inactivePartitions.toLocaleString()} inactive partitions</div>
            </div>
          )}
          help="The main number is all active proof partitions: active data partitions plus active capacity partitions. Data partitions protect stored file pieces; capacity partitions prove committed free capacity. Inactive partitions are shown separately because they should not count as current proof obligations."
        />
        <StatCard title="Proof Success" value={stats.successRate ? `${stats.successRate}%` : '—'} icon={CalendarClock} iconColor="text-ft-green" subtitle={`${stats.submittedProofs} submitted · ${stats.missedProofs} missed`} />
        <StatCard title="Risk" value={(stats.faultedSectors + stats.expiredSectors).toLocaleString()} icon={AlertTriangle} iconColor={stats.faultedSectors + stats.expiredSectors > 0 ? 'text-ft-red' : 'text-[#64748b]'} subtitle={`${stats.expiringSoonSectors} expiring soon`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {[
          { href: '/storage/sectors', label: 'Sectors', detail: 'Per-sector roots, expirations, challenges, and missed proofs' },
          { href: '/storage/partitions', label: 'Partitions', detail: 'Batch proof units grouped by VK, deadline, and partition' },
          { href: '/storage/deadlines', label: 'Deadlines', detail: 'Filecoin-like deadline lanes for partition proof operations' },
        ].map(item => (
          <Link key={item.href} href={item.href} className="bg-bg-surface border border-bg-border rounded-xl p-4 hover:border-ft-blue/40 hover:bg-bg-elevated transition-colors">
            <p className="text-sm font-semibold text-[#e2e8f0]">{item.label}</p>
            <p className="text-xs text-[#64748b] mt-1">{item.detail}</p>
          </Link>
        ))}
      </div>

      <div>
        <SectionHeader title="Recent Storage Events" count={events.length} />
        <DataTable
          columns={columns}
          data={events}
          keyExtractor={r => `${r.type}-${r.blockNumber}-${r.txHash}-${r.key}`}
          loading={eventsPaging?.isLoading}
          pageSize={25}
          emptyMessage="No storage events found"
          hasMore={eventsPaging?.hasMore}
          onLoadMore={eventsPaging?.loadMore}
          loadingMore={eventsPaging?.loadingMore}
        />
      </div>
    </div>
  );
}
