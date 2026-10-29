import { createPublicClient, http, defineChain } from 'viem';

// Browser traffic goes through the Explorer server by default.  This keeps the
// UI working when Hardhat is bound on the blockchain host but the browser is on
// another machine (or across WSL/VM networking).  RPC_URL remains server-only
// and is consumed by app/api/rpc/route.ts.
const browserRpcUrl = process.env.NEXT_PUBLIC_RPC_URL || '/api/rpc';

// Set alongside the RPC URL a deployment already sets. It was hardcoded to the
// Hardhat default, so pointing the Explorer at the Cosmos chain left the id on
// screen naming a chain that was not the one being read. The default keeps a
// Hardhat setup working with nothing configured.
const CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || '31337');

// Where the batching helper lives, from the selected network configuration.
//
// The screens read current state one field at a time, per entity, because that
// is the shape the contracts expose: ten vault keepers cost 118 requests on
// their own screen, and the cost is per entity, per page load, per reader. With
// this set, viem collects the reads issued in the same tick into a single
// aggregate3 call, so the same screen becomes a couple of requests and stays
// that way as the network grows.
//
// Unset, every read is its own round trip exactly as before. Nothing breaks
// without it; it only stops scaling.
const MULTICALL3_ADDRESS = process.env.NEXT_PUBLIC_MULTICALL3_ADDRESS as `0x${string}` | undefined;

export const hardhatLocal = defineChain({
  id: Number.isFinite(CHAIN_ID) && CHAIN_ID > 0 ? CHAIN_ID : 31337,
  name: 'FileTrust Local',
  nativeCurrency: { name: 'FileTrust Unit', symbol: 'FTU', decimals: 18 },
  rpcUrls: {
    default: { http: [browserRpcUrl] },
  },
  ...(MULTICALL3_ADDRESS
    ? { contracts: { multicall3: { address: MULTICALL3_ADDRESS } } }
    : {}),
});

export const publicClient = createPublicClient({
  chain: hardhatLocal,
  transport: http(browserRpcUrl, {
    timeout: 30_000,
  }),
  ...(MULTICALL3_ADDRESS
    ? {
      batch: {
        // A tick's worth of reads becomes one aggregate3. The batch is capped
        // so a screen with thousands of entities sends several bounded calls
        // rather than one that the node refuses for size.
        multicall: { batchSize: 1024, wait: 16 },
      },
    }
    : {}),
});

/**
 * An address's FTU balance, asked of the node directly.
 *
 * Not `publicClient.getBalance`: when the client batches through Multicall3,
 * viem sends a balance read to that contract as `getEthBalance`. The helper this
 * Explorer deploys is the `aggregate3` subset only, so every balance read
 * reverted -- "Execution reverted for an unknown reason" on every wallet line
 * and every address page -- whenever the start script had configured it. A
 * balance is one cheap call that never needed batching.
 */
export async function getNativeBalance(address: `0x${string}`): Promise<bigint> {
  const balance = await publicClient.request({
    method: 'eth_getBalance',
    params: [address.toLowerCase() as `0x${string}`, 'latest'],
  });
  return BigInt(balance);
}
