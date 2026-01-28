/**
 * Unified Contract ABIs
 *
 * Single source of truth for all contract interfaces.
 * All API routes should import ABIs from this module.
 *
 * Usage:
 * import { EXTERNAL_MARKET_MIRROR_ABI, CRWN_TOKEN_ABI } from '@/constants/abis';
 */

export { EXTERNAL_MARKET_MIRROR_ABI } from './externalMarketMirrorAbi';
export type { ExternalMarketMirrorABI } from './externalMarketMirrorAbi';

export { CRWN_TOKEN_ABI } from './crwnTokenAbi';
export type { CRwNTokenABI } from './crwnTokenAbi';

// Contract addresses - re-export from constants for convenience
export { FLOW_TESTNET_CONTRACTS, FLOW_MAINNET_CONTRACTS } from '../index';
