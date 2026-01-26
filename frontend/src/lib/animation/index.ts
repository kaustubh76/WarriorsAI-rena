/**
 * Animation Utilities
 * CSS-in-JS friendly animation helpers, easing functions, and transitions
 */

/**
 * Common easing functions
 */
export const easings = {
  // Linear
  linear: 'linear',

  // Ease
  ease: 'ease',
  easeIn: 'ease-in',
  easeOut: 'ease-out',
  easeInOut: 'ease-in-out',

  // Cubic bezier easings
  easeInSine: 'cubic-bezier(0.47, 0, 0.745, 0.715)',
  easeOutSine: 'cubic-bezier(0.39, 0.575, 0.565, 1)',
  easeInOutSine: 'cubic-bezier(0.445, 0.05, 0.55, 0.95)',

  easeInQuad: 'cubic-bezier(0.55, 0.085, 0.68, 0.53)',
  easeOutQuad: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  easeInOutQuad: 'cubic-bezier(0.455, 0.03, 0.515, 0.955)',

  easeInCubic: 'cubic-bezier(0.55, 0.055, 0.675, 0.19)',
  easeOutCubic: 'cubic-bezier(0.215, 0.61, 0.355, 1)',
  easeInOutCubic: 'cubic-bezier(0.645, 0.045, 0.355, 1)',

  easeInQuart: 'cubic-bezier(0.895, 0.03, 0.685, 0.22)',
  easeOutQuart: 'cubic-bezier(0.165, 0.84, 0.44, 1)',
  easeInOutQuart: 'cubic-bezier(0.77, 0, 0.175, 1)',

  easeInQuint: 'cubic-bezier(0.755, 0.05, 0.855, 0.06)',
  easeOutQuint: 'cubic-bezier(0.23, 1, 0.32, 1)',
  easeInOutQuint: 'cubic-bezier(0.86, 0, 0.07, 1)',

  easeInExpo: 'cubic-bezier(0.95, 0.05, 0.795, 0.035)',
  easeOutExpo: 'cubic-bezier(0.19, 1, 0.22, 1)',
  easeInOutExpo: 'cubic-bezier(1, 0, 0, 1)',

  easeInCirc: 'cubic-bezier(0.6, 0.04, 0.98, 0.335)',
  easeOutCirc: 'cubic-bezier(0.075, 0.82, 0.165, 1)',
  easeInOutCirc: 'cubic-bezier(0.785, 0.135, 0.15, 0.86)',

  easeInBack: 'cubic-bezier(0.6, -0.28, 0.735, 0.045)',
  easeOutBack: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
  easeInOutBack: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',

  // Spring-like
  spring: 'cubic-bezier(0.175, 0.885, 0.32, 1.1)',
  bounce: 'cubic-bezier(0.68, -0.6, 0.32, 1.6)',
} as const;

export type EasingName = keyof typeof easings;

/**
 * Common durations in milliseconds
 */
export const durations = {
  instant: 0,
  fastest: 75,
  faster: 100,
  fast: 150,
  normal: 200,
  slow: 300,
  slower: 400,
  slowest: 500,
  verySlow: 750,
  extraSlow: 1000,
} as const;

export type DurationName = keyof typeof durations;

/**
 * Create a CSS transition string
 *
 * @example
 * transition('opacity', 200, 'easeOut')
 * // 'opacity 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
 *
 * transition(['opacity', 'transform'], 'normal', 'spring')
 * // 'opacity 200ms cubic-bezier(...), transform 200ms cubic-bezier(...)'
 */
export function transition(
  properties: string | string[],
  duration: number | DurationName = 'normal',
  easing: EasingName | string = 'easeOut',
  delay: number = 0
): string {
  const props = Array.isArray(properties) ? properties : [properties];
  const durationMs = typeof duration === 'string' ? durations[duration] : duration;
  const easingValue = easing in easings ? easings[easing as EasingName] : easing;

  return props
    .map((prop) => `${prop} ${durationMs}ms ${easingValue}${delay ? ` ${delay}ms` : ''}`)
    .join(', ');
}

/**
 * Common CSS transitions
 */
export const transitions = {
  // Opacity
  fadeIn: transition('opacity', 'normal', 'easeOut'),
  fadeOut: transition('opacity', 'fast', 'easeIn'),

  // Scale
  scaleIn: transition('transform', 'normal', 'spring'),
  scaleOut: transition('transform', 'fast', 'easeIn'),

  // Combined
  fadeAndScale: transition(['opacity', 'transform'], 'normal', 'spring'),
  fadeAndSlide: transition(['opacity', 'transform'], 'normal', 'easeOut'),

  // Position
  slideIn: transition('transform', 'normal', 'easeOut'),
  slideOut: transition('transform', 'fast', 'easeIn'),

  // Colors
  color: transition('color', 'fast', 'easeOut'),
  background: transition('background-color', 'fast', 'easeOut'),

  // Size
  size: transition(['width', 'height'], 'normal', 'easeInOut'),
  maxSize: transition(['max-width', 'max-height'], 'normal', 'easeInOut'),

  // All
  all: transition('all', 'normal', 'easeOut'),
  allFast: transition('all', 'fast', 'easeOut'),
  allSlow: transition('all', 'slow', 'easeInOut'),
} as const;

/**
 * Keyframe animation definition
 */
export interface KeyframeDefinition {
  [key: string]: Record<string, string | number>;
}

/**
 * Generate CSS keyframes string
 *
 * @example
 * const bounce = keyframes({
 *   '0%, 100%': { transform: 'translateY(0)' },
 *   '50%': { transform: 'translateY(-20px)' },
 * });
 * // '@keyframes bounce { 0%, 100% { transform: translateY(0); } ... }'
 */
export function keyframes(name: string, frames: KeyframeDefinition): string {
  const frameStrings = Object.entries(frames).map(([key, styles]) => {
    const styleString = Object.entries(styles)
      .map(([prop, value]) => {
        // Convert camelCase to kebab-case
        const kebabProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
        return `${kebabProp}: ${value};`;
      })
      .join(' ');
    return `${key} { ${styleString} }`;
  });

  return `@keyframes ${name} { ${frameStrings.join(' ')} }`;
}

/**
 * Common keyframe animations
 */
export const animations = {
  fadeIn: {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },

  fadeOut: {
    from: { opacity: 1 },
    to: { opacity: 0 },
  },

  scaleIn: {
    from: { opacity: 0, transform: 'scale(0.95)' },
    to: { opacity: 1, transform: 'scale(1)' },
  },

  scaleOut: {
    from: { opacity: 1, transform: 'scale(1)' },
    to: { opacity: 0, transform: 'scale(0.95)' },
  },

  slideInFromTop: {
    from: { opacity: 0, transform: 'translateY(-10px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },

  slideInFromBottom: {
    from: { opacity: 0, transform: 'translateY(10px)' },
    to: { opacity: 1, transform: 'translateY(0)' },
  },

  slideInFromLeft: {
    from: { opacity: 0, transform: 'translateX(-10px)' },
    to: { opacity: 1, transform: 'translateX(0)' },
  },

  slideInFromRight: {
    from: { opacity: 0, transform: 'translateX(10px)' },
    to: { opacity: 1, transform: 'translateX(0)' },
  },

  spin: {
    from: { transform: 'rotate(0deg)' },
    to: { transform: 'rotate(360deg)' },
  },

  pulse: {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },

  ping: {
    '0%': { transform: 'scale(1)', opacity: 1 },
    '75%, 100%': { transform: 'scale(2)', opacity: 0 },
  },

  bounce: {
    '0%, 100%': { transform: 'translateY(-25%)', animationTimingFunction: 'cubic-bezier(0.8, 0, 1, 1)' },
    '50%': { transform: 'translateY(0)', animationTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)' },
  },

  shake: {
    '0%, 100%': { transform: 'translateX(0)' },
    '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
    '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
  },

  wiggle: {
    '0%, 100%': { transform: 'rotate(-3deg)' },
    '50%': { transform: 'rotate(3deg)' },
  },
} as const;

export type AnimationName = keyof typeof animations;

/**
 * Create an animation CSS string
 *
 * @example
 * animation('fadeIn', 300, 'easeOut')
 * // 'fadeIn 300ms cubic-bezier(...) forwards'
 */
export function animation(
  name: AnimationName | string,
  duration: number | DurationName = 'normal',
  easing: EasingName | string = 'easeOut',
  options?: {
    delay?: number;
    iterations?: number | 'infinite';
    direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
    fillMode?: 'none' | 'forwards' | 'backwards' | 'both';
  }
): string {
  const durationMs = typeof duration === 'string' ? durations[duration] : duration;
  const easingValue = easing in easings ? easings[easing as EasingName] : easing;
  const {
    delay = 0,
    iterations = 1,
    direction = 'normal',
    fillMode = 'forwards',
  } = options || {};

  return `${name} ${durationMs}ms ${easingValue} ${delay}ms ${iterations} ${direction} ${fillMode}`;
}

/**
 * Stagger delay calculator for list animations
 *
 * @example
 * items.map((item, i) => (
 *   <div
 *     key={item.id}
 *     style={{ animationDelay: stagger(i, 50) }}
 *   />
 * ))
 */
export function stagger(index: number, delayMs: number = 50, maxDelay?: number): string {
  const delay = index * delayMs;
  const clampedDelay = maxDelay !== undefined ? Math.min(delay, maxDelay) : delay;
  return `${clampedDelay}ms`;
}

/**
 * Calculate animation delay with optional offset
 *
 * @example
 * delay(100) // '100ms'
 * delay(100, 50) // '150ms'
 */
export function delay(baseDelay: number, offset: number = 0): string {
  return `${baseDelay + offset}ms`;
}

/**
 * Transform utilities
 */
export const transforms = {
  // Translate
  translateX: (value: string | number) =>
    `translateX(${typeof value === 'number' ? `${value}px` : value})`,
  translateY: (value: string | number) =>
    `translateY(${typeof value === 'number' ? `${value}px` : value})`,
  translate: (x: string | number, y: string | number) =>
    `translate(${typeof x === 'number' ? `${x}px` : x}, ${typeof y === 'number' ? `${y}px` : y})`,

  // Scale
  scale: (value: number) => `scale(${value})`,
  scaleX: (value: number) => `scaleX(${value})`,
  scaleY: (value: number) => `scaleY(${value})`,

  // Rotate
  rotate: (degrees: number) => `rotate(${degrees}deg)`,
  rotateX: (degrees: number) => `rotateX(${degrees}deg)`,
  rotateY: (degrees: number) => `rotateY(${degrees}deg)`,

  // Skew
  skew: (x: number, y: number = 0) => `skew(${x}deg, ${y}deg)`,
  skewX: (degrees: number) => `skewX(${degrees}deg)`,
  skewY: (degrees: number) => `skewY(${degrees}deg)`,

  // 3D
  perspective: (value: number) => `perspective(${value}px)`,
  translate3d: (x: number, y: number, z: number) =>
    `translate3d(${x}px, ${y}px, ${z}px)`,
  scale3d: (x: number, y: number, z: number) => `scale3d(${x}, ${y}, ${z})`,
  rotate3d: (x: number, y: number, z: number, angle: number) =>
    `rotate3d(${x}, ${y}, ${z}, ${angle}deg)`,
} as const;

/**
 * Combine multiple transform functions
 *
 * @example
 * combineTransforms([
 *   transforms.translateY(-10),
 *   transforms.scale(1.1),
 *   transforms.rotate(5),
 * ])
 * // 'translateY(-10px) scale(1.1) rotate(5deg)'
 */
export function combineTransforms(transformFns: string[]): string {
  return transformFns.join(' ');
}

/**
 * Will-change hint for performance
 */
export const willChange = {
  transform: 'transform',
  opacity: 'opacity',
  transformAndOpacity: 'transform, opacity',
  scroll: 'scroll-position',
  contents: 'contents',
  auto: 'auto',
} as const;

/**
 * Reduce motion check (CSS custom property approach)
 * Use with: prefers-reduced-motion media query
 */
export const reducedMotion = {
  query: '@media (prefers-reduced-motion: reduce)',
  check: 'matchMedia("(prefers-reduced-motion: reduce)").matches',
} as const;
