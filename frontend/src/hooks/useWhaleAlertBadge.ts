/**
 * useWhaleAlertBadge Hook
 * Manages whale alert badge state with localStorage persistence
 */

'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWhaleAlerts } from './useWhaleAlerts';

const STORAGE_KEY = 'whale_alerts_last_read';

interface UseWhaleAlertBadgeReturn {
  alerts: any[];
  unreadCount: number;
  hasNew: boolean;
  isConnected: boolean;
  markAsRead: (alertId: string) => void;
  markAllAsRead: () => void;
  threshold: number;
  setThreshold: (threshold: number) => void;
}

export function useWhaleAlertBadge(): UseWhaleAlertBadgeReturn {
  const {
    alerts,
    isConnected,
    threshold,
    setThreshold,
  } = useWhaleAlerts();

  const [lastReadTimestamp, setLastReadTimestamp] = useState<number>(0);
  const [readAlertIds, setReadAlertIds] = useState<Set<string>>(new Set());

  // Load last read timestamp from localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const data = JSON.parse(stored);
          setLastReadTimestamp(data.timestamp || 0);
          setReadAlertIds(new Set(data.readIds || []));
        } catch (e) {
          // Invalid data, ignore
        }
      }
    }
  }, []);

  // Save to localStorage when read state changes
  const saveReadState = useCallback((timestamp: number, ids: Set<string>) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          timestamp,
          readIds: Array.from(ids).slice(-100), // Keep last 100 IDs
        })
      );
    }
  }, []);

  // Calculate unread count
  const unreadCount = useMemo(() => {
    return alerts.filter(
      (alert) =>
        alert.timestamp > lastReadTimestamp && !readAlertIds.has(alert.id)
    ).length;
  }, [alerts, lastReadTimestamp, readAlertIds]);

  // Check if there are any new alerts since last check
  const hasNew = useMemo(() => {
    return alerts.some(
      (alert) =>
        alert.timestamp > lastReadTimestamp && !readAlertIds.has(alert.id)
    );
  }, [alerts, lastReadTimestamp, readAlertIds]);

  // Mark a single alert as read
  const markAsRead = useCallback((alertId: string) => {
    setReadAlertIds((prev) => {
      const next = new Set(prev);
      next.add(alertId);
      saveReadState(lastReadTimestamp, next);
      return next;
    });
  }, [lastReadTimestamp, saveReadState]);

  // Mark all alerts as read
  const markAllAsRead = useCallback(() => {
    const now = Date.now();
    const allIds = new Set(alerts.map((a) => a.id));
    setLastReadTimestamp(now);
    setReadAlertIds(allIds);
    saveReadState(now, allIds);
  }, [alerts, saveReadState]);

  return {
    alerts,
    unreadCount,
    hasNew,
    isConnected,
    markAsRead,
    markAllAsRead,
    threshold,
    setThreshold,
  };
}

export default useWhaleAlertBadge;
