"use client";

import Link from 'next/link';
import Image from 'next/image';
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useState, useEffect, useCallback } from 'react';
import { parseEther } from 'viem';
import { chainsToContracts, crownTokenAbi } from '../constants';
import { useCRwNTokenMessages } from '../hooks/useCRwNTokenMessages';
import { ArbitrageOpportunityList } from '@/components/arbitrage/ArbitrageOpportunityList';
import { useDebateStats } from '@/hooks/useDebate';
import { useAgentStats } from '@/hooks/useAgents';
import { useExternalMarketStats } from '@/hooks/useExternalMarkets';
import { AnimatedCounter } from '@/components/gamification/AnimatedCounter';
import { Skeleton } from '@/components/ui/skeleton';
import { useConfetti } from '@/components/gamification/Confetti';
import { useNotifications } from '@/contexts/NotificationContext';
import { useIntersectionObserver } from '@/hooks/useIntersectionObserver';
import { useReducedMotion } from '@/hooks/useMediaQuery';
import { useKeySequence } from '@/hooks/useKeyPress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import './home-glass.css';

// Feature Hub Types & Data
interface FeatureLink {
  href: string;
  emoji: string;
  label: string;
  desc: string;
  walletGated: boolean;
  badge?: string;
}

const MARKET_FEATURES: FeatureLink[] = [
  { href: '/markets', emoji: '📊', label: 'MARKETS', desc: 'Browse all prediction markets', walletGated: false },
  { href: '/external', emoji: '🌐', label: 'EXTERNAL', desc: 'Polymarket & Kalshi feeds', walletGated: false },
  { href: '/markets/create', emoji: '➕', label: 'CREATE MARKET', desc: 'Launch your own market', walletGated: true },
  { href: '/external/arbitrage', emoji: '🎯', label: 'ARBITRAGE', desc: 'Cross-market price gaps', walletGated: false, badge: 'HOT' },
];

const AI_FEATURES: FeatureLink[] = [
  { href: '/ai-agents', emoji: '🤖', label: 'AI AGENTS', desc: 'View & manage AI traders', walletGated: false },
  { href: '/ai-agents/create', emoji: '✨', label: 'CREATE AGENT', desc: 'Deploy your own AI agent', walletGated: true },
  { href: '/prediction-arena', emoji: '⚔️', label: 'PREDICTIONS', desc: 'AI warriors debate markets', walletGated: false, badge: 'NEW' },
  { href: '/social/copy-trading', emoji: '📋', label: 'COPY TRADE', desc: 'Mirror top agent trades', walletGated: true, badge: 'NEW' },
];

const SOCIAL_FEATURES: FeatureLink[] = [
  { href: '/whale-tracker', emoji: '🐳', label: 'WHALES', desc: 'Track big wallet moves', walletGated: false, badge: 'LIVE' },
  { href: '/leaderboard', emoji: '🏆', label: 'RANKINGS', desc: 'Top traders & warriors', walletGated: false },
  { href: '/portfolio', emoji: '💰', label: 'PORTFOLIO', desc: 'Your positions & PnL', walletGated: true },
  { href: '/external/mirror-portfolio', emoji: '🪞', label: 'MIRROR', desc: 'Copy external portfolios', walletGated: true },
];

const CREATOR_FEATURES: FeatureLink[] = [
  { href: '/creator-dashboard', emoji: '🎨', label: 'CREATOR HUB', desc: 'Manage your creations', walletGated: true },
  { href: '/external/sync-history', emoji: '🔄', label: 'SYNC HISTORY', desc: 'Market sync logs', walletGated: false },
  { href: '/flow-scheduled', emoji: '⏰', label: 'SCHEDULED', desc: 'Scheduled operations', walletGated: true },
  { href: '/flow-scheduled-resolutions', emoji: '✅', label: 'RESOLUTIONS', desc: 'Market resolutions', walletGated: true },
];

const COLOR_MAP = {
  purple: {
    title: 'text-purple-400',
    bg: 'bg-purple-900/20',
    border: 'border-purple-500/30',
    hoverBg: 'hover:bg-purple-900/30',
    hoverBorder: 'hover:border-purple-400/50',
    text: 'text-purple-300',
  },
  cyan: {
    title: 'text-cyan-400',
    bg: 'bg-cyan-900/20',
    border: 'border-cyan-500/30',
    hoverBg: 'hover:bg-cyan-900/30',
    hoverBorder: 'hover:border-cyan-400/50',
    text: 'text-cyan-300',
  },
  blue: {
    title: 'text-blue-400',
    bg: 'bg-blue-900/20',
    border: 'border-blue-500/30',
    hoverBg: 'hover:bg-blue-900/30',
    hoverBorder: 'hover:border-blue-400/50',
    text: 'text-blue-300',
  },
  orange: {
    title: 'text-orange-400',
    bg: 'bg-orange-900/20',
    border: 'border-orange-500/30',
    hoverBg: 'hover:bg-orange-900/30',
    hoverBorder: 'hover:border-orange-400/50',
    text: 'text-orange-300',
  },
} as const;

// Feature Section Component
const FeatureSection = ({
  title,
  colorScheme,
  features,
  isConnected
}: {
  title: string;
  colorScheme: keyof typeof COLOR_MAP;
  features: FeatureLink[];
  isConnected: boolean;
}) => {
  const c = COLOR_MAP[colorScheme];
  return (
    <div className="mb-12 pb-8 border-b border-gray-500/10 home-section-divider last:border-b-0 last:pb-0">
      <h3
        className={`${c.title} text-sm mb-4 tracking-widest`}
        style={{fontFamily: 'Press Start 2P, monospace'}}
      >
        {title}
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {features.map((f, featureIndex) => {
          const isLocked = f.walletGated && !isConnected;
          const cardContent = (
            <div
              key={f.href}
              className={`p-4 ${c.bg} border ${c.border} rounded-xl text-center
                ${isLocked ? 'opacity-50 cursor-not-allowed' : `${c.hoverBg} ${c.hoverBorder} cursor-pointer`}
                transition-all relative`}
            >
              {f.badge && (
                <span
                  className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-white text-[6px] font-bold tracking-wider home-feature-badge animate-badge-unlock ${f.badge === 'LIVE' ? 'pulse-gold' : ''}`}
                  style={{
                    fontFamily: 'Press Start 2P, monospace',
                    background: f.badge === 'HOT' ? '#ef4444' : f.badge === 'LIVE' ? '#10b981' : '#7c3aed',
                    animationDelay: `${featureIndex * 200}ms`,
                    animationFillMode: 'both',
                  }}
                >
                  {f.badge}
                </span>
              )}
              {isLocked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center z-10 rounded-xl"
                  style={{ background: 'rgba(0,0,0,0.15)' }}
                >
                  <span className="text-lg mb-1">🔒</span>
                  <span
                    className="text-red-400 text-center home-lock-text"
                    style={{fontFamily: 'Press Start 2P, monospace', fontSize: '6px'}}
                  >
                    CONNECT WALLET
                  </span>
                </div>
              )}
              <div className="text-2xl mb-2">{f.emoji}</div>
              <span
                className={`${c.text} text-xs`}
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                {f.label}
              </span>
              <span
                className="block text-[7px] mt-1.5 text-gray-500 home-feature-desc"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                {f.desc}
              </span>
            </div>
          );

          return isLocked ? (
            <div key={f.href}>{cardContent}</div>
          ) : (
            <Link key={f.href} href={f.href}>{cardContent}</Link>
          );
        })}
      </div>
    </div>
  );
};

// Token Exchange Card Component
const TokenExchangeCard = ({ 
  title, 
  description, 
  icon,
  fromToken, 
  toToken, 
  rate, 
  type 
}: {
  title: string;
  description: string;
  icon: string;
  fromToken: string;
  toToken: string;
  rate: string;
  type: 'mint' | 'burn';
}) => {
  const [amount, setAmount] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const { address, chainId } = useAccount();
  const { trigger: triggerConfetti, ConfettiComponent } = useConfetti();
  const { success: notifySuccess } = useNotifications();

  const { writeContract, data: hash } = useWriteContract();
  
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash,
  });

  // CRwN token messages for engaging user experience
  const { showMessage } = useCRwNTokenMessages({
    isMinting: type === 'mint' && isLoading,
    mintSuccess: type === 'mint' && isConfirmed,
    isBurning: type === 'burn' && isLoading,
    burnSuccess: type === 'burn' && isConfirmed,
    transactionPending: isConfirming,
    transactionConfirmed: isConfirmed,
    amount: amount,
    operation: type
  });

  // Get contract address for current chain
  const contractAddress = chainId ? chainsToContracts[chainId]?.crownToken : undefined;

  const handleExchange = async () => {
    if (!amount || parseFloat(amount) <= 0 || !contractAddress || !address) return;
    
    setIsLoading(true);
    
    // Trigger warrior message for transaction start
    showMessage({
      id: `${type}_start`,
      text: type === 'mint' 
        ? `By the royal mint! Thy ${amount} FLOW shall be transformed into precious CRwN tokens!`
        : `The fires of conversion ignite! Thy ${amount} CRwN tokens shall return to pure FLOW!`,
      duration: 4000
    });
    
    try {
      const amountInWei = parseEther(amount);
      
      if (type === 'mint') {
        // Call mint function with value
        writeContract({
          address: contractAddress as `0x${string}`,
          abi: crownTokenAbi,
          functionName: 'mint',
          args: [amountInWei],
          value: amountInWei, // Send ETH/FLOW equivalent to mint amount
        });
      } else {
        // Call burn function
        writeContract({
          address: contractAddress as `0x${string}`,
          abi: crownTokenAbi,
          functionName: 'burn',
          args: [amountInWei],
        });
      }
    } catch (error) {
      console.error('Transaction failed:', error);
      setIsLoading(false);
    }
  };

  // Reset loading state when transaction is confirmed or fails
  useEffect(() => {
    if (isConfirmed || (!isConfirming && hash)) {
      setIsLoading(false);
      if (isConfirmed) {
        triggerConfetti('medium');
        notifySuccess(
          type === 'mint' ? 'CRwN MINTED!' : 'CRwN BURNED!',
          `${amount} tokens ${type === 'mint' ? 'minted' : 'burned'} successfully`
        );
        setAmount('');
        setSuccessMessage(`Successfully ${type === 'mint' ? 'minted' : 'burned'} ${amount} ${type === 'mint' ? 'CRwN' : 'CRwN'} tokens!`);
        // Clear success message after 5 seconds
        setTimeout(() => setSuccessMessage(''), 5000);
      }
    }
  }, [isConfirmed, isConfirming, hash, amount, type]);

  const cardColor = type === 'mint' ? 'border-green-500' : 'border-red-500';
  const buttonColor = type === 'mint' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700';
  const isTransactionPending = isLoading || isConfirming;

  return (
    <div className="relative">
      {ConfettiComponent}
      <div
        className={`arcade-card p-6 ${cardColor} group home-token-card ${type === 'mint' ? 'home-token-mint-shimmer' : 'home-token-burn-shimmer'}`}
        style={{
          background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%) !important',
        border: type === 'mint' ? '3px solid #38a169 !important' : '3px solid #e53e3e !important',
        backdropFilter: 'blur(20px) !important',
        WebkitBackdropFilter: 'blur(20px) !important',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(45, 90, 39, 0.2) !important',
        borderRadius: '16px !important',
        borderImage: 'none !important'
      }}
    >
      <div className="text-center mb-6">
        <div className="mb-4">
          <span className="text-4xl filter drop-shadow-lg">{icon}</span>
        </div>
        <h3 
          className="text-xl text-yellow-400 mb-2 tracking-wider arcade-glow"
          style={{fontFamily: 'Press Start 2P, monospace'}}
        >
          {title}
        </h3>
        <p 
          className="text-gray-300 text-xs"
          style={{fontFamily: 'Press Start 2P, monospace'}}
        >
          {description}
        </p>
      </div>

      <div className="space-y-4">
        {/* Exchange Rate */}
        <div className="bg-stone-800 p-3 rounded border border-yellow-600">
          <div className="flex justify-between items-center">
            <span className="text-gray-400 text-xs">EXCHANGE RATE</span>
            <span className="text-yellow-400 text-sm font-bold">{rate}</span>
          </div>
        </div>

        {/* Input Section */}
        <div className="space-y-3">
          <div>
            <label className="block text-yellow-300 text-xs mb-2">
              AMOUNT TO {type === 'mint' ? 'CONVERT' : 'BURN'}
            </label>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full p-3 bg-stone-800 border border-yellow-600 rounded text-white text-center text-lg"
                placeholder="0.0"
                step="0.01"
                min="0"
              />
              <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-yellow-400 text-sm">
                {fromToken}
              </span>
            </div>
          </div>

          {/* Conversion Display */}
          {amount && parseFloat(amount) > 0 && (
            <div className="bg-stone-700 p-3 rounded border border-gray-600">
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-xs">YOU WILL RECEIVE</span>
                <span className="text-green-400 text-sm font-bold">
                  {amount} {toToken}
                </span>
              </div>
            </div>
          )}

          {/* Exchange Button */}
          <button
            onClick={handleExchange}
            disabled={!amount || parseFloat(amount) <= 0 || isTransactionPending}
            className={`w-full py-3 px-4 rounded text-white font-bold text-sm transition-all duration-200 ${buttonColor} disabled:opacity-50 disabled:cursor-not-allowed`}
            style={{
              fontFamily: 'Press Start 2P, monospace',
              borderRadius: '12px !important'
            }}
          >
            {isConfirming ? 'CONFIRMING...' : isLoading ? 'PROCESSING...' : `${type === 'mint' ? 'MINT' : 'BURN'}`}
          </button>

          {/* Success Message */}
          {successMessage && (
            <div className="bg-green-800 border border-green-600 p-3 rounded mt-2 animate-pulse">
              <p className="text-green-200 text-xs text-center" style={{fontFamily: 'Press Start 2P, monospace'}}>
                {successMessage}
              </p>
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default function HomePage() {
  const { isConnected } = useAccount();
  const [isMounted, setIsMounted] = useState(false);
  const { totalDebatesNumber, loading: debateLoading } = useDebateStats();
  const { totalAgentsNumber, loading: agentLoading } = useAgentStats();
  const { stats: marketStats, loading: marketLoading } = useExternalMarketStats();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  // Scroll-triggered section reveals
  const [statsRef, statsVisible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.2, once: true });
  const [heroRef, heroVisible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.1, once: true });
  const [predictionRef, predictionVisible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.2, once: true });
  const [tokenRef, tokenVisible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.1, once: true });
  const [arbitrageRef, arbitrageVisible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.1, once: true });
  const [commandRef, commandVisible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.1, once: true });
  const [howRef, howVisible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.2, once: true });
  const [ctaRef, ctaVisible] = useIntersectionObserver<HTMLDivElement>({ threshold: 0.2, once: true });

  // Konami code easter egg
  const { trigger: triggerKonamiConfetti, ConfettiComponent: KonamiConfetti } = useConfetti();
  const { success: konamiNotify } = useNotifications();
  useKeySequence(
    ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'],
    () => {
      triggerKonamiConfetti('high');
      konamiNotify('KONAMI CODE ACTIVATED! You found the secret!');
    }
  );

  // Prevent hydration mismatch by waiting for client-side mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Track scroll progress (skip for reduced motion)
  useEffect(() => {
    if (prefersReducedMotion) return;
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
      setScrollProgress(progress);
      setShowScrollTop(scrollTop > 400);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [prefersReducedMotion]);

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const playSound = useCallback(() => {
    try {
      const audio = new Audio('/sounds/click.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch { /* ignore */ }
  }, []);

  return (
    <div className="home-page min-h-screen relative overflow-hidden">
      {/* Scroll Progress Bar */}
      <div
        className="fixed top-0 left-0 h-[3px] z-50 home-scroll-progress"
        role="progressbar"
        aria-valuenow={Math.round(scrollProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Page scroll progress"
        style={{
          width: `${scrollProgress}%`,
          background: 'linear-gradient(90deg, #2d5a27, #ffd700, #ef4444)',
          transition: 'width 0.1s linear',
        }}
      />

      {/* Konami Code Confetti */}
      {KonamiConfetti}

      {/* Scroll to Top Button */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-8 right-8 z-40 w-12 h-12 rounded-full flex items-center justify-center
                     transition-all duration-300 hover:scale-110 animate-fade-in home-scroll-top-btn"
          style={{
            background: 'linear-gradient(135deg, #2d5a27, #38a169)',
            border: '2px solid rgba(45, 90, 39, 0.6)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2), 0 0 8px rgba(45, 90, 39, 0.3)',
          }}
          aria-label="Scroll to top"
        >
          <span className="text-white text-lg" style={{ fontFamily: 'Press Start 2P, monospace' }}>↑</span>
        </button>
      )}

      {/* Background Image */}
      <div className="fixed inset-0 -z-10">
        <Image
          src="/Home.png"
          alt="Home Background"
          fill
          className="object-cover"
          priority
        />
        {/* Very subtle black overlay to darken background */}
        <div 
          className="absolute inset-0"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.175)',
            zIndex: 1
          }}
        ></div>
      </div>
      
      {/* Epic Background Elements */}
      <div className="absolute inset-0 pointer-events-none">

        {/* Geometric Battle Lines with subtle parallax */}
        <div
          className="absolute top-1/4 left-0 w-full h-1 bg-gradient-to-r from-transparent via-yellow-600 to-transparent opacity-30"
          style={{ transform: prefersReducedMotion ? 'none' : `translateY(${scrollProgress * 0.15}px)` }}
        ></div>
        <div
          className="absolute bottom-1/4 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-600 to-transparent opacity-30"
          style={{ transform: prefersReducedMotion ? 'none' : `translateY(${-scrollProgress * 0.15}px)` }}
        ></div>
      </div>

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-6 py-16">
        {/* Epic Title Section */}
        <div className="text-center mb-20">
          <h1
            className={`text-6xl md:text-6xl text-red-400 mb-4 tracking-widest arcade-glow ${prefersReducedMotion ? '' : 'home-typewriter'}`}
            style={{
              fontFamily: 'Press Start 2P, monospace'
            }}
          >
            Warriors AI-rena
          </h1>
          <p
            className={`text-sm md:text-base text-gray-400 tracking-[0.3em] home-tagline ${prefersReducedMotion ? '' : 'animate-fade-in'}`}
            style={{ fontFamily: 'Press Start 2P, monospace', animationDelay: prefersReducedMotion ? '0s' : '1.8s', opacity: prefersReducedMotion ? 1 : undefined }}
          >
            AI-POWERED BLOCKCHAIN BATTLE ARENA
          </p>

          {/* Floating Sparkles — hidden for reduced motion */}
          {!prefersReducedMotion && (
            <div className="relative h-0 -mt-16 pointer-events-none" aria-hidden="true">
              {[
                { left: '15%', delay: '0s', size: 6 },
                { left: '30%', delay: '0.5s', size: 4 },
                { left: '55%', delay: '1s', size: 5 },
                { left: '70%', delay: '0.3s', size: 4 },
                { left: '85%', delay: '0.8s', size: 6 },
              ].map((s, i) => (
                <span
                  key={i}
                  className="absolute animate-sparkle home-sparkle"
                  style={{
                    left: s.left,
                    top: `${-20 - i * 8}px`,
                    width: `${s.size}px`,
                    height: `${s.size}px`,
                    animationDelay: s.delay,
                    borderRadius: '50%',
                    background: 'rgba(255, 215, 0, 0.6)',
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Live Stats Bar */}
        <div ref={statsRef} aria-label="Platform statistics" className={`max-w-4xl mx-auto mb-12 transition-all duration-700 ease-out ${statsVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="home-stat-card stat-card text-center hover:scale-105 transition-all duration-200 cursor-default">
                <div className="home-stat-value stat-card-value">
                  {agentLoading ? (
                    <Skeleton width={48} height={24} rounded="md" className="mx-auto" />
                  ) : (
                    <AnimatedCounter value={totalAgentsNumber} decimals={0} duration={800} size="lg" showDirection={false} className="home-stat-value" />
                  )}
                </div>
                <p className="home-stat-label stat-card-label"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >AI AGENTS</p>
              </div>
              <div className="home-stat-card stat-card text-center hover:scale-105 transition-all duration-200 cursor-default">
                <div className="home-stat-value stat-card-value">
                  {debateLoading ? (
                    <Skeleton width={48} height={24} rounded="md" className="mx-auto" />
                  ) : (
                    <AnimatedCounter value={totalDebatesNumber} decimals={0} duration={800} size="lg" showDirection={false} className="home-stat-value" />
                  )}
                </div>
                <p className="home-stat-label stat-card-label"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >DEBATES</p>
              </div>
              <div className="home-stat-card stat-card text-center hover:scale-105 transition-all duration-200 cursor-default">
                <div className="home-stat-value stat-card-value">
                  {marketLoading ? (
                    <Skeleton width={48} height={24} rounded="md" className="mx-auto" />
                  ) : (
                    <AnimatedCounter value={marketStats?.totalMarkets ?? 0} decimals={0} duration={800} size="lg" showDirection={false} className="home-stat-value" />
                  )}
                </div>
                <p className="home-stat-label stat-card-label"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >MARKETS</p>
              </div>
              <div className="home-stat-card stat-card text-center hover:scale-105 transition-all duration-200 cursor-default">
                <div className="home-stat-value stat-card-value">
                  {marketLoading ? (
                    <Skeleton width={48} height={24} rounded="md" className="mx-auto" />
                  ) : (
                    <AnimatedCounter value={marketStats?.activeCount ?? 0} decimals={0} duration={800} size="lg" showDirection={false} className="home-stat-value" />
                  )}
                </div>
                <p className="home-stat-label stat-card-label"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >ACTIVE <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse ml-1"></span></p>
              </div>
            </div>
          </div>

        {/* Wallet Connection Warning */}
        {isMounted && !isConnected && (
          <div className="max-w-4xl mx-auto mb-12 animate-slide-up" role="alert">
            <div
              className="arcade-card p-8 border-red-600 bg-red-900/20 home-wallet-warning"
              style={{
                background: 'radial-gradient(circle at top left, rgba(255, 182, 193, 0.2), rgba(255, 160, 160, 0.15) 50%), linear-gradient(135deg, rgba(255, 182, 193, 0.25) 0%, rgba(255, 160, 160, 0.2) 30%, rgba(255, 182, 193, 0.25) 100%)',
                border: '3px solid #e53e3e',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(229, 62, 62, 0.2)',
                borderRadius: '16px'
              }}
            >
              <div className="text-center">
                <div className="mb-4">
                  <span className="text-4xl animate-pulse-slow">🔒</span>
                </div>
                <h2 
                  className="text-2xl text-red-400 mb-4 tracking-wider arcade-glow"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  WALLET CONNECTION REQUIRED
                </h2>
                <p 
                  className="text-red-200 text-sm leading-relaxed mb-4"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  TO ENTER THE BATTLEFIELD AND ACCESS ALL FEATURES
                </p>
                <p 
                  className="text-red-300 text-xs"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  CONNECT YOUR WALLET TO PROCEED
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Epic Game Mode Arena */}
        <div ref={heroRef} className={`grid grid-cols-1 md:grid-cols-2 gap-10 max-w-6xl mx-auto transition-all duration-700 ease-out ${heroVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          
          {/* WarriorsNFT Minter - The Forge */}
          {isMounted && isConnected ? (
            <Link href="/warriorsMinter" aria-label="Warriors Forge - Mint and manage NFT warriors">
              <div 
                className="arcade-card p-8 group cursor-pointer relative overflow-hidden flex flex-col justify-end min-h-[400px] hover:scale-105 transition-transform duration-200 home-hero-card"
                style={{
                  background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                  border: '3px solid #2d5a27 !important',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(45, 90, 39, 0.2)',
                  borderRadius: '16px !important',
                  borderImage: 'none !important',
                  padding: '2rem',
                }}
                onClick={() => playSound()}
              >
                <Image
                  src="/WarriorsNFT_landing.png"
                  alt="WarriorsNFT Minter Background"
                  fill
                  className="object-cover object-center absolute inset-0 -z-10"
                  style={{borderRadius: '16px', objectFit: 'cover', objectPosition: 'center'}}
                  priority
                />
                <div
                  className="absolute inset-0 z-0"
                  style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)',
                    borderRadius: '16px',
                  }}
                />
                <div className="text-center relative z-10">
                  <h2
                    className="text-xl md:text-2xl text-yellow-400 mb-2 tracking-wider home-hero-title"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    WARRIORS FORGE
                  </h2>
                  <p
                    className="text-gray-300 text-xs home-hero-subtitle"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    MINT & MANAGE YOUR NFT WARRIORS
                  </p>
                </div>
              </div>
            </Link>
          ) : (
            <div 
              className="arcade-card p-8 group cursor-not-allowed relative overflow-hidden flex flex-col justify-end min-h-[400px] opacity-50"
              style={{
                background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                border: '3px solid #2d5a27 !important',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(45, 90, 39, 0.2)',
                borderRadius: '16px !important',
                borderImage: 'none !important',
                padding: '2rem',
              }}
            >
              <Image
                src="/WarriorsNFT_landing.png"
                alt="WarriorsNFT Minter Background"
                fill
                className="object-cover object-center absolute inset-0 -z-10 opacity-70"
                style={{borderRadius: '16px', objectFit: 'cover', objectPosition: 'center'}}
                priority
              />
              <div
                className="absolute inset-0 z-0"
                style={{
                  background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)',
                  borderRadius: '16px',
                }}
              />
              <div className="text-center relative z-10">
                <h2
                  className="text-xl md:text-2xl text-yellow-400 mb-2 tracking-wider home-hero-title"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  WARRIORS FORGE
                </h2>
                <p
                  className="text-gray-300 text-xs mb-3 home-hero-subtitle"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  MINT & MANAGE YOUR NFT WARRIORS
                </p>
                <div
                  className="text-red-400 text-sm tracking-wide"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  WALLET REQUIRED
                </div>
              </div>
            </div>
          )}
          {/* Arena - The Arena */}
          {isMounted && isConnected ? (
            <a href="/arena" aria-label="Battle Arena - Enter the battlefield">
              <div 
                className="arcade-card p-8 group cursor-pointer relative overflow-hidden flex flex-col justify-end min-h-[400px] hover:scale-105 transition-transform duration-200 home-hero-card"
                style={{
                  background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                  border: '3px solid #2d5a27 !important',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(45, 90, 39, 0.2)',
                  borderRadius: '16px !important',
                  borderImage: 'none !important',
                  padding: '2rem',
                }}
                onClick={() => playSound()}
              >
                <Image
                  src="/Arena_landing.png"
                  alt="Arena Background"
                  fill
                  className="object-cover object-center absolute inset-0 -z-10"
                  style={{borderRadius: '16px', objectFit: 'cover', objectPosition: 'center'}}
                  priority
                />
                <div
                  className="absolute inset-0 z-0"
                  style={{
                    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)',
                    borderRadius: '16px',
                  }}
                />
                <div className="text-center relative z-10">
                  <h2
                    className="text-xl md:text-2xl text-yellow-400 mb-2 tracking-wider home-hero-title"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    BATTLE ARENA
                  </h2>
                  <p
                    className="text-gray-300 text-xs home-hero-subtitle"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    ENTER THE BATTLEFIELD
                  </p>
                </div>
              </div>
            </a>
          ) : (
            <div 
              className="arcade-card p-8 group cursor-not-allowed relative overflow-hidden flex flex-col justify-end min-h-[400px] opacity-50"
              style={{
                background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                border: '3px solid #2d5a27 !important',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(45, 90, 39, 0.2)',
                borderRadius: '16px !important',
                borderImage: 'none !important',
                padding: '2rem',
              }}
            >
              <Image
                src="/Arena_landing.png"
                alt="Arena Background"
                fill
                className="object-cover object-center absolute inset-0 -z-10 opacity-70"
                style={{borderRadius: '16px', objectFit: 'cover', objectPosition: 'center'}}
                priority
              />
              <div
                className="absolute inset-0 z-0"
                style={{
                  background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 40%, transparent 70%)',
                  borderRadius: '16px',
                }}
              />
              <div className="text-center relative z-10">
                <h2
                  className="text-xl md:text-2xl text-yellow-400 mb-2 tracking-wider home-hero-title"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  BATTLE ARENA
                </h2>
                <p
                  className="text-gray-300 text-xs mb-3 home-hero-subtitle"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  ENTER THE BATTLEFIELD
                </p>
                <div
                  className="text-red-400 text-sm tracking-wide"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  WALLET REQUIRED
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Prediction Arena Spotlight */}
        <div ref={predictionRef} className={`mt-16 max-w-4xl mx-auto transition-all duration-700 ease-out ${predictionVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <Link href="/prediction-arena" aria-label="Prediction Arena - AI warriors debate real markets">
              <div
                className="prediction-arena-spotlight p-6 md:p-8 group cursor-pointer hover:scale-[1.02] transition-transform duration-200"
                style={{
                  background: 'radial-gradient(circle at top left, rgba(168, 85, 247, 0.15), rgba(139, 92, 246, 0.1) 50%), linear-gradient(135deg, rgba(168, 85, 247, 0.2) 0%, rgba(139, 92, 246, 0.15) 30%, rgba(168, 85, 247, 0.2) 100%)',
                  border: '3px solid rgba(168, 85, 247, 0.5)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  borderRadius: '16px',
                  borderImage: 'none',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), 0 0 8px rgba(168, 85, 247, 0.2)',
                }}
              >
                <div className="flex flex-col md:flex-row items-center gap-6">
                  <div className="text-5xl"><span className="home-prediction-sword">&#x2694;&#xFE0F;</span></div>
                  <div className="flex-1 text-center md:text-left">
                    <h2
                      className="text-xl md:text-2xl text-purple-400 mb-2 tracking-wider arcade-glow"
                      style={{fontFamily: 'Press Start 2P, monospace'}}
                    >
                      PREDICTION ARENA
                    </h2>
                    <p
                      className="text-gray-300 text-xs leading-relaxed"
                      style={{fontFamily: 'Press Start 2P, monospace'}}
                    >
                      WARRIORS DEBATE REAL MARKETS. TRAITS INFLUENCE BATTLES. STAKES GO TO THE VICTOR.
                    </p>
                  </div>
                  <div
                    className="text-purple-400 text-2xl group-hover:translate-x-1 transition-transform"
                    style={{fontFamily: 'Press Start 2P, monospace'}}
                  >
                    &#x2192;
                  </div>
                </div>
              </div>
            </Link>
          </div>

        {/* Token Exchange Section */}
        {isMounted && isConnected && (
          <div ref={tokenRef} className={`mt-20 max-w-4xl mx-auto transition-all duration-700 ease-out ${tokenVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="text-center mb-8">
              <h2
                className="text-3xl mb-4 tracking-wider arcade-glow home-gradient-text"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                TOKEN EXCHANGE
              </h2>

            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Mint CRwN Tokens */}
              <TokenExchangeCard 
                title="MINT CRwN"
                description="CONVERT FLOW TO CRwN"
                icon="⚡"
                fromToken="FLOW"
                toToken="CRwN"
                rate="1:1"
                type="mint"
              />

              {/* Burn CRwN Tokens */}
              <TokenExchangeCard 
                title="BURN CRwN"
                description="CONVERT CRwN TO FLOW"
                icon="🔥"
                fromToken="CRwN"
                toToken="FLOW"
                rate="1:1"
                type="burn"
              />
            </div>
          </div>
        )}

        {/* Arbitrage Opportunities Section */}
        <div ref={arbitrageRef} className={`mt-20 max-w-6xl mx-auto transition-all duration-700 ease-out ${arbitrageVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="text-center mb-8">
              <h2
                className="text-3xl mb-4 tracking-wider arcade-glow home-gradient-text"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                💰 ARBITRAGE OPPORTUNITIES
              </h2>
              <p className="text-gray-400 text-sm">
                Cross-market price differences - Exploit inefficiencies for profit
              </p>
            </div>
            <ArbitrageOpportunityList
              maxItems={3}
              showControls={false}
              compact={true}
            />
            <div className="text-center mt-6">
              <Link
                href="/external/arbitrage"
                className="inline-block px-6 py-3 bg-green-600/20 hover:bg-green-600/30
                           border-2 border-green-500/50 text-green-400 rounded-lg
                           transition-all hover:border-green-400"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                VIEW ALL →
              </Link>
            </div>
          </div>

        {/* Command Center Feature Hub */}
        <div ref={commandRef} className={`mt-20 max-w-5xl mx-auto transition-all duration-700 ease-out ${commandVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div className="text-center mb-10">
              <h2
                className="text-2xl mb-2 tracking-wider arcade-glow home-gradient-text"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                COMMAND CENTER
              </h2>
              <p
                className="text-gray-400 text-xs"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                ALL FEATURES AT YOUR FINGERTIPS
              </p>
            </div>
            <Tabs defaultValue="markets" className="w-full">
              <TabsList className="w-full grid grid-cols-4 mb-8 home-tab-list">
                <TabsTrigger value="markets">MARKETS</TabsTrigger>
                <TabsTrigger value="ai">AI</TabsTrigger>
                <TabsTrigger value="social">SOCIAL</TabsTrigger>
                <TabsTrigger value="creator">CREATOR</TabsTrigger>
              </TabsList>
              <TabsContent value="markets">
                <FeatureSection title="MARKETS & TRADING" colorScheme="purple" features={MARKET_FEATURES} isConnected={isMounted && isConnected} />
              </TabsContent>
              <TabsContent value="ai">
                <FeatureSection title="AI & AUTOMATION" colorScheme="cyan" features={AI_FEATURES} isConnected={isMounted && isConnected} />
              </TabsContent>
              <TabsContent value="social">
                <FeatureSection title="SOCIAL & INTEL" colorScheme="blue" features={SOCIAL_FEATURES} isConnected={isMounted && isConnected} />
              </TabsContent>
              <TabsContent value="creator">
                <FeatureSection title="CREATOR & OPS" colorScheme="orange" features={CREATOR_FEATURES} isConnected={isMounted && isConnected} />
              </TabsContent>
            </Tabs>
          </div>

        {/* How It Works */}
        <div ref={howRef} className={`mt-20 max-w-5xl mx-auto transition-all duration-700 ease-out ${howVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div
              className="p-6 md:p-8 rounded-2xl"
              style={{
                background: 'radial-gradient(circle at top left, rgba(120, 160, 200, 0.15), rgba(100, 140, 180, 0.1) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                border: '3px solid rgba(45, 90, 39, 0.3)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '16px',
              }}
            >
              <h2
                className="text-xl md:text-2xl mb-8 tracking-wider arcade-glow text-center home-gradient-text"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                HOW IT WORKS
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
                {[
                  { step: '1', emoji: '🔗', title: 'CONNECT', desc: 'Link your wallet to enter the arena' },
                  { step: '2', emoji: '⚒️', title: 'MINT', desc: 'Forge unique NFT warriors with traits' },
                  { step: '3', emoji: '⚔️', title: 'BATTLE', desc: 'Predict, debate, and fight in the arena' },
                  { step: '4', emoji: '👑', title: 'WIN CRwN', desc: 'Earn tokens from victories' },
                ].map((item, index) => (
                  <div
                    key={item.step}
                    className="text-center relative"
                  >
                    {/* Connector arrow (hidden on mobile, visible md+) */}
                    {index < 3 && (
                      <div
                        className="hidden md:block absolute top-7 -right-5 text-purple-400/40 home-step-connector"
                        style={{ fontFamily: 'Press Start 2P, monospace', fontSize: '10px' }}
                      >
                        →
                      </div>
                    )}
                    <div className="relative inline-block">
                      <div
                        className="w-14 h-14 md:w-16 md:h-16 mx-auto mb-4 rounded-full flex items-center justify-center text-2xl md:text-3xl home-how-step-circle"
                        style={{
                          background: 'rgba(124, 58, 237, 0.15)',
                          border: '2px solid rgba(124, 58, 237, 0.3)',
                        }}
                      >
                        {item.emoji}
                      </div>
                      {/* Step number badge */}
                      <span
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[8px] text-white font-bold home-step-badge"
                        style={{
                          background: 'rgba(124, 58, 237, 0.8)',
                          fontFamily: 'Press Start 2P, monospace',
                        }}
                      >
                        {item.step}
                      </span>
                    </div>
                    <h3
                      className="text-sm text-yellow-400 mb-2 tracking-wider home-how-title"
                      style={{fontFamily: 'Press Start 2P, monospace'}}
                    >
                      {item.title}
                    </h3>
                    <p
                      className="text-gray-400 text-xs home-how-desc"
                      style={{fontFamily: 'Press Start 2P, monospace'}}
                    >
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

        {/* Bottom CTA */}
        <div ref={ctaRef} className={`mt-16 mb-8 max-w-3xl mx-auto text-center transition-all duration-700 ease-out ${ctaVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
            <div
              className="p-8 md:p-12 rounded-2xl"
              style={{
                background: 'radial-gradient(circle at top left, rgba(220, 38, 38, 0.1), rgba(185, 28, 28, 0.05) 50%), linear-gradient(135deg, rgba(120, 160, 200, 0.2) 0%, rgba(100, 140, 180, 0.15) 30%, rgba(120, 160, 200, 0.2) 100%)',
                border: '3px solid rgba(197, 48, 48, 0.3)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '16px',
              }}
            >
              <div className="text-4xl mb-4">⚔️</div>
              <h2
                className="text-2xl md:text-3xl text-red-400 mb-4 tracking-wider arcade-glow home-cta-title"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                READY FOR BATTLE?
              </h2>
              <p
                className="text-gray-400 text-sm mb-8 max-w-lg mx-auto home-cta-subtitle"
                style={{fontFamily: 'Press Start 2P, monospace'}}
              >
                {isConnected
                  ? 'YOUR WARRIORS AWAIT. ENTER THE ARENA NOW.'
                  : 'CONNECT YOUR WALLET TO BEGIN YOUR CONQUEST.'}
              </p>
              {isConnected ? (
                <Link
                  href="/arena"
                  aria-label="Enter the Battle Arena"
                  className="inline-block px-8 py-4 rounded-xl text-white font-bold transition-all hover:scale-105"
                  style={{
                    fontFamily: 'Press Start 2P, monospace',
                    background: 'linear-gradient(135deg, #dc2626, #ef4444)',
                    border: '2px solid #f87171',
                    borderRadius: '12px',
                    boxShadow: '0 0 12px rgba(220, 38, 38, 0.3)',
                  }}
                  onClick={() => playSound()}
                >
                  ENTER ARENA
                </Link>
              ) : (
                <p
                  className="text-red-400 text-xs"
                  style={{fontFamily: 'Press Start 2P, monospace'}}
                >
                  USE THE CONNECT BUTTON IN THE HEADER
                </p>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}