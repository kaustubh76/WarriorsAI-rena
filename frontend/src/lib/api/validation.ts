/**
 * Input Validation Utilities
 * Provides reusable validation functions for API inputs
 */

import { NextRequest } from 'next/server';
import { APIError, ErrorResponses } from './errorHandler';

/**
 * Validate Ethereum address format
 *
 * @param address - Address string to validate
 * @param fieldName - Name of the field for error messages
 * @returns Normalized (lowercase) address
 * @throws APIError if invalid
 */
export function validateAddress(address: string, fieldName: string = 'address'): string {
  if (!address || typeof address !== 'string') {
    throw new APIError(`${fieldName} is required`, 400, 'INVALID_ADDRESS');
  }

  // Check Ethereum address format (0x followed by 40 hex characters)
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new APIError(
      `${fieldName} must be a valid Ethereum address`,
      400,
      'INVALID_ADDRESS'
    );
  }

  return address.toLowerCase();
}

/**
 * Validate BigInt string (for wei amounts, token IDs, etc.)
 *
 * @param value - String value to validate
 * @param fieldName - Name of the field for error messages
 * @param options - Validation options
 * @returns Validated string
 * @throws APIError if invalid
 */
export function validateBigIntString(
  value: string,
  fieldName: string,
  options: {
    min?: bigint;
    max?: bigint;
    allowZero?: boolean;
  } = {}
): string {
  if (!value || typeof value !== 'string') {
    throw new APIError(`${fieldName} is required`, 400, 'INVALID_AMOUNT');
  }

  let parsed: bigint;
  try {
    parsed = BigInt(value);
  } catch {
    throw new APIError(
      `${fieldName} must be a valid number`,
      400,
      'INVALID_AMOUNT'
    );
  }

  // Check if zero is allowed
  if (!options.allowZero && parsed === 0n) {
    throw new APIError(
      `${fieldName} must be greater than zero`,
      400,
      'INVALID_AMOUNT'
    );
  }

  // Check minimum
  if (options.min !== undefined && parsed < options.min) {
    throw new APIError(
      `${fieldName} must be at least ${options.min.toString()}`,
      400,
      'INVALID_AMOUNT'
    );
  }

  // Check maximum
  if (options.max !== undefined && parsed > options.max) {
    throw new APIError(
      `${fieldName} must be at most ${options.max.toString()}`,
      400,
      'INVALID_AMOUNT'
    );
  }

  return value;
}

/**
 * Validate positive integer
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @param options - Validation options
 * @returns Validated integer
 * @throws APIError if invalid
 */
export function validateInteger(
  value: unknown,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
    allowZero?: boolean;
  } = {}
): number {
  const num = typeof value === 'string' ? parseInt(value, 10) : Number(value);

  if (isNaN(num) || !Number.isInteger(num)) {
    throw new APIError(
      `${fieldName} must be an integer`,
      400,
      'INVALID_INTEGER'
    );
  }

  if (!options.allowZero && num === 0) {
    throw new APIError(
      `${fieldName} must be greater than zero`,
      400,
      'INVALID_INTEGER'
    );
  }

  if (options.min !== undefined && num < options.min) {
    throw new APIError(
      `${fieldName} must be at least ${options.min}`,
      400,
      'INVALID_INTEGER'
    );
  }

  if (options.max !== undefined && num > options.max) {
    throw new APIError(
      `${fieldName} must be at most ${options.max}`,
      400,
      'INVALID_INTEGER'
    );
  }

  return num;
}

/**
 * Validate value is one of allowed enum values
 *
 * @param value - Value to validate
 * @param allowed - Array of allowed values
 * @param fieldName - Name of the field for error messages
 * @returns Validated value
 * @throws APIError if invalid
 */
export function validateEnum<T extends string>(
  value: string,
  allowed: readonly T[],
  fieldName: string
): T {
  if (!value || typeof value !== 'string') {
    throw new APIError(
      `${fieldName} is required`,
      400,
      'INVALID_ENUM'
    );
  }

  if (!allowed.includes(value as T)) {
    throw new APIError(
      `${fieldName} must be one of: ${allowed.join(', ')}`,
      400,
      'INVALID_ENUM',
      { allowed, received: value }
    );
  }

  return value as T;
}

/**
 * Validate boolean value
 *
 * @param value - Value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Validated boolean
 * @throws APIError if invalid
 */
export function validateBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value === 'true') return true;
  if (value === 'false') return false;

  throw new APIError(
    `${fieldName} must be a boolean`,
    400,
    'INVALID_BOOLEAN'
  );
}

/**
 * Validate string length
 *
 * @param value - String to validate
 * @param fieldName - Name of the field for error messages
 * @param options - Validation options
 * @returns Validated string
 * @throws APIError if invalid
 */
export function validateString(
  value: string,
  fieldName: string,
  options: {
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
  } = {}
): string {
  if (!value || typeof value !== 'string') {
    throw new APIError(`${fieldName} is required`, 400, 'INVALID_STRING');
  }

  if (options.minLength && value.length < options.minLength) {
    throw new APIError(
      `${fieldName} must be at least ${options.minLength} characters`,
      400,
      'INVALID_STRING'
    );
  }

  if (options.maxLength && value.length > options.maxLength) {
    throw new APIError(
      `${fieldName} must be at most ${options.maxLength} characters`,
      400,
      'INVALID_STRING'
    );
  }

  if (options.pattern && !options.pattern.test(value)) {
    throw new APIError(
      `${fieldName} has invalid format`,
      400,
      'INVALID_STRING'
    );
  }

  return value;
}

/**
 * Validate hex string (for hashes, signatures, etc.)
 *
 * @param value - Hex string to validate
 * @param fieldName - Name of the field for error messages
 * @param expectedLength - Expected length (in bytes, not characters)
 * @returns Validated hex string
 * @throws APIError if invalid
 */
export function validateHexString(
  value: string,
  fieldName: string,
  expectedLength?: number
): string {
  if (!value || typeof value !== 'string') {
    throw new APIError(`${fieldName} is required`, 400, 'INVALID_HEX');
  }

  if (!value.startsWith('0x')) {
    throw new APIError(
      `${fieldName} must start with 0x`,
      400,
      'INVALID_HEX'
    );
  }

  const hexPart = value.slice(2);
  if (!/^[a-fA-F0-9]*$/.test(hexPart)) {
    throw new APIError(
      `${fieldName} must contain only hex characters`,
      400,
      'INVALID_HEX'
    );
  }

  if (expectedLength && hexPart.length !== expectedLength * 2) {
    throw new APIError(
      `${fieldName} must be ${expectedLength} bytes (${expectedLength * 2} hex characters)`,
      400,
      'INVALID_HEX'
    );
  }

  return value.toLowerCase();
}

/**
 * Safely parse JSON from request body
 * Catches JSON parsing errors and returns appropriate error response
 *
 * @param request - NextRequest object
 * @returns Parsed JSON body
 * @throws APIError with 400 status if JSON is invalid
 *
 * @example
 * const body = await parseJSONBody<CreateBattleRequest>(request);
 */
export async function parseJSONBody<T>(request: NextRequest): Promise<T> {
  try {
    const body = await request.json();
    return body as T;
  } catch {
    throw ErrorResponses.badRequest('Invalid JSON in request body');
  }
}

/**
 * Validate that required fields exist in an object
 *
 * @param obj - Object to validate
 * @param fields - Array of required field names
 * @param context - Context for error messages (e.g., 'request body')
 * @throws APIError if any required field is missing
 */
export function validateRequiredFields(
  obj: Record<string, unknown>,
  fields: string[],
  context: string = 'request'
): void {
  const missing = fields.filter(field => obj[field] === undefined || obj[field] === null);

  if (missing.length > 0) {
    throw ErrorResponses.badRequest(
      `Missing required fields in ${context}: ${missing.join(', ')}`
    );
  }
}
