/**
 * useEncryptionCacheManager Hook
 * Manages encryption key cache lifecycle tied to wallet account changes
 *
 * This hook ensures that:
 * 1. Encryption keys are cleared when account changes
 * 2. Keys are cleared on wallet disconnect
 * 3. Stale keys don't persist across sessions
 */

import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { agentEncryptionService } from '../services/agentEncryptionService';

/**
 * Hook to manage encryption key cache based on account changes
 * Should be mounted once at the app level (in providers or layout)
 */
export function useEncryptionCacheManager(): void {
  const { address, isConnected, isDisconnected } = useAccount();
  const previousAddress = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Handle disconnection - clear all keys
    if (isDisconnected) {
      console.log('Wallet disconnected, clearing encryption key cache');
      agentEncryptionService.clearCache();
      previousAddress.current = undefined;
      return;
    }

    // Handle account change
    if (isConnected && address) {
      const currentAddress = address.toLowerCase();
      const prevAddress = previousAddress.current;

      // If this is a different account than before, clear the old key
      if (prevAddress && prevAddress !== currentAddress) {
        console.log('Account changed, clearing previous encryption key');
        agentEncryptionService.clearKeyFor(prevAddress as `0x${string}`);
      }

      previousAddress.current = currentAddress;
    }
  }, [address, isConnected, isDisconnected]);

  // Clear cache on unmount (e.g., when app closes)
  useEffect(() => {
    return () => {
      agentEncryptionService.clearCache();
    };
  }, []);
}

/**
 * Hook to get current encryption cache status (for debugging)
 */
export function useEncryptionCacheStatus(): {
  hasKeyForCurrentAccount: boolean;
  isConnected: boolean;
} {
  const { address, isConnected } = useAccount();

  // Note: We can't directly check if a key exists without the service
  // exposing that method, but we know the key will exist after first use
  return {
    hasKeyForCurrentAccount: isConnected && !!address,
    isConnected,
  };
}

export default useEncryptionCacheManager;
