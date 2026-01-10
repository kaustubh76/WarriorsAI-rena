import { readContract } from '@wagmi/core';
import { getContracts, warriorsNFTAbi, getChainId } from '../constants';
import rainbowKitConfig from '../rainbowKitConfig';

export interface WarriorsTraits {
  strength: number;
  wit: number;
  charisma: number;
  defence: number;
  luck: number;
}

// Metadata structure from 0G Storage or IPFS
export interface WarriorsMetadata {
  name: string;
  description: string;
  image: string;
  bio?: string;
  life_history?: string;
  adjectives?: string;
  knowledge_areas?: string;
  attributes: Array<{
    trait_type: string;
    value: number;
  }>;
}

export interface WarriorsDetails {
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
  owner: string;
  tokenURI: string;
}

// Cache for metadata to avoid repeated calls
const metadataCache = new Map<string, WarriorsMetadata>();

// 0G Storage service configuration - use environment variable
const ZG_STORAGE_API_URL = process.env.NEXT_PUBLIC_STORAGE_API_URL || 'http://localhost:3001';

// Legacy IPFS gateways (fallback only)
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs/',
  'https://cloudflare-ipfs.com/ipfs/',
  'https://w3s.link/ipfs/',
  'https://gateway.ipfs.io/ipfs/'
];

/**
 * Fetch metadata from 0G Storage using root hash
 */
const fetchMetadataFrom0G = async (rootHash: string, tokenId: number): Promise<WarriorsMetadata | null> => {
  try {
    console.log(`🔗 Warriors ${tokenId}: Fetching metadata from 0G Storage`);
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
    
    const metadata = await response.json() as WarriorsMetadata;
    console.log(`✅ Warriors ${tokenId}: Successfully fetched metadata from 0G Storage`);
    
    return metadata;
    
  } catch (error) {
    console.error(`❌ Warriors ${tokenId}: 0G Storage fetch failed:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
};

/**
 * Fetch metadata from IPFS with multiple gateway fallback (legacy support)
 */
const fetchMetadataFromIPFS = async (tokenURI: string, tokenId: number): Promise<WarriorsMetadata | null> => {
  console.log(`🔍 Warriors ${tokenId}: Fetching metadata from IPFS (fallback)`);
  console.log(`📎 TokenURI: ${tokenURI}`);

  // Extract IPFS hash from various URI formats
  let ipfsHash = '';
  
  if (tokenURI.startsWith('ipfs://')) {
    ipfsHash = tokenURI.replace('ipfs://', '');
  } else if (tokenURI.includes('/ipfs/')) {
    ipfsHash = tokenURI.split('/ipfs/')[1];
  } else {
    // Assume it's already an IPFS hash
    ipfsHash = tokenURI;
  }

  console.log(`🔗 IPFS Hash: ${ipfsHash}`);

  // Try each gateway
  for (let i = 0; i < IPFS_GATEWAYS.length; i++) {
    const gateway = IPFS_GATEWAYS[i];
    const url = `${gateway}${ipfsHash}`;
    
    try {
      console.log(`🌐 Warriors ${tokenId}: Trying IPFS gateway ${i + 1}/${IPFS_GATEWAYS.length}: ${gateway}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        console.log(`❌ Warriors ${tokenId}: Gateway ${gateway} returned ${response.status}`);
        continue;
      }
      
      const metadata = await response.json() as WarriorsMetadata;
      console.log(`✅ Warriors ${tokenId}: Successfully fetched metadata from IPFS ${gateway}`);
      
      return metadata;
      
    } catch (error) {
      console.log(`⚠️ Warriors ${tokenId}: Gateway ${gateway} failed:`, error instanceof Error ? error.message : 'Unknown error');
      continue;
    }
  }
  
  return null;
};

/**
 * Unified metadata fetching function that handles both 0G Storage and IPFS
 */
const fetchMetadata = async (tokenURI: string, tokenId: number): Promise<WarriorsMetadata> => {
  // Check cache first
  if (metadataCache.has(tokenURI)) {
    console.log(`📦 Warriors ${tokenId}: Using cached metadata`);
    return metadataCache.get(tokenURI)!;
  }

  let metadata: WarriorsMetadata | null = null;

  // Check if tokenURI is a 0G root hash (starts with 0x)
  if (tokenURI.startsWith('0x')) {
    console.log(`🔗 Warriors ${tokenId}: Detected 0G root hash format`);
    metadata = await fetchMetadataFrom0G(tokenURI, tokenId);
  } 
  // Check if tokenURI is an IPFS CID
  else if (tokenURI.startsWith('ipfs://') || tokenURI.includes('/ipfs/')) {
    console.log(`🔗 Warriors ${tokenId}: Detected IPFS format`);
    metadata = await fetchMetadataFromIPFS(tokenURI, tokenId);
  }
  // Try both methods if format is unclear
  else {
    console.log(`🔗 Warriors ${tokenId}: Unclear format, trying 0G first then IPFS`);
    metadata = await fetchMetadataFrom0G(tokenURI, tokenId);
    if (!metadata) {
      metadata = await fetchMetadataFromIPFS(tokenURI, tokenId);
    }
  }

  // If all methods failed, use fallback metadata
  if (!metadata) {
    console.log(`🔄 Warriors ${tokenId}: All storage methods failed, using fallback`);
    metadata = {
      name: `Warriors Warrior #${tokenId}`,
      description: "A legendary warrior from the Warriors AI-rena battlefield",
      image: "/lazered.png", // Fallback image
      bio: "Ancient warrior whose full history is being retrieved...",
      life_history: "Born in the age of digital warfare...",
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

  // Cache the result
  metadataCache.set(tokenURI, metadata);
  return metadata;
};

/**
 * Process image URI from metadata and convert 0G storage URIs to proper URLs
 */
export const processImageURI = (imageURI: string): string => {
  // If it's already a regular URL (http/https) or relative path, return as-is
  if (imageURI.startsWith('http') || imageURI.startsWith('/')) {
    return imageURI;
  }
  
  // If it's a 0G storage URI, convert it to the proper API endpoint
  if (imageURI.startsWith('0g://')) {
    // Extract the root hash from the 0G URI
    const rootHash = imageURI.replace('0g://', '').split(':')[0];
    return `${ZG_STORAGE_API_URL}/download/${rootHash}`;
  }
  
  // If it's an IPFS URI, use the first IPFS gateway
  if (imageURI.startsWith('ipfs://')) {
    const ipfsHash = imageURI.replace('ipfs://', '');
    return `${IPFS_GATEWAYS[0]}${ipfsHash}`;
  }
  
  // If format is unclear, assume it's a root hash and try 0G storage
  if (imageURI.startsWith('0x')) {
    return `${ZG_STORAGE_API_URL}/download/${imageURI}`;
  }
  
  // Fallback to the original URI
  return imageURI;
};

// Rank mapping (from enum value to string)
const rankingToString = (rankValue: number): 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' => {
  switch (rankValue) {
    case 0: return 'unranked';
    case 1: return 'bronze';
    case 2: return 'silver';
    case 3: return 'gold';
    case 4: return 'platinum';
    default: return 'unranked';
  }
};

export const warriorsNFTService = {
  /**
   * Fetch complete Warriors details including metadata from 0G Storage or IPFS
   */
  async getWarriorsDetails(tokenId: number): Promise<WarriorsDetails> {
    try {
      // Fetch basic contract data including traits from contract
      const [encryptedURI, ranking, winnings, owner, contractTraits] = await Promise.all([
        readContract(rainbowKitConfig, {
          address: getContracts().warriorsNFT as `0x${string}`,
          abi: warriorsNFTAbi,
          functionName: 'getEncryptedURI',
          args: [BigInt(tokenId)],
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: getContracts().warriorsNFT as `0x${string}`,
          abi: warriorsNFTAbi,
          functionName: 'getRanking',
          args: [BigInt(tokenId)],
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: getContracts().warriorsNFT as `0x${string}`,
          abi: warriorsNFTAbi,
          functionName: 'getWinnings',
          args: [BigInt(tokenId)],
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: getContracts().warriorsNFT as `0x${string}`,
          abi: warriorsNFTAbi,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
          chainId: getChainId(),
        }),
        readContract(rainbowKitConfig, {
          address: getContracts().warriorsNFT as `0x${string}`,
          abi: warriorsNFTAbi,
          functionName: 'getTraits',
          args: [BigInt(tokenId)],
          chainId: getChainId(),
        })
      ]);

      // Use encrypted URI (where the actual 0G storage root hash is stored)
      const tokenURI = encryptedURI as string;

      console.log(`🔍 Warriors ${tokenId}: Encrypted URI: "${encryptedURI}"`);
      console.log(`🎯 Warriors ${tokenId}: Using URI: "${tokenURI}"`);

      // Fetch metadata from 0G Storage or IPFS
      const metadata = await fetchMetadata(tokenURI, tokenId);
      
      // Use traits from contract instead of metadata, divide by 100 for display
      const traits: WarriorsTraits = {
        strength: Number((contractTraits as { strength: bigint }).strength ?? BigInt(5000)) / 100,
        wit: Number((contractTraits as { wit: bigint }).wit ?? BigInt(5000)) / 100,
        charisma: Number((contractTraits as { charisma: bigint }).charisma ?? BigInt(5000)) / 100,
        defence: Number((contractTraits as { defence: bigint }).defence ?? BigInt(5000)) / 100,
        luck: Number((contractTraits as { luck: bigint }).luck ?? BigInt(5000)) / 100
      };

      // Process metadata fields to handle both array and string formats
      const processArrayField = (field: any): string => {
        if (Array.isArray(field)) {
          return field.join(', ');
        }
        return field || '';
      };

      // Map personality to adjectives and handle array formats
      const adjectives = processArrayField(metadata.personality || metadata.adjectives);
      const knowledgeAreas = processArrayField(metadata.knowledge_areas);

      // Construct complete Warriors details
      const warriorsDetails: WarriorsDetails = {
        id: tokenId,
        tokenId: tokenId,
        name: metadata.name,
        bio: metadata.bio || '',
        life_history: metadata.life_history || '',
        adjectives: adjectives,
        knowledge_areas: knowledgeAreas,
        traits: traits,
        image: processImageURI(metadata.image),
        rank: rankingToString(Number(ranking)),
        totalWinnings: Number(winnings),
        owner: owner as string,
        tokenURI: tokenURI
      };

      return warriorsDetails;
    } catch (error) {
      console.error(`Error fetching Warriors ${tokenId} details:`, error);
      throw error;
    }
  },

  /**
   * Fetch multiple Warriors details in batch
   */
  async getBatchWarriorsDetails(tokenIds: number[]): Promise<WarriorsDetails[]> {
    const results: WarriorsDetails[] = [];
    
    // Process in smaller batches to avoid overwhelming storage services
    const batchSize = 3;
    for (let i = 0; i < tokenIds.length; i += batchSize) {
      const batch = tokenIds.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (tokenId) => {
        try {
          return await this.getWarriorsDetails(tokenId);
        } catch (error) {
          console.error(`Failed to fetch Warriors ${tokenId}:`, error);
          return null;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter(result => result !== null) as WarriorsDetails[]);
      
      // Add delay between batches
      if (i + batchSize < tokenIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  },

  /**
   * Clear metadata cache
   */
  clearCache(): void {
    metadataCache.clear();
    console.log('🗑️ Warriors NFT metadata cache cleared');
  }
}; 