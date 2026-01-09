'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

interface TestModeContextValue {
  isTestMode: boolean;
  lastInferenceVerified: boolean;
  lastCheckTime: number | null;
  isChecking: boolean;
  checkTestMode: () => Promise<void>;
  setTestModeFromResponse: (isVerified: boolean, fallbackMode: boolean) => void;
}

const TestModeContext = createContext<TestModeContextValue | undefined>(undefined);

interface TestModeProviderProps {
  children: ReactNode;
}

export function TestModeProvider({ children }: TestModeProviderProps) {
  const [isTestMode, setIsTestMode] = useState(false);
  const [lastInferenceVerified, setLastInferenceVerified] = useState(true);
  const [lastCheckTime, setLastCheckTime] = useState<number | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  /**
   * Check 0G network status to determine if we're in test mode
   */
  const checkTestMode = useCallback(async () => {
    setIsChecking(true);
    try {
      const response = await fetch('/api/0g/inference');
      if (response.ok) {
        const data = await response.json();
        // If providers array is empty or message mentions fallback, we're in test mode
        const noProviders = !data.providers || data.providers.length === 0;
        const fallbackMessage = data.message?.toLowerCase().includes('fallback');
        setIsTestMode(noProviders || fallbackMessage);
        setLastCheckTime(Date.now());
      } else {
        // API error - likely in test mode
        setIsTestMode(true);
      }
    } catch (error) {
      console.error('Error checking test mode:', error);
      setIsTestMode(true);
    } finally {
      setIsChecking(false);
    }
  }, []);

  /**
   * Update test mode state from an inference response
   */
  const setTestModeFromResponse = useCallback((isVerified: boolean, fallbackMode: boolean) => {
    setLastInferenceVerified(isVerified);
    // If response is not verified or is in fallback mode, we're in test mode
    if (!isVerified || fallbackMode) {
      setIsTestMode(true);
    }
    setLastCheckTime(Date.now());
  }, []);

  // Initial check on mount
  useEffect(() => {
    checkTestMode();
  }, [checkTestMode]);

  // Periodic check every 5 minutes
  useEffect(() => {
    const interval = setInterval(checkTestMode, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [checkTestMode]);

  return (
    <TestModeContext.Provider
      value={{
        isTestMode,
        lastInferenceVerified,
        lastCheckTime,
        isChecking,
        checkTestMode,
        setTestModeFromResponse
      }}
    >
      {children}
    </TestModeContext.Provider>
  );
}

export function useTestMode() {
  const context = useContext(TestModeContext);
  if (context === undefined) {
    throw new Error('useTestMode must be used within a TestModeProvider');
  }
  return context;
}

export default TestModeContext;
