'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Copy, Check } from 'lucide-react';
import { shortHash, shortAddr, copyToClipboard } from '@/lib/utils';

interface HashProps {
  value: string;
  type?: 'hash' | 'address';
  chars?: number;
  className?: string;
  full?: boolean;
  copyVisible?: boolean;
  wrap?: boolean;
  /** If provided, wraps the hash in a link */
  href?: string;
}

export function Hash({ value, type = 'hash', chars = 8, className = '', full = false, copyVisible = false, wrap = false, href }: HashProps) {
  const [copied, setCopied] = useState(false);

  const display = full ? value : (type === 'address' ? shortAddr(value) : shortHash(value, chars));
  const textClass = `font-mono text-ft-blue hover:text-blue-300 transition-colors ${wrap ? 'break-all whitespace-normal leading-relaxed' : ''}`;

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const ok = await copyToClipboard(value);
    if (!ok) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const label = href ? (
    <Link href={href} className={`${textClass} hover:underline`} title={value}>
      {display}
    </Link>
  ) : (
    <span className={textClass} title={value}>
      {display}
    </span>
  );

  return (
    <span className={`inline-flex min-w-0 ${wrap ? 'items-start' : 'items-center'} gap-1 group ${className}`}>
      {label}
      <button
        onClick={handleCopy}
        className={`${copyVisible ? 'opacity-100 text-[#64748b]' : 'opacity-0 group-hover:opacity-100 text-bg-border'} shrink-0 transition-opacity hover:text-[#94a3b8] p-0.5 rounded`}
        title="Copy to clipboard"
        aria-label="Copy to clipboard"
      >
        {copied ? (
          <Check size={11} className="text-ft-green" />
        ) : (
          <Copy size={11} />
        )}
      </button>
    </span>
  );
}

export function Address({ value, className = '', full = false }: { value: string; className?: string; full?: boolean }) {
  return <Hash value={value} type="address" className={className} full={full} />;
}

export function FullHash({ value, className = '', href }: { value: string; className?: string; href?: string }) {
  return <Hash value={value} full copyVisible wrap className={className} href={href} />;
}
