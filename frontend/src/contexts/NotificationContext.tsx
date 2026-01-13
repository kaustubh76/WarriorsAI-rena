'use client';

/**
 * Notification context for toast/notification management
 */

import React, { createContext, useContext, useReducer, useCallback, ReactNode } from 'react';
import { Achievement } from '../utils/achievements';
import { Quest } from '../utils/quests';

export type NotificationType = 'success' | 'error' | 'warning' | 'info' | 'achievement' | 'streak' | 'quest' | 'levelup' | 'whale_alert';

export interface WhaleTrade {
  id: string;
  source: string;
  marketId: string;
  marketQuestion: string;
  traderAddress?: string;
  side: 'buy' | 'sell';
  outcome: string;
  amountUsd: string;
  price: number;
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number; // ms, 0 = persistent
  icon?: string;
  achievement?: Achievement;
  quest?: Quest;
  streak?: number;
  level?: number;
  xp?: number;
  whaleTrade?: WhaleTrade;
}

interface NotificationState {
  notifications: Notification[];
  maxVisible: number;
}

type NotificationAction =
  | { type: 'ADD'; notification: Notification }
  | { type: 'REMOVE'; id: string }
  | { type: 'CLEAR_ALL' };

const initialState: NotificationState = {
  notifications: [],
  maxVisible: 5,
};

function notificationReducer(state: NotificationState, action: NotificationAction): NotificationState {
  switch (action.type) {
    case 'ADD':
      return {
        ...state,
        notifications: [...state.notifications, action.notification].slice(-state.maxVisible * 2),
      };
    case 'REMOVE':
      return {
        ...state,
        notifications: state.notifications.filter(n => n.id !== action.id),
      };
    case 'CLEAR_ALL':
      return {
        ...state,
        notifications: [],
      };
    default:
      return state;
  }
}

interface NotificationContextValue {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, 'id'>) => string;
  removeNotification: (id: string) => void;
  clearAll: () => void;

  // Convenience methods
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
  achievement: (achievement: Achievement, xp?: number) => string;
  streak: (streakCount: number, isNewBest?: boolean) => string;
  questComplete: (quest: Quest) => string;
  levelUp: (newLevel: number) => string;
  tradeResult: (isWin: boolean, profit: number) => string;
  whaleAlert: (trade: WhaleTrade) => string;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

let notificationIdCounter = 0;

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(notificationReducer, initialState);

  const addNotification = useCallback((notification: Omit<Notification, 'id'>): string => {
    const id = `notification-${++notificationIdCounter}-${Date.now()}`;
    const fullNotification: Notification = {
      ...notification,
      id,
      duration: notification.duration ?? 4000,
    };

    dispatch({ type: 'ADD', notification: fullNotification });

    // Auto-remove after duration (unless duration is 0)
    if (fullNotification.duration && fullNotification.duration > 0) {
      setTimeout(() => {
        dispatch({ type: 'REMOVE', id });
      }, fullNotification.duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    dispatch({ type: 'REMOVE', id });
  }, []);

  const clearAll = useCallback(() => {
    dispatch({ type: 'CLEAR_ALL' });
  }, []);

  // Convenience methods
  const success = useCallback((title: string, message?: string) => {
    return addNotification({ type: 'success', title, message, icon: '✓' });
  }, [addNotification]);

  const error = useCallback((title: string, message?: string) => {
    return addNotification({ type: 'error', title, message, icon: '✗', duration: 6000 });
  }, [addNotification]);

  const warning = useCallback((title: string, message?: string) => {
    return addNotification({ type: 'warning', title, message, icon: '⚠' });
  }, [addNotification]);

  const info = useCallback((title: string, message?: string) => {
    return addNotification({ type: 'info', title, message, icon: 'ℹ' });
  }, [addNotification]);

  const achievement = useCallback((ach: Achievement, xp?: number) => {
    return addNotification({
      type: 'achievement',
      title: 'Achievement Unlocked!',
      message: ach.name,
      icon: ach.icon,
      achievement: ach,
      xp: xp ?? ach.xpReward,
      duration: 5000,
    });
  }, [addNotification]);

  const streak = useCallback((streakCount: number, isNewBest?: boolean) => {
    const title = isNewBest ? 'NEW BEST STREAK!' : 'Win Streak!';
    return addNotification({
      type: 'streak',
      title,
      message: `${streakCount} wins in a row!`,
      icon: '🔥',
      streak: streakCount,
      duration: 4000,
    });
  }, [addNotification]);

  const questComplete = useCallback((q: Quest) => {
    return addNotification({
      type: 'quest',
      title: 'Quest Complete!',
      message: q.name,
      icon: q.icon,
      quest: q,
      xp: q.xpReward,
      duration: 4000,
    });
  }, [addNotification]);

  const levelUp = useCallback((newLevel: number) => {
    return addNotification({
      type: 'levelup',
      title: 'LEVEL UP!',
      message: `You reached Level ${newLevel}!`,
      icon: '⬆️',
      level: newLevel,
      duration: 6000,
    });
  }, [addNotification]);

  const tradeResult = useCallback((isWin: boolean, profit: number) => {
    if (isWin) {
      return addNotification({
        type: 'success',
        title: 'Trade Won!',
        message: `+${profit.toFixed(2)} CRwN`,
        icon: '💰',
        duration: 3000,
      });
    } else {
      return addNotification({
        type: 'error',
        title: 'Trade Lost',
        message: `${profit.toFixed(2)} CRwN`,
        icon: '📉',
        duration: 3000,
      });
    }
  }, [addNotification]);

  const whaleAlert = useCallback((trade: WhaleTrade) => {
    const amount = parseFloat(trade.amountUsd);
    const formattedAmount = amount >= 1000000
      ? `$${(amount / 1000000).toFixed(1)}M`
      : amount >= 1000
      ? `$${(amount / 1000).toFixed(0)}K`
      : `$${amount.toFixed(0)}`;

    return addNotification({
      type: 'whale_alert',
      title: `Whale ${trade.side === 'buy' ? 'Bought' : 'Sold'}!`,
      message: `${formattedAmount} ${trade.outcome.toUpperCase()} on ${trade.marketQuestion.slice(0, 50)}...`,
      icon: '🐋',
      whaleTrade: trade,
      duration: 6000,
    });
  }, [addNotification]);

  const value: NotificationContextValue = {
    notifications: state.notifications,
    addNotification,
    removeNotification,
    clearAll,
    success,
    error,
    warning,
    info,
    achievement,
    streak,
    questComplete,
    levelUp,
    tradeResult,
    whaleAlert,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
}
