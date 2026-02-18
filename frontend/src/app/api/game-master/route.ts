import { NextRequest, NextResponse } from 'next/server';
import { privateKeyToAccount } from 'viem/accounts';
import { flowTestnet } from 'viem/chains';
import {
  createFlowPublicClient,
  createFlowFallbackClient,
  createFlowWalletClient,
  executeWithFlowFallbackForKey,
  isTimeoutError,
  RPC_TIMEOUT
} from '@/lib/flowClient';
import { ErrorResponses, RateLimitPresets } from '@/lib/api';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// Import the contract ABI and helpers
import { ArenaAbi, getApiBaseUrl } from '../../../constants';
import { warriorsNFTService, type WarriorsDetails } from '../../../services/warriorsNFTService';

// Default warrior data for fallback
const DEFAULT_WARRIOR_1 = {
  personality: {
    adjectives: ['brave', 'fierce', 'strategic'],
    knowledge_areas: ['combat', 'strategy', 'warfare']
  },
  traits: {
    Strength: 7500,
    Wit: 7000,
    Charisma: 6500,
    Defence: 7200,
    Luck: 6800
  }
};

const DEFAULT_WARRIOR_2 = {
  personality: {
    adjectives: ['cunning', 'agile', 'tactical'],
    knowledge_areas: ['combat', 'stealth', 'tactics']
  },
  traits: {
    Strength: 7200,
    Wit: 7300,
    Charisma: 6800,
    Defence: 7000,
    Luck: 7100
  }
};

/**
 * Fetch warrior NFT data with fallback to defaults
 */
async function getWarriorBattleData(
  nftId: bigint,
  defaults: typeof DEFAULT_WARRIOR_1
): Promise<{ personality: { adjectives: string[]; knowledge_areas: string[] }; traits: Record<string, number> }> {
  try {
    const details = await warriorsNFTService.getWarriorsDetails(Number(nftId));

    // Parse adjectives and knowledge_areas from comma-separated strings
    const adjectives = details.adjectives
      ? details.adjectives.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : defaults.personality.adjectives;

    const knowledge_areas = details.knowledge_areas
      ? details.knowledge_areas.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0)
      : defaults.personality.knowledge_areas;

    // Scale traits back to contract format (traits come as 0-100, contract uses 0-10000)
    const traits = {
      Strength: Math.round(details.traits.strength * 100),
      Wit: Math.round(details.traits.wit * 100),
      Charisma: Math.round(details.traits.charisma * 100),
      Defence: Math.round(details.traits.defence * 100),
      Luck: Math.round(details.traits.luck * 100)
    };

    console.log(`Game Master: Fetched NFT #${nftId} data - ${details.name}`);

    return {
      personality: {
        adjectives: adjectives.length > 0 ? adjectives : defaults.personality.adjectives,
        knowledge_areas: knowledge_areas.length > 0 ? knowledge_areas : defaults.personality.knowledge_areas
      },
      traits
    };
  } catch (error) {
    console.warn(`Game Master: Failed to fetch NFT #${nftId} data, using defaults:`, error);
    return defaults;
  }
}

// Lazy initialization of clients - only created when needed at runtime
// This prevents build-time errors when env vars are not set
let _gameMasterAccount: ReturnType<typeof privateKeyToAccount> | null = null;
let _walletClient: ReturnType<typeof createFlowWalletClient> | null = null;
let _publicClient: ReturnType<typeof createFlowPublicClient> | null = null;
let _fallbackClient: ReturnType<typeof createFlowFallbackClient> | null = null;

function getGameMasterAccount() {
  if (!_gameMasterAccount) {
    // Server-side only - private keys should never have NEXT_PUBLIC_ prefix
    const privateKey = process.env.GAME_MASTER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('GAME_MASTER_PRIVATE_KEY not found in environment variables. This is a server-side only variable.');
    }
    _gameMasterAccount = privateKeyToAccount(privateKey as `0x${string}`);
  }
  return _gameMasterAccount;
}

function getWalletClient() {
  if (!_walletClient) {
    _walletClient = createFlowWalletClient(getGameMasterAccount());
  }
  return _walletClient;
}

function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createFlowPublicClient();
  }
  return _publicClient;
}

function getFallbackClient() {
  if (!_fallbackClient) {
    _fallbackClient = createFlowFallbackClient();
  }
  return _fallbackClient;
}

// Wait for receipt with fallback
async function waitForReceiptWithFallback(hash: `0x${string}`) {
  const primaryClient = getPublicClient();
  const fallbackClient = getFallbackClient();
  try {
    return await primaryClient.waitForTransactionReceipt({ hash, timeout: RPC_TIMEOUT });
  } catch (error) {
    if (isTimeoutError(error)) {
      console.warn('[Game Master] Primary RPC timed out waiting for receipt, trying fallback...');
      return await fallbackClient.waitForTransactionReceipt({ hash, timeout: RPC_TIMEOUT });
    }
    throw error;
  }
}

interface ArenaState {
  address: string;
  isInitialized: boolean;
  currentRound: number;
  isBettingPeriod: boolean;
  gameInitializedAt: number;
  lastRoundEndedAt: number;
  minBettingPeriod: number;
  minBattleRoundsInterval: number;
  playerOneBetAddresses: string[];
  playerTwoBetAddresses: string[];
}

async function getArenaState(arenaAddress: string): Promise<ArenaState | null> {
  try {
    const [
      isInitialized,
      currentRound,
      isBettingPeriod,
      gameInitializedAt,
      lastRoundEndedAt,
      minBettingPeriod,
      minBattleRoundsInterval,
      playerOneBetAddresses,
      playerTwoBetAddresses
    ] = await Promise.all([
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getInitializationStatus',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getCurrentRound',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getIsBettingPeriodGoingOn',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getGameInitializedAt',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getLastRoundEndedAt',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getMinYodhaBettingPeriod',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getMinBattleRoundsInterval',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getPlayerOneBetAddresses',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getPlayerTwoBetAddresses',
      }))
    ]);

    return {
      address: arenaAddress,
      isInitialized: Boolean(isInitialized),
      currentRound: Number(currentRound),
      isBettingPeriod: Boolean(isBettingPeriod),
      gameInitializedAt: Number(gameInitializedAt),
      lastRoundEndedAt: Number(lastRoundEndedAt),
      minBettingPeriod: Number(minBettingPeriod),
      minBattleRoundsInterval: Number(minBattleRoundsInterval),
      playerOneBetAddresses: playerOneBetAddresses as string[],
      playerTwoBetAddresses: playerTwoBetAddresses as string[]
    };
  } catch (error) {
    console.error(`Failed to get arena state for ${arenaAddress}:`, error);
    return null;
  }
}

async function startGame(arenaAddress: string): Promise<boolean> {
  try {
    console.log(`Game Master: Starting game for arena ${arenaAddress}`);
    
    const hash = await getWalletClient().writeContract({
      address: arenaAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'startGame',
      chain: flowTestnet,
    });

    console.log(`Game Master: Start game transaction sent: ${hash}`);

    // Wait for transaction confirmation
    const receipt = await waitForReceiptWithFallback(hash);

    console.log(`Game Master: Game started successfully for arena ${arenaAddress}`);
    return receipt.status === 'success';
  } catch (error) {
    console.error(`Game Master: Failed to start game for arena ${arenaAddress}:`, error);
    return false;
  }
}

async function generateAIMoves(arenaAddress: string): Promise<{ agent_1: { move: string }, agent_2: { move: string } } | null> {
  try {
    // Get current battle data from contract
    const [currentRound, damageOnYodhaOne, damageOnYodhaTwo, warriorsOneNFTId, warriorsTwoNFTId] = await Promise.all([
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getCurrentRound',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getDamageOnYodhaOne',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getDamageOnYodhaTwo',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getYodhaOneNFTId',
      })),
      executeWithFlowFallbackForKey(arenaAddress, (client) => client.readContract({
        address: arenaAddress as `0x${string}`,
        abi: ArenaAbi,
        functionName: 'getYodhaTwoNFTId',
      }))
    ]);

    // Fetch actual NFT metadata for both warriors in parallel
    console.log(`Game Master: Fetching NFT data for warriors #${warriorsOneNFTId} and #${warriorsTwoNFTId}`);
    const [warrior1Data, warrior2Data] = await Promise.all([
      getWarriorBattleData(warriorsOneNFTId as bigint, DEFAULT_WARRIOR_1),
      getWarriorBattleData(warriorsTwoNFTId as bigint, DEFAULT_WARRIOR_2)
    ]);

    const battlePrompt = {
      current_round: Number(currentRound),
      agent_1: {
        personality: warrior1Data.personality,
        traits: warrior1Data.traits,
        total_damage_received: Number(damageOnYodhaOne)
      },
      agent_2: {
        personality: warrior2Data.personality,
        traits: warrior2Data.traits,
        total_damage_received: Number(damageOnYodhaTwo)
      },
      moveset: [
        "strike",
        "taunt",
        "dodge",
        "recover",
        "special_move"
      ]
    };

    // Call 0G AI for move selection
    console.log('Game Master: Calling 0G AI for move selection...');
    const response = await fetch(`${getApiBaseUrl()}/api/generate-battle-moves`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        battlePrompt: battlePrompt
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Game Master: 0G AI API Error:', errorText);
      return null;
    }

    const data = await response.json();
    if (!data.success) {
      console.error('Game Master: 0G AI API Error:', data.error);
      return null;
    }

    console.log('Game Master: 0G AI Response:', data.response);

    // Parse the AI response to extract moves
    try {
      const aiResponse = JSON.parse(data.response);
      
      // Handle multiple possible AI response formats
      let agent1Move: string | undefined;
      let agent2Move: string | undefined;
      
      if (aiResponse.agent_1?.move && aiResponse.agent_2?.move) {
        agent1Move = aiResponse.agent_1.move;
        agent2Move = aiResponse.agent_2.move;
      } else if (aiResponse.agent_1_move && aiResponse.agent_2_move) {
        agent1Move = aiResponse.agent_1_move;
        agent2Move = aiResponse.agent_2_move;
      } else if (aiResponse.moves?.agent_1 && aiResponse.moves?.agent_2) {
        agent1Move = aiResponse.moves.agent_1;
        agent2Move = aiResponse.moves.agent_2;
      } else if (typeof aiResponse.agent_1 === 'string' && typeof aiResponse.agent_2 === 'string') {
        agent1Move = aiResponse.agent_1;
        agent2Move = aiResponse.agent_2;
      } else if (aiResponse['agent_1.Move'] && aiResponse['agent_2.Move']) {
        agent1Move = aiResponse['agent_1.Move'];
        agent2Move = aiResponse['agent_2.Move'];
      } else if (aiResponse.agent_moves && aiResponse.agent_moves.agent_1 && aiResponse.agent_moves.agent_2) {
        agent1Move = aiResponse.agent_moves.agent_1;
        agent2Move = aiResponse.agent_moves.agent_2;
      }
      
      if (agent1Move && agent2Move) {
        return {
          agent_1: { move: agent1Move },
          agent_2: { move: agent2Move }
        };
      } else {
        console.error('Game Master: Invalid AI response format');
        return null;
      }
    } catch (parseError) {
      console.error('Game Master: Failed to parse AI response:', parseError);
      return null;
    }
  } catch (error) {  
    console.error('Game Master: Failed to generate AI moves:', error);
    return null;
  }
}

async function executeNextRound(arenaAddress: string): Promise<boolean> {
  try {
    console.log(`Game Master: Executing next round for arena ${arenaAddress}`);
    
    // Generate AI moves
    const moves = await generateAIMoves(arenaAddress);
    if (!moves) {
      console.error('Game Master: Failed to generate AI moves');
      return false;
    }

    console.log(`Game Master: AI selected moves - Agent 1: ${moves.agent_1.move}, Agent 2: ${moves.agent_2.move}`);

    // Map move names to contract enum values
    const moveMapping: { [key: string]: number } = {
      'strike': 0,
      'taunt': 1, 
      'dodge': 2,
      'special_move': 3,
      'special': 3, // Handle both special_move and special
      'recover': 4
    };

    const warriorsOneMove = moveMapping[moves.agent_1.move.toLowerCase()] ?? 0;
    const warriorsTwoMove = moveMapping[moves.agent_2.move.toLowerCase()] ?? 0;

    // Create signature for the battle moves (this would normally be done by 0G AI agent)
    // For automation, we'll use the game master's signature
    // The contract expects: keccak256(abi.encodePacked(_warriorsOneMove, _warriorsTwoMove))
    // followed by MessageHashUtils.toEthSignedMessageHash()
    
    const { encodePacked, keccak256, toHex } = await import('viem');
    
    // Encode the moves as the contract expects: abi.encodePacked(uint8, uint8)
    const encodedMoves = encodePacked(['uint8', 'uint8'], [warriorsOneMove, warriorsTwoMove]);
    
    // Create the keccak256 hash
    const dataHash = keccak256(encodedMoves);
    
    // The contract uses MessageHashUtils.toEthSignedMessageHash() which prefixes with "\x19Ethereum Signed Message:\n32"
    const ethSignedMessageHash = keccak256(
      encodePacked(['string', 'bytes32'], ['\x19Ethereum Signed Message:\n32', dataHash])
    );
    
    // Sign the Ethereum signed message hash
    const signature = await getGameMasterAccount().signMessage({
      message: { raw: ethSignedMessageHash }
    });

    console.log(`Game Master: Executing battle with moves ${warriorsOneMove} vs ${warriorsTwoMove}`);

    const hash = await getWalletClient().writeContract({
      address: arenaAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'battle',
      args: [warriorsOneMove, warriorsTwoMove, signature as `0x${string}`],
      chain: flowTestnet,
    });

    console.log(`Game Master: Battle transaction sent: ${hash}`);

    // Wait for transaction confirmation
    const receipt = await waitForReceiptWithFallback(hash);

    console.log(`Game Master: Next round executed successfully for arena ${arenaAddress}`);
    return receipt.status === 'success';
  } catch (error) {
    console.error(`Game Master: Failed to execute next round for arena ${arenaAddress}:`, error);
    return false;
  }
}

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'game-master', ...RateLimitPresets.storageWrite }),
  async (req, ctx) => {
    const body = await req.json();
    const { action, arenaAddresses } = body;

    if (!action || !arenaAddresses || !Array.isArray(arenaAddresses)) {
      throw ErrorResponses.badRequest('Missing action or arenaAddresses array');
    }

    const results: { [key: string]: any } = {};

    for (const arenaAddress of arenaAddresses) {
      console.log(`Game Master: Processing ${action} for arena ${arenaAddress}`);

      const arenaState = await getArenaState(arenaAddress);
      if (!arenaState) {
        results[arenaAddress] = { success: false, error: 'Failed to get arena state' };
        continue;
      }

      const currentTime = Math.floor(Date.now() / 1000);

      if (action === 'checkAndStartGames') {
        // Check if betting period is over and there are bets on both sides
        const bettingEndTime = arenaState.gameInitializedAt + arenaState.minBettingPeriod;
        const shouldStartGame = arenaState.isInitialized &&
                               arenaState.isBettingPeriod &&
                               currentTime >= bettingEndTime &&
                               arenaState.playerOneBetAddresses.length > 0 &&
                               arenaState.playerTwoBetAddresses.length > 0;

        if (shouldStartGame) {
          console.log(`Game Master: Starting game for arena ${arenaAddress} - betting period ended`);
          const success = await startGame(arenaAddress);
          results[arenaAddress] = { success, action: 'started', bettingEndTime, currentTime };
        } else {
          results[arenaAddress] = {
            success: true,
            action: 'no_action_needed',
            reason: !arenaState.isInitialized ? 'not_initialized' :
                   !arenaState.isBettingPeriod ? 'not_in_betting_period' :
                   currentTime < bettingEndTime ? 'betting_period_ongoing' :
                   arenaState.playerOneBetAddresses.length === 0 ? 'no_bets_warriors_one' :
                   arenaState.playerTwoBetAddresses.length === 0 ? 'no_bets_warriors_two' : 'unknown',
            bettingEndTime,
            currentTime
          };
        }
      } else if (action === 'checkAndExecuteRounds') {
        // Check if it's time for next round
        const roundEndTime = arenaState.lastRoundEndedAt + arenaState.minBattleRoundsInterval;
        const shouldExecuteRound = arenaState.isInitialized &&
                                  !arenaState.isBettingPeriod &&
                                  arenaState.currentRound > 0 &&
                                  arenaState.currentRound < 6 && // Game has max 5 rounds
                                  currentTime >= roundEndTime;

        if (shouldExecuteRound) {
          console.log(`Game Master: Executing next round for arena ${arenaAddress} - round interval passed`);
          const success = await executeNextRound(arenaAddress);
          results[arenaAddress] = { success, action: 'executed_round', roundEndTime, currentTime, round: arenaState.currentRound };
        } else {
          results[arenaAddress] = {
            success: true,
            action: 'no_action_needed',
            reason: !arenaState.isInitialized ? 'not_initialized' :
                   arenaState.isBettingPeriod ? 'in_betting_period' :
                   arenaState.currentRound === 0 ? 'game_not_started' :
                   arenaState.currentRound >= 6 ? 'game_finished' :
                   currentTime < roundEndTime ? 'round_interval_ongoing' : 'unknown',
            roundEndTime,
            currentTime,
            round: arenaState.currentRound
          };
        }
      } else {
        results[arenaAddress] = { success: false, error: 'Invalid action' };
      }
    }

    return NextResponse.json({ success: true, results });
  },
], { errorContext: 'API:GameMaster:POST' });
