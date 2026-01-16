/**
 * Hook for prediction arena actions (create challenge, accept, etc.)
 */

import { useState, useCallback } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseEther, keccak256, toBytes, encodePacked } from 'viem';
import {
  CreateChallengeParams,
  AcceptChallengeParams,
  PredictionBattle,
  MarketSource,
} from '../../types/predictionArena';

// Contract ABI for PredictionArena (minimal)
const PREDICTION_ARENA_ABI = [
  {
    name: 'createChallenge',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_warriorId', type: 'uint256' },
      { name: '_externalMarketKey', type: 'bytes32' },
      { name: '_sideYes', type: 'bool' },
      { name: '_stakes', type: 'uint256' },
      { name: '_duration', type: 'uint256' },
    ],
    outputs: [{ name: 'challengeId', type: 'uint256' }],
  },
  {
    name: 'acceptChallenge',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: '_challengeId', type: 'uint256' },
      { name: '_warriorId', type: 'uint256' },
    ],
    outputs: [{ name: 'battleId', type: 'uint256' }],
  },
  {
    name: 'cancelChallenge',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: '_challengeId', type: 'uint256' }],
    outputs: [],
  },
] as const;

interface UsePredictionArenaReturn {
  // State
  isCreating: boolean;
  isAccepting: boolean;
  isCancelling: boolean;
  error: string | null;

  // Actions
  createChallenge: (params: CreateChallengeParams) => Promise<string | null>;
  acceptChallenge: (params: AcceptChallengeParams) => Promise<string | null>;
  cancelChallenge: (battleId: string) => Promise<boolean>;
  submitRound: (battleId: string, roundData: RoundSubmission) => Promise<boolean>;
}

interface RoundSubmission {
  roundNumber: number;
  w1Argument: string;
  w1Evidence: string[];
  w1Move: string;
  w1Score: number;
  w2Argument: string;
  w2Evidence: string[];
  w2Move: string;
  w2Score: number;
  judgeReasoning: string;
}

export function usePredictionArena(
  contractAddress?: `0x${string}`
): UsePredictionArenaReturn {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [isCreating, setIsCreating] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Generate market key from source and market ID
   */
  const generateMarketKey = (source: MarketSource, marketId: string): `0x${string}` => {
    return keccak256(toBytes(`${source}:${marketId}`));
  };

  /**
   * Create a new challenge
   */
  const createChallenge = useCallback(async (
    params: CreateChallengeParams
  ): Promise<string | null> => {
    if (!address) {
      setError('Wallet not connected');
      return null;
    }

    setIsCreating(true);
    setError(null);

    try {
      // First create in database
      const dbRes = await fetch('/api/arena/battles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalMarketId: params.externalMarketId,
          source: params.source,
          question: params.question,
          warrior1Id: params.sideYes ? params.warriorId : 0,
          warrior1Owner: params.sideYes ? address : '',
          warrior2Id: params.sideYes ? 0 : params.warriorId,
          warrior2Owner: params.sideYes ? '' : address,
          stakes: params.stakes,
          challengerSideYes: params.sideYes,
        }),
      });

      if (!dbRes.ok) {
        throw new Error('Failed to create challenge in database');
      }

      const dbData = await dbRes.json();

      // If contract address provided, also create on-chain
      if (contractAddress) {
        const marketKey = generateMarketKey(params.source, params.externalMarketId);
        const duration = (params.durationHours || 24) * 3600;

        await writeContractAsync({
          address: contractAddress,
          abi: PREDICTION_ARENA_ABI,
          functionName: 'createChallenge',
          args: [
            BigInt(params.warriorId),
            marketKey,
            params.sideYes,
            parseEther(params.stakes),
            BigInt(duration),
          ],
        });
      }

      return dbData.battle.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create challenge';
      setError(message);
      return null;
    } finally {
      setIsCreating(false);
    }
  }, [address, contractAddress, writeContractAsync]);

  /**
   * Accept an existing challenge
   */
  const acceptChallenge = useCallback(async (
    params: AcceptChallengeParams
  ): Promise<string | null> => {
    if (!address) {
      setError('Wallet not connected');
      return null;
    }

    setIsAccepting(true);
    setError(null);

    try {
      // Update in database
      const dbRes = await fetch('/api/arena/battles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          battleId: params.battleId,
          warrior2Id: params.warriorId,
          warrior2Owner: address,
        }),
      });

      if (!dbRes.ok) {
        throw new Error('Failed to accept challenge in database');
      }

      const dbData = await dbRes.json();

      // If contract address provided, also accept on-chain
      // Note: Would need challenge ID mapping from DB to contract
      // if (contractAddress) { ... }

      return dbData.battle.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to accept challenge';
      setError(message);
      return null;
    } finally {
      setIsAccepting(false);
    }
  }, [address, contractAddress]);

  /**
   * Cancel a challenge
   */
  const cancelChallenge = useCallback(async (battleId: string): Promise<boolean> => {
    setIsCancelling(true);
    setError(null);

    try {
      const res = await fetch('/api/arena/battles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'cancel',
          battleId,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to cancel challenge');
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to cancel challenge';
      setError(message);
      return false;
    } finally {
      setIsCancelling(false);
    }
  }, []);

  /**
   * Submit a round result
   */
  const submitRound = useCallback(async (
    battleId: string,
    roundData: RoundSubmission
  ): Promise<boolean> => {
    setError(null);

    try {
      const res = await fetch('/api/arena/battles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'submitRound',
          battleId,
          ...roundData,
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to submit round');
      }

      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit round';
      setError(message);
      return false;
    }
  }, []);

  return {
    isCreating,
    isAccepting,
    isCancelling,
    error,
    createChallenge,
    acceptChallenge,
    cancelChallenge,
    submitRound,
  };
}
