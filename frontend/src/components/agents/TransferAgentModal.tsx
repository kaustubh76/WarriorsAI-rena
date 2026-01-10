/**
 * TransferAgentModal Component
 * Modal for transferring AI Agent iNFTs with secure re-encryption
 */

'use client';

import React, { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import type { Address } from 'viem';
import { isAddress } from 'viem';
import { useTransferINFT, useAgentINFT } from '@/hooks/useAgentINFT';
import { INFTBadge } from './INFTBadge';

interface TransferAgentModalProps {
  tokenId: bigint;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (txHash: string) => void;
}

export function TransferAgentModal({
  tokenId,
  isOpen,
  onClose,
  onSuccess,
}: TransferAgentModalProps) {
  const { address } = useAccount();
  const { inft, display } = useAgentINFT(tokenId);
  const { transfer, isTransferring, error: transferError } = useTransferINFT();

  const [recipientAddress, setRecipientAddress] = useState('');
  const [step, setStep] = useState<'input' | 'confirm' | 'processing' | 'success' | 'error'>('input');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isValidAddress = recipientAddress && isAddress(recipientAddress);
  const isSelfTransfer = isValidAddress && recipientAddress.toLowerCase() === address?.toLowerCase();

  const handleTransfer = useCallback(async () => {
    if (!isValidAddress || isSelfTransfer) return;

    setStep('processing');
    setError(null);

    try {
      const hash = await transfer(tokenId, recipientAddress as Address);
      setTxHash(hash);
      setStep('success');
      onSuccess?.(hash);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer failed');
      setStep('error');
    }
  }, [tokenId, recipientAddress, isValidAddress, isSelfTransfer, transfer, onSuccess]);

  const handleClose = useCallback(() => {
    setRecipientAddress('');
    setStep('input');
    setTxHash(null);
    setError(null);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

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
            <h2 className="text-lg font-semibold text-white">Transfer iNFT</h2>
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
              <div className="text-sm text-gray-400 mb-1">Transferring</div>
              <div className="flex items-center justify-between">
                <span className="text-white font-medium">Agent #{tokenId.toString()}</span>
                <span className="text-sm text-gray-400">{display.tierLabel}</span>
              </div>
              {inft && (
                <div className="mt-2 text-xs text-gray-500">
                  Stake: {display.stakedFormatted} (transfers with NFT)
                </div>
              )}
            </div>
          )}

          {/* Input Step */}
          {step === 'input' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Recipient Address
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  placeholder="0x..."
                  className={`
                    w-full px-4 py-3 bg-gray-800 border rounded-lg
                    text-white placeholder-gray-500
                    focus:outline-none focus:ring-2 focus:ring-purple-500
                    ${recipientAddress && !isValidAddress ? 'border-red-500' : 'border-gray-600'}
                  `}
                />
                {recipientAddress && !isValidAddress && (
                  <p className="mt-1 text-xs text-red-400">Invalid Ethereum address</p>
                )}
                {isSelfTransfer && (
                  <p className="mt-1 text-xs text-yellow-400">Cannot transfer to yourself</p>
                )}
              </div>

              {/* Warning */}
              <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex gap-2">
                  <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="text-sm text-yellow-200">
                    <p className="font-medium">Secure Transfer</p>
                    <p className="text-yellow-300/80 mt-1">
                      The encrypted metadata will be re-encrypted for the new owner.
                      Stakes will transfer with the NFT.
                    </p>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setStep('confirm')}
                disabled={!isValidAddress || isSelfTransfer}
                className={`
                  w-full py-3 px-4 rounded-lg font-medium transition-all
                  ${isValidAddress && !isSelfTransfer
                    ? 'bg-gradient-to-r from-purple-500 to-blue-500 text-white hover:from-purple-600 hover:to-blue-600'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  }
                `}
              >
                Continue
              </button>
            </>
          )}

          {/* Confirm Step */}
          {step === 'confirm' && (
            <>
              <div className="mb-4 p-4 bg-gray-800/50 rounded-lg space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">From</span>
                  <span className="text-white font-mono text-xs">
                    {address?.slice(0, 6)}...{address?.slice(-4)}
                  </span>
                </div>
                <div className="flex justify-center">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400">To</span>
                  <span className="text-white font-mono text-xs">
                    {recipientAddress.slice(0, 6)}...{recipientAddress.slice(-4)}
                  </span>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 py-3 px-4 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleTransfer}
                  className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-lg font-medium transition-all"
                >
                  Confirm Transfer
                </button>
              </div>
            </>
          )}

          {/* Processing Step */}
          {step === 'processing' && (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-r from-purple-500 to-blue-500 flex items-center justify-center animate-pulse">
                <svg className="w-8 h-8 text-white animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-white mb-2">Processing Transfer</h3>
              <p className="text-gray-400 text-sm">
                Re-encrypting metadata and transferring ownership...
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
              <h3 className="text-lg font-medium text-white mb-2">Transfer Complete!</h3>
              <p className="text-gray-400 text-sm mb-4">
                Your AI Agent iNFT has been transferred successfully.
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
              <h3 className="text-lg font-medium text-white mb-2">Transfer Failed</h3>
              <p className="text-red-400 text-sm mb-4">{error || transferError?.message}</p>
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

export default TransferAgentModal;
