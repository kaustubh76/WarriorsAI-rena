/**
 * Analytics and Tracking Utilities
 * Event tracking, user behavior analytics, and metrics collection
 */

/**
 * Analytics event types
 */
export enum AnalyticsEvent {
  // User events
  USER_SIGNUP = 'user_signup',
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  WALLET_CONNECTED = 'wallet_connected',
  WALLET_DISCONNECTED = 'wallet_disconnected',

  // Battle events
  BATTLE_CREATED = 'battle_created',
  BATTLE_ACCEPTED = 'battle_accepted',
  BATTLE_STARTED = 'battle_started',
  BATTLE_COMPLETED = 'battle_completed',
  BATTLE_BET_PLACED = 'battle_bet_placed',

  // NFT events
  NFT_MINTED = 'nft_minted',
  NFT_TRANSFERRED = 'nft_transferred',
  NFT_VIEWED = 'nft_viewed',
  NFT_LISTED = 'nft_listed',

  // Trading events
  TRADE_EXECUTED = 'trade_executed',
  TRADE_FAILED = 'trade_failed',
  AGENT_FOLLOWED = 'agent_followed',
  AGENT_UNFOLLOWED = 'agent_unfollowed',

  // Market events
  MARKET_VIEWED = 'market_viewed',
  MARKET_BET_PLACED = 'market_bet_placed',
  MARKET_RESOLVED = 'market_resolved',

  // UI events
  PAGE_VIEW = 'page_view',
  BUTTON_CLICKED = 'button_clicked',
  MODAL_OPENED = 'modal_opened',
  MODAL_CLOSED = 'modal_closed',
  ERROR_OCCURRED = 'error_occurred',
}

/**
 * Analytics event data
 */
export interface AnalyticsEventData {
  event: AnalyticsEvent | string;
  properties?: Record<string, unknown>;
  timestamp?: number;
  userId?: string;
  sessionId?: string;
}

/**
 * User properties
 */
export interface UserProperties {
  userId?: string;
  walletAddress?: string;
  chainId?: number;
  userAgent?: string;
  referrer?: string;
  [key: string]: unknown;
}

/**
 * Analytics provider interface
 */
export interface AnalyticsProvider {
  track(event: AnalyticsEventData): void;
  identify(userId: string, properties?: UserProperties): void;
  page(name: string, properties?: Record<string, unknown>): void;
  reset(): void;
}

/**
 * Console analytics provider (for development)
 */
export class ConsoleAnalyticsProvider implements AnalyticsProvider {
  private enabled: boolean;

  constructor(enabled: boolean = process.env.NODE_ENV === 'development') {
    this.enabled = enabled;
  }

  track(event: AnalyticsEventData): void {
    if (this.enabled) {
      console.log('[Analytics] Event:', event);
    }
  }

  identify(userId: string, properties?: UserProperties): void {
    if (this.enabled) {
      console.log('[Analytics] Identify:', { userId, properties });
    }
  }

  page(name: string, properties?: Record<string, unknown>): void {
    if (this.enabled) {
      console.log('[Analytics] Page:', { name, properties });
    }
  }

  reset(): void {
    if (this.enabled) {
      console.log('[Analytics] Reset');
    }
  }
}

/**
 * Local storage analytics provider (for testing)
 */
export class LocalStorageAnalyticsProvider implements AnalyticsProvider {
  private readonly storageKey = 'warriors_analytics_events';

  track(event: AnalyticsEventData): void {
    const events = this.getEvents();
    events.push({
      ...event,
      timestamp: event.timestamp || Date.now(),
    });
    this.saveEvents(events);
  }

  identify(userId: string, properties?: UserProperties): void {
    localStorage.setItem('warriors_analytics_user', JSON.stringify({ userId, properties }));
  }

  page(name: string, properties?: Record<string, unknown>): void {
    this.track({
      event: AnalyticsEvent.PAGE_VIEW,
      properties: { name, ...properties },
    });
  }

  reset(): void {
    localStorage.removeItem(this.storageKey);
    localStorage.removeItem('warriors_analytics_user');
  }

  private getEvents(): AnalyticsEventData[] {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : [];
  }

  private saveEvents(events: AnalyticsEventData[]): void {
    localStorage.setItem(this.storageKey, JSON.stringify(events));
  }

  getStoredEvents(): AnalyticsEventData[] {
    return this.getEvents();
  }
}

/**
 * Batch analytics provider (buffers events)
 */
export class BatchAnalyticsProvider implements AnalyticsProvider {
  private buffer: AnalyticsEventData[] = [];
  private flushTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private provider: AnalyticsProvider,
    private options: {
      batchSize?: number;
      flushInterval?: number;
    } = {}
  ) {
    const { batchSize = 10, flushInterval = 5000 } = options;
    this.options = { batchSize, flushInterval };

    if (flushInterval > 0) {
      this.startFlushTimer();
    }
  }

  track(event: AnalyticsEventData): void {
    this.buffer.push(event);

    if (this.buffer.length >= (this.options.batchSize || 10)) {
      this.flush();
    }
  }

  identify(userId: string, properties?: UserProperties): void {
    this.provider.identify(userId, properties);
  }

  page(name: string, properties?: Record<string, unknown>): void {
    this.track({
      event: AnalyticsEvent.PAGE_VIEW,
      properties: { name, ...properties },
    });
  }

  reset(): void {
    this.flush();
    this.provider.reset();
  }

  flush(): void {
    if (this.buffer.length === 0) return;

    const events = [...this.buffer];
    this.buffer = [];

    events.forEach(event => this.provider.track(event));
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.options.flushInterval);
  }

  destroy(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    this.flush();
  }
}

/**
 * Analytics manager
 */
export class AnalyticsManager {
  private providers: AnalyticsProvider[] = [];
  private sessionId: string;
  private userId?: string;
  private userProperties?: UserProperties;

  constructor() {
    this.sessionId = this.generateSessionId();
  }

  /**
   * Add analytics provider
   */
  addProvider(provider: AnalyticsProvider): void {
    this.providers.push(provider);
  }

  /**
   * Remove analytics provider
   */
  removeProvider(provider: AnalyticsProvider): void {
    const index = this.providers.indexOf(provider);
    if (index !== -1) {
      this.providers.splice(index, 1);
    }
  }

  /**
   * Track event
   */
  track(event: AnalyticsEvent | string, properties?: Record<string, unknown>): void {
    const eventData: AnalyticsEventData = {
      event,
      properties: {
        ...properties,
        ...this.getCommonProperties(),
      },
      timestamp: Date.now(),
      userId: this.userId,
      sessionId: this.sessionId,
    };

    this.providers.forEach(provider => provider.track(eventData));
  }

  /**
   * Identify user
   */
  identify(userId: string, properties?: UserProperties): void {
    this.userId = userId;
    this.userProperties = properties;
    this.providers.forEach(provider => provider.identify(userId, properties));
  }

  /**
   * Track page view
   */
  page(name: string, properties?: Record<string, unknown>): void {
    this.providers.forEach(provider => provider.page(name, properties));
  }

  /**
   * Reset analytics
   */
  reset(): void {
    this.userId = undefined;
    this.userProperties = undefined;
    this.sessionId = this.generateSessionId();
    this.providers.forEach(provider => provider.reset());
  }

  /**
   * Get common properties added to all events
   */
  private getCommonProperties(): Record<string, unknown> {
    return {
      platform: 'web',
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      referrer: typeof document !== 'undefined' ? document.referrer : undefined,
      screenWidth: typeof window !== 'undefined' ? window.screen.width : undefined,
      screenHeight: typeof window !== 'undefined' ? window.screen.height : undefined,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
      viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
    };
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
}

/**
 * Global analytics instance
 */
export const analytics = new AnalyticsManager();

/**
 * Initialize analytics
 */
export function initAnalytics(options?: {
  console?: boolean;
  localStorage?: boolean;
  batch?: boolean;
  batchSize?: number;
  flushInterval?: number;
}): void {
  const {
    console: enableConsole = process.env.NODE_ENV === 'development',
    localStorage: enableLocalStorage = false,
    batch = true,
    batchSize = 10,
    flushInterval = 5000,
  } = options || {};

  if (enableConsole) {
    const consoleProvider = new ConsoleAnalyticsProvider();
    analytics.addProvider(
      batch
        ? new BatchAnalyticsProvider(consoleProvider, { batchSize, flushInterval })
        : consoleProvider
    );
  }

  if (enableLocalStorage) {
    const storageProvider = new LocalStorageAnalyticsProvider();
    analytics.addProvider(
      batch
        ? new BatchAnalyticsProvider(storageProvider, { batchSize, flushInterval })
        : storageProvider
    );
  }
}

/**
 * Performance metrics collector
 */
export class PerformanceMetrics {
  private metrics = new Map<string, number[]>();

  /**
   * Record metric
   */
  record(name: string, value: number): void {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, []);
    }
    this.metrics.get(name)!.push(value);
  }

  /**
   * Get metric statistics
   */
  getStats(name: string): {
    count: number;
    min: number;
    max: number;
    avg: number;
    median: number;
    p95: number;
    p99: number;
  } | null {
    const values = this.metrics.get(name);
    if (!values || values.length === 0) return null;

    const sorted = [...values].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      min: sorted[0],
      max: sorted[count - 1],
      avg: sum / count,
      median: sorted[Math.floor(count / 2)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
    };
  }

  /**
   * Get all metrics
   */
  getAllStats(): Record<string, ReturnType<PerformanceMetrics['getStats']>> {
    const result: Record<string, ReturnType<PerformanceMetrics['getStats']>> = {};
    this.metrics.forEach((_, name) => {
      result[name] = this.getStats(name);
    });
    return result;
  }

  /**
   * Clear metrics
   */
  clear(name?: string): void {
    if (name) {
      this.metrics.delete(name);
    } else {
      this.metrics.clear();
    }
  }
}

/**
 * User behavior tracker
 */
export class BehaviorTracker {
  private actions: Array<{
    action: string;
    timestamp: number;
    properties?: Record<string, unknown>;
  }> = [];

  /**
   * Track action
   */
  track(action: string, properties?: Record<string, unknown>): void {
    this.actions.push({
      action,
      timestamp: Date.now(),
      properties,
    });
  }

  /**
   * Get action sequence
   */
  getSequence(): string[] {
    return this.actions.map(a => a.action);
  }

  /**
   * Get time between actions
   */
  getTimeBetween(action1: string, action2: string): number | null {
    const idx1 = this.actions.findIndex(a => a.action === action1);
    const idx2 = this.actions.findIndex(a => a.action === action2);

    if (idx1 === -1 || idx2 === -1 || idx2 <= idx1) return null;

    return this.actions[idx2].timestamp - this.actions[idx1].timestamp;
  }

  /**
   * Get action count
   */
  getActionCount(action: string): number {
    return this.actions.filter(a => a.action === action).length;
  }

  /**
   * Clear actions
   */
  clear(): void {
    this.actions = [];
  }
}

/**
 * Funnel analyzer
 */
export class FunnelAnalyzer {
  private steps: string[];
  private completions = new Map<string, number>();

  constructor(steps: string[]) {
    this.steps = steps;
    steps.forEach(step => this.completions.set(step, 0));
  }

  /**
   * Track step completion
   */
  trackStep(step: string): void {
    if (this.steps.includes(step)) {
      this.completions.set(step, (this.completions.get(step) || 0) + 1);
    }
  }

  /**
   * Get conversion rates
   */
  getConversionRates(): Record<string, number> {
    const rates: Record<string, number> = {};
    const firstStepCount = this.completions.get(this.steps[0]) || 0;

    this.steps.forEach(step => {
      const count = this.completions.get(step) || 0;
      rates[step] = firstStepCount > 0 ? (count / firstStepCount) * 100 : 0;
    });

    return rates;
  }

  /**
   * Get drop-off rates
   */
  getDropOffRates(): Record<string, number> {
    const rates: Record<string, number> = {};

    for (let i = 1; i < this.steps.length; i++) {
      const prevStep = this.steps[i - 1];
      const currStep = this.steps[i];
      const prevCount = this.completions.get(prevStep) || 0;
      const currCount = this.completions.get(currStep) || 0;

      rates[currStep] = prevCount > 0 ? ((prevCount - currCount) / prevCount) * 100 : 0;
    }

    return rates;
  }

  /**
   * Reset funnel
   */
  reset(): void {
    this.steps.forEach(step => this.completions.set(step, 0));
  }
}

/**
 * Engagement metrics
 */
export class EngagementMetrics {
  private sessionStart: number = Date.now();
  private interactions: number = 0;
  private pageViews: number = 0;
  private lastInteraction: number = Date.now();

  /**
   * Track interaction
   */
  trackInteraction(): void {
    this.interactions++;
    this.lastInteraction = Date.now();
  }

  /**
   * Track page view
   */
  trackPageView(): void {
    this.pageViews++;
  }

  /**
   * Get session duration
   */
  getSessionDuration(): number {
    return Date.now() - this.sessionStart;
  }

  /**
   * Get time since last interaction
   */
  getTimeSinceLastInteraction(): number {
    return Date.now() - this.lastInteraction;
  }

  /**
   * Get engagement score (0-100)
   */
  getEngagementScore(): number {
    const duration = this.getSessionDuration() / 1000 / 60; // minutes
    const interactionsPerMinute = duration > 0 ? this.interactions / duration : 0;
    const pageViewsPerMinute = duration > 0 ? this.pageViews / duration : 0;

    // Simple scoring algorithm
    const score = Math.min(
      100,
      (interactionsPerMinute * 10) + (pageViewsPerMinute * 5) + Math.min(duration, 10) * 2
    );

    return Math.round(score);
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.sessionStart = Date.now();
    this.interactions = 0;
    this.pageViews = 0;
    this.lastInteraction = Date.now();
  }
}

/**
 * A/B test tracker
 */
export class ABTestTracker {
  private variant: string;
  private conversions = new Map<string, number>();
  private exposures = new Map<string, number>();

  constructor(testName: string, variants: string[]) {
    // Randomly assign variant
    this.variant = variants[Math.floor(Math.random() * variants.length)];

    // Initialize tracking
    variants.forEach(v => {
      this.exposures.set(v, 0);
      this.conversions.set(v, 0);
    });

    // Track exposure
    this.trackExposure(this.variant);

    // Log to analytics
    analytics.track('ab_test_exposed', {
      testName,
      variant: this.variant,
    });
  }

  /**
   * Get assigned variant
   */
  getVariant(): string {
    return this.variant;
  }

  /**
   * Track exposure
   */
  trackExposure(variant: string): void {
    this.exposures.set(variant, (this.exposures.get(variant) || 0) + 1);
  }

  /**
   * Track conversion
   */
  trackConversion(variant?: string): void {
    const v = variant || this.variant;
    this.conversions.set(v, (this.conversions.get(v) || 0) + 1);

    analytics.track('ab_test_conversion', {
      variant: v,
    });
  }

  /**
   * Get conversion rate
   */
  getConversionRate(variant?: string): number {
    const v = variant || this.variant;
    const exposures = this.exposures.get(v) || 0;
    const conversions = this.conversions.get(v) || 0;

    return exposures > 0 ? (conversions / exposures) * 100 : 0;
  }

  /**
   * Get results for all variants
   */
  getResults(): Record<string, { exposures: number; conversions: number; rate: number }> {
    const results: Record<string, { exposures: number; conversions: number; rate: number }> = {};

    this.exposures.forEach((_, variant) => {
      const exposures = this.exposures.get(variant) || 0;
      const conversions = this.conversions.get(variant) || 0;
      const rate = exposures > 0 ? (conversions / exposures) * 100 : 0;

      results[variant] = { exposures, conversions, rate };
    });

    return results;
  }
}

/**
 * Error tracking
 */
export class ErrorTracker {
  private errors: Array<{
    message: string;
    stack?: string;
    timestamp: number;
    context?: Record<string, unknown>;
  }> = [];

  /**
   * Track error
   */
  track(error: Error | string, context?: Record<string, unknown>): void {
    const errorData = {
      message: typeof error === 'string' ? error : error.message,
      stack: typeof error === 'object' ? error.stack : undefined,
      timestamp: Date.now(),
      context,
    };

    this.errors.push(errorData);

    analytics.track(AnalyticsEvent.ERROR_OCCURRED, {
      error: errorData.message,
      stack: errorData.stack,
      ...context,
    });
  }

  /**
   * Get all errors
   */
  getErrors(): typeof this.errors {
    return [...this.errors];
  }

  /**
   * Get error count
   */
  getCount(): number {
    return this.errors.length;
  }

  /**
   * Clear errors
   */
  clear(): void {
    this.errors = [];
  }
}

/**
 * Global metrics instances
 */
export const performanceMetrics = new PerformanceMetrics();
export const behaviorTracker = new BehaviorTracker();
export const engagementMetrics = new EngagementMetrics();
export const errorTracker = new ErrorTracker();
