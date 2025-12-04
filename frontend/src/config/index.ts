/**
 * Centralized configuration for WarriorsAI-rena
 * All environment-dependent values should be configured here
 */

// API URLs - configured via environment variables for different deployments
export const config = {
  // 0G Storage Service URL
  storageApiUrl: process.env.NEXT_PUBLIC_STORAGE_API_URL || 'http://localhost:3001',

  // Arena Backend Service URL
  arenaBackendUrl: process.env.NEXT_PUBLIC_ARENA_BACKEND_URL || 'http://localhost:3002',

  // Base URL for this frontend application
  baseUrl: process.env.NEXT_PUBLIC_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'),

  // Blockchain RPC URLs
  flowTestnetRpc: process.env.NEXT_PUBLIC_FLOW_TESTNET_RPC || 'https://testnet.evm.nodes.onflow.org',
  flowMainnetRpc: process.env.NEXT_PUBLIC_FLOW_MAINNET_RPC || 'https://mainnet.evm.nodes.onflow.org',

  // Chain IDs
  chainIds: {
    flowTestnet: 545,
    flowMainnet: 747,
  },

  // WalletConnect Project ID
  walletConnectProjectId: process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID || '',

  // Game Master (server-side only - should not have NEXT_PUBLIC prefix in production)
  // For client-side signing (development only), use NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY
  // For production, move signing to server-side API routes
  gameMasterPrivateKey: process.env.NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY || process.env.GAME_MASTER_PRIVATE_KEY || '',

  // AI Signer Private Key (server-side only)
  aiSignerPrivateKey: process.env.AI_SIGNER_PRIVATE_KEY || '',
} as const;

// Helper functions for building URLs
export const getStorageDownloadUrl = (rootHash: string): string => {
  return `${config.storageApiUrl}/download/${rootHash}`;
};

export const getStorageUploadUrl = (): string => {
  return `${config.storageApiUrl}/upload`;
};

export const getArenaCommandsUrl = (battleId: string): string => {
  return `${config.arenaBackendUrl}/api/arena/commands?battleId=${battleId}`;
};

export const getArenaStatusUrl = (battleId: string): string => {
  return `${config.arenaBackendUrl}/api/arena/status?battleId=${battleId}`;
};

// Check if we're in production
export const isProduction = process.env.NODE_ENV === 'production';

// Check if external services are configured
export const isStorageConfigured = (): boolean => {
  return config.storageApiUrl !== 'http://localhost:3001';
};

export const isBackendConfigured = (): boolean => {
  return config.arenaBackendUrl !== 'http://localhost:3002';
};

// Validate required environment variables
export const validateConfig = (): { valid: boolean; missing: string[] } => {
  const missing: string[] = [];

  if (!config.walletConnectProjectId) {
    missing.push('NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID');
  }

  return {
    valid: missing.length === 0,
    missing,
  };
};

export default config;
