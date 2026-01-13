/**
 * useCreateMarket Hook
 * Multi-step workflow for creating markets with on-chain integration
 */

'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useWalletClient } from 'wagmi';
import { parseEther, formatEther, type Address } from 'viem';
import { marketCreationService, type CreateMarketParams } from '../services/marketCreationService';

export type CreateMarketStep = 'idle' | 'checking' | 'approving' | 'creating' | 'confirming' | 'success' | 'error';

export interface CreateMarketState {
  step: CreateMarketStep;
  error: string | null;
  txHash: string | null;
  marketId: string | null;
  balance: string;
  hasApproval: boolean;
  isLoading: boolean;
}

export interface UseCreateMarketReturn {
  state: CreateMarketState;
  checkBalanceAndApproval: (amount: string) => Promise<boolean>;
  approveTokens: (amount: string) => Promise<boolean>;
  createMarket: (params: Omit<CreateMarketParams, 'creatorAddress'>) => Promise<boolean>;
  reset: () => void;
  hasEnoughBalance: (amount: string) => boolean;
}

const initialState: CreateMarketState = {
  step: 'idle',
  error: null,
  txHash: null,
  marketId: null,
  balance: '0',
  hasApproval: false,
  isLoading: false,
};

export function useCreateMarket(): UseCreateMarketReturn {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [state, setState] = useState<CreateMarketState>(initialState);

  // Fetch balance on mount and when address changes
  useEffect(() => {
    if (address) {
      fetchBalance();
    }
  }, [address]);

  const fetchBalance = useCallback(async () => {
    if (!address) return;

    try {
      const balance = await marketCreationService.checkBalance(address);
      setState(prev => ({
        ...prev,
        balance: marketCreationService.formatBalance(balance),
      }));
    } catch (error) {
      console.error('[useCreateMarket] Fetch balance error:', error);
    }
  }, [address]);

  /**
   * Check if user has enough balance for the amount
   */
  const hasEnoughBalance = useCallback((amount: string): boolean => {
    try {
      const required = parseEther(amount);
      const current = parseEther(state.balance || '0');
      return current >= required;
    } catch {
      return false;
    }
  }, [state.balance]);

  /**
   * Check balance and approval status for a given amount
   */
  const checkBalanceAndApproval = useCallback(async (amount: string): Promise<boolean> => {
    if (!address) {
      setState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return false;
    }

    setState(prev => ({ ...prev, step: 'checking', isLoading: true, error: null }));

    try {
      // Check balance
      const balance = await marketCreationService.checkBalance(address);
      const balanceStr = marketCreationService.formatBalance(balance);
      const required = parseEther(amount);

      if (balance < required) {
        setState(prev => ({
          ...prev,
          step: 'error',
          error: `Insufficient balance. You have ${balanceStr} CRwN but need ${amount} CRwN`,
          balance: balanceStr,
          isLoading: false,
        }));
        return false;
      }

      // Check approval
      const approvalStatus = await marketCreationService.checkApproval(address, amount);

      setState(prev => ({
        ...prev,
        step: 'idle',
        balance: balanceStr,
        hasApproval: approvalStatus.hasApproval,
        isLoading: false,
      }));

      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: error instanceof Error ? error.message : 'Failed to check balance',
        isLoading: false,
      }));
      return false;
    }
  }, [address]);

  /**
   * Approve CRwN tokens for market creation
   */
  const approveTokens = useCallback(async (amount: string): Promise<boolean> => {
    if (!walletClient || !address) {
      setState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return false;
    }

    setState(prev => ({ ...prev, step: 'approving', isLoading: true, error: null }));

    try {
      const txHash = await marketCreationService.approveTokens(walletClient, amount);

      setState(prev => ({
        ...prev,
        step: 'idle',
        hasApproval: true,
        txHash,
        isLoading: false,
      }));

      return true;
    } catch (error) {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: error instanceof Error ? error.message : 'Failed to approve tokens',
        isLoading: false,
      }));
      return false;
    }
  }, [walletClient, address]);

  /**
   * Create a market on-chain
   */
  const createMarket = useCallback(async (
    params: Omit<CreateMarketParams, 'creatorAddress'>
  ): Promise<boolean> => {
    if (!walletClient || !address) {
      setState(prev => ({ ...prev, error: 'Wallet not connected' }));
      return false;
    }

    setState(prev => ({ ...prev, step: 'creating', isLoading: true, error: null }));

    try {
      const result = await marketCreationService.createMarketOnChain(walletClient, {
        ...params,
        creatorAddress: address,
      });

      if (result.success) {
        setState(prev => ({
          ...prev,
          step: 'success',
          marketId: result.marketId || null,
          txHash: result.txHash || null,
          isLoading: false,
          error: result.error || null, // Partial success may have warning
        }));
        return true;
      } else {
        setState(prev => ({
          ...prev,
          step: 'error',
          error: result.error || 'Failed to create market',
          isLoading: false,
        }));
        return false;
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        step: 'error',
        error: error instanceof Error ? error.message : 'Failed to create market',
        isLoading: false,
      }));
      return false;
    }
  }, [walletClient, address]);

  /**
   * Reset the state
   */
  const reset = useCallback(() => {
    setState(initialState);
    if (address) {
      fetchBalance();
    }
  }, [address, fetchBalance]);

  return {
    state,
    checkBalanceAndApproval,
    approveTokens,
    createMarket,
    reset,
    hasEnoughBalance,
  };
}
