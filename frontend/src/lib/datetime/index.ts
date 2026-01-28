/**
 * Extended Date/Time Utilities
 * Date manipulation, formatting, and timezone handling
 */

/**
 * Time units in milliseconds
 */
export const TimeUnits = {
  MILLISECOND: 1,
  SECOND: 1000,
  MINUTE: 60 * 1000,
  HOUR: 60 * 60 * 1000,
  DAY: 24 * 60 * 60 * 1000,
  WEEK: 7 * 24 * 60 * 60 * 1000,
  MONTH: 30 * 24 * 60 * 60 * 1000, // Approximate
  YEAR: 365 * 24 * 60 * 60 * 1000, // Approximate
} as const;

/**
 * Add time to date
 */
export function addTime(date: Date, amount: number, unit: keyof typeof TimeUnits): Date {
  const ms = amount * TimeUnits[unit];
  return new Date(date.getTime() + ms);
}

/**
 * Subtract time from date
 */
export function subtractTime(date: Date, amount: number, unit: keyof typeof TimeUnits): Date {
  return addTime(date, -amount, unit);
}

/**
 * Get difference between two dates
 */
export function dateDiff(date1: Date, date2: Date, unit: keyof typeof TimeUnits): number {
  const diff = date2.getTime() - date1.getTime();
  return Math.floor(diff / TimeUnits[unit]);
}

/**
 * Check if date is in the past
 */
export function isPast(date: Date): boolean {
  return date.getTime() < Date.now();
}

/**
 * Check if date is in the future
 */
export function isFuture(date: Date): boolean {
  return date.getTime() > Date.now();
}

/**
 * Check if date is today
 */
export function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if date is yesterday
 */
export function isYesterday(date: Date): boolean {
  const yesterday = subtractTime(new Date(), 1, 'DAY');
  return (
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear()
  );
}

/**
 * Check if date is tomorrow
 */
export function isTomorrow(date: Date): boolean {
  const tomorrow = addTime(new Date(), 1, 'DAY');
  return (
    date.getDate() === tomorrow.getDate() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getFullYear() === tomorrow.getFullYear()
  );
}

/**
 * Get start of day
 */
export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Get start of week (Monday)
 */
export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday is start of week
  d.setDate(d.getDate() + diff);
  return startOfDay(d);
}

/**
 * Get end of week (Sunday)
 */
export function endOfWeek(date: Date): Date {
  const start = startOfWeek(date);
  return endOfDay(addTime(start, 6, 'DAY'));
}

/**
 * Get start of month
 */
export function startOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setDate(1);
  return startOfDay(d);
}

/**
 * Get end of month
 */
export function endOfMonth(date: Date): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1, 0);
  return endOfDay(d);
}

/**
 * Get start of year
 */
export function startOfYear(date: Date): Date {
  const d = new Date(date);
  d.setMonth(0, 1);
  return startOfDay(d);
}

/**
 * Get end of year
 */
export function endOfYear(date: Date): Date {
  const d = new Date(date);
  d.setMonth(11, 31);
  return endOfDay(d);
}

/**
 * Format date to ISO string (YYYY-MM-DD)
 */
export function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Format date to ISO time (HH:MM:SS)
 */
export function toISOTime(date: Date): string {
  return date.toISOString().split('T')[1].split('.')[0];
}

/**
 * Parse ISO date string
 */
export function parseISODate(dateString: string): Date {
  return new Date(dateString);
}

/**
 * Format date relative to now (e.g., "2 hours ago")
 */
export function formatRelative(date: Date, now: Date = new Date()): string {
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffMonths = Math.floor(diffDays / 30);
  const diffYears = Math.floor(diffDays / 365);

  if (diffSeconds < 60) {
    return 'just now';
  } else if (diffMinutes < 60) {
    return `${diffMinutes} ${diffMinutes === 1 ? 'minute' : 'minutes'} ago`;
  } else if (diffHours < 24) {
    return `${diffHours} ${diffHours === 1 ? 'hour' : 'hours'} ago`;
  } else if (diffDays < 30) {
    return `${diffDays} ${diffDays === 1 ? 'day' : 'days'} ago`;
  } else if (diffMonths < 12) {
    return `${diffMonths} ${diffMonths === 1 ? 'month' : 'months'} ago`;
  } else {
    return `${diffYears} ${diffYears === 1 ? 'year' : 'years'} ago`;
  }
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Format time remaining until date
 */
export function formatTimeRemaining(date: Date, now: Date = new Date()): string {
  const diffMs = date.getTime() - now.getTime();

  if (diffMs <= 0) {
    return 'Expired';
  }

  return formatDuration(diffMs);
}

/**
 * Get days in month
 */
export function getDaysInMonth(date: Date): number {
  const year = date.getFullYear();
  const month = date.getMonth();
  return new Date(year, month + 1, 0).getDate();
}

/**
 * Get week number of year
 */
export function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Get quarter of year (1-4)
 */
export function getQuarter(date: Date): number {
  return Math.floor(date.getMonth() / 3) + 1;
}

/**
 * Check if year is leap year
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Get age from birth date
 */
export function getAge(birthDate: Date, referenceDate: Date = new Date()): number {
  let age = referenceDate.getFullYear() - birthDate.getFullYear();
  const monthDiff = referenceDate.getMonth() - birthDate.getMonth();

  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < birthDate.getDate())) {
    age--;
  }

  return age;
}

/**
 * Format date with custom format
 */
export function formatDate(date: Date, format: string): string {
  const pad = (n: number) => String(n).padStart(2, '0');

  const replacements: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MM: pad(date.getMonth() + 1),
    M: String(date.getMonth() + 1),
    DD: pad(date.getDate()),
    D: String(date.getDate()),
    HH: pad(date.getHours()),
    H: String(date.getHours()),
    hh: pad(date.getHours() % 12 || 12),
    h: String(date.getHours() % 12 || 12),
    mm: pad(date.getMinutes()),
    m: String(date.getMinutes()),
    ss: pad(date.getSeconds()),
    s: String(date.getSeconds()),
    SSS: String(date.getMilliseconds()).padStart(3, '0'),
    A: date.getHours() < 12 ? 'AM' : 'PM',
    a: date.getHours() < 12 ? 'am' : 'pm',
  };

  return format.replace(/YYYY|YY|MM?|DD?|HH?|hh?|mm?|ss?|SSS|A|a/g, (match) => replacements[match] || match);
}

/**
 * Common date formats
 */
export const DateFormats = {
  ISO: 'YYYY-MM-DD',
  US: 'MM/DD/YYYY',
  EU: 'DD/MM/YYYY',
  TIME_24: 'HH:mm:ss',
  TIME_12: 'hh:mm:ss A',
  DATETIME: 'YYYY-MM-DD HH:mm:ss',
  DATETIME_US: 'MM/DD/YYYY hh:mm A',
  FULL: 'YYYY-MM-DD HH:mm:ss.SSS',
} as const;

/**
 * Parse common date formats
 */
export function parseDate(dateString: string, format: string = DateFormats.ISO): Date | null {
  try {
    // Simple ISO format parsing
    if (format === DateFormats.ISO) {
      return new Date(dateString);
    }

    // Add more format parsing as needed
    return new Date(dateString);
  } catch {
    return null;
  }
}

/**
 * Create date range
 */
export function createDateRange(
  start: Date,
  end: Date,
  step: keyof typeof TimeUnits = 'DAY'
): Date[] {
  const dates: Date[] = [];
  let current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current = addTime(current, 1, step);
  }

  return dates;
}

/**
 * Check if date is between two dates
 */
export function isBetween(date: Date, start: Date, end: Date, inclusive: boolean = true): boolean {
  const time = date.getTime();
  const startTime = start.getTime();
  const endTime = end.getTime();

  if (inclusive) {
    return time >= startTime && time <= endTime;
  }

  return time > startTime && time < endTime;
}

/**
 * Get business days between two dates (excluding weekends)
 */
export function getBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);

  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) {
      count++;
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
}

/**
 * Check if date is weekend
 */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/**
 * Check if date is weekday
 */
export function isWeekday(date: Date): boolean {
  return !isWeekend(date);
}

/**
 * Get next occurrence of day of week
 */
export function getNextDayOfWeek(date: Date, dayOfWeek: number): Date {
  const result = new Date(date);
  result.setDate(date.getDate() + ((7 + dayOfWeek - date.getDay()) % 7));
  return result;
}

/**
 * Timezone offset helper
 */
export function getTimezoneOffset(date: Date = new Date()): number {
  return -date.getTimezoneOffset();
}

/**
 * Convert to UTC
 */
export function toUTC(date: Date): Date {
  return new Date(date.getTime() + date.getTimezoneOffset() * 60000);
}

/**
 * Convert from UTC
 */
export function fromUTC(date: Date): Date {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000);
}

/**
 * Sleep/delay utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create debounced function with timestamp
 */
export function debounceWithTimestamp<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): T & { lastCalled?: number } {
  let timeoutId: ReturnType<typeof setTimeout>;
  let lastCalled: number | undefined;

  const debounced = function (this: unknown, ...args: Parameters<T>) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      lastCalled = Date.now();
      fn.apply(this, args);
    }, delay);
  } as T & { lastCalled?: number };

  Object.defineProperty(debounced, 'lastCalled', {
    get: () => lastCalled,
  });

  return debounced;
}
