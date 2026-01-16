/**
 * useAgentINFT Hooks
 * React hooks for interacting with AI Agent iNFTs
 *
 * IMPORTANT: iNFT operations happen on 0G Galileo Testnet (Chain ID: 16602)
 * while main game operations (battles, warriors NFT) happen on Flow Testnet (Chain ID: 545)
 */

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWalletClient, usePublicClient, useSwitchChain, useChainId } from 'wagmi';
import type { Address } from 'viem';
import { defineChain } from 'viem';
import {
  agentINFTService,
  type AIAgentINFT,
  type AIAgentINFTDisplay,
  type AgentOnChainData,
  type AgentINFTPerformance,
  type Authorization,
  type PendingTransfer,
  type EncryptedAgentMetadata,
} from '../services/agentINFTService';
import {
  agentEncryptionService,
  deserializeEncryptedData,
} from '../services/agentEncryptionService';

// 0G Galileo Testnet chain definition
export const zeroGGalileo = defineChain({
  id: 16602,
  name: '0G Galileo Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'A0GI',
    symbol: 'A0GI',
  },
  rpcUrls: {
    default: { http: ['https://evmrpc-testnet.0g.ai'] },
  },
  blockExplorers: {
    default: { name: '0G Explorer', url: 'https://chainscan-galileo.0g.ai' },
  },
  testnet: true,
});

// Chain ID constants
const ZEROG_CHAIN_ID = 16602;

// ============================================================================
// Types
// ============================================================================

interface UseAgentINFTResult {
  inft: AIAgentINFT | null;
  display: AIAgentINFTDisplay | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseAgentINFTsResult {
  infts: AIAgentINFT[];
  displays: AIAgentINFTDisplay[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseMyAgentINFTsResult extends UseAgentINFTsResult {
  isOwner: (tokenId: bigint) => boolean;
}

interface UseMintINFTResult {
  mint: (
    metadata: EncryptedAgentMetadata,
    stakeAmount: bigint,
    copyTradingEnabled: boolean
  ) => Promise<string>;
  isMinting: boolean;
  error: Error | null;
}

interface UseTransferINFTResult {
  transfer: (tokenId: bigint, to: Address) => Promise<string>;
  isTransferring: boolean;
  error: Error | null;
}

interface UseAuthorizeUsageResult {
  authorize: (tokenId: bigint, executor: Address, durationDays: number) => Promise<string>;
  revoke: (tokenId: bigint, executor: Address) => Promise<string>;
  isProcessing: boolean;
  error: Error | null;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch a single iNFT by token ID
 */
export function useAgentINFT(tokenId: bigint | undefined): UseAgentINFTResult {
  const [inft, setINFT] = useState<AIAgentINFT | null>(null);
  const [display, setDisplay] = useState<AIAgentINFTDisplay | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchINFT = useCallback(async () => {
    if (!tokenId) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await agentINFTService.getINFT(tokenId);
      setINFT(data);

      if (data) {
        const displayData = await agentINFTService.toDisplayFormat(data);
        setDisplay(displayData);
      } else {
        setDisplay(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch iNFT'));
    } finally {
      setIsLoading(false);
    }
  }, [tokenId]);

  useEffect(() => {
    fetchINFT();
  }, [fetchINFT]);

  return { inft, display, isLoading, error, refetch: fetchINFT };
}

/**
 * Fetch all active iNFTs
 */
export function useAgentINFTs(): UseAgentINFTsResult {
  const [infts, setINFTs] = useState<AIAgentINFT[]>([]);
  const [displays, setDisplays] = useState<AIAgentINFTDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchINFTs = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await agentINFTService.getAllActiveINFTs();
      setINFTs(data);

      const displayData = await Promise.all(
        data.map(inft => agentINFTService.toDisplayFormat(inft))
      );
      setDisplays(displayData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch iNFTs'));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchINFTs();
  }, [fetchINFTs]);

  return { infts, displays, isLoading, error, refetch: fetchINFTs };
}

/**
 * Fetch iNFTs owned by current user
 */
export function useMyAgentINFTs(): UseMyAgentINFTsResult {
  const { address } = useAccount();
  const [infts, setINFTs] = useState<AIAgentINFT[]>([]);
  const [displays, setDisplays] = useState<AIAgentINFTDisplay[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchMyINFTs = useCallback(async () => {
    if (!address) {
      setINFTs([]);
      setDisplays([]);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const tokenIds = await agentINFTService.getTokensOfOwner(address);
      const data = await Promise.all(
        tokenIds.map(id => agentINFTService.getINFT(id))
      );
      const validINFTs = data.filter((inft): inft is AIAgentINFT => inft !== null);
      setINFTs(validINFTs);

      const displayData = await Promise.all(
        validINFTs.map(inft => agentINFTService.toDisplayFormat(inft))
      );
      setDisplays(displayData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch my iNFTs'));
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchMyINFTs();
  }, [fetchMyINFTs]);

  const isOwner = useCallback(
    (tokenId: bigint) => {
      return infts.some(inft => inft.tokenId === tokenId);
    },
    [infts]
  );

  return { infts, displays, isLoading, error, refetch: fetchMyINFTs, isOwner };
}

/**
 * Mint a new iNFT
 * Note: This operation happens on 0G Galileo Testnet (Chain ID: 16602)
 */
export function useMintINFT(): UseMintINFTResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mint = useCallback(
    async (
      metadata: EncryptedAgentMetadata,
      stakeAmount: bigint,
      copyTradingEnabled: boolean
    ): Promise<string> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      setIsMinting(true);
      setError(null);

      try {
        // Check if on correct chain (0G Galileo)
        if (currentChainId !== ZEROG_CHAIN_ID) {
          console.log('Switching to 0G Galileo Testnet for iNFT mint...');
          try {
            await switchChainAsync({ chainId: ZEROG_CHAIN_ID });
          } catch (switchError) {
            throw new Error(
              `Please switch to 0G Galileo Testnet (Chain ID: ${ZEROG_CHAIN_ID}) to mint iNFTs. ` +
              `Add the network manually: RPC URL: https://evmrpc-testnet.0g.ai, Chain ID: 16602`
            );
          }
        }

        // 0G Storage service using internal API route with fallback
        // Note: 0G network uploads can take 2-3 minutes due to blockchain confirmations
        const storageService = {
          uploadEncryptedMetadata: async (data: Uint8Array): Promise<string> => {
            // Generate local hash first (fast, deterministic)
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

            // Try 0G Storage upload - no client timeout, server handles it
            // 0G uploads can take 2-3 minutes due to blockchain confirmation
            try {
              // Create blob and file from encrypted data
              const blob = new Blob([data], { type: 'application/octet-stream' });
              const file = new File([blob], `agent_metadata_${Date.now()}.enc`);

              const formData = new FormData();
              formData.append('file', file);

              console.log('Uploading encrypted metadata to 0G Storage (this may take 2-3 minutes)...');

              // No client-side timeout - 0G uploads can take several minutes
              // The server will handle the upload and return when complete
              const response = await fetch('/api/0g/upload', {
                method: 'POST',
                body: formData
              });

              if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Upload failed: ${response.status} ${response.statusText}`);
              }

              const result = await response.json();

              if (!result.success || !result.rootHash) {
                throw new Error(result.error || 'No rootHash returned from storage');
              }

              // Handle different transaction statuses
              if (result.transactionHash === 'pending-verification') {
                console.log('0G Storage upload submitted (pending verification):', result.rootHash);
              } else if (result.transactionHash === 'existing') {
                console.log('File already exists in 0G Storage:', result.rootHash);
              } else {
                console.log('Successfully uploaded to 0G Storage:', result.rootHash);
              }
              return `0g://${result.rootHash}`;
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              console.warn('0G Storage upload failed, using local hash fallback:', errorMsg);

              // Fallback: use pre-computed hash
              // This allows minting to proceed even if 0G storage is slow/unavailable
              // The encrypted data can be re-uploaded later if needed
              return `local://${hashHex}`;
            }
          }
        };

        const result = await agentINFTService.mintINFT(
          metadata,
          stakeAmount,
          copyTradingEnabled,
          walletClient,
          address,
          storageService
        );

        return result.txHash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Mint failed');
        setError(error);
        throw error;
      } finally {
        setIsMinting(false);
      }
    },
    [address, walletClient, currentChainId, switchChainAsync]
  );

  return { mint, isMinting, error };
}

/**
 * Transfer an iNFT
 * Note: This operation happens on 0G Galileo Testnet (Chain ID: 16602)
 */
export function useTransferINFT(): UseTransferINFTResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [isTransferring, setIsTransferring] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transfer = useCallback(
    async (tokenId: bigint, to: Address): Promise<string> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      setIsTransferring(true);
      setError(null);

      try {
        // Check if on correct chain (0G Galileo)
        if (currentChainId !== ZEROG_CHAIN_ID) {
          console.log('Switching to 0G Galileo Testnet for iNFT transfer...');
          try {
            await switchChainAsync({ chainId: ZEROG_CHAIN_ID });
          } catch (switchError) {
            throw new Error(
              `Please switch to 0G Galileo Testnet (Chain ID: ${ZEROG_CHAIN_ID}) to transfer iNFTs.`
            );
          }
        }

        const hash = await agentINFTService.transferINFTWithReEncryption(
          tokenId,
          to,
          walletClient,
          address
        );
        return hash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Transfer failed');
        setError(error);
        throw error;
      } finally {
        setIsTransferring(false);
      }
    },
    [address, walletClient, currentChainId, switchChainAsync]
  );

  return { transfer, isTransferring, error };
}

/**
 * Authorize/revoke usage for an executor
 * Note: This operation happens on 0G Galileo Testnet (Chain ID: 16602)
 */
export function useAuthorizeUsage(): UseAuthorizeUsageResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const authorize = useCallback(
    async (tokenId: bigint, executor: Address, durationDays: number): Promise<string> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      setIsProcessing(true);
      setError(null);

      try {
        // Check if on correct chain (0G Galileo)
        if (currentChainId !== ZEROG_CHAIN_ID) {
          try {
            await switchChainAsync({ chainId: ZEROG_CHAIN_ID });
          } catch (switchError) {
            throw new Error(
              `Please switch to 0G Galileo Testnet (Chain ID: ${ZEROG_CHAIN_ID}) to authorize usage.`
            );
          }
        }

        const durationSeconds = BigInt(durationDays * 24 * 60 * 60);
        const tx = agentINFTService.prepareAuthorizeUsage(tokenId, executor, durationSeconds);
        const hash = await walletClient.writeContract({
          ...tx,
          account: address,
          chain: zeroGGalileo,
        });
        return hash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Authorization failed');
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [address, walletClient, currentChainId, switchChainAsync]
  );

  const revoke = useCallback(
    async (tokenId: bigint, executor: Address): Promise<string> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      setIsProcessing(true);
      setError(null);

      try {
        // Check if on correct chain (0G Galileo)
        if (currentChainId !== ZEROG_CHAIN_ID) {
          try {
            await switchChainAsync({ chainId: ZEROG_CHAIN_ID });
          } catch (switchError) {
            throw new Error(
              `Please switch to 0G Galileo Testnet (Chain ID: ${ZEROG_CHAIN_ID}) to revoke usage.`
            );
          }
        }

        const tx = agentINFTService.prepareRevokeUsage(tokenId, executor);
        const hash = await walletClient.writeContract({
          ...tx,
          account: address,
          chain: zeroGGalileo,
        });
        return hash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Revoke failed');
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [address, walletClient, currentChainId, switchChainAsync]
  );

  return { authorize, revoke, isProcessing, error };
}

/**
 * Check authorization status
 */
export function useAgentAuthorization(
  tokenId: bigint | undefined,
  executor: Address | undefined
): { authorization: Authorization | null; isLoading: boolean } {
  const [authorization, setAuthorization] = useState<Authorization | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!tokenId || !executor) {
      setAuthorization(null);
      return;
    }

    setIsLoading(true);
    agentINFTService
      .getAuthorization(tokenId, executor)
      .then(setAuthorization)
      .finally(() => setIsLoading(false));
  }, [tokenId, executor]);

  return { authorization, isLoading };
}

/**
 * Check if contract is deployed
 */
export function useINFTContractStatus(): { isDeployed: boolean; address: Address } {
  return {
    isDeployed: agentINFTService.isContractDeployed(),
    address: agentINFTService.getContractAddress(),
  };
}

/**
 * Decrypt metadata for an owned/authorized iNFT
 * Supports both owners and authorized executors with canViewMetadata permission
 */
export function useDecryptedMetadata(
  inft: AIAgentINFT | null
): { metadata: EncryptedAgentMetadata | null; isDecrypting: boolean; error: Error | null; accessType: 'owner' | 'authorized' | 'none' } {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const [metadata, setMetadata] = useState<EncryptedAgentMetadata | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [accessType, setAccessType] = useState<'owner' | 'authorized' | 'none'>('none');

  useEffect(() => {
    if (!inft || !address || !walletClient) {
      setMetadata(null);
      setAccessType('none');
      return;
    }

    const checkAccessAndDecrypt = async () => {
      // Check if user is owner
      const isOwner = inft.owner.toLowerCase() === address.toLowerCase();

      // If not owner, check for authorization
      let hasViewPermission = false;
      if (!isOwner) {
        try {
          const authorization = await agentINFTService.getAuthorization(inft.tokenId, address);
          if (authorization) {
            const now = BigInt(Math.floor(Date.now() / 1000));
            const isExpired = authorization.expiresAt <= now;
            hasViewPermission = !isExpired && authorization.canViewMetadata;
          }
        } catch (err) {
          console.warn('Failed to check authorization:', err);
        }
      }

      // No access - exit early
      if (!isOwner && !hasViewPermission) {
        setMetadata(null);
        setAccessType('none');
        return;
      }

      setAccessType(isOwner ? 'owner' : 'authorized');
      await decrypt();
    };

    const decrypt = async () => {
      setIsDecrypting(true);
      setError(null);

      try {
        // 1. Get the encrypted metadata reference from iNFT
        const metadataRef = inft.encryptedMetadataRef;
        if (!metadataRef) {
          console.log('No encrypted metadata reference found');
          setMetadata(null);
          return;
        }

        // 2. Fetch encrypted data from 0G Storage via internal API
        let encryptedBytes: Uint8Array;

        if (metadataRef.startsWith('0g://')) {
          const rootHash = metadataRef.replace('0g://', '');
          console.log('Fetching encrypted metadata from 0G Storage:', rootHash);

          // Use internal API route for downloading
          const response = await fetch(`/api/0g/upload?rootHash=${encodeURIComponent(rootHash)}`, {
            signal: AbortSignal.timeout(30000) // 30 second timeout for SDK operations
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `Failed to fetch from 0G Storage: ${response.status}`);
          }

          encryptedBytes = new Uint8Array(await response.arrayBuffer());
        } else if (metadataRef.startsWith('local://')) {
          // Local hash - metadata was stored locally during mint fallback
          console.warn('Metadata stored locally (0G unavailable during mint), cannot decrypt');
          setMetadata(null);
          return;
        } else {
          // Unknown format - try as raw hash via internal API
          console.log('Trying metadata reference as raw hash:', metadataRef);
          const response = await fetch(`/api/0g/upload?rootHash=${encodeURIComponent(metadataRef)}`, {
            signal: AbortSignal.timeout(30000)
          });

          if (!response.ok) {
            throw new Error(`Unknown metadata reference format: ${metadataRef}`);
          }

          encryptedBytes = new Uint8Array(await response.arrayBuffer());
        }

        // 3. Deserialize the encrypted data
        const encryptedData = deserializeEncryptedData(encryptedBytes);

        // 4. Decrypt using wallet-derived key
        const decryptedMetadata = await agentEncryptionService.decrypt(
          encryptedData,
          walletClient,
          address
        );

        console.log('Successfully decrypted iNFT metadata');
        setMetadata(decryptedMetadata);
      } catch (err) {
        console.error('Decryption failed:', err);
        setError(err instanceof Error ? err : new Error('Decryption failed'));
        setMetadata(null);
      } finally {
        setIsDecrypting(false);
      }
    };

    checkAccessAndDecrypt();
  }, [inft, address, walletClient]);

  return { metadata, isDecrypting, error, accessType };
}

// CRwN Token ABI for minting
const CRWN_TOKEN_ABI = [
  {
    name: 'mint',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: '_amount', type: 'uint256' }],
    outputs: [],
  },
] as const;

// 0G CRwN Token address
const ZEROG_CRWN_ADDRESS = '0xC13f60749ECfCDE5f79689dd2E5A361E9210f153' as const;

interface UseMintCRwNResult {
  mintCRwN: (amount: string) => Promise<string>;
  isMinting: boolean;
  error: Error | null;
}

/**
 * Mint CRwN tokens on 0G Galileo Testnet
 * Sends native 0G tokens to get equivalent CRwN (1:1 ratio)
 */
export function useMintCRwN(): UseMintCRwNResult {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const currentChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [isMinting, setIsMinting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const mintCRwN = useCallback(
    async (amount: string): Promise<string> => {
      if (!address || !walletClient) {
        throw new Error('Wallet not connected');
      }

      setIsMinting(true);
      setError(null);

      try {
        // Check if on correct chain (0G Galileo)
        if (currentChainId !== ZEROG_CHAIN_ID) {
          console.log('Switching to 0G Galileo Testnet for CRwN mint...');
          try {
            await switchChainAsync({ chainId: ZEROG_CHAIN_ID });
          } catch (switchError) {
            throw new Error(
              `Please switch to 0G Galileo Testnet (Chain ID: ${ZEROG_CHAIN_ID}) to mint CRwN tokens. ` +
              `Add the network manually: RPC URL: https://evmrpc-testnet.0g.ai, Chain ID: 16602`
            );
          }
        }

        // Parse amount to wei
        const amountWei = BigInt(Math.floor(parseFloat(amount) * 1e18));

        // Call mint function with native 0G tokens as value
        const hash = await walletClient.writeContract({
          address: ZEROG_CRWN_ADDRESS,
          abi: CRWN_TOKEN_ABI,
          functionName: 'mint',
          args: [amountWei],
          value: amountWei, // Send native 0G tokens
          account: address,
          chain: zeroGGalileo,
        });

        console.log('CRwN mint transaction:', hash);
        return hash;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Mint failed');
        setError(error);
        throw error;
      } finally {
        setIsMinting(false);
      }
    },
    [address, walletClient, currentChainId, switchChainAsync]
  );

  return { mintCRwN, isMinting, error };
}
