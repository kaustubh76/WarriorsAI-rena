import { describe, it, expect } from 'vitest';
import {
  validateAddress,
  validateBigIntString,
  validateInteger,
  validateEnum,
  validateBoolean,
  validateString,
  validateHexString,
  validateRequiredFields,
} from '../validation';
import { APIError } from '../errorHandler';

// Helper to assert APIError thrown with specific code
function expectAPIError(fn: () => void, code: string, status = 400) {
  try {
    fn();
    expect.fail('Expected APIError to be thrown');
  } catch (err) {
    expect(err).toBeInstanceOf(APIError);
    expect((err as APIError).code).toBe(code);
    expect((err as APIError).statusCode).toBe(status);
  }
}

// ═══════════════════════════════════════════════════════
// validateAddress
// ═══════════════════════════════════════════════════════

describe('validateAddress', () => {
  const VALID = '0x1234567890abcdef1234567890abcdef12345678';

  it('accepts valid lowercase address', () => {
    expect(validateAddress(VALID)).toBe(VALID);
  });

  it('normalizes mixed case to lowercase', () => {
    const mixed = '0x1234567890ABCDEF1234567890abcdef12345678';
    expect(validateAddress(mixed)).toBe(mixed.toLowerCase());
  });

  it('rejects missing 0x prefix', () => {
    expectAPIError(() => validateAddress('1234567890abcdef1234567890abcdef12345678'), 'INVALID_ADDRESS');
  });

  it('rejects too short', () => {
    expectAPIError(() => validateAddress('0x1234'), 'INVALID_ADDRESS');
  });

  it('rejects too long', () => {
    expectAPIError(() => validateAddress(VALID + 'ff'), 'INVALID_ADDRESS');
  });

  it('rejects non-hex characters', () => {
    expectAPIError(() => validateAddress('0xGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG'), 'INVALID_ADDRESS');
  });

  it('rejects empty string', () => {
    expectAPIError(() => validateAddress(''), 'INVALID_ADDRESS');
  });

  it('uses custom field name in error', () => {
    try {
      validateAddress('bad', 'walletAddress');
    } catch (err) {
      expect((err as APIError).message).toContain('walletAddress');
    }
  });
});

// ═══════════════════════════════════════════════════════
// validateBigIntString
// ═══════════════════════════════════════════════════════

describe('validateBigIntString', () => {
  it('accepts valid positive string', () => {
    expect(validateBigIntString('1000000000000000000', 'amount')).toBe('1000000000000000000');
  });

  it('rejects negative by default', () => {
    expectAPIError(() => validateBigIntString('-100', 'amount'), 'INVALID_AMOUNT');
  });

  it('allows negative when min is explicitly negative', () => {
    expect(validateBigIntString('-50', 'balance', { min: -100n })).toBe('-50');
  });

  it('rejects zero by default', () => {
    expectAPIError(() => validateBigIntString('0', 'amount'), 'INVALID_AMOUNT');
  });

  it('allows zero with allowZero', () => {
    expect(validateBigIntString('0', 'amount', { allowZero: true })).toBe('0');
  });

  it('rejects non-numeric string', () => {
    expectAPIError(() => validateBigIntString('abc', 'amount'), 'INVALID_AMOUNT');
  });

  it('rejects empty string', () => {
    expectAPIError(() => validateBigIntString('', 'amount'), 'INVALID_AMOUNT');
  });

  it('enforces min bound', () => {
    expectAPIError(() => validateBigIntString('5', 'amount', { min: 10n }), 'INVALID_AMOUNT');
    expect(validateBigIntString('10', 'amount', { min: 10n })).toBe('10');
  });

  it('enforces max bound', () => {
    expectAPIError(() => validateBigIntString('100', 'amount', { max: 50n }), 'INVALID_AMOUNT');
    expect(validateBigIntString('50', 'amount', { max: 50n })).toBe('50');
  });

  it('handles very large BigInt values', () => {
    const large = '999999999999999999999999999999';
    expect(validateBigIntString(large, 'amount')).toBe(large);
  });
});

// ═══════════════════════════════════════════════════════
// validateInteger
// ═══════════════════════════════════════════════════════

describe('validateInteger', () => {
  it('accepts valid integer', () => {
    expect(validateInteger(42, 'id')).toBe(42);
  });

  it('parses string integer', () => {
    expect(validateInteger('42', 'id')).toBe(42);
  });

  it('rejects float', () => {
    expectAPIError(() => validateInteger(3.14, 'id'), 'INVALID_INTEGER');
  });

  it('rejects NaN', () => {
    expectAPIError(() => validateInteger(NaN, 'id'), 'INVALID_INTEGER');
  });

  it('rejects non-numeric string', () => {
    expectAPIError(() => validateInteger('abc', 'id'), 'INVALID_INTEGER');
  });

  it('rejects zero by default', () => {
    expectAPIError(() => validateInteger(0, 'id'), 'INVALID_INTEGER');
  });

  it('allows zero with allowZero', () => {
    expect(validateInteger(0, 'id', { allowZero: true })).toBe(0);
  });

  it('enforces min bound', () => {
    expectAPIError(() => validateInteger(5, 'page', { min: 10 }), 'INVALID_INTEGER');
    expect(validateInteger(10, 'page', { min: 10 })).toBe(10);
  });

  it('enforces max bound', () => {
    expectAPIError(() => validateInteger(100, 'limit', { max: 50 }), 'INVALID_INTEGER');
    expect(validateInteger(50, 'limit', { max: 50 })).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════
// validateEnum
// ═══════════════════════════════════════════════════════

describe('validateEnum', () => {
  const SOURCES = ['polymarket', 'kalshi', 'opinion'] as const;

  it('accepts valid enum value', () => {
    expect(validateEnum('polymarket', SOURCES, 'source')).toBe('polymarket');
  });

  it('rejects invalid value', () => {
    expectAPIError(() => validateEnum('binance', SOURCES, 'source'), 'INVALID_ENUM');
  });

  it('rejects empty string', () => {
    expectAPIError(() => validateEnum('', SOURCES, 'source'), 'INVALID_ENUM');
  });

  it('error includes allowed values', () => {
    try {
      validateEnum('bad', SOURCES, 'source');
    } catch (err) {
      expect((err as APIError).message).toContain('polymarket');
      expect((err as APIError).message).toContain('kalshi');
    }
  });
});

// ═══════════════════════════════════════════════════════
// validateBoolean
// ═══════════════════════════════════════════════════════

describe('validateBoolean', () => {
  it('accepts true/false', () => {
    expect(validateBoolean(true, 'flag')).toBe(true);
    expect(validateBoolean(false, 'flag')).toBe(false);
  });

  it('coerces "true"/"false" strings', () => {
    expect(validateBoolean('true', 'flag')).toBe(true);
    expect(validateBoolean('false', 'flag')).toBe(false);
  });

  it('rejects numbers', () => {
    expectAPIError(() => validateBoolean(1, 'flag'), 'INVALID_BOOLEAN');
    expectAPIError(() => validateBoolean(0, 'flag'), 'INVALID_BOOLEAN');
  });

  it('rejects null/undefined', () => {
    expectAPIError(() => validateBoolean(null, 'flag'), 'INVALID_BOOLEAN');
    expectAPIError(() => validateBoolean(undefined, 'flag'), 'INVALID_BOOLEAN');
  });

  it('rejects "yes"/"no"', () => {
    expectAPIError(() => validateBoolean('yes', 'flag'), 'INVALID_BOOLEAN');
  });
});

// ═══════════════════════════════════════════════════════
// validateString
// ═══════════════════════════════════════════════════════

describe('validateString', () => {
  it('accepts valid string', () => {
    expect(validateString('hello', 'name')).toBe('hello');
  });

  it('rejects empty string', () => {
    expectAPIError(() => validateString('', 'name'), 'INVALID_STRING');
  });

  it('enforces minLength', () => {
    expectAPIError(() => validateString('ab', 'name', { minLength: 3 }), 'INVALID_STRING');
    expect(validateString('abc', 'name', { minLength: 3 })).toBe('abc');
  });

  it('enforces maxLength', () => {
    expectAPIError(() => validateString('abcdef', 'name', { maxLength: 5 }), 'INVALID_STRING');
    expect(validateString('abcde', 'name', { maxLength: 5 })).toBe('abcde');
  });

  it('enforces pattern', () => {
    expectAPIError(() => validateString('abc', 'code', { pattern: /^\d+$/ }), 'INVALID_STRING');
    expect(validateString('123', 'code', { pattern: /^\d+$/ })).toBe('123');
  });
});

// ═══════════════════════════════════════════════════════
// validateHexString
// ═══════════════════════════════════════════════════════

describe('validateHexString', () => {
  it('accepts valid hex string', () => {
    expect(validateHexString('0xabcdef', 'hash')).toBe('0xabcdef');
  });

  it('normalizes to lowercase', () => {
    expect(validateHexString('0xABCDEF', 'hash')).toBe('0xabcdef');
  });

  it('rejects missing 0x prefix', () => {
    expectAPIError(() => validateHexString('abcdef', 'hash'), 'INVALID_HEX');
  });

  it('rejects non-hex characters', () => {
    expectAPIError(() => validateHexString('0xGGGG', 'hash'), 'INVALID_HEX');
  });

  it('rejects empty', () => {
    expectAPIError(() => validateHexString('', 'hash'), 'INVALID_HEX');
  });

  it('validates expected byte length', () => {
    // 32 bytes = 64 hex chars
    const valid32 = '0x' + 'ab'.repeat(32);
    expect(validateHexString(valid32, 'hash', 32)).toBe(valid32);

    expectAPIError(() => validateHexString('0xabcd', 'hash', 32), 'INVALID_HEX');
  });
});

// ═══════════════════════════════════════════════════════
// validateRequiredFields
// ═══════════════════════════════════════════════════════

describe('validateRequiredFields', () => {
  it('passes when all fields present', () => {
    expect(() => validateRequiredFields({ a: 1, b: 'x' }, ['a', 'b'])).not.toThrow();
  });

  it('throws when field is missing', () => {
    expect(() => validateRequiredFields({ a: 1 }, ['a', 'b'])).toThrow('b');
  });

  it('throws when field is null', () => {
    expect(() => validateRequiredFields({ a: null }, ['a'])).toThrow('a');
  });

  it('throws when field is undefined', () => {
    expect(() => validateRequiredFields({ a: undefined }, ['a'])).toThrow('a');
  });

  it('lists all missing fields', () => {
    expect(() => validateRequiredFields({}, ['x', 'y', 'z'])).toThrow(/x.*y.*z/);
  });

  it('allows falsy non-null values (0, false, "")', () => {
    expect(() => validateRequiredFields({ a: 0, b: false, c: '' }, ['a', 'b', 'c'])).not.toThrow();
  });
});
