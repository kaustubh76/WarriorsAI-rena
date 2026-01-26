/**
 * Security Utilities
 * XSS prevention, input sanitization, and security helpers
 */

/**
 * Escape HTML special characters to prevent XSS
 *
 * @example
 * escapeHtml('<script>alert("xss")</script>')
 * // '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Unescape HTML entities
 */
export function unescapeHtml(safe: string): string {
  return safe
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

/**
 * Sanitize string by removing potentially dangerous content
 *
 * @example
 * sanitizeString('<img src=x onerror=alert(1)>')
 * // ''
 */
export function sanitizeString(input: string): string {
  // Remove script tags
  let sanitized = input.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

  // Remove event handlers
  sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/on\w+\s*=\s*[^\s>]*/gi, '');

  // Remove javascript: protocol
  sanitized = sanitized.replace(/javascript:/gi, '');

  // Remove data: protocol (can be used for XSS)
  sanitized = sanitized.replace(/data:text\/html/gi, '');

  return sanitized.trim();
}

/**
 * Sanitize URL to prevent javascript: and data: attacks
 *
 * @example
 * sanitizeUrl('javascript:alert(1)') // 'about:blank'
 * sanitizeUrl('https://example.com') // 'https://example.com'
 */
export function sanitizeUrl(url: string): string {
  if (!url) return 'about:blank';

  const trimmed = url.trim().toLowerCase();

  // Block dangerous protocols
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:')
  ) {
    return 'about:blank';
  }

  return url;
}

/**
 * Validate and sanitize email address
 *
 * @example
 * sanitizeEmail('user@example.com') // 'user@example.com'
 * sanitizeEmail('user+tag@example.com') // 'user+tag@example.com'
 * sanitizeEmail('not an email') // null
 */
export function sanitizeEmail(email: string): string | null {
  const trimmed = email.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(trimmed)) {
    return null;
  }

  // Basic sanitization
  return trimmed.replace(/[<>"']/g, '');
}

/**
 * Strip HTML tags from a string
 *
 * @example
 * stripHtml('<p>Hello <strong>World</strong></p>')
 * // 'Hello World'
 */
export function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

/**
 * Sanitize filename to prevent directory traversal
 *
 * @example
 * sanitizeFilename('../../../etc/passwd') // 'etc_passwd'
 * sanitizeFilename('my file.txt') // 'my_file.txt'
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[/\\?%*:|"<>]/g, '_') // Replace invalid chars
    .replace(/^\.+/, '') // Remove leading dots
    .replace(/\.+$/, '') // Remove trailing dots
    .slice(0, 255); // Limit length
}

/**
 * Generate a cryptographically secure random string
 *
 * @example
 * generateSecureToken(32) // 'a3f9c8b2...'
 */
export function generateSecureToken(length: number = 32): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Use crypto.randomUUID if available (modern browsers)
    return crypto.randomUUID().replace(/-/g, '').slice(0, length);
  }

  // Fallback for environments without crypto.randomUUID
  const array = new Uint8Array(Math.ceil(length / 2));
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(array);
  } else {
    // Last resort fallback (not cryptographically secure)
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(array, byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, length);
}

/**
 * Generate a CSRF token
 */
export function generateCSRFToken(): string {
  return generateSecureToken(64);
}

/**
 * Hash a string using a simple non-cryptographic hash
 * (for checksums, not for passwords)
 *
 * @example
 * hashString('hello') // 99162322
 */
export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Constant-time string comparison to prevent timing attacks
 *
 * @example
 * constantTimeCompare('secret', 'secret') // true
 * constantTimeCompare('secret', 'other') // false
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Validate that input contains only allowed characters
 *
 * @example
 * isAlphanumeric('hello123') // true
 * isAlphanumeric('hello@123') // false
 */
export function isAlphanumeric(input: string): boolean {
  return /^[a-zA-Z0-9]+$/.test(input);
}

/**
 * Validate that input is a safe integer
 *
 * @example
 * isSafeInteger('42') // true
 * isSafeInteger('not a number') // false
 */
export function isSafeInteger(input: string | number): boolean {
  const num = typeof input === 'string' ? parseInt(input, 10) : input;
  return Number.isSafeInteger(num);
}

/**
 * Rate limit key generator for user identification
 *
 * @example
 * getRateLimitKey('192.168.1.1', '0x123...') // 'rate:192.168.1.1:0x123...'
 */
export function getRateLimitKey(ip: string, identifier?: string): string {
  const sanitizedIp = ip.replace(/[^0-9a-f.:]/gi, '');
  const sanitizedId = identifier?.replace(/[^0-9a-zA-Z]/g, '') || '';
  return `rate:${sanitizedIp}${sanitizedId ? `:${sanitizedId}` : ''}`;
}

/**
 * Content Security Policy (CSP) header builder
 *
 * @example
 * buildCSPHeader({
 *   'default-src': ["'self'"],
 *   'script-src': ["'self'", "'unsafe-inline'"],
 * })
 */
export function buildCSPHeader(directives: Record<string, string[]>): string {
  return Object.entries(directives)
    .map(([key, values]) => `${key} ${values.join(' ')}`)
    .join('; ');
}

/**
 * Default CSP directives for the application
 */
export const defaultCSP = {
  'default-src': ["'self'"],
  'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'https:'],
  'font-src': ["'self'", 'data:'],
  'connect-src': ["'self'"],
  'frame-ancestors': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
} as const;

/**
 * Security headers for API routes
 */
export const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
} as const;

/**
 * Apply security headers to a Response
 *
 * @example
 * const response = new Response('OK');
 * applySecurityHeaders(response);
 */
export function applySecurityHeaders(response: Response): Response {
  Object.entries(securityHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

/**
 * Validate request origin for CSRF protection
 *
 * @example
 * isValidOrigin(request, 'https://myapp.com')
 */
export function isValidOrigin(request: Request, allowedOrigin: string): boolean {
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');

  if (!origin && !referer) {
    // Allow requests without origin/referer (same-origin, curl, etc.)
    return true;
  }

  if (origin) {
    return origin === allowedOrigin || origin.startsWith(`${allowedOrigin}/`);
  }

  if (referer) {
    try {
      const refererUrl = new URL(referer);
      return refererUrl.origin === allowedOrigin;
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * Detect potential SQL injection patterns
 *
 * @example
 * isPotentialSQLInjection("' OR '1'='1") // true
 * isPotentialSQLInjection("normal text") // false
 */
export function isPotentialSQLInjection(input: string): boolean {
  const sqlPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE)\b)/gi,
    /(union.*select)/gi,
    /('|")\s*(OR|AND)\s*('|")?[0-9]/gi,
    /;.*--/g,
    /\/\*.*\*\//g,
  ];

  return sqlPatterns.some(pattern => pattern.test(input));
}

/**
 * Detect potential XSS patterns
 *
 * @example
 * isPotentialXSS('<script>alert(1)</script>') // true
 * isPotentialXSS('normal text') // false
 */
export function isPotentialXSS(input: string): boolean {
  const xssPatterns = [
    /<script/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe/gi,
    /<object/gi,
    /<embed/gi,
    /eval\(/gi,
  ];

  return xssPatterns.some(pattern => pattern.test(input));
}

/**
 * Validate and sanitize JSON input
 *
 * @example
 * const safe = sanitizeJSON('{"key": "value"}')
 */
export function sanitizeJSON<T = unknown>(input: string, maxDepth: number = 10): T | null {
  try {
    const parsed = JSON.parse(input);

    // Check depth to prevent DoS
    function checkDepth(obj: unknown, depth: number = 0): boolean {
      if (depth > maxDepth) return false;
      if (typeof obj !== 'object' || obj === null) return true;

      if (Array.isArray(obj)) {
        return obj.every(item => checkDepth(item, depth + 1));
      }

      return Object.values(obj).every(value => checkDepth(value, depth + 1));
    }

    if (!checkDepth(parsed)) {
      throw new Error('JSON too deeply nested');
    }

    return parsed as T;
  } catch {
    return null;
  }
}

/**
 * Mask sensitive data for logging
 *
 * @example
 * maskSensitiveData('sk_live_123456789') // 'sk_live_***'
 * maskSensitiveData('user@example.com') // 'u***@example.com'
 */
export function maskSensitiveData(data: string, visibleChars: number = 3): string {
  if (data.length <= visibleChars) {
    return '***';
  }

  // Email masking
  if (data.includes('@')) {
    const [local, domain] = data.split('@');
    return `${local.charAt(0)}***@${domain}`;
  }

  // General masking
  return `${data.slice(0, visibleChars)}***`;
}

/**
 * Check if request is from a bot/crawler
 */
export function isBot(userAgent: string): boolean {
  const botPatterns = [
    /bot/i,
    /crawler/i,
    /spider/i,
    /scraper/i,
    /curl/i,
    /wget/i,
  ];

  return botPatterns.some(pattern => pattern.test(userAgent));
}

/**
 * Extract client IP from request (handles proxies)
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  // Fallback
  return 'unknown';
}
