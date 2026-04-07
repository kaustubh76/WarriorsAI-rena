/**
 * Consistent Hash Ring
 *
 * Implements consistent hashing with virtual nodes for even distribution.
 * Used for deterministic routing of requests to RPC nodes, cache buckets,
 * and 0G provider selection.
 *
 * Algorithm: FNV-1a hash with configurable virtual nodes per physical node.
 * Lookup: O(log n) via binary search on a sorted ring.
 * Add/Remove: O(v * log(n*v)) where v = virtual nodes per physical node.
 *
 * Zero external dependencies.
 */

// ============================================================================
// FNV-1a Hash Function
// ============================================================================

/**
 * FNV-1a 32-bit hash function.
 *
 * Fast, zero-dependency hash with excellent distribution for short keys
 * (IP addresses, market IDs, wallet addresses). ~3x faster than MD5.
 *
 * @param str - The string to hash
 * @returns A 32-bit unsigned integer hash
 */
export function fnv1a(str: string): number {
  let hash = 0x811c9dc5; // FNV offset basis

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // FNV prime: multiply by 16777619
    // Use Math.imul for proper 32-bit integer multiplication
    hash = Math.imul(hash, 0x01000193);
  }

  // Ensure unsigned 32-bit integer
  return hash >>> 0;
}

// ============================================================================
// Consistent Hash Ring
// ============================================================================

/** A point on the hash ring mapping to a physical node */
interface RingPoint {
  /** The hash value (position on the ring) */
  hash: number;
  /** The physical node ID this virtual node maps to */
  nodeId: string;
}

/** Configuration for a physical node in the ring */
interface NodeConfig<T> {
  /** The actual node data (URL, cache bucket, provider address, etc.) */
  data: T;
  /** Weight multiplier for virtual nodes (default 1) */
  weight: number;
}

/**
 * Consistent Hash Ring with virtual nodes.
 *
 * Distributes keys across nodes with minimal redistribution when nodes
 * are added or removed. Each physical node gets `virtualNodes * weight`
 * points on the ring for even distribution.
 *
 * @example
 * ```typescript
 * const ring = new ConsistentHashRing<string>({ virtualNodes: 150 });
 * ring.addNode('flow-primary', 'https://testnet.evm.nodes.onflow.org', 3);
 * ring.addNode('flow-backup', 'https://backup.flow.org', 1);
 *
 * // Same key always returns same node (deterministic)
 * const rpcUrl = ring.getNode('market:0x1234');  // Always same RPC
 * const rpcUrl2 = ring.getNode('market:0x5678'); // May be different RPC
 * ```
 */
export class ConsistentHashRing<T> {
  /** Sorted array of ring points for binary search */
  private ring: RingPoint[] = [];
  /** Map of nodeId -> node config */
  private nodes = new Map<string, NodeConfig<T>>();
  /** Number of virtual nodes per weight unit */
  private virtualNodesPerUnit: number;
  /** Custom hash function (defaults to FNV-1a) */
  private hashFn: (key: string) => number;

  constructor(options?: {
    /** Virtual nodes per physical node (per weight unit). Default: 150 */
    virtualNodes?: number;
    /** Custom hash function. Default: FNV-1a */
    hashFunction?: (key: string) => number;
  }) {
    this.virtualNodesPerUnit = options?.virtualNodes ?? 150;
    this.hashFn = options?.hashFunction ?? fnv1a;
  }

  /**
   * Add a node to the hash ring.
   *
   * @param nodeId - Unique identifier for this node
   * @param data - The node data (e.g., URL string, config object)
   * @param weight - Weight multiplier (default 1). Higher weight = more traffic share.
   */
  addNode(nodeId: string, data: T, weight: number = 1): void {
    // Remove existing node if re-adding
    if (this.nodes.has(nodeId)) {
      this.removeNode(nodeId);
    }

    this.nodes.set(nodeId, { data, weight });

    const totalVirtualNodes = this.virtualNodesPerUnit * weight;
    for (let i = 0; i < totalVirtualNodes; i++) {
      const virtualKey = `${nodeId}#${i}`;
      const hash = this.hashFn(virtualKey);
      this.ring.push({ hash, nodeId });
    }

    // Re-sort the ring by hash value
    this.ring.sort((a, b) => a.hash - b.hash);
  }

  /**
   * Remove a node from the hash ring.
   * Only ~1/N of keys will be redistributed to other nodes.
   *
   * @param nodeId - The node ID to remove
   */
  removeNode(nodeId: string): void {
    if (!this.nodes.has(nodeId)) return;

    this.nodes.delete(nodeId);
    this.ring = this.ring.filter(point => point.nodeId !== nodeId);
  }

  /**
   * Get the node responsible for a given key.
   * Uses binary search for O(log n) lookup.
   *
   * @param key - The key to route (e.g., marketId, walletAddress, requestId)
   * @returns The node data, or undefined if the ring is empty
   */
  getNode(key: string): T | undefined {
    if (this.ring.length === 0) return undefined;

    const hash = this.hashFn(key);
    const index = this.findNextPoint(hash);
    const point = this.ring[index];
    const config = this.nodes.get(point.nodeId);

    return config?.data;
  }

  /**
   * Get the node ID responsible for a given key.
   *
   * @param key - The key to route
   * @returns The node ID, or undefined if the ring is empty
   */
  getNodeId(key: string): string | undefined {
    if (this.ring.length === 0) return undefined;

    const hash = this.hashFn(key);
    const index = this.findNextPoint(hash);
    return this.ring[index].nodeId;
  }

  /**
   * Get N distinct nodes for a key (for replication / fallback).
   * Returns nodes in clockwise order from the key's position on the ring.
   *
   * @param key - The key to route
   * @param count - Number of distinct nodes to return
   * @returns Array of node data (may be fewer than count if ring has fewer nodes)
   */
  getNodes(key: string, count: number): T[] {
    if (this.ring.length === 0) return [];

    const hash = this.hashFn(key);
    let index = this.findNextPoint(hash);
    const result: T[] = [];
    const seen = new Set<string>();

    // Walk clockwise around the ring collecting distinct nodes
    for (let i = 0; i < this.ring.length && result.length < count; i++) {
      const point = this.ring[(index + i) % this.ring.length];
      if (!seen.has(point.nodeId)) {
        seen.add(point.nodeId);
        const config = this.nodes.get(point.nodeId);
        if (config) {
          result.push(config.data);
        }
      }
    }

    return result;
  }

  /**
   * Get all registered nodes.
   * @returns Map of nodeId -> node data
   */
  getAllNodes(): Map<string, T> {
    const result = new Map<string, T>();
    for (const [id, config] of this.nodes) {
      result.set(id, config.data);
    }
    return result;
  }

  /**
   * Number of physical nodes in the ring.
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Total number of points on the ring (physical * virtual).
   */
  get ringSize(): number {
    return this.ring.length;
  }

  /**
   * Get approximate key distribution across nodes.
   * Samples the ring to estimate what percentage of keys each node would receive.
   *
   * @param sampleSize - Number of sample points to test (default 10000)
   * @returns Map of nodeId -> approximate percentage of keys
   */
  getDistribution(sampleSize: number = 10000): Map<string, number> {
    const counts = new Map<string, number>();

    for (let i = 0; i < sampleSize; i++) {
      const key = `sample-key-${i}`;
      const nodeId = this.getNodeId(key);
      if (nodeId) {
        counts.set(nodeId, (counts.get(nodeId) || 0) + 1);
      }
    }

    // Convert to percentages
    const distribution = new Map<string, number>();
    for (const [nodeId, count] of counts) {
      distribution.set(nodeId, (count / sampleSize) * 100);
    }

    return distribution;
  }

  /**
   * Binary search to find the first ring point with hash >= target.
   * If no such point exists, wraps around to the first point (index 0).
   */
  private findNextPoint(hash: number): number {
    let low = 0;
    let high = this.ring.length - 1;

    // If hash is greater than all points, wrap to first point
    if (hash > this.ring[high].hash) {
      return 0;
    }

    // Binary search for the first point >= hash
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.ring[mid].hash < hash) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return low;
  }
}
