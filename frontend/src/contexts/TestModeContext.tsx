'use client';

import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode, useRef } from 'react';

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

  // Use refs to prevent dependency issues and re-renders
  const hasInitialized = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Check 0G network status to determine if we're in test mode
   */
  const checkTestMode = useCallback(async () => {
    // Prevent concurrent checks
    if (isChecking) return;

    setIsChecking(true);
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch('/api/0g/inference', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
      // Only log if not aborted
      if (error instanceof Error && error.name !== 'AbortError') {
        console.error('Error checking test mode:', error);
      }
      setIsTestMode(true);
    } finally {
      setIsChecking(false);
    }
  }, [isChecking]);

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

  // Initial check on mount - only runs once
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Small delay to prevent race conditions during hydration
    const timeoutId = setTimeout(() => {
      checkTestMode();
    }, 1000);

    return () => clearTimeout(timeoutId);
    // Empty dependency array - only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Periodic check every 5 minutes - separate from initial check
  useEffect(() => {
    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    intervalRef.current = setInterval(() => {
      checkTestMode();
    }, 5 * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
    // Empty dependency array - interval should not change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
