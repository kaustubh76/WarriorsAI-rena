'use client';

import { useMemo } from 'react';
import { PredictionRound } from '../../types/predictionArena';

interface ScoreProgressionChartProps {
  rounds: PredictionRound[];
  warrior1Score: number;
  warrior2Score: number;
}

export default function ScoreProgressionChart({
  rounds,
  warrior1Score,
  warrior2Score,
}: ScoreProgressionChartProps) {
  const sortedRounds = useMemo(
    () => [...rounds].sort((a, b) => a.roundNumber - b.roundNumber),
    [rounds]
  );

  // Build cumulative score arrays: [0, cumAfterR1, cumAfterR2, ...]
  const { w1Data, w2Data } = useMemo(() => {
    const w1: number[] = [0];
    const w2: number[] = [0];
    let cum1 = 0;
    let cum2 = 0;
    for (const r of sortedRounds) {
      cum1 += r.w1Score;
      cum2 += r.w2Score;
      w1.push(cum1);
      w2.push(cum2);
    }
    return { w1Data: w1, w2Data: w2 };
  }, [sortedRounds]);

  const maxScore = Math.max(...w1Data, ...w2Data, 1);

  // Generate SVG path from data points in a 100x100 viewBox
  const generatePath = (data: number[]): string => {
    if (data.length === 0) return '';
    if (data.length === 1) {
      const y = 100 - (data[0] / maxScore) * 100;
      return `M 0,${y} L 100,${y}`;
    }
    const points = data.map((value, index) => {
      const x = (index / (data.length - 1)) * 100;
      const y = 100 - (value / maxScore) * 100;
      return `${x},${y}`;
    });
    return `M ${points.join(' L ')}`;
  };

  // Generate circle markers
  const generateMarkers = (data: number[]): { cx: number; cy: number }[] => {
    return data.map((value, index) => ({
      cx: data.length <= 1 ? 50 : (index / (data.length - 1)) * 100,
      cy: 100 - (value / maxScore) * 100,
    }));
  };

  if (sortedRounds.length === 0) {
    return (
      <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
        <h4 className="text-sm font-semibold text-gray-400 mb-3">Score Progression</h4>
        <div className="h-40 flex items-center justify-center text-gray-500 text-sm">
          Scores will appear as rounds complete
        </div>
      </div>
    );
  }

  const w1Path = generatePath(w1Data);
  const w2Path = generatePath(w2Data);
  const w1Markers = generateMarkers(w1Data);
  const w2Markers = generateMarkers(w2Data);

  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-400">Score Progression</h4>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
            <span className="text-green-400 font-medium">YES {warrior1Score}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
            <span className="text-red-400 font-medium">NO {warrior2Score}</span>
          </div>
        </div>
      </div>

      <div className="relative h-40">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 h-full flex flex-col justify-between text-[10px] text-gray-500 w-6">
          <span>{maxScore}</span>
          <span>{Math.round(maxScore / 2)}</span>
          <span>0</span>
        </div>

        {/* Chart area */}
        <div className="ml-8 h-full relative bg-gray-900/50 rounded-lg overflow-hidden">
          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((percent) => (
            <div
              key={percent}
              className="absolute w-full border-t border-gray-700/30"
              style={{ top: `${percent}%` }}
            />
          ))}

          {/* SVG Chart */}
          <svg
            className="absolute inset-0 w-full h-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="scoreGreenGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="scoreRedGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity="0.2" />
                <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* YES line */}
            <path
              d={w1Path}
              fill="none"
              stroke="rgb(34, 197, 94)"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
            {/* NO line */}
            <path
              d={w2Path}
              fill="none"
              stroke="rgb(239, 68, 68)"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Circle markers (rendered outside SVG for consistent sizing) */}
          {w1Markers.map((m, i) => (
            <div
              key={`w1-${i}`}
              className="absolute w-2 h-2 rounded-full bg-green-500 border border-green-300"
              style={{
                left: `${m.cx}%`,
                top: `${m.cy}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
          {w2Markers.map((m, i) => (
            <div
              key={`w2-${i}`}
              className="absolute w-2 h-2 rounded-full bg-red-500 border border-red-300"
              style={{
                left: `${m.cx}%`,
                top: `${m.cy}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>
      </div>

      {/* X-axis labels */}
      <div className="ml-8 mt-1.5 flex justify-between text-[10px] text-gray-500">
        <span>Start</span>
        {sortedRounds.map((r: PredictionRound) => (
          <span key={r.roundNumber}>R{r.roundNumber}</span>
        ))}
      </div>
    </div>
  );
}
