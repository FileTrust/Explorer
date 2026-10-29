'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}

export function SearchBar({ placeholder = 'Search…', value, onChange, className }: SearchBarProps) {
  return (
    <div className={cn('relative', className)}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" />
      <input
        type="text"
        maxLength={256}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-bg-elevated border border-bg-border rounded-lg pl-8 pr-8 py-2 text-sm text-[#e2e8f0] placeholder:text-[#64748b] focus:outline-none focus:border-ft-blue/50 transition-colors"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#94a3b8] transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export function FilterSelect({
  options,
  value,
  onChange,
  className,
}: {
  options: { label: string; value: string }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn(
        'bg-bg-elevated border border-bg-border rounded-lg px-3 py-2 text-sm text-[#e2e8f0] focus:outline-none focus:border-ft-blue/50 transition-colors cursor-pointer',
        className
      )}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value} className="bg-bg-surface">
          {opt.label}
        </option>
      ))}
    </select>
  );
}
