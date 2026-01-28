/**
 * Data Transformation Utilities
 * Convert, normalize, and transform data structures
 */

/**
 * Deep clone an object
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Array) {
    return obj.map(item => deepClone(item)) as T;
  }

  if (obj instanceof Map) {
    const cloned = new Map();
    obj.forEach((value, key) => {
      cloned.set(key, deepClone(value));
    });
    return cloned as T;
  }

  if (obj instanceof Set) {
    const cloned = new Set();
    obj.forEach(value => {
      cloned.add(deepClone(value));
    });
    return cloned as T;
  }

  const cloned = {} as T;
  Object.keys(obj).forEach(key => {
    (cloned as Record<string, unknown>)[key] = deepClone((obj as Record<string, unknown>)[key]);
  });

  return cloned;
}

/**
 * Flatten nested object
 */
export function flatten(
  obj: Record<string, unknown>,
  prefix: string = '',
  separator: string = '.'
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  Object.keys(obj).forEach(key => {
    const value = obj[key];
    const newKey = prefix ? `${prefix}${separator}${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, newKey, separator));
    } else {
      result[newKey] = value;
    }
  });

  return result;
}

/**
 * Unflatten object
 */
export function unflatten(
  obj: Record<string, unknown>,
  separator: string = '.'
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  Object.keys(obj).forEach(key => {
    const keys = key.split(separator);
    keys.reduce((acc, k, index) => {
      if (index === keys.length - 1) {
        acc[k] = obj[key];
      } else {
        acc[k] = acc[k] || {};
      }
      return acc[k] as Record<string, unknown>;
    }, result);
  });

  return result;
}

/**
 * Convert object keys to camelCase
 */
export function keysToCamelCase<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => keysToCamelCase(item)) as T;
  }

  const result: Record<string, unknown> = {};
  Object.keys(obj).forEach(key => {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = keysToCamelCase((obj as Record<string, unknown>)[key]);
  });

  return result as T;
}

/**
 * Convert object keys to snake_case
 */
export function keysToSnakeCase<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => keysToSnakeCase(item)) as T;
  }

  const result: Record<string, unknown> = {};
  Object.keys(obj).forEach(key => {
    const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
    result[snakeKey] = keysToSnakeCase((obj as Record<string, unknown>)[key]);
  });

  return result as T;
}

/**
 * Normalize array to map by key
 */
export function normalizeArray<T extends Record<string, unknown>>(
  array: T[],
  key: keyof T = 'id' as keyof T
): Record<string, T> {
  return array.reduce((acc, item) => {
    acc[String(item[key])] = item;
    return acc;
  }, {} as Record<string, T>);
}

/**
 * Denormalize map back to array
 */
export function denormalizeMap<T>(map: Record<string, T>): T[] {
  return Object.values(map);
}

/**
 * Group array by key
 */
export function groupBy<T extends Record<string, unknown>>(
  array: T[],
  key: keyof T
): Record<string, T[]> {
  return array.reduce((acc, item) => {
    const groupKey = String(item[key]);
    if (!acc[groupKey]) {
      acc[groupKey] = [];
    }
    acc[groupKey].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Index array by multiple keys
 */
export function indexBy<T extends Record<string, unknown>>(
  array: T[],
  keys: (keyof T)[]
): Map<string, T> {
  const index = new Map<string, T>();

  array.forEach(item => {
    const key = keys.map(k => String(item[k])).join(':');
    index.set(key, item);
  });

  return index;
}

/**
 * Diff two objects
 */
export function diff<T extends Record<string, unknown>>(
  oldObj: T,
  newObj: T
): {
  added: Partial<T>;
  removed: Partial<T>;
  changed: Partial<T>;
} {
  const added: Partial<T> = {};
  const removed: Partial<T> = {};
  const changed: Partial<T> = {};

  // Check for added and changed keys
  Object.keys(newObj).forEach(key => {
    if (!(key in oldObj)) {
      added[key as keyof T] = newObj[key as keyof T];
    } else if (oldObj[key as keyof T] !== newObj[key as keyof T]) {
      changed[key as keyof T] = newObj[key as keyof T];
    }
  });

  // Check for removed keys
  Object.keys(oldObj).forEach(key => {
    if (!(key in newObj)) {
      removed[key as keyof T] = oldObj[key as keyof T];
    }
  });

  return { added, removed, changed };
}

/**
 * Merge objects deeply
 */
export function deepMerge<T extends Record<string, unknown>>(...objects: Partial<T>[]): T {
  const result: Record<string, unknown> = {};

  objects.forEach(obj => {
    Object.keys(obj).forEach(key => {
      const value = obj[key as keyof T];
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[key] = deepMerge(
          result[key] as Record<string, unknown> || {},
          value as Record<string, unknown>
        );
      } else {
        result[key] = value;
      }
    });
  });

  return result as T;
}

/**
 * Pick specific keys from object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  keys.forEach(key => {
    if (key in obj) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Omit specific keys from object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  keys.forEach(key => {
    delete result[key];
  });
  return result;
}

/**
 * Remove null and undefined values
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key as keyof T];
    if (value !== null && value !== undefined) {
      result[key as keyof T] = value;
    }
  });
  return result;
}

/**
 * Remove falsy values
 */
export function compactFalsy<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  Object.keys(obj).forEach(key => {
    const value = obj[key as keyof T];
    if (value) {
      result[key as keyof T] = value;
    }
  });
  return result;
}

/**
 * Sort array of objects by key
 */
export function sortBy<T extends Record<string, unknown>>(
  array: T[],
  key: keyof T,
  order: 'asc' | 'desc' = 'asc'
): T[] {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];

    if (aVal < bVal) return order === 'asc' ? -1 : 1;
    if (aVal > bVal) return order === 'asc' ? 1 : -1;
    return 0;
  });
}

/**
 * Paginate array
 */
export function paginate<T>(
  array: T[],
  page: number,
  pageSize: number
): {
  data: T[];
  page: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
} {
  const totalItems = array.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const data = array.slice(start, end);

  return {
    data,
    page,
    pageSize,
    totalPages,
    totalItems,
  };
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Unique values in array
 */
export function unique<T>(array: T[]): T[] {
  return Array.from(new Set(array));
}

/**
 * Unique by key
 */
export function uniqueBy<T extends Record<string, unknown>>(
  array: T[],
  key: keyof T
): T[] {
  const seen = new Set();
  return array.filter(item => {
    const value = item[key];
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

/**
 * Intersection of arrays
 */
export function intersection<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  if (arrays.length === 1) return arrays[0];

  const [first, ...rest] = arrays;
  return first.filter(item =>
    rest.every(arr => arr.includes(item))
  );
}

/**
 * Difference between arrays
 */
export function difference<T>(array1: T[], array2: T[]): T[] {
  return array1.filter(item => !array2.includes(item));
}

/**
 * Union of arrays
 */
export function union<T>(...arrays: T[][]): T[] {
  return unique(arrays.flat());
}

/**
 * Zip arrays together
 */
export function zip<T>(...arrays: T[][]): T[][] {
  const length = Math.max(...arrays.map(arr => arr.length));
  const result: T[][] = [];

  for (let i = 0; i < length; i++) {
    result.push(arrays.map(arr => arr[i]));
  }

  return result;
}

/**
 * Aggregate data with reducer functions
 */
export function aggregate<T extends Record<string, unknown>>(
  array: T[],
  aggregations: Record<string, (items: T[]) => unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  Object.entries(aggregations).forEach(([key, fn]) => {
    result[key] = fn(array);
  });

  return result;
}

/**
 * Common aggregation functions
 */
export const aggregators = {
  sum: <T extends Record<string, unknown>>(key: keyof T) => (items: T[]) =>
    items.reduce((sum, item) => sum + Number(item[key] || 0), 0),

  avg: <T extends Record<string, unknown>>(key: keyof T) => (items: T[]) => {
    const sum = items.reduce((sum, item) => sum + Number(item[key] || 0), 0);
    return items.length > 0 ? sum / items.length : 0;
  },

  min: <T extends Record<string, unknown>>(key: keyof T) => (items: T[]) => {
    const values = items.map(item => Number(item[key] || Infinity));
    return Math.min(...values);
  },

  max: <T extends Record<string, unknown>>(key: keyof T) => (items: T[]) => {
    const values = items.map(item => Number(item[key] || -Infinity));
    return Math.max(...values);
  },

  count: () => <T>(items: T[]) => items.length,

  countBy: <T extends Record<string, unknown>>(key: keyof T) => (items: T[]) => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      const value = String(item[key]);
      counts[value] = (counts[value] || 0) + 1;
    });
    return counts;
  },
};

/**
 * Transform object values
 */
export function mapValues<T extends Record<string, unknown>, R>(
  obj: T,
  fn: (value: T[keyof T], key: keyof T) => R
): Record<keyof T, R> {
  const result = {} as Record<keyof T, R>;
  (Object.keys(obj) as (keyof T)[]).forEach(key => {
    result[key] = fn(obj[key], key);
  });
  return result;
}

/**
 * Transform object keys
 */
export function mapKeys<T extends Record<string, unknown>>(
  obj: T,
  fn: (key: keyof T, value: T[keyof T]) => string
): Record<string, T[keyof T]> {
  const result: Record<string, T[keyof T]> = {};
  (Object.keys(obj) as (keyof T)[]).forEach(key => {
    const newKey = fn(key, obj[key]);
    result[newKey] = obj[key];
  });
  return result;
}

/**
 * Filter object by predicate
 */
export function filterObject<T extends Record<string, unknown>>(
  obj: T,
  predicate: (value: T[keyof T], key: keyof T) => boolean
): Partial<T> {
  const result: Partial<T> = {};
  (Object.keys(obj) as (keyof T)[]).forEach(key => {
    if (predicate(obj[key], key)) {
      result[key] = obj[key];
    }
  });
  return result;
}

/**
 * Get nested value safely
 */
export function getPath<T>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T | undefined {
  const keys = path.split('.');
  let result: unknown = obj;

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return defaultValue;
    }
  }

  return result as T;
}

/**
 * Set nested value
 */
export function setPath<T extends Record<string, unknown>>(
  obj: T,
  path: string,
  value: unknown
): T {
  const keys = path.split('.');
  const lastKey = keys.pop()!;
  let current: Record<string, unknown> = obj;

  for (const key of keys) {
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[lastKey] = value;
  return obj;
}
