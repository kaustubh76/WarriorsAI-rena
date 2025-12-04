import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { chainsToContracts, warriorsNFTAbi } from '../constants';

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

// Simple metadata cache to avoid repeated requests
const metadataCache = new Map<string, any>();

// 0G Storage service configuration - use environment variable
const ZG_STORAGE_API_URL = process.env.NEXT_PUBLIC_STORAGE_API_URL || 'http://localhost:3001';

// Function to clear cache for debugging/testing
const clearMetadataCache = () => {
  metadataCache.clear();
  console.log('🗑️ Metadata cache cleared');
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
 */
const fetchMetadataFrom0G = async (rootHash: string, tokenId?: string): Promise<any | null> => {
  try {
    console.log(`🔗 Token ${tokenId || 'unknown'}: Fetching metadata from 0G Storage`);
    console.log(`🔑 Root Hash: ${rootHash}`);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
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
    console.log(`✅ Token ${tokenId || 'unknown'}: Successfully fetched metadata from 0G Storage`);
    
    return metadata;
    
  } catch (error) {
    console.error(`❌ Token ${tokenId || 'unknown'}: 0G Storage fetch failed:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
};

/**
 * Fetch metadata from IPFS with improved error handling and rate limiting (legacy support)
 */
const fetchMetadataFromIPFS = async (tokenURI: string, tokenId?: string): Promise<any | null> => {
  if (!tokenURI.startsWith('ipfs://')) {
    console.log('Not an IPFS URL:', tokenURI);
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
    const gateway = gateways[i];
    const httpUrl = `${gateway.url}${cid}`;
    
    try {
      console.log(`🌐 Token ${tokenId || 'unknown'}: Attempt ${i + 1}/${gateways.length} - Fetching from IPFS ${gateway.name}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), gateway.timeout);
      
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
      console.log(`✅ Token ${tokenId || 'unknown'}: Success with IPFS ${gateway.name}`);
      
      // Validate metadata structure
      if (!metadata || typeof metadata !== 'object' || (!metadata.name && !metadata.title)) {
        throw new Error('Invalid metadata structure');
      }
      
      return metadata;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`❌ Token ${tokenId || 'unknown'}: IPFS Gateway ${gateway.name} failed:`, errorMessage);
      
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
 */
const fetchMetadata = async (tokenURI: string, tokenId?: string): Promise<any | null> => {
  // Check cache first
  if (metadataCache.has(tokenURI)) {
    console.log(`📦 Token ${tokenId || 'unknown'}: Using cached metadata`);
    return metadataCache.get(tokenURI);
  }

  let metadata: any | null = null;

  // Check if tokenURI is a 0G root hash (starts with 0x)
  if (tokenURI.startsWith('0x')) {
    console.log(`🔗 Token ${tokenId || 'unknown'}: Detected 0G root hash format`);
    metadata = await fetchMetadataFrom0G(tokenURI, tokenId);
  } 
  // Check if tokenURI is an IPFS CID
  else if (tokenURI.startsWith('ipfs://') || tokenURI.includes('/ipfs/')) {
    console.log(`🔗 Token ${tokenId || 'unknown'}: Detected IPFS format`);
    metadata = await fetchMetadataFromIPFS(tokenURI, tokenId);
  }
  // Try both methods if format is unclear
  else {
    console.log(`🔗 Token ${tokenId || 'unknown'}: Unclear format, trying 0G first then IPFS`);
    metadata = await fetchMetadataFrom0G(tokenURI, tokenId);
    if (!metadata) {
      metadata = await fetchMetadataFromIPFS(tokenURI, tokenId);
    }
  }

  // If all methods failed, create fallback metadata
  if (!metadata) {
    console.log(`🔄 Token ${tokenId || 'unknown'}: All storage methods failed, using fallback metadata`);
    
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

  // Cache the metadata
  if (metadata) {
    metadataCache.set(tokenURI, metadata);
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

export const useUserNFTs = (isActive: boolean = false, chainId: number = 545) => {
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
    console.log('useUserNFTs - chainId:', chainId, 'isActive:', isActive, 'connectedAddress:', connectedAddress);
    lastParamsRef.current = stableParams.key;
  }

  // Get contract address for the current chain
  const contractAddress = chainsToContracts[chainId]?.warriorsNFT;
  if (hasParamsChanged) {
    console.log('useUserNFTs - contractAddress for chain', chainId, ':', contractAddress);
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

  // Function to load detailed NFT data
  const loadNFTDetails = useCallback(async (tokenIds: bigint[]) => {
    if (loadingRef.current) {
      console.log('🔄 Already loading NFTs, skipping duplicate call');
      return;
    }

    if (!tokenIds || tokenIds.length === 0) {
      setUserNFTs([]);
      return;
    }

    const tokenIdsString = tokenIds.map(id => id.toString()).join(',');
    if (lastTokenIdsRef.current === tokenIdsString) {
      console.log('🔄 Same token IDs as last load, skipping');
      return;
    }

    loadingRef.current = true;
    lastTokenIdsRef.current = tokenIdsString;
    setIsLoadingNFTs(true);

    if (!contractAddress) {
      console.error(`Contract address not found for chain ${chainId}`);
      setUserNFTs([]);
      loadingRef.current = false;
      return;
    }

    setIsLoadingNFTs(true);

    try {
      // Process NFTs sequentially to avoid overwhelming IPFS gateways
      const nftResults: UserWarriors[] = [];
      
      for (let index = 0; index < tokenIds.length; index++) {
        const tokenId = tokenIds[index];
        
        try {
          console.log(`🔄 Processing NFT ${index + 1}/${tokenIds.length}: Token ID ${tokenId}`);
          
          // Create parallel requests for contract data (this is fine since it's our own API)
          const [encryptedURIResponse, traitsResponse, rankingResponse, winningsResponse] = await Promise.allSettled([
            // Get encrypted URI (where the actual 0G storage root hash is stored)
            fetch('/api/contract/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contractAddress: contractAddress,
                abi: warriorsNFTAbi,
                functionName: 'getEncryptedURI',
                args: [tokenId.toString()], // Convert BigInt to string
                chainId: chainId
              })
            }).then(async res => {
              const data = await res.json();
              if (!res.ok || data.error) {
                throw new Error(data.error || `HTTP ${res.status}`);
              }
              return data;
            }),
            
            // Get traits
            fetch('/api/contract/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contractAddress: contractAddress,
                abi: warriorsNFTAbi,
                functionName: 'getTraits',
                args: [tokenId.toString()], // Convert BigInt to string
                chainId: chainId
              })
            }).then(async res => {
              const data = await res.json();
              if (!res.ok || data.error) {
                throw new Error(data.error || `HTTP ${res.status}`);
              }
              return data;
            }),
            
            // Get ranking
            fetch('/api/contract/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contractAddress: contractAddress,
                abi: warriorsNFTAbi,
                functionName: 'getRanking',
                args: [tokenId.toString()], // Convert BigInt to string
                chainId: chainId
              })
            }).then(async res => {
              const data = await res.json();
              if (!res.ok || data.error) {
                throw new Error(data.error || `HTTP ${res.status}`);
              }
              return data;
            }),
            
            // Get winnings
            fetch('/api/contract/read', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contractAddress: contractAddress,
                abi: warriorsNFTAbi,
                functionName: 'getWinnings',
                args: [tokenId.toString()], // Convert BigInt to string
                chainId: chainId
              })
            }).then(async res => {
              const data = await res.json();
              if (!res.ok || data.error) {
                throw new Error(data.error || `HTTP ${res.status}`);
              }
              return data;
            })
          ]);

          // Extract results (handling potential failures)
          const encryptedURI = encryptedURIResponse.status === 'fulfilled' ? encryptedURIResponse.value : null;
          const contractTraits = traitsResponse.status === 'fulfilled' ? traitsResponse.value : null;
          const ranking = rankingResponse.status === 'fulfilled' ? rankingResponse.value : 0;
          const winnings = winningsResponse.status === 'fulfilled' ? winningsResponse.value : '0';

          // Use encrypted URI (where the actual 0G storage root hash is stored)
          const tokenURI = encryptedURI;

          // Log the responses for debugging
          console.log(`📄 Token ${tokenId} contract data loaded`);
          console.log(`🔍 Token ${tokenId}: Encrypted URI: "${encryptedURI}"`);
          console.log(`🎯 Token ${tokenId}: Using URI: "${tokenURI}"`);

          // Check for errors in responses
          if (encryptedURIResponse.status === 'rejected') {
            console.error(`Failed to get encryptedURI for ${tokenId}:`, encryptedURIResponse.reason);
          }
          if (traitsResponse.status === 'rejected') {
            console.error(`Failed to get traits for ${tokenId}:`, traitsResponse.reason);
          }
          if (rankingResponse.status === 'rejected') {
            console.error(`Failed to get ranking for ${tokenId}:`, rankingResponse.reason);
          }
          if (winningsResponse.status === 'rejected') {
            console.error(`Failed to get winnings for ${tokenId}:`, winningsResponse.reason);
          }

          // Fetch metadata from 0G Storage or IPFS if we have a tokenURI
          let metadata = null;
          if (tokenURI) {
            console.log(`🔍 Fetching metadata for token ${tokenId} from:`, tokenURI);
            metadata = await fetchMetadata(tokenURI, tokenId.toString());
            console.log(`📋 Metadata for token ${tokenId}:`, metadata);
          } else {
            console.warn(`⚠️ No tokenURI found for token ${tokenId}`);
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
              : metadata?.knowledge_areas || 'Combat, Strategy',
            traits,
            image: metadata?.image ? convertIpfsToProxyUrl(metadata.image) : '/lazered.png',
            rank: rankingToString(ranking),
            totalWinnings
          };

          nftResults.push(userWarriors);
          console.log(`✅ Completed processing NFT ${index + 1}/${tokenIds.length}:`, userWarriors.name);

          // Add a small delay between processing NFTs to avoid overwhelming IPFS gateways
          if (index < tokenIds.length - 1) {
            await delay(200); // 200ms delay between NFT processing
          }

        } catch (error) {
          console.error(`Error loading details for NFT ${tokenId}:`, error);
          
          // Return a basic object even if there's an error
          const errorWarriors: UserWarriors = {
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
          
          nftResults.push(errorWarriors);
          
          // Add delay even on error to prevent rapid successive failures
          if (index < tokenIds.length - 1) {
            await delay(200);
          }
        }
      }

      console.log('✅ Loaded all detailed NFT data:', nftResults);
      setUserNFTs(nftResults);

    } catch (error) {
      console.error('Error loading NFT details:', error);
      setUserNFTs([]);
    } finally {
      setIsLoadingNFTs(false);
      loadingRef.current = false;
    }
  }, [contractAddress, chainId]);

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
    };
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
      console.log('🐛 DEBUG STATE:');
      console.log('- userNFTs count:', userNFTs.length);
      console.log('- isLoadingNFTs:', isLoadingNFTs);
      console.log('- tokenIdsError:', tokenIdsError);
      console.log('- userTokenIds:', userTokenIds);
      console.log('- cache size:', metadataCache.size);
      console.log('- cached keys:', Array.from(metadataCache.keys()));
      userNFTs.forEach((nft, index) => {
        console.log(`- NFT ${index + 1}: ${nft.name} (Token ${nft.tokenId})`);
      });
    }
  };
};
