'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { type CreatorDisplay } from '@/services/creatorService';

interface CreatorProfileCardProps {
  creator: CreatorDisplay;
}

export function CreatorProfileCard({ creator }: CreatorProfileCardProps) {
  const [copied, setCopied] = useState(false);
  const shortAddress = `${creator.wallet.slice(0, 6)}...${creator.wallet.slice(-4)}`;

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(creator.wallet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-xl p-6 border border-gray-700">
      <h3 className="text-lg font-semibold text-white mb-4">Creator Profile</h3>

      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Wallet</span>
          <button
            onClick={copyAddress}
            className="text-sm text-white font-mono hover:text-purple-400 transition-colors"
            title="Click to copy"
          >
            {copied ? 'Copied!' : shortAddress}
          </button>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Type</span>
          <span className="text-sm text-white">{creator.typeLabel}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-gray-400">Member Since</span>
          <span className="text-sm text-white">{creator.memberSince}</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700 flex gap-2">
        <Link
          href="/create-market"
          className="flex-1 text-center py-2 text-sm bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg transition-colors"
        >
          Create Market
        </Link>
        <Link
          href="/warriorsMinter"
          className="flex-1 text-center py-2 text-sm bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 rounded-lg transition-colors"
        >
          Mint Warrior
        </Link>
      </div>
    </div>
  );
}

export default CreatorProfileCard;
