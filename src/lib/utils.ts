import clsx, { ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function shortHash(hash: string, chars = 8): string {
  if (!hash || hash.length < chars * 2 + 2) return hash;
  return `${hash.slice(0, chars + 2)}…${hash.slice(-chars)}`;
}

export function shortAddr(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatWei(wei: bigint, decimals = 4): string {
  const ftu = Number(wei) / 1e18;
  if (ftu === 0) return '0 FTU';
  if (Math.abs(ftu) < 0.0001) return `${Number(wei).toExponential(2)} wei`;
  return `${ftu.toFixed(decimals)} FTU`;
}

const WEI_PER_FTU = 1_000_000_000_000_000_000n;

// withUnit=false is for tables that carry "FTU" in the column header instead of
// repeating it on every row.
export function formatFtu(wei: bigint, decimals = 4, approximate = false, withUnit = true): string {
  const unit = withUnit ? ' FTU' : '';
  if (wei === 0n) return `0${unit}`;
  const value = Number(wei) / 1e18;
  if (!Number.isFinite(value)) return `${approximate ? '~' : ''}${(wei / WEI_PER_FTU).toLocaleString()}${unit}`;
  return `${approximate ? '~' : ''}${value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${unit}`;
}

export function formatFullFtu(wei: bigint): string {
  if (wei === 0n) return '0 FTU';
  const sign = wei < 0n ? '-' : '';
  const absolute = wei < 0n ? -wei : wei;
  const whole = absolute / WEI_PER_FTU;
  const fraction = (absolute % WEI_PER_FTU).toString().padStart(18, '0').replace(/0+$/, '');
  return `${sign}${whole.toLocaleString()}${fraction ? `.${fraction}` : ''} FTU`;
}

export function formatSU(su: bigint): string {
  return `${su.toLocaleString()} SU`;
}

export function formatBytes(bytes: bigint | number): string {
  const value = typeof bytes === 'bigint' ? Number(bytes) : bytes;
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const decimals = size >= 100 || unit === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(decimals)} ${units[unit]}`;
}

export function formatTimestamp(ts: bigint | number): string {
  const ms = typeof ts === 'bigint' ? Number(ts) * 1000 : ts * 1000;
  return new Date(ms).toLocaleString();
}

/**
 * Timestamp the Explorer shows as "heartbeat".
 *
 * The on-chain `lastHeartbeat` only moves when a registry-touching tx is sent
 * -- for Guardians that is nothing but an explicit `heartbeat()` call, so a
 * node doing real DKG/PRE work still reads as stale. Until real periodic
 * heartbeats are wired up, take the most recent of the registry heartbeat and
 * the ReputationManager activity clock. Both raw values stay available.
 */
export function effectiveHeartbeat(
  lastHeartbeat: bigint | number | undefined,
  lastActivityAt: bigint | number | undefined,
): bigint {
  const hb = BigInt(lastHeartbeat ?? 0);
  const activity = BigInt(lastActivityAt ?? 0);
  return hb > activity ? hb : activity;
}

export function timeAgo(ts: bigint | number): string {
  const seconds = Math.floor(Date.now() / 1000) - Number(ts);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatBlockNumber(n: bigint): string {
  return `#${n.toLocaleString()}`;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the textarea path for non-secure/private-IP contexts.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

export function reputationColor(score: number): string {
  if (score >= 900) return 'text-ft-green';
  if (score >= 700) return 'text-ft-cyan';
  if (score >= 500) return 'text-ft-amber';
  return 'text-ft-red';
}

export function reputationLabel(score: number): string {
  if (score >= 900) return 'Excellent';
  if (score >= 700) return 'Good';
  if (score >= 500) return 'Fair';
  return 'Poor';
}
