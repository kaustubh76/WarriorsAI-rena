/**
 * Performance Monitoring Utilities
 * Track and measure application performance metrics
 */

/**
 * Performance mark for timing
 */
export interface PerformanceMark {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  marks: Map<string, PerformanceMark>;
  measures: Map<string, number>;
}

/**
 * Performance monitor class
 */
export class PerformanceMonitor {
  private marks = new Map<string, PerformanceMark>();
  private measures = new Map<string, number>();

  /**
   * Start timing a mark
   */
  mark(name: string, metadata?: Record<string, unknown>): void {
    this.marks.set(name, {
      name,
      startTime: performance.now(),
      metadata,
    });
  }

  /**
   * End timing a mark
   */
  endMark(name: string): number | null {
    const mark = this.marks.get(name);
    if (!mark) {
      console.warn(`No mark found for: ${name}`);
      return null;
    }

    mark.endTime = performance.now();
    mark.duration = mark.endTime - mark.startTime;

    return mark.duration;
  }

  /**
   * Measure duration between two marks
   */
  measure(name: string, startMark: string, endMark: string): number | null {
    const start = this.marks.get(startMark);
    const end = this.marks.get(endMark);

    if (!start || !end) {
      console.warn(`Marks not found for measurement: ${name}`);
      return null;
    }

    const duration = (end.endTime ?? end.startTime) - start.startTime;
    this.measures.set(name, duration);

    return duration;
  }

  /**
   * Get mark duration
   */
  getDuration(name: string): number | null {
    const mark = this.marks.get(name);
    return mark?.duration ?? null;
  }

  /**
   * Get all marks
   */
  getAllMarks(): PerformanceMark[] {
    return Array.from(this.marks.values());
  }

  /**
   * Get all measures
   */
  getAllMeasures(): Map<string, number> {
    return new Map(this.measures);
  }

  /**
   * Clear all marks and measures
   */
  clear(): void {
    this.marks.clear();
    this.measures.clear();
  }

  /**
   * Clear specific mark
   */
  clearMark(name: string): void {
    this.marks.delete(name);
  }

  /**
   * Get performance summary
   */
  getSummary(): {
    totalMarks: number;
    totalMeasures: number;
    avgDuration: number;
    minDuration: number;
    maxDuration: number;
  } {
    const durations = Array.from(this.marks.values())
      .filter(m => m.duration !== undefined)
      .map(m => m.duration!);

    return {
      totalMarks: this.marks.size,
      totalMeasures: this.measures.size,
      avgDuration: durations.length > 0
        ? durations.reduce((a, b) => a + b, 0) / durations.length
        : 0,
      minDuration: durations.length > 0 ? Math.min(...durations) : 0,
      maxDuration: durations.length > 0 ? Math.max(...durations) : 0,
    };
  }
}

/**
 * Global performance monitor instance
 */
export const perfMonitor = new PerformanceMonitor();

/**
 * Measure function execution time
 */
export async function measureAsync<T>(
  name: string,
  fn: () => Promise<T>
): Promise<{ result: T; duration: number }> {
  perfMonitor.mark(name);
  const result = await fn();
  const duration = perfMonitor.endMark(name) ?? 0;

  return { result, duration };
}

/**
 * Measure sync function execution time
 */
export function measure<T>(
  name: string,
  fn: () => T
): { result: T; duration: number } {
  perfMonitor.mark(name);
  const result = fn();
  const duration = perfMonitor.endMark(name) ?? 0;

  return { result, duration };
}

/**
 * FPS counter
 */
export class FPSCounter {
  private frames = 0;
  private lastTime = performance.now();
  private fps = 0;
  private running = false;
  private rafId?: number;

  /**
   * Start counting FPS
   */
  start(): void {
    if (this.running) return;

    this.running = true;
    this.frames = 0;
    this.lastTime = performance.now();

    const tick = () => {
      this.frames++;
      const now = performance.now();

      if (now >= this.lastTime + 1000) {
        this.fps = Math.round((this.frames * 1000) / (now - this.lastTime));
        this.frames = 0;
        this.lastTime = now;
      }

      if (this.running) {
        this.rafId = requestAnimationFrame(tick);
      }
    };

    this.rafId = requestAnimationFrame(tick);
  }

  /**
   * Stop counting FPS
   */
  stop(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
    }
  }

  /**
   * Get current FPS
   */
  getFPS(): number {
    return this.fps;
  }
}

/**
 * Memory usage monitor
 */
export class MemoryMonitor {
  /**
   * Get current memory usage (if available)
   */
  getUsage(): {
    usedJSHeapSize?: number;
    totalJSHeapSize?: number;
    jsHeapSizeLimit?: number;
  } | null {
    if ('memory' in performance) {
      const memory = (performance as Performance & { memory?: {
        usedJSHeapSize: number;
        totalJSHeapSize: number;
        jsHeapSizeLimit: number;
      }}).memory;

      return memory ? {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      } : null;
    }

    return null;
  }

  /**
   * Get formatted memory usage
   */
  getFormattedUsage(): string | null {
    const usage = this.getUsage();
    if (!usage || !usage.usedJSHeapSize) return null;

    const used = (usage.usedJSHeapSize / 1024 / 1024).toFixed(2);
    const total = usage.totalJSHeapSize
      ? (usage.totalJSHeapSize / 1024 / 1024).toFixed(2)
      : 'N/A';

    return `${used} MB / ${total} MB`;
  }
}

/**
 * Resource timing observer
 */
export class ResourceTimingObserver {
  private observer?: PerformanceObserver;
  private entries: PerformanceEntry[] = [];

  /**
   * Start observing resource timing
   */
  start(callback?: (entries: PerformanceEntry[]) => void): void {
    if (typeof PerformanceObserver === 'undefined') {
      console.warn('PerformanceObserver not supported');
      return;
    }

    this.observer = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      this.entries.push(...entries);
      callback?.(entries);
    });

    this.observer.observe({ entryTypes: ['resource', 'navigation', 'paint'] });
  }

  /**
   * Stop observing
   */
  stop(): void {
    this.observer?.disconnect();
  }

  /**
   * Get all entries
   */
  getEntries(): PerformanceEntry[] {
    return [...this.entries];
  }

  /**
   * Get entries by type
   */
  getEntriesByType(type: string): PerformanceEntry[] {
    return this.entries.filter(entry => entry.entryType === type);
  }

  /**
   * Clear entries
   */
  clear(): void {
    this.entries = [];
  }
}

/**
 * Long task observer
 */
export class LongTaskObserver {
  private observer?: PerformanceObserver;
  private longTasks: PerformanceEntry[] = [];

  /**
   * Start observing long tasks (>50ms)
   */
  start(callback?: (task: PerformanceEntry) => void): void {
    if (typeof PerformanceObserver === 'undefined') {
      console.warn('PerformanceObserver not supported');
      return;
    }

    try {
      this.observer = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        this.longTasks.push(...entries);
        entries.forEach(entry => callback?.(entry));
      });

      this.observer.observe({ entryTypes: ['longtask'] });
    } catch {
      console.warn('Long task observation not supported');
    }
  }

  /**
   * Stop observing
   */
  stop(): void {
    this.observer?.disconnect();
  }

  /**
   * Get all long tasks
   */
  getLongTasks(): PerformanceEntry[] {
    return [...this.longTasks];
  }

  /**
   * Get count of long tasks
   */
  getCount(): number {
    return this.longTasks.length;
  }

  /**
   * Clear long tasks
   */
  clear(): void {
    this.longTasks = [];
  }
}

/**
 * Get Web Vitals
 */
export function getWebVitals(): {
  FCP?: number;
  LCP?: number;
  FID?: number;
  CLS?: number;
  TTFB?: number;
} {
  const vitals: ReturnType<typeof getWebVitals> = {};

  // First Contentful Paint
  const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
  if (fcpEntry) {
    vitals.FCP = fcpEntry.startTime;
  }

  // Largest Contentful Paint
  const lcpEntries = performance.getEntriesByType('largest-contentful-paint');
  if (lcpEntries.length > 0) {
    vitals.LCP = lcpEntries[lcpEntries.length - 1].startTime;
  }

  // Time to First Byte
  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
  if (navEntry) {
    vitals.TTFB = navEntry.responseStart - navEntry.requestStart;
  }

  return vitals;
}

/**
 * Performance budget checker
 */
export class PerformanceBudget {
  private budgets: Map<string, number> = new Map();
  private violations: string[] = [];

  /**
   * Set budget for a metric
   */
  setBudget(metric: string, maxDuration: number): void {
    this.budgets.set(metric, maxDuration);
  }

  /**
   * Check if metric exceeds budget
   */
  check(metric: string, actualDuration: number): boolean {
    const budget = this.budgets.get(metric);
    if (!budget) return true;

    const exceeded = actualDuration > budget;
    if (exceeded) {
      this.violations.push(
        `${metric} exceeded budget: ${actualDuration.toFixed(2)}ms > ${budget}ms`
      );
    }

    return !exceeded;
  }

  /**
   * Get all violations
   */
  getViolations(): string[] {
    return [...this.violations];
  }

  /**
   * Clear violations
   */
  clearViolations(): void {
    this.violations = [];
  }
}

/**
 * Request idle callback wrapper
 */
export function runWhenIdle<T>(
  callback: () => T,
  options?: { timeout?: number }
): Promise<T> {
  return new Promise((resolve) => {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        resolve(callback());
      }, options);
    } else {
      // Fallback for browsers that don't support requestIdleCallback
      setTimeout(() => {
        resolve(callback());
      }, 0);
    }
  });
}

/**
 * Batch updates to reduce reflows
 */
export function batchUpdates(updates: (() => void)[]): void {
  requestAnimationFrame(() => {
    updates.forEach(update => update());
  });
}

/**
 * Throttle function calls to improve performance
 */
export function createThrottle(ms: number): (fn: () => void) => void {
  let lastRun = 0;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (fn: () => void) => {
    const now = Date.now();

    if (now - lastRun >= ms) {
      fn();
      lastRun = now;
    } else {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => {
        fn();
        lastRun = Date.now();
      }, ms - (now - lastRun));
    }
  };
}

/**
 * Global instances
 */
export const fpsCounter = new FPSCounter();
export const memoryMonitor = new MemoryMonitor();
export const resourceObserver = new ResourceTimingObserver();
export const longTaskObserver = new LongTaskObserver();
export const perfBudget = new PerformanceBudget();
