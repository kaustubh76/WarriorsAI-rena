/**
 * Class Name Utilities
 * Utilities for merging and conditionally applying CSS class names
 */

type ClassValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | ClassValue[]
  | Record<string, boolean | undefined | null>;

/**
 * Merge class names conditionally
 *
 * @example
 * cn('base', 'always', isActive && 'active', { disabled: isDisabled })
 * // 'base always active disabled' (if isActive and isDisabled are true)
 *
 * cn('px-4 py-2', variant === 'primary' && 'bg-blue-500', 'rounded')
 * // 'px-4 py-2 bg-blue-500 rounded' (if variant is 'primary')
 */
export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) continue;

    if (typeof input === 'string' || typeof input === 'number') {
      classes.push(String(input));
    } else if (Array.isArray(input)) {
      const nested = cn(...input);
      if (nested) classes.push(nested);
    } else if (typeof input === 'object') {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }

  return classes.join(' ');
}

/**
 * Create a class name builder with a base class
 *
 * @example
 * const button = withBase('btn', {
 *   primary: 'btn-primary',
 *   secondary: 'btn-secondary',
 *   disabled: 'btn-disabled',
 * });
 *
 * button('primary') // 'btn btn-primary'
 * button('primary', 'disabled') // 'btn btn-primary btn-disabled'
 */
export function withBase<T extends Record<string, string>>(
  baseClass: string,
  variants: T
): (...keys: (keyof T)[]) => string {
  return (...keys) => {
    const variantClasses = keys.map((key) => variants[key]).filter(Boolean);
    return cn(baseClass, ...variantClasses);
  };
}

/**
 * Create variant class name helper (similar to cva but simpler)
 *
 * @example
 * const button = createVariants({
 *   base: 'px-4 py-2 rounded font-medium',
 *   variants: {
 *     intent: {
 *       primary: 'bg-blue-500 text-white',
 *       secondary: 'bg-gray-200 text-gray-800',
 *       danger: 'bg-red-500 text-white',
 *     },
 *     size: {
 *       sm: 'text-sm',
 *       md: 'text-base',
 *       lg: 'text-lg',
 *     },
 *   },
 *   defaultVariants: {
 *     intent: 'primary',
 *     size: 'md',
 *   },
 * });
 *
 * button() // 'px-4 py-2 rounded font-medium bg-blue-500 text-white text-base'
 * button({ intent: 'danger', size: 'lg' }) // 'px-4 py-2 rounded font-medium bg-red-500 text-white text-lg'
 */
export function createVariants<
  V extends Record<string, Record<string, string>>
>(config: {
  base?: string;
  variants: V;
  defaultVariants?: {
    [K in keyof V]?: keyof V[K];
  };
}): (
  props?: {
    [K in keyof V]?: keyof V[K];
  } & { className?: string }
) => string {
  const { base, variants, defaultVariants = {} } = config;

  return (props = {}) => {
    const { className, ...variantProps } = props;
    const classes: string[] = [];

    if (base) classes.push(base);

    for (const [key, options] of Object.entries(variants)) {
      const variantKey = key as keyof V;
      const selectedVariant =
        (variantProps[variantKey] as keyof V[typeof variantKey] | undefined) ??
        defaultVariants[variantKey];

      if (selectedVariant && options[selectedVariant as string]) {
        classes.push(options[selectedVariant as string]);
      }
    }

    if (className) classes.push(className);

    return classes.join(' ');
  };
}

/**
 * Conditionally join class names (Tailwind-friendly)
 * Handles Tailwind class conflicts by keeping last occurrence
 *
 * @example
 * twMerge('px-2 py-1', 'px-4') // 'py-1 px-4' (px-4 overrides px-2)
 *
 * Note: For full Tailwind merge support, use tailwind-merge package.
 * This is a simplified version for basic use cases.
 */
export function twMerge(...inputs: ClassValue[]): string {
  const merged = cn(...inputs);
  const classes = merged.split(' ').filter(Boolean);

  // Group classes by their "type" (simplified)
  const classMap = new Map<string, string>();

  for (const cls of classes) {
    // Extract prefix (e.g., 'px', 'py', 'text', 'bg', etc.)
    const match = cls.match(/^-?([a-z]+)-/);
    const prefix = match ? match[1] : cls;

    // For common conflicting prefixes, keep only the last one
    const conflictGroups = [
      'p', 'px', 'py', 'pt', 'pr', 'pb', 'pl',
      'm', 'mx', 'my', 'mt', 'mr', 'mb', 'ml',
      'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h',
      'text', 'font', 'leading', 'tracking',
      'bg', 'border', 'rounded',
      'flex', 'grid', 'gap',
      'opacity', 'z', 'cursor',
    ];

    if (conflictGroups.includes(prefix)) {
      classMap.set(prefix, cls);
    } else {
      // For non-conflicting classes, use the full class as key
      classMap.set(cls, cls);
    }
  }

  return Array.from(classMap.values()).join(' ');
}

/**
 * Create a class name string from a template literal
 *
 * @example
 * const styles = classNames`
 *   px-4 py-2
 *   ${isPrimary && 'bg-blue-500'}
 *   ${isLarge ? 'text-lg' : 'text-base'}
 *   rounded-lg
 * `;
 */
export function classNames(
  strings: TemplateStringsArray,
  ...values: ClassValue[]
): string {
  const parts: string[] = [];

  strings.forEach((str, i) => {
    parts.push(str);
    if (i < values.length) {
      const value = values[i];
      if (value) {
        parts.push(typeof value === 'string' ? value : cn(value));
      }
    }
  });

  return parts
    .join('')
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
}

export default cn;
