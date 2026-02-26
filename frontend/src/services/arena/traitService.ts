/**
 * Arena Trait Service
 *
 * Lightweight on-chain trait fetcher for battle contexts.
 * Calls getTraits(tokenId) on the WarriorsNFT contract and returns
 * raw uint16 values in the 0-10000 range expected by arenaScoring.ts.
 *
 * Each fetch independently falls back to balanced defaults on RPC failure
 * so one warrior's error never blocks the other.
 */

import { readContract } from '@wagmi/core';
import { getConfig } from '@/rainbowKitConfig';
import { getContracts, warriorsNFTAbi, getChainId } from '@/constants';
import { WarriorTraits } from '@/types/predictionArena';

const DEFAULT_TRAITS: WarriorTraits = {
  strength: 5000,
  wit: 5000,
  charisma: 5000,
  defence: 5000,
  luck: 5000,
};

/**
 * Fetch raw on-chain traits for a warrior (0-10000 range).
 * Falls back to balanced defaults if RPC call fails.
 */
export async function fetchWarriorTraits(tokenId: number): Promise<WarriorTraits> {
  try {
    const config = getConfig();
    const nftAddress = getContracts().warriorsNFT as `0x${string}`;
    const chainId = getChainId();

    const result = await readContract(config, {
      address: nftAddress,
      abi: warriorsNFTAbi,
      functionName: 'getTraits',
      args: [BigInt(tokenId)],
      chainId,
    }) as { strength: number | bigint; wit: number | bigint; charisma: number | bigint; defence: number | bigint; luck: number | bigint };

    return {
      strength: Number(result.strength ?? 5000),
      wit: Number(result.wit ?? 5000),
      charisma: Number(result.charisma ?? 5000),
      defence: Number(result.defence ?? 5000),
      luck: Number(result.luck ?? 5000),
    };
  } catch (err) {
    console.warn(
      `[TraitService] Failed to fetch traits for warrior ${tokenId}, using defaults:`,
      err instanceof Error ? err.message : err
    );
    return { ...DEFAULT_TRAITS };
  }
}

/**
 * Fetch traits for a pair of warriors in parallel.
 * Each call independently falls back to defaults on failure.
 */
export async function fetchBattleTraits(
  warrior1Id: number,
  warrior2Id: number,
): Promise<{ w1Traits: WarriorTraits; w2Traits: WarriorTraits }> {
  const [w1Traits, w2Traits] = await Promise.all([
    fetchWarriorTraits(warrior1Id),
    fetchWarriorTraits(warrior2Id),
  ]);
  return { w1Traits, w2Traits };
}

export { DEFAULT_TRAITS };
