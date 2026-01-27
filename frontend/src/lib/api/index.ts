/**
 * API Utilities Index
 * Re-exports all API utilities for simpler imports
 *
 * Usage:
 * import { handleAPIError, validateAddress, applyRateLimit } from '@/lib/api';
 */

export * from './errorHandler';
export * from './validation';
export * from './rateLimit';
export * from './logger';
export * from './response';
export * from './retry';
export * from './circuitBreaker';
export * from './dedup';
export * from './metrics';
export * from './client';
export * from './middleware';
