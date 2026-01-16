'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';
import Link from 'next/link';
import { ArenaLeaderboard, CreateChallengeModal, AcceptChallengeModal } from '../../components/arena';

interface Battle {
  id: string;
  externalMarketId: string;
  source: string;
  question: string;
  warrior1Id: number;
  warrior1Owner: string;
  warrior2Id: number;
  warrior2Owner: string;
  stakes: string;
  warrior1Score: number;
  warrior2Score: number;
  status: string;
  currentRound: number;
  createdAt: string;
  rounds: Round[];
}

interface Round {
  roundNumber: number;
  w1Move: string;
  w2Move: string;
  w1Score: number;
  w2Score: number;
  roundWinner: string;
  w1Argument?: string;
  w2Argument?: string;
}

type TabType = 'active' | 'pending' | 'completed';

export default function PredictionArenaPage() {
  const { address } = useAccount();
  const [battles, setBattles] = useState<Battle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('active');

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [selectedBattle, setSelectedBattle] = useState<Battle | null>(null);

  useEffect(() => {
    fetchBattles();
  }, [activeTab]);

  async function fetchBattles() {
    setLoading(true);
    try {
      const status = activeTab === 'active' ? 'active' : activeTab;
      const res = await fetch(`/api/arena/battles?status=${status}&limit=50`);
      const data = await res.json();
      setBattles(data.battles || []);
    } catch (error) {
      console.error('Error fetching battles:', error);
    } finally {
      setLoading(false);
    }
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50',
      active: 'bg-green-500/20 text-green-400 border-green-500/50',
      completed: 'bg-blue-500/20 text-blue-400 border-blue-500/50',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/50',
    };
    return styles[status] || 'bg-gray-500/20 text-gray-400';
  }

  function getMoveEmoji(move: string) {
    const emojis: Record<string, string> = {
      STRIKE: '⚔️',
      TAUNT: '😤',
      DODGE: '💨',
      SPECIAL: '✨',
      RECOVER: '💚',
    };
    return emojis[move] || '❓';
  }

  function truncateAddress(addr: string) {
    if (!addr) return '???';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 bg-clip-text text-transparent mb-4">
            Prediction Arena
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Warriors debate real market topics from Polymarket & Kalshi.
            Traits influence debate performance. Stakes go to the winner.
          </p>
        </div>

        {/* How It Works */}
        <div className="bg-gray-800/30 rounded-2xl border border-gray-700 p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Step number={1} title="Pick a Market" desc="Choose from Polymarket/Kalshi topics" />
            <Step number={2} title="Challenge" desc="Stake CRwN and pick YES or NO side" />
            <Step number={3} title="Debate" desc="Warriors argue for 5 rounds using their traits" />
            <Step number={4} title="Winner" desc="Higher score wins the stakes!" />
          </div>
        </div>

        {/* Trait Impact */}
        <div className="bg-gray-800/30 rounded-2xl border border-gray-700 p-6 mb-8">
          <h2 className="text-xl font-bold text-white mb-4">Warrior Traits in Debates</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <TraitCard trait="Strength" effect="Argument Quality" emoji="💪" />
            <TraitCard trait="Wit" effect="Rebuttal Power" emoji="🧠" />
            <TraitCard trait="Charisma" effect="Persuasiveness" emoji="✨" />
            <TraitCard trait="Defence" effect="Counter Resistance" emoji="🛡️" />
            <TraitCard trait="Luck" effect="Evidence Quality" emoji="🍀" />
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <StatCard title="Active Debates" value={battles.filter((b: Battle) => b.status === 'active').length.toString()} />
          <StatCard title="Open Challenges" value={battles.filter((b: Battle) => b.status === 'pending').length.toString()} />
          <StatCard title="Completed" value={battles.filter((b: Battle) => b.status === 'completed').length.toString()} />
          <StatCard
            title="Total Stakes"
            value={`${battles.length > 0 ? formatEther(BigInt(battles.reduce((acc: number, b: Battle) => acc + parseInt(b.stakes || '0'), 0))) : '0'} CRwN`}
          />
        </div>

        {/* Create Challenge Button */}
        <div className="flex justify-center mb-8">
          <button
            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-white hover:from-purple-500 hover:to-pink-500 transition-all transform hover:scale-105 shadow-lg shadow-purple-500/25"
            onClick={() => setShowCreateModal(true)}
          >
            ⚔️ Create Prediction Challenge
          </button>
        </div>

        {/* Tabs */}
        <div className="flex justify-center gap-4 mb-8">
          {(['active', 'pending', 'completed'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-2 rounded-lg font-medium transition-all ${
                activeTab === tab
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Battles List - 2 columns on large screens */}
          <div className="lg:col-span-2">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full mx-auto mb-4" />
                <p className="text-gray-400">Loading prediction battles...</p>
              </div>
            ) : battles.length === 0 ? (
              <div className="text-center py-12 bg-gray-800/50 rounded-2xl border border-gray-700">
                <p className="text-gray-400 text-lg mb-4">No {activeTab} prediction battles found</p>
                {activeTab === 'pending' && (
                  <p className="text-gray-500">Create a challenge on a Polymarket or Kalshi topic to get started!</p>
                )}
                {activeTab === 'active' && (
                  <p className="text-gray-500">Accept an open challenge to start debating!</p>
                )}
              </div>
            ) : (
              <div className="grid gap-6">
                {battles.map((battle: Battle) => (
                  <PredictionBattleCard
                    key={battle.id}
                    battle={battle}
                    currentUser={address}
                    getStatusBadge={getStatusBadge}
                    getMoveEmoji={getMoveEmoji}
                    truncateAddress={truncateAddress}
                    onAccept={() => {
                      setSelectedBattle(battle);
                      setShowAcceptModal(true);
                    }}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard Sidebar */}
          <div className="lg:col-span-1">
            <ArenaLeaderboard compact limit={10} />
          </div>
        </div>
      </div>

      {/* Modals */}
      <CreateChallengeModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          fetchBattles();
          setActiveTab('pending');
        }}
      />

      <AcceptChallengeModal
        isOpen={showAcceptModal}
        battle={selectedBattle}
        onClose={() => {
          setShowAcceptModal(false);
          setSelectedBattle(null);
        }}
        onSuccess={() => {
          fetchBattles();
          setActiveTab('active');
        }}
      />
    </div>
  );
}

function Step({ number, title, desc }: { number: number; title: string; desc: string }) {
  return (
    <div className="text-center">
      <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center mx-auto mb-2 text-white font-bold">
        {number}
      </div>
      <p className="text-white font-medium">{title}</p>
      <p className="text-gray-400 text-sm">{desc}</p>
    </div>
  );
}

function TraitCard({ trait, effect, emoji }: { trait: string; effect: string; emoji: string }) {
  return (
    <div className="bg-gray-700/30 rounded-lg p-3">
      <p className="text-2xl mb-1">{emoji}</p>
      <p className="text-white font-medium text-sm">{trait}</p>
      <p className="text-gray-400 text-xs">{effect}</p>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
      <p className="text-gray-400 text-sm mb-1">{title}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function PredictionBattleCard({
  battle,
  currentUser,
  getStatusBadge,
  getMoveEmoji,
  truncateAddress,
  onAccept,
}: {
  battle: Battle;
  currentUser?: string;
  getStatusBadge: (status: string) => string;
  getMoveEmoji: (move: string) => string;
  truncateAddress: (addr: string) => string;
  onAccept: () => void;
}) {
  const isUserInBattle =
    currentUser &&
    (battle.warrior1Owner.toLowerCase() === currentUser.toLowerCase() ||
      battle.warrior2Owner.toLowerCase() === currentUser.toLowerCase());

  return (
    <div className="bg-gray-800/50 rounded-2xl border border-gray-700 overflow-hidden hover:border-purple-500/50 transition-all">
      {/* Header */}
      <div className="p-6 border-b border-gray-700">
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadge(battle.status)}`}>
                {battle.status.toUpperCase()}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/50">
                {battle.source.toUpperCase()}
              </span>
              {battle.status === 'active' && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/50">
                  Round {battle.currentRound}/5
                </span>
              )}
            </div>
            <h3 className="text-lg font-semibold text-white leading-tight">
              {battle.question}
            </h3>
          </div>
          <div className="text-right ml-4">
            <p className="text-sm text-gray-400">Stakes (each)</p>
            <p className="text-xl font-bold text-purple-400">
              {formatEther(BigInt(battle.stakes))} CRwN
            </p>
          </div>
        </div>
      </div>

      {/* Warriors vs Display */}
      <div className="p-6">
        <div className="flex items-center justify-between">
          {/* Warrior 1 (YES) */}
          <div className="flex-1 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-green-500/30 to-emerald-600/30 rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-green-500/50">
              <span className="text-3xl">👍</span>
            </div>
            <p className="text-green-400 font-bold text-lg mb-1">YES</p>
            <p className="text-white font-medium">Warrior #{battle.warrior1Id || '?'}</p>
            <p className="text-gray-500 text-sm">{truncateAddress(battle.warrior1Owner)}</p>
            {battle.status !== 'pending' && (
              <p className="text-3xl font-bold text-white mt-3">{battle.warrior1Score}</p>
            )}
          </div>

          {/* VS */}
          <div className="px-8">
            <div className="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center border border-gray-600">
              <span className="text-xl font-bold text-gray-400">VS</span>
            </div>
          </div>

          {/* Warrior 2 (NO) */}
          <div className="flex-1 text-center">
            <div className="w-20 h-20 bg-gradient-to-br from-red-500/30 to-rose-600/30 rounded-full flex items-center justify-center mx-auto mb-3 border-2 border-red-500/50">
              <span className="text-3xl">👎</span>
            </div>
            <p className="text-red-400 font-bold text-lg mb-1">NO</p>
            <p className="text-white font-medium">Warrior #{battle.warrior2Id || '?'}</p>
            <p className="text-gray-500 text-sm">{truncateAddress(battle.warrior2Owner)}</p>
            {battle.status !== 'pending' && (
              <p className="text-3xl font-bold text-white mt-3">{battle.warrior2Score}</p>
            )}
          </div>
        </div>
      </div>

      {/* Rounds Timeline */}
      {battle.rounds && battle.rounds.length > 0 && (
        <div className="px-6 pb-4">
          <p className="text-sm text-gray-400 mb-3">Debate Rounds</p>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((roundNum) => {
              const round = battle.rounds.find(r => r.roundNumber === roundNum);
              const isCompleted = round?.roundWinner;
              const winner = round?.roundWinner;

              return (
                <div
                  key={roundNum}
                  className={`flex-1 p-3 rounded-lg text-center ${
                    !isCompleted
                      ? 'bg-gray-700/30 border border-gray-600/50'
                      : winner === 'warrior1'
                      ? 'bg-green-500/20 border border-green-500/50'
                      : winner === 'warrior2'
                      ? 'bg-red-500/20 border border-red-500/50'
                      : 'bg-yellow-500/20 border border-yellow-500/50'
                  }`}
                >
                  <p className="text-gray-400 text-xs mb-1">Round {roundNum}</p>
                  {isCompleted ? (
                    <>
                      <p className="text-white font-medium text-sm">
                        {getMoveEmoji(round?.w1Move || '')} vs {getMoveEmoji(round?.w2Move || '')}
                      </p>
                      <p className="text-xs text-gray-300 mt-1">
                        {round?.w1Score} - {round?.w2Score}
                      </p>
                    </>
                  ) : (
                    <p className="text-gray-500 text-sm">—</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-6 pb-6">
        {battle.status === 'pending' && !isUserInBattle && (
          <button
            onClick={onAccept}
            className="w-full py-3 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold text-white hover:from-green-500 hover:to-emerald-500 transition-all"
          >
            Accept Challenge (Take {battle.warrior1Id ? 'NO' : 'YES'} Side)
          </button>
        )}
        {battle.status === 'pending' && isUserInBattle && (
          <div className="text-center py-2 text-yellow-400">
            Waiting for opponent to accept...
          </div>
        )}
        {battle.status === 'active' && (
          <Link
            href={`/prediction-arena/battle/${battle.id}`}
            className="block w-full py-3 bg-purple-600/20 border border-purple-500/50 rounded-xl font-bold text-purple-400 hover:bg-purple-600/30 transition-all text-center"
          >
            📺 Watch Live Debate
          </Link>
        )}
        {battle.status === 'completed' && (
          <Link
            href={`/prediction-arena/battle/${battle.id}`}
            className="block text-center py-3 bg-gray-700/30 rounded-xl hover:bg-gray-700/50 transition-all"
          >
            <p className="text-gray-400 text-sm">Winner</p>
            <p className="text-white font-bold text-lg">
              {battle.warrior1Score > battle.warrior2Score
                ? `🏆 Warrior #${battle.warrior1Id} (YES) wins!`
                : battle.warrior2Score > battle.warrior1Score
                ? `🏆 Warrior #${battle.warrior2Id} (NO) wins!`
                : '🤝 Draw - Stakes split'}
            </p>
            <p className="text-purple-400 text-sm mt-1">View Details →</p>
          </Link>
        )}
      </div>
    </div>
  );
}
