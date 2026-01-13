'use client';

/**
 * Confetti celebration component
 */

import React, { useEffect, useState, useMemo } from 'react';

interface ConfettiProps {
  active: boolean;
  intensity?: 'low' | 'medium' | 'high';
  duration?: number;
  className?: string;
}

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  size: number;
  rotation: number;
  delay: number;
  duration: number;
  shape: 'square' | 'circle' | 'triangle';
}

const COLORS = [
  '#FFD700', // Gold
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#9B59B6', // Purple
  '#3498DB', // Blue
  '#2ECC71', // Green
  '#F39C12', // Orange
  '#E74C3C', // Crimson
  '#1ABC9C', // Turquoise
  '#FF69B4', // Hot Pink
];

const INTENSITY_CONFIG = {
  low: { count: 30, duration: 2000 },
  medium: { count: 60, duration: 3000 },
  high: { count: 100, duration: 4000 },
};

export function Confetti({
  active,
  intensity = 'medium',
  duration: customDuration,
  className = '',
}: ConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);

  const config = INTENSITY_CONFIG[intensity];
  const effectDuration = customDuration ?? config.duration;

  // Generate confetti pieces when activated
  useEffect(() => {
    if (!active) {
      setPieces([]);
      return;
    }

    const newPieces: ConfettiPiece[] = [];

    for (let i = 0; i < config.count; i++) {
      newPieces.push({
        id: i,
        x: Math.random() * 100, // % position
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: 8 + Math.random() * 8, // 8-16px
        rotation: Math.random() * 360,
        delay: Math.random() * 500, // Stagger start
        duration: 1500 + Math.random() * 1500, // 1.5-3s fall time
        shape: ['square', 'circle', 'triangle'][Math.floor(Math.random() * 3)] as 'square' | 'circle' | 'triangle',
      });
    }

    setPieces(newPieces);

    // Clear after duration
    const timer = setTimeout(() => {
      setPieces([]);
    }, effectDuration + 2000); // Extra time for pieces to fall off screen

    return () => clearTimeout(timer);
  }, [active, config.count, effectDuration]);

  if (!active && pieces.length === 0) return null;

  return (
    <div
      className={`fixed inset-0 pointer-events-none overflow-hidden z-50 ${className}`}
      aria-hidden="true"
    >
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${piece.x}%`,
            top: '-20px',
            animationDelay: `${piece.delay}ms`,
            animationDuration: `${piece.duration}ms`,
          }}
        >
          <ConfettiShape
            shape={piece.shape}
            color={piece.color}
            size={piece.size}
            rotation={piece.rotation}
          />
        </div>
      ))}
    </div>
  );
}

interface ConfettiShapeProps {
  shape: 'square' | 'circle' | 'triangle';
  color: string;
  size: number;
  rotation: number;
}

function ConfettiShape({ shape, color, size, rotation }: ConfettiShapeProps) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
    backgroundColor: shape !== 'triangle' ? color : 'transparent',
    transform: `rotate(${rotation}deg)`,
  };

  if (shape === 'circle') {
    return (
      <div
        className="animate-confetti-spin"
        style={{
          ...style,
          borderRadius: '50%',
        }}
      />
    );
  }

  if (shape === 'triangle') {
    return (
      <div
        className="animate-confetti-spin"
        style={{
          width: 0,
          height: 0,
          borderLeft: `${size / 2}px solid transparent`,
          borderRight: `${size / 2}px solid transparent`,
          borderBottom: `${size}px solid ${color}`,
          transform: `rotate(${rotation}deg)`,
        }}
      />
    );
  }

  // Square (default)
  return (
    <div
      className="animate-confetti-spin"
      style={style}
    />
  );
}

/**
 * Hook to manage confetti state
 */
export function useConfetti() {
  const [showConfetti, setShowConfetti] = useState(false);
  const [intensity, setIntensity] = useState<'low' | 'medium' | 'high'>('medium');

  const trigger = (newIntensity: 'low' | 'medium' | 'high' = 'medium') => {
    setIntensity(newIntensity);
    setShowConfetti(true);

    const duration = INTENSITY_CONFIG[newIntensity].duration;
    setTimeout(() => setShowConfetti(false), duration);
  };

  return {
    showConfetti,
    intensity,
    trigger,
    ConfettiComponent: (
      <Confetti active={showConfetti} intensity={intensity} />
    ),
  };
}
