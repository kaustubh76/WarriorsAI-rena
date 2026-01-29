'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as fcl from '@onflow/fcl';

// Import to ensure FCL config is initialized
import '@/lib/flow/cadenceClient';

interface FlowUser {
  addr: string | null;
  loggedIn: boolean;
}

interface FlowWalletContextType {
  flowAddress: string | null;
  isFlowConnected: boolean;
  connectFlowWallet: () => Promise<void>;
  disconnectFlowWallet: () => Promise<void>;
}

const FlowWalletContext = createContext<FlowWalletContextType>({
  flowAddress: null,
  isFlowConnected: false,
  connectFlowWallet: async () => {},
  disconnectFlowWallet: async () => {},
});

export function FlowWalletProvider({ children }: { children: React.ReactNode }) {
  const [flowUser, setFlowUser] = useState<FlowUser>({ addr: null, loggedIn: false });

  useEffect(() => {
    const unsubscribe = fcl.currentUser.subscribe((user: any) => {
      setFlowUser({
        addr: user?.addr || null,
        loggedIn: !!user?.addr,
      });
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  const connectFlowWallet = useCallback(async () => {
    await fcl.authenticate();
  }, []);

  const disconnectFlowWallet = useCallback(async () => {
    await fcl.unauthenticate();
  }, []);

  return (
    <FlowWalletContext.Provider
      value={{
        flowAddress: flowUser.addr,
        isFlowConnected: flowUser.loggedIn,
        connectFlowWallet,
        disconnectFlowWallet,
      }}
    >
      {children}
    </FlowWalletContext.Provider>
  );
}

export function useFlowWallet() {
  return useContext(FlowWalletContext);
}
