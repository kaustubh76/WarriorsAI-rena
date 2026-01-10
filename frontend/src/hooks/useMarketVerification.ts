'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTestMode } from '@/contexts/TestModeContext';
import type { VerificationType } from '@/components/0g/VerificationBadge';

interface ProviderInfo {
  address: string;
  verifiability: string;
}

interface VerificationState {
  isVerified: boolean;
  verificationType: VerificationType;
  providerAddress?: string;
  isLoading: boolean;
  lastChecked: number | null;
}

// Cache for provider data to avoid excessive API calls
let providerCache: {
  providers: ProviderInfo[];
  lastFetched: number;
  isValid: boolean;
} = {
  providers: [],
  lastFetched: 0,
  isValid: false
};

const CACHE_TTL = 30000; // 30 seconds cache

/**
 * Hook to get verification status for a market based on 0G network state
 *
 * Verification is determined by:
 * 1. Whether 0G providers are available
 * 2. The type of verification offered by providers (TEE, ZK, or none)
 * 3. Whether the market is a battle market (AI predictions are used)
 */
export function useMarketVerification(isBattleMarket: boolean): VerificationState {
  const { isTestMode } = useTestMode();
  const [state, setState] = useState<VerificationState>({
    isVerified: false,
    verificationType: 'none',
    providerAddress: undefined,
    isLoading: true,
    lastChecked: null
  });

  const fetchProviders = useCallback(async () => {
    const now = Date.now();

    // Use cache if still valid
    if (providerCache.isValid && now - providerCache.lastFetched < CACHE_TTL) {
      return providerCache.providers;
    }

    try {
      const response = await fetch('/api/0g/inference');
      if (!response.ok) {
        providerCache.isValid = false;
        return [];
      }

      const data = await response.json();
      const providers = data.providers || [];

      // Update cache
      providerCache = {
        providers,
        lastFetched: now,
        isValid: true
      };

      return providers;
    } catch (error) {
      console.error('Failed to fetch 0G providers:', error);
      providerCache.isValid = false;
      return [];
    }
  }, []);

  const updateVerificationState = useCallback(async () => {
    // Non-battle markets don't need AI verification
    if (!isBattleMarket) {
      setState({
        isVerified: false,
        verificationType: 'none',
        providerAddress: undefined,
        isLoading: false,
        lastChecked: Date.now()
      });
      return;
    }

    // If in test mode, mark as unverified
    if (isTestMode) {
      setState({
        isVerified: false,
        verificationType: 'none',
        providerAddress: undefined,
        isLoading: false,
        lastChecked: Date.now()
      });
      return;
    }

    try {
      const providers = await fetchProviders();

      if (providers.length === 0) {
        setState({
          isVerified: false,
          verificationType: 'none',
          providerAddress: undefined,
          isLoading: false,
          lastChecked: Date.now()
        });
        return;
      }

      // Find the best verification type available
      // Priority: TEE > ZK > none
      let bestProvider: ProviderInfo | null = null;
      let bestType: VerificationType = 'none';

      for (const provider of providers) {
        const verifiability = provider.verifiability?.toLowerCase();
        if (verifiability === 'teeml') {
          bestProvider = provider;
          bestType = 'teeml';
          break; // TEE is highest priority
        } else if (verifiability === 'zkml' && bestType !== 'teeml') {
          bestProvider = provider;
          bestType = 'zkml';
        } else if (!bestProvider) {
          bestProvider = provider;
        }
      }

      // Verified if we have TEE or ZK providers
      const isVerified = bestType === 'teeml' || bestType === 'zkml';

      setState({
        isVerified,
        verificationType: bestType,
        providerAddress: bestProvider?.address,
        isLoading: false,
        lastChecked: Date.now()
      });
    } catch (error) {
      console.error('Failed to update verification state:', error);
      setState(prev => ({
        ...prev,
        isLoading: false,
        lastChecked: Date.now()
      }));
    }
  }, [isBattleMarket, isTestMode, fetchProviders]);

  useEffect(() => {
    updateVerificationState();

    // Refresh every 30 seconds
    const interval = setInterval(updateVerificationState, CACHE_TTL);
    return () => clearInterval(interval);
  }, [updateVerificationState]);

  return state;
}

/**
 * Simple hook variant that just returns whether 0G verification is available
 * Useful for conditional rendering without full state
 */
export function useIsVerificationAvailable(): boolean {
  const { isTestMode } = useTestMode();
  const [isAvailable, setIsAvailable] = useState(false);

  useEffect(() => {
    if (isTestMode) {
      setIsAvailable(false);
      return;
    }

    const checkAvailability = async () => {
      const now = Date.now();

      // Use cache if valid
      if (providerCache.isValid && now - providerCache.lastFetched < CACHE_TTL) {
        const hasVerifiedProviders = providerCache.providers.some(
          p => p.verifiability?.toLowerCase() === 'teeml' || p.verifiability?.toLowerCase() === 'zkml'
        );
        setIsAvailable(hasVerifiedProviders);
        return;
      }

      try {
        const response = await fetch('/api/0g/inference');
        if (!response.ok) {
          setIsAvailable(false);
          return;
        }

        const data = await response.json();
        const providers = data.providers || [];

        providerCache = {
          providers,
          lastFetched: now,
          isValid: true
        };

        const hasVerifiedProviders = providers.some(
          (p: ProviderInfo) => p.verifiability?.toLowerCase() === 'teeml' || p.verifiability?.toLowerCase() === 'zkml'
        );
        setIsAvailable(hasVerifiedProviders);
      } catch {
        setIsAvailable(false);
      }
    };

    checkAvailability();
    const interval = setInterval(checkAvailability, CACHE_TTL);
    return () => clearInterval(interval);
  }, [isTestMode]);

  return isAvailable;
}

export default useMarketVerification;
