/**
 * Array Utilities
 * Common array manipulation functions
 */

/**
 * Split an array into chunks of specified size
 *
 * @example
 * chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
 */
export function chunk<T>(array: T[], size: number): T[][] {
  if (!array.length || size <= 0) return [];

  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get unique values from an array
 *
 * @example
 * unique([1, 2, 2, 3, 3, 3]) // [1, 2, 3]
 */
export function unique<T>(array: T[]): T[] {
  return [...new Set(array)];
}

/**
 * Get unique values by a key function
 *
 * @example
 * uniqueBy([{ id: 1, name: 'a' }, { id: 1, name: 'b' }], item => item.id)
 * // [{ id: 1, name: 'a' }]
 */
export function uniqueBy<T, K>(array: T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  return array.filter((item) => {
    const key = keyFn(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Group array items by a key function
 *
 * @example
 * groupBy([{ type: 'a', val: 1 }, { type: 'b', val: 2 }, { type: 'a', val: 3 }], item => item.type)
 * // { a: [{ type: 'a', val: 1 }, { type: 'a', val: 3 }], b: [{ type: 'b', val: 2 }] }
 */
export function groupBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, T[]> {
  return array.reduce((groups, item) => {
    const key = keyFn(item);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(item);
    return groups;
  }, {} as Record<K, T[]>);
}

/**
 * Count occurrences of items by a key function
 *
 * @example
 * countBy(['a', 'b', 'a', 'c', 'a'], x => x)
 * // { a: 3, b: 1, c: 1 }
 */
export function countBy<T, K extends string | number>(
  array: T[],
  keyFn: (item: T) => K
): Record<K, number> {
  return array.reduce((counts, item) => {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {} as Record<K, number>);
}

/**
 * Flatten a nested array
 *
 * @example
 * flatten([[1, 2], [3, [4, 5]]]) // [1, 2, 3, [4, 5]]
 * flatten([[1, 2], [3, [4, 5]]], 2) // [1, 2, 3, 4, 5]
 */
export function flatten<T>(array: T[], depth: number = 1): T[] {
  return array.flat(depth) as T[];
}

/**
 * Sort an array by multiple criteria
 *
 * @example
 * sortBy(users, [
 *   { key: 'lastName', order: 'asc' },
 *   { key: 'firstName', order: 'asc' }
 * ])
 */
export function sortBy<T>(
  array: T[],
  criteria: { key: keyof T; order?: 'asc' | 'desc' }[]
): T[] {
  return [...array].sort((a, b) => {
    for (const { key, order = 'asc' } of criteria) {
      const aVal = a[key];
      const bVal = b[key];

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

/**
 * Shuffle an array (Fisher-Yates algorithm)
 *
 * @example
 * shuffle([1, 2, 3, 4, 5]) // [3, 1, 5, 2, 4] (random order)
 */
export function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Pick random item(s) from an array
 *
 * @example
 * sample([1, 2, 3, 4, 5]) // random single item
 * sample([1, 2, 3, 4, 5], 2) // [random, random]
 */
export function sample<T>(array: T[], count?: number): T | T[] {
  if (!array.length) return count ? [] : (undefined as unknown as T);

  if (count === undefined) {
    return array[Math.floor(Math.random() * array.length)];
  }

  const shuffled = shuffle(array);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Get the intersection of two arrays
 *
 * @example
 * intersection([1, 2, 3], [2, 3, 4]) // [2, 3]
 */
export function intersection<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => setB.has(item));
}

/**
 * Get the difference of two arrays (items in a but not in b)
 *
 * @example
 * difference([1, 2, 3], [2, 3, 4]) // [1]
 */
export function difference<T>(a: T[], b: T[]): T[] {
  const setB = new Set(b);
  return a.filter((item) => !setB.has(item));
}

/**
 * Get the union of two arrays (all unique items)
 *
 * @example
 * union([1, 2, 3], [2, 3, 4]) // [1, 2, 3, 4]
 */
export function union<T>(a: T[], b: T[]): T[] {
  return unique([...a, ...b]);
}

/**
 * Partition an array into two based on a predicate
 *
 * @example
 * partition([1, 2, 3, 4, 5], n => n % 2 === 0)
 * // [[2, 4], [1, 3, 5]]
 */
export function partition<T>(
  array: T[],
  predicate: (item: T) => boolean
): [T[], T[]] {
  const truthy: T[] = [];
  const falsy: T[] = [];

  for (const item of array) {
    if (predicate(item)) {
      truthy.push(item);
    } else {
      falsy.push(item);
    }
  }

  return [truthy, falsy];
}

/**
 * Get the first N items from an array
 *
 * @example
 * take([1, 2, 3, 4, 5], 3) // [1, 2, 3]
 */
export function take<T>(array: T[], count: number): T[] {
  return array.slice(0, count);
}

/**
 * Get the last N items from an array
 *
 * @example
 * takeLast([1, 2, 3, 4, 5], 3) // [3, 4, 5]
 */
export function takeLast<T>(array: T[], count: number): T[] {
  return array.slice(-count);
}

/**
 * Get the first item that matches a predicate
 *
 * @example
 * findFirst([1, 2, 3, 4], n => n > 2) // 3
 */
export function findFirst<T>(
  array: T[],
  predicate: (item: T) => boolean
): T | undefined {
  return array.find(predicate);
}

/**
 * Get the last item that matches a predicate
 *
 * @example
 * findLast([1, 2, 3, 4], n => n < 4) // 3
 */
export function findLast<T>(
  array: T[],
  predicate: (item: T) => boolean
): T | undefined {
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) {
      return array[i];
    }
  }
  return undefined;
}

/**
 * Create a range of numbers
 *
 * @example
 * range(5) // [0, 1, 2, 3, 4]
 * range(1, 5) // [1, 2, 3, 4]
 * range(0, 10, 2) // [0, 2, 4, 6, 8]
 */
export function range(start: number, end?: number, step: number = 1): number[] {
  if (end === undefined) {
    end = start;
    start = 0;
  }

  const result: number[] = [];
  for (let i = start; step > 0 ? i < end : i > end; i += step) {
    result.push(i);
  }
  return result;
}

/**
 * Sum all numbers in an array
 *
 * @example
 * sum([1, 2, 3, 4, 5]) // 15
 */
export function sum(array: number[]): number {
  return array.reduce((acc, val) => acc + val, 0);
}

/**
 * Calculate average of numbers in an array
 *
 * @example
 * average([1, 2, 3, 4, 5]) // 3
 */
export function average(array: number[]): number {
  if (!array.length) return 0;
  return sum(array) / array.length;
}

/**
 * Find min and max values in an array
 *
 * @example
 * minMax([3, 1, 4, 1, 5, 9, 2, 6]) // { min: 1, max: 9 }
 */
export function minMax(array: number[]): { min: number; max: number } {
  if (!array.length) {
    return { min: 0, max: 0 };
  }
  return {
    min: Math.min(...array),
    max: Math.max(...array),
  };
}

/**
 * Move an item from one index to another
 *
 * @example
 * move([1, 2, 3, 4, 5], 0, 3) // [2, 3, 4, 1, 5]
 */
export function move<T>(array: T[], from: number, to: number): T[] {
  const result = [...array];
  const [item] = result.splice(from, 1);
  result.splice(to, 0, item);
  return result;
}

/**
 * Insert an item at a specific index
 *
 * @example
 * insert([1, 2, 4, 5], 2, 3) // [1, 2, 3, 4, 5]
 */
export function insert<T>(array: T[], index: number, item: T): T[] {
  const result = [...array];
  result.splice(index, 0, item);
  return result;
}

/**
 * Remove an item at a specific index
 *
 * @example
 * removeAt([1, 2, 3, 4, 5], 2) // [1, 2, 4, 5]
 */
export function removeAt<T>(array: T[], index: number): T[] {
  const result = [...array];
  result.splice(index, 1);
  return result;
}
