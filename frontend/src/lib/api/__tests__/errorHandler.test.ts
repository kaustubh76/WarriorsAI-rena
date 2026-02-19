import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  APIError,
  handleAPIError,
  ErrorResponses,
  FlowTransactionError,
  handleFlowError,
} from '../errorHandler';

// ---------- helpers ----------
async function extractBody(response: Response) {
  return response.json();
}

// ---------- APIError class ----------
describe('APIError', () => {
  it('should construct with message and default statusCode of 500', () => {
    const err = new APIError('something broke');
    expect(err.message).toBe('something broke');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBeUndefined();
    expect(err.details).toBeUndefined();
  });

  it('should accept custom statusCode, code, and details', () => {
    const details = { field: 'email' };
    const err = new APIError('bad input', 400, 'BAD_REQUEST', details);
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.details).toEqual(details);
  });

  it('should have name set to "APIError"', () => {
    const err = new APIError('test');
    expect(err.name).toBe('APIError');
  });

  it('should be an instance of Error', () => {
    const err = new APIError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(APIError);
  });

  it('should have a stack trace', () => {
    const err = new APIError('trace me');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('trace me');
  });
});

// ---------- handleAPIError ----------
describe('handleAPIError', () => {
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalNodeEnv = process.env.NODE_ENV;
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    vi.restoreAllMocks();
  });

  it('should log the error with the context prefix', () => {
    const err = new APIError('oops', 400, 'BAD');
    handleAPIError(err, 'TestContext');
    expect(console.error).toHaveBeenCalledWith('[TestContext]', err);
  });

  // --- APIError routing ---
  it('should return correct JSON for an APIError', async () => {
    const err = new APIError('not allowed', 403, 'FORBIDDEN', { reason: 'role' });
    const res = handleAPIError(err, 'auth');
    expect(res.status).toBe(403);
    const body = await extractBody(res);
    expect(body).toEqual({
      error: 'not allowed',
      code: 'FORBIDDEN',
      details: { reason: 'role' },
    });
  });

  it('should handle APIError with no code or details', async () => {
    const err = new APIError('fail');
    const res = handleAPIError(err, 'ctx');
    expect(res.status).toBe(500);
    const body = await extractBody(res);
    expect(body.error).toBe('fail');
  });

  // --- Prisma error codes ---
  describe('Prisma error mapping', () => {
    const prismaCases: Array<{
      prismaCode: string;
      expectedStatus: number;
      expectedMessage: string;
      expectedCode: string;
    }> = [
      { prismaCode: 'P2000', expectedStatus: 400, expectedMessage: 'Value too long for column', expectedCode: 'VALUE_TOO_LONG' },
      { prismaCode: 'P2001', expectedStatus: 404, expectedMessage: 'Record not found', expectedCode: 'NOT_FOUND' },
      { prismaCode: 'P2002', expectedStatus: 409, expectedMessage: 'Unique constraint violation', expectedCode: 'DUPLICATE' },
      { prismaCode: 'P2003', expectedStatus: 400, expectedMessage: 'Foreign key constraint failed', expectedCode: 'INVALID_REFERENCE' },
      { prismaCode: 'P2025', expectedStatus: 404, expectedMessage: 'Resource not found', expectedCode: 'NOT_FOUND' },
    ];

    for (const tc of prismaCases) {
      it(`should map Prisma code ${tc.prismaCode} to ${tc.expectedStatus} / ${tc.expectedCode}`, async () => {
        const prismaErr = { code: tc.prismaCode, message: 'prisma msg', meta: { target: ['email'] } };
        const res = handleAPIError(prismaErr, 'db');
        expect(res.status).toBe(tc.expectedStatus);
        const body = await extractBody(res);
        expect(body.error).toBe(tc.expectedMessage);
        expect(body.code).toBe(tc.expectedCode);
        expect(body.details).toEqual({ target: ['email'] });
      });
    }

    it('should return 500 DATABASE_ERROR for unknown Prisma code', async () => {
      const prismaErr = { code: 'P9999', message: 'unknown prisma' };
      const res = handleAPIError(prismaErr, 'db');
      expect(res.status).toBe(500);
      const body = await extractBody(res);
      expect(body.error).toBe('Database operation failed');
      expect(body.code).toBe('DATABASE_ERROR');
      expect(body.details).toEqual({ prismaCode: 'P9999' });
    });
  });

  // --- plain Error in development ---
  it('should expose error message and stack in development', async () => {
    process.env.NODE_ENV = 'development';
    const err = new Error('dev leak');
    const res = handleAPIError(err, 'dev');
    expect(res.status).toBe(500);
    const body = await extractBody(res);
    expect(body.error).toBe('dev leak');
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.details).toBeDefined();
    expect(body.details.stack).toContain('dev leak');
  });

  // --- plain Error in production ---
  it('should hide error message and stack in production', async () => {
    process.env.NODE_ENV = 'production';
    const err = new Error('secret details');
    const res = handleAPIError(err, 'prod');
    expect(res.status).toBe(500);
    const body = await extractBody(res);
    expect(body.error).toBe('Internal server error');
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.details).toBeUndefined();
  });

  // --- unknown error type ---
  it('should return 500 UNKNOWN_ERROR for a string error', async () => {
    const res = handleAPIError('just a string', 'misc');
    expect(res.status).toBe(500);
    const body = await extractBody(res);
    expect(body.error).toBe('An unexpected error occurred');
    expect(body.code).toBe('UNKNOWN_ERROR');
  });

  it('should return 500 UNKNOWN_ERROR for null', async () => {
    const res = handleAPIError(null, 'misc');
    expect(res.status).toBe(500);
    const body = await extractBody(res);
    expect(body.error).toBe('An unexpected error occurred');
    expect(body.code).toBe('UNKNOWN_ERROR');
  });

  it('should return 500 UNKNOWN_ERROR for undefined', async () => {
    const res = handleAPIError(undefined, 'misc');
    expect(res.status).toBe(500);
    const body = await extractBody(res);
    expect(body.error).toBe('An unexpected error occurred');
    expect(body.code).toBe('UNKNOWN_ERROR');
  });

  it('should return 500 UNKNOWN_ERROR for a number', async () => {
    const res = handleAPIError(42, 'misc');
    expect(res.status).toBe(500);
    const body = await extractBody(res);
    expect(body.error).toBe('An unexpected error occurred');
    expect(body.code).toBe('UNKNOWN_ERROR');
  });
});

// ---------- ErrorResponses ----------
describe('ErrorResponses', () => {
  it('notFound() should produce 404 NOT_FOUND with default message', () => {
    const err = ErrorResponses.notFound();
    expect(err).toBeInstanceOf(APIError);
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
  });

  it('notFound() should accept a custom resource name', () => {
    const err = ErrorResponses.notFound('Warrior');
    expect(err.message).toBe('Warrior not found');
  });

  it('unauthorized() should produce 401 UNAUTHORIZED with default message', () => {
    const err = ErrorResponses.unauthorized();
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
    expect(err.message).toBe('Authentication required');
  });

  it('unauthorized() should accept a custom message', () => {
    const err = ErrorResponses.unauthorized('Token expired');
    expect(err.message).toBe('Token expired');
  });

  it('forbidden() should produce 403 FORBIDDEN with default message', () => {
    const err = ErrorResponses.forbidden();
    expect(err.statusCode).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toBe('Access denied');
  });

  it('forbidden() should accept a custom message', () => {
    const err = ErrorResponses.forbidden('Admin only');
    expect(err.message).toBe('Admin only');
  });

  it('badRequest() should produce 400 BAD_REQUEST with message and optional details', () => {
    const err = ErrorResponses.badRequest('Invalid email', { field: 'email' });
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('BAD_REQUEST');
    expect(err.message).toBe('Invalid email');
    expect(err.details).toEqual({ field: 'email' });
  });

  it('badRequest() should work without details', () => {
    const err = ErrorResponses.badRequest('Missing field');
    expect(err.details).toBeUndefined();
  });

  it('conflict() should produce 409 CONFLICT with default message', () => {
    const err = ErrorResponses.conflict();
    expect(err.statusCode).toBe(409);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toBe('Resource already exists');
  });

  it('conflict() should accept a custom message', () => {
    const err = ErrorResponses.conflict('Warrior name taken');
    expect(err.message).toBe('Warrior name taken');
  });

  it('rateLimitExceeded() should produce 429 RATE_LIMIT_EXCEEDED with resetIn detail', () => {
    const err = ErrorResponses.rateLimitExceeded(5000);
    expect(err.statusCode).toBe(429);
    expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(err.message).toBe('Rate limit exceeded. Try again in 5 seconds');
    expect(err.details).toEqual({ resetIn: 5000 });
  });

  it('rateLimitExceeded() should ceil fractional seconds', () => {
    const err = ErrorResponses.rateLimitExceeded(1500);
    expect(err.message).toBe('Rate limit exceeded. Try again in 2 seconds');
    expect(err.details).toEqual({ resetIn: 1500 });
  });

  it('internal() should produce 500 INTERNAL_ERROR with default message', () => {
    const err = ErrorResponses.internal();
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('INTERNAL_ERROR');
    expect(err.message).toBe('Internal server error');
  });

  it('internal() should accept a custom message', () => {
    const err = ErrorResponses.internal('DB down');
    expect(err.message).toBe('DB down');
  });

  it('serviceUnavailable() should produce 503 SERVICE_UNAVAILABLE with default message', () => {
    const err = ErrorResponses.serviceUnavailable();
    expect(err.statusCode).toBe(503);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    expect(err.message).toBe('Service temporarily unavailable');
  });

  it('serviceUnavailable() should accept a custom message', () => {
    const err = ErrorResponses.serviceUnavailable('Maintenance');
    expect(err.message).toBe('Maintenance');
  });
});

// ---------- FlowTransactionError ----------
describe('FlowTransactionError', () => {
  it('should construct with message and optional fields', () => {
    const orig = new Error('original');
    const err = new FlowTransactionError('tx failed', 'tx-123', 42, orig);
    expect(err.message).toBe('tx failed');
    expect(err.statusCode).toBe(500);
    expect(err.code).toBe('FLOW_TX_ERROR');
    expect(err.name).toBe('FlowTransactionError');
    expect(err.transactionId).toBe('tx-123');
    expect(err.blockHeight).toBe(42);
    expect(err.originalError).toBe(orig);
  });

  it('should extend APIError and Error', () => {
    const err = new FlowTransactionError('test');
    expect(err).toBeInstanceOf(FlowTransactionError);
    expect(err).toBeInstanceOf(APIError);
    expect(err).toBeInstanceOf(Error);
  });

  it('should default optional fields to undefined', () => {
    const err = new FlowTransactionError('minimal');
    expect(err.transactionId).toBeUndefined();
    expect(err.blockHeight).toBeUndefined();
    expect(err.originalError).toBeUndefined();
  });
});

// ---------- handleFlowError ----------
describe('handleFlowError', () => {
  it('should return 504 FLOW_TIMEOUT for timeout errors', () => {
    const err = { message: 'transaction timed out waiting for seal' };
    const result = handleFlowError(err, 'executeBattle');
    expect(result).toBeInstanceOf(APIError);
    expect(result.statusCode).toBe(504);
    expect(result.code).toBe('FLOW_TIMEOUT');
    expect(result.message).toContain('timed out');
    expect(result.message).toContain('executeBattle');
  });

  it('should also catch "timeout" keyword', () => {
    const err = { message: 'timeout exceeded' };
    const result = handleFlowError(err, 'ctx');
    expect(result.statusCode).toBe(504);
    expect(result.code).toBe('FLOW_TIMEOUT');
  });

  it('should return 400 INSUFFICIENT_BALANCE for insufficient FLOW errors', () => {
    const err = { message: 'insufficient FLOW tokens' };
    const result = handleFlowError(err, 'stake');
    expect(result.statusCode).toBe(400);
    expect(result.code).toBe('INSUFFICIENT_BALANCE');
    expect(result.message).toContain('Insufficient FLOW balance');
  });

  it('should also catch "insufficient balance" keyword', () => {
    const err = { message: 'account has insufficient balance' };
    const result = handleFlowError(err, 'ctx');
    expect(result.statusCode).toBe(400);
    expect(result.code).toBe('INSUFFICIENT_BALANCE');
  });

  it('should return 404 BATTLE_NOT_FOUND for not found via message', () => {
    const err = { message: 'resource not found on chain' };
    const result = handleFlowError(err, 'getBattle');
    expect(result.statusCode).toBe(404);
    expect(result.code).toBe('BATTLE_NOT_FOUND');
  });

  it('should return 404 BATTLE_NOT_FOUND for not found via statusCode', () => {
    const err = { statusCode: 404, message: 'something else' };
    const result = handleFlowError(err, 'getBattle');
    expect(result.statusCode).toBe(404);
    expect(result.code).toBe('BATTLE_NOT_FOUND');
  });

  it('should return 409 ALREADY_EXECUTED for "already executed"', () => {
    const err = { message: 'battle already executed' };
    const result = handleFlowError(err, 'execute');
    expect(result.statusCode).toBe(409);
    expect(result.code).toBe('ALREADY_EXECUTED');
  });

  it('should return 409 ALREADY_EXECUTED for "already completed"', () => {
    const err = { message: 'this battle is already completed' };
    const result = handleFlowError(err, 'execute');
    expect(result.statusCode).toBe(409);
    expect(result.code).toBe('ALREADY_EXECUTED');
  });

  it('should return 400 TOO_EARLY for "too early"', () => {
    const err = { message: 'execution is too early' };
    const result = handleFlowError(err, 'execute');
    expect(result.statusCode).toBe(400);
    expect(result.code).toBe('TOO_EARLY');
  });

  it('should return 400 TOO_EARLY for "scheduled time"', () => {
    const err = { message: 'cannot execute before scheduled time' };
    const result = handleFlowError(err, 'execute');
    expect(result.statusCode).toBe(400);
    expect(result.code).toBe('TOO_EARLY');
  });

  it('should return 503 NETWORK_ERROR for "network" keyword', () => {
    const err = { message: 'network request failed' };
    const result = handleFlowError(err, 'submit');
    expect(result.statusCode).toBe(503);
    expect(result.code).toBe('NETWORK_ERROR');
  });

  it('should return 503 NETWORK_ERROR for "connection" keyword', () => {
    const err = { message: 'connection refused' };
    const result = handleFlowError(err, 'submit');
    expect(result.statusCode).toBe(503);
    expect(result.code).toBe('NETWORK_ERROR');
  });

  it('should return FlowTransactionError for unknown errors', () => {
    const err = { message: 'some cadence panic', transactionId: 'tx-abc', blockHeight: 100 };
    const result = handleFlowError(err, 'execute');
    expect(result).toBeInstanceOf(FlowTransactionError);
    expect(result.statusCode).toBe(500);
    expect(result.code).toBe('FLOW_TX_ERROR');
    expect(result.message).toContain('execute');
    expect(result.message).toContain('some cadence panic');
    const ftErr = result as FlowTransactionError;
    expect(ftErr.transactionId).toBe('tx-abc');
    expect(ftErr.blockHeight).toBe(100);
    expect(ftErr.originalError).toBe(err);
  });

  it('should handle error with undefined message gracefully', () => {
    const err = { transactionId: 'tx-xyz' };
    const result = handleFlowError(err, 'ctx');
    expect(result).toBeInstanceOf(FlowTransactionError);
    expect(result.message).toContain('Unknown error');
  });
});
