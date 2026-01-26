/**
 * Object Utilities
 * Common object manipulation functions
 */

/**
 * Pick specific keys from an object
 *
 * @example
 * const user = { id: 1, name: 'John', email: 'john@example.com', password: 'secret' };
 * pick(user, ['id', 'name']) // { id: 1, name: 'John' }
 */
export function pick<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) {
      result[key] = obj[key];
    }
  }
  return result;
}

/**
 * Omit specific keys from an object
 *
 * @example
 * const user = { id: 1, name: 'John', password: 'secret' };
 * omit(user, ['password']) // { id: 1, name: 'John' }
 */
export function omit<T extends object, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result as Omit<T, K>;
}

/**
 * Deep merge multiple objects
 *
 * @example
 * const a = { user: { name: 'John' } };
 * const b = { user: { email: 'john@example.com' } };
 * merge(a, b) // { user: { name: 'John', email: 'john@example.com' } }
 */
export function merge<T extends object>(...objects: Partial<T>[]): T {
  const result: Record<string, unknown> = {};

  for (const obj of objects) {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        const existingValue = result[key];

        if (
          isPlainObject(value) &&
          isPlainObject(existingValue)
        ) {
          result[key] = merge(
            existingValue as Record<string, unknown>,
            value as Record<string, unknown>
          );
        } else {
          result[key] = value;
        }
      }
    }
  }

  return result as T;
}

/**
 * Shallow merge objects (Object.assign alternative)
 *
 * @example
 * shallowMerge({ a: 1 }, { b: 2 }, { c: 3 }) // { a: 1, b: 2, c: 3 }
 */
export function shallowMerge<T extends object>(...objects: Partial<T>[]): T {
  return Object.assign({}, ...objects) as T;
}

/**
 * Check if a value is a plain object
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype;
}

/**
 * Deep clone an object
 *
 * @example
 * const original = { a: { b: 1 } };
 * const cloned = deepClone(original);
 * cloned.a.b = 2;
 * original.a.b // Still 1
 */
export function deepClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(deepClone) as T;
  }

  if (obj instanceof Date) {
    return new Date(obj.getTime()) as T;
  }

  if (obj instanceof Map) {
    return new Map(Array.from(obj.entries()).map(([k, v]) => [k, deepClone(v)])) as T;
  }

  if (obj instanceof Set) {
    return new Set(Array.from(obj).map(deepClone)) as T;
  }

  const cloned: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone((obj as Record<string, unknown>)[key]);
    }
  }
  return cloned as T;
}

/**
 * Check if two values are deeply equal
 *
 * @example
 * isEqual({ a: 1 }, { a: 1 }) // true
 * isEqual([1, 2, 3], [1, 2, 3]) // true
 */
export function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;

  if (typeof a !== typeof b) return false;

  if (a === null || b === null) return a === b;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, index) => isEqual(item, b[index]));
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const aKeys = Object.keys(aObj);
    const bKeys = Object.keys(bObj);

    if (aKeys.length !== bKeys.length) return false;

    return aKeys.every((key) => isEqual(aObj[key], bObj[key]));
  }

  return false;
}

/**
 * Get a nested value from an object using dot notation
 *
 * @example
 * const obj = { user: { profile: { name: 'John' } } };
 * get(obj, 'user.profile.name') // 'John'
 * get(obj, 'user.profile.age', 25) // 25 (default value)
 */
export function get<T = unknown>(
  obj: Record<string, unknown>,
  path: string,
  defaultValue?: T
): T {
  const keys = path.split('.');
  let result: unknown = obj;

  for (const key of keys) {
    if (result === null || result === undefined) {
      return defaultValue as T;
    }
    result = (result as Record<string, unknown>)[key];
  }

  return (result === undefined ? defaultValue : result) as T;
}

/**
 * Set a nested value in an object using dot notation (immutable)
 *
 * @example
 * const obj = { user: { name: 'John' } };
 * set(obj, 'user.name', 'Jane') // { user: { name: 'Jane' } }
 * set(obj, 'user.email', 'jane@example.com') // { user: { name: 'John', email: 'jane@example.com' } }
 */
export function set<T extends object>(
  obj: T,
  path: string,
  value: unknown
): T {
  const keys = path.split('.');
  const result = deepClone(obj) as Record<string, unknown>;

  let current = result;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }

  current[keys[keys.length - 1]] = value;
  return result as T;
}

/**
 * Check if an object has a nested path
 *
 * @example
 * has({ user: { name: 'John' } }, 'user.name') // true
 * has({ user: { name: 'John' } }, 'user.email') // false
 */
export function has(obj: Record<string, unknown>, path: string): boolean {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return false;
    }
    if (!(key in (current as Record<string, unknown>))) {
      return false;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return true;
}

/**
 * Remove undefined and null values from an object
 *
 * @example
 * compact({ a: 1, b: null, c: undefined, d: 0 })
 * // { a: 1, d: 0 }
 */
export function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (obj[key] !== null && obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  return result as Partial<T>;
}

/**
 * Remove falsy values from an object
 *
 * @example
 * compactFalsy({ a: 1, b: '', c: 0, d: false, e: null, f: 'hello' })
 * // { a: 1, f: 'hello' }
 */
export function compactFalsy<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (obj[key]) {
      result[key] = obj[key];
    }
  }
  return result as Partial<T>;
}

/**
 * Transform object keys using a function
 *
 * @example
 * mapKeys({ firstName: 'John', lastName: 'Doe' }, (key) => key.toUpperCase())
 * // { FIRSTNAME: 'John', LASTNAME: 'Doe' }
 */
export function mapKeys<T extends Record<string, unknown>>(
  obj: T,
  fn: (key: string) => string
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[fn(key)] = obj[key];
    }
  }
  return result;
}

/**
 * Transform object values using a function
 *
 * @example
 * mapValues({ a: 1, b: 2, c: 3 }, (value) => value * 2)
 * // { a: 2, b: 4, c: 6 }
 */
export function mapValues<T extends Record<string, unknown>, R>(
  obj: T,
  fn: (value: T[keyof T], key: string) => R
): Record<keyof T, R> {
  const result = {} as Record<keyof T, R>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key as keyof T] = fn(obj[key] as T[keyof T], key);
    }
  }
  return result;
}

/**
 * Invert an object's keys and values
 *
 * @example
 * invert({ a: '1', b: '2', c: '3' })
 * // { '1': 'a', '2': 'b', '3': 'c' }
 */
export function invert<T extends Record<string, string | number>>(
  obj: T
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[String(obj[key])] = key;
    }
  }
  return result;
}

/**
 * Get the difference between two objects
 *
 * @example
 * diff({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })
 * // { b: 3, c: 4 }
 */
export function diff<T extends Record<string, unknown>>(
  original: T,
  updated: T
): Partial<T> {
  const result: Partial<T> = {};

  // Check for changed/added keys in updated
  for (const key in updated) {
    if (!isEqual(original[key], updated[key])) {
      result[key as keyof T] = updated[key];
    }
  }

  return result;
}

/**
 * Convert an object to an array of key-value pairs
 *
 * @example
 * entries({ a: 1, b: 2 })
 * // [['a', 1], ['b', 2]]
 */
export function entries<T extends Record<string, unknown>>(
  obj: T
): [string, T[keyof T]][] {
  return Object.entries(obj) as [string, T[keyof T]][];
}

/**
 * Create an object from an array of key-value pairs
 *
 * @example
 * fromEntries([['a', 1], ['b', 2]])
 * // { a: 1, b: 2 }
 */
export function fromEntries<T>(
  entries: [string, T][]
): Record<string, T> {
  return Object.fromEntries(entries);
}
