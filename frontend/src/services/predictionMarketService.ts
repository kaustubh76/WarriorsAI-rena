/**
 * Prediction Market Service
 * Handles all interactions with the PredictionMarketAMM smart contract
 * Uses shared RPC client with rate limiting and caching
 */

import {
  parseEther,
  formatEther,
  type Address,
} from 'viem';
import { readContractWithRateLimit, batchReadContractsWithRateLimit } from '../lib/rpcClient';
import { chainsToContracts } from '../constants';

// Market status enum matching the contract
export enum MarketStatus {
  Active = 0,
  Paused = 1,
  Resolved = 2,
  Cancelled = 3
}

// Market outcome enum
export enum MarketOutcome {
  Unresolved = 0,
  Yes = 1,
  No = 2,
  Draw = 3
}

// Market interface matching the contract struct
export interface Market {
  id: bigint;
  question: string;
  endTime: bigint;
  status: MarketStatus;
  outcome: MarketOutcome;
  totalYesShares: bigint;
  totalNoShares: bigint;
  totalLiquidity: bigint;
  creator: Address;
  resolutionTime: bigint;
  battleId: bigint;
  warrior1Id: bigint;
  warrior2Id: bigint;
}

// User position interface
export interface Position {
  yesShares: bigint;
  noShares: bigint;
  lpShares: bigint;
  claimed: boolean;
}

// Trade quote interface
export interface TradeQuote {
  sharesOut: bigint;
  priceImpact: number;
  effectivePrice: number;
}

// PredictionMarketAMM ABI (key functions)
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
        { name: 'status', type: 'uint8' },
        { name: 'outcome', type: 'uint8' },
        { name: 'totalYesShares', type: 'uint256' },
        { name: 'totalNoShares', type: 'uint256' },
        { name: 'totalLiquidity', type: 'uint256' },
        { name: 'creator', type: 'address' },
        { name: 'resolutionTime', type: 'uint256' },
        { name: 'battleId', type: 'uint256' },
        { name: 'warrior1Id', type: 'uint256' },
        { name: 'warrior2Id', type: 'uint256' }
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
        { name: 'status', type: 'uint8' },
        { name: 'outcome', type: 'uint8' },
        { name: 'totalYesShares', type: 'uint256' },
        { name: 'totalNoShares', type: 'uint256' },
        { name: 'totalLiquidity', type: 'uint256' },
        { name: 'creator', type: 'address' },
        { name: 'resolutionTime', type: 'uint256' },
        { name: 'battleId', type: 'uint256' },
        { name: 'warrior1Id', type: 'uint256' },
        { name: 'warrior2Id', type: 'uint256' }
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
        { name: 'yesShares', type: 'uint256' },
        { name: 'noShares', type: 'uint256' },
        { name: 'lpShares', type: 'uint256' },
        { name: 'claimed', type: 'bool' }
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
  // Events
  {
    type: 'event',
    name: 'MarketCreated',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'question', type: 'string', indexed: false },
      { name: 'endTime', type: 'uint256', indexed: false },
      { name: 'creator', type: 'address', indexed: true }
    ]
  },
  {
    type: 'event',
    name: 'Trade',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'trader', type: 'address', indexed: true },
      { name: 'isBuy', type: 'bool', indexed: false },
      { name: 'isYes', type: 'bool', indexed: false },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'shares', type: 'uint256', indexed: false }
    ]
  },
  {
    type: 'event',
    name: 'MarketResolved',
    inputs: [
      { name: 'marketId', type: 'uint256', indexed: true },
      { name: 'outcome', type: 'uint8', indexed: false }
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
  private chainId: number = 545; // Flow Testnet

  constructor() {
    // Load contract addresses from constants
    const contracts = chainsToContracts[this.chainId];
    this.predictionMarketAddress = (contracts?.predictionMarketAMM || ZERO_ADDRESS) as Address;
    this.crownTokenAddress = (contracts?.crownToken || '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6') as Address;
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
      return markets;
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
   */
  async getPrice(marketId: bigint): Promise<{ yesPrice: bigint; noPrice: bigint }> {
    if (!this.isContractDeployed()) {
      return { yesPrice: BigInt(5000), noPrice: BigInt(5000) }; // 50/50 default
    }

    try {
      const [yesPrice, noPrice] = await readContractWithRateLimit({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getPrice',
        args: [marketId]
      }, { cacheTTL: CACHE_TTL.PRICE }) as [bigint, bigint];
      return { yesPrice, noPrice };
    } catch (error) {
      console.error('Error fetching price:', error);
      return { yesPrice: BigInt(5000), noPrice: BigInt(5000) }; // 50/50 default
    }
  }

  /**
   * Get user position in a market
   */
  async getPosition(marketId: bigint, userAddress: Address): Promise<Position> {
    if (!this.isContractDeployed()) {
      return {
        yesShares: BigInt(0),
        noShares: BigInt(0),
        lpShares: BigInt(0),
        claimed: false
      };
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
      return {
        yesShares: BigInt(0),
        noShares: BigInt(0),
        lpShares: BigInt(0),
        claimed: false
      };
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
      case MarketStatus.Paused:
        return 'Paused';
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
      case MarketOutcome.Unresolved:
        return 'Pending';
      case MarketOutcome.Yes:
        return 'Yes';
      case MarketOutcome.No:
        return 'No';
      case MarketOutcome.Draw:
        return 'Draw';
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
}

export const predictionMarketService = new PredictionMarketService();
export default predictionMarketService;
