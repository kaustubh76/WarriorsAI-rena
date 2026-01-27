"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount, useReadContract, useEnsName } from "wagmi"
import { useState, useEffect, useCallback } from "react"
import { chainsToContracts, crownTokenAbi, getZeroGChainId } from "../constants"
import { formatEther } from "viem"
import { ZeroGStatusCompact } from "@/components/0g/ZeroGStatusCompact"
import { CompactStreak } from "@/components/gamification/StreakIndicator"
import { CompactQuestIndicator } from "@/components/gamification/DailyQuestPanel"
import { useGamificationContext } from "@/contexts/GamificationContext"
import { usePathname } from "next/navigation"
import { WhaleAlertBadge } from "@/components/whale/WhaleAlertBadge"
import { WhaleAlertDropdown } from "@/components/whale/WhaleAlertDropdown"
import { useWhaleAlertBadge } from "@/hooks/useWhaleAlertBadge"

// Chain type indicator
const ZEROG_CHAIN_ID = getZeroGChainId(); // 16602
const FLOW_TESTNET_ID = 545;

// Navigation links configuration
type NavLink = {
  href: string;
  label: string;
  hoverColor: string;
  submenu?: { href: string; label: string; icon?: string }[];
};

const NAV_LINKS: NavLink[] = [
  { href: "/arena", label: "Arena", hoverColor: "hover:text-red-400" },
  { href: "/markets", label: "Markets", hoverColor: "hover:text-red-400" },
  { href: "/ai-agents", label: "AI Agents", hoverColor: "hover:text-purple-400" },
  { href: "/leaderboard", label: "Leaderboard", hoverColor: "hover:text-red-400" },
  { href: "/social/copy-trading", label: "Copy Trade", hoverColor: "hover:text-purple-400" },
  { href: "/portfolio", label: "Portfolio", hoverColor: "hover:text-blue-400" },
  {
    href: "/external",
    label: "External",
    hoverColor: "hover:text-yellow-400",
    submenu: [
      { href: "/external", label: "All Markets", icon: "🌐" },
      { href: "/external/arbitrage", label: "Arbitrage", icon: "🎯" },
      { href: "/external/mirror-portfolio", label: "Mirror Portfolio", icon: "🪞" },
      { href: "/external/sync-history", label: "Sync History", icon: "📊" },
    ]
  },
  { href: "/creator-dashboard", label: "Creator", hoverColor: "hover:text-green-400" },
  { href: "/warriorsMinter", label: "Mint", hoverColor: "hover:text-red-400" },
];

// Hamburger icon component
const HamburgerIcon = ({ isOpen }: { isOpen: boolean }) => (
  <div className="w-6 h-5 relative flex flex-col justify-between">
    <span
      className={`w-full h-0.5 bg-current rounded-full transition-all duration-300 ${
        isOpen ? "rotate-45 translate-y-2" : ""
      }`}
    />
    <span
      className={`w-full h-0.5 bg-current rounded-full transition-all duration-300 ${
        isOpen ? "opacity-0 scale-0" : ""
      }`}
    />
    <span
      className={`w-full h-0.5 bg-current rounded-full transition-all duration-300 ${
        isOpen ? "-rotate-45 -translate-y-2" : ""
      }`}
    />
  </div>
);

const Header: React.FC = () => {
  const { address, isConnected, chainId } = useAccount();
  const [isMounted, setIsMounted] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showWhaleDropdown, setShowWhaleDropdown] = useState(false);
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);
  const pathname = usePathname();

  // Whale alerts
  const {
    alerts: whaleAlerts,
    unreadCount: whaleUnreadCount,
    hasNew: hasNewWhaleAlerts,
    markAllAsRead: markWhaleAlertsRead,
  } = useWhaleAlertBadge();

  // Gamification context for streaks and quests
  let gamificationContext: ReturnType<typeof useGamificationContext> | null = null;
  try {
    gamificationContext = useGamificationContext();
  } catch {
    // Context not available yet (during initial render)
  }

  // Prevent hydration mismatch by waiting for client-side mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsMobileMenuOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, []);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isMobileMenuOpen]);

  // Get contract address for current chain
  const contractAddress = chainId ? chainsToContracts[chainId]?.crownToken : undefined;

  // Read CRWN token balance
  const { data: crownBalance, refetch: refetchBalance } = useReadContract({
    address: contractAddress as `0x${string}` | undefined,
    abi: crownTokenAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: !!(isConnected && address && contractAddress),
    }
  });

  // Resolve ENS name
  const { data: ensName } = useEnsName({
    address: address as `0x${string}` | undefined,
    query: {
      enabled: !!address,
    }
  });

  // Format balance for display
  const formattedBalance = crownBalance ?
    parseFloat(formatEther(crownBalance as bigint)).toFixed(2) :
    "0.00";

  // Helper function to format display name (ENS or truncated address)
  const formatDisplayName = useCallback((account: { displayName: string }) => {
    if (ensName) {
      return `${ensName} •`;
    }
    return account.displayName;
  }, [ensName]);

  // Refetch balance periodically when connected
  useEffect(() => {
    if (isConnected && address && contractAddress) {
      const interval = setInterval(() => {
        refetchBalance();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, contractAddress, refetchBalance]);

  // Determine chain type for visual indicator
  const getChainType = useCallback(() => {
    if (!chainId) return null;
    if (chainId === ZEROG_CHAIN_ID) return { type: '0G', color: 'purple', label: 'iNFT Chain' };
    if (chainId === FLOW_TESTNET_ID) return { type: 'Flow', color: 'green', label: 'Game Chain' };
    return { type: 'Other', color: 'gray', label: 'Unknown' };
  }, [chainId]);

  const chainType = getChainType();

  // Check if link is active
  const isActiveLink = (href: string) => {
    if (href === "/") return pathname === href;
    return pathname?.startsWith(href);
  };

  return (
    <>
      <header className="arcade-header-grey sticky top-0 z-50">
        <div className="container-arcade">
          <div className="flex justify-between items-center h-16 md:h-[72px]">
            {/* Left: Logo + Mobile Menu Button */}
            <div className="flex items-center gap-4">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-slate-300 hover:text-white transition-colors touch-target"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={isMobileMenuOpen}
              >
                <HamburgerIcon isOpen={isMobileMenuOpen} />
              </button>

              {/* Logo */}
              <a href="/" className="flex items-center">
                <h1 className="text-lg md:text-2xl text-red-400 tracking-wider arcade-glow whitespace-nowrap"
                    style={{fontFamily: 'Press Start 2P, monospace'}}>
                  <span className="hidden sm:inline">Warriors AI-rena</span>
                  <span className="sm:hidden">WAR</span>
                </h1>
              </a>
            </div>

            {/* Center: Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {NAV_LINKS.map((link) => {
                const hasSubmenu = link.submenu && link.submenu.length > 0;
                const isOpen = openSubmenu === link.href;

                if (!hasSubmenu) {
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200
                        ${isActiveLink(link.href)
                          ? "text-white bg-slate-700/50"
                          : `text-slate-300 ${link.hoverColor} hover:bg-slate-800/50`
                        }`}
                    >
                      {link.label}
                    </a>
                  );
                }

                return (
                  <div
                    key={link.href}
                    className="relative"
                    onMouseEnter={() => setOpenSubmenu(link.href)}
                    onMouseLeave={() => setOpenSubmenu(null)}
                  >
                    <a
                      href={link.href}
                      className={`px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 flex items-center gap-1
                        ${isActiveLink(link.href)
                          ? "text-white bg-slate-700/50"
                          : `text-slate-300 ${link.hoverColor} hover:bg-slate-800/50`
                        }`}
                    >
                      {link.label}
                      <svg
                        className={`w-3 h-3 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </a>

                    {/* Dropdown Menu */}
                    {isOpen && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-slate-900 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
                        {link.submenu!.map((item) => (
                          <a
                            key={item.href}
                            href={item.href}
                            className={`flex items-center gap-2 px-4 py-2.5 text-xs transition-colors
                              ${isActiveLink(item.href)
                                ? "text-white bg-slate-700/70"
                                : "text-slate-300 hover:text-white hover:bg-slate-800/70"
                              }`}
                          >
                            {item.icon && <span className="text-sm">{item.icon}</span>}
                            {item.label}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Right: Status + Wallet */}
            <div className="flex items-center gap-2 md:gap-4">
              {/* Gamification: Streak & Quests - Hidden on small mobile */}
              {isMounted && isConnected && gamificationContext && (
                <div className="hidden sm:flex items-center gap-2">
                  <CompactStreak streak={gamificationContext.streaks.streaks.currentWinStreak} />
                  <CompactQuestIndicator
                    completedCount={gamificationContext.quests.quests.filter(q => q.isComplete).length}
                    totalCount={gamificationContext.quests.quests.length}
                    claimableCount={gamificationContext.quests.quests.filter(q => q.isComplete && !q.claimed).length}
                  />
                </div>
              )}

              {/* Whale Alerts - Hidden on mobile */}
              {isMounted && (
                <div className="relative hidden sm:block">
                  <WhaleAlertBadge
                    count={whaleUnreadCount}
                    hasNew={hasNewWhaleAlerts}
                    onClick={() => setShowWhaleDropdown(!showWhaleDropdown)}
                  />
                  {showWhaleDropdown && (
                    <WhaleAlertDropdown
                      alerts={whaleAlerts.slice(0, 5)}
                      onClose={() => setShowWhaleDropdown(false)}
                      onMarkRead={() => {
                        markWhaleAlertsRead();
                        setShowWhaleDropdown(false);
                      }}
                    />
                  )}
                </div>
              )}

              {/* 0G Network Status - Hidden on mobile */}
              {isMounted && (
                <div className="hidden md:block">
                  <ZeroGStatusCompact />
                </div>
              )}

              {/* CRWN Token Balance - Compact on mobile */}
              {isMounted && isConnected && (
                <div className="arcade-card-slate px-2 md:px-4 py-1.5 md:py-2 bg-slate-900/20 border-slate-500">
                  <div className="flex items-center gap-1.5 md:gap-2">
                    <span className="text-sm md:text-lg coin-spin">🪙</span>
                    <div className="text-right">
                      <div className="hidden md:block text-[10px] text-red-300" style={{fontFamily: 'Press Start 2P, monospace'}}>
                        CRWN
                      </div>
                      <div className="text-xs md:text-sm text-red-400 font-bold" style={{fontFamily: 'Press Start 2P, monospace'}}>
                        {formattedBalance}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Wallet Connect */}
              <div className="connect-button-wrapper-slate">
                <ConnectButton.Custom>
                  {({
                    account,
                    chain,
                    openAccountModal,
                    openChainModal,
                    openConnectModal,
                    mounted,
                  }) => {
                    const ready = mounted;
                    const connected = ready && account && chain;

                    return (
                      <div
                        {...(!ready && {
                          'aria-hidden': true,
                          'style': {
                            opacity: 0,
                            pointerEvents: 'none',
                            userSelect: 'none',
                          },
                        })}
                      >
                        {(() => {
                          if (!connected) {
                            return (
                              <button
                                onClick={openConnectModal}
                                type="button"
                                className="btn btn-primary btn-sm md:btn-md"
                              >
                                <span className="hidden sm:inline">Connect</span>
                                <span className="sm:hidden">🔗</span>
                              </button>
                            );
                          }

                          if (chain.unsupported) {
                            return (
                              <button
                                onClick={openChainModal}
                                type="button"
                                className="btn btn-danger btn-sm"
                              >
                                Wrong Network
                              </button>
                            );
                          }

                          return (
                            <div className="flex items-center gap-2">
                              {/* Chain Type Indicator - Hidden on mobile */}
                              {chainType && (
                                <div
                                  className={`hidden md:flex px-2 py-1 rounded-md text-[10px] font-bold ${
                                    chainType.color === 'purple'
                                      ? 'bg-purple-900/50 text-purple-300 border border-purple-500/50'
                                      : chainType.color === 'green'
                                      ? 'bg-green-900/50 text-green-300 border border-green-500/50'
                                      : 'bg-gray-900/50 text-gray-300 border border-gray-500/50'
                                  }`}
                                  title={chainType.label}
                                >
                                  {chainType.type === '0G' ? '🤖 iNFT' : chainType.type === 'Flow' ? '⚔️ Game' : '❓'}
                                </div>
                              )}

                              {/* Chain Selector - Compact on mobile */}
                              <button
                                onClick={openChainModal}
                                type="button"
                                className="btn btn-secondary btn-sm"
                              >
                                {chain.hasIcon && chain.iconUrl && (
                                  <div
                                    className="w-4 h-4 rounded-full overflow-hidden"
                                    style={{ background: chain.iconBackground }}
                                  >
                                    <img
                                      alt={chain.name ?? 'Chain icon'}
                                      src={chain.iconUrl}
                                      className="w-4 h-4"
                                    />
                                  </div>
                                )}
                                <span className="hidden md:inline">{chain.name}</span>
                              </button>

                              {/* Account Button */}
                              <button
                                onClick={openAccountModal}
                                type="button"
                                className="btn btn-secondary btn-sm"
                              >
                                {formatDisplayName(account)}
                              </button>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  }}
                </ConnectButton.Custom>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu Panel */}
      <div
        className={`fixed top-0 left-0 h-full w-72 bg-slate-900 border-r border-slate-700 z-50 transform transition-transform duration-300 ease-out md:hidden ${
          isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-red-400 text-sm arcade-glow" style={{fontFamily: 'Press Start 2P, monospace'}}>
            Menu
          </h2>
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="p-2 text-slate-400 hover:text-white transition-colors"
            aria-label="Close menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Mobile Menu Navigation */}
        <nav className="p-4 space-y-1 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>
          {NAV_LINKS.map((link, index) => {
            const hasSubmenu = link.submenu && link.submenu.length > 0;
            const isOpen = openSubmenu === link.href;

            if (!hasSubmenu) {
              return (
                <a
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 animate-slide-up ${
                    isActiveLink(link.href)
                      ? "text-white bg-slate-700/70 border-l-2 border-arcade-gold"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                  }`}
                  style={{ animationDelay: `${index * 50}ms` }}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </a>
              );
            }

            return (
              <div key={link.href} className="animate-slide-up" style={{ animationDelay: `${index * 50}ms` }}>
                <button
                  onClick={() => setOpenSubmenu(isOpen ? null : link.href)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActiveLink(link.href)
                      ? "text-white bg-slate-700/70 border-l-2 border-arcade-gold"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  {link.label}
                  <svg
                    className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {/* Submenu */}
                {isOpen && (
                  <div className="mt-1 ml-4 space-y-1">
                    {link.submenu!.map((item) => (
                      <a
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                          isActiveLink(item.href)
                            ? "text-white bg-slate-700/50"
                            : "text-slate-400 hover:text-white hover:bg-slate-800/50"
                        }`}
                        onClick={() => setIsMobileMenuOpen(false)}
                      >
                        {item.icon && <span className="text-base">{item.icon}</span>}
                        {item.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Mobile Menu Footer */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700">
          {/* 0G Status in mobile menu */}
          <div className="mb-3">
            <ZeroGStatusCompact />
          </div>

          {/* Gamification in mobile menu */}
          {isMounted && isConnected && gamificationContext && (
            <div className="flex items-center gap-2 justify-center">
              <CompactStreak streak={gamificationContext.streaks.streaks.currentWinStreak} />
              <CompactQuestIndicator
                completedCount={gamificationContext.quests.quests.filter(q => q.isComplete).length}
                totalCount={gamificationContext.quests.quests.length}
                claimableCount={gamificationContext.quests.quests.filter(q => q.isComplete && !q.claimed).length}
              />
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default Header
