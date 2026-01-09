// Backend service for synchronized arena automation
import { ethers } from 'ethers';
import { ArenaAbi, getFlowRpcUrl } from '../constants';

interface ArenaGameState {
  battleId: number | null;
  gameState: 'idle' | 'betting' | 'playing' | 'finished';
  timeRemaining: number;
  totalTime: number;
  lastUpdate: number;
  warriors1Id: number | null;
  warriors2Id: number | null;
  currentRound: number;
  totalRounds: number;
}

class ArenaBackendService {
  private gameStates: Map<string, ArenaGameState> = new Map();
  private intervals: Map<string, NodeJS.Timeout> = new Map();
  private provider: ethers.providers.JsonRpcProvider;
  private gameMasterWallet: ethers.Wallet;
  private arenaContract: ethers.Contract;

  constructor() {
    // Initialize provider and game master wallet
    this.provider = new ethers.providers.JsonRpcProvider(
      process.env.NEXT_PUBLIC_RPC_URL || getFlowRpcUrl()
    );
    
    // Server-side only - NEVER use NEXT_PUBLIC_ prefix for private keys
    const gameMasterPrivateKey = process.env.GAME_MASTER_PRIVATE_KEY;
    if (!gameMasterPrivateKey) {
      throw new Error('GAME_MASTER_PRIVATE_KEY not found. This service should only be used in server-side code.');
    }
    
    this.gameMasterWallet = new ethers.Wallet(gameMasterPrivateKey, this.provider);
    
    // Initialize contract (address will need to be provided)
    const contractAddress = process.env.NEXT_PUBLIC_ARENA_CONTRACT_ADDRESS;
    if (!contractAddress) {
      throw new Error('Kurukshetra contract address not found');
    }
    
    this.arenaContract = new ethers.Contract(
      contractAddress,
      ArenaAbi,
      this.gameMasterWallet
    );
  }

  // Initialize a new battle and start automation
  async initializeBattle(battleId: number, warriors1Id: number, warriors2Id: number): Promise<void> {
    const gameState: ArenaGameState = {
      battleId,
      gameState: 'betting',
      timeRemaining: 70, // 70 seconds betting period
      totalTime: 70,
      lastUpdate: Date.now(),
      warriors1Id,
      warriors2Id,
      currentRound: 0,
      totalRounds: 0
    };

    this.gameStates.set(battleId.toString(), gameState);
    this.startBettingTimer(battleId.toString());
  }

  // Get current game state for a battle
  getGameState(battleId: string): ArenaGameState | null {
    const state = this.gameStates.get(battleId);
    if (!state) return null;

    // Sync time remaining based on last update
    const now = Date.now();
    const timePassed = Math.floor((now - state.lastUpdate) / 1000);
    const updatedTimeRemaining = Math.max(0, state.timeRemaining - timePassed);

    return {
      ...state,
      timeRemaining: updatedTimeRemaining,
      lastUpdate: now
    };
  }

  // Start betting period countdown
  private startBettingTimer(battleId: string): void {
    const interval = setInterval(async () => {
      const state = this.gameStates.get(battleId);
      if (!state) {
        clearInterval(interval);
        return;
      }

      state.timeRemaining -= 1;
      state.lastUpdate = Date.now();

      if (state.timeRemaining <= 0) {
        clearInterval(interval);
        await this.startGame(battleId);
      }
    }, 1000);

    this.intervals.set(`betting-${battleId}`, interval);
  }

  // Automatically start the game
  private async startGame(battleId: string): Promise<void> {
    try {
      const state = this.gameStates.get(battleId);
      if (!state || !state.battleId) return;

      console.log(`Auto-starting game for battle ${battleId}`);
      
      // Call the smart contract to start the game
      const tx = await this.arenaContract.startGame(state.battleId);
      await tx.wait();

      // Update game state
      state.gameState = 'playing';
      state.timeRemaining = 40; // 40 seconds per round
      state.totalTime = 40;
      state.currentRound = 1;
      state.lastUpdate = Date.now();

      // Start the round timer
      this.startRoundTimer(battleId);

    } catch (error) {
      console.error(`Failed to auto-start game for battle ${battleId}:`, error);
    }
  }

  // Start round timer for automatic next round calls
  private startRoundTimer(battleId: string): void {
    const interval = setInterval(async () => {
      const state = this.gameStates.get(battleId);
      if (!state) {
        clearInterval(interval);
        return;
      }

      state.timeRemaining -= 1;
      state.lastUpdate = Date.now();

      if (state.timeRemaining <= 0) {
        await this.nextRound(battleId);
        
        // Reset timer for next round
        state.timeRemaining = 40;
        state.totalTime = 40;
        state.currentRound += 1;
        state.lastUpdate = Date.now();

        // Check if game should end (you might need to implement game end logic)
        const gameStatus = await this.checkGameStatus(battleId);
        if (gameStatus === 'finished') {
          clearInterval(interval);
          state.gameState = 'finished';
        }
      }
    }, 1000);

    this.intervals.set(`round-${battleId}`, interval);
  }

  // Automatically call next round
  private async nextRound(battleId: string): Promise<void> {
    try {
      const state = this.gameStates.get(battleId);
      if (!state || !state.battleId) return;

      console.log(`Auto-calling next round for battle ${battleId}`);
      
      // Call the smart contract for next round
      const tx = await this.arenaContract.nextRound(state.battleId);
      await tx.wait();

    } catch (error) {
      console.error(`Failed to auto-call next round for battle ${battleId}:`, error);
    }
  }

  // Check if game has finished
  private async checkGameStatus(battleId: string): Promise<string> {
    try {
      const state = this.gameStates.get(battleId);
      if (!state || !state.battleId) return 'finished';

      // Call contract to check if game is finished
      const battleInfo = await this.arenaContract.getBattleInfo(state.battleId);
      
      // Assuming the contract has a status field or similar
      if (battleInfo.isFinished || battleInfo.winner !== 0) {
        return 'finished';
      }
      
      return 'playing';
    } catch (error) {
      console.error(`Failed to check game status for battle ${battleId}:`, error);
      return 'playing'; // Continue playing if we can't determine status
    }
  }

  // Manual override - start game immediately
  async manualStartGame(battleId: string): Promise<void> {
    const state = this.gameStates.get(battleId);
    if (!state) return;

    // Clear betting timer
    const bettingInterval = this.intervals.get(`betting-${battleId}`);
    if (bettingInterval) {
      clearInterval(bettingInterval);
      this.intervals.delete(`betting-${battleId}`);
    }

    await this.startGame(battleId);
  }

  // Manual override - call next round immediately
  async manualNextRound(battleId: string): Promise<void> {
    await this.nextRound(battleId);
  }

  // Clean up when battle ends
  cleanupBattle(battleId: string): void {
    // Clear all intervals
    const bettingInterval = this.intervals.get(`betting-${battleId}`);
    const roundInterval = this.intervals.get(`round-${battleId}`);
    
    if (bettingInterval) clearInterval(bettingInterval);
    if (roundInterval) clearInterval(roundInterval);
    
    this.intervals.delete(`betting-${battleId}`);
    this.intervals.delete(`round-${battleId}`);
    this.gameStates.delete(battleId);
  }

  // Get all active battles
  getAllActiveStates(): Map<string, ArenaGameState> {
    return this.gameStates;
  }
}

// Singleton instance
export const arenaBackendService = new ArenaBackendService();
