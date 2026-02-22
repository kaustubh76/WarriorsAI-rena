'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ArenaLeaderboard } from '../../../components/arena';

export default function LeaderboardPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Navigation */}
        <div className="mb-6">
          <Link
            href="/prediction-arena"
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Arena
          </Link>
        </div>

        {/* Full Leaderboard */}
        <ArenaLeaderboard limit={50} />
      </div>
    </div>
  );
}
