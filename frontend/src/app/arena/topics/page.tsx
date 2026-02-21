'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Swords } from 'lucide-react';
import TopicPickerGrid from '@/components/arena/TopicPickerGrid';
import type { CuratedTopic } from '@/hooks/arena/useCuratedTopics';
import '../../home-glass.css';

export default function ArenaTopicsPage() {
  const router = useRouter();
  const [selectedTopic, setSelectedTopic] = useState<CuratedTopic | null>(null);

  const handleSelectTopic = (topic: CuratedTopic) => {
    // Navigate to arena with the selected market pre-filled
    // The arena page's CreateChallengeModal can pick up from query params
    router.push(
      `/arena?createBattle=true&marketId=${encodeURIComponent(topic.id)}&source=${topic.source}`
    );
  };

  return (
    <div className="home-page min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/arena')}
            className="flex items-center gap-2 text-gray-500 hover:text-gray-700 mb-4 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">Back to Arena</span>
          </button>

          <div className="flex items-center gap-3 mb-2">
            <Swords className="w-8 h-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Pick Your Battle</h1>
          </div>
          <p className="text-gray-600 max-w-2xl">
            Browse curated prediction markets from Polymarket and Kalshi.
            Choose a topic and let your AI warriors debate both sides.
          </p>
        </div>

        {/* Topic Grid */}
        <TopicPickerGrid onSelectTopic={handleSelectTopic} />
      </div>
    </div>
  );
}
