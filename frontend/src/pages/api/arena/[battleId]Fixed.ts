// API endpoints for arena automation
import { NextApiRequest, NextApiResponse } from 'next';
import { createWalletClient, http, createPublicClient, keccak256, encodePacked } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';
import { ArenaAbi, chainsToContracts, getFlowRpcUrl, getFlowFallbackRpcUrl } from '../../../constants';

// RPC timeout configuration
const RPC_TIMEOUT = 60000;

// Define Flow EVM chains
const flowTestnet = defineChain({
  id: 545,
  name: 'Flow Testnet',
  network: 'flow-testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'Flow',
    symbol: 'FLOW',
  },
  rpcUrls: {
    default: {
      http: [process.env.FLOW_TESTNET_RPC || 'https://testnet.evm.nodes.onflow.org'],
    },
    public: {
      http: [process.env.FLOW_TESTNET_RPC || 'https://testnet.evm.nodes.onflow.org'],
    },
  },
  blockExplorers: {
    default: { name: 'Flow Testnet Explorer', url: 'https://evm-testnet.flowscan.org' },
  },
});

// Create a simplified in-memory game state for development
const gameStates = new Map<string, any>();
const activeTimers = new Map<string, NodeJS.Timeout>();
const lastTransactionHashes = new Map<string, string>();

// Initialize viem clients for blockchain interaction
let walletClient: any = null;
let publicClient: any = null;
let fallbackClient: any = null;

// Helper to check if error is timeout
function isTimeoutError(error: unknown): boolean {
  const errMsg = (error as Error).message || '';
  return errMsg.includes('timeout') ||
         errMsg.includes('timed out') ||
         errMsg.includes('took too long') ||
         errMsg.includes('TimeoutError');
}

// Initialize blockchain clients
function initializeClients() {
  if (walletClient && publicClient && fallbackClient) return { walletClient, publicClient, fallbackClient };

  try {
    // Use Flow testnet
    const chain = flowTestnet;
    const rpcUrl = getFlowRpcUrl();
    const fallbackRpcUrl = getFlowFallbackRpcUrl();

    publicClient = createPublicClient({
      chain,
      transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 2, retryDelay: 1000 })
    });

    fallbackClient = createPublicClient({
      chain,
      transport: http(fallbackRpcUrl, { timeout: RPC_TIMEOUT, retryCount: 2, retryDelay: 1000 })
    });

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

    walletClient = createWalletClient({
      account: gameMasterAccount,
      chain,
      transport: http(rpcUrl, { timeout: RPC_TIMEOUT, retryCount: 2, retryDelay: 1000 })
    });

    console.log('✅ Blockchain clients initialized successfully for Flow');
    return { walletClient, publicClient, fallbackClient };
  } catch (error) {
    console.error('❌ Failed to initialize blockchain clients:', error);
    return { walletClient: null, publicClient: null, fallbackClient: null };
  }
}

// Execute startGame on the contract
async function executeStartGame(battleId: string) {
  console.log(`🎮 Executing startGame() on contract ${battleId}`);
  
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
        console.error(`❌ No contract found at address ${contractAddress} for startGame()`);
        return { success: false, error: 'No contract at address for startGame()' };
      }
      
      console.log(`✅ Contract verified for startGame() at ${contractAddress}, bytecode length: ${code.length}`);
    } catch (codeError) {
      console.warn(`⚠️ Could not verify contract code before startGame(): ${codeError}`);
      // Continue anyway as this might just be a network issue
    }
    
    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'startGame',
      args: []
    });
    
    console.log(`✅ Start game transaction sent: ${hash}`);
    console.log(`⏳ Waiting for transaction confirmation...`);

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

    // Store the transaction hash for verification
    lastTransactionHashes.set(battleId, hash as string);
    
    console.log(`✅ Start game confirmed in block ${receipt.blockNumber}`);
    
    return { success: true, hash, receipt };
  } catch (error) {
    console.error(`❌ Failed to start game for battle ${battleId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Execute battle on the contract
async function executeBattle(battleId: string, move1: number, move2: number) {
  console.log(`⚔️ Executing battle() on contract ${battleId} with moves: ${move1} vs ${move2}`);
  
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

    console.log(`✍️ Generated signature for moves ${move1}, ${move2}`);

    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'battle',
      args: [move1, move2, signature]
    });

    console.log(`✅ Battle transaction sent: ${hash}`);
    console.log(`⏳ Waiting for transaction confirmation...`);

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

    // Store the transaction hash for verification
    lastTransactionHashes.set(battleId, hash as string);
    
    console.log(`✅ Battle confirmed in block ${receipt.blockNumber}`);
    
    return { success: true, hash, receipt };
  } catch (error) {
    console.error(`❌ Failed to execute battle for ${battleId}:`, error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Auto execute next round with correct contract checking
async function autoExecuteNextRound(battleId: string) {
  console.log(`🤖 AUTO-EXECUTING: Next round for battle ${battleId}`);
  
  const state = gameStates.get(battleId);
  if (!state) {
    console.error('❌ Game state not found');
    return { success: false, error: 'Game state not found' };
  }

  const { walletClient, publicClient } = initializeClients();
  if (!walletClient || !publicClient) {
    console.log('⚠️ No wallet client - simulating round');
    return { success: false, error: 'No wallet client available' };
  }

  try {
    // FIRST: Check the current round on the contract
    const contractAddress = battleId;
    const currentRound = await publicClient.readContract({
      address: contractAddress as `0x${string}`,
      abi: ArenaAbi,
      functionName: 'getCurrentRound'
    });

    console.log(`📊 Contract current round: ${currentRound}`);

    // If round is 0, we need to call startGame() first
    if (currentRound === 0) {
      console.log(`🎮 Contract round is 0 - calling startGame() first`);
      const startResult = await executeStartGame(battleId);
      
      if (!startResult.success) {
        console.error(`❌ Failed to start game: ${startResult.error}`);
        return startResult;
      }
      
      console.log(`✅ Game started successfully, will execute first battle in next timer cycle`);
      
      // Update local state
      state.gameStarted = true;
      state.lastTransactionHash = startResult.hash;
      state.timeRemaining = 40; // Next battle in 40 seconds
      state.totalTime = 40;
      state.lastUpdate = Date.now();
      gameStates.set(battleId, state);
      
      return { success: true, hash: startResult.hash, gameStarted: true };
    }

    // If round >= 6, game is finished
    if (currentRound >= 6) {
      console.log(`🏁 Game finished (round ${currentRound}), stopping automation`);
      state.gameState = 'finished';
      gameStates.set(battleId, state);
      return { success: true, gameFinished: true };
    }

    console.log(`⚔️ Proceeding with battle for round ${currentRound}`);
    
    // Generate AI moves
    const move1 = Math.floor(Math.random() * 5);
    const move2 = Math.floor(Math.random() * 5);
    
    console.log(`🎯 AI selected moves: ${move1} vs ${move2}`);
    
    // Execute battle
    const battleResult = await executeBattle(battleId, move1, move2);
    
    if (!battleResult.success) {
      console.error(`❌ Battle failed: ${battleResult.error}`);
      return battleResult;
    }
    
    console.log(`✅ Battle round ${currentRound} completed successfully`);
    
    // Update local state
    state.currentRound = currentRound + 1;
    state.lastTransactionHash = battleResult.hash;
    state.timeRemaining = 40; // Next round in 40 seconds
    state.totalTime = 40;
    state.lastUpdate = Date.now();
    gameStates.set(battleId, state);
    
    return { success: true, hash: battleResult.hash, round: currentRound };
    
  } catch (readError) {
    console.error(`❌ Failed to read contract round: ${readError}`);
    return { success: false, error: 'Failed to read contract state' };
  }
}

// Verify the last transaction was successful
async function verifyLastTransaction(battleId: string): Promise<boolean> {
  const lastTxHash = lastTransactionHashes.get(battleId);
  if (!lastTxHash) {
    console.log(`⚠️ No previous transaction to verify for battle ${battleId}`);
    return true; // No previous transaction, consider it successful
  }

  const state = gameStates.get(battleId);
  if (state?.isSimulation) {
    console.log(`✅ Simulation mode - assuming last transaction successful for battle ${battleId}`);
    return true;
  }

  const { publicClient } = initializeClients();
  if (!publicClient) {
    console.log('⚠️ No public client - assuming transaction successful');
    return true;
  }

  try {
    console.log(`🔍 Verifying transaction ${lastTxHash} for battle ${battleId}`);
    
    const receipt = await publicClient.getTransactionReceipt({
      hash: lastTxHash as `0x${string}`
    });

    const isSuccessful = receipt.status === 'success';
    console.log(`${isSuccessful ? '✅' : '❌'} Transaction ${lastTxHash} status: ${receipt.status}`);
    
    return isSuccessful;
  } catch (error) {
    console.error(`❌ Failed to verify transaction ${lastTxHash}:`, error);
    return false;
  }
}

// Stop automatic round execution timer
function stopRoundTimer(battleId: string) {
  const timer = activeTimers.get(battleId);
  if (timer) {
    console.log(`⏹️ Stopping auto round timer for battle ${battleId}`);
    clearInterval(timer);
    activeTimers.delete(battleId);
  }
}

// Start automatic round execution timer
function startRoundTimer(battleId: string, intervalMs: number = 1000) {
  // Clear any existing timer
  stopRoundTimer(battleId);
  
  console.log(`⏰ Starting auto round timer for battle ${battleId} (${intervalMs}ms interval)`);
  
  const timer = setInterval(async () => {
    const state = gameStates.get(battleId);
    if (!state) {
      console.log(`⚠️ Battle ${battleId} not found, stopping timer`);
      stopRoundTimer(battleId);
      return;
    }

    if (state.gameState === 'finished' || state.gameState === 'paused') {
      console.log(`🏁 Battle ${battleId} is ${state.gameState}, stopping timer`);
      stopRoundTimer(battleId);
      return;
    }
    
    // Update countdown
    state.timeRemaining = Math.max(0, state.timeRemaining - 1);
    state.lastUpdate = Date.now();
    
    // If time remaining is not 0, continue waiting
    if (state.timeRemaining > 0) {
      gameStates.set(battleId, state);
      return;
    }

    // Timer reached 0, time to execute the next action
    console.log(`⏰ Time expired! Auto-executing round ${state.currentRound}...`);
    
    try {
      const result = await autoExecuteNextRound(battleId);
      
      if (!result.success) {
        console.error(`❌ Auto-execution failed: ${result.error}`);
        state.gameState = 'paused';
        state.automationPaused = true;
        state.pauseReason = result.error;
        gameStates.set(battleId, state);
        stopRoundTimer(battleId);
        console.log(`⚠️ Manual intervention required for battle ${battleId}`);
        return;
      }
      
      if (result.gameFinished) {
        console.log(`🏁 Game completed for battle ${battleId}`);
        state.gameState = 'finished';
        gameStates.set(battleId, state);
        stopRoundTimer(battleId);
        return;
      }
      
      // Success - continue with the timer for next round
      console.log(`✅ Round executed successfully for battle ${battleId}`);
      
    } catch (error) {
      console.error(`❌ Unexpected error during auto-execution:`, error);
      state.gameState = 'paused';
      state.automationPaused = true;
      state.pauseReason = error instanceof Error ? error.message : 'Unknown error';
      gameStates.set(battleId, state);
      stopRoundTimer(battleId);
      console.log(`⚠️ Manual intervention required for battle ${battleId}`);
    }
  }, intervalMs);
  
  activeTimers.set(battleId, timer);
}

// Main API handler
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { battleId } = req.query;
  if (!battleId || typeof battleId !== 'string') {
    return res.status(400).json({ error: 'Battle ID is required' });
  }
  
  try {
    switch (req.method) {
      case 'GET':
        // Return current game state
        const gameState = gameStates.get(battleId);
        if (!gameState) {
          return res.status(404).json({ error: 'Battle not found' });
        }
        return res.status(200).json(gameState);
        
      case 'POST':
        const { action, warriors1Id, warriors2Id } = req.body;
        switch (action) {
          case 'initialize':
            console.log(`🎮 Initializing automated battle ${battleId}`);
            
            const newGameState = {
              battleId,
              gameState: 'playing',
              timeRemaining: 70, // 70 seconds for initial round
              totalTime: 70,
              lastUpdate: Date.now(),
              currentRound: 1,
              totalRounds: 5,
              isSimulation: !battleId.startsWith('0x'),
              gameStarted: false, // Track if contract's startGame() has been called
              warriors1Id,
              warriors2Id,
              automationEnabled: true,
              transactionVerificationEnabled: true
            };
            gameStates.set(battleId, newGameState);
            
            // Start automatic round timer
            startRoundTimer(battleId);
            
            console.log(`✅ Battle ${battleId} initialized with auto-execution`);
            
            return res.status(200).json({
              ...newGameState,
              message: 'Battle initialized with automatic round execution',
              arenaAddress: battleId,
              contractAddress: battleId
            });
            
          case 'cleanup':
            // Stop automation and clean up
            stopRoundTimer(battleId);
            gameStates.delete(battleId);
            lastTransactionHashes.delete(battleId);
            console.log(`🧹 Cleaned up automation for battle ${battleId}`);
            
            return res.status(200).json({ message: 'Battle automation cleaned up' });
            
          case 'pause':
            // Pause automation
            const pauseState = gameStates.get(battleId);
            if (!pauseState) {
              return res.status(404).json({ error: 'Battle not found' });
            }
            
            stopRoundTimer(battleId);
            pauseState.gameState = 'paused';
            pauseState.automationPaused = true;
            pauseState.pauseReason = 'Manually paused';
            gameStates.set(battleId, pauseState);
            
            console.log(`⏸️ Paused automation for battle ${battleId}`);
            
            return res.status(200).json({
              ...pauseState,
              message: 'Battle automation paused'
            });
            
          case 'resume':
            // Resume paused battle
            const resumeState = gameStates.get(battleId);
            if (!resumeState) {
              return res.status(404).json({ error: 'Battle not found' });
            }
            
            if (resumeState.gameState !== 'paused') {
              return res.status(400).json({ error: 'Battle is not paused' });
            }
            
            resumeState.gameState = 'playing';
            resumeState.automationPaused = false;
            resumeState.pauseReason = null;
            resumeState.timeRemaining = 40; // Resume with 40 seconds
            resumeState.totalTime = 40;
            resumeState.lastUpdate = Date.now();
            gameStates.set(battleId, resumeState);
            
            startRoundTimer(battleId);
            
            console.log(`▶️ Resumed automation for battle ${battleId}`);
            
            return res.status(200).json({
              ...resumeState,
              message: 'Battle automation resumed'
            });
            
          case 'status':
            // Get detailed status
            const statusState = gameStates.get(battleId);
            if (!statusState) {
              return res.status(404).json({ error: 'Battle not found' });
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
            
            return res.status(200).json({
              gameState: statusState,
              hasActiveTimer: activeTimers.has(battleId),
              lastTransaction: lastTxStatus,
              arenaAddress: battleId,
              contractAddress: battleId
            });
            
          default:
            return res.status(400).json({ error: 'Invalid action. Supported actions: initialize, pause, resume, cleanup, status' });
        }
        
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).end(`Method ${req.method} Not Allowed`);
    }
  } catch (error) {
    console.error('❌ Arena API error for battleId:', battleId, error);
    console.error('❌ Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : 'No stack trace',
      name: error instanceof Error ? error.name : 'Unknown error type'
    });
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error',
      battleId: battleId
    });
  }
}
