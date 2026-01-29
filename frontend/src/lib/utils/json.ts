/**
 * Safe JSON Utilities
 * Provides safe JSON parsing and stringification with error handling
 */

/**
 * Safely parse JSON with a fallback value
 * Returns the fallback if parsing fails or input is null/undefined
 *
 * @param json - The JSON string to parse
 * @param fallback - The value to return if parsing fails
 * @returns The parsed value or the fallback
 *
 * @example
 * // Returns {} if metadata is null or invalid JSON
 * const data = safeJsonParse(market.metadata, {});
 *
 * // Returns [] for array fallback
 * const items = safeJsonParse(config.items, []);
 *
 * // Type-safe with generics
 * interface Config { key: string }
 * const config = safeJsonParse<Config>(json, { key: 'default' });
 */
export function safeJsonParse<T>(
  json: string | null | undefined,
  fallback: T
): T {
  if (json === null || json === undefined || json === '') {
    return fallback;
  }

  try {
    return JSON.parse(json) as T;
  } catch (error) {
    // Log truncated JSON for debugging (avoid logging huge strings)
    const preview = json.length > 100 ? `${json.substring(0, 100)}...` : json;
    console.warn('[safeJsonParse] Failed to parse JSON:', preview, error);
    return fallback;
  }
}

/**
 * Safely stringify a value to JSON
 * Returns undefined if stringification fails
 *
 * @param value - The value to stringify
 * @param space - Number of spaces for indentation (optional)
 * @returns The JSON string or undefined on failure
 */
export function safeJsonStringify(
  value: unknown,
  space?: number
): string | undefined {
  try {
    return JSON.stringify(value, null, space);
  } catch (error) {
    console.warn('[safeJsonStringify] Failed to stringify value:', error);
    return undefined;
  }
}

/**
 * Parse JSON with schema validation (basic type checking)
 * Returns fallback if parsing fails or value doesn't match expected type
 *
 * @param json - The JSON string to parse
 * @param expectedType - The expected typeof the parsed value
 * @param fallback - The value to return if validation fails
 */
export function safeJsonParseTyped<T>(
  json: string | null | undefined,
  expectedType: 'object' | 'array' | 'string' | 'number' | 'boolean',
  fallback: T
): T {
  const parsed = safeJsonParse(json, null);

  if (parsed === null) {
    return fallback;
  }

  // Type validation
  if (expectedType === 'array') {
    if (!Array.isArray(parsed)) {
      console.warn('[safeJsonParseTyped] Expected array, got:', typeof parsed);
      return fallback;
    }
  } else if (typeof parsed !== expectedType) {
    console.warn(`[safeJsonParseTyped] Expected ${expectedType}, got:`, typeof parsed);
    return fallback;
  }

  return parsed as T;
}

/**
 * Parse JSON or return the original value if it's already an object
 * Useful when a field might be stored as JSON string or already parsed
 *
 * @param value - Either a JSON string or an already-parsed object
 * @param fallback - The value to return if parsing fails
 */
export function parseOrReturn<T>(
  value: string | T | null | undefined,
  fallback: T
): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === 'string') {
    return safeJsonParse(value, fallback);
  }

  return value;
}
