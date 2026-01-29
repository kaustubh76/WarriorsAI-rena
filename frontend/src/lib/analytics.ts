/**
 * Analytics Module — Google Analytics 4
 *
 * Sends events via window.gtag when GA4 is loaded.
 * Guarded by NEXT_PUBLIC_ENABLE_ANALYTICS feature flag.
 * Falls back to console.log in development.
 */

export enum AnalyticsEvent {
  MARKET_VIEWED = 'market_viewed',
  MARKET_CREATED = 'market_created',
  MARKET_RESOLVED = 'market_resolved',
  TRADE_EXECUTED = 'trade_executed',
  AGENT_TRADE = 'agent_trade',
  VRF_TRADE = 'vrf_trade',
  PRICE_SYNCED = 'price_synced',
}

export interface AnalyticsEventData {
  [key: string]: any;
}

// Extend Window for gtag
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}

const isEnabled = (): boolean =>
  typeof window !== 'undefined' &&
  process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true';

function gtag(...args: any[]): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag(...args);
  }
}

class Analytics {
  /**
   * Track an analytics event
   */
  track(event: AnalyticsEvent, data?: AnalyticsEventData): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics] ${event}:`, data);
    }

    if (isEnabled()) {
      gtag('event', event, data);
    }
  }

  /**
   * Identify a user for analytics
   */
  identify(userId: string, traits?: Record<string, any>): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics] Identify user ${userId}:`, traits);
    }

    if (isEnabled()) {
      gtag('set', { user_id: userId });
      if (traits) {
        gtag('set', 'user_properties', traits);
      }
    }
  }

  /**
   * Track a page view
   */
  page(name: string, properties?: Record<string, any>): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Analytics] Page view ${name}:`, properties);
    }

    if (isEnabled()) {
      gtag('event', 'page_view', {
        page_title: name,
        ...properties,
      });
    }
  }
}

// Export singleton instance
export const analytics = new Analytics();
