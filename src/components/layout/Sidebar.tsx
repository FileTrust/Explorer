'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, FileText, Shield, Server, Lock, Key,
  Database, AlertTriangle, Coins, ChevronRight, RefreshCw, ShieldCheck,
  Boxes, ListTree, WalletCards, FileCode2, HardDrive, Banknote, Medal, Route,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { hardhatLocal } from '@/lib/client';
import { cn } from '@/lib/utils';
import { usePersistentFlag } from '@/lib/browserState';

const EXPLORER_VERSION = '1.0.1';
const SIDEBAR_COLLAPSED_KEY = 'filetrust-explorer-sidebar-collapsed';

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/blocks', label: 'Blocks', icon: Boxes },
  { href: '/txs', label: 'Transactions', icon: ListTree },
  { href: '/contracts', label: 'Contracts', icon: FileCode2 },
  { href: '/files', label: 'Pieces', icon: FileText },
  { href: '/file-cycle', label: 'File Cycle', icon: Route },
  { href: '/storage', label: 'Storage', icon: HardDrive },
  { href: '/rank', label: 'Rankings', icon: Medal },
  { href: '/guardians', label: 'Guardians', icon: Shield },
  { href: '/vault-keepers', label: 'Vault Keepers', icon: Server },
  { href: '/proofs', label: 'Storage Proofs', icon: Lock },
  { href: '/dkg', label: 'DKG Sessions', icon: Key },
  { href: '/pre', label: 'PRE Sessions', icon: RefreshCw },
  { href: '/guardian-proofs', label: 'Guardian Proofs', icon: ShieldCheck },
  { href: '/access', label: 'Data Access', icon: Database },
  { href: '/disputes', label: 'Disputes', icon: AlertTriangle },
  { href: '/economics', label: 'Economics', icon: Banknote },
  { href: '/rewards', label: 'Rewards & Staking', icon: Coins },
  { href: '/address', label: 'Address Lookup', icon: WalletCards },
];

export function Sidebar() {
  const pathname = usePathname();
  const currentYear = new Date().getFullYear();
  const [collapsed, setCollapsed] = usePersistentFlag(SIDEBAR_COLLAPSED_KEY, false);
  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside className={cn(
      'flex min-h-screen shrink-0 flex-col border-r border-bg-border bg-bg-surface transition-[width] duration-200',
      collapsed ? 'w-16' : 'w-60'
    )}>
      {/* Logo */}
      <div className={cn(
        'flex border-b border-bg-border',
        collapsed ? 'flex-col items-center justify-center gap-2 px-2 py-3' : 'items-center gap-2.5 px-5 py-5'
      )}>
        <div className={cn(
          'overflow-hidden rounded-lg border border-bg-border bg-bg-elevated shadow-sm shrink-0',
          collapsed ? 'h-8 w-8' : 'h-10 w-10'
        )}>
          <Image
            src="/filetrust-logo.jpg"
            alt="FileTrust logo"
            width={collapsed ? 32 : 40}
            height={collapsed ? 32 : 40}
            priority
            className="h-full w-full object-cover"
          />
        </div>
        {!collapsed && (
        <div>
          <p className="text-sm font-bold text-[#e2e8f0] leading-none">FileTrust</p>
          <p className="text-[10px] text-[#64748b] mt-0.5 uppercase tracking-widest">Explorer</p>
        </div>
        )}
        <button
          type="button"
          aria-label={collapsed ? 'Open side menu' : 'Close side menu'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Open side menu' : 'Close side menu'}
          onClick={() => setCollapsed(current => !current)}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-bg-border bg-bg-elevated text-[#64748b] transition-all hover:border-ft-blue/40 hover:text-ft-blue focus:outline-none focus-visible:ring-2 focus-visible:ring-ft-blue/60',
            !collapsed && 'ml-auto'
          )}
        >
          <ToggleIcon size={14} />
        </button>
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 py-4 space-y-0.5', collapsed ? 'px-2' : 'px-3')}>
        {navItems.map(item => {
          const Icon = item.icon;
          const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                'flex items-center rounded-lg text-sm font-medium transition-all group',
                collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                active
                  ? 'bg-ft-blue/10 text-ft-blue border border-ft-blue/20'
                  : 'text-[#64748b] hover:text-[#94a3b8] hover:bg-bg-elevated border border-transparent'
              )}
            >
              <Icon size={16} className={cn('shrink-0', active && 'text-ft-blue')} />
              {!collapsed && <span className="flex-1">{item.label}</span>}
              {!collapsed && active && <ChevronRight size={12} className="opacity-60" />}
            </Link>
          );
        })}
      </nav>

      {/* Chain info */}
      <div className={cn('border-t border-bg-border', collapsed ? 'px-2 py-3' : 'px-4 py-4')}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-3 text-[10px] text-[#64748b]">
            <span title="Network live" className="w-2 h-2 rounded-full bg-ft-green live-dot" />
            <span title={`Explorer v${EXPLORER_VERSION}`}>v{EXPLORER_VERSION}</span>
            <a
              href="https://filetrust.io"
              target="_blank"
              rel="noreferrer"
              title={`© ${currentYear} FileTrust`}
              className="font-semibold transition-colors hover:text-ft-blue"
            >
              FT
            </a>
          </div>
        ) : (
          <>
        <div className="bg-bg-elevated rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-[#64748b] uppercase tracking-wider">Network</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-ft-green live-dot" />
              <span className="text-[10px] text-ft-green">Live</span>
            </span>
          </div>
          <p className="text-xs font-mono text-[#94a3b8]">{process.env.NEXT_PUBLIC_NETWORK_RPC_URL || 'https://rpc.filetrust.io'}</p>
          <p className="text-[10px] text-[#64748b] mt-0.5">Chain ID: {hardhatLocal.id}</p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-[#64748b]">
          <span>Explorer v{EXPLORER_VERSION}</span>
          <a
            href="https://filetrust.io"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-ft-blue"
          >
            © {currentYear} FileTrust
          </a>
        </div>
          </>
        )}
      </div>
    </aside>
  );
}
