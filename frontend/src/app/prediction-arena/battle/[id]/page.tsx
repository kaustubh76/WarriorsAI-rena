'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { LiveBattleView } from '../../../../components/arena/LiveBattleView';
import { useBattleExecution, useBattleBetting } from '../../../../hooks/arena';
import { PredictionBattle } from '../../../../types/predictionArena';

export default function BattleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { address } = useAccount();
  const battleId = params?.id as string;

  const [battle, setBattle] = useState<PredictionBattle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { executeRound, executeFullBattle, isExecuting } = useBattleExecution();
  const { pool, userBet, claimWinnings, isClaiming } = useBattleBetting(battleId);

  // Fetch battle data
  useEffect(() => {
    async function fetchBattle() {
      try {
        setLoading(true);
        const res = await fetch(`/api/arena/battles/${battleId}`);
        if (!res.ok) {
          if (res.status === 404) {
            setError('Battle not found');
            return;
          }
          throw new Error('Failed to fetch battle');
        }

        const data = await res.json();
        setBattle(data.battle);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchBattle();
  }, [battleId]);

  // Auto-refresh for active battles
  useEffect(() => {
    if (!battle || battle.status !== 'active') return;

    const interval = setInterval(async () => {
      const res = await fetch(`/api/arena/battles/${battleId}`);
      if (res.ok) {
        const data = await res.json();
        setBattle(data.battle);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [battle, battleId]);

  const handleExecuteRound = async () => {
    if (!battle) return;

    // Default traits - in production would fetch from chain
    const defaultTraits = {
      strength: 5000 + Math.floor(Math.random() * 3000),
      wit: 5000 + Math.floor(Math.random() * 3000),
      charisma: 5000 + Math.floor(Math.random() * 3000),
      defence: 5000 + Math.floor(Math.random() * 3000),
      luck: 5000 + Math.floor(Math.random() * 3000),
    };

    const result = await executeRound(battle.id, defaultTraits, defaultTraits);
    if (result) {
      setBattle(result.battle);
    }
  };

  const handleExecuteFullBattle = async () => {
    if (!battle) return;

    const defaultTraits = {
      strength: 5000 + Math.floor(Math.random() * 3000),
      wit: 5000 + Math.floor(Math.random() * 3000),
      charisma: 5000 + Math.floor(Math.random() * 3000),
      defence: 5000 + Math.floor(Math.random() * 3000),
      luck: 5000 + Math.floor(Math.random() * 3000),
    };

    const result = await executeFullBattle(battle.id, defaultTraits, defaultTraits);
    if (result) {
      setBattle(result.battle);
    }
  };

  const handleClaimWinnings = async () => {
    const result = await claimWinnings();
    if (result) {
      alert(result.won
        ? `Congratulations! You won ${result.payout} wei`
        : 'Claimed!'
      );
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-400">Loading battle...</p>
        </div>
      </div>
    );
  }

  if (error || !battle) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{error || 'Battle not found'}</p>
          <Link
            href="/prediction-arena"
            className="px-6 py-3 bg-purple-600 rounded-xl text-white font-medium hover:bg-purple-500 transition-all"
          >
            Back to Arena
          </Link>
        </div>
      </div>
    );
  }

  const isParticipant = address && (
    battle.warrior1Owner.toLowerCase() === address.toLowerCase() ||
    battle.warrior2Owner.toLowerCase() === address.toLowerCase()
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Navigation */}
        <div className="mb-6">
          <Link
            href="/prediction-arena"
            className="text-gray-400 hover:text-white transition-colors"
          >
            &larr; Back to Arena
          </Link>
        </div>

        {/* Main Battle View */}
        <LiveBattleView
          battle={battle}
          onExecuteRound={handleExecuteRound}
          isExecuting={isExecuting}
        />

        {/* Action Buttons */}
        <div className="mt-6 flex flex-wrap gap-4 justify-center">
          {battle.status === 'active' && (
            <>
              <button
                onClick={handleExecuteRound}
                disabled={isExecuting || battle.currentRound > 5}
                className="px-6 py-3 bg-purple-600 rounded-xl text-white font-bold hover:bg-purple-500 disabled:opacity-50 transition-all"
              >
                {isExecuting ? 'Executing...' : `Execute Round ${battle.currentRound}`}
              </button>
              <button
                onClick={handleExecuteFullBattle}
                disabled={isExecuting || battle.currentRound > 5}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-bold hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all"
              >
                {isExecuting ? 'Executing...' : 'Execute All Rounds'}
              </button>
            </>
          )}

          {battle.status === 'completed' && userBet && !userBet.claimed && (
            <button
              onClick={handleClaimWinnings}
              disabled={isClaiming}
              className="px-6 py-3 bg-green-600 rounded-xl text-white font-bold hover:bg-green-500 disabled:opacity-50 transition-all"
            >
              {isClaiming ? 'Claiming...' : 'Claim Winnings'}
            </button>
          )}
        </div>

        {/* Battle Info Cards */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Participants */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Participants</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-green-400 font-medium">YES Side</p>
                  <p className="text-white">Warrior #{battle.warrior1Id}</p>
                  <p className="text-gray-500 text-sm">
                    {battle.warrior1Owner.slice(0, 6)}...{battle.warrior1Owner.slice(-4)}
                  </p>
                </div>
                {isParticipant && battle.warrior1Owner.toLowerCase() === address?.toLowerCase() && (
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                    You
                  </span>
                )}
              </div>
              <div className="border-t border-gray-700 pt-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-red-400 font-medium">NO Side</p>
                    <p className="text-white">Warrior #{battle.warrior2Id}</p>
                    <p className="text-gray-500 text-sm">
                      {battle.warrior2Owner.slice(0, 6)}...{battle.warrior2Owner.slice(-4)}
                    </p>
                  </div>
                  {isParticipant && battle.warrior2Owner.toLowerCase() === address?.toLowerCase() && (
                    <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full">
                      You
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Betting Pool */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Betting Pool</h3>
            {pool ? (
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Pool</span>
                  <span className="text-white font-medium">
                    {(BigInt(pool.totalPool || '0') / BigInt(10 ** 18)).toString()} CRwN
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">YES Bets</span>
                  <span className="text-green-400">
                    {(BigInt(pool.totalWarrior1Bets || '0') / BigInt(10 ** 18)).toString()} CRwN
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">NO Bets</span>
                  <span className="text-red-400">
                    {(BigInt(pool.totalWarrior2Bets || '0') / BigInt(10 ** 18)).toString()} CRwN
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Total Bettors</span>
                  <span className="text-white">{pool.totalBettors}</span>
                </div>
                {userBet && (
                  <div className="pt-3 border-t border-gray-700">
                    <p className="text-purple-400 font-medium">Your Bet</p>
                    <p className="text-white">
                      {(BigInt(userBet.amount) / BigInt(10 ** 18)).toString()} CRwN on {userBet.betOnWarrior1 ? 'YES' : 'NO'}
                    </p>
                    {userBet.claimed && (
                      <p className="text-green-400 text-sm mt-1">Claimed</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-400">No bets placed yet</p>
            )}
          </div>

          {/* Battle Details */}
          <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-6">
            <h3 className="text-lg font-bold text-white mb-4">Battle Details</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-400">Status</span>
                <span className={`font-medium ${
                  battle.status === 'active' ? 'text-green-400' :
                  battle.status === 'completed' ? 'text-blue-400' :
                  'text-yellow-400'
                }`}>
                  {battle.status.toUpperCase()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Source</span>
                <span className="text-white">{battle.source.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Current Round</span>
                <span className="text-white">{Math.min(battle.currentRound, 5)}/5</span>
              </div>
              {battle.battleDataHash && (
                <div className="pt-3 border-t border-gray-700">
                  <p className="text-gray-400 text-sm">Stored on 0G</p>
                  <p className="text-purple-400 text-xs font-mono truncate">
                    {battle.battleDataHash}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
