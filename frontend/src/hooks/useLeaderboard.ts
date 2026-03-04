import { useState, useEffect, useCallback } from 'react';
import { useChainId } from 'wagmi';
import { warriorsNFTAbi, chainsToContracts } from '../constants';

export type RankCategory = 'UNRANKED' | 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';

export interface LeaderboardWarriors {
  tokenId: number;
  name: string;
  image: string;
  rank: RankCategory;
  winnings: bigint;
  owner: string;
  traits: {
    strength: number;
    wit: number;
    charisma: number;
    defence: number;
    luck: number;
  };
  moves: {
    strike: string;
    taunt: string;
    dodge: string;
    special: string;
    recover: string;
  };
  bio?: string;
  life_history?: string;
  adjectives?: string;
  knowledge_areas?: string;
}

export interface LeaderboardData {
  UNRANKED: LeaderboardWarriors[];
  BRONZE: LeaderboardWarriors[];
  SILVER: LeaderboardWarriors[];
  GOLD: LeaderboardWarriors[];
  PLATINUM: LeaderboardWarriors[];
}

// Helper functions
const parseTokenURI = async (uri: string) => {
  try {
    if (uri.startsWith('data:application/json;base64,')) {
      const jsonString = atob(uri.replace('data:application/json;base64,', ''));
      return JSON.parse(jsonString);
    } else if (uri.startsWith('http')) {
      const response = await fetch(uri);
      return await response.json();
    }
    return null;
  } catch (error) {
    console.error('Error parsing token URI:', error);
    return null;
  }
};

const rankingToString = (ranking: number): RankCategory => {
  switch (ranking) {
    case 0: return 'UNRANKED';
    case 1: return 'BRONZE';
    case 2: return 'SILVER';
    case 3: return 'GOLD';
    case 4: return 'PLATINUM';
    default: return 'UNRANKED';
  }
};

export function useLeaderboard() {
  const chainId = useChainId();
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardData>({
    UNRANKED: [],
    BRONZE: [],
    SILVER: [],
    GOLD: [],
    PLATINUM: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get contract address for current chain
  const contractAddress = chainsToContracts[chainId]?.warriorsNFT;

  const fetchLeaderboardData = useCallback(async () => {
    if (!contractAddress) {
      setError('Contract address not found for current chain');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Temporary solution: Return empty data to avoid API spam
      // In production, you would implement proper event listening or have the contract maintain a registry
      console.log('Leaderboard: Using temporary empty data to avoid API errors');

      const groupedData: LeaderboardData = {
        UNRANKED: [],
        BRONZE: [],
        SILVER: [],
        GOLD: [],
        PLATINUM: []
      };

      setLeaderboardData(groupedData);
    } catch (error) {
      console.error('Error fetching leaderboard data:', error);
      setError('Failed to fetch leaderboard data');
    } finally {
      setIsLoading(false);
    }
  }, [contractAddress]);

  useEffect(() => {
    fetchLeaderboardData();
  }, [fetchLeaderboardData]);

  return {
    leaderboardData,
    isLoading,
    error,
    refetch: fetchLeaderboardData,
  };
}
