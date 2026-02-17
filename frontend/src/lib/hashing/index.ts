/**
 * Consistent Hashing Module
 *
 * Pre-configured hash rings for deterministic routing across the system:
 * - RPC node selection (Flow + 0G chains)
 * - Cache bucket distribution
 * - 0G compute provider selection
 *
 * All rings are module-level singletons — constructed once on cold start (< 1ms).
 */

export { ConsistentHashRing, fnv1a } from './consistentHash';
import { ConsistentHashRing } from './consistentHash';

// ============================================================================
// Types
// ============================================================================

export interface RPCNode {
  id: string;
  url: string;
  chainId: number;
}

export interface CacheBucketConfig {
  id: string;
  index: number;
}

// ============================================================================
// RPC Node Hash Ring
// ============================================================================

/**
 * Hash ring for Flow blockchain RPC node selection.
 * Routes requests deterministically by key (marketId, walletAddress)
 * so the same entity always hits the same RPC — enabling node-level caching.
 */
export const flowRpcRing = new ConsistentHashRing<RPCNode>({ virtualNodes: 150 });

/**
 * Hash ring for 0G network RPC node selection.
 */
export const zeroGRpcRing = new ConsistentHashRing<RPCNode>({ virtualNodes: 150 });

/**
 * Hash ring for 0G compute provider selection.
 * Routes inference requests deterministically by battle/agent ID.
 */
export const providerRing = new ConsistentHashRing<string>({ virtualNodes: 100 });

// ============================================================================
// Cache Distribution Hash Ring
// ============================================================================

/**
 * Hash ring for distributing cache entries across buckets.
 * Prevents thundering herd on a single cache instance.
 */
export const cacheRing = new ConsistentHashRing<CacheBucketConfig>({ virtualNodes: 50 });

// ============================================================================
// Initialization Helpers
// ============================================================================

/**
 * Initialize the Flow RPC hash ring with available nodes.
 * Called from apiConfig.ts at module load time.
 *
 * @param nodes - Array of { id, url, weight } for Flow RPC endpoints
 */
export function initFlowRpcRing(
  nodes: Array<{ id: string; url: string; weight?: number }>
): void {
  const chainId = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID || '545', 10);

  for (const node of nodes) {
    flowRpcRing.addNode(node.id, {
      id: node.id,
      url: node.url,
      chainId,
    }, node.weight ?? 1);
  }
}

/**
 * Initialize the 0G RPC hash ring with available nodes.
 *
 * @param nodes - Array of { id, url, weight } for 0G RPC endpoints
 */
export function initZeroGRpcRing(
  nodes: Array<{ id: string; url: string; weight?: number }>
): void {
  const chainId = parseInt(process.env.NEXT_PUBLIC_0G_CHAIN_ID || '16602', 10);

  for (const node of nodes) {
    zeroGRpcRing.addNode(node.id, {
      id: node.id,
      url: node.url,
      chainId,
    }, node.weight ?? 1);
  }
}

/**
 * Initialize the 0G provider hash ring from discovered providers.
 * Called dynamically when provider list is fetched.
 *
 * @param providers - Array of provider addresses
 */
export function initProviderRing(providers: string[]): void {
  for (const address of providers) {
    providerRing.addNode(address, address);
  }
}

/**
 * Initialize cache bucket ring.
 *
 * @param bucketCount - Number of cache buckets to distribute across
 */
export function initCacheRing(bucketCount: number): void {
  for (let i = 0; i < bucketCount; i++) {
    cacheRing.addNode(`bucket-${i}`, {
      id: `bucket-${i}`,
      index: i,
    });
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Get the Flow RPC URL for a given routing key.
 * Falls back to default RPC if ring is empty.
 *
 * @param key - Routing key (e.g., marketId, walletAddress)
 * @param defaultUrl - Fallback URL if ring is empty
 * @returns The selected RPC URL
 */
export function getFlowRpcForKey(key: string, defaultUrl?: string): string {
  const node = flowRpcRing.getNode(key);
  if (node) return node.url;
  return defaultUrl || process.env.NEXT_PUBLIC_FLOW_RPC_URL || 'https://testnet.evm.nodes.onflow.org';
}

/**
 * Get the 0G RPC URL for a given routing key.
 *
 * @param key - Routing key
 * @param defaultUrl - Fallback URL if ring is empty
 * @returns The selected RPC URL
 */
export function getZeroGRpcForKey(key: string, defaultUrl?: string): string {
  const node = zeroGRpcRing.getNode(key);
  if (node) return node.url;
  return defaultUrl || process.env.NEXT_PUBLIC_0G_COMPUTE_RPC || 'https://evmrpc-testnet.0g.ai';
}

/**
 * Get the best 0G provider for a routing key, with health-based fallback.
 *
 * @param key - Routing key (e.g., battleId, agentId)
 * @param healthyProviders - Set of currently healthy provider addresses
 * @returns The selected provider address, or undefined
 */
export function getProviderForKey(
  key: string,
  healthyProviders?: Set<string>
): string | undefined {
  if (providerRing.size === 0) return undefined;

  // If no health data, just use hash ring directly
  if (!healthyProviders) {
    return providerRing.getNode(key);
  }

  // Get multiple candidates from ring, pick first healthy one
  const candidates = providerRing.getNodes(key, providerRing.size);
  for (const candidate of candidates) {
    if (healthyProviders.has(candidate)) {
      return candidate;
    }
  }

  // All unhealthy — return the hash ring's primary choice anyway
  return providerRing.getNode(key);
}

/**
 * Get the cache bucket index for a given key.
 *
 * @param key - Cache key
 * @returns Bucket index (0-based), or 0 if ring not initialized
 */
export function getCacheBucketForKey(key: string): number {
  const bucket = cacheRing.getNode(key);
  return bucket?.index ?? 0;
}
