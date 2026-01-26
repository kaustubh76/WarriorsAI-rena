/**
 * Utilities Index
 * Re-exports all utility functions for simpler imports
 *
 * Usage:
 * import { capitalize, chunk, uniqueId } from '@/lib/utils';
 */

// String utilities
export {
  capitalize,
  capitalizeWords,
  toTitleCase,
  slugify,
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  truncate,
  truncateMiddle,
  stripHtml,
  escapeHtml,
  randomString,
  uniqueId,
  isEmpty,
  pluralize,
  format,
  wordCount,
  getInitials,
  hashCode,
  stringToColor,
} from './strings';

// Array utilities
export {
  chunk,
  unique,
  uniqueBy,
  groupBy,
  countBy,
  flatten,
  sortBy,
  shuffle,
  sample,
  intersection,
  difference,
  union,
  partition,
  take,
  takeLast,
  findFirst,
  findLast,
  range,
  sum,
  average,
  minMax,
  move,
  insert,
  removeAt,
} from './arrays';

// Object utilities
export {
  pick,
  omit,
  merge,
  deepMerge,
  deepClone,
  isEqual,
  get,
  set,
  has,
  compact,
  mapKeys,
  mapValues,
  filterObject,
  isEmpty as isEmptyObject,
  defaults,
  invert,
} from './objects';

// Class name utilities
export {
  cn,
  withBase,
  createVariants,
  twMerge,
  classNames,
} from './cn';
