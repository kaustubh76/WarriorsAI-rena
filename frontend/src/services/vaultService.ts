/**
 * Vault Service
 * Handles on-chain reads/writes for Strategy Vault + DeFi Pool operations.
 * Follows marketCreationService.ts pattern (executeWithFallback, typed results).
 */

import { parseEther, formatEther, type Address } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { chainsToContracts, crownTokenAbi, warriorsNFTAbi } from '../constants';
import { STRATEGY_VAULT_ABI } from '../constants/abis/strategyVaultAbi';
import { POOL_ABI } from '../constants/abis/poolAbi';
import { classifyStrategyProfile } from '../constants/defiTraitMapping';
import {
  createFlowPublicClient,
  createFlowFallbackClient,
  isTimeoutError,
} from '@/lib/flowClient';

const FLOW_CHAIN_ID = 43113;
const contracts = chainsToContracts[FLOW_CHAIN_ID];

const publicClient = createFlowPublicClient();
const fallbackClient = createFlowFallbackClient();

async function executeWithFallback<T>(
  operation: (client: typeof publicClient) => Promise<T>
): Promise<T> {
  try {
    return await operation(publicClient);
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn('[VaultService] Primary RPC timed out, trying fallback...');
      return await operation(fallbackClient);
    }
    throw error;
  }
}

// ─── Types ──────────────────────────────────────────────

export interface NFTTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

export interface DeFiTraits {
  alpha: number;
  complexity: number;
  momentum: number;
  hedge: number;
  timing: number;
}

export interface PoolAPYs {
  highYield: number; // basis points
  stable: number;
  lp: number;
}

export interface VaultAllocation {
  highYield: number; // basis points (0-10000)
  stable: number;
  lp: number;
}

export interface VaultStateResult {
  depositAmount: bigint;
  allocation: [bigint, bigint, bigint];
  active: boolean;
  owner: string;
  createdAt: bigint;
  aiProofHash: string;
}

export interface ApprovalStatus {
  hasApproval: boolean;
  currentAllowance: bigint;
  requiredAmount: bigint;
}

// ─── Read Operations ────────────────────────────────────

class VaultService {
  /** Get CRwN balance of user */
  async getBalance(userAddress: Address): Promise<bigint> {
    const result = await executeWithFallback((client) =>
      client.readContract({
        address: contracts.crownToken as Address,
        abi: crownTokenAbi,
        functionName: 'balanceOf',
        args: [userAddress],
      })
    );
    return result as bigint;
  }

  /** Check CRwN approval for StrategyVault */
  async checkApproval(userAddress: Address, amount: string): Promise<ApprovalStatus> {
    const requiredAmount = parseEther(amount);
    const currentAllowance = await executeWithFallback((client) =>
      client.readContract({
        address: contracts.crownToken as Address,
        abi: crownTokenAbi,
        functionName: 'allowance',
        args: [userAddress, contracts.strategyVault as Address],
      })
    );

    return {
      hasApproval: (currentAllowance as bigint) >= requiredAmount,
      currentAllowance: currentAllowance as bigint,
      requiredAmount,
    };
  }

  /** Read NFT traits from WarriorsNFT on-chain */
  async getNFTTraits(nftId: number): Promise<NFTTraits> {
    const traits = await executeWithFallback((client) =>
      client.readContract({
        address: contracts.warriorsNFT as Address,
        abi: warriorsNFTAbi,
        functionName: 'getTraits',
        args: [BigInt(nftId)],
      })
    ) as { strength: number; wit: number; charisma: number; defence: number; luck: number };

    return {
      strength: Number(traits.strength),
      wit: Number(traits.wit),
      charisma: Number(traits.charisma),
      defence: Number(traits.defence),
      luck: Number(traits.luck),
    };
  }

  /** Fetch NFT image URL from 0G Storage metadata */
  async getNFTImageUrl(nftId: number): Promise<string> {
    const encryptedURI = await executeWithFallback((client) =>
      client.readContract({
        address: contracts.warriorsNFT as Address,
        abi: warriorsNFTAbi,
        functionName: 'getEncryptedURI',
        args: [BigInt(nftId)],
      })
    ) as string;

    if (!encryptedURI) return '/lazered.png';

    const { downloadFrom0G } = await import('@/lib/0g/downloadHelper');
    const data = await downloadFrom0G(encryptedURI);
    if (!data) return '/lazered.png';

    try {
      const metadata = JSON.parse(data.toString('utf-8'));
      const imageUri: string = metadata?.image || '/lazered.png';

      if (imageUri.startsWith('0g://')) {
        const rootHash = imageUri.replace('0g://', '').split(':')[0];
        return `/api/0g/download?rootHash=${encodeURIComponent(rootHash)}`;
      }
      if (imageUri.startsWith('0x')) {
        return `/api/0g/download?rootHash=${encodeURIComponent(imageUri)}`;
      }
      if (imageUri.startsWith('ipfs://')) {
        const hash = imageUri.replace('ipfs://', '');
        return `https://ipfs.io/ipfs/${hash}`;
      }
      return imageUri;
    } catch {
      return '/lazered.png';
    }
  }

  /** Map on-chain traits to DeFi display names */
  mapToDeFiTraits(traits: NFTTraits): DeFiTraits {
    return {
      alpha: traits.strength,
      complexity: traits.wit,
      momentum: traits.charisma,
      hedge: traits.defence,
      timing: traits.luck,
    };
  }

  /** Get current APYs from all 3 pools */
  async getPoolAPYs(): Promise<PoolAPYs> {
    const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
    const highYieldAddr = contracts.highYieldPool;
    const stableAddr = contracts.stablePool;
    const lpAddr = contracts.lpPool;

    if (!highYieldAddr || highYieldAddr === ZERO_ADDR ||
        !stableAddr || stableAddr === ZERO_ADDR ||
        !lpAddr || lpAddr === ZERO_ADDR) {
      throw new Error('Pool contract addresses not configured');
    }

    const [highYield, stable, lp] = await Promise.all([
      executeWithFallback((client) =>
        client.readContract({
          address: highYieldAddr as Address,
          abi: POOL_ABI,
          functionName: 'getEffectiveAPY',
        })
      ),
      executeWithFallback((client) =>
        client.readContract({
          address: stableAddr as Address,
          abi: POOL_ABI,
          functionName: 'getEffectiveAPY',
        })
      ),
      executeWithFallback((client) =>
        client.readContract({
          address: lpAddr as Address,
          abi: POOL_ABI,
          functionName: 'getEffectiveAPY',
        })
      ),
    ]);

    return {
      highYield: Number(highYield),
      stable: Number(stable),
      lp: Number(lp),
    };
  }

  /** Read vault state from on-chain StrategyVault */
  async getVaultState(nftId: number): Promise<VaultStateResult | null> {
    try {
      const result = await executeWithFallback((client) =>
        client.readContract({
          address: contracts.strategyVault as Address,
          abi: STRATEGY_VAULT_ABI,
          functionName: 'getVaultState',
          args: [BigInt(nftId)],
        })
      ) as VaultStateResult;

      if (!result.active && result.depositAmount === 0n) return null;
      return result;
    } catch {
      return null;
    }
  }

  /** Check if vault is active for NFT */
  async isVaultActive(nftId: number): Promise<boolean> {
    try {
      return await executeWithFallback((client) =>
        client.readContract({
          address: contracts.strategyVault as Address,
          abi: STRATEGY_VAULT_ABI,
          functionName: 'isVaultActive',
          args: [BigInt(nftId)],
        })
      ) as boolean;
    } catch {
      return false;
    }
  }

  /** Get user's owned NFT IDs */
  async getUserNFTs(userAddress: Address): Promise<number[]> {
    try {
      const nfts = await executeWithFallback((client) =>
        client.readContract({
          address: contracts.warriorsNFT as Address,
          abi: warriorsNFTAbi,
          functionName: 'getNFTsOfAOwner',
          args: [userAddress],
        })
      ) as bigint[];

      return nfts.map((id) => Number(id));
    } catch {
      return [];
    }
  }

  // ─── Write Params (for walletClient.writeContract) ────

  /** Get approve tx params for CRwN → StrategyVault */
  getApproveParams(amount: bigint) {
    return {
      address: contracts.crownToken as Address,
      abi: crownTokenAbi,
      functionName: 'approve' as const,
      args: [contracts.strategyVault as Address, amount],
      chain: avalancheFuji,
    };
  }

  /** Get deposit tx params for StrategyVault.deposit */
  getDepositParams(
    nftId: number,
    amount: bigint,
    allocation: [bigint, bigint, bigint],
    aiProofHash: `0x${string}`
  ) {
    return {
      address: contracts.strategyVault as Address,
      abi: STRATEGY_VAULT_ABI,
      functionName: 'deposit' as const,
      args: [BigInt(nftId), amount, allocation, aiProofHash],
      chain: avalancheFuji,
    };
  }

  /** Get withdraw tx params */
  getWithdrawParams(nftId: number) {
    return {
      address: contracts.strategyVault as Address,
      abi: STRATEGY_VAULT_ABI,
      functionName: 'withdraw' as const,
      args: [BigInt(nftId)],
      chain: avalancheFuji,
    };
  }

  // ─── Helpers ──────────────────────────────────────────

  /** Calculate projected blended APY from allocation and pool APYs */
  calculateBlendedAPY(allocation: VaultAllocation, poolAPYs: PoolAPYs): number {
    return (
      (allocation.highYield * poolAPYs.highYield +
        allocation.stable * poolAPYs.stable +
        allocation.lp * poolAPYs.lp) / 10000
    );
  }

  /** Get strategy risk profile from traits */
  getStrategyProfile(traits: NFTTraits): string {
    return classifyStrategyProfile({
      strength: traits.strength,
      wit: traits.wit,
      charisma: traits.charisma,
      defence: traits.defence,
      luck: traits.luck,
    });
  }

  formatBalance(balance: bigint): string {
    return formatEther(balance);
  }

  parseAmount(amount: string): bigint {
    return parseEther(amount);
  }
}

export const vaultService = new VaultService();
