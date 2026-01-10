import { formatEther } from 'viem';

/**
 * Format a bigint token amount to a human-readable string with 2 decimal places
 * @param amount - The token amount as bigint (in wei)
 * @param decimals - Number of decimal places to display (default: 2)
 * @returns Formatted string with specified decimal places
 */
export function formatTokenAmount(amount: bigint | undefined | null, decimals: number = 2): string {
  if (amount === undefined || amount === null) {
    return '0.00';
  }
  try {
    const formatted = formatEther(amount);
    const num = parseFloat(formatted);
    return num.toFixed(decimals);
  } catch {
    return '0.00';
  }
}

/**
 * Format a number or string token amount to 2 decimal places
 * @param amount - The token amount as number or string
 * @param decimals - Number of decimal places to display (default: 2)
 * @returns Formatted string with specified decimal places
 */
export function formatNumber(amount: number | string | undefined | null, decimals: number = 2): string {
  if (amount === undefined || amount === null) {
    return '0.00';
  }
  try {
    const num = typeof amount === 'string' ? parseFloat(amount) : amount;
    if (isNaN(num)) return '0.00';
    return num.toFixed(decimals);
  } catch {
    return '0.00';
  }
}

/**
 * Format a percentage value to 1 decimal place
 * @param value - The percentage value
 * @returns Formatted percentage string
 */
export function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || isNaN(value)) {
    return '0.0';
  }
  return value.toFixed(1);
}
