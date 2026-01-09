'use client';

import React, { useState } from 'react';

interface ProofData {
  inputHash: string;
  outputHash: string;
  providerAddress: string;
  modelHash?: string;
  signature?: string;
  timestamp?: number;
}

interface ProofDataSectionProps {
  proof: ProofData;
  isExpanded?: boolean;
  onToggle?: () => void;
  className?: string;
  explorerUrl?: string; // e.g., 'https://chainscan-galileo.0g.ai/address/'
}

export function ProofDataSection({
  proof,
  isExpanded: controlledExpanded,
  onToggle,
  className = '',
  explorerUrl = 'https://chainscan-galileo.0g.ai/address/'
}: ProofDataSectionProps) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Support both controlled and uncontrolled modes
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  const handleToggle = () => {
    if (onToggle) {
      onToggle();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  };

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const truncateHash = (hash: string, startChars = 10, endChars = 8) => {
    if (hash.length <= startChars + endChars) return hash;
    return `${hash.slice(0, startChars)}...${hash.slice(-endChars)}`;
  };

  return (
    <div className={`bg-gray-800/50 rounded-lg ${className}`}>
      {/* Toggle Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-gray-400 hover:text-gray-300 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>View Cryptographic Proof</span>
        </div>
        <svg
          className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-gray-700">
          {/* Provider Address */}
          <ProofField
            label="Provider"
            value={proof.providerAddress}
            displayValue={truncateHash(proof.providerAddress)}
            onCopy={() => copyToClipboard(proof.providerAddress, 'provider')}
            isCopied={copiedField === 'provider'}
            explorerLink={`${explorerUrl}${proof.providerAddress}`}
          />

          {/* Input Hash */}
          <ProofField
            label="Input Hash"
            value={proof.inputHash}
            displayValue={truncateHash(proof.inputHash)}
            onCopy={() => copyToClipboard(proof.inputHash, 'input')}
            isCopied={copiedField === 'input'}
          />

          {/* Output Hash */}
          <ProofField
            label="Output Hash"
            value={proof.outputHash}
            displayValue={truncateHash(proof.outputHash)}
            onCopy={() => copyToClipboard(proof.outputHash, 'output')}
            isCopied={copiedField === 'output'}
          />

          {/* Model Hash (if available) */}
          {proof.modelHash && (
            <ProofField
              label="Model"
              value={proof.modelHash}
              displayValue={proof.modelHash.length > 30 ? truncateHash(proof.modelHash) : proof.modelHash}
              onCopy={() => copyToClipboard(proof.modelHash!, 'model')}
              isCopied={copiedField === 'model'}
            />
          )}

          {/* Signature (if available) */}
          {proof.signature && (
            <ProofField
              label="Signature"
              value={proof.signature}
              displayValue={truncateHash(proof.signature)}
              onCopy={() => copyToClipboard(proof.signature!, 'signature')}
              isCopied={copiedField === 'signature'}
            />
          )}

          {/* Timestamp */}
          {proof.timestamp && (
            <div className="flex items-center justify-between pt-2 border-t border-gray-700">
              <span className="text-xs text-gray-500">Timestamp</span>
              <span className="text-xs text-gray-400">
                {new Date(proof.timestamp).toLocaleString()}
              </span>
            </div>
          )}

          {/* Verification Note */}
          <div className="pt-2 border-t border-gray-700">
            <p className="text-xs text-gray-500">
              These hashes can be used to verify the AI prediction on-chain via the 0G Compute Network.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

interface ProofFieldProps {
  label: string;
  value: string;
  displayValue: string;
  onCopy: () => void;
  isCopied: boolean;
  explorerLink?: string;
}

function ProofField({ label, value, displayValue, onCopy, isCopied, explorerLink }: ProofFieldProps) {
  return (
    <div className="pt-3 first:pt-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">{label}</span>
        <div className="flex items-center gap-1.5">
          {explorerLink && (
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
              title="View on explorer"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
          <button
            onClick={onCopy}
            className="text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center gap-1"
            title="Copy to clipboard"
          >
            {isCopied ? (
              <>
                <svg className="w-3.5 h-3.5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-400">Copied</span>
              </>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <code className="block text-xs font-mono text-gray-300 bg-gray-900 rounded px-2 py-1 break-all">
        {displayValue}
      </code>
    </div>
  );
}

/**
 * Compact proof badge for inline display
 */
export function ProofBadge({
  hasProof,
  onClick,
  className = ''
}: {
  hasProof: boolean;
  onClick?: () => void;
  className?: string;
}) {
  if (!hasProof) {
    return null;
  }

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-500/20 text-purple-400 rounded-full hover:bg-purple-500/30 transition-colors ${className}`}
    >
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
      Proof
    </button>
  );
}

export default ProofDataSection;
