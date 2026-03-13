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

// Metadata structure from 0G Storage
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

// 0G Storage downloads use the shared SDK helper (server-side)
// or the internal API route (client-side via processImageURI)

/**
 * Fetch metadata from 0G Storage using root hash via internal API route.
 * This service is imported in both client and server contexts (arenaService → arena/page.tsx),
 * so we use the API route instead of the SDK helper to avoid bundling Node.js modules.
 */
const fetchMetadataFrom0G = async (rootHash: string, tokenId: number): Promise<WarriorsMetadata | null> => {
  try {
    console.log(`🔗 Warriors ${tokenId}: Fetching metadata from 0G Storage`);
    console.log(`🔑 Root Hash: ${rootHash}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(`/api/0g/download?rootHash=${encodeURIComponent(rootHash)}`, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`0G download API returned ${response.status}: ${response.statusText}`);
    }

    const metadata = await response.json() as WarriorsMetadata;
    console.log(`✅ Warriors ${tokenId}: Successfully fetched metadata from 0G Storage`);

    return metadata;
  } catch (error) {
    console.warn(`⚠️ Warriors ${tokenId}: 0G Storage unavailable, will use fallback:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
};

/**
 * Fetch metadata from 0G Storage using the tokenURI as root hash
 */
const fetchMetadata = async (tokenURI: string, tokenId: number): Promise<WarriorsMetadata> => {
  // Check cache first
  if (metadataCache.has(tokenURI)) {
    console.log(`📦 Warriors ${tokenId}: Using cached metadata`);
    return metadataCache.get(tokenURI)!;
  }

  let metadata: WarriorsMetadata | null = null;

  // Fetch from 0G Storage (tokenURI is a root hash)
  metadata = await fetchMetadataFrom0G(tokenURI, tokenId);

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
  
  // If it's a 0G storage URI, convert it to the internal API endpoint
  if (imageURI.startsWith('0g://')) {
    const rootHash = imageURI.replace('0g://', '').split(':')[0];
    return `/api/0g/download?rootHash=${encodeURIComponent(rootHash)}`;
  }

  // If it's a root hash, use 0G storage
  if (imageURI.startsWith('0x')) {
    return `/api/0g/download?rootHash=${encodeURIComponent(imageURI)}`;
  }

  // For any other format, try 0G download
  return `/api/0g/download?rootHash=${encodeURIComponent(imageURI)}`;
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
   * Fetch complete Warriors details including metadata from 0G Storage
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

      // Fetch metadata from 0G Storage
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