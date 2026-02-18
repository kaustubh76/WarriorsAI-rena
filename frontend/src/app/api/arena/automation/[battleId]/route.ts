/**
 * Arena Battle Automation API Route
 * GET: Get current game state for a battle
 * POST: Control battle automation (initialize, pause, resume, cleanup, status)
 *
 * NOTE: This route uses module-level in-memory state (Maps, setInterval timers).
 * This works on persistent Node.js servers but NOT on serverless (Vercel).
 * In serverless, each invocation may hit a different instance, losing state.
 */

import { NextResponse } from 'next/server';
import { keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ArenaAbi, chainsToContracts } from '@/constants';
import {
  createFlowPublicClient,
  createFlowFallbackClient,
  createFlowWalletClient,
  isTimeoutError,
  RPC_TIMEOUT,
} from '@/lib/flowClient';
import { RateLimitPresets } from '@/lib/api';
import { ErrorResponses } from '@/lib/api/errorHandler';
import { composeMiddleware, withRateLimit } from '@/lib/api/middleware';

// In-memory game state (requires persistent server)
const gameStates = new Map<string, any>();
const activeTimers = new Map<string, NodeJS.Timeout>();
const lastTransactionHashes = new Map<string, string>();

// Lazily-initialized blockchain clients
let walletClient: any = null;
let publicClient: any = null;
let fallbackClient: any = null;

function initializeClients() {
  if (walletClient && publicClient && fallbackClient) return { walletClient, publicClient, fallbackClient };

  try {
    publicClient = createFlowPublicClient();
    fallbackClient = createFlowFallbackClient();

    const gameMasterPrivateKey = process.env.NEXT_PUBLIC_GAME_MASTER_PRIVATE_KEY;
    if (!gameMasterPrivateKey) {
      console.warn('Game master private key not found - automation will be simulation only');
      return { walletClient: null, publicClient, fallbackClient };
    }

    const gameMasterAccount = privateKeyToAccount(
      gameMasterPrivateKey.startsWith('0x')
        ? gameMasterPrivateKey as `0x${string}`
        : `0x${gameMasterPrivateKey}` as `0x${string}`
    );

    walletClient = createFlowWalletClient(gameMasterAccount);

    console.log('Blockchain clients initialized successfully for Flow');
    return { walletClient, publicClient, fallbackClient };
  } catch (error) {
    console.error('Failed to initialize blockchain clients:', error);
    return { walletClient: null, publicClient: null, fallbackClient: null };
  }
}

async function executeStartGame(battleId: string) {
  console.log(`Executing startGame() on contract ${battleId}`);

  const { walletClient, publicClient } = initializeClients();
  if (!walletClient || !publicClient) {
    return { success: false, error: 'No wallet or public client available' };
  }

  try {
    const contractAddress = battleId;

    // Check if contract exists
    try {
      const code = await publicClient.getBytecode({
        address: contractAddress as `0x${string}`
      });

      if (!code || code === '0x') {
        console.error(`No contract found at address ${contractAddress} for startGame()`);
        return { success: false, error: 'No contract at address for startGame()' };
      }

      console.log(`Contract verified for startGame() at ${contractAddress}, bytecode length: ${code.length}`);
    } catch (codeError) {
      console.warn(`Could not verify contract code before startGame(): ${codeError}`);
    }

    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'startGame',
      args: []
    });

    console.log(`Start game transaction sent: ${hash}`);

    // Wait for receipt with fallback
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        timeout: RPC_TIMEOUT
      });
    } catch (waitError) {
      if (isTimeoutError(waitError) && fallbackClient) {
        console.warn('[Arena] Primary RPC timed out waiting for receipt, trying fallback...');
        receipt = await fallbackClient.waitForTransactionReceipt({
          hash: hash as `0x${string}`,
          timeout: RPC_TIMEOUT
        });
      } else {
        throw waitError;
      }
    }

    lastTransactionHashes.set(battleId, hash as string);

    console.log(`Start game confirmed in block ${receipt.blockNumber}`);

    return { success: true, hash, receipt };
  } catch (error) {
    console.error(`Failed to start game for battle ${battleId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function executeBattle(battleId: string, move1: number, move2: number) {
  console.log(`Executing battle() on contract ${battleId} with moves: ${move1} vs ${move2}`);

  const { walletClient, publicClient, fallbackClient } = initializeClients();
  if (!walletClient || !publicClient) {
    return { success: false, error: 'No wallet or public client available' };
  }

  try {
    const contractAddress = battleId;

    // Create signature for the battle moves
    const encodedMoves = encodePacked(['uint8', 'uint8'], [move1, move2]);
    const dataHash = keccak256(encodedMoves);
    const ethSignedMessageHash = keccak256(
      encodePacked(['string', 'bytes32'], ['\x19Ethereum Signed Message:\n32', dataHash])
    );

    const signature = await walletClient.signMessage({
      message: { raw: ethSignedMessageHash }
    });

    console.log(`Generated signature for moves ${move1}, ${move2}`);

    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'battle',
      args: [move1, move2, signature]
    });

    console.log(`Battle transaction sent: ${hash}`);

    // Wait for receipt with fallback
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash: hash as `0x${string}`,
        timeout: RPC_TIMEOUT
      });
    } catch (waitError) {
      if (isTimeoutError(waitError) && fallbackClient) {
        console.warn('[Arena] Primary RPC timed out waiting for receipt, trying fallback...');
        receipt = await fallbackClient.waitForTransactionReceipt({
          hash: hash as `0x${string}`,
          timeout: RPC_TIMEOUT
        });
      } else {
        throw waitError;
      }
    }

    lastTransactionHashes.set(battleId, hash as string);

    console.log(`Battle confirmed in block ${receipt.blockNumber}`);

    return { success: true, hash, receipt };
  } catch (error) {
    console.error(`Failed to execute battle for ${battleId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

async function autoExecuteNextRound(battleId: string) {
  console.log(`AUTO-EXECUTING: Next round for battle ${battleId}`);

  const state = gameStates.get(battleId);
  if (!state) {
    console.error('Game state not found');
    return { success: false, error: 'Game state not found' };
  }

  const { walletClient, publicClient } = initializeClients();
  if (!walletClient || !publicClient) {
    console.log('No wallet client - simulating round');
    return { success: false, error: 'No wallet client available' };
  }

  try {
    // Check the current round on the contract
    const contractAddress = battleId;
    const currentRound = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'getCurrentRound'
    });

    console.log(`Contract current round: ${currentRound}`);

    // If round is 0, we need to call startGame() first
    if (currentRound === 0) {
      console.log(`Contract round is 0 - calling startGame() first`);
      const startResult = await executeStartGame(battleId);

      if (!startResult.success) {
        console.error(`Failed to start game: ${startResult.error}`);
        return startResult;
      }

      console.log(`Game started successfully, will execute first battle in next timer cycle`);

      state.gameStarted = true;
      state.lastTransactionHash = startResult.hash;
      state.timeRemaining = 40;
      state.totalTime = 40;
      state.lastUpdate = Date.now();
      gameStates.set(battleId, state);

      return { success: true, hash: startResult.hash, gameStarted: true };
    }

    // If round >= 6, game is finished
    if (currentRound >= 6) {
      console.log(`Game finished (round ${currentRound}), stopping automation`);
      state.gameState = 'finished';
      gameStates.set(battleId, state);
      return { success: true, gameFinished: true };
    }

    console.log(`Proceeding with battle for round ${currentRound}`);

    // Generate AI moves
    const move1 = Math.floor(Math.random() * 5);
    const move2 = Math.floor(Math.random() * 5);

    console.log(`AI selected moves: ${move1} vs ${move2}`);

    // Execute battle
    const battleResult = await executeBattle(battleId, move1, move2);

    if (!battleResult.success) {
      console.error(`Battle failed: ${battleResult.error}`);
      return battleResult;
    }

    console.log(`Battle round ${currentRound} completed successfully`);

    // Update local state
    state.currentRound = currentRound + 1;
    state.lastTransactionHash = battleResult.hash;
    state.timeRemaining = 40;
    state.totalTime = 40;
    state.lastUpdate = Date.now();
    gameStates.set(battleId, state);

    return { success: true, hash: battleResult.hash, round: currentRound };

  } catch (readError) {
    console.error(`Failed to read contract round: ${readError}`);
    return { success: false, error: 'Failed to read contract state' };
  }
}

function stopRoundTimer(battleId: string) {
  const timer = activeTimers.get(battleId);
  if (timer) {
    console.log(`Stopping auto round timer for battle ${battleId}`);
    clearInterval(timer);
    activeTimers.delete(battleId);
  }
}

function startRoundTimer(battleId: string, intervalMs: number = 1000) {
  stopRoundTimer(battleId);

  console.log(`Starting auto round timer for battle ${battleId} (${intervalMs}ms interval)`);

  const timer = setInterval(async () => {
    const state = gameStates.get(battleId);
    if (!state) {
      console.log(`Battle ${battleId} not found, stopping timer`);
      stopRoundTimer(battleId);
      return;
    }

    if (state.gameState === 'finished' || state.gameState === 'paused') {
      console.log(`Battle ${battleId} is ${state.gameState}, stopping timer`);
      stopRoundTimer(battleId);
      return;
    }

    // Update countdown
    state.timeRemaining = Math.max(0, state.timeRemaining - 1);
    state.lastUpdate = Date.now();

    if (state.timeRemaining > 0) {
      gameStates.set(battleId, state);
      return;
    }

    // Timer reached 0, execute the next action
    console.log(`Time expired! Auto-executing round ${state.currentRound}...`);

    try {
      const result = await autoExecuteNextRound(battleId);

      if (!result.success) {
        console.error(`Auto-execution failed: ${result.error}`);
        state.gameState = 'paused';
        state.automationPaused = true;
        state.pauseReason = result.error;
        gameStates.set(battleId, state);
        stopRoundTimer(battleId);
        console.log(`Manual intervention required for battle ${battleId}`);
        return;
      }

      if (result.gameFinished) {
        console.log(`Game completed for battle ${battleId}`);
        state.gameState = 'finished';
        gameStates.set(battleId, state);
        stopRoundTimer(battleId);
        return;
      }

      console.log(`Round executed successfully for battle ${battleId}`);

    } catch (error) {
      console.error(`Unexpected error during auto-execution:`, error);
      state.gameState = 'paused';
      state.automationPaused = true;
      state.pauseReason = error instanceof Error ? error.message : 'Unknown error';
      gameStates.set(battleId, state);
      stopRoundTimer(battleId);
      console.log(`Manual intervention required for battle ${battleId}`);
    }
  }, intervalMs);

  activeTimers.set(battleId, timer);
}

// ============================================
// GET - Return current game state
// ============================================

export const GET = composeMiddleware([
  withRateLimit({ prefix: 'arena-automation', ...RateLimitPresets.apiQueries }),
  async (req, ctx) => {
    const battleId = ctx.params?.battleId;
    if (!battleId) {
      throw ErrorResponses.badRequest('Battle ID is required');
    }

    const gameState = gameStates.get(battleId);
    if (!gameState) {
      return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
    }

    return NextResponse.json(gameState);
  },
], { errorContext: 'API:ArenaAutomation:GET' });

// ============================================
// POST - Control battle automation
// ============================================

export const POST = composeMiddleware([
  withRateLimit({ prefix: 'arena-automation-write', ...RateLimitPresets.flowExecution }),
  async (req, ctx) => {
    const battleId = ctx.params?.battleId;
    if (!battleId) {
      throw ErrorResponses.badRequest('Battle ID is required');
    }

    const { action, warriors1Id, warriors2Id } = await req.json();

    switch (action) {
      case 'initialize': {
        console.log(`Initializing automated battle ${battleId}`);

        const newGameState = {
          battleId,
          gameState: 'playing',
          timeRemaining: 70,
          totalTime: 70,
          lastUpdate: Date.now(),
          currentRound: 1,
          totalRounds: 5,
          isSimulation: !battleId.startsWith('0x'),
          gameStarted: false,
          warriors1Id,
          warriors2Id,
          automationEnabled: true,
          transactionVerificationEnabled: true
        };
        gameStates.set(battleId, newGameState);

        startRoundTimer(battleId);

        console.log(`Battle ${battleId} initialized with auto-execution`);

        return NextResponse.json({
          ...newGameState,
          message: 'Battle initialized with automatic round execution',
          arenaAddress: battleId,
          contractAddress: battleId
        });
      }

      case 'cleanup': {
        stopRoundTimer(battleId);
        gameStates.delete(battleId);
        lastTransactionHashes.delete(battleId);
        console.log(`Cleaned up automation for battle ${battleId}`);

        return NextResponse.json({ message: 'Battle automation cleaned up' });
      }

      case 'pause': {
        const pauseState = gameStates.get(battleId);
        if (!pauseState) {
          return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
        }

        stopRoundTimer(battleId);
        pauseState.gameState = 'paused';
        pauseState.automationPaused = true;
        pauseState.pauseReason = 'Manually paused';
        gameStates.set(battleId, pauseState);

        console.log(`Paused automation for battle ${battleId}`);

        return NextResponse.json({
          ...pauseState,
          message: 'Battle automation paused'
        });
      }

      case 'resume': {
        const resumeState = gameStates.get(battleId);
        if (!resumeState) {
          return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
        }

        if (resumeState.gameState !== 'paused') {
          return NextResponse.json({ error: 'Battle is not paused' }, { status: 400 });
        }

        resumeState.gameState = 'playing';
        resumeState.automationPaused = false;
        resumeState.pauseReason = null;
        resumeState.timeRemaining = 40;
        resumeState.totalTime = 40;
        resumeState.lastUpdate = Date.now();
        gameStates.set(battleId, resumeState);

        startRoundTimer(battleId);

        console.log(`Resumed automation for battle ${battleId}`);

        return NextResponse.json({
          ...resumeState,
          message: 'Battle automation resumed'
        });
      }

      case 'status': {
        const statusState = gameStates.get(battleId);
        if (!statusState) {
          return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
        }

        const lastTxHash = lastTransactionHashes.get(battleId);
        let lastTxStatus: any = null;

        if (lastTxHash && !statusState.isSimulation) {
          try {
            const { publicClient } = initializeClients();
            if (publicClient) {
              const receipt = await publicClient.getTransactionReceipt({
                hash: lastTxHash as `0x${string}`
              });
              lastTxStatus = {
                hash: lastTxHash,
                status: receipt.status,
                blockNumber: receipt.blockNumber
              };
            }
          } catch (error) {
            lastTxStatus = {
              hash: lastTxHash,
              status: 'unknown',
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        }

        return NextResponse.json({
          gameState: statusState,
          hasActiveTimer: activeTimers.has(battleId),
          lastTransaction: lastTxStatus,
          arenaAddress: battleId,
          contractAddress: battleId
        });
      }

      default:
        throw ErrorResponses.badRequest('Invalid action. Supported actions: initialize, pause, resume, cleanup, status');
    }
  },
], { errorContext: 'API:ArenaAutomation:POST' });
