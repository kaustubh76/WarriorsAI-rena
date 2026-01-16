'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { formatEther } from 'viem';

interface Warrior {
  id: number;
  name: string;
}

interface Battle {
  id: string;
  question: string;
  source: string;
  warrior1Id: number;
  warrior1Owner: string;
  warrior2Id: number;
  warrior2Owner: string;
  stakes: string;
}

interface AcceptChallengeModalProps {
  isOpen: boolean;
  battle: Battle | null;
  onClose: () => void;
  onSuccess: () => void;
}

export function AcceptChallengeModal({
  isOpen,
  battle,
  onClose,
  onSuccess,
}: AcceptChallengeModalProps) {
  const { address } = useAccount();
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingWarriors, setLoadingWarriors] = useState(true);
  const [selectedWarrior, setSelectedWarrior] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Determine which side the acceptor will take
  const acceptorSide = battle?.warrior1Id === 0 ? 'yes' : 'no';
  const challengerSide = battle?.warrior1Id === 0 ? 'no' : 'yes';
  const challengerWarriorId = battle?.warrior1Id === 0 ? battle.warrior2Id : battle?.warrior1Id;

  // Fetch user's warriors
  useEffect(() => {
    async function fetchWarriors() {
      if (!address) {
        setWarriors([]);
        setLoadingWarriors(false);
        return;
      }

      try {
        setLoadingWarriors(true);
        // In production, fetch from contract or API
        // For demo, create placeholder warriors
        const mockWarriors: Warrior[] = [
          { id: 1, name: 'Warrior #1' },
          { id: 2, name: 'Warrior #2' },
          { id: 3, name: 'Warrior #3' },
        ];
        setWarriors(mockWarriors);
      } catch (err) {
        console.error('Failed to fetch warriors:', err);
      } finally {
        setLoadingWarriors(false);
      }
    }

    if (isOpen) {
      fetchWarriors();
    }
  }, [address, isOpen]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedWarrior(null);
      setError(null);
    }
  }, [isOpen]);

  async function handleAccept() {
    if (!address) {
      setError('Please connect your wallet');
      return;
    }
    if (!selectedWarrior) {
      setError('Please select a warrior');
      return;
    }
    if (!battle) {
      setError('No battle selected');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/arena/battles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'accept',
          battleId: battle.id,
          warrior2Id: selectedWarrior,
          warrior2Owner: address,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept challenge');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept challenge');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen || !battle) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-green-900/30 to-emerald-900/30">
          <h2 className="text-2xl font-bold text-white">Accept Challenge</h2>
          <p className="text-gray-400 text-sm mt-1">
            Take the {acceptorSide.toUpperCase()} side in this debate
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Challenge Details */}
          <div className="bg-gray-700/30 rounded-xl p-4 border border-gray-600">
            <p className="text-gray-400 text-sm mb-2">Market Topic</p>
            <p className="text-white font-medium">{battle.question}</p>
            <div className="flex items-center gap-4 mt-4">
              <div className="flex-1">
                <p className="text-gray-400 text-xs">Source</p>
                <p className="text-blue-400 text-sm font-medium">
                  {battle.source.toUpperCase()}
                </p>
              </div>
              <div className="flex-1">
                <p className="text-gray-400 text-xs">Stakes</p>
                <p className="text-purple-400 text-sm font-medium">
                  {formatEther(BigInt(battle.stakes))} CRwN
                </p>
              </div>
            </div>
          </div>

          {/* Matchup Display */}
          <div className="flex items-center justify-between">
            <div className="text-center flex-1">
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                challengerSide === 'yes'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : 'bg-red-500/20 border-2 border-red-500'
              }`}>
                <span className="text-2xl">{challengerSide === 'yes' ? '👍' : '👎'}</span>
              </div>
              <p className={`mt-2 font-bold ${challengerSide === 'yes' ? 'text-green-400' : 'text-red-400'}`}>
                {challengerSide.toUpperCase()}
              </p>
              <p className="text-gray-400 text-sm">Warrior #{challengerWarriorId}</p>
              <p className="text-gray-500 text-xs">Challenger</p>
            </div>

            <div className="px-4">
              <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center">
                <span className="text-gray-400 font-bold">VS</span>
              </div>
            </div>

            <div className="text-center flex-1">
              <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center ${
                acceptorSide === 'yes'
                  ? 'bg-green-500/20 border-2 border-green-500'
                  : 'bg-red-500/20 border-2 border-red-500'
              }`}>
                <span className="text-2xl">{acceptorSide === 'yes' ? '👍' : '👎'}</span>
              </div>
              <p className={`mt-2 font-bold ${acceptorSide === 'yes' ? 'text-green-400' : 'text-red-400'}`}>
                {acceptorSide.toUpperCase()}
              </p>
              <p className="text-gray-400 text-sm">
                {selectedWarrior ? `Warrior #${selectedWarrior}` : 'Select warrior'}
              </p>
              <p className="text-gray-500 text-xs">You</p>
            </div>
          </div>

          {/* Warrior Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Your Warrior
            </label>
            {loadingWarriors ? (
              <div className="h-12 bg-gray-700 rounded-lg animate-pulse" />
            ) : warriors.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No warriors found. Mint a warrior to participate!
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {warriors.map((warrior) => (
                  <button
                    key={warrior.id}
                    onClick={() => setSelectedWarrior(warrior.id)}
                    className={`p-3 rounded-lg border transition-all ${
                      selectedWarrior === warrior.id
                        ? 'bg-green-600/30 border-green-500 text-white'
                        : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    <span className="text-xl">⚔️</span>
                    <p className="text-sm mt-1">#{warrior.id}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Stake Confirmation */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <p className="text-yellow-400 text-sm font-medium">Stake Required</p>
            <p className="text-white text-lg font-bold mt-1">
              {formatEther(BigInt(battle.stakes))} CRwN
            </p>
            <p className="text-gray-400 text-xs mt-2">
              This amount will be locked until the battle concludes
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 bg-gray-900/30 flex gap-4">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 py-3 bg-gray-700 rounded-xl font-medium text-gray-300 hover:bg-gray-600 disabled:opacity-50 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleAccept}
            disabled={loading || !selectedWarrior || !address}
            className="flex-1 py-3 bg-gradient-to-r from-green-600 to-emerald-600 rounded-xl font-bold text-white hover:from-green-500 hover:to-emerald-500 disabled:opacity-50 transition-all"
          >
            {loading ? 'Accepting...' : 'Accept & Start Battle'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default AcceptChallengeModal;
