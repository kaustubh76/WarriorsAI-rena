import { describe, it, expect } from 'vitest';
import { fnv1a, ConsistentHashRing } from '../consistentHash';

// ---------- FNV-1a hash ----------
describe('fnv1a', () => {
  it('should return a positive 32-bit unsigned integer', () => {
    const hash = fnv1a('hello');
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('should be deterministic', () => {
    expect(fnv1a('test-key')).toBe(fnv1a('test-key'));
  });

  it('should produce different hashes for different inputs', () => {
    expect(fnv1a('key-a')).not.toBe(fnv1a('key-b'));
  });

  it('should handle empty string', () => {
    const hash = fnv1a('');
    expect(hash).toBe(0x811c9dc5 >>> 0); // FNV offset basis
  });

  it('should produce well-distributed values', () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      buckets.add(fnv1a(`key-${i}`) % 100);
    }
    // With 1000 keys into 100 buckets, expect most buckets filled
    expect(buckets.size).toBeGreaterThan(90);
  });
});

// ---------- ConsistentHashRing ----------
describe('ConsistentHashRing', () => {
  describe('basic operations', () => {
    it('should return undefined for empty ring', () => {
      const ring = new ConsistentHashRing<string>();
      expect(ring.getNode('any-key')).toBeUndefined();
      expect(ring.getNodeId('any-key')).toBeUndefined();
    });

    it('should have size 0 for empty ring', () => {
      const ring = new ConsistentHashRing<string>();
      expect(ring.size).toBe(0);
      expect(ring.ringSize).toBe(0);
    });

    it('should add a node and return it', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('node-1', 'https://rpc1.example.com');
      expect(ring.size).toBe(1);
      expect(ring.ringSize).toBe(150); // default virtual nodes
    });

    it('should always route to the single node when only one exists', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('node-1', 'https://rpc1.example.com');

      for (let i = 0; i < 100; i++) {
        expect(ring.getNode(`key-${i}`)).toBe('https://rpc1.example.com');
      }
    });
  });

  describe('determinism', () => {
    it('should always return the same node for the same key', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('node-1', 'url-1');
      ring.addNode('node-2', 'url-2');
      ring.addNode('node-3', 'url-3');

      const expected = ring.getNode('market:0x1234');
      for (let i = 0; i < 50; i++) {
        expect(ring.getNode('market:0x1234')).toBe(expected);
      }
    });

    it('should return the same nodeId for the same key', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('a', 'data-a');
      ring.addNode('b', 'data-b');

      const id = ring.getNodeId('test-key');
      expect(ring.getNodeId('test-key')).toBe(id);
    });
  });

  describe('distribution', () => {
    it('should distribute keys across multiple nodes', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.addNode('n2', 'url-2');
      ring.addNode('n3', 'url-3');

      const counts: Record<string, number> = {};
      for (let i = 0; i < 3000; i++) {
        const node = ring.getNode(`key-${i}`)!;
        counts[node] = (counts[node] || 0) + 1;
      }

      // All nodes should get some traffic
      expect(Object.keys(counts).length).toBe(3);
      for (const count of Object.values(counts)) {
        // Each should get at least 15% (1000 per node ideal = 33%)
        expect(count).toBeGreaterThan(450);
      }
    });

    it('weighted nodes should get proportionally more traffic', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('heavy', 'url-heavy', 3);
      ring.addNode('light', 'url-light', 1);

      const dist = ring.getDistribution(10000);
      const heavyPct = dist.get('heavy') || 0;
      const lightPct = dist.get('light') || 0;

      // Heavy (weight 3) should get roughly 3x more than light (weight 1)
      expect(heavyPct).toBeGreaterThan(lightPct * 2);
    });

    it('getDistribution should return percentages summing to ~100', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('a', 'a');
      ring.addNode('b', 'b');

      const dist = ring.getDistribution();
      let total = 0;
      for (const pct of dist.values()) {
        total += pct;
      }
      expect(total).toBeCloseTo(100, 0);
    });
  });

  describe('removeNode', () => {
    it('should remove a node', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.addNode('n2', 'url-2');
      expect(ring.size).toBe(2);

      ring.removeNode('n1');
      expect(ring.size).toBe(1);
    });

    it('should route all keys to remaining node after removal', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.addNode('n2', 'url-2');

      ring.removeNode('n1');

      for (let i = 0; i < 100; i++) {
        expect(ring.getNode(`key-${i}`)).toBe('url-2');
      }
    });

    it('should be a no-op for non-existent node', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.removeNode('n99');
      expect(ring.size).toBe(1);
    });

    it('should minimize redistribution', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.addNode('n2', 'url-2');
      ring.addNode('n3', 'url-3');

      // Record assignments before removal
      const before = new Map<string, string>();
      for (let i = 0; i < 1000; i++) {
        before.set(`key-${i}`, ring.getNode(`key-${i}`)!);
      }

      ring.removeNode('n2');

      // Keys that were on n1 or n3 should still be on n1 or n3
      let movedFromN1OrN3 = 0;
      for (let i = 0; i < 1000; i++) {
        const key = `key-${i}`;
        const prev = before.get(key)!;
        const now = ring.getNode(key)!;
        if (prev !== 'url-2' && prev !== now) {
          movedFromN1OrN3++;
        }
      }

      // Very few keys should have moved from their original node
      // (only keys that were on n2 get redistributed)
      expect(movedFromN1OrN3).toBe(0);
    });
  });

  describe('getNodes (replication)', () => {
    it('should return empty array for empty ring', () => {
      const ring = new ConsistentHashRing<string>();
      expect(ring.getNodes('key', 3)).toEqual([]);
    });

    it('should return all distinct nodes up to count', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.addNode('n2', 'url-2');
      ring.addNode('n3', 'url-3');

      const nodes = ring.getNodes('key', 3);
      expect(nodes.length).toBe(3);
      expect(new Set(nodes).size).toBe(3);
    });

    it('should return at most the number of physical nodes', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.addNode('n2', 'url-2');

      const nodes = ring.getNodes('key', 5);
      expect(nodes.length).toBe(2);
    });

    it('should return nodes in consistent order', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.addNode('n2', 'url-2');
      ring.addNode('n3', 'url-3');

      const first = ring.getNodes('key', 3);
      const second = ring.getNodes('key', 3);
      expect(first).toEqual(second);
    });
  });

  describe('getAllNodes', () => {
    it('should return all registered nodes', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-1');
      ring.addNode('n2', 'url-2');

      const all = ring.getAllNodes();
      expect(all.size).toBe(2);
      expect(all.get('n1')).toBe('url-1');
      expect(all.get('n2')).toBe('url-2');
    });
  });

  describe('re-adding node', () => {
    it('should replace existing node on re-add', () => {
      const ring = new ConsistentHashRing<string>();
      ring.addNode('n1', 'url-old');
      ring.addNode('n1', 'url-new');

      expect(ring.size).toBe(1);
      expect(ring.getAllNodes().get('n1')).toBe('url-new');
    });
  });

  describe('custom options', () => {
    it('should respect custom virtualNodes count', () => {
      const ring = new ConsistentHashRing<string>({ virtualNodes: 50 });
      ring.addNode('n1', 'url-1');
      expect(ring.ringSize).toBe(50);
    });

    it('should accept a custom hash function', () => {
      const simpleHash = (s: string) => s.length;
      const ring = new ConsistentHashRing<string>({
        virtualNodes: 10,
        hashFunction: simpleHash,
      });
      ring.addNode('n1', 'url-1');
      expect(ring.size).toBe(1);
    });
  });
});
