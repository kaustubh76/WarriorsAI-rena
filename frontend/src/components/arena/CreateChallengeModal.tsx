'use client';

import { useState, useEffect, useRef } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { parseEther } from 'viem';
import { useArenaMarkets, ArenaMarket, MarketSourceFilter } from '@/hooks/arena/useArenaMarkets';
import { useUserNFTs } from '@/hooks/useUserNFTs';
import { fetchWithTimeout, isTimeoutError, TimeoutDefaults } from '@/lib/fetchWithTimeout';
import { useNotifications } from '@/contexts/NotificationContext';

interface CreateChallengeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CreateChallengeModal({ isOpen, onClose, onSuccess }: CreateChallengeModalProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const [loading, setLoading] = useState(false);
  const { success: showSuccess, error: showError } = useNotifications();

  // Fetch user's warriors from blockchain
  const { userNFTs: warriors, isLoadingNFTs: loadingWarriors } = useUserNFTs(isOpen, chainId);

  // Market fetching hook
  const {
    markets,
    loading: loadingMarkets,
    error: marketsError,
    search: searchMarkets,
    refetch: refetchMarkets,
    setSource,
    searchQuery,
    sourceFilter,
    sourceCounts,
  } = useArenaMarkets({ initialFetch: false });

  // Form state
  const [selectedWarrior, setSelectedWarrior] = useState<number | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<ArenaMarket | null>(null);
  const [side, setSide] = useState<'yes' | 'no'>('yes');
  const [stakeAmount, setStakeAmount] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  // Reset form and fetch markets when modal opens, track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    if (isOpen) {
      setSelectedWarrior(null);
      setSelectedMarket(null);
      setSide('yes');
      setStakeAmount('1');
      setError(null);
      setIsDropdownOpen(false);
      refetchMarkets();
    }
    return () => {
      isMountedRef.current = false;
    };
  }, [isOpen, refetchMarkets]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
      const response = await fetchWithTimeout(
        '/api/arena/battles',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            externalMarketId: selectedMarket.externalId,
            source: selectedMarket.source,
            question: selectedMarket.question,
            warrior1Id: selectedWarrior,
            warrior1Owner: address,
            stakes: parseEther(stakeAmount).toString(),
            challengerSideYes: side === 'yes',
          }),
        },
        TimeoutDefaults.standard // 15 second timeout
      );

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create challenge');
      }

      // Show success notification
      showSuccess('Challenge Created!', 'Your challenge is now waiting for an opponent.');
      onSuccess();
      onClose();
    } catch (err) {
      if (isMountedRef.current) {
        const errorMessage = isTimeoutError(err)
          ? 'Request timed out. Please try again.'
          : (err instanceof Error ? err.message : 'Failed to create challenge');
        setError(errorMessage);
        showError('Challenge Failed', errorMessage);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-challenge-title"
      aria-describedby="create-challenge-description"
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
        <div className="p-6 border-b border-gray-700 bg-gradient-to-r from-purple-900/30 to-pink-900/30">
          <h2 id="create-challenge-title" className="text-2xl font-bold text-white">Create Challenge</h2>
          <p id="create-challenge-description" className="text-gray-400 text-sm mt-1">
            Challenge another warrior to a prediction debate
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
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
                        ? 'bg-purple-600/30 border-purple-500 text-white'
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

          {/* Market Selection */}
          <div ref={dropdownRef}>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Select Market Topic
            </label>

            {/* Source Filter Tabs */}
            <div className="flex gap-1 mb-3 p-1 bg-gray-700/50 rounded-lg">
              {(['all', 'polymarket', 'kalshi'] as MarketSourceFilter[]).map((source) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setSource(source)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    sourceFilter === source
                      ? 'bg-purple-600 text-white'
                      : 'text-gray-400 hover:text-white hover:bg-gray-600/50'
                  }`}
                >
                  {source === 'all' ? 'All' : source === 'polymarket' ? 'Polymarket' : 'Kalshi'}
                  {source !== 'all' && (
                    <span className="ml-1 opacity-70">
                      ({source === 'polymarket' ? sourceCounts.polymarket : sourceCounts.kalshi})
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search prediction markets..."
                value={searchQuery}
                onChange={(e) => searchMarkets(e.target.value)}
                onFocus={() => setIsDropdownOpen(true)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:border-purple-500 pr-10"
              />
              <svg
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>

              {/* Dropdown */}
              {isDropdownOpen && (
                <div className="absolute z-10 w-full mt-1 bg-gray-800 border border-gray-700 rounded-lg max-h-64 overflow-y-auto shadow-xl">
                  {loadingMarkets ? (
                    <div className="p-4 space-y-2">
                      {[1, 2, 3].map((i) => (
                        <div key={i} className="h-16 bg-gray-700 rounded animate-pulse" />
                      ))}
                    </div>
                  ) : marketsError ? (
                    <div className="p-4 text-center">
                      <p className="text-red-400 text-sm mb-2">{marketsError}</p>
                      <button
                        onClick={() => refetchMarkets()}
                        className="text-purple-400 hover:text-purple-300 text-sm underline"
                      >
                        Retry
                      </button>
                    </div>
                  ) : markets.length === 0 ? (
                    <div className="p-4 text-gray-500 text-sm text-center">
                      {searchQuery ? 'No markets found' : 'Loading markets...'}
                    </div>
                  ) : (
                    markets.map((market) => (
                      <button
                        key={market.id}
                        type="button"
                        onClick={() => {
                          setSelectedMarket(market);
                          setIsDropdownOpen(false);
                        }}
                        className={`w-full px-4 py-3 text-left hover:bg-gray-700 transition-colors border-b border-gray-700/50 last:border-b-0 ${
                          selectedMarket?.id === market.id ? 'bg-purple-900/30' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            market.source === 'polymarket'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-green-500/20 text-green-400'
                          }`}>
                            {market.source.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500">
                            Vol: ${parseFloat(market.volume).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-white text-sm line-clamp-2 mb-1">
                          {market.question}
                        </p>
                        <div className="flex gap-3 text-xs">
                          <span className="text-green-400">Yes: {market.yesPrice.toFixed(1)}%</span>
                          <span className="text-red-400">No: {market.noPrice.toFixed(1)}%</span>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Selected market display */}
            {selectedMarket && (
              <div className="mt-3 p-3 bg-gray-700/50 rounded-lg border border-gray-600">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    selectedMarket.source === 'polymarket'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-green-500/20 text-green-400'
                  }`}>
                    {selectedMarket.source.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedMarket(null)}
                    className="text-gray-500 hover:text-gray-300 text-xs"
                  >
                    Clear
                  </button>
                </div>
                <p className="text-white text-sm mb-2">{selectedMarket.question}</p>
                <div className="flex gap-4 text-sm">
                  <span className="text-green-400">Yes: {selectedMarket.yesPrice.toFixed(1)}%</span>
                  <span className="text-red-400">No: {selectedMarket.noPrice.toFixed(1)}%</span>
                  <span className="text-gray-500">Vol: ${parseFloat(selectedMarket.volume).toLocaleString()}</span>
                </div>
              </div>
            )}
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
