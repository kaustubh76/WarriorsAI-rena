/**
 * Prediction Market Service
 * Handles all interactions with the PredictionMarketAMM smart contract
 * Uses shared RPC client with rate limiting and caching
 */

import {
  parseEther,
  formatEther,
  type Address,
  parseAbiItem,
} from 'viem';
import { readContractWithRateLimit, batchReadContractsWithRateLimit, getPublicClient } from '../lib/rpcClient';
import { getContracts, getChainId } from '../constants';

// Market status enum matching the contract (IPredictionMarket.sol)
export enum MarketStatus {
  Active = 0,    // ACTIVE
  Resolved = 1,  // RESOLVED
  Cancelled = 2  // CANCELLED
}

// Market outcome enum matching the contract (IPredictionMarket.sol)
export enum MarketOutcome {
  Undecided = 0, // UNDECIDED
  Yes = 1,       // YES
  No = 2,        // NO
  Invalid = 3    // INVALID
}

// Market interface matching the contract struct EXACTLY (IPredictionMarket.sol lines 24-40)
// Field order MUST match contract: id, question, endTime, resolutionTime, status, outcome,
// yesTokens, noTokens, liquidity, totalVolume, creator, battleId, warrior1Id, warrior2Id, createdAt
export interface Market {
  id: bigint;
  question: string;
  endTime: bigint;
  resolutionTime: bigint;
  status: MarketStatus;
  outcome: MarketOutcome;
  yesTokens: bigint;
  noTokens: bigint;
  liquidity: bigint;
  totalVolume: bigint;
  creator: Address;
  battleId: bigint;
  warrior1Id: bigint;
  warrior2Id: bigint;
  createdAt: bigint;
}

// User position interface matching contract (IPredictionMarket.sol lines 42-47)
export interface Position {
  yesTokens: bigint;
  noTokens: bigint;
  lpShares: bigint;
  totalInvested: bigint;
}

// Trade quote interface
export interface TradeQuote {
  sharesOut: bigint;
  priceImpact: number;
  effectivePrice: number;
}

// Market activity interface for event-based history
export interface MarketActivity {
  type: 'buy' | 'sell' | 'add_liquidity' | 'remove_liquidity' | 'claim';
  user: Address;
  amount: bigint;
  tokens: bigint;
  isYes?: boolean;
  timestamp: number;
  txHash: string;
  blockNumber: bigint;
}

// PredictionMarketAMM ABI (key functions)
// CRITICAL: Field order MUST match IPredictionMarket.sol Market struct exactly
export const PredictionMarketABI = [
  // Read functions
  {
    type: 'function',
    name: 'getMarket',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'question', type: 'string' },
        { name: 'endTime', type: 'uint256' },
        { name: 'resolutionTime', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'outcome', type: 'uint8' },
        { name: 'yesTokens', type: 'uint256' },
        { name: 'noTokens', type: 'uint256' },
        { name: 'liquidity', type: 'uint256' },
        { name: 'totalVolume', type: 'uint256' },
        { name: 'creator', type: 'address' },
        { name: 'battleId', type: 'uint256' },
        { name: 'warrior1Id', type: 'uint256' },
        { name: 'warrior2Id', type: 'uint256' },
        { name: 'createdAt', type: 'uint256' }
      ]
    }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getAllMarkets',
    inputs: [],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'id', type: 'uint256' },
        { name: 'question', type: 'string' },
        { name: 'endTime', type: 'uint256' },
        { name: 'resolutionTime', type: 'uint256' },
        { name: 'status', type: 'uint8' },
        { name: 'outcome', type: 'uint8' },
        { name: 'yesTokens', type: 'uint256' },
        { name: 'noTokens', type: 'uint256' },
        { name: 'liquidity', type: 'uint256' },
        { name: 'totalVolume', type: 'uint256' },
        { name: 'creator', type: 'address' },
        { name: 'battleId', type: 'uint256' },
        { name: 'warrior1Id', type: 'uint256' },
        { name: 'warrior2Id', type: 'uint256' },
        { name: 'createdAt', type: 'uint256' }
      ]
    }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getActiveMarkets',
    inputs: [],
    outputs: [{ type: 'uint256[]' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getPrice',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [
      { name: 'yesPrice', type: 'uint256' },
      { name: 'noPrice', type: 'uint256' }
    ],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'getPosition',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'user', type: 'address' }
    ],
    outputs: [{
      type: 'tuple',
      components: [
        { name: 'yesTokens', type: 'uint256' },
        { name: 'noTokens', type: 'uint256' },
        { name: 'lpShares', type: 'uint256' },
        { name: 'totalInvested', type: 'uint256' }
      ]
    }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'calculateBuyAmount',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'collateralAmount', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'calculateSellAmount',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'shareAmount', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'nextMarketId',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  // Write functions
  {
    type: 'function',
    name: 'createMarket',
    inputs: [
      { name: 'question', type: 'string' },
      { name: 'endTime', type: 'uint256' },
      { name: 'initialLiquidity', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'createBattleMarket',
    inputs: [
      { name: 'battleId', type: 'uint256' },
      { name: 'warrior1Id', type: 'uint256' },
      { name: 'warrior2Id', type: 'uint256' },
      { name: 'endTime', type: 'uint256' },
      { name: 'initialLiquidity', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'buy',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'collateralAmount', type: 'uint256' },
      { name: 'minSharesOut', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'sell',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'isYes', type: 'bool' },
      { name: 'shareAmount', type: 'uint256' },
      { name: 'minCollateralOut', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'addLiquidity',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'removeLiquidity',
    inputs: [
      { name: 'marketId', type: 'uint256' },
      { name: 'lpShares', type: 'uint256' }
    ],
    outputs: [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' }
    ],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'claimWinnings',
    inputs: [{ name: 'marketId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'nonpayable'
  },
  // Events (matching IPredictionMarket.sol)
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'question', type: 'string', indexed: false },
      { name: 'endTime', type: 'uint256', indexed: false },
      { name: 'creator', type: 'address', indexed: true },
      { name: 'battleId', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'TokensPurchased',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'collateralAmount', type: 'uint256', indexed: false },
      { name: 'tokensReceived', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'TokensSold',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'seller', type: 'address', indexed: true },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'tokenAmount', type: 'uint256', indexed: false },
      { name: 'collateralReceived', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'LiquidityAdded',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'collateralAmount', type: 'uint256', indexed: false },
      { name: 'lpTokensReceived', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'LiquidityRemoved',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'lpTokensBurned', type: 'uint256', indexed: false },
      { name: 'collateralReturned', type: 'uint256', indexed: false },
      { name: 'yesTokens', type: 'uint256', indexed: false },
      { name: 'noTokens', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'outcome', type: 'uint8', indexed: false },
      { name: 'resolver', type: 'address', indexed: true }
    ]
  },
  {
    type: 'event',
    name: 'WinningsClaimed',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'claimer', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false }
    ]
  }
] as const;

// ERC20 ABI for token approvals
export const ERC20ABI = [
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ type: 'bool' }],
    stateMutability: 'nonpayable'
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' }
    ],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  },
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view'
  }
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

// Cache TTL configurations (in ms)
const CACHE_TTL = {
  MARKET: 15000,          // 15 seconds - market data
  MARKETS_LIST: 30000,    // 30 seconds - all markets list
  PRICE: 5000,            // 5 seconds - prices change frequently
  POSITION: 10000,        // 10 seconds - user positions
  STATIC: 300000,         // 5 minutes - static data
  SHORT: 5000,            // 5 seconds
};

class PredictionMarketService {
  private predictionMarketAddress: Address;
  private crownTokenAddress: Address;
  private chainId: number = getChainId(); // Flow Testnet

  constructor() {
    // Load contract addresses from constants
    const contracts = getContracts();
    this.predictionMarketAddress = (contracts.predictionMarketAMM || ZERO_ADDRESS) as Address;
    this.crownTokenAddress = (contracts.crownToken || ZERO_ADDRESS) as Address;
  }

  /**
   * Check if the prediction market contract is deployed
   */
  isContractDeployed(): boolean {
    return this.predictionMarketAddress !== ZERO_ADDRESS;
  }

  /**
   * Set the prediction market contract address (call after deployment)
   */
  setPredictionMarketAddress(address: Address) {
    this.predictionMarketAddress = address;
  }

  /**
   * Get all markets
   */
  async getAllMarkets(): Promise<Market[]> {
    // Return empty array if contract not deployed
    if (!this.isContractDeployed()) {
      console.log('PredictionMarket contract not deployed yet. Returning empty markets.');
      return [];
    }

    try {
      const markets = await readContractWithRateLimit({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getAllMarkets'
      }, { cacheTTL: CACHE_TTL.MARKETS_LIST }) as Market[];

      // Filter out uninitialized/invalid markets (creator is zero address)
      const validMarkets = markets.filter(market =>
        market.creator !== ZERO_ADDRESS &&
        market.question &&
        market.question.length > 0
      );

      return validMarkets;
    } catch (error) {
      console.error('Error fetching markets:', error);
      return [];
    }
  }

  /**
   * Get a single market by ID
   */
  async getMarket(marketId: bigint): Promise<Market | null> {
    if (!this.isContractDeployed()) return null;

    try {
      const market = await readContractWithRateLimit({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getMarket',
        args: [marketId]
      }, { cacheTTL: CACHE_TTL.MARKET }) as Market;

      // Return null if market is uninitialized (creator is zero address)
      if (market.creator === ZERO_ADDRESS || !market.question || market.question.length === 0) {
        return null;
      }

      return market;
    } catch (error) {
      console.error('Error fetching market:', error);
      return null;
    }
  }

  /**
   * Get active market IDs
   */
  async getActiveMarketIds(): Promise<bigint[]> {
    if (!this.isContractDeployed()) return [];

    try {
      const marketIds = await readContractWithRateLimit({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getActiveMarkets'
      }, { cacheTTL: CACHE_TTL.MARKET }) as bigint[];
      return marketIds;
    } catch (error) {
      console.error('Error fetching active markets:', error);
      return [];
    }
  }

  /**
   * Get market prices (YES/NO probabilities)
   * Returns actual blockchain data - NO fallbacks to fake data
   */
  async getPrice(marketId: bigint): Promise<{ yesPrice: bigint; noPrice: bigint }> {
    if (!this.isContractDeployed()) {
      throw new Error('PredictionMarket contract not deployed');
    }

    const [yesPrice, noPrice] = await readContractWithRateLimit({
      address: this.predictionMarketAddress,
      abi: PredictionMarketABI,
      functionName: 'getPrice',
      args: [marketId]
    }, { cacheTTL: CACHE_TTL.PRICE }) as [bigint, bigint];
    return { yesPrice, noPrice };
  }

  /**
   * Get user position in a market
   */
  async getPosition(marketId: bigint, userAddress: Address): Promise<Position> {
    const emptyPosition: Position = {
      yesTokens: BigInt(0),
      noTokens: BigInt(0),
      lpShares: BigInt(0),
      totalInvested: BigInt(0)
    };

    if (!this.isContractDeployed()) {
      return emptyPosition;
    }

    try {
      const position = await readContractWithRateLimit({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getPosition',
        args: [marketId, userAddress]
      }, { cacheTTL: CACHE_TTL.POSITION }) as Position;
      return position;
    } catch (error) {
      console.error('Error fetching position:', error);
      return emptyPosition;
    }
  }

  /**
   * Calculate how many shares you'd get for a given collateral amount
   */
  async calculateBuyAmount(
    marketId: bigint,
    isYes: boolean,
    collateralAmount: bigint
  ): Promise<bigint> {
    if (!this.isContractDeployed()) return BigInt(0);

    try {
      const shares = await readContractWithRateLimit({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'calculateBuyAmount',
        args: [marketId, isYes, collateralAmount]
      }, { cacheTTL: CACHE_TTL.SHORT }) as bigint;
      return shares;
    } catch (error) {
      console.error('Error calculating buy amount:', error);
      return BigInt(0);
    }
  }

  /**
   * Calculate how much collateral you'd get for selling shares
   */
  async calculateSellAmount(
    marketId: bigint,
    isYes: boolean,
    shareAmount: bigint
  ): Promise<bigint> {
    if (!this.isContractDeployed()) return BigInt(0);

    try {
      const collateral = await readContractWithRateLimit({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'calculateSellAmount',
        args: [marketId, isYes, shareAmount]
      }, { cacheTTL: CACHE_TTL.SHORT }) as bigint;
      return collateral;
    } catch (error) {
      console.error('Error calculating sell amount:', error);
      return BigInt(0);
    }
  }

  /**
   * Get trade quote with price impact
   */
  async getTradeQuote(
    marketId: bigint,
    isYes: boolean,
    collateralAmount: bigint
  ): Promise<TradeQuote> {
    const { yesPrice, noPrice } = await this.getPrice(marketId);
    const currentPrice = isYes ? yesPrice : noPrice;
    const sharesOut = await this.calculateBuyAmount(marketId, isYes, collateralAmount);

    // Calculate effective price (collateral / shares)
    const effectivePrice = Number(collateralAmount) / Number(sharesOut);

    // Calculate price impact
    const priceImpact = (effectivePrice - Number(currentPrice) / 10000) / (Number(currentPrice) / 10000) * 100;

    return {
      sharesOut,
      priceImpact,
      effectivePrice
    };
  }

  /**
   * Check token allowance
   */
  async checkAllowance(ownerAddress: Address): Promise<bigint> {
    try {
      const allowance = await readContractWithRateLimit({
        address: this.crownTokenAddress,
        abi: ERC20ABI,
        functionName: 'allowance',
        args: [ownerAddress, this.predictionMarketAddress]
      }, { cacheTTL: CACHE_TTL.SHORT }) as bigint;
      return allowance;
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
      const balance = await readContractWithRateLimit({
        address: this.crownTokenAddress,
        abi: ERC20ABI,
        functionName: 'balanceOf',
        args: [address]
      }, { cacheTTL: CACHE_TTL.SHORT }) as bigint;
      return balance;
    } catch (error) {
      console.error('Error checking balance:', error);
      return BigInt(0);
    }
  }

  /**
   * Format price to percentage
   */
  formatPriceToPercent(price: bigint): string {
    return (Number(price) / 100).toFixed(1) + '%';
  }

  /**
   * Format shares to human readable
   */
  formatShares(shares: bigint): string {
    return formatEther(shares);
  }

  /**
   * Parse human readable amount to bigint
   */
  parseAmount(amount: string): bigint {
    return parseEther(amount);
  }

  /**
   * Get market status text
   */
  getMarketStatusText(status: MarketStatus): string {
    switch (status) {
      case MarketStatus.Active:
        return 'Active';
      case MarketStatus.Resolved:
        return 'Resolved';
      case MarketStatus.Cancelled:
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  }

  /**
   * Get market outcome text
   */
  getOutcomeText(outcome: MarketOutcome): string {
    switch (outcome) {
      case MarketOutcome.Undecided:
        return 'Pending';
      case MarketOutcome.Yes:
        return 'Yes';
      case MarketOutcome.No:
        return 'No';
      case MarketOutcome.Invalid:
        return 'Invalid';
      default:
        return 'Unknown';
    }
  }

  /**
   * Calculate potential payout
   */
  calculatePayout(shares: bigint): bigint {
    // Each winning share pays out 1 CRwN
    return shares;
  }

  /**
   * Get contract addresses
   */
  getAddresses() {
    return {
      predictionMarket: this.predictionMarketAddress,
      crownToken: this.crownTokenAddress
    };
  }

  /**
   * Get market activity from blockchain events
   * Fetches TokensPurchased, TokensSold, LiquidityAdded, LiquidityRemoved, WinningsClaimed events
   * Note: Flow testnet RPC has limitations, so we use a conservative approach
   */
  async getMarketActivity(marketId: bigint, limit: number = 50): Promise<MarketActivity[]> {
    if (!this.isContractDeployed()) {
      return [];
    }

    try {
      const publicClient = getPublicClient();
      const activities: MarketActivity[] = [];

      // Get current block for fromBlock calculation
      const currentBlock = await publicClient.getBlockNumber();
      // Use a small block range to avoid RPC limitations (1000 blocks ~30 min)
      const fromBlock = currentBlock - BigInt(1000);

      // Helper function to safely fetch logs with error handling
      const safeFetchLogs = async (eventSignature: string, eventName: string) => {
        try {
          const logs = await publicClient.getLogs({
            address: this.predictionMarketAddress,
            event: parseAbiItem(eventSignature),
            args: { marketId },
            fromBlock: fromBlock > 0n ? fromBlock : 0n,
            toBlock: 'latest'
          });
          return logs;
        } catch (err) {
          console.warn(`Failed to fetch ${eventName} events:`, err);
          return [];
        }
      };

      // Fetch events sequentially to avoid overwhelming the RPC
      const purchaseLogs = await safeFetchLogs(
        'event TokensPurchased(uint256 indexed marketId, address indexed buyer, bool isYes, uint256 collateralAmount, uint256 tokensReceived)',
        'TokensPurchased'
      );

      const sellLogs = await safeFetchLogs(
        'event TokensSold(uint256 indexed marketId, address indexed seller, bool isYes, uint256 tokenAmount, uint256 collateralReceived)',
        'TokensSold'
      );

      const addLiquidityLogs = await safeFetchLogs(
        'event LiquidityAdded(uint256 indexed marketId, address indexed provider, uint256 collateralAmount, uint256 lpTokensReceived)',
        'LiquidityAdded'
      );

      // Process TokensPurchased events
      for (const log of purchaseLogs) {
        activities.push({
          type: 'buy',
          user: log.args.buyer as Address,
          amount: log.args.collateralAmount as bigint,
          tokens: log.args.tokensReceived as bigint,
          isYes: log.args.isYes as boolean,
          timestamp: Math.floor(Date.now() / 1000) - Number(currentBlock - log.blockNumber) * 2, // Estimate timestamp
          txHash: log.transactionHash,
          blockNumber: log.blockNumber
        });
      }

      // Process TokensSold events
      for (const log of sellLogs) {
        activities.push({
          type: 'sell',
          user: log.args.seller as Address,
          amount: log.args.collateralReceived as bigint,
          tokens: log.args.tokenAmount as bigint,
          isYes: log.args.isYes as boolean,
          timestamp: Math.floor(Date.now() / 1000) - Number(currentBlock - log.blockNumber) * 2,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber
        });
      }

      // Process LiquidityAdded events
      for (const log of addLiquidityLogs) {
        activities.push({
          type: 'add_liquidity',
          user: log.args.provider as Address,
          amount: log.args.collateralAmount as bigint,
          tokens: log.args.lpTokensReceived as bigint,
          timestamp: Math.floor(Date.now() / 1000) - Number(currentBlock - log.blockNumber) * 2,
          txHash: log.transactionHash,
          blockNumber: log.blockNumber
        });
      }

      // Sort by block number (most recent first) and limit
      activities.sort((a, b) => Number(b.blockNumber - a.blockNumber));
      return activities.slice(0, limit);

    } catch (error) {
      console.error('Error fetching market activity:', error);
      // Return empty array on error - UI will show "No activity yet"
      return [];
    }
  }

  /**
   * Get user's trading activity across all markets they have positions in
   * Used for portfolio performance history
   */
  async getUserActivityAcrossMarkets(
    userAddress: Address,
    marketIds: bigint[],
    limit: number = 100
  ): Promise<MarketActivity[]> {
    if (!this.isContractDeployed() || !userAddress || marketIds.length === 0) {
      return [];
    }

    try {
      const allActivities: MarketActivity[] = [];

      // Fetch activities for each market the user has positions in
      for (const marketId of marketIds) {
        const marketActivities = await this.getMarketActivity(marketId, 50);
        // Filter for user's activities only
        const userActivities = marketActivities.filter(
          activity => activity.user.toLowerCase() === userAddress.toLowerCase()
        );
        allActivities.push(...userActivities);
      }

      // Sort by timestamp ascending (chronological order for P&L calculation)
      allActivities.sort((a, b) => a.timestamp - b.timestamp);

      return allActivities.slice(0, limit);
    } catch (error) {
      console.error('Error fetching user activity across markets:', error);
      return [];
    }
  }
}

export const predictionMarketService = new PredictionMarketService();
export default predictionMarketService;
