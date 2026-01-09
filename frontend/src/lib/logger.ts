/**
 * Simple logging utility for production-ready logging
 * Replaces console.* calls with structured logging
 */

const isDevelopment = process.env.NODE_ENV === 'development';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  message: string;
  data?: unknown;
  timestamp: string;
}

/**
 * Format a log entry for console output
 */
function formatLogEntry(entry: LogEntry): string {
  const prefix = `[${entry.level.toUpperCase()}]`;
  return `${prefix} ${entry.message}`;
}

/**
 * Logger instance with level-based methods
 */
export const logger = {
  /**
   * Debug level - only shown in development
   */
  debug: (message: string, data?: unknown): void => {
    if (isDevelopment) {
      const entry: LogEntry = {
        level: 'debug',
        message,
        data,
        timestamp: new Date().toISOString()
      };
      if (data !== undefined) {
        console.log(formatLogEntry(entry), data);
      } else {
        console.log(formatLogEntry(entry));
      }
    }
  },

  /**
   * Info level - always shown
   */
  info: (message: string, data?: unknown): void => {
    const entry: LogEntry = {
      level: 'info',
      message,
      data,
      timestamp: new Date().toISOString()
    };
    if (data !== undefined) {
      console.log(formatLogEntry(entry), data);
    } else {
      console.log(formatLogEntry(entry));
    }
  },

  /**
   * Warning level - always shown
   */
  warn: (message: string, data?: unknown): void => {
    const entry: LogEntry = {
      level: 'warn',
      message,
      data,
      timestamp: new Date().toISOString()
    };
    if (data !== undefined) {
      console.warn(formatLogEntry(entry), data);
    } else {
      console.warn(formatLogEntry(entry));
    }
  },

  /**
   * Error level - always shown
   */
  error: (message: string, error?: unknown): void => {
    const entry: LogEntry = {
      level: 'error',
      message,
      data: error,
      timestamp: new Date().toISOString()
    };
    if (error !== undefined) {
      console.error(formatLogEntry(entry), error);
    } else {
      console.error(formatLogEntry(entry));
    }
  }
};

export default logger;
