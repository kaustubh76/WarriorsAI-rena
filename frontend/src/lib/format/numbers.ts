/**
 * Number Formatting Utilities
 * Functions for formatting numbers, currencies, and percentages
 */

/**
 * Format a number with thousand separators
 *
 * @example
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234.567, 2) // "1,234.57"
 */
export function formatNumber(
  value: number | string | bigint,
  decimals?: number,
  locale: string = 'en-US'
): string {
  const num = typeof value === 'bigint' ? Number(value) : Number(value);

  if (isNaN(num)) return '0';

  const options: Intl.NumberFormatOptions = {};
  if (decimals !== undefined) {
    options.minimumFractionDigits = decimals;
    options.maximumFractionDigits = decimals;
  }

  return num.toLocaleString(locale, options);
}

/**
 * Format a number in compact notation (1K, 1M, 1B)
 *
 * @example
 * formatCompact(1234) // "1.2K"
 * formatCompact(1234567) // "1.2M"
 * formatCompact(1234567890) // "1.2B"
 */
export function formatCompact(
  value: number | string | bigint,
  decimals: number = 1
): string {
  const num = typeof value === 'bigint' ? Number(value) : Number(value);

  if (isNaN(num)) return '0';

  const absNum = Math.abs(num);
  const sign = num < 0 ? '-' : '';

  if (absNum >= 1e12) {
    return sign + (absNum / 1e12).toFixed(decimals) + 'T';
  }
  if (absNum >= 1e9) {
    return sign + (absNum / 1e9).toFixed(decimals) + 'B';
  }
  if (absNum >= 1e6) {
    return sign + (absNum / 1e6).toFixed(decimals) + 'M';
  }
  if (absNum >= 1e3) {
    return sign + (absNum / 1e3).toFixed(decimals) + 'K';
  }

  return sign + absNum.toFixed(decimals);
}

/**
 * Format a number as currency
 *
 * @example
 * formatCurrency(1234.56) // "$1,234.56"
 * formatCurrency(1234.56, 'EUR') // "€1,234.56"
 */
export function formatCurrency(
  value: number | string | bigint,
  currency: string = 'USD',
  locale: string = 'en-US'
): string {
  const num = typeof value === 'bigint' ? Number(value) : Number(value);

  if (isNaN(num)) return '$0.00';

  return num.toLocaleString(locale, {
    style: 'currency',
    currency,
  });
}

/**
 * Format a number as a percentage
 *
 * @example
 * formatPercent(0.1234) // "12.34%"
 * formatPercent(0.1234, 1) // "12.3%"
 * formatPercent(50, { isRatio: false }) // "50%"
 */
export function formatPercent(
  value: number | string,
  decimals: number = 2,
  options: { isRatio?: boolean; showSign?: boolean } = {}
): string {
  const { isRatio = true, showSign = false } = options;
  let num = Number(value);

  if (isNaN(num)) return '0%';

  // If it's a ratio (0-1), convert to percentage
  if (isRatio) {
    num = num * 100;
  }

  const formatted = num.toFixed(decimals);
  const sign = showSign && num > 0 ? '+' : '';

  return `${sign}${formatted}%`;
}

/**
 * Format a number with ordinal suffix (1st, 2nd, 3rd, etc.)
 *
 * @example
 * formatOrdinal(1) // "1st"
 * formatOrdinal(2) // "2nd"
 * formatOrdinal(23) // "23rd"
 */
export function formatOrdinal(value: number): string {
  const num = Math.floor(value);

  if (isNaN(num)) return '0th';

  const suffixes = ['th', 'st', 'nd', 'rd'];
  const remainder = num % 100;

  const suffix =
    suffixes[(remainder - 20) % 10] ||
    suffixes[remainder] ||
    suffixes[0];

  return `${num}${suffix}`;
}

/**
 * Format bytes to human-readable size
 *
 * @example
 * formatBytes(1024) // "1 KB"
 * formatBytes(1234567) // "1.18 MB"
 */
export function formatBytes(
  bytes: number,
  decimals: number = 2
): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/**
 * Format token amount with proper decimal handling
 *
 * @example
 * formatTokenAmount(1000000000000000000n, 18) // "1.0"
 * formatTokenAmount(1500000000000000000n, 18, 4) // "1.5000"
 */
export function formatTokenAmount(
  amount: bigint | string | number,
  decimals: number = 18,
  displayDecimals: number = 4
): string {
  const amountBigInt = typeof amount === 'bigint' ? amount : BigInt(amount);
  const divisor = BigInt(10 ** decimals);
  const integerPart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;

  // Pad fractional part with leading zeros
  const fractionalStr = fractionalPart.toString().padStart(decimals, '0');

  // Take only the display decimals
  const displayFractional = fractionalStr.slice(0, displayDecimals);

  // Format integer part with commas
  const integerFormatted = integerPart.toLocaleString();

  if (displayDecimals === 0) {
    return integerFormatted;
  }

  return `${integerFormatted}.${displayFractional}`;
}

/**
 * Parse a formatted number string back to a number
 *
 * @example
 * parseFormattedNumber("1,234.56") // 1234.56
 * parseFormattedNumber("$1,234.56") // 1234.56
 */
export function parseFormattedNumber(value: string): number {
  // Remove currency symbols, commas, and spaces
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Clamp a number to a range
 *
 * @example
 * clamp(5, 0, 10) // 5
 * clamp(-5, 0, 10) // 0
 * clamp(15, 0, 10) // 10
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Round a number to a specified precision
 *
 * @example
 * roundTo(1.2345, 2) // 1.23
 * roundTo(1.2355, 2) // 1.24
 */
export function roundTo(value: number, precision: number): number {
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Format a number as a price change (with + or - prefix)
 *
 * @example
 * formatPriceChange(5.5) // "+5.50%"
 * formatPriceChange(-3.2) // "-3.20%"
 */
export function formatPriceChange(
  value: number,
  decimals: number = 2
): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format a ratio as odds (e.g., for prediction markets)
 *
 * @example
 * formatOdds(0.75) // "3:1"
 * formatOdds(0.5) // "1:1"
 */
export function formatOdds(probability: number): string {
  if (probability <= 0 || probability >= 1) {
    return probability >= 1 ? '∞:1' : '0:1';
  }

  const odds = probability / (1 - probability);

  if (odds >= 1) {
    return `${odds.toFixed(1)}:1`;
  } else {
    return `1:${(1 / odds).toFixed(1)}`;
  }
}
