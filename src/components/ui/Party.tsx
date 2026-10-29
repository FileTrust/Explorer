'use client';

import { Hash } from '@/components/ui/Hash';
import { Badge } from '@/components/ui/Badge';
import { ADDRESS_TO_NAME } from '@/lib/addresses';

/// An address, linked, with the deployment's name for it when it is one of its
/// contracts -- "Reward Manager" says more than its hex -- and the roles it
/// holds in the network when they are known.
export function Party({ address, roles = [], full = false, copy = false }: {
  address: string;
  roles?: string[];
  full?: boolean;
  copy?: boolean;
}) {
  const name = ADDRESS_TO_NAME[address.toLowerCase()];
  return (
    <span className="inline-flex min-w-0 flex-col">
      <span className="inline-flex min-w-0 flex-wrap items-center gap-1.5">
        <Hash value={address} type="address" href={`/address/${address}`} full={full} wrap={full} copyVisible={copy} />
        {roles.includes('guardian') && <Badge label="Guardian" variant="purple" />}
        {roles.includes('vault-keeper') && <Badge label="Vault Keeper" variant="cyan" />}
      </span>
      {name && <span className="text-[10px] text-ft-cyan">{name}</span>}
    </span>
  );
}
