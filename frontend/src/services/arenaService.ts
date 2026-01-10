import { readContract, writeContract } from '@wagmi/core';
import { getContracts, crownTokenAbi, ArenaAbi, getChainId } from '../constants';
import rainbowKitConfig from '../rainbowKitConfig';
import { warriorsNFTService, type WarriorsDetails } from './warriorsNFTService';

// Utility functions for 18-decimal precision conversion
const WEI_DECIMALS = 18;
const WEI_MULTIPLIER = BigInt(10 ** WEI_DECIMALS);

/**
 * Convert from contract value (wei) to human-readable format
 * @param weiValue - Value in wei (1e18 precision)
 * @returns Human-readable number
 */
const fromWei = (weiValue: bigint | number | string): number => {
  const bigintValue = typeof weiValue === 'bigint' ? weiValue : BigInt(weiValue.toString());
  return Number(bigintValue) / Number(WEI_MULTIPLIER);
};

/**
 * Convert from human-readable format to contract value (wei)
 * @param humanValue - Human-readable number
 * @returns BigInt value in wei (1e18 precision)
 */
const toWei = (humanValue: number | string): bigint => {
  const numValue = typeof humanValue === 'string' ? parseFloat(humanValue) : humanValue;
  return BigInt(Math.floor(numValue * Number(WEI_MULTIPLIER)));
};

// Utility functions for decimal conversion
// const formatFromWei = (value: bigint | number | string): string => {
//   const numberValue = fromWei(value);
//   return numberValue.toLocaleString('fullwide', { useGrouping: false });
// };

// const formatToWei = (value: number | string): string => {
//   const bigintValue = toWei(value);
//   return bigintValue.toString();
// };

export interface ArenaDetails {
  warriorsOneNFTId: number;
  warriorsTwoNFTId: number;
  warriorsOneDetails?: WarriorsDetails;
  warriorsTwoDetails?: WarriorsDetails;
  currentRound: number;
  isInitialized: boolean;
  isBattleOngoing: boolean;
  isBettingPeriod: boolean;
  gameInitializedAt: number;
  lastRoundEndedAt: number;
  minBettingPeriod: number;
  damageOnWarriorsOne: number;
  damageOnWarriorsTwo: number;
  betAmount: number;
  costToInfluence: number;
  costToDefluence: number;
  costToInfluenceWarriorsOne: number;
  costToInfluenceWarriorsTwo: number;
  costToDefluenceWarriorsOne: number;
  costToDefluenceWarriorsTwo: number;
  playerOneBetAddresses: string[];
  playerTwoBetAddresses: string[];
}

export const arenaService = {
  /**
   * Approve CRwN tokens for an arena contract
   * @param arenaAddress - The arena contract address
   * @param amount - Amount to approve in wei
   */
  async approveCrwnTokens(arenaAddress: string, amount: bigint): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: getContracts().crownToken as `0x${string}`,
        abi: crownTokenAbi,
        functionName: 'approve',
        args: [arenaAddress as `0x${string}`, amount],
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error approving CRwN tokens:', error);
      throw error;
    }
  },

  /**
   * Check CRwN token allowance for an arena contract
   * @param userAddress - User's wallet address
   * @param arenaAddress - The arena contract address
   */
  async getCrwnAllowance(userAddress: string, arenaAddress: string): Promise<bigint> {
    try {
      const allowance = await readContract(rainbowKitConfig, {
        address: getContracts().crownToken as `0x${string}`,
        abi: crownTokenAbi,
        functionName: 'allowance',
        args: [userAddress as `0x${string}`, arenaAddress as `0x${string}`],
        chainId: getChainId(),
      });

      return allowance as bigint;
    } catch (error) {
      console.error('Error checking CRwN allowance:', error);
      throw error;
    }
  },

  /**
   * Check user's CRwN token balance
   * @param userAddress - User's wallet address
   */
  async getCrwnBalance(userAddress: string): Promise<bigint> {
    try {
      const balance = await readContract(rainbowKitConfig, {
        address: getContracts().crownToken as `0x${string}`,
        abi: crownTokenAbi,
        functionName: 'balanceOf',
        args: [userAddress as `0x${string}`],
        chainId: getChainId(),
      });

      return balance as bigint;
    } catch (error) {
      console.error('Error checking CRwN balance:', error);
      throw error;
    }
  },

  /**
   * Initialize a game in a specific arena
   */
  async initializeGame(
    arenaAddress: string,
    warriorsOneNFTId: number,
    warriorsTwoNFTId: number
  ): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'initializeGame',
        args: [BigInt(warriorsOneNFTId), BigInt(warriorsTwoNFTId)],
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error initializing game:', error);
      throw error;
    }
  },

  /**
   * Get arena details with Warriors metadata
   */
  async getArenaDetails(arenaAddress: string): Promise<ArenaDetails> {
    try {
      const [
        warriorsOneNFTId,
        warriorsTwoNFTId,
        currentRound,
        isInitialized,
        // isBattleOngoing, // Removed - using new isBattleOngoing function instead
        gameInitializedAt,
        lastRoundEndedAt,
        damageOnWarriorsOne,
        damageOnWarriorsTwo,
        betAmount,
        costToInfluence,
        costToDefluence,
        costToInfluenceWarriorsOne,
        costToInfluenceWarriorsTwo,
        costToDefluenceWarriorsOne,
        costToDefluenceWarriorsTwo,
        playerOneBetAddresses,
        playerTwoBetAddresses,
        minBettingPeriod
      ] = await Promise.all([
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getWarriorsOneNFTId',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getWarriorsTwoNFTId',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getCurrentRound',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getInitializationStatus',
          chainId: getChainId(),
        }),
        // Removed getBattleStatus - using new isBattleOngoing function instead
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getGameInitializedAt',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getLastRoundEndedAt',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getDamageOnWarriorsOne',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getDamageOnWarriorsTwo',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getBetAmount',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getCostToInfluence',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getCostToDefluence',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getCostToInfluenceWarriorsOne',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getCostToInfluenceWarriorsTwo',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getCostToDefluenceWarriorsOne',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getCostToDefluenceWarriorsTwo',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getPlayerOneBetAddresses',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getPlayerTwoBetAddresses',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getMinWarriorsBettingPeriod',
          chainId: getChainId(),
        })
      ]);

      const calculatedBettingPeriod = this.isBettingPeriodOver(
        Number(gameInitializedAt), 
        Number(minBettingPeriod)
      );

      // Check if battle is ongoing using the specific contract checks
      const battleOngoing = await this.isBattleOngoing(arenaAddress);

      const arenaDetails: ArenaDetails = {
        warriorsOneNFTId: Number(warriorsOneNFTId),
        warriorsTwoNFTId: Number(warriorsTwoNFTId),
        currentRound: Number(currentRound),
        isInitialized: Boolean(isInitialized),
        isBattleOngoing: battleOngoing,
        isBettingPeriod: Boolean(isInitialized) && !calculatedBettingPeriod && Number(currentRound) === 0,
        gameInitializedAt: Number(gameInitializedAt),
        lastRoundEndedAt: Number(lastRoundEndedAt),
        minBettingPeriod: Number(minBettingPeriod),
        damageOnWarriorsOne: Number(damageOnWarriorsOne),
        damageOnWarriorsTwo: Number(damageOnWarriorsTwo),
        betAmount: fromWei(betAmount as bigint),
        costToInfluence: fromWei(costToInfluence as bigint),
        costToDefluence: fromWei(costToDefluence as bigint),
        costToInfluenceWarriorsOne: fromWei(costToInfluenceWarriorsOne as bigint),
        costToInfluenceWarriorsTwo: fromWei(costToInfluenceWarriorsTwo as bigint),
        costToDefluenceWarriorsOne: fromWei(costToDefluenceWarriorsOne as bigint),
        costToDefluenceWarriorsTwo: fromWei(costToDefluenceWarriorsTwo as bigint),
        playerOneBetAddresses: playerOneBetAddresses as string[],
        playerTwoBetAddresses: playerTwoBetAddresses as string[]
      };

      // Fetch Warriors details if arena is initialized and has valid NFT IDs
      if (arenaDetails.isInitialized && arenaDetails.warriorsOneNFTId > 0 && arenaDetails.warriorsTwoNFTId > 0) {
        try {
          console.log(`Fetching Warriors details for arena ${arenaAddress}...`);
          const [warriorsOneDetails, warriorsTwoDetails] = await Promise.all([
            warriorsNFTService.getWarriorsDetails(arenaDetails.warriorsOneNFTId),
            warriorsNFTService.getWarriorsDetails(arenaDetails.warriorsTwoNFTId)
          ]);
          
          arenaDetails.warriorsOneDetails = warriorsOneDetails;
          arenaDetails.warriorsTwoDetails = warriorsTwoDetails;
          console.log(`✅ Warriors details fetched for arena ${arenaAddress}`);
        } catch (error) {
          console.warn(`Failed to fetch Warriors details for arena ${arenaAddress}:`, error);
          // Continue without Warriors details - they can be fetched later
        }
      }

      return arenaDetails;
    } catch (error) {
      console.error(`Error fetching arena details for ${arenaAddress}:`, error);
      throw error;
    }
  },

  /**
   * Bet on Warriors One
   */
  async betOnWarriorsOne(arenaAddress: string, multiplier: number): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'betOnWarriorsOne',
        args: [BigInt(multiplier)],
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error betting on Warriors One:', error);
      throw error;
    }
  },

  /**
   * Bet on Warriors Two
   */
  async betOnWarriorsTwo(arenaAddress: string, multiplier: number): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'betOnWarriorsTwo',
        args: [BigInt(multiplier)],
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error betting on Warriors Two:', error);
      throw error;
    }
  },

  /**
   * Start the game
   */
  async startGame(arenaAddress: string): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'startGame',
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error starting game:', error);
      throw error;
    }
  },

  /**
   * Influence Warriors One
   */
  async influenceWarriorsOne(arenaAddress: string): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'influenceWarriorsOne',
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error influencing Warriors One:', error);
      throw error;
    }
  },

  /**
   * Influence Warriors Two
   */
  async influenceWarriorsTwo(arenaAddress: string): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'influenceWarriorsTwo',
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error influencing Warriors Two:', error);
      throw error;
    }
  },

  /**
   * Defluence Warriors One
   */
  async defluenceWarriorsOne(arenaAddress: string): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'defluenceWarriorsOne',
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error defluencing Warriors One:', error);
      throw error;
    }
  },

  /**
   * Defluence Warriors Two
   */
  async defluenceWarriorsTwo(arenaAddress: string): Promise<string> {
    try {
      const hash = await writeContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'defluenceWarriorsTwo',
        chainId: getChainId(),
      });

      return hash;
    } catch (error) {
      console.error('Error defluencing Warriors Two:', error);
      throw error;
    }
  },

  /**
   * Bet on Warriors One
   * @param arenaAddress - The arena contract address
   * @param betAmountInTokens - The bet amount in human-readable format (e.g., 6 for 6 CRwN)
   */
  async betOnWarriorsOneWithAmount(arenaAddress: string, betAmountInTokens: number): Promise<string> {
    try {
      // Get arena details to find the base bet amount
      const arenaDetails = await this.getArenaDetails(arenaAddress);
      const baseBetAmount = arenaDetails.betAmount; // This is already converted from wei
      
      // Calculate multiplier - must be a whole number multiple of base bet amount
      const multiplier = Math.round(betAmountInTokens / baseBetAmount);
      
      // Validate that the amount is a valid multiple
      if (multiplier < 1 || Math.abs(multiplier * baseBetAmount - betAmountInTokens) > 0.001) {
        throw new Error(`Bet amount must be a multiple of ${baseBetAmount} CRwN. Valid amounts: ${baseBetAmount}, ${baseBetAmount * 2}, ${baseBetAmount * 3}, etc.`);
      }
      
      return await this.betOnWarriorsOne(arenaAddress, multiplier);
    } catch (error) {
      console.error('Error betting on Warriors One with amount:', error);
      throw error;
    }
  },

  /**
   * Bet on Warriors Two
   * @param arenaAddress - The arena contract address
   * @param betAmountInTokens - The bet amount in human-readable format (e.g., 6 for 6 CRwN)
   */
  async betOnWarriorsTwoWithAmount(arenaAddress: string, betAmountInTokens: number): Promise<string> {
    try {
      // Get arena details to find the base bet amount
      const arenaDetails = await this.getArenaDetails(arenaAddress);
      const baseBetAmount = arenaDetails.betAmount; // This is already converted from wei
      
      // Calculate multiplier - must be a whole number multiple of base bet amount
      const multiplier = Math.round(betAmountInTokens / baseBetAmount);
      
      // Validate that the amount is a valid multiple
      if (multiplier < 1 || Math.abs(multiplier * baseBetAmount - betAmountInTokens) > 0.001) {
        throw new Error(`Bet amount must be a multiple of ${baseBetAmount} CRwN. Valid amounts: ${baseBetAmount}, ${baseBetAmount * 2}, ${baseBetAmount * 3}, etc.`);
      }
      
      return await this.betOnWarriorsTwo(arenaAddress, multiplier);
    } catch (error) {
      console.error('Error betting on Warriors Two with amount:', error);
      throw error;
    }
  },

  /**
   * Check if the betting period is currently ongoing
   * @param arenaAddress - The arena contract address
   */
  async getIsBettingPeriodGoingOn(arenaAddress: string): Promise<boolean> {
    try {
      const isBettingPeriod = await readContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getIsBettingPeriodGoingOn',
        chainId: getChainId(),
      });

      return Boolean(isBettingPeriod);
    } catch (error) {
      console.error('Error checking betting period status:', error);
      throw error;
    }
  },

  /**
   * Get the minimum betting period duration
   * @param arenaAddress - The arena contract address
   */
  async getMinWarriorsBettingPeriod(arenaAddress: string): Promise<number> {
    try {
      const minBettingPeriod = await readContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getMinWarriorsBettingPeriod',
        chainId: getChainId(),
      });

      return Number(minBettingPeriod);
    } catch (error) {
      console.error('Error getting min betting period:', error);
      throw error;
    }
  },

  /**
   * Calculate if betting period is over based on time
   * @param gameInitializedAt - Unix timestamp when game was initialized
   * @param minBettingPeriod - Minimum betting period in seconds
   */
  isBettingPeriodOver(gameInitializedAt: number, minBettingPeriod: number): boolean {
    const currentTime = Math.floor(Date.now() / 1000); // Current time in seconds
    const bettingEndTime = gameInitializedAt + minBettingPeriod;
    return currentTime >= bettingEndTime;
  },

  /**
   * Check if battle is ongoing based on initialization status and betting period
   * @param arenaAddress - The arena contract address
   * @returns Promise<boolean> - True if battle is ongoing
   */
  async isBattleOngoing(arenaAddress: string): Promise<boolean> {
    try {
      const [initializationStatus, isBettingPeriodGoingOn] = await Promise.all([
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getInitializationStatus',
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: arenaAddress as `0x${string}`,
          abi: ArenaAbi,
          functionName: 'getIsBettingPeriodGoingOn',
          chainId: getChainId(),
        })
      ]);

      // Battle is ongoing if:
      // 1. Arena is initialized (getInitializationStatus() returns true)
      // 2. Betting period is not going on (getIsBettingPeriodGoingOn() returns false)
      return Boolean(initializationStatus) && !Boolean(isBettingPeriodGoingOn);
    } catch (error) {
      console.error('Error checking if battle is ongoing:', error);
      return false;
    }
  },

  /**
   * Get current round number for an arena
   */
  async getCurrentRound(arenaAddress: string): Promise<number> {
    try {
      const result = await readContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getCurrentRound',
        chainId: getChainId(),
      });
      return Number(result);
    } catch (error) {
      console.error('Error reading current round:', error);
      return 0;
    }
  },

  /**
   * Get damage on Warriors One
   */
  async getDamageOnWarriorsOne(arenaAddress: string): Promise<number> {
    try {
      const result = await readContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getDamageOnWarriorsOne',
        chainId: getChainId(),
      });
      return Number(result);
    } catch (error) {
      console.error('Error reading damage on Warriors One:', error);
      return 0;
    }
  },

  /**
   * Get damage on Warriors Two
   */
  async getDamageOnWarriorsTwo(arenaAddress: string): Promise<number> {
    try {
      const result = await readContract(rainbowKitConfig, {
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getDamageOnWarriorsTwo',
        chainId: getChainId(),
      });
      return Number(result);
    } catch (error) {
      console.error('Error reading damage on Warriors Two:', error);
      return 0;
    }
  },

  // ...existing code...
};

/**
 * Calculate valid betting amounts for an arena
 * @param baseBetAmount - The base betting amount from the arena
 * @param maxMultiplier - Maximum multiplier to calculate (default: 10)
 * @returns Array of valid betting amounts
 */
export const getValidBettingAmounts = (baseBetAmount: number, maxMultiplier: number = 10): number[] => {
  const amounts: number[] = [];
  for (let i = 1; i <= maxMultiplier; i++) {
    amounts.push(baseBetAmount * i);
  }
  return amounts;
};

/**
 * Check if a betting amount is valid (multiple of base amount)
 * @param amount - The amount to check
 * @param baseBetAmount - The base betting amount
 * @returns boolean indicating if amount is valid
 */
export const isValidBettingAmount = (amount: number, baseBetAmount: number): boolean => {
  if (amount <= 0 || baseBetAmount <= 0) return false;
  return Math.abs(amount % baseBetAmount) < 0.001; // Allow small floating point errors
};

/**
 * Get the closest valid betting amount
 * @param amount - The desired amount
 * @param baseBetAmount - The base betting amount
 * @returns The closest valid betting amount
 */
export const getClosestValidBettingAmount = (amount: number, baseBetAmount: number): number => {
  if (amount <= 0) return baseBetAmount;
  const multiplier = Math.round(amount / baseBetAmount);
  return Math.max(1, multiplier) * baseBetAmount;
};

// Export utility functions for use in other components
export { fromWei, toWei };
