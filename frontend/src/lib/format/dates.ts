/**
 * Date and Time Formatting Utilities
 * Functions for formatting dates, times, and durations
 */

/**
 * Format a date to a localized string
 *
 * @example
 * formatDate(new Date()) // "Jan 15, 2024"
 * formatDate(new Date(), 'long') // "January 15, 2024"
 */
export function formatDate(
  date: Date | string | number,
  style: 'short' | 'medium' | 'long' | 'full' = 'medium',
  locale: string = 'en-US'
): string {
  const d = toDate(date);
  if (!d) return '';

  const options: Intl.DateTimeFormatOptions = {
    short: { month: 'numeric', day: 'numeric', year: '2-digit' },
    medium: { month: 'short', day: 'numeric', year: 'numeric' },
    long: { month: 'long', day: 'numeric', year: 'numeric' },
    full: { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
  }[style];

  return d.toLocaleDateString(locale, options);
}

/**
 * Format a time to a localized string
 *
 * @example
 * formatTime(new Date()) // "2:30 PM"
 * formatTime(new Date(), true) // "14:30:00"
 */
export function formatTime(
  date: Date | string | number,
  use24Hour: boolean = false,
  showSeconds: boolean = false,
  locale: string = 'en-US'
): string {
  const d = toDate(date);
  if (!d) return '';

  const options: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !use24Hour,
  };

  if (showSeconds) {
    options.second = '2-digit';
  }

  return d.toLocaleTimeString(locale, options);
}

/**
 * Format a date and time together
 *
 * @example
 * formatDateTime(new Date()) // "Jan 15, 2024, 2:30 PM"
 */
export function formatDateTime(
  date: Date | string | number,
  options: {
    dateStyle?: 'short' | 'medium' | 'long';
    use24Hour?: boolean;
    showSeconds?: boolean;
  } = {},
  locale: string = 'en-US'
): string {
  const { dateStyle = 'medium', use24Hour = false, showSeconds = false } = options;

  const d = toDate(date);
  if (!d) return '';

  const dateStr = formatDate(d, dateStyle, locale);
  const timeStr = formatTime(d, use24Hour, showSeconds, locale);

  return `${dateStr}, ${timeStr}`;
}

/**
 * Format a relative time (e.g., "2 hours ago", "in 3 days")
 *
 * @example
 * formatRelative(Date.now() - 3600000) // "1 hour ago"
 * formatRelative(Date.now() + 86400000) // "in 1 day"
 */
export function formatRelative(
  date: Date | string | number,
  locale: string = 'en-US'
): string {
  const d = toDate(date);
  if (!d) return '';

  const now = Date.now();
  const diffMs = d.getTime() - now;
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);
  const diffWeek = Math.round(diffDay / 7);
  const diffMonth = Math.round(diffDay / 30);
  const diffYear = Math.round(diffDay / 365);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  if (Math.abs(diffSec) < 60) {
    return rtf.format(diffSec, 'second');
  }
  if (Math.abs(diffMin) < 60) {
    return rtf.format(diffMin, 'minute');
  }
  if (Math.abs(diffHour) < 24) {
    return rtf.format(diffHour, 'hour');
  }
  if (Math.abs(diffDay) < 7) {
    return rtf.format(diffDay, 'day');
  }
  if (Math.abs(diffWeek) < 4) {
    return rtf.format(diffWeek, 'week');
  }
  if (Math.abs(diffMonth) < 12) {
    return rtf.format(diffMonth, 'month');
  }
  return rtf.format(diffYear, 'year');
}

/**
 * Format a short relative time (e.g., "2h", "3d", "1w")
 *
 * @example
 * formatRelativeShort(Date.now() - 3600000) // "1h ago"
 * formatRelativeShort(Date.now() - 86400000) // "1d ago"
 */
export function formatRelativeShort(
  date: Date | string | number
): string {
  const d = toDate(date);
  if (!d) return '';

  const now = Date.now();
  const diffMs = Math.abs(d.getTime() - now);
  const isPast = d.getTime() < now;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  let value: string;

  if (seconds < 60) {
    value = 'now';
  } else if (minutes < 60) {
    value = `${minutes}m`;
  } else if (hours < 24) {
    value = `${hours}h`;
  } else if (days < 7) {
    value = `${days}d`;
  } else if (weeks < 4) {
    value = `${weeks}w`;
  } else if (months < 12) {
    value = `${months}mo`;
  } else {
    value = `${years}y`;
  }

  if (value === 'now') return value;
  return isPast ? `${value} ago` : `in ${value}`;
}

/**
 * Format a duration in milliseconds to a readable string
 *
 * @example
 * formatDuration(3661000) // "1h 1m 1s"
 * formatDuration(90000) // "1m 30s"
 */
export function formatDuration(
  ms: number,
  options: {
    compact?: boolean;
    maxUnits?: number;
  } = {}
): string {
  const { compact = false, maxUnits = 3 } = options;

  if (ms < 1000) {
    return compact ? '0s' : '0 seconds';
  }

  const units = [
    { name: 'year', short: 'y', ms: 365 * 24 * 60 * 60 * 1000 },
    { name: 'day', short: 'd', ms: 24 * 60 * 60 * 1000 },
    { name: 'hour', short: 'h', ms: 60 * 60 * 1000 },
    { name: 'minute', short: 'm', ms: 60 * 1000 },
    { name: 'second', short: 's', ms: 1000 },
  ];

  const parts: string[] = [];
  let remaining = ms;

  for (const unit of units) {
    if (parts.length >= maxUnits) break;

    const value = Math.floor(remaining / unit.ms);
    if (value > 0) {
      if (compact) {
        parts.push(`${value}${unit.short}`);
      } else {
        parts.push(`${value} ${unit.name}${value !== 1 ? 's' : ''}`);
      }
      remaining = remaining % unit.ms;
    }
  }

  return parts.join(compact ? ' ' : ', ') || (compact ? '0s' : '0 seconds');
}

/**
 * Format a countdown timer
 *
 * @example
 * formatCountdown(3661000) // "01:01:01"
 * formatCountdown(90000) // "01:30"
 */
export function formatCountdown(
  ms: number,
  options: { showHours?: boolean; showDays?: boolean } = {}
): string {
  const { showHours = true, showDays = false } = options;

  if (ms <= 0) return showHours ? '00:00:00' : '00:00';

  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const pad = (n: number) => n.toString().padStart(2, '0');

  const parts: string[] = [];

  if (showDays && days > 0) {
    parts.push(`${days}d`);
  }

  if (showHours || hours > 0) {
    parts.push(pad(hours));
  }

  parts.push(pad(minutes));
  parts.push(pad(seconds));

  return parts.join(':');
}

/**
 * Check if a date is today
 */
export function isToday(date: Date | string | number): boolean {
  const d = toDate(date);
  if (!d) return false;

  const today = new Date();
  return (
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

/**
 * Check if a date is in the past
 */
export function isPast(date: Date | string | number): boolean {
  const d = toDate(date);
  if (!d) return false;
  return d.getTime() < Date.now();
}

/**
 * Check if a date is in the future
 */
export function isFuture(date: Date | string | number): boolean {
  const d = toDate(date);
  if (!d) return false;
  return d.getTime() > Date.now();
}

/**
 * Get time until a date (for countdown timers)
 */
export function getTimeUntil(date: Date | string | number): number {
  const d = toDate(date);
  if (!d) return 0;
  return Math.max(0, d.getTime() - Date.now());
}

/**
 * Convert various date inputs to a Date object
 */
function toDate(date: Date | string | number): Date | null {
  if (!date) return null;

  if (date instanceof Date) {
    return isNaN(date.getTime()) ? null : date;
  }

  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date for API/form submission (ISO 8601)
 *
 * @example
 * formatISO(new Date()) // "2024-01-15T14:30:00.000Z"
 */
export function formatISO(date: Date | string | number): string {
  const d = toDate(date);
  if (!d) return '';
  return d.toISOString();
}

/**
 * Format a date as YYYY-MM-DD
 *
 * @example
 * formatDateInput(new Date()) // "2024-01-15"
 */
export function formatDateInput(date: Date | string | number): string {
  const d = toDate(date);
  if (!d) return '';
  return d.toISOString().split('T')[0];
}
