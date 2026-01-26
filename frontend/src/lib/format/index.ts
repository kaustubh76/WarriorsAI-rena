/**
 * Format Utilities Index
 * Re-exports all formatting utilities for simpler imports
 *
 * Usage:
 * import { formatNumber, formatDate, truncateAddress } from '@/lib/format';
 */

// Number formatting
export {
  formatNumber,
  formatCompact,
  formatCurrency,
  formatPercent,
  formatOrdinal,
  formatBytes,
  formatTokenAmount,
  parseFormattedNumber,
  clamp,
  roundTo,
  formatPriceChange,
  formatOdds,
} from './numbers';

// Date and time formatting
export {
  formatDate,
  formatTime,
  formatDateTime,
  formatRelative,
  formatRelativeShort,
  formatDuration,
  formatCountdown,
  isToday,
  isPast,
  isFuture,
  getTimeUntil,
  formatISO,
  formatDateInput,
} from './dates';

// Blockchain formatting
export {
  truncateAddress,
  truncateTxHash,
  formatTokenWithSymbol,
  formatGasPrice,
  formatBlockNumber,
  getExplorerUrl,
  isValidAddress,
  isValidTxHash,
  normalizeAddress,
  addressesEqual,
  getChainName,
  getNativeCurrency,
  formatWei,
  parseEther,
  truncateSignature,
} from './blockchain';
