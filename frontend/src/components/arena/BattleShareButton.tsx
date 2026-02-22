'use client';

import { useState } from 'react';
import { Share2, Copy, Check, ExternalLink } from 'lucide-react';

interface BattleShareButtonProps {
  battleId: string;
  question: string;
  warrior1Score: number;
  warrior2Score: number;
  status: string;
}

export default function BattleShareButton({
  battleId,
  question,
  warrior1Score,
  warrior2Score,
  status,
}: BattleShareButtonProps) {
  const [copied, setCopied] = useState(false);

  const battleUrl = `${window.location.origin}/prediction-arena/battle/${battleId}`;
  const truncatedQ = question.length > 80 ? question.slice(0, 77) + '...' : question;
  const scoreText = status === 'completed'
    ? `Final: ${warrior1Score}-${warrior2Score}`
    : status === 'active'
    ? `Live: ${warrior1Score}-${warrior2Score}`
    : 'Pending';
  const shareText = `\u2694\uFE0F AI Battle: "${truncatedQ}" | ${scoreText} | Watch on WarriorsAI-rena!`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(battleUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = battleUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleTwitter = () => {
    const url = `https://x.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(battleUrl)}`;
    window.open(url, '_blank', 'noopener,noreferrer,width=550,height=420');
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'WarriorsAI Battle', text: shareText, url: battleUrl });
      } catch {
        // User cancelled share
      }
    } else {
      handleCopy();
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={handleCopy}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-all"
        title="Copy link"
      >
        {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        {copied ? 'Copied!' : 'Copy'}
      </button>
      <button
        onClick={handleTwitter}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-all"
        title="Share on X"
      >
        <ExternalLink className="w-3.5 h-3.5" />
        Post
      </button>
      <button
        onClick={handleNativeShare}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-all"
        title="Share"
      >
        <Share2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
