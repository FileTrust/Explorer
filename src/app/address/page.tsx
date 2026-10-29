'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { WalletCards, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { resolveGlobalSearch } from '@/lib/search';

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export default function AddressLookupPage() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setError('');
    // An address always opens its wallet page here -- that is what this screen
    // is for -- even a Guardian's or a Vault Keeper's, whose profile the wallet
    // page links to. Anything else goes through the same search as the top bar.
    if (ADDRESS.test(q)) {
      router.push(`/address/${q}`);
      return;
    }
    // Hex of the wrong length is a mistyped address or hash, not a search term.
    if (/^0x[0-9a-fA-F]*$/.test(q) && q.length !== 66) {
      setError(`An address is 0x and 40 characters, a transaction hash 0x and 64. This has ${q.length - 2}.`);
      return;
    }
    setSearching(true);
    try {
      const result = await resolveGlobalSearch(q);
      if (result) router.push(result.path);
      else setError('Nothing on this chain matches that.');
    } catch {
      setError('Nothing on this chain matches that.');
    } finally {
      setSearching(false);
    }
  }

  const trimmed = query.trim();

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      <PageHeader
        title="Address Lookup"
        subtitle="Any wallet or contract: its FTU balance, stake, roles and full history. Also finds a transaction hash or a block number."
        icon={WalletCards}
        iconColor="text-ft-green"
      />

      <form onSubmit={submit} className="bg-bg-surface border border-bg-border rounded-xl p-5 space-y-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#64748b] pointer-events-none" />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setError(''); }}
            placeholder="0x… address, transaction hash or block number"
            className="w-full bg-bg-elevated border border-bg-border rounded-lg pl-9 pr-28 py-2 text-sm text-[#e2e8f0] placeholder:text-[#64748b] focus:outline-none focus:border-ft-blue/50 transition-colors"
          />
          <button
            type="submit"
            disabled={!trimmed || searching}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-ft-blue px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {searching ? 'Searching…' : 'Open'}
          </button>
        </div>
        {error && <p className="text-xs text-ft-amber">{error}</p>}
      </form>
    </div>
  );
}
