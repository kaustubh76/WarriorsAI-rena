"use client"

import {getDefaultConfig} from "@rainbow-me/rainbowkit"
import {anvil, flowTestnet, flowMainnet} from "wagmi/chains"
import { zeroGGalileo } from '@/lib/zeroGClient';

// Re-export for consumers that were importing from here
export { zeroGGalileo };

// Use a placeholder for build time - actual project ID required at runtime
// This allows the build to succeed on Vercel, with the real ID provided via env vars
const projectId = process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || 'build-time-placeholder';

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