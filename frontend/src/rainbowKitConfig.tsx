"use client"

import {getDefaultConfig} from "@rainbow-me/rainbowkit"
import {anvil, flowTestnet, flowMainnet} from "wagmi/chains"
import { defineChain } from 'viem';

// Use a placeholder for build time - actual project ID required at runtime
// This allows the build to succeed on Vercel, with the real ID provided via env vars
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'build-time-placeholder';

// 0G Galileo Testnet - Used for AI Agent iNFT operations (ERC-7857)
// Main game transactions (Warriors NFT, Battles, etc.) happen on Flow Testnet
export const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'A0GI',
    symbol: 'A0GI',
  },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
});

// Memoize the config to prevent WalletConnect multiple initialization
// This singleton pattern ensures getDefaultConfig is only called once
// The config is created lazily to avoid SSR issues with WalletConnect's indexedDB usage
let cachedConfig: ReturnType<typeof getDefaultConfig> | null = null;

export function getConfig() {
  if (!cachedConfig) {
    cachedConfig = getDefaultConfig({
      appName: "WarriorsAI-rena",
      projectId,
      chains: [anvil, flowTestnet, flowMainnet, zeroGGalileo],
      ssr: true
    });
  }
  return cachedConfig;
}

// Export a lazy getter that defers config creation
// This prevents WalletConnect's indexedDB from being accessed during SSR
const config = typeof window !== 'undefined' ? getConfig() : null;
export default config as ReturnType<typeof getDefaultConfig>;