import { readContract } from '@wagmi/core';
import { getContracts, ArenaFactoryAbi, getChainId } from '../constants';
import rainbowKitConfig from '../rainbowKitConfig';

export interface RankingArenas {
  UNRANKED: string[];
  BRONZE: string[];
  SILVER: string[];
  GOLD: string[];
  PLATINUM: string[];
}

// Ranking enum mapping to match contract
export enum Ranking {
  UNRANKED = 0,
  BRONZE = 1,
  SILVER = 2,
  GOLD = 3,
  PLATINUM = 4
}

export const arenaFactoryService = {
  /**
   * Get all arenas for a specific ranking
   */
  async getArenasOfRanking(ranking: Ranking): Promise<string[]> {
    try {
      const result = await readContract(rainbowKitConfig, {
        address: getContracts().ArenaFactory as `0x${string}`,
        abi: ArenaFactoryAbi,
        functionName: 'getArenasOfARanking',
        args: [ranking],
        chainId: getChainId(),
      });

      return result as string[];
    } catch (error) {
      console.error(`Error fetching arenas for ranking ${ranking}:`, error);
      return [];
    }
  },

  /**
   * Get all arenas grouped by ranking
   */
  async getAllArenasByRanking(): Promise<RankingArenas> {
    try {
      const rankings = [
        Ranking.UNRANKED,
        Ranking.BRONZE,
        Ranking.SILVER,
        Ranking.GOLD,
        Ranking.PLATINUM
      ];

      const arenasPromises = rankings.map(ranking => 
        this.getArenasOfRanking(ranking)
      );

      const arenasResults = await Promise.all(arenasPromises);

      return {
        UNRANKED: arenasResults[0],
        BRONZE: arenasResults[1],
        SILVER: arenasResults[2],
        GOLD: arenasResults[3],
        PLATINUM: arenasResults[4]
      };
    } catch (error) {
      console.error('Error fetching all arenas by ranking:', error);
      return {
        UNRANKED: [],
        BRONZE: [],
        SILVER: [],
        GOLD: [],
        PLATINUM: []
      };
    }
  },

  /**
   * Get all arenas (from any ranking)
   */
  async getAllArenas(): Promise<string[]> {
    try {
      const result = await readContract(rainbowKitConfig, {
        address: getContracts().ArenaFactory as `0x${string}`,
        abi: ArenaFactoryAbi,
        functionName: 'getArenas',
        chainId: getChainId(),
      });

      return result as string[];
    } catch (error) {
      console.error('Error fetching all arenas:', error);
      return [];
    }
  },

  /**
   * Get the ranking of a specific arena
   */
  async getArenaRanking(arenaAddress: string): Promise<Ranking | null> {
    try {
      const result = await readContract(rainbowKitConfig, {
        address: getContracts().ArenaFactory as `0x${string}`,
        abi: ArenaFactoryAbi,
        functionName: 'getArenaRanking',
        args: [arenaAddress as `0x${string}`],
        chainId: getChainId(),
      });

      return result as Ranking;
    } catch (error) {
      console.error(`Error fetching ranking for arena ${arenaAddress}:`, error);
      return null;
    }
  },

  /**
   * Check if an address is a valid arena
   */
  async isArenaAddress(address: string): Promise<boolean> {
    try {
      const result = await readContract(rainbowKitConfig, {
        address: getContracts().ArenaFactory as `0x${string}`,
        abi: ArenaFactoryAbi,
        functionName: 'isArenaAddress',
        args: [address as `0x${string}`],
        chainId: getChainId(),
      });

      return result as boolean;
    } catch (error) {
      console.error(`Error checking if ${address} is arena:`, error);
      return false;
    }
  }
}; 