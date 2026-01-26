/**
 * API Request Logger
 * Provides structured logging for API routes with performance tracking
 */

import { NextRequest } from 'next/server';

export interface RequestLogContext {
  requestId: string;
  method: string;
  path: string;
  startTime: number;
  ip?: string;
  userAgent?: string;
}

export interface LogData {
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: RequestLogContext;
  data?: Record<string, unknown>;
  duration?: number;
  statusCode?: number;
}

/**
 * Generate a unique request ID for tracing
 */
export function generateRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Extract client IP from request headers
 */
export function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const cfConnectingIp = request.headers.get('cf-connecting-ip');

  return forwarded?.split(',')[0].trim() || realIp || cfConnectingIp || 'unknown';
}

/**
 * Create a request context for logging
 */
export function createRequestContext(request: NextRequest): RequestLogContext {
  const url = new URL(request.url);

  return {
    requestId: generateRequestId(),
    method: request.method,
    path: url.pathname,
    startTime: Date.now(),
    ip: getClientIP(request),
    userAgent: request.headers.get('user-agent') || undefined,
  };
}

/**
 * Format log entry for output
 */
function formatLogEntry(data: LogData): string {
  const timestamp = new Date().toISOString();
  const parts = [
    `[${timestamp}]`,
    `[${data.level.toUpperCase()}]`,
  ];

  if (data.context) {
    parts.push(`[${data.context.requestId}]`);
    parts.push(`${data.context.method} ${data.context.path}`);
  }

  parts.push(data.message);

  if (data.statusCode !== undefined) {
    parts.push(`status=${data.statusCode}`);
  }

  if (data.duration !== undefined) {
    parts.push(`duration=${data.duration}ms`);
  }

  return parts.join(' ');
}

/**
 * API Logger class for structured request logging
 */
export class APILogger {
  private context: RequestLogContext;
  private isDev: boolean;

  constructor(request: NextRequest) {
    this.context = createRequestContext(request);
    this.isDev = process.env.NODE_ENV === 'development';
  }

  get requestId(): string {
    return this.context.requestId;
  }

  /**
   * Log request start
   */
  start(): void {
    if (this.isDev) {
      console.log(formatLogEntry({
        level: 'info',
        message: 'Request started',
        context: this.context,
      }));
    }
  }

  /**
   * Log debug information
   */
  debug(message: string, data?: Record<string, unknown>): void {
    if (this.isDev) {
      console.debug(formatLogEntry({
        level: 'debug',
        message,
        context: this.context,
        data,
      }));
    }
  }

  /**
   * Log informational message
   */
  info(message: string, data?: Record<string, unknown>): void {
    console.log(formatLogEntry({
      level: 'info',
      message,
      context: this.context,
      data,
    }));
  }

  /**
   * Log warning
   */
  warn(message: string, data?: Record<string, unknown>): void {
    console.warn(formatLogEntry({
      level: 'warn',
      message,
      context: this.context,
      data,
    }));
  }

  /**
   * Log error
   */
  error(message: string, error?: Error | unknown, data?: Record<string, unknown>): void {
    const errorData = {
      ...data,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: this.isDev ? error.stack : undefined,
      } : error,
    };

    console.error(formatLogEntry({
      level: 'error',
      message,
      context: this.context,
      data: errorData,
    }));
  }

  /**
   * Log request completion with status and duration
   */
  complete(statusCode: number, message?: string): void {
    const duration = Date.now() - this.context.startTime;

    console.log(formatLogEntry({
      level: statusCode >= 400 ? 'warn' : 'info',
      message: message || 'Request completed',
      context: this.context,
      statusCode,
      duration,
    }));
  }

  /**
   * Get headers to include request ID in response
   */
  getResponseHeaders(): Record<string, string> {
    return {
      'X-Request-ID': this.context.requestId,
    };
  }
}

/**
 * Create a logger for an API route
 *
 * @example
 * export async function GET(request: NextRequest) {
 *   const logger = createAPILogger(request);
 *   logger.start();
 *   try {
 *     // ... handle request
 *     logger.complete(200);
 *     return NextResponse.json(data, { headers: logger.getResponseHeaders() });
 *   } catch (error) {
 *     logger.error('Request failed', error);
 *     throw error;
 *   }
 * }
 */
export function createAPILogger(request: NextRequest): APILogger {
  return new APILogger(request);
}

/**
 * Simple logging functions for use without request context
 */
export const log = {
  debug: (message: string, data?: Record<string, unknown>) => {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, data || '');
    }
  },

  info: (message: string, data?: Record<string, unknown>) => {
    console.log(`[INFO] ${message}`, data || '');
  },

  warn: (message: string, data?: Record<string, unknown>) => {
    console.warn(`[WARN] ${message}`, data || '');
  },

  error: (message: string, error?: Error | unknown, data?: Record<string, unknown>) => {
    console.error(`[ERROR] ${message}`, { error, ...data });
  },
};
