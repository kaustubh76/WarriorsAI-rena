/**
 * Micro Market Service
 * Handles all interactions with the MicroMarketFactory smart contract
 * Uses shared RPC client with rate limiting and caching
 */

import {
  formatEther,
  parseEther,
  type Address,
} from 'viem';
import { readContractWithRateLimit, batchReadContractsWithRateLimit } from '../lib/rpcClient';
import { chainsToContracts, MicroMarketFactoryAbi, crownTokenAbi , getChainId } from '../constants';
import type {
  MicroMarket,
  MicroMarketPosition,
  RoundData,
  MicroMarketDisplay,
  MicroMarketPositionDisplay,
  BattleMicroMarkets,
  RoundMarkets,
  MicroMarketFilters,
  MicroMarketSortOptions
} from '../types/microMarket';
import {
  getMarketTypeLabel,
  getMarketStatusLabel,
  getOutcomeLabel,
  calculateMicroMarketPrices,
  isMarketTradeable,
  formatTimeRemaining,
} from '../types/microMarket';

// Re-export types
export * from '../types/microMarket';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

// Cache TTL configurations (in ms)
const CACHE_TTL = {
  MARKET: 15000,          // 15 seconds - market data changes with trades
  POSITION: 10000,        // 10 seconds - positions change with user trades
  STATIC: 300000,         // 5 minutes - static data like next market ID
  PRICE: 5000,            // 5 seconds - prices change frequently
  ROUND: 30000,           // 30 seconds - round data
};

class MicroMarketService {
  private microMarketAddress: Address;
  private crownTokenAddress: Address;
  private chainId: number = getChainId();

  constructor() {
    const contracts = chainsToContracts[this.chainId];
    this.microMarketAddress = contracts.microMarketFactory as Address;
    this.crownTokenAddress = contracts.crownToken as Address;
  }

  /**
   * Check if contract is deployed
   */
  isContractDeployed(): boolean {
    return this.microMarketAddress !== ZERO_ADDRESS;
  }

  /**
   * Set contract address
   */
  setContractAddress(address: Address) {
    this.microMarketAddress = address;
  }

  // ============================================================================
  // Read Functions (with rate limiting and caching)
  // ============================================================================

  /**
   * Get market by ID
   */
  async getMarket(marketId: bigint): Promise<MicroMarket | null> {
    if (!this.isContractDeployed()) return null;

    try {
      return await readContractWithRateLimit({
        address: this.microMarketAddress,
        abi: MicroMarketFactoryAbi,
        functionName: 'getMarket',
        args: [marketId]
      }, { cacheTTL: CACHE_TTL.MARKET }) as MicroMarket;
    } catch (error) {
      console.error('Error fetching micro market:', error);
      return null;
    }
  }

  /**
   * Get market prices
   */
  async getPrice(marketId: bigint): Promise<{ yesPrice: bigint; noPrice: bigint }> {
    try {
      const [yesPrice, noPrice] = await readContractWithRateLimit({
        address: this.microMarketAddress,
        abi: MicroMarketFactoryAbi,
        functionName: 'getPrice',
        args: [marketId]
      }, { cacheTTL: CACHE_TTL.PRICE }) as [bigint, bigint];
      return { yesPrice, noPrice };
    } catch (error) {
      console.error('Error fetching price:', error);
      return { yesPrice: BigInt(5000), noPrice: BigInt(5000) };
    }
  }

  /**
   * Get user position in a market
   */
  async getPosition(marketId: bigint, user: Address): Promise<MicroMarketPosition | null> {
    try {
      return await readContractWithRateLimit({
        address: this.microMarketAddress,
        abi: MicroMarketFactoryAbi,
        functionName: 'getPosition',
        args: [marketId, user]
      }, { cacheTTL: CACHE_TTL.POSITION }) as MicroMarketPosition;
    } catch (error) {
      console.error('Error fetching position:', error);
      return null;
    }
  }

  /**
   * Get all micro markets for a battle
   */
  async getBattleMicroMarkets(battleId: bigint): Promise<bigint[]> {
    try {
      return await readContractWithRateLimit({
        address: this.microMarketAddress,
        abi: MicroMarketFactoryAbi,
        functionName: 'getBattleMicroMarkets',
        args: [battleId]
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint[];
    } catch (error) {
      console.error('Error fetching battle micro markets:', error);
      return [];
    }
  }

  /**
   * Get round data for a battle
   */
  async getRoundData(battleId: bigint, round: number): Promise<RoundData | null> {
    try {
      return await readContractWithRateLimit({
        address: this.microMarketAddress,
        abi: MicroMarketFactoryAbi,
        functionName: 'getRoundData',
        args: [battleId, round]
      }, { cacheTTL: CACHE_TTL.ROUND }) as RoundData;
    } catch (error) {
      console.error('Error fetching round data:', error);
      return null;
    }
  }

  /**
   * Get all active markets
   */
  async getActiveMarkets(): Promise<bigint[]> {
    try {
      return await readContractWithRateLimit({
        address: this.microMarketAddress,
        abi: MicroMarketFactoryAbi,
        functionName: 'getActiveMarkets'
      }, { cacheTTL: CACHE_TTL.MARKET }) as bigint[];
    } catch (error) {
      console.error('Error fetching active markets:', error);
      return [];
    }
  }

  /**
   * Get next market ID
   */
  async getNextMarketId(): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.microMarketAddress,
        abi: MicroMarketFactoryAbi,
        functionName: 'nextMarketId'
      }, { cacheTTL: CACHE_TTL.STATIC }) as bigint;
    } catch (error) {
      console.error('Error fetching next market ID:', error);
      return BigInt(1);
    }
  }

  // ============================================================================
  // Aggregated Functions (optimized with batching)
  // ============================================================================

  /**
   * Get market with display values
   */
  async getMarketWithDisplay(marketId: bigint): Promise<MicroMarketDisplay | null> {
    const market = await this.getMarket(marketId);
    if (!market) return null;

    const { yesPrice, noPrice } = calculateMicroMarketPrices(market);
    const now = BigInt(Math.floor(Date.now() / 1000));

    return {
      ...market,
      yesPrice,
      noPrice,
      totalVolumeFormatted: formatEther(market.totalVolume),
      timeRemaining: formatTimeRemaining(market.endTime),
      statusLabel: getMarketStatusLabel(market.status),
      outcomeLabel: getOutcomeLabel(market.outcome),
      typeLabel: getMarketTypeLabel(market.marketType),
      roundLabel: market.roundNumber > 0 ? `Round ${market.roundNumber}` : 'All Rounds',
      isExpired: now >= market.endTime,
      canTrade: isMarketTradeable(market)
    };
  }

  /**
   * Get position with display values
   */
  async getPositionWithDisplay(
    marketId: bigint,
    user: Address
  ): Promise<MicroMarketPositionDisplay | null> {
    const position = await this.getPosition(marketId, user);
    if (!position) return null;

    const market = await this.getMarket(marketId);
    const winningPool = market?.outcome === 1 ? position.yesTokens : position.noTokens;
    const potentialPayout = winningPool; // 1:1 payout on winning shares

    return {
      ...position,
      yesTokensFormatted: formatEther(position.yesTokens),
      noTokensFormatted: formatEther(position.noTokens),
      totalInvestedFormatted: formatEther(position.totalInvested),
      potentialPayout,
      potentialPayoutFormatted: formatEther(potentialPayout)
    };
  }

  /**
   * Get all markets for a battle grouped by type - optimized with batching
   */
  async getBattleMarketsGrouped(battleId: bigint): Promise<BattleMicroMarkets | null> {
    const marketIds = await this.getBattleMicroMarkets(battleId);
    if (marketIds.length === 0) return null;

    // Batch fetch all markets
    const marketCalls = marketIds.map(id => ({
      address: this.microMarketAddress,
      abi: MicroMarketFactoryAbi,
      functionName: 'getMarket',
      args: [id]
    }));

    const markets = await batchReadContractsWithRateLimit<MicroMarket[]>(
      marketCalls,
      { cacheTTL: CACHE_TTL.MARKET }
    );

    const roundWinners: MicroMarket[] = [];
    const movePredictions: MicroMarket[] = [];
    const damageThresholds: MicroMarket[] = [];
    const specialMarkets: MicroMarket[] = [];

    let warrior1Id = BigInt(0);
    let warrior2Id = BigInt(0);

    for (const market of markets) {
      if (!market) continue;

      if (warrior1Id === BigInt(0)) {
        warrior1Id = market.warrior1Id;
        warrior2Id = market.warrior2Id;
      }

      switch (market.marketType) {
        case 0: // ROUND_WINNER
          roundWinners.push(market);
          break;
        case 1: // MOVE_PREDICTION
          movePredictions.push(market);
          break;
        case 2: // DAMAGE_THRESHOLD
          damageThresholds.push(market);
          break;
        default: // FIRST_BLOOD, COMEBACK, etc.
          specialMarkets.push(market);
      }
    }

    return {
      battleId,
      warrior1Id,
      warrior2Id,
      roundWinners,
      movePredictions,
      damageThresholds,
      specialMarkets
    };
  }

  /**
   * Get markets grouped by round - optimized with batching
   */
  async getMarketsByRound(battleId: bigint): Promise<RoundMarkets[]> {
    const marketIds = await this.getBattleMicroMarkets(battleId);

    if (marketIds.length === 0) return [];

    // Batch fetch all markets
    const marketCalls = marketIds.map(id => ({
      address: this.microMarketAddress,
      abi: MicroMarketFactoryAbi,
      functionName: 'getMarket',
      args: [id]
    }));

    const markets = await batchReadContractsWithRateLimit<MicroMarket[]>(
      marketCalls,
      { cacheTTL: CACHE_TTL.MARKET }
    );

    const roundsMap = new Map<number, MicroMarket[]>();

    for (const market of markets) {
      if (!market) continue;

      const round = market.roundNumber;
      if (!roundsMap.has(round)) {
        roundsMap.set(round, []);
      }
      roundsMap.get(round)!.push(market);
    }

    // Batch fetch round data
    const uniqueRounds = Array.from(roundsMap.keys());
    const roundDataCalls = uniqueRounds.map(round => ({
      address: this.microMarketAddress,
      abi: MicroMarketFactoryAbi,
      functionName: 'getRoundData',
      args: [battleId, round]
    }));

    const roundDataResults = await batchReadContractsWithRateLimit<(RoundData | null)[]>(
      roundDataCalls,
      { cacheTTL: CACHE_TTL.ROUND }
    );

    const rounds: RoundMarkets[] = [];
    for (let i = 0; i < uniqueRounds.length; i++) {
      const roundNumber = uniqueRounds[i];
      const marketsForRound = roundsMap.get(roundNumber) || [];
      const roundData = roundDataResults[i];

      rounds.push({
        roundNumber,
        markets: marketsForRound,
        roundData,
        isActive: marketsForRound.some(m => m.status === 0), // ACTIVE
        isResolved: roundData?.isResolved ?? false
      });
    }

    return rounds.sort((a, b) => a.roundNumber - b.roundNumber);
  }

  /**
   * Filter and sort markets - optimized
   */
  async getFilteredMarkets(
    filters: MicroMarketFilters,
    sort: MicroMarketSortOptions
  ): Promise<MicroMarketDisplay[]> {
    let marketIds: bigint[];

    if (filters.battleId) {
      marketIds = await this.getBattleMicroMarkets(filters.battleId);
    } else {
      marketIds = await this.getActiveMarkets();
    }

    if (marketIds.length === 0) return [];

    // Batch fetch all markets
    const marketCalls = marketIds.map(id => ({
      address: this.microMarketAddress,
      abi: MicroMarketFactoryAbi,
      functionName: 'getMarket',
      args: [id]
    }));

    const markets = await batchReadContractsWithRateLimit<MicroMarket[]>(
      marketCalls,
      { cacheTTL: CACHE_TTL.MARKET }
    );

    const displayMarkets: MicroMarketDisplay[] = [];

    for (const market of markets) {
      if (!market) continue;

      // Apply filters
      if (filters.type && filters.type !== 'all' && market.marketType !== filters.type) continue;
      if (filters.status && filters.status !== 'all' && market.status !== filters.status) continue;
      if (filters.roundNumber && filters.roundNumber !== 'all' && market.roundNumber !== filters.roundNumber) continue;

      const { yesPrice, noPrice } = calculateMicroMarketPrices(market);
      const now = BigInt(Math.floor(Date.now() / 1000));

      displayMarkets.push({
        ...market,
        yesPrice,
        noPrice,
        totalVolumeFormatted: formatEther(market.totalVolume),
        timeRemaining: formatTimeRemaining(market.endTime),
        statusLabel: getMarketStatusLabel(market.status),
        outcomeLabel: getOutcomeLabel(market.outcome),
        typeLabel: getMarketTypeLabel(market.marketType),
        roundLabel: market.roundNumber > 0 ? `Round ${market.roundNumber}` : 'All Rounds',
        isExpired: now >= market.endTime,
        canTrade: isMarketTradeable(market)
      });
    }

    // Sort
    displayMarkets.sort((a, b) => {
      let comparison = 0;
      switch (sort.field) {
        case 'endTime':
          comparison = Number(a.endTime - b.endTime);
          break;
        case 'totalVolume':
          comparison = Number(a.totalVolume - b.totalVolume);
          break;
        case 'yesPrice':
          comparison = a.yesPrice - b.yesPrice;
          break;
        case 'roundNumber':
          comparison = a.roundNumber - b.roundNumber;
          break;
        case 'createdAt':
          comparison = Number(a.createdAt - b.createdAt);
          break;
      }
      return sort.direction === 'desc' ? -comparison : comparison;
    });

    return displayMarkets;
  }

  // ============================================================================
  // Helper Functions
  // ============================================================================

  /**
   * Format price to percentage
   */
  formatPriceToPercent(price: bigint): string {
    return (Number(price) / 100).toFixed(1) + '%';
  }

  /**
   * Format volume
   */
  formatVolume(volume: bigint): string {
    const num = Number(formatEther(volume));
    if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(2)}K`;
    return num.toFixed(2);
  }

  /**
   * Parse amount
   */
  parseAmount(amount: string): bigint {
    return parseEther(amount);
  }

  /**
   * Check token allowance
   */
  async checkAllowance(owner: Address): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.crownTokenAddress,
        abi: crownTokenAbi,
        functionName: 'allowance',
        args: [owner, this.microMarketAddress]
      }, { cacheTTL: CACHE_TTL.POSITION }) as bigint;
    } catch (error) {
      console.error('Error checking allowance:', error);
      return BigInt(0);
    }
  }

  /**
   * Get token balance
   */
  async getBalance(address: Address): Promise<bigint> {
    try {
      return await readContractWithRateLimit({
        address: this.crownTokenAddress,
        abi: crownTokenAbi,
        functionName: 'balanceOf',
        args: [address]
      }, { cacheTTL: CACHE_TTL.POSITION }) as bigint;
    } catch (error) {
      console.error('Error checking balance:', error);
      return BigInt(0);
    }
  }

  /**
   * Get contract addresses
   */
  getAddresses() {
    return {
      microMarketFactory: this.microMarketAddress,
      crownToken: this.crownTokenAddress
    };
  }
}

export const microMarketService = new MicroMarketService();
export default microMarketService;
