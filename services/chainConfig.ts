import { defineChain } from 'viem';
import { baseSepolia } from 'viem/chains';

export const hardhatLocal = defineChain({
  id: 31337,
  name: 'Hardhat Local',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545'] },
  },
});

export function runtimeChain() {
  return process.env.CHAIN_MODE === 'local' ? hardhatLocal : baseSepolia;
}

export function runtimeRpcUrl() {
  if (process.env.CHAIN_MODE === 'local') return process.env.LOCAL_RPC_URL || 'http://127.0.0.1:8545';
  return process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
}
