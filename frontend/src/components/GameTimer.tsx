import React, { useState, useEffect, useRef } from 'react';

interface BattleNotification {
  isVisible: boolean;
  warriorsOneName: string;
  warriorsTwoName: string;
  warriorsOneMove: string;
  warriorsTwoMove: string;
  warriorsOneHitStatus?: 'HIT' | 'MISS' | 'PENDING';
  warriorsTwoHitStatus?: 'HIT' | 'MISS' | 'PENDING';
}

interface GameTimerProps {
  gameState: 'betting' | 'playing' | 'idle';
  timeRemaining: number;
  totalTime: number;
  battleNotification?: BattleNotification | null;
}

export const GameTimer: React.FC<GameTimerProps> = ({
  gameState,
  timeRemaining: serverTimeRemaining,
  totalTime,
  battleNotification
}) => {
  // Local state for smooth countdown - interpolates between server updates
  const [localTimeRemaining, setLocalTimeRemaining] = useState(serverTimeRemaining);
  const lastServerTimeRef = useRef(serverTimeRemaining);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with server time when it changes
  useEffect(() => {
    const timeDiff = Math.abs(serverTimeRemaining - lastServerTimeRef.current);

    // If server time changed significantly (new phase, sync drift > 3s), update immediately
    if (timeDiff > 3 || serverTimeRemaining > localTimeRemaining + 2) {
      setLocalTimeRemaining(serverTimeRemaining);
    }
    // Small drift correction - only update if server is ahead
    else if (serverTimeRemaining < localTimeRemaining - 2) {
      setLocalTimeRemaining(serverTimeRemaining);
    }

    lastServerTimeRef.current = serverTimeRemaining;
  }, [serverTimeRemaining]);

  // Client-side countdown for smooth animation (runs every second)
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (gameState === 'idle') return;

    intervalRef.current = setInterval(() => {
      setLocalTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [gameState]);

  const formatTime = (seconds: number) => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(safeSeconds / 60);
    const secs = safeSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getProgressPercentage = () => {
    if (totalTime <= 0) return 0;
    return Math.max(0, Math.min(100, (localTimeRemaining / totalTime) * 100));
  };

  const getProgressColor = () => {
    const percentage = getProgressPercentage();
    if (percentage > 60) return '#22c55e'; // green
    if (percentage > 30) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  const getStateText = () => {
    switch (gameState) {
      case 'betting':
        return 'BETTING PERIOD';
      case 'playing':
        return 'BATTLE IN PROGRESS';
      default:
        return 'WAITING FOR BATTLE';
    }
  };

  const getTimerMessage = () => {
    if (gameState === 'betting') {
      return 'Game will start automatically when timer ends';
    }

    if (gameState === 'playing') {
      if (battleNotification && battleNotification.isVisible) {
        return 'Influence/defluence period - act before timer ends';
      } else {
        return 'Waiting for move execution...';
      }
    }

    return 'Next round will begin automatically';
  };

  // Visual states
  const isWarning = localTimeRemaining <= 30 && localTimeRemaining > 10;
  const isCritical = localTimeRemaining <= 10 && localTimeRemaining > 0;

  if (gameState === 'idle') {
    return (
      <div
        className="rounded-lg p-4 text-center"
        style={{
          background: 'linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.98) 100%)',
          border: '2px solid #4b5563',
          boxShadow: '0 4px 15px rgba(0, 0, 0, 0.4)'
        }}
      >
        <h3
          className="text-white font-bold mb-2 text-xs"
          style={{ fontFamily: 'Press Start 2P, monospace' }}
        >
          Arena Status
        </h3>
        <p className="text-gray-300 text-xs">Waiting for battle initialization...</p>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-5 text-center relative overflow-hidden"
      style={{
        background: isCritical
          ? 'linear-gradient(135deg, rgba(127, 29, 29, 0.95) 0%, rgba(69, 10, 10, 0.98) 100%)'
          : isWarning
            ? 'linear-gradient(135deg, rgba(120, 53, 15, 0.95) 0%, rgba(69, 26, 3, 0.98) 100%)'
            : 'linear-gradient(135deg, rgba(31, 41, 55, 0.95) 0%, rgba(17, 24, 39, 0.98) 100%)',
        border: `2px solid ${isCritical ? '#ef4444' : isWarning ? '#f59e0b' : '#ff8c00'}`,
        boxShadow: isCritical
          ? '0 0 30px rgba(239, 68, 68, 0.5), inset 0 0 20px rgba(239, 68, 68, 0.1)'
          : isWarning
            ? '0 0 20px rgba(245, 158, 11, 0.4), inset 0 0 15px rgba(245, 158, 11, 0.1)'
            : '0 4px 20px rgba(0, 0, 0, 0.5)',
        transition: 'background 0.5s ease, border-color 0.5s ease, box-shadow 0.5s ease'
      }}
    >
      {/* Animated background pulse for critical state */}
      {isCritical && (
        <div
          className="absolute inset-0 opacity-20 animate-pulse"
          style={{
            background: 'radial-gradient(circle, rgba(239, 68, 68, 0.3) 0%, transparent 70%)'
          }}
        />
      )}

      {/* State Label */}
      <h3
        className={`font-bold mb-4 text-xs tracking-widest relative z-10 ${
          isCritical ? 'text-red-300 animate-pulse' : isWarning ? 'text-yellow-300' : 'text-orange-300'
        }`}
        style={{ fontFamily: 'Press Start 2P, monospace' }}
      >
        {getStateText()}
      </h3>

      {/* Timer Display */}
      <div className="mb-4 relative z-10">
        <div
          className={`text-5xl font-bold mb-4 tracking-wider ${
            isCritical ? 'text-red-400 animate-pulse' : isWarning ? 'text-yellow-400' : 'text-white'
          }`}
          style={{
            fontFamily: 'Press Start 2P, monospace',
            textShadow: isCritical
              ? '0 0 20px rgba(239, 68, 68, 0.8), 0 0 40px rgba(239, 68, 68, 0.4)'
              : isWarning
                ? '0 0 15px rgba(245, 158, 11, 0.7), 0 0 30px rgba(245, 158, 11, 0.3)'
                : '0 0 10px rgba(255, 140, 0, 0.5)'
          }}
        >
          {formatTime(localTimeRemaining)}
        </div>

        {/* Progress Bar Container */}
        <div
          className="w-full rounded-full h-4 overflow-hidden relative"
          style={{
            background: 'rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)'
          }}
        >
          {/* Progress Bar Fill - smooth transition */}
          <div
            className="h-full rounded-full relative overflow-hidden"
            style={{
              width: `${getProgressPercentage()}%`,
              backgroundColor: getProgressColor(),
              boxShadow: `0 0 15px ${getProgressColor()}, inset 0 1px 0 rgba(255, 255, 255, 0.3)`,
              transition: 'width 0.3s linear, background-color 0.5s ease'
            }}
          >
            {/* Shimmer effect */}
            <div
              className="absolute inset-0 opacity-30"
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.4) 50%, transparent 100%)',
                transform: 'translateX(-100%)',
                animation: 'shimmer 2s infinite linear'
              }}
            />
          </div>
        </div>

        {/* Time markers */}
        <div
          className="flex justify-between mt-2 text-gray-500"
          style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '8px' }}
        >
          <span>0:00</span>
          <span>{formatTime(totalTime)}</span>
        </div>
      </div>

      {/* Message */}
      <p
        className={`leading-relaxed relative z-10 ${
          isCritical ? 'text-red-300' : isWarning ? 'text-yellow-300' : 'text-gray-400'
        }`}
        style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '7px' }}
      >
        {getTimerMessage()}
      </p>

      {/* Inline keyframes for shimmer animation */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(300%); }
        }
      `}</style>
    </div>
  );
};
