/**
 * usePromoteWarrior Hook
 * Promote Warriors NFT to the next rank tier
 *
 * IMPORTANT: This hook operates on Flow Testnet (Chain ID: 545)
 * where the WarriorsNFT contract is deployed
 *
 * Promotion requirements (from WarriorsNFT contract):
 * - UNRANKED -> BRONZE: Requires TOTAL_WINNINGS_NEEDED_FOR_PROMOTION
 * - BRONZE -> SILVER: Requires TOTAL_WINNINGS_NEEDED_FOR_PROMOTION * 2
 * - SILVER -> GOLD: Requires TOTAL_WINNINGS_NEEDED_FOR_PROMOTION * 3
 * - GOLD -> PLATINUM: Requires TOTAL_WINNINGS_NEEDED_FOR_PROMOTION * 4
 */

import { useState, useCallback } from 'react';
import { useAccount, useWalletClient, useChainId, useSwitchChain, useReadContract } from 'wagmi';
import { formatEther } from 'viem';
import { flowTestnet } from 'viem/chains';
import { chainsToContracts, warriorsNFTAbi } from '../constants';

const FLOW_CHAIN_ID = 545;

// Rank enum matching the contract
export enum WarriorRank {
  UNRANKED = 0,
  BRONZE = 1,
  SILVER = 2,
  GOLD = 3,
  PLATINUM = 4,
}

// Rank labels for display
export const RANK_LABELS: Record<WarriorRank, string> = {
  [WarriorRank.UNRANKED]: 'Unranked',
  [WarriorRank.BRONZE]: 'Bronze',
  [WarriorRank.SILVER]: 'Silver',
  [WarriorRank.GOLD]: 'Gold',
  [WarriorRank.PLATINUM]: 'Platinum',
};

// ============================================================================
// Types
// ============================================================================

interface UsePromoteWarriorResult {
  promoteWarrior: (tokenId: bigint) => Promise<string>;
  isPromoting: boolean;
  error: Error | null;
}

interface UseWarriorPromotionStatusResult {
  currentRank: WarriorRank | null;
  currentWinnings: bigint | null;
  requiredWinnings: bigint | null;
  canPromote: boolean;
  nextRank: WarriorRank | null;
  winningsNeeded: bigint | null;
  isLoading: boolean;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Promote a Warriors NFT to the next rank
 */
export function usePromoteWarrior(): UsePromoteWarriorResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [isPromoting, setIsPromoting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const warriorsAddress = chainsToContracts[FLOW_CHAIN_ID]?.warriorsNFT as `0x${string}`;

  const promoteWarrior = useCallback(
    async (tokenId: bigint): Promise<string> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      if (!warriorsAddress || warriorsAddress === '0x0000000000000000000000000000000000000000') {
        throw new Error('WarriorsNFT contract not deployed');
      }

      setIsPromoting(true);
      setError(null);

      try {
        // Switch to Flow Testnet if needed
        if (currentChainId !== FLOW_CHAIN_ID) {
          console.log('Switching to Flow Testnet for warrior promotion...');
          try {
            await switchChainAsync({ chainId: FLOW_CHAIN_ID });
          } catch (switchError) {
            throw new Error(
              `Please switch to Flow Testnet (Chain ID: ${FLOW_CHAIN_ID}) to promote warriors.`
            );
          }
        }

        // Call promoteNFT on WarriorsNFT
        const hash = await walletClient.writeContract({
          address: warriorsAddress,
          abi: warriorsNFTAbi,
          functionName: 'promoteNFT',
          args: [tokenId],
          account: address,
          chain: flowTestnet,
        });

        console.log('Warrior promoted:', hash);
        return hash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Promotion failed');
        setError(error);
        throw error;
      } finally {
        setIsPromoting(false);
      }
    },
    [address, walletClient, currentChainId, switchChainAsync, warriorsAddress]
  );

  return { promoteWarrior, isPromoting, error };
}

/**
 * Get promotion status for a warrior
 */
export function useWarriorPromotionStatus(tokenId: bigint | undefined): UseWarriorPromotionStatusResult {
  const warriorsAddress = chainsToContracts[FLOW_CHAIN_ID]?.warriorsNFT as `0x${string}`;

  // Get current rank
  const { data: currentRank, isLoading: isLoadingRank } = useReadContract({
    address: warriorsAddress,
    abi: warriorsNFTAbi,
    functionName: 'getRanking',
    args: tokenId ? [tokenId] : undefined,
    query: {
      enabled: !!tokenId && !!warriorsAddress,
    },
  });

  // Get current winnings
  const { data: currentWinnings, isLoading: isLoadingWinnings } = useReadContract({
    address: warriorsAddress,
    abi: warriorsNFTAbi,
    functionName: 'getWinnings',
    args: tokenId ? [tokenId] : undefined,
    query: {
      enabled: !!tokenId && !!warriorsAddress,
    },
  });

  // Get promotion threshold (from contract constant)
  const { data: promotionThreshold, isLoading: isLoadingThreshold } = useReadContract({
    address: warriorsAddress,
    abi: warriorsNFTAbi,
    functionName: 'TOTAL_WINNINGS_NEEDED_FOR_PROMOTION',
    query: {
      enabled: !!warriorsAddress,
    },
  });

  const isLoading = isLoadingRank || isLoadingWinnings || isLoadingThreshold;

  // Calculate promotion requirements
  const calculateRequirements = () => {
    if (currentRank === undefined || promotionThreshold === undefined) {
      return { requiredWinnings: null, canPromote: false, nextRank: null, winningsNeeded: null };
    }

    const rank = Number(currentRank);
    const threshold = promotionThreshold as bigint;
    const winnings = (currentWinnings as bigint) || BigInt(0);

    // Already at max rank
    if (rank === WarriorRank.PLATINUM) {
      return {
        requiredWinnings: null,
        canPromote: false,
        nextRank: null,
        winningsNeeded: null
      };
    }

    // Calculate required winnings for next promotion
    let requiredWinnings: bigint;
    let nextRank: WarriorRank;

    switch (rank) {
      case WarriorRank.UNRANKED:
        requiredWinnings = threshold;
        nextRank = WarriorRank.BRONZE;
        break;
      case WarriorRank.BRONZE:
        requiredWinnings = threshold * BigInt(2);
        nextRank = WarriorRank.SILVER;
        break;
      case WarriorRank.SILVER:
        requiredWinnings = threshold * BigInt(3);
        nextRank = WarriorRank.GOLD;
        break;
      case WarriorRank.GOLD:
        requiredWinnings = threshold * BigInt(4);
        nextRank = WarriorRank.PLATINUM;
        break;
      default:
        requiredWinnings = threshold;
        nextRank = WarriorRank.BRONZE;
    }

    const canPromote = winnings >= requiredWinnings;
    const winningsNeeded = canPromote ? BigInt(0) : requiredWinnings - winnings;

    return { requiredWinnings, canPromote, nextRank, winningsNeeded };
  };

  const { requiredWinnings, canPromote, nextRank, winningsNeeded } = calculateRequirements();

  return {
    currentRank: currentRank !== undefined ? Number(currentRank) as WarriorRank : null,
    currentWinnings: currentWinnings as bigint | null,
    requiredWinnings,
    canPromote,
    nextRank,
    winningsNeeded,
    isLoading,
  };
}

/**
 * Helper to format winnings for display
 */
export function formatWinnings(winnings: bigint | null): string {
  if (winnings === null) return '0';
  return parseFloat(formatEther(winnings)).toFixed(2);
}

/**
 * Get rank label from rank enum
 */
export function getRankLabel(rank: WarriorRank | null): string {
  if (rank === null) return 'Unknown';
  return RANK_LABELS[rank] || 'Unknown';
}

export default usePromoteWarrior;
