/**
 * Alert Management System
 *
 * Centralized alerting and notification system with:
 * - Multiple alert channels (Slack, Email, PagerDuty, Webhook)
 * - Alert severity levels
 * - Rate limiting to prevent alert storms
 * - Alert grouping and deduplication
 * - Escalation policies
 */

import { prisma } from '../prisma';

// ============================================================================
// Types
// ============================================================================

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical',
}

export enum AlertChannel {
  SLACK = 'slack',
  EMAIL = 'email',
  PAGERDUTY = 'pagerduty',
  WEBHOOK = 'webhook',
  CONSOLE = 'console',
}

export interface Alert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  source: string;
  metadata?: Record<string, any>;
  timestamp: number;
  fingerprint: string; // For deduplication
}

export interface AlertRule {
  name: string;
  condition: () => boolean | Promise<boolean>;
  severity: AlertSeverity;
  channels: AlertChannel[];
  cooldown: number; // Minimum time between alerts (ms)
  escalationDelay?: number; // Time before escalating (ms)
}

export interface NotificationConfig {
  slack?: {
    webhookUrl: string;
    channel?: string;
    username?: string;
  };
  email?: {
    from: string;
    to: string[];
    smtpHost: string;
    smtpPort: number;
    smtpUser: string;
    smtpPassword: string;
  };
  pagerduty?: {
    integrationKey: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
}

// ============================================================================
// Alert Manager
// ============================================================================

export class AlertManager {
  private alerts = new Map<string, Alert>();
  private lastAlertTime = new Map<string, number>();
  private notificationConfig: NotificationConfig;

  constructor(config: NotificationConfig = {}) {
    this.notificationConfig = config;
  }

  /**
   * Send an alert
   */
  async sendAlert(
    title: string,
    message: string,
    severity: AlertSeverity,
    options: {
      source?: string;
      metadata?: Record<string, any>;
      channels?: AlertChannel[];
      cooldown?: number;
    } = {}
  ): Promise<void> {
    const alert: Alert = {
      id: this.generateId(),
      title,
      message,
      severity,
      source: options.source || 'system',
      metadata: options.metadata,
      timestamp: Date.now(),
      fingerprint: this.generateFingerprint(title, options.source || 'system'),
    };

    // Check cooldown to prevent alert storms
    const lastAlert = this.lastAlertTime.get(alert.fingerprint);
    const cooldown = options.cooldown || this.getDefaultCooldown(severity);

    if (lastAlert && Date.now() - lastAlert < cooldown) {
      console.log(
        `[AlertManager] Alert suppressed due to cooldown: ${alert.fingerprint}`
      );
      return;
    }

    // Store alert
    this.alerts.set(alert.id, alert);
    this.lastAlertTime.set(alert.fingerprint, alert.timestamp);

    // Log to database
    await this.logAlert(alert);

    // Send to specified channels
    const channels = options.channels || this.getDefaultChannels(severity);
    await this.sendToChannels(alert, channels);

    console.log(`[AlertManager] Alert sent: ${alert.title} (${alert.severity})`);
  }

  /**
   * Send alert to multiple channels
   */
  private async sendToChannels(
    alert: Alert,
    channels: AlertChannel[]
  ): Promise<void> {
    const promises = channels.map((channel) => {
      switch (channel) {
        case AlertChannel.SLACK:
          return this.sendToSlack(alert);
        case AlertChannel.EMAIL:
          return this.sendToEmail(alert);
        case AlertChannel.PAGERDUTY:
          return this.sendToPagerDuty(alert);
        case AlertChannel.WEBHOOK:
          return this.sendToWebhook(alert);
        case AlertChannel.CONSOLE:
          return this.sendToConsole(alert);
        default:
          return Promise.resolve();
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Send alert to Slack
   */
  private async sendToSlack(alert: Alert): Promise<void> {
    if (!this.notificationConfig.slack?.webhookUrl) {
      console.warn('[AlertManager] Slack webhook URL not configured');
      return;
    }

    const color = this.getSeverityColor(alert.severity);
    const payload = {
      channel: this.notificationConfig.slack.channel || '#alerts',
      username:
        this.notificationConfig.slack.username || 'Warriors AI Alert System',
      attachments: [
        {
          color,
          title: alert.title,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Source',
              value: alert.source,
              short: true,
            },
            {
              title: 'Timestamp',
              value: new Date(alert.timestamp).toISOString(),
              short: false,
            },
          ],
          footer: 'Warriors AI Monitoring',
          ts: Math.floor(alert.timestamp / 1000),
        },
      ],
    };

    try {
      const response = await fetch(this.notificationConfig.slack.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[AlertManager] Failed to send Slack notification:', error);
    }
  }

  /**
   * Send alert to Email
   */
  private async sendToEmail(alert: Alert): Promise<void> {
    if (!this.notificationConfig.email) {
      console.warn('[AlertManager] Email configuration not set');
      return;
    }

    // Note: Actual email sending would require nodemailer or similar
    // This is a placeholder implementation
    console.log('[AlertManager] Email alert would be sent:', {
      to: this.notificationConfig.email.to,
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      body: alert.message,
    });

    // TODO: Implement actual email sending
    // const transporter = nodemailer.createTransport({ ... });
    // await transporter.sendMail({ ... });
  }

  /**
   * Send alert to PagerDuty
   */
  private async sendToPagerDuty(alert: Alert): Promise<void> {
    if (!this.notificationConfig.pagerduty?.integrationKey) {
      console.warn('[AlertManager] PagerDuty integration key not configured');
      return;
    }

    const payload = {
      routing_key: this.notificationConfig.pagerduty.integrationKey,
      event_action: 'trigger',
      dedup_key: alert.fingerprint,
      payload: {
        summary: alert.title,
        severity: alert.severity,
        source: alert.source,
        timestamp: new Date(alert.timestamp).toISOString(),
        custom_details: alert.metadata,
      },
    };

    try {
      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`PagerDuty API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error(
        '[AlertManager] Failed to send PagerDuty notification:',
        error
      );
    }
  }

  /**
   * Send alert to custom webhook
   */
  private async sendToWebhook(alert: Alert): Promise<void> {
    if (!this.notificationConfig.webhook?.url) {
      console.warn('[AlertManager] Webhook URL not configured');
      return;
    }

    try {
      const response = await fetch(this.notificationConfig.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.notificationConfig.webhook.headers,
        },
        body: JSON.stringify(alert),
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('[AlertManager] Failed to send webhook notification:', error);
    }
  }

  /**
   * Send alert to console
   */
  private async sendToConsole(alert: Alert): Promise<void> {
    const prefix = this.getSeverityPrefix(alert.severity);
    console.log(
      `${prefix} [${alert.source}] ${alert.title}: ${alert.message}`,
      alert.metadata || ''
    );
  }

  /**
   * Log alert to database
   */
  private async logAlert(alert: Alert): Promise<void> {
    try {
      await prisma.systemAudit.create({
        data: {
          eventType: 'ALERT',
          oldValue: alert.severity,
          newValue: JSON.stringify({
            title: alert.title,
            message: alert.message,
            source: alert.source,
            metadata: alert.metadata,
          }),
          txHash: alert.fingerprint,
          blockNumber: 0,
        },
      });
    } catch (error) {
      console.error('[AlertManager] Failed to log alert to database:', error);
    }
  }

  /**
   * Get recent alerts
   */
  getRecentAlerts(limit: number = 50): Alert[] {
    return Array.from(this.alerts.values())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, limit);
  }

  /**
   * Get alerts by severity
   */
  getAlertsBySeverity(severity: AlertSeverity): Alert[] {
    return Array.from(this.alerts.values()).filter(
      (alert) => alert.severity === severity
    );
  }

  /**
   * Clear old alerts (keep last 24 hours)
   */
  clearOldAlerts(): void {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [id, alert] of this.alerts.entries()) {
      if (alert.timestamp < cutoff) {
        this.alerts.delete(id);
      }
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private generateId(): string {
    return `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateFingerprint(title: string, source: string): string {
    return `${source}:${title.replace(/\s+/g, '_').toLowerCase()}`;
  }

  private getDefaultCooldown(severity: AlertSeverity): number {
    switch (severity) {
      case AlertSeverity.INFO:
        return 300000; // 5 minutes
      case AlertSeverity.WARNING:
        return 600000; // 10 minutes
      case AlertSeverity.ERROR:
        return 1800000; // 30 minutes
      case AlertSeverity.CRITICAL:
        return 3600000; // 1 hour
      default:
        return 300000;
    }
  }

  private getDefaultChannels(severity: AlertSeverity): AlertChannel[] {
    switch (severity) {
      case AlertSeverity.INFO:
        return [AlertChannel.CONSOLE];
      case AlertSeverity.WARNING:
        return [AlertChannel.CONSOLE, AlertChannel.SLACK];
      case AlertSeverity.ERROR:
        return [AlertChannel.CONSOLE, AlertChannel.SLACK, AlertChannel.EMAIL];
      case AlertSeverity.CRITICAL:
        return [
          AlertChannel.CONSOLE,
          AlertChannel.SLACK,
          AlertChannel.EMAIL,
          AlertChannel.PAGERDUTY,
        ];
      default:
        return [AlertChannel.CONSOLE];
    }
  }

  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.INFO:
        return '#36a64f'; // Green
      case AlertSeverity.WARNING:
        return '#ff9900'; // Orange
      case AlertSeverity.ERROR:
        return '#ff0000'; // Red
      case AlertSeverity.CRITICAL:
        return '#8b0000'; // Dark red
      default:
        return '#808080'; // Gray
    }
  }

  private getSeverityPrefix(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.INFO:
        return 'ℹ️ [INFO]';
      case AlertSeverity.WARNING:
        return '⚠️ [WARNING]';
      case AlertSeverity.ERROR:
        return '❌ [ERROR]';
      case AlertSeverity.CRITICAL:
        return '🚨 [CRITICAL]';
      default:
        return '[ALERT]';
    }
  }
}

// ============================================================================
// Predefined Alert Rules
// ============================================================================

export const ALERT_RULES = {
  // RPC Health
  rpcDown: {
    name: 'RPC Endpoint Down',
    severity: AlertSeverity.CRITICAL,
    cooldown: 300000, // 5 minutes
  },

  // Circuit Breaker
  circuitBreakerOpen: {
    name: 'Circuit Breaker Open',
    severity: AlertSeverity.ERROR,
    cooldown: 600000, // 10 minutes
  },

  // Queue Health
  queueFull: {
    name: 'Queue at Capacity',
    severity: AlertSeverity.WARNING,
    cooldown: 300000, // 5 minutes
  },

  // Sync Status
  blocksBehind: {
    name: 'Blockchain Sync Falling Behind',
    severity: AlertSeverity.WARNING,
    cooldown: 1800000, // 30 minutes
  },

  // Database
  databaseError: {
    name: 'Database Connection Error',
    severity: AlertSeverity.CRITICAL,
    cooldown: 180000, // 3 minutes
  },

  // High Error Rate
  highErrorRate: {
    name: 'High Error Rate Detected',
    severity: AlertSeverity.ERROR,
    cooldown: 900000, // 15 minutes
  },
};

// ============================================================================
// Global Alert Manager Instance
// ============================================================================

export const globalAlertManager = new AlertManager({
  slack: {
    webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    channel: process.env.SLACK_ALERT_CHANNEL || '#alerts',
    username: 'Warriors AI Monitor',
  },
  pagerduty: {
    integrationKey: process.env.PAGERDUTY_INTEGRATION_KEY || '',
  },
  webhook: {
    url: process.env.ALERT_WEBHOOK_URL || '',
  },
});

// Clean up old alerts every hour
setInterval(() => {
  globalAlertManager.clearOldAlerts();
}, 3600000);
