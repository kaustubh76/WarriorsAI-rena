import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { chainsToContracts, warriorsNFTAbi, getStorageApiUrl } from '../constants';
import { logger } from '../lib/logger';

interface WarriorsTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

interface UserWarriors {
  id: number;
  tokenId: number;
  name: string;
  bio: string;
  life_history: string;
  adjectives: string;
  knowledge_areas: string;
  traits: WarriorsTraits;
  image: string;
  rank: 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum';
  totalWinnings: number;
}

// Metadata type for better type safety
interface NFTMetadata {
  name?: string;
  title?: string;
  description?: string;
  image?: string;
  bio?: string;
  life_history?: string;
  adjectives?: string;
  personality?: string[];
  knowledge_areas?: string | string[];
  attributes?: Array<{ trait_type: string; value: number }>;
}

// Cache configuration
const MAX_CACHE_SIZE = 200;
const metadataCache = new Map<string, NFTMetadata>();

// LRU cache helper - removes oldest entry if cache is full
function setCachedMetadata(key: string, value: NFTMetadata): void {
  if (metadataCache.size >= MAX_CACHE_SIZE) {
    // Remove oldest entry (first in Map)
    const oldestKey = metadataCache.keys().next().value;
    if (oldestKey) {
      metadataCache.delete(oldestKey);
      logger.debug(`Cache eviction: removed ${oldestKey}`);
    }
  }
  metadataCache.set(key, value);
}

// 0G Storage service configuration - use environment variable
const ZG_STORAGE_API_URL = getStorageApiUrl();

// Chunked processing configuration
const CHUNK_SIZE = 3; // Process 3 NFTs in parallel
const CHUNK_DELAY = 300; // 300ms delay between chunks

// Function to clear cache for debugging/testing
const clearMetadataCache = () => {
  metadataCache.clear();
  logger.debug('Metadata cache cleared');
};

// Helper function to convert IPFS URI or 0G root hash to proper image URL
const convertIpfsToProxyUrl = (imageUrl: string) => {
  // Handle 0G storage URIs (0g://0x...)
  if (imageUrl.startsWith('0g://')) {
    // Extract the root hash from the 0G URI
    const rootHash = imageUrl.replace('0g://', '').split(':')[0];
    return `${ZG_STORAGE_API_URL}/download/${rootHash}`;
  }

  // Handle 0G storage root hashes (direct 0x format)
  if (imageUrl.startsWith('0x')) {
    // Convert 0G root hash to download URL
    return `${ZG_STORAGE_API_URL}/download/${imageUrl}`;
  }
  
  // Handle IPFS URLs
  if (imageUrl.startsWith('ipfs://')) {
    // Extract the IPFS hash from the URL
    const hash = imageUrl.replace('ipfs://', '');
    // Try to use a public IPFS gateway that works with CORS
    return `https://ipfs.io/ipfs/${hash}`;
  }
  
  // Return as-is if it's already a proper HTTP URL or local path
  return imageUrl;
};

// Helper function to add delay between requests to avoid rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fetch metadata from 0G Storage using root hash
 * @param rootHash - The 0G storage root hash
 * @param tokenId - Optional token ID for logging
 * @param externalSignal - Optional AbortSignal to cancel the fetch
 */
const fetchMetadataFrom0G = async (
  rootHash: string,
  tokenId?: string,
  externalSignal?: AbortSignal
): Promise<NFTMetadata | null> => {
  try {
    logger.debug(`🔗 Token ${tokenId || 'unknown'}: Fetching metadata from 0G Storage`);
    logger.debug(`🔑 Root Hash: ${rootHash}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    // If external signal is already aborted, abort immediately
    if (externalSignal?.aborted) {
      clearTimeout(timeoutId);
      throw new Error('Fetch aborted by external signal');
    }

    // Listen for external abort
    const abortHandler = () => controller.abort();
    externalSignal?.addEventListener('abort', abortHandler);

    try {
      const response = await fetch(`${ZG_STORAGE_API_URL}/download/${rootHash}`, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`0G Storage API returned ${response.status}: ${response.statusText}`);
      }

      const metadata = await response.json();
      logger.debug(`✅ Token ${tokenId || 'unknown'}: Successfully fetched metadata from 0G Storage`);

      return metadata;
    } finally {
      externalSignal?.removeEventListener('abort', abortHandler);
    }

  } catch (error) {
    // Don't log abort errors as errors, they're expected
    if (error instanceof Error && error.name === 'AbortError') {
      logger.debug(`⏹️ Token ${tokenId || 'unknown'}: 0G Storage fetch aborted`);
    } else {
      logger.error(`❌ Token ${tokenId || 'unknown'}: 0G Storage fetch failed:`, error instanceof Error ? error.message : 'Unknown error');
    }
    return null;
  }
};

/**
 * Fetch metadata from IPFS with improved error handling and rate limiting (legacy support)
 * @param tokenURI - The IPFS URI
 * @param tokenId - Optional token ID for logging
 * @param externalSignal - Optional AbortSignal to cancel the fetch
 */
const fetchMetadataFromIPFS = async (
  tokenURI: string,
  tokenId?: string,
  externalSignal?: AbortSignal
): Promise<NFTMetadata | null> => {
  if (!tokenURI.startsWith('ipfs://')) {
    logger.debug('Not an IPFS URL:', tokenURI);
    return null;
  }

  // Check if already aborted
  if (externalSignal?.aborted) {
    return null;
  }

  const cid = tokenURI.replace('ipfs://', '');

  // Use multiple gateways with different characteristics (using 0G Storage)
  const gateways = [
    { url: 'https://ipfs.io/ipfs/', name: 'ipfs.io', timeout: 10000 },
    { url: 'https://dweb.link/ipfs/', name: 'dweb.link', timeout: 12000 },
    { url: 'https://cloudflare-ipfs.com/ipfs/', name: 'cloudflare', timeout: 10000 },
    { url: 'https://gateway.ipfs.io/ipfs/', name: 'gateway.ipfs.io', timeout: 10000 },
  ];

  // Add a small delay to prevent overwhelming the gateways
  await delay(Math.random() * 500 + 100); // Random delay between 100-600ms

  for (let i = 0; i < gateways.length; i++) {
    // Check for abort between gateway attempts
    if (externalSignal?.aborted) {
      logger.debug(`⏹️ Token ${tokenId || 'unknown'}: IPFS fetch aborted`);
      return null;
    }

    const gateway = gateways[i];
    const httpUrl = `${gateway.url}${cid}`;

    try {
      logger.debug(`🌐 Token ${tokenId || 'unknown'}: Attempt ${i + 1}/${gateways.length} - Fetching from IPFS ${gateway.name}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), gateway.timeout);

      // Listen for external abort
      const abortHandler = () => controller.abort();
      externalSignal?.addEventListener('abort', abortHandler);

      try {
        const response = await fetch(httpUrl, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error(`Invalid content type: ${contentType}`);
        }

        const metadata = await response.json();
        logger.debug(`✅ Token ${tokenId || 'unknown'}: Success with IPFS ${gateway.name}`);

        // Validate metadata structure
        if (!metadata || typeof metadata !== 'object' || (!metadata.name && !metadata.title)) {
          throw new Error('Invalid metadata structure');
        }

        return metadata;
      } finally {
        externalSignal?.removeEventListener('abort', abortHandler);
      }

    } catch (error) {
      // Don't retry on abort
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug(`⏹️ Token ${tokenId || 'unknown'}: IPFS fetch aborted`);
        return null;
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.warn(`❌ Token ${tokenId || 'unknown'}: IPFS Gateway ${gateway.name} failed:`, errorMessage);

      // Add delay before trying next gateway to avoid rate limiting
      if (i < gateways.length - 1) {
        await delay(500); // 500ms delay between gateway attempts
      }
    }
  }

  return null;
};

/**
 * Unified metadata fetching function that handles both 0G Storage and IPFS
 * @param tokenURI - The token URI (0G hash or IPFS URI)
 * @param tokenId - Optional token ID for logging
 * @param signal - Optional AbortSignal to cancel the fetch
 */
const fetchMetadata = async (
  tokenURI: string,
  tokenId?: string,
  signal?: AbortSignal
): Promise<NFTMetadata | null> => {
  // Check cache first - update LRU order on hit
  if (metadataCache.has(tokenURI)) {
    const cached = metadataCache.get(tokenURI)!;
    // Move to end (most recently used) by deleting and re-adding
    metadataCache.delete(tokenURI);
    metadataCache.set(tokenURI, cached);
    logger.debug(`📦 Token ${tokenId || 'unknown'}: Using cached metadata`);
    return cached;
  }

  // Check if already aborted
  if (signal?.aborted) {
    return null;
  }

  let metadata: NFTMetadata | null = null;

  // Check if tokenURI is a 0G root hash (starts with 0x)
  if (tokenURI.startsWith('0x')) {
    logger.debug(`🔗 Token ${tokenId || 'unknown'}: Detected 0G root hash format`);
    metadata = await fetchMetadataFrom0G(tokenURI, tokenId, signal);
  }
  // Check if tokenURI is an IPFS CID
  else if (tokenURI.startsWith('ipfs://') || tokenURI.includes('/ipfs/')) {
    logger.debug(`🔗 Token ${tokenId || 'unknown'}: Detected IPFS format`);
    metadata = await fetchMetadataFromIPFS(tokenURI, tokenId, signal);
  }
  // Try both methods if format is unclear
  else {
    logger.debug(`🔗 Token ${tokenId || 'unknown'}: Unclear format, trying 0G first then IPFS`);
    metadata = await fetchMetadataFrom0G(tokenURI, tokenId, signal);
    if (!metadata && !signal?.aborted) {
      metadata = await fetchMetadataFromIPFS(tokenURI, tokenId, signal);
    }
  }

  // If all methods failed, create fallback metadata
  if (!metadata) {
    logger.debug(`🔄 Token ${tokenId || 'unknown'}: All storage methods failed, using fallback metadata`);

    // Create more realistic fallback data based on tokenId
    const fallbackTokenId = tokenId || tokenURI.slice(-3);
    metadata = {
      name: `Warriors #${fallbackTokenId}`,
      description: "A legendary warrior from the Warriors AI-rena battlefield. This metadata is temporarily using fallback data due to storage connectivity issues.",
      image: "/lazered.png", // Fallback image
      bio: "Ancient warrior whose full history is being retrieved from the storage archives...",
      life_history: "Born in the age of digital warfare, this warrior's complete saga is stored in the decentralized realm...",
      adjectives: "Brave, Mysterious, Resilient",
      knowledge_areas: "Combat, Strategy, Digital Warfare",
      attributes: [
        { trait_type: "Strength", value: Math.floor(Math.random() * 50) + 50 },
        { trait_type: "Wit", value: Math.floor(Math.random() * 50) + 50 },
        { trait_type: "Charisma", value: Math.floor(Math.random() * 50) + 50 },
        { trait_type: "Defence", value: Math.floor(Math.random() * 50) + 50 },
        { trait_type: "Luck", value: Math.floor(Math.random() * 50) + 50 },
      ]
    };
  }

  // Cache the metadata using LRU helper
  if (metadata) {
    setCachedMetadata(tokenURI, metadata);
  }

  return metadata;
};

// Helper function to convert ranking enum to string
const rankingToString = (ranking: number): 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' => {
  switch (ranking) {
    case 0: return 'unranked';
    case 1: return 'bronze';
    case 2: return 'silver';
    case 3: return 'gold';
    case 4: return 'platinum';
    default: return 'unranked';
  }
};

export const useUserNFTs = (isActive: boolean = false, chainId: number = getChainId()) => {
  const { address: connectedAddress } = useAccount();

  const [userNFTs, setUserNFTs] = useState<UserWarriors[]>([]);
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const loadingRef = useRef(false);
  const lastTokenIdsRef = useRef<string>('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastParamsRef = useRef<string>('');

  // Memoize the key parameters to prevent unnecessary re-renders
  const stableParams = useMemo(() => {
    const key = `${chainId}-${connectedAddress}-${isActive}`;
    return { chainId, connectedAddress, isActive, key };
  }, [chainId, connectedAddress, isActive]);

  // Prevent re-renders when parameters haven't actually changed
  const hasParamsChanged = stableParams.key !== lastParamsRef.current;

  // Debug logging (only when params change)
  if (hasParamsChanged) {
    logger.debug('useUserNFTs - chainId:', chainId, 'isActive:', isActive, 'connectedAddress:', connectedAddress);
    lastParamsRef.current = stableParams.key;
  }

  // Get contract address for the current chain
  const contractAddress = chainsToContracts[chainId]?.warriorsNFT;
  if (hasParamsChanged) {
    logger.debug('useUserNFTs - contractAddress for chain', chainId, ':', contractAddress);
  }

  // Read user's NFT token IDs
  const { data: userTokenIds, isError: tokenIdsError, isLoading: tokenIdsLoading } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: warriorsNFTAbi,
    functionName: 'getNFTsOfAOwner',
    args: connectedAddress ? [connectedAddress] : undefined,
    query: {
      enabled: !!connectedAddress && isActive && !!contractAddress,
    },
  });

  // Process a single NFT and return the result using batch contract read
  const processNFT = useCallback(async (
    tokenId: bigint,
    index: number,
    totalCount: number,
    signal?: AbortSignal
  ): Promise<UserWarriors> => {
    try {
      logger.debug(`🔄 Processing NFT ${index + 1}/${totalCount}: Token ID ${tokenId}`);

      // Use batch-read endpoint to get all contract data in a single request
      // This reduces 4 HTTP round-trips to 1
      const batchResponse = await fetch('/api/contract/batch-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chainId: chainId,
          requests: [
            {
              id: 'encryptedURI',
              contractAddress: contractAddress,
              abi: warriorsNFTAbi,
              functionName: 'getEncryptedURI',
              args: [tokenId.toString()],
            },
            {
              id: 'traits',
              contractAddress: contractAddress,
              abi: warriorsNFTAbi,
              functionName: 'getTraits',
              args: [tokenId.toString()],
            },
            {
              id: 'ranking',
              contractAddress: contractAddress,
              abi: warriorsNFTAbi,
              functionName: 'getRanking',
              args: [tokenId.toString()],
            },
            {
              id: 'winnings',
              contractAddress: contractAddress,
              abi: warriorsNFTAbi,
              functionName: 'getWinnings',
              args: [tokenId.toString()],
            },
          ],
        }),
      });

      const batchData = await batchResponse.json();

      if (!batchResponse.ok || batchData.error) {
        throw new Error(batchData.error || `Batch read failed: HTTP ${batchResponse.status}`);
      }

      // Extract results from batch response
      const results = batchData.results as Array<{
        id?: string;
        success: boolean;
        result?: unknown;
        error?: string;
      }>;

      // Find each result by id
      const findResult = (id: string) => results.find(r => r.id === id);

      const encryptedURIResult = findResult('encryptedURI');
      const traitsResult = findResult('traits');
      const rankingResult = findResult('ranking');
      const winningsResult = findResult('winnings');

      // Extract values (handling potential failures)
      const encryptedURI = encryptedURIResult?.success ? encryptedURIResult.result : null;
      const contractTraits = traitsResult?.success ? traitsResult.result : null;
      const ranking = rankingResult?.success ? rankingResult.result : 0;
      const winnings = winningsResult?.success ? winningsResult.result : '0';

      // Use encrypted URI (where the actual 0G storage root hash is stored)
      const tokenURI = encryptedURI as string | null;

      // Log the responses for debugging
      logger.debug(`📄 Token ${tokenId} contract data loaded via batch-read`);

      // Log errors from failed results
      if (encryptedURIResult && !encryptedURIResult.success) {
        logger.error(`Failed to get encryptedURI for ${tokenId}:`, encryptedURIResult.error);
      }
      if (traitsResult && !traitsResult.success) {
        logger.error(`Failed to get traits for ${tokenId}:`, traitsResult.error);
      }
      if (rankingResult && !rankingResult.success) {
        logger.error(`Failed to get ranking for ${tokenId}:`, rankingResult.error);
      }
      if (winningsResult && !winningsResult.success) {
        logger.error(`Failed to get winnings for ${tokenId}:`, winningsResult.error);
      }

      // Fetch metadata from 0G Storage or IPFS if we have a tokenURI
      let metadata: NFTMetadata | null = null;
      if (tokenURI) {
        logger.debug(`🔍 Fetching metadata for token ${tokenId} from:`, tokenURI);
        metadata = await fetchMetadata(tokenURI, tokenId.toString(), signal);
      } else {
        logger.warn(`⚠️ No tokenURI found for token ${tokenId}`);
      }

      // Parse traits from contract (convert from uint16 with 2 decimal precision)
      let traits: WarriorsTraits = {
        strength: 50.0,
        wit: 50.0,
        charisma: 50.0,
        defence: 50.0,
        luck: 50.0
      };

      if (contractTraits) {
        traits = {
          strength: Number(contractTraits.strength) / 100,
          wit: Number(contractTraits.wit) / 100,
          charisma: Number(contractTraits.charisma) / 100,
          defence: Number(contractTraits.defence) / 100,
          luck: Number(contractTraits.luck) / 100
        };
      }

      // Convert winnings from wei to ether
      const totalWinnings = Number(winnings) / 1e18;

      // Build the UserWarriors object
      const userWarriors: UserWarriors = {
        id: index + 1,
        tokenId: Number(tokenId),
        name: metadata?.name || `Warrior #${tokenId}`,
        bio: metadata?.bio || 'Ancient warrior with unknown history',
        life_history: metadata?.life_history || 'History lost to time...',
        adjectives: Array.isArray(metadata?.personality)
          ? metadata.personality.join(', ')
          : metadata?.adjectives || 'Mysterious, Powerful',
        knowledge_areas: Array.isArray(metadata?.knowledge_areas)
          ? metadata.knowledge_areas.join(', ')
          : (typeof metadata?.knowledge_areas === 'string' ? metadata.knowledge_areas : 'Combat, Strategy'),
        traits,
        image: metadata?.image ? convertIpfsToProxyUrl(metadata.image) : '/lazered.png',
        rank: rankingToString(ranking),
        totalWinnings
      };

      logger.debug(`✅ Completed processing NFT ${index + 1}/${totalCount}:`, userWarriors.name);
      return userWarriors;

    } catch (error) {
      logger.error(`Error loading details for NFT ${tokenId}:`, error);

      // Return a basic object even if there's an error
      return {
        id: index + 1,
        tokenId: Number(tokenId),
        name: `Warrior #${tokenId}`,
        bio: 'Error loading data',
        life_history: 'Unable to retrieve history',
        adjectives: 'Unknown',
        knowledge_areas: 'Unknown',
        traits: {
          strength: 50.0,
          wit: 50.0,
          charisma: 50.0,
          defence: 50.0,
          luck: 50.0
        },
        image: '/lazered.png',
        rank: 'unranked' as const,
        totalWinnings: 0.0
      };
    }
  }, [contractAddress, chainId]);

  // Store the abort controller for cleanup
  const abortControllerRef = useRef<AbortController | null>(null);

  // Function to load detailed NFT data using chunked parallel processing
  const loadNFTDetails = useCallback(async (tokenIds: bigint[]) => {
    if (loadingRef.current) {
      logger.debug('Already loading, skipping');
      return;
    }

    if (!tokenIds || tokenIds.length === 0) {
      setUserNFTs([]);
      return;
    }

    const tokenIdsString = tokenIds.map(id => id.toString()).join(',');
    if (lastTokenIdsRef.current === tokenIdsString) {
      logger.debug('Token IDs unchanged, skipping reload');
      return;
    }

    // Abort any previous loading operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new abort controller for this operation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    loadingRef.current = true;
    lastTokenIdsRef.current = tokenIdsString;
    setIsLoadingNFTs(true);

    if (!contractAddress) {
      logger.error(`Contract address not found for chain ${chainId}`);
      setUserNFTs([]);
      loadingRef.current = false;
      setIsLoadingNFTs(false);
      return;
    }

    try {
      // Process NFTs in chunks for better performance while respecting rate limits
      const nftResults: UserWarriors[] = [];
      const totalCount = tokenIds.length;

      logger.debug(`📦 Starting chunked NFT loading: ${totalCount} NFTs in chunks of ${CHUNK_SIZE}`);

      for (let i = 0; i < tokenIds.length; i += CHUNK_SIZE) {
        // Check if aborted before processing next chunk
        if (abortController.signal.aborted) {
          logger.debug('NFT loading aborted');
          return;
        }

        const chunk = tokenIds.slice(i, i + CHUNK_SIZE);
        const chunkNumber = Math.floor(i / CHUNK_SIZE) + 1;
        const totalChunks = Math.ceil(tokenIds.length / CHUNK_SIZE);

        logger.debug(`⚡ Processing chunk ${chunkNumber}/${totalChunks} (${chunk.length} NFTs)`);

        // Process all NFTs in this chunk in parallel, passing the abort signal
        const chunkResults = await Promise.all(
          chunk.map((tokenId, chunkIndex) =>
            processNFT(tokenId, i + chunkIndex, totalCount, abortController.signal)
          )
        );

        // Check again after async operation
        if (abortController.signal.aborted) {
          logger.debug('NFT loading aborted after chunk processing');
          return;
        }

        nftResults.push(...chunkResults);

        // Add delay between chunks to avoid overwhelming external services
        if (i + CHUNK_SIZE < tokenIds.length) {
          logger.debug(`⏳ Waiting ${CHUNK_DELAY}ms before next chunk...`);
          await delay(CHUNK_DELAY);
        }
      }

      // Final abort check before setting state
      if (abortController.signal.aborted) {
        logger.debug('NFT loading aborted before setting results');
        return;
      }

      logger.debug(`✅ NFT loading completed: ${nftResults.length} NFTs loaded`);
      setUserNFTs(nftResults);

    } catch (error) {
      // Don't log abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        logger.debug('NFT loading aborted');
        return;
      }
      logger.error('Error loading NFT details', error);
      setUserNFTs([]);
    } finally {
      setIsLoadingNFTs(false);
      loadingRef.current = false;
    }
  }, [contractAddress, chainId, processNFT]);

  // Load NFT details when token IDs change
  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Skip if parameters haven't changed
    if (!hasParamsChanged && userNFTs.length > 0) {
      return;
    }

    // Debounce the loading to prevent rapid successive calls
    timeoutRef.current = setTimeout(() => {
      if (userTokenIds && Array.isArray(userTokenIds) && userTokenIds.length > 0) {
        loadNFTDetails(userTokenIds as bigint[]);
      } else if (!tokenIdsLoading && !tokenIdsError) {
        setUserNFTs([]);
        setIsLoadingNFTs(false);
      }
    }, 300); // 300ms debounce

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Abort any in-progress metadata fetches on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
    // Note: loadNFTDetails and userNFTs.length intentionally excluded to prevent re-fetching loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userTokenIds, tokenIdsLoading, tokenIdsError, hasParamsChanged]);

  return {
    userNFTs,
    isLoadingNFTs: isLoadingNFTs || tokenIdsLoading,
    hasError: tokenIdsError,
    clearCache: clearMetadataCache,
    refetch: () => {
      if (userTokenIds) {
        loadNFTDetails(userTokenIds as bigint[]);
      }
    },
    debugState: () => {
      logger.debug('DEBUG STATE:');
      logger.debug('- userNFTs count:', userNFTs.length);
      logger.debug('- isLoadingNFTs:', isLoadingNFTs);
      logger.debug('- tokenIdsError:', tokenIdsError);
      logger.debug('- userTokenIds:', userTokenIds);
      logger.debug('- cache size:', metadataCache.size);
      logger.debug('- cached keys:', Array.from(metadataCache.keys()));
      userNFTs.forEach((nft, index) => {
        logger.debug(`- NFT ${index + 1}: ${nft.name} (Token ${nft.tokenId})`);
      });
    }
  };
};
