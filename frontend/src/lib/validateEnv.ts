/**
 * Environment Variable Validation
 *
 * Validates that all required environment variables are present at startup.
 * This prevents runtime failures due to missing configuration.
 */

// Required for the application to function (no fallback defaults)
const requiredServerEnvVars = [
  'DATABASE_URL',
  'EXTERNAL_MARKET_MIRROR_ADDRESS', // Required for Flow mirror market operations
] as const;

// Blockchain environment variables (have fallback defaults but recommended in production)
// These are checked as warnings rather than hard requirements
const recommendedBlockchainEnvVars = [
  'NEXT_PUBLIC_FLOW_RPC_URL',
  'NEXT_PUBLIC_0G_COMPUTE_RPC',
] as const;

// Required for private key operations (server-side only)
// These are checked separately to avoid logging secrets
const sensitiveEnvVars = [
  'PRIVATE_KEY',              // Oracle signing key for Flow operations
  'GAME_MASTER_PRIVATE_KEY',  // Game master signing key
  'CRON_SECRET',              // Secret for automated cron job authentication
] as const;

// Public environment variables (exposed to client)
const publicEnvVars = [
  'NEXT_PUBLIC_CHAIN_ID',
  'NEXT_PUBLIC_FLOW_RPC_URL',
  'NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID',
] as const;

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates required environment variables.
 * Call this at application startup to fail fast on missing config.
 */
export function validateEnvironment(options?: {
  strict?: boolean;
  checkSensitive?: boolean;
}): EnvValidationResult {
  const { strict = false, checkSensitive = false } = options || {};

  const missing: string[] = [];
  const warnings: string[] = [];

  // Check required server env vars
  for (const envVar of requiredServerEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  // Check public env vars (warn if missing, they have defaults)
  for (const envVar of publicEnvVars) {
    if (!process.env[envVar]) {
      warnings.push(`${envVar} not set, using default value`);
    }
  }

  // Check recommended blockchain env vars
  for (const envVar of recommendedBlockchainEnvVars) {
    if (!process.env[envVar]) {
      warnings.push(`${envVar} not set, using default value`);
    }
  }

  // Check sensitive vars only if explicitly requested (avoids logging about secrets)
  if (checkSensitive) {
    for (const envVar of sensitiveEnvVars) {
      if (!process.env[envVar]) {
        if (strict) {
          missing.push(envVar);
        } else {
          warnings.push(`${envVar} not set - some features may not work`);
        }
      }
    }
  }

  const valid = missing.length === 0;

  return { valid, missing, warnings };
}

/**
 * Validates environment and throws an error if validation fails.
 * Use this in server initialization to fail fast.
 */
export function validateEnvironmentOrThrow(options?: {
  strict?: boolean;
  checkSensitive?: boolean;
}): void {
  const result = validateEnvironment(options);

  if (!result.valid) {
    throw new Error(
      `Missing required environment variables: ${result.missing.join(', ')}\n` +
      `Please check your .env file or environment configuration.`
    );
  }

  // Validate CRON_SECRET strength if checking sensitive vars
  if (options?.checkSensitive !== false) {
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret) {
      if (cronSecret.length < 32) {
        throw new Error(
          'CRON_SECRET must be at least 32 characters long for security. ' +
          'Generate a secure secret with: openssl rand -base64 32'
        );
      }
      if (cronSecret === 'change-me-in-production' || cronSecret.toLowerCase().includes('test')) {
        throw new Error(
          'CRON_SECRET must not use default or test values. ' +
          'Generate a secure secret with: openssl rand -base64 32'
        );
      }
    }
  }

  // Log warnings in development
  if (process.env.NODE_ENV === 'development' && result.warnings.length > 0) {
    console.warn('[ENV] Warnings:');
    result.warnings.forEach(warning => console.warn(`  - ${warning}`));
  }
}

/**
 * Get a required environment variable or throw an error.
 * Use this when accessing critical configuration.
 */
export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default.
 */
export function getOptionalEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Check if we're in production mode
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if we're in development mode
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if we're in test mode
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Get environment as typed enum
 */
export function getEnvironment(): 'development' | 'production' | 'test' {
  const env = process.env.NODE_ENV;
  if (env === 'production') return 'production';
  if (env === 'test') return 'test';
  return 'development';
}

/**
 * Typed environment variable validators
 */
export const validators = {
  /**
   * Get required string
   */
  string(key: string): string {
    return getRequiredEnv(key);
  },

  /**
   * Get optional string with default
   */
  optionalString(key: string, defaultValue: string = ''): string {
    return getOptionalEnv(key, defaultValue);
  },

  /**
   * Get required number
   */
  number(key: string): number {
    const value = getRequiredEnv(key);
    const parsed = Number(value);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
    }
    return parsed;
  },

  /**
   * Get optional number with default
   */
  optionalNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (!value) return defaultValue;
    const parsed = Number(value);
    if (isNaN(parsed)) {
      throw new Error(`Environment variable ${key} must be a number, got: ${value}`);
    }
    return parsed;
  },

  /**
   * Get required boolean
   */
  boolean(key: string): boolean {
    const value = getRequiredEnv(key).toLowerCase();
    if (value === 'true' || value === '1' || value === 'yes') return true;
    if (value === 'false' || value === '0' || value === 'no') return false;
    throw new Error(`Environment variable ${key} must be a boolean, got: ${value}`);
  },

  /**
   * Get optional boolean with default
   */
  optionalBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    throw new Error(`Environment variable ${key} must be a boolean, got: ${value}`);
  },

  /**
   * Get required URL
   */
  url(key: string): string {
    const value = getRequiredEnv(key);
    try {
      new URL(value);
      return value;
    } catch {
      throw new Error(`Environment variable ${key} must be a valid URL, got: ${value}`);
    }
  },

  /**
   * Get optional URL with default
   */
  optionalUrl(key: string, defaultValue: string): string {
    const value = process.env[key];
    if (!value) return defaultValue;
    try {
      new URL(value);
      return value;
    } catch {
      throw new Error(`Environment variable ${key} must be a valid URL, got: ${value}`);
    }
  },

  /**
   * Get enum value
   */
  enum<T extends string>(key: string, allowedValues: readonly T[]): T {
    const value = getRequiredEnv(key);
    if (!allowedValues.includes(value as T)) {
      throw new Error(
        `Environment variable ${key} must be one of: ${allowedValues.join(', ')}, got: ${value}`
      );
    }
    return value as T;
  },

  /**
   * Get optional enum value
   */
  optionalEnum<T extends string>(key: string, allowedValues: readonly T[], defaultValue: T): T {
    const value = process.env[key];
    if (!value) return defaultValue;
    if (!allowedValues.includes(value as T)) {
      throw new Error(
        `Environment variable ${key} must be one of: ${allowedValues.join(', ')}, got: ${value}`
      );
    }
    return value as T;
  },

  /**
   * Get JSON value
   */
  json<T>(key: string): T {
    const value = getRequiredEnv(key);
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error(`Environment variable ${key} must be valid JSON, got: ${value}`);
    }
  },

  /**
   * Get optional JSON value
   */
  optionalJson<T>(key: string, defaultValue: T): T {
    const value = process.env[key];
    if (!value) return defaultValue;
    try {
      return JSON.parse(value) as T;
    } catch {
      throw new Error(`Environment variable ${key} must be valid JSON, got: ${value}`);
    }
  },

  /**
   * Get comma-separated list
   */
  list(key: string): string[] {
    const value = getRequiredEnv(key);
    return value.split(',').map(item => item.trim()).filter(Boolean);
  },

  /**
   * Get optional comma-separated list
   */
  optionalList(key: string, defaultValue: string[] = []): string[] {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value.split(',').map(item => item.trim()).filter(Boolean);
  },
};
