/**
 * AuthorizeUsageModal Component
 * Modal for granting/managing execution authorization for AI Agent iNFTs
 */

'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useAccount } from 'wagmi';
import type { Address } from 'viem';
import { isAddress } from 'viem';
import { useAuthorizeUsage, useAgentINFT, useAgentAuthorization } from '@/hooks/useAgentINFT';
import { INFTBadge } from './INFTBadge';

interface AuthorizeUsageModalProps {
  tokenId: bigint;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (txHash: string) => void;
}

const DURATION_OPTIONS = [
  { label: '1 Day', days: 1 },
  { label: '7 Days', days: 7 },
  { label: '30 Days', days: 30 },
  { label: '90 Days', days: 90 },
  { label: '1 Year', days: 365 },
];

export function AuthorizeUsageModal({
  tokenId,
  isOpen,
  onClose,
  onSuccess,
}: AuthorizeUsageModalProps) {
  const { address } = useAccount();
  const { inft, display } = useAgentINFT(tokenId);
  const { authorize, revoke, isProcessing, error: authError } = useAuthorizeUsage();

  const [mode, setMode] = useState<'grant' | 'revoke'>('grant');
  const [executorAddress, setExecutorAddress] = useState('');
  const [selectedDuration, setSelectedDuration] = useState(7);
  const [step, setStep] = useState<'input' | 'processing' | 'success' | 'error'>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Check existing authorization
  const { authorization, isLoading: isLoadingAuth } = useAgentAuthorization(
    tokenId,
    isAddress(executorAddress) ? executorAddress as Address : undefined
  );

  const isValidAddress = executorAddress && isAddress(executorAddress);
  const isSelfAuth = isValidAddress && executorAddress.toLowerCase() === address?.toLowerCase();
  const hasExistingAuth = authorization && authorization.expiresAt > BigInt(Date.now() / 1000);

  const handleAuthorize = useCallback(async () => {
    if (!isValidAddress || isSelfAuth) return;

    setStep('processing');
    setError(null);

    try {
      let hash: string;
      if (mode === 'grant') {
        hash = await authorize(tokenId, executorAddress as Address, selectedDuration);
      } else {
        hash = await revoke(tokenId, executorAddress as Address);
      }
      setTxHash(hash);
      setStep('success');
      onSuccess?.(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authorization failed');
      setStep('error');
    }
  }, [tokenId, executorAddress, selectedDuration, mode, isValidAddress, isSelfAuth, authorize, revoke, onSuccess]);

  const handleClose = useCallback(() => {
    setExecutorAddress('');
    setSelectedDuration(7);
    setStep('input');
    setTxHash(null);
    setError(null);
    setMode('grant');
    onClose();
  }, [onClose]);

  // Auto-switch to revoke if existing auth found
  useEffect(() => {
    if (hasExistingAuth) {
      setMode('revoke');
    }
  }, [hasExistingAuth]);

  if (!isOpen) return null;

  const formatExpiry = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <INFTBadge size="md" />
            <h2 className="text-lg font-semibold text-white">
              {mode === 'grant' ? 'Authorize Usage' : 'Revoke Authorization'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          {/* Agent Info */}
          {display && (
            <div className="mb-4 p-3 bg-gray-800/50 rounded-lg">
              <div className="text-sm text-gray-400 mb-1">Agent</div>
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">#{tokenId.toString()}</span>
                <span className="text-sm text-gray-400">{display.tierLabel}</span>
              </div>
            </div>
          )}

          {/* Input Step */}
          {step === 'input' && (
            <>
              {/* Mode Toggle */}
              <div className="mb-4 flex bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setMode('grant')}
                  className={`
                    flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all
                    ${mode === 'grant'
                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white'
                      : 'text-gray-400 hover:text-white'
                    }
                  `}
                >
                  Grant Access
                </button>
                <button
                  onClick={() => setMode('revoke')}
                  className={`
                    flex-1 py-2 px-4 rounded-md text-sm font-medium transition-all
                    ${mode === 'revoke'
                      ? 'bg-red-500 text-white'
                      : 'text-gray-400 hover:text-white'
                    }
                  `}
                >
                  Revoke Access
                </button>
              </div>

              {/* Executor Address */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Executor Address
                </label>
                <input
                  type="text"
                  value={executorAddress}
                  onChange={(e) => setExecutorAddress(e.target.value)}
                  placeholder="0x..."
                  className={`
                    w-full px-4 py-3 bg-gray-800 border rounded-lg
                    text-white placeholder-gray-500
                    focus:outline-none focus:ring-2 focus:ring-purple-500
                    ${executorAddress && !isValidAddress ? 'border-red-500' : 'border-gray-600'}
                  `}
                />
                {executorAddress && !isValidAddress && (
                  <p className="mt-1 text-xs text-red-400">Invalid Ethereum address</p>
                )}
                {isSelfAuth && (
                  <p className="mt-1 text-xs text-yellow-400">You are already the owner</p>
                )}
              </div>

              {/* Existing Authorization Status */}
              {isValidAddress && !isSelfAuth && (
                <div className={`mb-4 p-3 rounded-lg ${hasExistingAuth ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-800/50'}`}>
                  {isLoadingAuth ? (
                    <div className="text-gray-400 text-sm">Checking authorization...</div>
                  ) : hasExistingAuth ? (
                    <div>
                      <div className="flex items-center gap-2 text-green-400 text-sm font-medium">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Currently Authorized
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        Expires: {formatExpiry(authorization!.expiresAt)}
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-400 text-sm">No existing authorization</div>
                  )}
                </div>
              )}

              {/* Duration Selection (only for grant mode) */}
              {mode === 'grant' && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Duration
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DURATION_OPTIONS.map((option) => (
                      <button
                        key={option.days}
                        onClick={() => setSelectedDuration(option.days)}
                        className={`
                          py-2 px-3 rounded-lg text-sm font-medium transition-all
                          ${selectedDuration === option.days
                            ? 'bg-purple-500 text-white'
                            : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                          }
                        `}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Info Box */}
              <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <div className="flex gap-2">
                  <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-blue-200">
                    {mode === 'grant' ? (
                      <>
                        <p className="font-medium">Authorization Features</p>
                        <ul className="text-blue-300/80 mt-1 space-y-1 text-xs">
                          <li>- Execute trades on behalf of this agent</li>
                          <li>- View decrypted metadata (if permitted)</li>
                          <li>- Does not transfer ownership</li>
                        </ul>
                      </>
                    ) : (
                      <p>Revoking will immediately remove all execution permissions for this address.</p>
                    )}
                  </div>
                </div>
              </div>

              <button
                onClick={handleAuthorize}
                disabled={!isValidAddress || isSelfAuth || isProcessing}
                className={`
                  w-full py-3 px-4 rounded-lg font-medium transition-all
                  ${isValidAddress && !isSelfAuth
                    ? mode === 'grant'
                      ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600'
                      : 'bg-red-500 text-white hover:bg-red-600'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }
                `}
              >
                {mode === 'grant' ? 'Grant Authorization' : 'Revoke Authorization'}
              </button>
            </>
          )}

          {/* Processing Step */}
          {step === 'processing' && (
            <div className="text-center py-8">
              <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center animate-pulse ${
                mode === 'grant' ? 'bg-gradient-to-r from-purple-500 to-blue-500' : 'bg-red-500'
              }`}>
                <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                {mode === 'grant' ? 'Granting Authorization' : 'Revoking Authorization'}
              </h3>
              <p className="text-gray-400 text-sm">
                Please confirm the transaction in your wallet...
              </p>
            </div>
          )}

          {/* Success Step */}
          {step === 'success' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">
                {mode === 'grant' ? 'Authorization Granted!' : 'Authorization Revoked!'}
              </h3>
              <p className="text-gray-400 text-sm mb-4">
                {mode === 'grant'
                  ? `Access has been granted for ${selectedDuration} days.`
                  : 'Access has been revoked successfully.'
                }
              </p>
              {txHash && (
                <a
                  href={`https://evm-testnet.flowscan.io/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300 text-sm underline"
                >
                  View Transaction
                </a>
              )}
              <button
                onClick={handleClose}
                className="w-full mt-4 py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Close
              </button>
            </div>
          )}

          {/* Error Step */}
          {step === 'error' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Authorization Failed</h3>
              <p className="text-red-400 text-sm mb-4">{error || authError?.message}</p>
              <button
                onClick={() => setStep('input')}
                className="w-full py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default AuthorizeUsageModal;
