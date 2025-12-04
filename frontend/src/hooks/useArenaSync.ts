// Frontend service to sync with command-based arena automation
import { useState, useEffect, useCallback } from 'react';

// Arena Backend URL - configured via environment variable
const ARENA_BACKEND_URL = process.env.NEXT_PUBLIC_ARENA_BACKEND_URL || 'http://localhost:3002';

interface ArenaGameState {
  battleId: string | null;
  gameState: 'idle' | 'playing' | 'finished';
  phase: 'startGame' | 'battle';
  timeRemaining: number;
  totalTime: number;
  lastUpdate: number;
  warriors1Id: number | null;
  warriors2Id: number | null;
  currentRound: number;
  totalRounds: number;
  automationEnabled: boolean;
  type: string;
}

export const useArenaSync = (battleId: string | null) => {
  const [gameState, setGameState] = useState<ArenaGameState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch current game state from status endpoint (NEVER consumes commands)
  const fetchGameState = useCallback(async () => {
    if (!battleId) return;

    try {
      const response = await fetch(`${ARENA_BACKEND_URL}/api/arena/status?battleId=${battleId}`);
      if (response.ok) {
        const data = await response.json();
        // Handle both existing gameState and null gameState gracefully
        if (data.gameState) {
          setGameState(data.gameState);
          setError(null);
        } else {
          // No active automation - this is normal, not an error
          setGameState(null);
          setError(null);
        }
      } else {
        // Only set error for actual server errors, not missing data
        console.warn(`Status API returned ${response.status} for battle ${battleId}`);
        setError(null); // Don't treat this as an error
        setGameState(null);
      }
    } catch (err) {
      // Only log actual network/parsing errors
      console.warn('Arena sync warning (non-critical):', err);
      setError(null); // Don't treat connectivity issues as blocking errors
      setGameState(null);
    }
  }, [battleId]);

  // Initialize battle on command-based backend
  const initializeBattle = useCallback(async (warriors1Id: number, warriors2Id: number) => {
    if (!battleId) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${ARENA_BACKEND_URL}/api/arena/commands?battleId=${battleId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'initialize',
          warriors1Id,
          warriors2Id,
        }),
      });

      if (!response.ok) {
        // Get the detailed error from the backend
        const errorData = await response.json().catch(() => ({}));
        
        // Enhanced error message with suggestions
        let errorMessage = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
        
        console.error('Backend initialization error:', errorData);
        throw new Error(errorMessage);
      }

      // Fetch updated state
      await fetchGameState();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to initialize command-based automation';
      setError(errorMessage);
      console.error('Battle initialization error:', err);
      throw err; // Re-throw so the calling function can handle it
    } finally {
      setIsLoading(false);
    }
  }, [battleId, fetchGameState]);

  // Manual start game (not needed in command-based system, but kept for compatibility)
  const manualStartGame = useCallback(async () => {
    if (!battleId) return;

    console.log('Manual start game not needed - command-based system handles timing automatically');
    // In command-based system, the frontend polling handles this automatically
    return;
  }, [battleId]);

  // Manual next round (not needed in command-based system, but kept for compatibility)
  const manualNextRound = useCallback(async () => {
    if (!battleId) return;

    console.log('Manual next round not needed - command-based system handles timing automatically');
    // In command-based system, the frontend polling handles this automatically
    return;
  }, [battleId]);

  // Cleanup battle from command-based system
  const cleanupBattle = useCallback(async () => {
    if (!battleId) return;

    try {
      await fetch(`${ARENA_BACKEND_URL}/api/arena/commands?battleId=${battleId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'cleanup',
        }),
      });
    } catch (err) {
      console.warn('Cleanup warning (non-critical):', err);
    }
  }, [battleId]);

  // Sync with backend - polls status endpoint for timer updates
  useEffect(() => {
    if (!battleId) return;

    // Poll status endpoint for timer synchronization
    // Using 1.5s interval - balances server load with smooth client-side countdown
    // The GameTimer component handles smooth 1-second countdown locally
    const interval = setInterval(() => {
      fetchGameState().catch(err => {
        // Silent fail - client-side countdown continues independently
      });
    }, 1500);

    // Initial fetch immediately
    fetchGameState().catch(err => {
      console.warn('Initial status fetch warning (non-critical):', err);
    });

    return () => clearInterval(interval);
  }, [battleId, fetchGameState]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (gameState?.gameState === 'finished') {
        cleanupBattle().catch(err => {
          console.warn('Cleanup on unmount warning (non-critical):', err);
        });
      }
    };
  }, [gameState?.gameState, cleanupBattle]);

  return {
    gameState,
    isLoading,
    error,
    initializeBattle,
    manualStartGame,
    manualNextRound,
    cleanupBattle,
  };
};
