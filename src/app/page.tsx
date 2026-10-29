'use client';

import {
  FileText, Shield, Server, Lock, Key, Database,
  TrendingDown, Activity, HardDrive, Layers3, AlertTriangle, Coins, WalletCards,
  CheckCircle2, Clock, XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { StatCard } from '@/components/ui/StatCard';
import { LiveCapacitySummary } from '@/components/storage/LiveCapacitySummary';
import { HelpButton } from '@/components/ui/HelpButton';
import { SectionHeader } from '@/components/ui/PageHeader';
import { Hash } from '@/components/ui/Hash';
import { FtuUsdc } from '@/components/ui/FtuAmount';
import { Spinner } from '@/components/ui/Spinner';
import { RECENT_ACTIVITY_LIMIT, useChainStats, useKeyAccessCounts, useRecentActivity } from '@/lib/hooks/useChainStats';
import { useEventCountsForNames } from '@/lib/hooks/useEventCounts';
import { ACTIVITY_EVENT_NAMES, ACTIVITY_TYPE_LABEL, activityByBlockRange, countsByType } from '@/lib/activity';
import { formatFtuPrice, useFtuPrice } from '@/lib/hooks/useFtuPrice';
import { hardhatLocal } from '@/lib/client';
import { CONTRACTS } from '@/lib/addresses';
import { ABI_REGISTRY, EVENT_PURPOSE } from '@/lib/abis/registry';
import { formatBlockNumber, formatBytes } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, LabelList,
} from 'recharts';
import { useMemo, useState } from 'react';
import { useProofStats } from '@/lib/hooks/useProofs';
import { useGuardianProofStats } from '@/lib/hooks/useGuardianProofs';
import { useRewardBreakdown } from '@/lib/hooks/useEconomics';
import { useStorageSummary } from '@/lib/hooks/useStorage';
import { useDisputeStats } from '@/lib/hooks/useDisputes';
import { useGuardians } from '@/lib/hooks/useGuardians';
import { useVaultKeepers } from '@/lib/hooks/useVaultKeepers';
import { useNetworkSummary, type PriceAverage } from '@/lib/hooks/useNetworkSummary';

/// A Keying & Access figure: the store's count when there is one, else the
/// older figure (counted from a capped list), else a dash.
/// Null is "we could not tell", not zero. The PRE cards are derived from a join
/// of three reads (V2 emits no completion event), and any of them can be
/// unavailable -- showing 0 there once described every finished request as
/// waiting.
function keyCount(value: number | null | undefined, fallback?: number): string {
  if (value !== undefined && value !== null) return value.toLocaleString();
  if (fallback !== undefined) return fallback.toLocaleString();
  return '—';
}

const CYCLE_COST_DEFAULTS = {
  fileGb: 1,
  days: 30,
  suPerFtu: 1_000_000,
  fixedGasPriceWei: 1_000_000,
  bufferBps: 1000,
  baseDkgSu: 100,
  basePreSu: 50,
  dkgMaterialSu: 12_000,
  dkgShareKeySu: 6_325,
  preBatchPartialSu: 30_542,
  dkgMaterialGas: 520_000 + 260_000,
  dkgShareKeyGas: 190_000 + 70_000,
  prePartialGas: 1_250_000 + 120_000,
  vkStorageSuPerGbDay: 6_121,
  estimatedDoReqGasFtu: 0.000005034,
};

interface CyclePricing {
  dkgMaterialSu: number;
  dkgShareKeySu: number;
  preBatchPartialSu: number;
  vkStorageSuPerGbDay: number;
  guardianPriceCount: number;
  vkPriceCount: number;
}

const CYCLE_SCENARIOS = [
  { title: 'Small', guardianN: 5, guardianT: 3, vkN: 5, vkT: 3, color: 'bg-ft-green', help: 'Example full-cycle estimate for a smaller policy: 5 Guardians with threshold 3 and 5 VK pieces with threshold 3.' },
  { title: 'Normal', guardianN: 5, guardianT: 3, vkN: 6, vkT: 4, color: 'bg-ft-blue', help: 'Example full-cycle estimate for the current normal setup: 5/3 Guardians and 6/4 VK storage pieces.' },
  { title: 'Moderate', guardianN: 10, guardianT: 6, vkN: 6, vkT: 4, color: 'bg-ft-purple', help: 'Example with more Guardians for DKG/PRE while keeping VK storage at 6/4.' },
  { title: 'Strong', guardianN: 10, guardianT: 6, vkN: 10, vkT: 6, color: 'bg-ft-amber', help: 'Example with stronger Guardian and VK settings: 10/6 for both keying/PRE and storage pieces.' },
];

const WEI_PER_FTU = 1_000_000_000_000_000_000n;

function suToFtu(su: number): number {
  return su / CYCLE_COST_DEFAULTS.suPerFtu;
}

function gasToFtu(gas: number): number {
  return gas * CYCLE_COST_DEFAULTS.fixedGasPriceWei / 1e18;
}

function formatApproxFtu(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `~${safeValue.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} FTU`;
}

function formatFullFtu(value: number): string {
  if (!Number.isFinite(value) || value === 0) return '0 FTU';
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 12 })} FTU`;
}

function formatApproxWeiFtu(wei: bigint): string {
  const value = Number(wei) / 1e18;
  if (!Number.isFinite(value)) return `~${(wei / WEI_PER_FTU).toLocaleString()}.0000 FTU`;
  return formatApproxFtu(value);
}

function formatFullWeiFtu(wei: bigint): string {
  if (wei === 0n) return '0 FTU';
  const sign = wei < 0n ? '-' : '';
  const absolute = wei < 0n ? -wei : wei;
  const whole = absolute / WEI_PER_FTU;
  const fraction = (absolute % WEI_PER_FTU).toString().padStart(18, '0').replace(/0+$/, '');
  return `${sign}${whole.toLocaleString()}${fraction ? `.${fraction}` : ''} FTU`;
}

function ClickableFtuValue({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded(current => !current)}
      title={expanded ? 'Click to show approximate value' : 'Click to show full value'}
      className={cn('max-w-full text-left font-mono break-all transition-colors hover:text-ft-cyan focus:outline-none focus-visible:ring-2 focus-visible:ring-ft-blue/60', className)}
    >
      {expanded ? formatFullFtu(value) : formatApproxFtu(value)}
      <FtuUsdc amountFtu={value} />
    </button>
  );
}

function ClickableWeiFtuValue({
  value,
  className,
}: {
  value: bigint;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded(current => !current)}
      title={expanded ? 'Click to show approximate value' : 'Click to show full value'}
      className={cn('max-w-full text-left font-mono break-all transition-colors hover:text-ft-cyan focus:outline-none focus-visible:ring-2 focus-visible:ring-ft-blue/60', className)}
    >
      {expanded ? formatFullWeiFtu(value) : formatApproxWeiFtu(value)}
      <FtuUsdc amountWei={value} />
    </button>
  );
}

function formatGb(value: number): string {
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 3 })} GB`;
}

function formatStorageLoad(storedGb: number, days: number): string {
  return `${formatGb(storedGb)} x ${days.toLocaleString(undefined, { maximumFractionDigits: 0 })}d`;
}

function formatGwei(wei: number): string {
  return `${(wei / 1e9).toLocaleString(undefined, { maximumFractionDigits: 6 })} gwei`;
}

function cycleBufferMultiplier(): number {
  return 1 + CYCLE_COST_DEFAULTS.bufferBps / 10_000;
}

function positiveNumber(value: bigint | number | undefined): number {
  const n = typeof value === 'bigint' ? Number(value) : Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function average(values: number[], fallback: number): { value: number; count: number } {
  const usable = values.filter(value => Number.isFinite(value) && value > 0);
  if (usable.length === 0) return { value: fallback, count: 0 };
  return {
    value: usable.reduce((sum, value) => sum + value, 0) / usable.length,
    count: usable.length,
  };
}

/// The same average, already taken in the store over the prices above zero.
function storeAverage(price: PriceAverage, fallback: number): { value: number; count: number } {
  return price.count > 0 && Number.isFinite(price.average) && price.average > 0
    ? { value: price.average, count: price.count }
    : { value: fallback, count: 0 };
}

function dkgUnitFtu(pricing: CyclePricing): number {
  return suToFtu(pricing.dkgMaterialSu + pricing.dkgShareKeySu)
    + gasToFtu(CYCLE_COST_DEFAULTS.dkgMaterialGas + CYCLE_COST_DEFAULTS.dkgShareKeyGas);
}

function preUnitFtu(pricing: CyclePricing): number {
  return suToFtu(pricing.preBatchPartialSu) + gasToFtu(CYCLE_COST_DEFAULTS.prePartialGas);
}

function dkgCostFtu(guardianN: number, pricing: CyclePricing): number {
  return (suToFtu(CYCLE_COST_DEFAULTS.baseDkgSu) + dkgUnitFtu(pricing) * guardianN) * cycleBufferMultiplier();
}

function preCostFtu(guardianT: number, pricing: CyclePricing): number {
  return (suToFtu(CYCLE_COST_DEFAULTS.basePreSu) + preUnitFtu(pricing) * guardianT) * cycleBufferMultiplier();
}

function vkGbDayFtu(pricing: CyclePricing): number {
  return suToFtu(pricing.vkStorageSuPerGbDay);
}

function vkStorageCostFtu(vkN: number, vkT: number, fileGb: number, days: number, pricing: CyclePricing): number {
  return fileGb * (vkN / vkT) * days * vkGbDayFtu(pricing);
}

function clampPositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function clampInteger(value: number, fallback: number): number {
  return Math.max(1, Math.round(clampPositive(value, fallback)));
}

function sumBigints(values: bigint[]): bigint {
  return values.reduce((sum, value) => sum + value, 0n);
}

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading, isError: statsError } = useChainStats();
  const { data: recent, isLoading: activityLoading } = useRecentActivity();
  const activity = useMemo(() => recent?.items ?? [], [recent]);
  // All-time counts per activity group, counted in the store.
  const activityTypeCounts = useEventCountsForNames(ACTIVITY_EVENT_NAMES);
  const keyAccess = useKeyAccessCounts();
  const proofStats = useProofStats();
  const guardianProofStats = useGuardianProofStats();
  // Summed and counted in the store. This screen shows six totals and six
  // counts, and was downloading thirty-two event streams to compute them.
  const rewardBreakdown = useRewardBreakdown();
  const economicsLoading = rewardBreakdown.isLoading;
  const ftuPrice = useFtuPrice();
  // The summary only. This screen renders capacity and partition counts, not
  // lists, and was paying for a replay of fifteen event streams to get them.
  const { data: storageData, isLoading: storageLoading, isError: storageError } = useStorageSummary();
  const disputes = useDisputeStats();
  // Average service prices, averaged in the store. The whole Guardian and VK
  // lists are only fetched when there is no store to ask, or it has not
  // projected them yet.
  const networkSummary = useNetworkSummary();
  const storePrices = networkSummary.data;
  const needGuardianList = !networkSummary.isPending && !storePrices?.guardians;
  const needVkList = !networkSummary.isPending && !storePrices?.vaultKeepers;
  const { data: guardians = [], isLoading: guardiansListLoading } = useGuardians({ enabled: needGuardianList });
  const { data: vaultKeepers = [], isLoading: vaultKeepersListLoading } = useVaultKeepers({ enabled: needVkList });
  const guardiansLoading = networkSummary.isPending || (needGuardianList && guardiansListLoading);
  const vaultKeepersLoading = networkSummary.isPending || (needVkList && vaultKeepersListLoading);
  const [customCycle, setCustomCycle] = useState({
    fileGb: 1,
    days: 30,
    guardianN: 5,
    guardianT: 3,
    vkN: 6,
    vkT: 4,
  });


  const proofSuccessRate = proofStats.submitted + proofStats.missed > 0
    ? Math.round(proofStats.submitted / (proofStats.submitted + proofStats.missed) * 100)
    : 0;

  // Counted in the store, over every round: a DKG round can finalize as a new
  // key or as a same-key refresh, and can expire either way.
  const dkgFinalized = keyAccess.data ? keyAccess.data.dkgFinalized + keyAccess.data.dkgRefreshed : undefined;
  const dkgExpired = keyAccess.data ? keyAccess.data.dkgExpired + keyAccess.data.refreshExpired : undefined;
  const cyclePricing = useMemo<CyclePricing>(() => {
    const g = storePrices?.guardians;
    const vk = storePrices?.vaultKeepers;
    const avgDkgMaterial = g
      ? storeAverage(g.dkgMaterialSu, CYCLE_COST_DEFAULTS.dkgMaterialSu)
      : average(guardians.map(row => positiveNumber(row.dkgMaterialSu)), CYCLE_COST_DEFAULTS.dkgMaterialSu);
    const avgDkgShareKey = g
      ? storeAverage(g.dkgShareKeySu, CYCLE_COST_DEFAULTS.dkgShareKeySu)
      : average(guardians.map(row => positiveNumber(row.dkgShareKeySu)), CYCLE_COST_DEFAULTS.dkgShareKeySu);
    const avgPre = g
      ? storeAverage(g.preBatchPartialSu, CYCLE_COST_DEFAULTS.preBatchPartialSu)
      : average(guardians.map(row => positiveNumber(row.preBatchPartialSu)), CYCLE_COST_DEFAULTS.preBatchPartialSu);
    const avgVk = vk
      ? storeAverage(vk.storageFee, CYCLE_COST_DEFAULTS.vkStorageSuPerGbDay)
      : average(vaultKeepers.map(row => positiveNumber(row.storageFee)), CYCLE_COST_DEFAULTS.vkStorageSuPerGbDay);

    return {
      dkgMaterialSu: avgDkgMaterial.value,
      dkgShareKeySu: avgDkgShareKey.value,
      preBatchPartialSu: avgPre.value,
      vkStorageSuPerGbDay: avgVk.value,
      guardianPriceCount: Math.max(avgDkgMaterial.count, avgDkgShareKey.count, avgPre.count),
      vkPriceCount: avgVk.count,
    };
  }, [storePrices, guardians, vaultKeepers]);

  const costCardsLoading = guardiansLoading || vaultKeepersLoading;
  const cycleUnitCosts = useMemo(() => {
    const buffer = cycleBufferMultiplier();
    return {
      dkgPerGuardian: dkgUnitFtu(cyclePricing) * buffer,
      prePerGuardian: preUnitFtu(cyclePricing) * buffer,
      vkGbDay: vkGbDayFtu(cyclePricing),
      vkGbMonth: vkGbDayFtu(cyclePricing) * CYCLE_COST_DEFAULTS.days,
    };
  }, [cyclePricing]);

  const cycleScenarios = useMemo(() => {
    return CYCLE_SCENARIOS.map((scenario) => {
      const dkg = dkgCostFtu(scenario.guardianN, cyclePricing);
      const pre = preCostFtu(scenario.guardianT, cyclePricing);
      const vk = vkStorageCostFtu(scenario.vkN, scenario.vkT, CYCLE_COST_DEFAULTS.fileGb, CYCLE_COST_DEFAULTS.days, cyclePricing);
      const estimatedGas = CYCLE_COST_DEFAULTS.estimatedDoReqGasFtu;
      return {
        ...scenario,
        dkg,
        pre,
        vk,
        estimatedGas,
        storedGb: CYCLE_COST_DEFAULTS.fileGb * scenario.vkN / scenario.vkT,
        total: dkg + pre + vk + estimatedGas,
      };
    });
  }, [cyclePricing]);

  const customEstimate = useMemo(() => {
    const fileGb = clampPositive(customCycle.fileGb, CYCLE_COST_DEFAULTS.fileGb);
    const days = clampPositive(customCycle.days, CYCLE_COST_DEFAULTS.days);
    const guardianN = clampInteger(customCycle.guardianN, 5);
    const guardianT = Math.min(guardianN, clampInteger(customCycle.guardianT, 3));
    const vkT = clampInteger(customCycle.vkT, 4);
    const vkN = Math.max(vkT, clampInteger(customCycle.vkN, 6));
    const dkg = dkgCostFtu(guardianN, cyclePricing);
    const pre = preCostFtu(guardianT, cyclePricing);
    const vk = vkStorageCostFtu(vkN, vkT, fileGb, days, cyclePricing);
    const estimatedGas = CYCLE_COST_DEFAULTS.estimatedDoReqGasFtu;

    return {
      fileGb,
      days,
      guardianN,
      guardianT,
      vkN,
      vkT,
      dkg,
      pre,
      vk,
      estimatedGas,
      storedGb: fileGb * vkN / vkT,
      total: dkg + pre + vk + estimatedGas,
    };
  }, [customCycle, cyclePricing]);
  const guardianPriceSource = costCardsLoading
    ? 'loading registered G prices'
    : cyclePricing.guardianPriceCount > 0
      ? `${cyclePricing.guardianPriceCount} registered G average`
      : 'config fallback';
  const vkPriceSource = costCardsLoading
    ? 'loading registered VK prices'
    : cyclePricing.vkPriceCount > 0
      ? `${cyclePricing.vkPriceCount} registered VK average`
      : 'config fallback';
  const chainStatus = statsError ? 'Offline' : statsLoading ? 'Checking' : stats ? 'Live' : 'No data';
  const chainStatusClass = statsError ? 'text-ft-red' : statsLoading ? 'text-ft-amber' : stats ? 'text-ft-green' : 'text-[#64748b]';
  // A contract this deployment does not have is listed with the zero address; it is not counted.
  const isDeployed = (address: string) => !/^0x0{40}$/i.test(address);
  const deployedContractCount = Object.values(CONTRACTS).filter(isDeployed).length;
  const indexedContractCount = ABI_REGISTRY.filter(r => isDeployed(r.address)).length;
  const watchedEventCount = Object.keys(EVENT_PURPOSE).length;

  const updateCustomCycle = (field: keyof typeof customCycle, value: string) => {
    const parsed = Number(value);
    setCustomCycle(current => ({
      ...current,
      [field]: Number.isFinite(parsed) ? parsed : current[field],
    }));
  };

  // The newest events, grouped into block ranges.
  const activityChart = useMemo(() => activityByBlockRange(activity), [activity]);

  // Every group over all of history when the store can count it; otherwise the
  // newest events only, and the chart says which.
  const typeCountsAllTime = activityTypeCounts.data != null;
  const activityByType = useMemo(() => {
    if (activityTypeCounts.data) return countsByType(activityTypeCounts.data);
    const types = new Map<string, number>();
    for (const a of activity) types.set(a.type, (types.get(a.type) ?? 0) + 1);
    return [...types.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ name: ACTIVITY_TYPE_LABEL[type as keyof typeof ACTIVITY_TYPE_LABEL] ?? type, count }));
  }, [activityTypeCounts.data, activity]);

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Hero header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#e2e8f0]">FileTrust Network</h1>
          <p className="text-sm text-[#64748b] mt-1">Live blockchain data</p>
        </div>
        {stats && (
          <div className="bg-bg-surface border border-bg-border rounded-lg px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-ft-green live-dot" />
                <span className="text-xs text-[#94a3b8]">Block</span>
                <span className="text-xs font-mono text-ft-blue font-semibold">{formatBlockNumber(stats.blockNumber)}</span>
              </div>
              <HelpButton title="Live Block">
                Latest block read from the configured RPC endpoint. The transaction count comes from the Explorer index or a small-chain block scan.
              </HelpButton>
            </div>
            <div className="mt-1 flex items-center justify-end gap-1.5">
              <span className="text-[10px] text-[#64748b]">Txs</span>
              <span className="text-[10px] font-mono text-[#e2e8f0]">
                {stats.transactionCount === null ? '—' : stats.transactionCount.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      <section>
        <SectionHeader title="Participants" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard
            title="Guardians"
            value={stats?.guardianCount.toString() ?? '—'}
            icon={Shield}
            iconColor="text-ft-purple"
            subtitle={`${stats?.activeGuardians ?? '—'} active`}
            loading={statsLoading}
            help="Total registered Guardian providers from the GuardianRegistry contract. The subtitle shows how many are currently active."
          />
          <StatCard
            title="Vault Keepers"
            value={stats?.vaultKeeperCount.toString() ?? '—'}
            icon={Server}
            iconColor="text-ft-cyan"
            subtitle={`${stats?.activeVKs ?? '—'} eligible`}
            loading={statsLoading}
            help="Total registered Vault Keepers from the VK registry. Eligible means the VK can currently be selected for storage work."
          />
          <StatCard
            title="Data Owners"
            value={stats?.dataOwnerCount.toLocaleString() ?? '—'}
            icon={WalletCards}
            iconColor="text-ft-blue"
            subtitle="observed"
            loading={statsLoading}
            help="Unique data-owner addresses seen in file policy, key-generation, DataVault, or role events."
          />
          <StatCard
            title="Requesters"
            value={stats?.requesterCount.toLocaleString() ?? '—'}
            icon={Key}
            iconColor="text-ft-amber"
            subtitle="observed"
            loading={statsLoading}
            help="Unique requester addresses seen in requester registration, PRE request, access request, or role events."
          />
          <StatCard
            title="Reporters"
            value={stats?.reporterCount.toLocaleString() ?? '—'}
            icon={AlertTriangle}
            iconColor="text-ft-red"
            subtitle="complaint submitters"
            loading={statsLoading}
            help="Unique reporter addresses seen in DKG/PRE complaint submission events. A reporter appears after a complaint exposes the address."
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Storage & Capacity" />
        {/* Counts drawn from past events are only totals when there is an index
            to read them from. Without one they are whatever a short recent
            window happened to contain, which on an old chain is a small
            fraction -- and a fraction shown as a total is worse than no number
            at all, because nothing about it looks wrong. */}
        {stats && !stats.indexAvailable && (
          <div className="mb-3 rounded border border-ft-amber/40 bg-ft-amber/10 px-3 py-2 text-xs text-ft-amber">
            No event index found, so counts of past activity — pieces, proofs,
            key generations, access requests — show only recent blocks, not
            totals. Capacity and participant figures are read live and are
            unaffected. Run the indexer to see full history.
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <StatCard
            title="Files"
            value={stats?.fileCount.toLocaleString() ?? '—'}
            icon={FileText}
            iconColor="text-ft-blue"
            subtitle="files with encrypted PID on-chain"
            loading={statsLoading}
            className="!p-4"
            help="Number of unique fileIds that have encrypted PID/CID records stored on-chain in DataVault."
          />
          <StatCard
            title="Stored Pieces"
            value={stats?.activeStorageCommitmentCount.toLocaleString() ?? '—'}
            icon={FileText}
            iconColor="text-ft-green"
            subtitle={stats
              ? `${stats.storageCommitmentCount.toLocaleString()} registered total · ${stats.deletedStorageCommitmentCount.toLocaleString()} deleted`
              : 'active VK storage commitments'}
            loading={statsLoading}
            className="!p-4"
            help="Pieces currently stored by Vault Keepers. Confirmed deletions are excluded; the subtitle preserves the immutable total registration history."
          />
          <StatCard
            title="Declared Capacity"
            value={storageData?.totalCapacityBytes
              ? formatBytes(storageData.totalCapacityBytes)
              : (storageError ? 'Storage data unavailable' : 'Not declared')}
            icon={HardDrive}
            iconColor="text-ft-cyan"
            subtitle={storageError && storageData ? 'last confirmed value · refresh pending' : 'registered by all VKs'}
            loading={storageLoading}
            className="!p-4"
            help="Total storage capacity declared by registered Vault Keepers. It is declared capacity, not necessarily proven free space."
          />
          <StatCard
            title="Conservative Free Capacity"
            value={storageData && storageData.activeDeclaredCapacityBytes > 0n ? formatBytes(storageData.activeConservativeAvailableBytes) : '—'}
            icon={Layers3}
            iconColor="text-ft-green"
            subtitle={storageData && storageData.activeDeclaredCapacityBytes > 0n ? (
              <LiveCapacitySummary
                activeCapacityBytes={storageData.activeDeclaredCapacityBytes}
                freshCapacityBytes={storageData.freshActiveProofCapacityBytes}
                registeredDataBytes={storageData.activeRegisteredDataBytes}
                divergenceBytes={storageData.activeCapacityDivergenceBytes}
              />
            ) : 'no proofs yet'}
            loading={storageLoading}
            className="!p-4"
            help="Capacity that active Vault Keepers can safely admit now. Proof health is weighted by active capacity: deactivated VKs are excluded, while stale active VKs remain visible. Current divergence is the unmatched byte difference between current registrations and current proofs. File pieces stored is the current registered piece storage across active VKs, including redundancy across VKs."
          />
          <StatCard
            title="Active Proof Partitions"
            value={storageData?.activePartitions.toLocaleString() ?? '—'}
            icon={Database}
            iconColor="text-ft-purple"
            subtitle={storageData ? (
              <div className="space-y-0.5 leading-4">
                <div>{storageData.dataPartitionCount.toLocaleString()} active data partitions</div>
                <div>{storageData.capacityPartitionCount.toLocaleString()} active capacity partitions</div>
              </div>
            ) : '—'}
            loading={storageLoading}
            className="!p-4"
            help="The main number is all active proof partitions: active data partitions plus active capacity partitions. Data partitions protect stored file pieces; capacity partitions prove committed free capacity. They are separate proof obligations, so the breakdown is the important context."
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Keying & Access" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard
            title="Finalized DKGs"
            value={keyCount(keyAccess.data?.dkgFinalized, stats?.dkgSessions)}
            icon={Key}
            iconColor="text-ft-amber"
            subtitle={keyAccess.data
              ? `${keyAccess.data.dkgRefreshed.toLocaleString()} key refreshes · ${keyAccess.data.dkgExpired.toLocaleString()} expired`
              : 'completed key generations'}
            loading={statsLoading && keyAccess.isLoading}
            help="Completed distributed key generations (a new key for a file). The subtitle shows key refreshes (same key, new shares for the Guardians) and key generations that expired because Guardians did not take part in time."
          />
          <StatCard
            title="Access Requests"
            value={keyCount(keyAccess.data?.accessRequests, stats?.accessRequests)}
            icon={Database}
            iconColor="text-ft-amber"
            subtitle="data re-encryption requests"
            loading={statsLoading && keyAccess.isLoading}
            help="Requests to read a file, recorded by the DataVault contract. Each one asks the Guardians for a PRE (re-encryption). Reading an already re-encrypted result again does not make a new request."
          />
          <StatCard
            title="PRE Completed"
            value={keyCount(keyAccess.data?.preCompleted)}
            icon={CheckCircle2}
            iconColor="text-ft-green"
            subtitle={keyAccess.data?.preCompleted != null && keyAccess.data.accessRequests > 0
              ? `${Math.round((keyAccess.data.preCompleted * 100) / keyAccess.data.accessRequests)}% of requests`
              : 'partials reached the Guardian threshold'}
            loading={keyAccess.isLoading}
            help="Access requests whose accepted Guardian partials reached their file's threshold, which is the point the requester can reconstruct the data. V2 emits no single completion event, so this is derived from the partials, the request's file, and that file's threshold."
          />
          <StatCard
            title="PRE Waiting"
            value={keyCount(keyAccess.data?.prePending)}
            icon={Clock}
            iconColor="text-ft-blue"
            subtitle="requested, not finished or expired yet"
            loading={keyAccess.isLoading}
            help="Access requests that are neither completed nor expired: the Guardians are still working on them, or their deadline has passed and nobody has closed them yet. Requests minus completed minus expired, so it shows a dash whenever completed could not be determined."
          />
          <StatCard
            title="PRE Expired"
            value={keyCount(keyAccess.data?.preExpired)}
            icon={XCircle}
            iconColor="text-ft-red"
            subtitle="Guardians did not answer in time"
            loading={keyAccess.isLoading}
            help="Access requests closed after their deadline because too few Guardians sent their part. An expired request can never complete."
          />
        </div>
        {keyAccess.data?.atLeast && (
          <p className="mt-2 text-[11px] text-[#64748b]">
            No explorer database: these are counted from the file index, which stops at 5,000 per kind, so they may be higher.
          </p>
        )}
      </section>

      <section>
        <SectionHeader title="Proofs & Disputes" />
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <StatCard
            title="VK Proofs Submitted"
            value={proofStats.submitted.toLocaleString()}
            icon={Lock}
            iconColor="text-ft-green"
            subtitle={`${proofStats.partitionProofs} partition · ${proofStats.sectorSubmitted} sector`}
            loading={proofStats.isLoading}
            help="Storage proof submissions from Vault Keepers. Partition proofs and sector proofs are shown separately in the subtitle."
          />
          <StatCard
            title="VK Proofs Missed"
            value={proofStats.missed.toLocaleString()}
            icon={TrendingDown}
            iconColor="text-ft-red"
            subtitle={`${proofSuccessRate}% success rate`}
            loading={proofStats.isLoading}
            help="Missed Vault Keeper proof deadlines. The success rate compares submitted proofs against submitted plus missed proofs."
          />
          <StatCard
            title="G Share Proofs"
            value={guardianProofStats.valid.toLocaleString()}
            icon={Shield}
            iconColor="text-ft-green"
            subtitle={`${guardianProofStats.submitted} submitted · ${guardianProofStats.missed} missed`}
            loading={guardianProofStats.isLoading}
            help="Guardian share-proof activity for PRE readiness and service accountability."
          />
          <StatCard
            title="DKG Dealer Materials"
            value={keyCount(keyAccess.data?.dkgDealerMaterials)}
            icon={Key}
            iconColor="text-ft-amber"
            subtitle={`${keyCount(dkgFinalized)} finalized · ${keyCount(dkgExpired)} expired`}
            loading={keyAccess.isLoading}
            help="Dealer material accepted from Guardians, over every DKG round, including rounds still running. The subtitle counts finalized rounds (new keys and same-key refreshes) and expired rounds."
          />
          <StatCard
            title="PRE Partial Proofs"
            value={keyCount(keyAccess.data?.prePartials)}
            icon={Activity}
            iconColor="text-ft-purple"
            subtitle={`${keyCount(keyAccess.data?.preBadPartials)} bad · ${keyCount(keyAccess.data?.preExpired)} expired requests`}
            loading={keyAccess.isLoading}
            help="Guardian PRE partial submissions for access requests. Bad partials and expired requests are shown in the subtitle."
          />
          <StatCard
            title="Formal Disputes"
            value={disputes.formal.toLocaleString()}
            icon={AlertTriangle}
            iconColor={disputes.formal > 0 ? 'text-ft-red' : 'text-[#64748b]'}
            subtitle={`${disputes.storage} storage · ${disputes.deletion} deletion · ${disputes.zkdkg} ZK-DKG`}
            loading={disputes.isLoading}
            help="Formal dispute events grouped by storage, deletion, and ZK-DKG dispute types."
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Rewards" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <StatCard
            title="G Rewards"
            value={<ClickableWeiFtuValue value={rewardBreakdown.guardianRewards} />}
            icon={Shield}
            iconColor="text-ft-green"
            subtitle={`${rewardBreakdown.guardianRewardCount} guardian reward events`}
            loading={economicsLoading}
            help="Total rewards credited to Guardians: RewardManager rewards (join, daily share proof, DKG and PRE work paid from escrow) plus the early-network DKG/PRE pool reward from GuardianWorkReward. Click the value to toggle full precision."
          />
          <StatCard
            title="VK Rewards"
            value={<ClickableWeiFtuValue value={rewardBreakdown.vkRewards} />}
            icon={Server}
            iconColor="text-ft-cyan"
            subtitle={`${rewardBreakdown.vkRewardCount} VK reward events`}
            loading={economicsLoading}
            help="Total rewards credited to Vault Keepers from RewardManager events: join, storage proof, finished piece and proven space rewards. Click the value to toggle full precision."
          />
          <StatCard
            title="Claims"
            value={<ClickableWeiFtuValue value={rewardBreakdown.claimed} />}
            icon={Coins}
            iconColor="text-ft-amber"
            subtitle="claimed by reward recipients"
            loading={economicsLoading}
            help="Total rewards claimed by participants. This is claimed payout, not only credited balance."
          />
          <StatCard
            title="Reward Pools"
            value={<ClickableWeiFtuValue value={rewardBreakdown.poolDeposits} />}
            icon={WalletCards}
            iconColor="text-ft-blue"
            subtitle="funds added to reward pools"
            loading={economicsLoading}
            help="Total funds deposited into the protocol reward pools: the Guardian and VK pools in RewardManager (including the VK space pool) and the Guardian DKG/PRE pool in GuardianWorkReward."
          />
          <StatCard
            title="Policy Escrow"
            value={<ClickableWeiFtuValue value={rewardBreakdown.policyEscrow} />}
            icon={FileText}
            iconColor="text-ft-purple"
            subtitle={`${rewardBreakdown.policyEscrowCount} file policy deposits`}
            loading={economicsLoading}
            help="Escrow paid for file policy service. This is funded by file owners during the file cycle."
          />
          <StatCard
            title="Access Escrow"
            value={<ClickableWeiFtuValue value={rewardBreakdown.accessEscrow} />}
            icon={Key}
            iconColor="text-ft-amber"
            subtitle={`${rewardBreakdown.accessEscrowCount} access deposits`}
            loading={economicsLoading}
            help="Escrow paid by requesters for access and PRE service."
          />
          <StatCard
            title="VK Storage Claimed"
            value={<ClickableWeiFtuValue value={rewardBreakdown.vkStorageClaimed} />}
            icon={HardDrive}
            iconColor="text-ft-green"
            subtitle={`${rewardBreakdown.vkStorageClaimCount} storage escrow claims`}
            loading={economicsLoading}
            help="Storage escrow already claimed by Vault Keepers after satisfying storage-service conditions."
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Cycle Cost Units" />
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            title="+1 DKG Guardian"
            value={<ClickableFtuValue value={cycleUnitCosts.dkgPerGuardian} />}
            icon={Key}
            iconColor="text-ft-amber"
            subtitle={`material + share key · ${guardianPriceSource}`}
            loading={costCardsLoading}
            help="Estimated added FTU cost for one more Guardian in DKG. It uses average registered Guardian SU pricing when available."
          />
          <StatCard
            title="+1 PRE Guardian"
            value={<ClickableFtuValue value={cycleUnitCosts.prePerGuardian} />}
            icon={Shield}
            iconColor="text-ft-purple"
            subtitle={`one threshold submitter · ${guardianPriceSource}`}
            loading={costCardsLoading}
            help="Estimated added FTU cost for one more threshold Guardian participating in PRE."
          />
          <StatCard
            title="VK GB/Day"
            value={<ClickableFtuValue value={cycleUnitCosts.vkGbDay} />}
            icon={Server}
            iconColor="text-ft-cyan"
            subtitle={`${Math.round(cyclePricing.vkStorageSuPerGbDay).toLocaleString()} avg SU/GB/day · ${vkPriceSource}`}
            loading={costCardsLoading}
            help="Average cost for storing 1 GB on one VK for one day, based on registered VK storage SU pricing."
          />
          <StatCard
            title="VK GB / 30 Days"
            value={<ClickableFtuValue value={cycleUnitCosts.vkGbMonth} />}
            icon={HardDrive}
            iconColor="text-ft-green"
            subtitle="1 GB stored on one VK"
            loading={costCardsLoading}
            help="Thirty-day storage cost for 1 GB on one VK. This is the VK storage unit before IDA n/t expansion."
          />
        </div>
      </section>

      <section>
        <SectionHeader title="Estimated Full Cycles" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {cycleScenarios.map((scenario) => (
            <div
              key={scenario.title}
              className="bg-bg-surface border border-bg-border rounded-xl p-5 hover:border-bg-hover transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#e2e8f0]">{scenario.title}</p>
                  <p className="text-xs text-[#64748b] mt-1">
                    G {scenario.guardianN}/{scenario.guardianT} · VK {scenario.vkN}/{scenario.vkT}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <HelpButton title={`${scenario.title} Cycle`}>{scenario.help}</HelpButton>
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', scenario.color)} />
                </div>
              </div>

              <div className="mt-4 text-2xl font-bold text-[#e2e8f0]">
                <ClickableFtuValue value={scenario.total} className="font-bold" />
              </div>
              <p className="mt-1 text-xs text-[#64748b]">
                {formatGb(CYCLE_COST_DEFAULTS.fileGb)} file · {formatGb(scenario.storedGb)} stored · {CYCLE_COST_DEFAULTS.days} days
              </p>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#64748b]">DKG</span>
                  <ClickableFtuValue value={scenario.dkg} className="text-[#e2e8f0]" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#64748b]">PRE</span>
                  <ClickableFtuValue value={scenario.pre} className="text-[#e2e8f0]" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#64748b]">VK storage</span>
                  <ClickableFtuValue value={scenario.vk} className="text-[#e2e8f0]" />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#64748b]">Est. DO+REQ gas</span>
                  <ClickableFtuValue value={scenario.estimatedGas} className="text-[#e2e8f0]" />
                </div>
                <div className="pt-2 border-t border-bg-border flex items-center justify-between gap-3">
                  <span className="text-[#94a3b8]">Storage load</span>
                  <span className="font-mono text-ft-cyan">{formatStorageLoad(scenario.storedGb, CYCLE_COST_DEFAULTS.days)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title="Custom Cycle Estimate" />
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <div className="mb-4 flex justify-end">
            <HelpButton title="Custom Cycle Estimate">
              Change file size, service days, Guardian n/t, and VK n/t to estimate the complete cycle cost. VK storage expands by file GB x VK n / VK t.
            </HelpButton>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4">
            <label className="grid min-w-0 gap-1.5 text-xs text-[#64748b]">
              File GB
              <input
                type="number"
                min="0.001"
                step="0.1"
                value={customCycle.fileGb}
                onChange={(event) => updateCustomCycle('fileGb', event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-bg-border bg-bg-elevated px-3 text-sm text-[#e2e8f0] outline-none focus:border-ft-blue"
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs text-[#64748b]">
              Days
              <input
                type="number"
                min="1"
                step="1"
                value={customCycle.days}
                onChange={(event) => updateCustomCycle('days', event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-bg-border bg-bg-elevated px-3 text-sm text-[#e2e8f0] outline-none focus:border-ft-blue"
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs text-[#64748b]">
              G n
              <input
                type="number"
                min="1"
                step="1"
                value={customCycle.guardianN}
                onChange={(event) => updateCustomCycle('guardianN', event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-bg-border bg-bg-elevated px-3 text-sm text-[#e2e8f0] outline-none focus:border-ft-blue"
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs text-[#64748b]">
              G t
              <input
                type="number"
                min="1"
                step="1"
                value={customCycle.guardianT}
                onChange={(event) => updateCustomCycle('guardianT', event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-bg-border bg-bg-elevated px-3 text-sm text-[#e2e8f0] outline-none focus:border-ft-blue"
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs text-[#64748b]">
              VK n
              <input
                type="number"
                min="1"
                step="1"
                value={customCycle.vkN}
                onChange={(event) => updateCustomCycle('vkN', event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-bg-border bg-bg-elevated px-3 text-sm text-[#e2e8f0] outline-none focus:border-ft-blue"
              />
            </label>
            <label className="grid min-w-0 gap-1.5 text-xs text-[#64748b]">
              VK t
              <input
                type="number"
                min="1"
                step="1"
                value={customCycle.vkT}
                onChange={(event) => updateCustomCycle('vkT', event.target.value)}
                className="h-10 w-full min-w-0 rounded-lg border border-bg-border bg-bg-elevated px-3 text-sm text-[#e2e8f0] outline-none focus:border-ft-blue"
              />
            </label>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-5 gap-4">
            <div className="md:col-span-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#64748b]">Estimated total</p>
              <div className="mt-2 text-3xl font-bold text-[#e2e8f0]">
                <ClickableFtuValue value={customEstimate.total} className="font-bold" />
              </div>
              <p className="mt-1 text-xs text-[#64748b]">
                G {customEstimate.guardianN}/{customEstimate.guardianT} · VK {customEstimate.vkN}/{customEstimate.vkT} · {formatGb(customEstimate.storedGb)} stored
              </p>
            </div>
            <div className="md:col-span-3 grid grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              {[
                { label: 'DKG', value: <ClickableFtuValue value={customEstimate.dkg} className="text-[#e2e8f0]" />, help: 'Estimated DKG escrow for the selected Guardian n. It includes base DKG cost plus per-Guardian material/share-key cost.' },
                { label: 'PRE', value: <ClickableFtuValue value={customEstimate.pre} className="text-[#e2e8f0]" />, help: 'Estimated PRE escrow for the selected Guardian threshold t. PRE cost scales with the number of threshold submitters.' },
                { label: 'VK', value: <ClickableFtuValue value={customEstimate.vk} className="text-[#e2e8f0]" />, help: 'Estimated VK storage cost using file GB, service days, and VK n/t IDA expansion.' },
                { label: 'Est. gas', value: <ClickableFtuValue value={customEstimate.estimatedGas} className="text-[#e2e8f0]" />, help: 'Small fixed estimate for DO and requester transaction gas in this estimator. It is not read from test logs.' },
                { label: 'Storage', value: <span className="font-mono text-[#e2e8f0] break-words">{formatStorageLoad(customEstimate.storedGb, customEstimate.days)}</span>, help: 'Stored GB-days after IDA expansion: file GB multiplied by VK n/t, then by service days.' },
              ].map(({ label, value, help }) => (
                <div key={label} className="rounded-lg border border-bg-border bg-bg-elevated p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[#64748b]">{label}</p>
                    <HelpButton title={label}>{help}</HelpButton>
                  </div>
                  <div className="mt-1">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Charts row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <SectionHeader title="Activity by Block" className="mb-0" />
            <HelpButton title="Activity by Block">
              The newest {RECENT_ACTIVITY_LIMIT} FileTrust events, whenever they happened, grouped into block ranges. It shows when the recent activity happened and whether it came in bursts.
            </HelpButton>
          </div>
          <p className="mb-2 text-[11px] text-[#64748b]">
            {recent?.source === 'chain-window'
              ? 'Last 200 blocks only: this explorer has no index'
              : `Newest ${activity.length.toLocaleString()} events`}
          </p>
          {activityChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={activityChart} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="actGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="block" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0e1420', border: '1px solid #1e2a40', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#3b82f6' }}
                  labelFormatter={(label, payload) => payload?.[0]?.payload?.range ?? label}
                />
                <Area type="monotone" dataKey="count" name="events" stroke="#3b82f6" strokeWidth={2} fill="url(#actGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-[#64748b] text-sm">
              {recent?.source === 'chain-window' ? 'No activity in the last 200 blocks (no index)' : 'No FileTrust activity yet'}
            </div>
          )}
        </div>

        <div className="bg-bg-surface border border-bg-border rounded-xl p-5">
          <div className="mb-3 flex items-start justify-between gap-3">
            <SectionHeader title="Activity by Type" className="mb-0" />
            <HelpButton title="Activity by Type">
              FileTrust events grouped by kind: files, VK proofs, Guardians, VKs, DKG, access, PRE, rewards, disputes. With the explorer database it counts all of history; without it, only the newest events.
            </HelpButton>
          </div>
          <p className="mb-2 text-[11px] text-[#64748b]">
            {typeCountsAllTime ? 'All time, counted in the index' : `Newest ${activity.length.toLocaleString()} events only (no explorer database)`}
          </p>
          {activityByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={activityByType} margin={{ top: 16, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a40" />
                <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0e1420', border: '1px solid #1e2a40', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#8b5cf6' }}
                />
                <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                  {/* The count on each bar, so a small group next to a large one is
                      still readable rather than a sliver. */}
                  <LabelList dataKey="count" position="top" fill="#94a3b8" fontSize={10} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-40 flex items-center justify-center text-[#64748b] text-sm">No activity data</div>
          )}
        </div>
      </div>

      {/* Proof health banner */}
      {!proofStats.isLoading && (proofStats.submitted + proofStats.missed) > 0 && (
        <div className="bg-bg-surface border border-bg-border rounded-xl p-4 flex items-center gap-4">
          <div className={cn('text-2xl font-bold', proofSuccessRate >= 90 ? 'text-ft-green' : proofSuccessRate >= 70 ? 'text-ft-amber' : 'text-ft-red')}>
            {proofSuccessRate}%
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-[#e2e8f0]">Storage Proof Health</p>
            <p className="text-xs text-[#64748b]">{proofStats.submitted} proofs submitted · {proofStats.missed} missed · {proofStats.partitionProofs} partition proofs</p>
          </div>
          <div className="w-48 h-2 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', proofSuccessRate >= 90 ? 'bg-ft-green' : proofSuccessRate >= 70 ? 'bg-ft-amber' : 'bg-ft-red')}
              style={{ width: `${proofSuccessRate}%` }}
            />
          </div>
          <HelpButton title="Storage Proof Health">
            Overall VK proof success rate: submitted proofs divided by submitted plus missed proofs. The bar changes color as the rate drops.
          </HelpButton>
        </div>
      )}

      {/* Recent Activity */}
      <div>
        <div className="mb-3 flex items-start justify-between gap-3">
          <SectionHeader title="Recent Activity" count={activity.length} className="mb-0" />
          <HelpButton title="Recent Activity">
            The newest FileTrust events, whenever they happened: files, proofs, Guardians and VKs joining, DKG, access requests, PRE, rewards and disputes. Click a transaction or block to open it.
          </HelpButton>
        </div>
        <div className="bg-bg-surface border border-bg-border rounded-xl overflow-hidden">
          {activityLoading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : activity.length === 0 ? (
            <div className="py-12 text-center text-[#64748b] text-sm">
              {recent?.source === 'chain-window' ? 'No activity in the last 200 blocks (this explorer has no index)' : 'No FileTrust activity yet'}
            </div>
          ) : (
            <div className="divide-y divide-bg-border">
              {activity.slice(0, 20).map((item, i) => (
                <div key={`${item.txHash}-${i}`} className="flex items-center gap-4 px-4 py-3 hover:bg-bg-elevated transition-colors group">
                  <div className={cn('w-2 h-2 rounded-full shrink-0', {
                    'bg-ft-blue': item.type === 'file',
                    'bg-ft-green': item.type === 'proof' || item.type === 'reward' || item.type === 'pre',
                    'bg-ft-red': item.type === 'missed' || item.type === 'deletion' || item.type === 'dispute',
                    'bg-ft-purple': item.type === 'guardian' || item.type === 'dkg',
                    'bg-ft-cyan': item.type === 'vk' || item.type === 'escrow',
                    'bg-ft-amber': item.type === 'access',
                  })} />
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-medium', item.color)}>
                      {item.label}
                      {item.contractLabel && item.contractLabel !== item.label && (
                        <span className="ml-2 text-[10px] font-normal text-[#64748b]">{item.contractLabel}</span>
                      )}
                    </p>
                    <p className="text-xs text-[#64748b] truncate">{item.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <Hash value={item.txHash} type="hash" chars={6} className="text-xs" href={`/tx/${item.txHash}`} />
                    <Link href={`/blocks/${item.blockNumber}`} className="block text-[10px] text-[#64748b] hover:text-ft-blue mt-0.5">
                      {formatBlockNumber(item.blockNumber)}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <section>
        <SectionHeader title="System Info" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-ft-green" />
                <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Chain Status</p>
              </div>
              <HelpButton title="Chain Status">
                Live RPC status for the configured FileTrust chain, including chain ID, latest block, indexed transactions, and connection state.
              </HelpButton>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">Chain ID</span>
                <span className="font-mono text-[#e2e8f0]">{hardhatLocal.id}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">Latest block</span>
                <span className="font-mono text-[#e2e8f0]">{stats ? formatBlockNumber(stats.blockNumber) : '—'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">Total transactions</span>
                <span className="font-mono text-[#e2e8f0]">{stats?.transactionCount === null || stats?.transactionCount === undefined ? '—' : stats.transactionCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">RPC status</span>
                <span className={cn('font-semibold', chainStatusClass)}>{chainStatus}</span>
              </div>
            </div>
          </div>

          <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Database size={14} className="text-ft-blue" />
                <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Contract Statistics</p>
              </div>
              <HelpButton title="Contract Statistics">
                Explorer coverage for FileTrust deployment addresses, ABI-indexed contracts, watched event names, and live contract event count.
              </HelpButton>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">Deployed contracts</span>
                <span className="font-mono text-[#e2e8f0]">{deployedContractCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">ABI indexed</span>
                <span className="font-mono text-[#e2e8f0]">{indexedContractCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">Watched event types</span>
                <span className="font-mono text-[#e2e8f0]">{watchedEventCount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">Contract events</span>
                <span className="font-mono text-[#e2e8f0]">{stats?.indexedEventCount == null ? '—' : stats.indexedEventCount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="bg-bg-surface border border-bg-border rounded-xl p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Coins size={14} className="text-ft-amber" />
                <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wider">Protocol Units & Gas</p>
              </div>
              <HelpButton title="Protocol Units & Gas">
                Unit conversion, fixed gas-price basis, and the live FTU/USDC quote read from the configured price feed.
              </HelpButton>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">1 FTU</span>
                <span className="font-mono text-[#e2e8f0]">{CYCLE_COST_DEFAULTS.suPerFtu.toLocaleString()} SU</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">1 SU</span>
                <span className="font-mono text-[#e2e8f0]">{(1 / CYCLE_COST_DEFAULTS.suPerFtu).toFixed(6)} FTU</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">Fixed gas price</span>
                <span className="font-mono text-[#e2e8f0]">
                  {CYCLE_COST_DEFAULTS.fixedGasPriceWei.toLocaleString()} wei / {formatGwei(CYCLE_COST_DEFAULTS.fixedGasPriceWei)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[#64748b]">FTU price</span>
                <span className="font-mono text-[#e2e8f0]">
                  {ftuPrice.isLoading ? 'checking...' : ftuPrice.data ? formatFtuPrice(ftuPrice.data) : 'offline'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
