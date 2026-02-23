/**
 * Environment Variable Validation
 *
 * Runs at import time and logs warnings for missing critical env vars.
 * Does NOT throw — missing vars are handled gracefully at the usage site.
 * This just surfaces misconfiguration early in server logs.
 */

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
}

const CRITICAL_ENV_VARS: EnvVar[] = [
  // Blockchain keys
  { name: 'PRIVATE_KEY', required: true, description: 'Primary wallet private key for Flow transactions' },
  { name: 'CRON_SECRET', required: true, description: 'Bearer token for cron job authentication' },
  { name: 'INTERNAL_API_KEY', required: true, description: 'Key for internal API authentication' },

  // RPC & contract addresses
  { name: 'NEXT_PUBLIC_FLOW_CADENCE_ADDRESS', required: true, description: 'Flow Cadence contract address (ScheduledBattle)' },
  { name: 'NEXT_PUBLIC_FLOW_RPC_URL', required: false, description: 'Flow EVM RPC URL (has default fallback)' },

  // Oracle & game master
  { name: 'ORACLE_SIGNER_PRIVATE_KEY', required: false, description: 'Oracle signing key for market resolution' },
  { name: 'GAME_MASTER_PRIVATE_KEY', required: false, description: 'Game master key for battle execution' },

  // URLs
  { name: 'NEXT_PUBLIC_BASE_URL', required: false, description: 'Base URL for OG images and metadata' },
];

let validated = false;

export function validateEnv(): { missing: string[]; warnings: string[] } {
  if (validated) return { missing: [], warnings: [] };
  validated = true;

  const missing: string[] = [];
  const warnings: string[] = [];

  for (const envVar of CRITICAL_ENV_VARS) {
    const value = process.env[envVar.name];
    if (!value) {
      if (envVar.required) {
        missing.push(envVar.name);
      } else {
        warnings.push(envVar.name);
      }
    }
  }

  if (missing.length > 0 || warnings.length > 0) {
    console.warn('[Env Validation] Environment check completed:');
    if (missing.length > 0) {
      console.warn(`  MISSING (required): ${missing.join(', ')}`);
    }
    if (warnings.length > 0) {
      console.warn(`  MISSING (optional): ${warnings.join(', ')}`);
    }
  }

  return { missing, warnings };
}

// Auto-validate on server-side import (only in Node, not during build)
if (typeof window === 'undefined' && process.env.NEXT_PHASE !== 'phase-production-build') {
  validateEnv();
}
