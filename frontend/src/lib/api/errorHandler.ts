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
