'use client';

import React from 'react';

interface AIConfidenceMeterProps {
  confidence: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function AIConfidenceMeter({
  confidence,
  size = 'md',
  showLabel = true,
}: AIConfidenceMeterProps) {
  const getConfidenceColor = (conf: number) => {
    if (conf >= 80) return 'from-green-500 to-emerald-500';
    if (conf >= 60) return 'from-blue-500 to-cyan-500';
    if (conf >= 40) return 'from-yellow-500 to-orange-500';
    return 'from-red-500 to-pink-500';
  };

  const getConfidenceLabel = (conf: number) => {
    if (conf >= 80) return 'Very High';
    if (conf >= 60) return 'High';
    if (conf >= 40) return 'Moderate';
    return 'Low';
  };

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  };

  return (
    <div>
      {showLabel && (
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-400 text-sm">Confidence</span>
          <span className="text-white text-sm font-medium">
            {confidence}% - {getConfidenceLabel(confidence)}
          </span>
        </div>
      )}
      <div className={`bg-gray-700 rounded-full overflow-hidden ${sizeClasses[size]}`}>
        <div
          className={`h-full bg-gradient-to-r ${getConfidenceColor(confidence)} transition-all duration-500`}
          style={{ width: `${confidence}%` }}
        />
      </div>
    </div>
  );
}

interface CircularConfidenceMeterProps {
  confidence: number;
  size?: number;
  strokeWidth?: number;
}

export function CircularConfidenceMeter({
  confidence,
  size = 80,
  strokeWidth = 8,
}: CircularConfidenceMeterProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (confidence / 100) * circumference;

  const getColor = (conf: number) => {
    if (conf >= 80) return '#22c55e'; // green-500
    if (conf >= 60) return '#3b82f6'; // blue-500
    if (conf >= 40) return '#f59e0b'; // yellow-500
    return '#ef4444'; // red-500
  };

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#374151"
          strokeWidth={strokeWidth}
        />
        {/* Progress circle */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor(confidence)}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-white font-bold text-lg">{confidence}%</span>
      </div>
    </div>
  );
}

export default AIConfidenceMeter;
