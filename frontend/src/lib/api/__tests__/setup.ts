/**
 * Global test setup for API middleware tests.
 * Runs before each test file.
 */
import { beforeEach, afterEach, vi } from 'vitest';
import { webcrypto } from 'node:crypto';

// Polyfill crypto.randomUUID for Node < 19
if (typeof globalThis.crypto === 'undefined') {
  globalThis.crypto = webcrypto as Crypto;
}

// Default env vars for all tests
process.env.NODE_ENV = 'test';
process.env.CRON_SECRET = 'test-cron-secret-that-is-at-least-32-characters-long';
process.env.INTERNAL_API_KEY = 'test-internal-key-12345';

// Suppress console noise and enable assertion
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});
