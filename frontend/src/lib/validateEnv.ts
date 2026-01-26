/**
 * Environment Variable Validation
 *
 * Validates that all required environment variables are present at startup.
 * This prevents runtime failures due to missing configuration.
 */

// Required for the application to function (no fallback defaults)
const requiredServerEnvVars = [
  'DATABASE_URL',
] as const;

// Blockchain environment variables (have fallback defaults but recommended in production)
// These are checked as warnings rather than hard requirements
const recommendedBlockchainEnvVars = [
  'NEXT_PUBLIC_FLOW_RPC_URL',
  'NEXT_PUBLIC_0G_COMPUTE_RPC',
] as const;

// Required for private key operations (server-side only)
const sensitiveEnvVars = [
  'PRIVATE_KEY',
  'GAME_MASTER_PRIVATE_KEY',
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
