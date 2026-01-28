/**
 * Webhook Notification System
 * Sends real-time notifications for battle execution events
 */

interface WebhookPayload {
  event: string;
  data: any;
  timestamp: string;
}

interface NotificationConfig {
  webhookUrl?: string;
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
  enableEmail?: boolean;
  emailRecipients?: string[];
}

export class WebhookNotifier {
  private config: NotificationConfig;

  constructor(config: NotificationConfig = {}) {
    this.config = config;
  }

  /**
   * Send notification when battle is scheduled
   */
  async notifyBattleScheduled(battleData: {
    battleId: number;
    warrior1Id: number;
    warrior2Id: number;
    scheduledTime: Date;
    transactionId: string;
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'battle.scheduled',
      data: {
        battleId: battleData.battleId,
        warrior1Id: battleData.warrior1Id,
        warrior2Id: battleData.warrior2Id,
        scheduledTime: battleData.scheduledTime.toISOString(),
        transactionId: battleData.transactionId,
        explorerUrl: `https://testnet.flowdiver.io/tx/${battleData.transactionId}`,
      },
      timestamp: new Date().toISOString(),
    };

    await this.sendNotifications(payload, {
      title: '⚔️ Battle Scheduled',
      message: `Battle #${battleData.battleId} scheduled for ${battleData.scheduledTime.toLocaleString()}`,
      color: '#9333ea', // purple
    });
  }

  /**
   * Send notification when battle is executed
   */
  async notifyBattleExecuted(battleData: {
    battleId: number;
    winner: number;
    transactionId: string;
    attempts?: number;
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'battle.executed',
      data: {
        battleId: battleData.battleId,
        winner: battleData.winner,
        transactionId: battleData.transactionId,
        attempts: battleData.attempts || 1,
        explorerUrl: `https://testnet.flowdiver.io/tx/${battleData.transactionId}`,
      },
      timestamp: new Date().toISOString(),
    };

    await this.sendNotifications(payload, {
      title: '✅ Battle Executed',
      message: `Battle #${battleData.battleId} executed! Winner: Warrior #${battleData.winner}`,
      color: '#10b981', // green
    });
  }

  /**
   * Send notification when battle execution fails
   */
  async notifyBattleExecutionFailed(battleData: {
    battleId: number;
    error: string;
    attempts: number;
    maxRetries: number;
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'battle.execution_failed',
      data: {
        battleId: battleData.battleId,
        error: battleData.error,
        attempts: battleData.attempts,
        maxRetries: battleData.maxRetries,
        willRetry: battleData.attempts < battleData.maxRetries,
      },
      timestamp: new Date().toISOString(),
    };

    await this.sendNotifications(payload, {
      title: '❌ Battle Execution Failed',
      message: `Battle #${battleData.battleId} failed (attempt ${battleData.attempts}/${battleData.maxRetries}): ${battleData.error}`,
      color: '#ef4444', // red
    });
  }

  /**
   * Send notification for queue stats
   */
  async notifyQueueStats(stats: {
    total: number;
    pending: number;
    executing: number;
    completed: number;
    failed: number;
  }): Promise<void> {
    const payload: WebhookPayload = {
      event: 'queue.stats',
      data: stats,
      timestamp: new Date().toISOString(),
    };

    await this.sendNotifications(payload, {
      title: '📊 Queue Statistics',
      message: `Total: ${stats.total} | Pending: ${stats.pending} | Completed: ${stats.completed} | Failed: ${stats.failed}`,
      color: '#3b82f6', // blue
    });
  }

  /**
   * Send notifications to all configured channels
   */
  private async sendNotifications(
    payload: WebhookPayload,
    formatting: { title: string; message: string; color: string }
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    // Generic webhook
    if (this.config.webhookUrl) {
      promises.push(this.sendGenericWebhook(this.config.webhookUrl, payload));
    }

    // Slack webhook
    if (this.config.slackWebhookUrl) {
      promises.push(this.sendSlackWebhook(this.config.slackWebhookUrl, payload, formatting));
    }

    // Discord webhook
    if (this.config.discordWebhookUrl) {
      promises.push(
        this.sendDiscordWebhook(this.config.discordWebhookUrl, payload, formatting)
      );
    }

    // Email (if configured)
    if (this.config.enableEmail && this.config.emailRecipients) {
      promises.push(this.sendEmail(payload, formatting));
    }

    // Send all notifications in parallel
    await Promise.allSettled(promises);
  }

  /**
   * Send generic webhook
   */
  private async sendGenericWebhook(url: string, payload: WebhookPayload): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }

      console.log('[Webhook Notifier] Generic webhook sent successfully');
    } catch (error) {
      console.error('[Webhook Notifier] Generic webhook error:', error);
    }
  }

  /**
   * Send Slack webhook
   */
  private async sendSlackWebhook(
    url: string,
    payload: WebhookPayload,
    formatting: { title: string; message: string; color: string }
  ): Promise<void> {
    try {
      const slackPayload = {
        attachments: [
          {
            color: formatting.color,
            title: formatting.title,
            text: formatting.message,
            fields: Object.entries(payload.data).map(([key, value]) => ({
              title: key,
              value: String(value),
              short: true,
            })),
            footer: 'WarriorsAI Flow Scheduler',
            ts: Math.floor(new Date(payload.timestamp).getTime() / 1000),
          },
        ],
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(slackPayload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.status} ${response.statusText}`);
      }

      console.log('[Webhook Notifier] Slack webhook sent successfully');
    } catch (error) {
      console.error('[Webhook Notifier] Slack webhook error:', error);
    }
  }

  /**
   * Send Discord webhook
   */
  private async sendDiscordWebhook(
    url: string,
    payload: WebhookPayload,
    formatting: { title: string; message: string; color: string }
  ): Promise<void> {
    try {
      const colorInt = parseInt(formatting.color.replace('#', ''), 16);

      const discordPayload = {
        embeds: [
          {
            title: formatting.title,
            description: formatting.message,
            color: colorInt,
            fields: Object.entries(payload.data).map(([key, value]) => ({
              name: key,
              value: String(value),
              inline: true,
            })),
            footer: {
              text: 'WarriorsAI Flow Scheduler',
            },
            timestamp: payload.timestamp,
          },
        ],
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(discordPayload),
      });

      if (!response.ok) {
        throw new Error(`Discord webhook failed: ${response.status} ${response.statusText}`);
      }

      console.log('[Webhook Notifier] Discord webhook sent successfully');
    } catch (error) {
      console.error('[Webhook Notifier] Discord webhook error:', error);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmail(
    payload: WebhookPayload,
    formatting: { title: string; message: string }
  ): Promise<void> {
    try {
      // Call your email API endpoint
      const response = await fetch('/api/notifications/email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipients: this.config.emailRecipients,
          subject: formatting.title,
          body: formatting.message,
          data: payload.data,
        }),
      });

      if (!response.ok) {
        throw new Error(`Email send failed: ${response.status} ${response.statusText}`);
      }

      console.log('[Webhook Notifier] Email sent successfully');
    } catch (error) {
      console.error('[Webhook Notifier] Email error:', error);
    }
  }
}

// Singleton instance
let notifierInstance: WebhookNotifier | null = null;

export function getWebhookNotifier(config?: NotificationConfig): WebhookNotifier {
  if (!notifierInstance) {
    notifierInstance = new WebhookNotifier(config || {
      webhookUrl: process.env.WEBHOOK_URL,
      slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
      discordWebhookUrl: process.env.DISCORD_WEBHOOK_URL,
      enableEmail: process.env.ENABLE_EMAIL_NOTIFICATIONS === 'true',
      emailRecipients: process.env.EMAIL_RECIPIENTS?.split(','),
    });
  }

  return notifierInstance;
}
