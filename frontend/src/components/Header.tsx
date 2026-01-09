"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit"
import { useAccount, useBalance, useReadContract, useEnsName } from "wagmi"
import { useState, useEffect } from "react"
import { chainsToContracts, crownTokenAbi } from "../constants"
import { formatEther } from "viem"

const Header: React.FC = () => {
  const { address, isConnected, chainId } = useAccount();
  const [isMounted, setIsMounted] = useState(false);

  // Prevent hydration mismatch by waiting for client-side mount
  useEffect(() => {
    setIsMounted(true);
  }, []);

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
  const formatDisplayName = (account: any) => {
    if (ensName) {
      // Display ENS name with a subtle indicator
      return `${ensName} •`;
    }
    // Fallback to account.displayName which is already truncated by RainbowKit
    return account.displayName;
  };

  // Refetch balance periodically when connected
  useEffect(() => {
    if (isConnected && address && contractAddress) {
      const interval = setInterval(() => {
        refetchBalance();
      }, 10000); // Refetch every 10 seconds

      return () => clearInterval(interval);
    }
  }, [isConnected, address, contractAddress, refetchBalance]);

  return (
    <header className="arcade-header-grey">
      <div className="container mx-auto px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-6">
              <a href="/">
                <h1 className="text-2xl text-red-400 tracking-widest arcade-glow" style={{fontFamily: 'Press Start 2P, monospace'}}>
                  Warriors AI-rena
                </h1>
              </a>
              {/* Navigation Links */}
              <nav className="hidden md:flex items-center gap-4 ml-8">
                <a
                  href="/arena"
                  className="text-gray-300 hover:text-red-400 transition-colors text-sm font-medium"
                >
                  Arena
                </a>
                <a
                  href="/markets"
                  className="text-gray-300 hover:text-red-400 transition-colors text-sm font-medium"
                >
                  Markets
                </a>
                <a
                  href="/ai-agents"
                  className="text-gray-300 hover:text-purple-400 transition-colors text-sm font-medium"
                >
                  AI Agents
                </a>
                <a
                  href="/leaderboard"
                  className="text-gray-300 hover:text-red-400 transition-colors text-sm font-medium"
                >
                  Leaderboard
                </a>
                <a
                  href="/social/copy-trading"
                  className="text-gray-300 hover:text-purple-400 transition-colors text-sm font-medium"
                >
                  Copy Trade
                </a>
                <a
                  href="/creator-dashboard"
                  className="text-gray-300 hover:text-green-400 transition-colors text-sm font-medium"
                >
                  Creator
                </a>
                <a
                  href="/warriorsMinter"
                  className="text-gray-300 hover:text-red-400 transition-colors text-sm font-medium"
                >
                  Mint
                </a>
              </nav>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            {/* CRWN Token Balance */}
            {isMounted && isConnected && (
              <div className="arcade-card-slate px-4 py-2 bg-slate-900/20 border-slate-500">
                <div className="flex items-center gap-2">
                  <span className="text-red-400 text-lg coin-spin">🪙</span>
                  <div className="text-right">
                    <div className="text-xs text-red-300" style={{fontFamily: 'Press Start 2P, monospace'}}>
                      CRWN
                    </div>
                    <div className="text-sm text-red-400 font-bold" style={{fontFamily: 'Press Start 2P, monospace'}}>
                      {formattedBalance}
                    </div>
                  </div>
                </div>
              </div>
            )}
            
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
                              className="arcade-button-slate"
                              style={{
                                borderRadius: '12px !important'
                              }}
                            >
                              Connect Wallet
                            </button>
                          );
                        }

                        if (chain.unsupported) {
                          return (
                            <button 
                              onClick={openChainModal} 
                              type="button" 
                              className="arcade-button-slate-error"
                              style={{
                                borderRadius: '12px !important'
                              }}
                            >
                              Wrong network
                            </button>
                          );
                        }

                        return (
                          <div style={{ display: 'flex', gap: 12 }}>
                            <button
                              onClick={openChainModal}
                              style={{ 
                                display: 'flex', 
                                alignItems: 'center',
                                borderRadius: '12px !important'
                              }}
                              type="button"
                              className="arcade-button-slate-medium"
                            >
                              {chain.hasIcon && (
                                <div
                                  style={{
                                    background: chain.iconBackground,
                                    width: 14,
                                    height: 14,
                                    borderRadius: 999,
                                    overflow: 'hidden',
                                    marginRight: 6,
                                  }}
                                >
                                  {chain.iconUrl && (
                                    <img
                                      alt={chain.name ?? 'Chain icon'}
                                      src={chain.iconUrl}
                                      style={{ width: 14, height: 14 }}
                                    />
                                  )}
                                </div>
                              )}
                              {chain.name}
                            </button>

                            <button 
                              onClick={openAccountModal} 
                              type="button" 
                              className="arcade-button-slate-medium"
                              style={{
                                borderRadius: '12px !important'
                              }}
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
  )
}

export default Header