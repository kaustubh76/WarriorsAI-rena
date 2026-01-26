'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { formatEther } from 'viem';
import { useUserNFTs } from '@/hooks/useUserNFTs';
import { fetchWithTimeout, isTimeoutError, TimeoutDefaults } from '@/lib/fetchWithTimeout';
import { useNotifications } from '@/contexts/NotificationContext';

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
  const chainId = useChainId();
  const [loading, setLoading] = useState(false);
  const [selectedWarrior, setSelectedWarrior] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const { success: showSuccess, error: showError } = useNotifications();

  // Fetch user's warriors from blockchain
  const { userNFTs: warriors, isLoadingNFTs: loadingWarriors } = useUserNFTs(isOpen, chainId);

  // Determine which side the acceptor will take
  // If warrior1 slot is empty (no owner), acceptor takes YES side
  // Otherwise, challenger took YES side, so acceptor takes NO side
  const isWarrior1SlotEmpty = !battle?.warrior1Owner || battle.warrior1Owner === '';
  const acceptorSide = isWarrior1SlotEmpty ? 'yes' : 'no';
  const challengerSide = isWarrior1SlotEmpty ? 'no' : 'yes';
  const challengerWarriorId = isWarrior1SlotEmpty ? battle?.warrior2Id : battle?.warrior1Id;

  // Reset form when modal opens and track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setSelectedWarrior(null);
      setError(null);
    }
    return () => {
      isMountedRef.current = false;
    };
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
      const response = await fetchWithTimeout(
        '/api/arena/battles',
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'accept',
            battleId: battle.id,
            warrior2Id: selectedWarrior,
            warrior2Owner: address,
          }),
        },
        TimeoutDefaults.standard // 15 second timeout
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to accept challenge');
      }

      // Show success notification
      showSuccess('Battle Started!', 'Get ready to argue your position.');
      onSuccess();
      onClose();
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = isTimeoutError(err)
          ? 'Request timed out. Please try again.'
          : (err instanceof Error ? err.message : 'Failed to accept challenge');
        setError(errorMessage);
        showError('Accept Failed', errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }

  if (!isOpen || !battle) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="accept-challenge-title"
      aria-describedby="accept-challenge-description"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="relative bg-gray-800 rounded-2xl border border-gray-700 w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-green-900/30 to-emerald-900/30">
          <h2 id="accept-challenge-title" className="text-2xl font-bold text-white">Accept Challenge</h2>
          <p id="accept-challenge-description" className="text-gray-400 text-sm mt-1">
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
          <div role="group" aria-labelledby="warrior-selection-label">
            <label id="warrior-selection-label" className="block text-sm font-medium text-gray-300 mb-2">
              Select Your Warrior
            </label>
            {loadingWarriors ? (
              <div className="h-12 bg-gray-700 rounded-lg animate-pulse" aria-busy="true" aria-label="Loading warriors" />
            ) : warriors.length === 0 ? (
              <p className="text-gray-500 text-sm">
                No warriors found. Mint a warrior to participate!
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {warriors.map((warrior) => (
                  <button
                    key={warrior.tokenId}
                    onClick={() => setSelectedWarrior(warrior.tokenId)}
                    className={`p-3 rounded-lg border transition-all ${
                      selectedWarrior === warrior.tokenId
                        ? 'bg-green-600/30 border-green-500 text-white'
                        : 'bg-gray-700/50 border-gray-600 text-gray-300 hover:border-gray-500'
                    }`}
                  >
                    {warrior.image ? (
                      <img
                        src={warrior.image}
                        alt={warrior.name}
                        className="w-10 h-10 mx-auto rounded-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = '/lazered.png';
                        }}
                      />
                    ) : (
                      <span className="text-xl">⚔️</span>
                    )}
                    <p className="text-sm mt-1 truncate">{warrior.name || `#${warrior.tokenId}`}</p>
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
            <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg" role="alert" aria-live="polite">
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
