/**
 * String Utilities
 * Common string manipulation functions
 */

/**
 * Capitalize the first letter of a string
 *
 * @example
 * capitalize('hello world') // "Hello world"
 */
export function capitalize(str: string): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Capitalize each word in a string
 *
 * @example
 * capitalizeWords('hello world') // "Hello World"
 */
export function capitalizeWords(str: string): string {
  if (!str) return '';
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Convert a string to title case (capitalize each word, lowercase rest)
 *
 * @example
 * toTitleCase('HELLO WORLD') // "Hello World"
 */
export function toTitleCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Convert a string to slug format (URL-friendly)
 *
 * @example
 * slugify('Hello World!') // "hello-world"
 * slugify('Will Bitcoin hit $100k?') // "will-bitcoin-hit-100k"
 */
export function slugify(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove non-word chars (except spaces and hyphens)
    .replace(/[\s_-]+/g, '-') // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
}

/**
 * Convert a string to camelCase
 *
 * @example
 * toCamelCase('hello-world') // "helloWorld"
 * toCamelCase('Hello World') // "helloWorld"
 */
export function toCamelCase(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char.toUpperCase());
}

/**
 * Convert a string to kebab-case
 *
 * @example
 * toKebabCase('helloWorld') // "hello-world"
 * toKebabCase('Hello World') // "hello-world"
 */
export function toKebabCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

/**
 * Convert a string to snake_case
 *
 * @example
 * toSnakeCase('helloWorld') // "hello_world"
 * toSnakeCase('Hello World') // "hello_world"
 */
export function toSnakeCase(str: string): string {
  if (!str) return '';
  return str
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

/**
 * Truncate a string to a maximum length with ellipsis
 *
 * @example
 * truncate('Hello World', 8) // "Hello..."
 * truncate('Hello World', 8, '…') // "Hello W…"
 */
export function truncate(
  str: string,
  maxLength: number,
  suffix: string = '...'
): string {
  if (!str || str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Truncate a string in the middle
 *
 * @example
 * truncateMiddle('Hello World', 8) // "Hel...ld"
 */
export function truncateMiddle(
  str: string,
  maxLength: number,
  separator: string = '...'
): string {
  if (!str || str.length <= maxLength) return str;

  const charsToShow = maxLength - separator.length;
  const frontChars = Math.ceil(charsToShow / 2);
  const backChars = Math.floor(charsToShow / 2);

  return str.slice(0, frontChars) + separator + str.slice(-backChars);
}

/**
 * Remove HTML tags from a string
 *
 * @example
 * stripHtml('<p>Hello <b>World</b></p>') // "Hello World"
 */
export function stripHtml(str: string): string {
  if (!str) return '';
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Escape HTML special characters
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
 */
export function escapeHtml(str: string): string {
  if (!str) return '';
  const escapeMap: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return str.replace(/[&<>"']/g, (char) => escapeMap[char]);
}

/**
 * Generate a random string of specified length
 *
 * @example
 * randomString(8) // "aB3xY9kL"
 */
export function randomString(
  length: number,
  charset: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
}

/**
 * Generate a unique ID
 *
 * @example
 * uniqueId('user') // "user_abc123xyz"
 */
export function uniqueId(prefix: string = ''): string {
  const id = Date.now().toString(36) + randomString(6).toLowerCase();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Check if a string is empty or contains only whitespace
 *
 * @example
 * isEmpty('') // true
 * isEmpty('   ') // true
 * isEmpty('hello') // false
 */
export function isEmpty(str: string | null | undefined): boolean {
  return !str || str.trim().length === 0;
}

/**
 * Pluralize a word based on count
 *
 * @example
 * pluralize('item', 1) // "item"
 * pluralize('item', 5) // "items"
 * pluralize('person', 5, 'people') // "people"
 */
export function pluralize(
  singular: string,
  count: number,
  plural?: string
): string {
  if (count === 1) return singular;
  return plural || `${singular}s`;
}

/**
 * Format a string with placeholders
 *
 * @example
 * format('Hello {name}!', { name: 'World' }) // "Hello World!"
 * format('Item {0} of {1}', ['1', '10']) // "Item 1 of 10"
 */
export function format(
  template: string,
  values: Record<string, string | number> | (string | number)[]
): string {
  if (Array.isArray(values)) {
    return template.replace(/\{(\d+)\}/g, (_, index) => {
      return String(values[parseInt(index)] ?? '');
    });
  }
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    return String(values[key] ?? '');
  });
}

/**
 * Count words in a string
 *
 * @example
 * wordCount('Hello world!') // 2
 */
export function wordCount(str: string): number {
  if (!str) return 0;
  return str.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Extract initials from a name
 *
 * @example
 * getInitials('John Doe') // "JD"
 * getInitials('Alice Bob Charlie', 2) // "AB"
 */
export function getInitials(name: string, maxInitials: number = 2): string {
  if (!name) return '';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxInitials)
    .map((word) => word[0].toUpperCase())
    .join('');
}

/**
 * Convert a string to a hash code (for consistent colors, etc.)
 *
 * @example
 * hashCode('hello') // consistent number
 */
export function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Generate a color from a string (useful for avatars)
 *
 * @example
 * stringToColor('John Doe') // "#a3b4c5"
 */
export function stringToColor(str: string): string {
  const hash = hashCode(str);
  const hue = hash % 360;
  return `hsl(${hue}, 65%, 50%)`;
}
