/**
 * Prediction Market Service
 * Handles all interactions with the PredictionMarketAMM smart contract
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  formatEther,
  type Address,
  type PublicClient,
  type WalletClient
} from 'viem';
import { flowTestnet } from 'viem/chains';

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

class PredictionMarketService {
  private publicClient: PublicClient;
  private predictionMarketAddress: Address;
  private crownTokenAddress: Address;

  constructor() {
    this.publicClient = createPublicClient({
      chain: flowTestnet,
      transport: http()
    });

    // These will be updated once contracts are deployed
    this.predictionMarketAddress = '0x0000000000000000000000000000000000000000' as Address;
    this.crownTokenAddress = '0x9Fd6CCEE1243EaC173490323Ed6B8b8E0c15e8e6' as Address;
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
    try {
      const markets = await this.publicClient.readContract({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getAllMarkets'
      }) as Market[];
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
    try {
      const market = await this.publicClient.readContract({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getMarket',
        args: [marketId]
      }) as Market;
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
    try {
      const marketIds = await this.publicClient.readContract({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getActiveMarkets'
      }) as bigint[];
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
    try {
      const [yesPrice, noPrice] = await this.publicClient.readContract({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getPrice',
        args: [marketId]
      }) as [bigint, bigint];
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
    try {
      const position = await this.publicClient.readContract({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'getPosition',
        args: [marketId, userAddress]
      }) as Position;
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
    try {
      const shares = await this.publicClient.readContract({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'calculateBuyAmount',
        args: [marketId, isYes, collateralAmount]
      }) as bigint;
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
    try {
      const collateral = await this.publicClient.readContract({
        address: this.predictionMarketAddress,
        abi: PredictionMarketABI,
        functionName: 'calculateSellAmount',
        args: [marketId, isYes, shareAmount]
      }) as bigint;
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
      const allowance = await this.publicClient.readContract({
        address: this.crownTokenAddress,
        abi: ERC20ABI,
        functionName: 'allowance',
        args: [ownerAddress, this.predictionMarketAddress]
      }) as bigint;
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
      const balance = await this.publicClient.readContract({
        address: this.crownTokenAddress,
        abi: ERC20ABI,
        functionName: 'balanceOf',
        args: [address]
      }) as bigint;
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
