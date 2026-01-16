'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { parseEther } from 'viem';

interface Warrior {
  id: number;
  name: string;
}

interface Market {
  id: string;
  question: string;
  source: 'polymarket' | 'kalshi';
}

interface CreateChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

// Sample markets for demo - in production would fetch from Polymarket/Kalshi APIs
const SAMPLE_MARKETS: Market[] = [
  { id: 'btc-100k-2024', question: 'Will Bitcoin reach $100k by end of 2024?', source: 'polymarket' },
  { id: 'eth-10k-2024', question: 'Will Ethereum reach $10k by end of 2024?', source: 'polymarket' },
  { id: 'fed-rate-cut', question: 'Will the Fed cut rates in the next meeting?', source: 'kalshi' },
  { id: 'ai-agi-2025', question: 'Will AGI be achieved by 2025?', source: 'polymarket' },
  { id: 'trump-2024', question: 'Will Trump win the 2024 election?', source: 'polymarket' },
  { id: 'recession-2024', question: 'Will the US enter a recession in 2024?', source: 'kalshi' },
];

export function CreateChallengeModal({ isOpen, onClose, onSuccess }: CreateChallengeModalProps) {
  const { address } = useAccount();
  const [warriors, setWarriors] = useState<Warrior[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingWarriors, setLoadingWarriors] = useState(true);

  // Form state
  const [selectedWarrior, setSelectedWarrior] = useState<number | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [stakeAmount, setStakeAmount] = useState('1');
  const [error, setError] = useState<string | null>(null);

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
      setSelectedMarket(null);
      setSide('yes');
      setStakeAmount('1');
      setError(null);
    }
  }, [isOpen]);

  async function handleSubmit() {
    if (!address) {
      setError('Please connect your wallet');
      return;
    }
    if (!selectedWarrior) {
      setError('Please select a warrior');
      return;
    }
    if (!selectedMarket) {
      setError('Please select a market');
      return;
    }

    const stake = parseFloat(stakeAmount);
    if (isNaN(stake) || stake <= 0) {
      setError('Please enter a valid stake amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/arena/battles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          externalMarketId: selectedMarket.id,
          source: selectedMarket.source,
          question: selectedMarket.question,
          warrior1Id: selectedWarrior,
          warrior1Owner: address,
          stakes: parseEther(stakeAmount).toString(),
          challengerSideYes: side === 'yes',
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create challenge');
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create challenge');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

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
        <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-purple-900/30 to-pink-900/30">
          <h2 className="text-2xl font-bold text-white">Create Challenge</h2>
          <p className="text-gray-400 text-sm mt-1">
            Challenge another warrior to a prediction debate
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
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
                        ? 'bg-purple-600/30 border-purple-500 text-white'
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

          {/* Market Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Market Topic
            </label>
            <select
              value={selectedMarket?.id || ''}
              onChange={(e) => {
                const market = SAMPLE_MARKETS.find((m) => m.id === e.target.value);
                setSelectedMarket(market || null);
              }}
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
            >
              <option value="">Choose a market...</option>
              {SAMPLE_MARKETS.map((market) => (
                <option key={market.id} value={market.id}>
                  [{market.source.toUpperCase()}] {market.question}
                </option>
              ))}
            </select>
          </div>

          {/* Side Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Your Position
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setSide('yes')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  side === 'yes'
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="text-3xl block mb-2">👍</span>
                <span className="font-bold">YES</span>
                <p className="text-xs mt-1 opacity-75">Argue in favor</p>
              </button>
              <button
                onClick={() => setSide('no')}
                className={`p-4 rounded-xl border-2 transition-all ${
                  side === 'no'
                    ? 'bg-red-500/20 border-red-500 text-red-400'
                    : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:border-gray-500'
                }`}
              >
                <span className="text-3xl block mb-2">👎</span>
                <span className="font-bold">NO</span>
                <p className="text-xs mt-1 opacity-75">Argue against</p>
              </button>
            </div>
          </div>

          {/* Stake Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Stake Amount (CRwN)
            </label>
            <div className="relative">
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={stakeAmount}
                onChange={(e) => setStakeAmount(e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500"
                placeholder="1.0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
                CRwN
              </span>
            </div>
            <p className="text-gray-500 text-xs mt-2">
              Winner takes both stakes minus platform fee
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
            onClick={handleSubmit}
            disabled={loading || !selectedWarrior || !selectedMarket || !address}
            className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold text-white hover:from-purple-500 hover:to-pink-500 disabled:opacity-50 transition-all"
          >
            {loading ? 'Creating...' : 'Create Challenge'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateChallengeModal;
