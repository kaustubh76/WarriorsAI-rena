/**
 * Centralized API Error Handling
 * Provides consistent error responses across all API routes
 */

import { NextResponse } from 'next/server';

/**
 * Custom API Error class with status code and error code
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Prisma error codes we handle specially
 */
const PRISMA_ERROR_CODES: Record<string, { message: string; status: number; code: string }> = {
  P2000: { message: 'Value too long for column', status: 400, code: 'VALUE_TOO_LONG' },
  P2001: { message: 'Record not found', status: 404, code: 'NOT_FOUND' },
  P2002: { message: 'Unique constraint violation', status: 409, code: 'DUPLICATE' },
  P2003: { message: 'Foreign key constraint failed', status: 400, code: 'INVALID_REFERENCE' },
  P2025: { message: 'Resource not found', status: 404, code: 'NOT_FOUND' },
};

/**
 * Handle API errors and return consistent NextResponse
 *
 * @param error - The error to handle
 * @param context - Context string for logging (e.g., "API:Battles:GET")
 * @returns NextResponse with appropriate status code and error message
 */
export function handleAPIError(error: unknown, context: string): NextResponse {
  console.error(`[${context}]`, error);

  // Handle our custom APIError
  if (error instanceof APIError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }

  // Handle Prisma errors
  if (error && typeof error === 'object' && 'code' in error) {
    const prismaError = error as { code: string; message: string; meta?: unknown };
    const mapping = PRISMA_ERROR_CODES[prismaError.code];

    if (mapping) {
      return NextResponse.json(
        {
          error: mapping.message,
          code: mapping.code,
          details: prismaError.meta,
        },
        { status: mapping.status }
      );
    }

    // Unknown Prisma error
    return NextResponse.json(
      {
        error: 'Database operation failed',
        code: 'DATABASE_ERROR',
        details: { prismaCode: prismaError.code },
      },
      { status: 500 }
    );
  }

  // Handle standard Error objects
  if (error instanceof Error) {
    // Don't expose internal error details in production
    const isDev = process.env.NODE_ENV === 'development';
    return NextResponse.json(
      {
        error: isDev ? error.message : 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: isDev ? { stack: error.stack } : undefined,
      },
      { status: 500 }
    );
  }

  // Unknown error type
  return NextResponse.json(
    {
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
    },
    { status: 500 }
  );
}

/**
 * Common HTTP error responses
 */
export const ErrorResponses = {
  notFound: (resource: string = 'Resource') =>
    new APIError(`${resource} not found`, 404, 'NOT_FOUND'),

  unauthorized: (message: string = 'Authentication required') =>
    new APIError(message, 401, 'UNAUTHORIZED'),

  forbidden: (message: string = 'Access denied') =>
    new APIError(message, 403, 'FORBIDDEN'),

  badRequest: (message: string, details?: unknown) =>
    new APIError(message, 400, 'BAD_REQUEST', details),

  conflict: (message: string = 'Resource already exists') =>
    new APIError(message, 409, 'CONFLICT'),

  rateLimitExceeded: (resetIn: number) =>
    new APIError(
      `Rate limit exceeded. Try again in ${Math.ceil(resetIn / 1000)} seconds`,
      429,
      'RATE_LIMIT_EXCEEDED',
      { resetIn }
    ),

  internal: (message: string = 'Internal server error') =>
    new APIError(message, 500, 'INTERNAL_ERROR'),

  serviceUnavailable: (message: string = 'Service temporarily unavailable') =>
    new APIError(message, 503, 'SERVICE_UNAVAILABLE'),
};

/**
 * Flow-specific transaction error with additional context
 */
export class FlowTransactionError extends APIError {
  constructor(
    message: string,
    public transactionId?: string,
    public blockHeight?: number,
    public originalError?: any
  ) {
    super(message, 500, 'FLOW_TX_ERROR');
    this.name = 'FlowTransactionError';
  }
}

/**
 * Handle Flow-specific errors and return appropriate API errors
 * @param error The caught error
 * @param context Description of what operation failed
 * @returns An appropriate APIError instance
 */
export function handleFlowError(error: any, context: string): APIError {
  // Timeout errors
  if (error.message?.includes('timeout') || error.message?.includes('timed out')) {
    return new APIError(
      `Flow transaction timed out during ${context}`,
      504,
      'FLOW_TIMEOUT'
    );
  }

  // Insufficient balance
  if (error.message?.includes('insufficient FLOW') || error.message?.includes('insufficient balance')) {
    return new APIError(
      'Insufficient FLOW balance to execute transaction',
      400,
      'INSUFFICIENT_BALANCE'
    );
  }

  // Contract not deployed (Cadence import failures)
  if (
    error.message?.includes('cannot find declaration') ||
    error.message?.includes('cannot import') ||
    error.message?.includes('could not import') ||
    (error.message?.includes('account') && error.message?.includes('does not have contract'))
  ) {
    return new APIError(
      'Flow Cadence contract not deployed',
      503,
      'CONTRACT_NOT_DEPLOYED'
    );
  }

  // Not found errors
  if (error.statusCode === 404 || error.message?.includes('not found')) {
    return new APIError(
      `Battle not found on Flow blockchain`,
      404,
      'BATTLE_NOT_FOUND'
    );
  }

  // Already executed
  if (error.message?.includes('already executed') || error.message?.includes('already completed')) {
    return new APIError(
      'Battle has already been executed',
      409,
      'ALREADY_EXECUTED'
    );
  }

  // Too early to execute
  if (error.message?.includes('too early') || error.message?.includes('scheduled time')) {
    return new APIError(
      'Battle cannot be executed before scheduled time',
      400,
      'TOO_EARLY'
    );
  }

  // Flow network errors
  if (error.message?.includes('network') || error.message?.includes('connection')) {
    return new APIError(
      'Flow network error - please try again',
      503,
      'NETWORK_ERROR'
    );
  }

  // Generic Flow transaction error
  return new FlowTransactionError(
    `Flow transaction failed during ${context}: ${error.message || 'Unknown error'}`,
    error.transactionId,
    error.blockHeight,
    error
  );
}
