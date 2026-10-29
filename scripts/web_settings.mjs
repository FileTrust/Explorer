import { createHash, randomBytes } from 'node:crypto';
// Runtime configuration needed by public readers. Administrative database
// credentials are replaced/sanitized separately during provisioning.
const SHARED = new Set([
  'FILETRUST_CHAIN','RPC_URL','COMETBFT_RPC_URL','FTU_PRICE_URL','NETWORK_CONFIG_URL',
  'DEPLOYED_ADDRESSES_PATH','EXPLORER_BLOCKCHAIN_ROOT','EXPLORER_EXPECTED_CHAIN_ID',
  'PGHOST','PGPORT','PGDATABASE','CLICKHOUSE_URL','CLICKHOUSE_DATABASE',
]);
export function selectWebSettings(settings) {
  return Object.fromEntries(Object.entries(settings).filter(([key])=>key.startsWith('NEXT_PUBLIC_') || SHARED.has(key)));
}
export function readerName(existing, database) {
  if(typeof existing==='string' && /^ft_reader_[a-f0-9_]{12,48}$/.test(existing))return existing;
  const prefix=createHash('sha256').update(database).digest('hex').slice(0,8);
  return `ft_reader_${prefix}_${randomBytes(8).toString('hex')}`;
}
