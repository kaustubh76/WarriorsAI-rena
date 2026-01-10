/**
 * useRecordTrade Hook
 * Record agent trades to AIAgentRegistry for performance tracking
 *
 * IMPORTANT: This hook operates on Flow Testnet (Chain ID: 545)
 * where the AIAgentRegistry contract is deployed
 */

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, useChainId, useSwitchChain } from 'wagmi';
import { defineChain } from 'viem';
import { chainsToContracts, AIAgentRegistryAbi, getChainId } from '../constants';

// Flow Testnet chain definition
const flowTestnet = defineChain({
  id: 545,
  name: 'Flow EVM Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'FLOW',
    symbol: 'FLOW',
  },
  rpcUrls: {
    default: { http: ['https://testnet.evm.nodes.onflow.org'] },
  },
  blockExplorers: {
    default: { name: 'Flow Explorer', url: 'https://evm-testnet.flowscan.io' },
  },
  testnet: true,
});

const FLOW_CHAIN_ID = 545;

// ============================================================================
// Types
// ============================================================================

interface UseRecordAgentTradeResult {
  recordTrade: (
    agentId: bigint,
    marketId: bigint,
    won: boolean,
    pnl: bigint,
    volume: bigint,
    confidence: bigint
  ) => Promise<string>;
  isRecording: boolean;
  error: Error | null;
}

interface UseRecordINFTTradeResult {
  recordINFTTrade: (
    tokenId: bigint,
    won: boolean,
    pnl: bigint
  ) => Promise<string>;
  isRecording: boolean;
  error: Error | null;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Record trade to AIAgentRegistry on Flow Testnet
 * Used for standard registry agents (not iNFTs)
 */
export function useRecordAgentTrade(): UseRecordAgentTradeResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const registryAddress = chainsToContracts[FLOW_CHAIN_ID]?.aiAgentRegistry as `0x${string}`;

  const recordTrade = useCallback(
    async (
      agentId: bigint,
      marketId: bigint,
      won: boolean,
      pnl: bigint,
      volume: bigint,
      confidence: bigint
    ): Promise<string> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      if (!registryAddress || registryAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('AIAgentRegistry contract not deployed');
      }

      setIsRecording(true);
      setError(null);

      try {
        // Switch to Flow Testnet if needed
        if (currentChainId !== FLOW_CHAIN_ID) {
          console.log('Switching to Flow Testnet for trade recording...');
          try {
            await switchChainAsync({ chainId: FLOW_CHAIN_ID });
          } catch (switchError) {
            throw new Error(
              `Please switch to Flow Testnet (Chain ID: ${FLOW_CHAIN_ID}) to record trades.`
            );
          }
        }

        // Call recordTrade on AIAgentRegistry
        const hash = await walletClient.writeContract({
          address: registryAddress,
          abi: AIAgentRegistryAbi,
          functionName: 'recordTrade',
          args: [agentId, marketId, won, pnl, volume, confidence],
          account: address,
          chain: flowTestnet,
        });

        console.log('Trade recorded:', hash);
        return hash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Trade recording failed');
        setError(error);
        throw error;
      } finally {
        setIsRecording(false);
      }
    },
    [address, walletClient, currentChainId, switchChainAsync, registryAddress]
  );

  return { recordTrade, isRecording, error };
}

/**
 * Record trade with simplified parameters
 * Automatically calculates volume from position size
 */
export function useRecordTradeSimplified() {
  const { recordTrade, isRecording, error } = useRecordAgentTrade();

  const recordTradeSimple = useCallback(
    async (params: {
      agentId: bigint;
      marketId: bigint;
      won: boolean;
      profit: number; // In CRWN tokens (will convert to wei)
      positionSize: number; // In CRWN tokens
      confidencePercent: number; // 0-100
    }): Promise<string> => {
      const pnl = BigInt(Math.floor(params.profit * 1e18));
      const volume = BigInt(Math.floor(params.positionSize * 1e18));
      const confidence = BigInt(params.confidencePercent * 100); // Convert to basis points

      return recordTrade(
        params.agentId,
        params.marketId,
        params.won,
        pnl,
        volume,
        confidence
      );
    },
    [recordTrade]
  );

  return { recordTrade: recordTradeSimple, isRecording, error };
}

/**
 * Helper function to record batch trades (for settlement)
 */
export function useBatchRecordTrades() {
  const { recordTrade, isRecording, error } = useRecordAgentTrade();
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0 });

  const recordBatchTrades = useCallback(
    async (
      trades: Array<{
        agentId: bigint;
        marketId: bigint;
        won: boolean;
        pnl: bigint;
        volume: bigint;
        confidence: bigint;
      }>
    ): Promise<string[]> => {
      const hashes: string[] = [];
      setBatchProgress({ current: 0, total: trades.length });

      for (let i = 0; i < trades.length; i++) {
        const trade = trades[i];
        try {
          const hash = await recordTrade(
            trade.agentId,
            trade.marketId,
            trade.won,
            trade.pnl,
            trade.volume,
            trade.confidence
          );
          hashes.push(hash);
          setBatchProgress({ current: i + 1, total: trades.length });
        } catch (err) {
          console.error(`Failed to record trade ${i + 1}:`, err);
          // Continue with remaining trades
        }
      }

      return hashes;
    },
    [recordTrade]
  );

  return { recordBatchTrades, isRecording, error, batchProgress };
}

export default useRecordAgentTrade;
