/**
 * Monitoring and Alerting System
 * Sends alerts to Slack/Discord for critical system events
 */

export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface AlertPayload {
  title: string;
  message: string;
  severity: AlertSeverity;
  timestamp: string;
  context?: Record<string, unknown>;
}

/**
 * Send alert to Slack webhook
 */
async function sendSlackAlert(payload: AlertPayload): Promise<void> {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const color = {
    info: '#36a64f',
    warning: '#ffcc00',
    error: '#ff6b6b',
    critical: '#ff0000',
  }[payload.severity];

  const slackPayload = {
    username: 'Flow Scheduled Transactions',
    icon_emoji: ':robot_face:',
    attachments: [
      {
        color,
        title: payload.title,
        text: payload.message,
        fields: payload.context
          ? Object.entries(payload.context).map(([key, value]) => ({
              title: key,
              value: String(value),
              short: true,
            }))
          : [],
        footer: 'WarriorsAI Arena',
        ts: Math.floor(new Date(payload.timestamp).getTime() / 1000),
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    if (!response.ok) {
      console.error('[Alerts] Slack webhook failed:', response.status);
    }
  } catch (error) {
    console.error('[Alerts] Failed to send Slack alert:', error);
  }
}

/**
 * Send alert to Discord webhook
 */
async function sendDiscordAlert(payload: AlertPayload): Promise<void> {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const color = {
    info: 0x36a64f,
    warning: 0xffcc00,
    error: 0xff6b6b,
    critical: 0xff0000,
  }[payload.severity];

  const discordPayload = {
    username: 'Flow Scheduled Transactions',
    embeds: [
      {
        color,
        title: payload.title,
        description: payload.message,
        fields: payload.context
          ? Object.entries(payload.context).map(([name, value]) => ({
              name,
              value: String(value),
              inline: true,
            }))
          : [],
        timestamp: payload.timestamp,
        footer: {
          text: 'WarriorsAI Arena',
        },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(discordPayload),
    });

    if (!response.ok) {
      console.error('[Alerts] Discord webhook failed:', response.status);
    }
  } catch (error) {
    console.error('[Alerts] Failed to send Discord alert:', error);
  }
}

/**
 * Send alert to all configured channels
 */
export async function sendAlert(
  title: string,
  message: string,
  severity: AlertSeverity = 'info',
  context?: Record<string, unknown>
): Promise<void> {
  const payload: AlertPayload = {
    title,
    message,
    severity,
    timestamp: new Date().toISOString(),
    context,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    const emoji = {
      info: 'ℹ️',
      warning: '⚠️',
      error: '❌',
      critical: '🚨',
    }[severity];

    console.log(`\n${emoji} [Alert] ${title}`);
    console.log(`Message: ${message}`);
    if (context) {
      console.log('Context:', context);
    }
  }

  // Send to configured channels in parallel
  await Promise.allSettled([sendSlackAlert(payload), sendDiscordAlert(payload)]);
}

/**
 * Alert for high error rate
 */
export async function alertHighErrorRate(errorRate: number, threshold: number): Promise<void> {
  await sendAlert(
    'High Error Rate Detected',
    `Error rate is ${errorRate.toFixed(2)}%, exceeding threshold of ${threshold}%`,
    errorRate > threshold * 2 ? 'critical' : 'error',
    {
      errorRate: `${errorRate.toFixed(2)}%`,
      threshold: `${threshold}%`,
      action: 'Review error logs and consider rolling back',
    }
  );
}

/**
 * Alert for high queue depth
 */
export async function alertHighQueueDepth(queueDepth: number, threshold: number): Promise<void> {
  await sendAlert(
    'High Queue Depth',
    `${queueDepth} battles pending execution, exceeding threshold of ${threshold}`,
    queueDepth > threshold * 2 ? 'critical' : 'warning',
    {
      queueDepth: String(queueDepth),
      threshold: String(threshold),
      action: 'Check cron job is running and Flow network is accessible',
    }
  );
}

/**
 * Alert for slow execution time
 */
export async function alertSlowExecution(
  avgTime: number,
  threshold: number
): Promise<void> {
  await sendAlert(
    'Slow Battle Execution',
    `Average execution time is ${avgTime}ms, exceeding threshold of ${threshold}ms`,
    avgTime > threshold * 2 ? 'error' : 'warning',
    {
      averageTime: `${avgTime}ms`,
      threshold: `${threshold}ms`,
      action: 'Check Flow network status and RPC performance',
    }
  );
}

/**
 * Alert for low success rate
 */
export async function alertLowSuccessRate(
  successRate: number,
  threshold: number
): Promise<void> {
  await sendAlert(
    'Low Success Rate',
    `Success rate is ${successRate.toFixed(2)}%, below threshold of ${threshold}%`,
    'critical',
    {
      successRate: `${successRate.toFixed(2)}%`,
      threshold: `${threshold}%`,
      action: 'Investigate failures and consider pausing scheduled executions',
    }
  );
}

/**
 * Alert for authentication failures spike
 */
export async function alertAuthFailuresSpike(
  failureCount: number,
  timeWindow: string
): Promise<void> {
  await sendAlert(
    'Authentication Failures Spike',
    `${failureCount} authentication failures detected in ${timeWindow}`,
    'warning',
    {
      failureCount: String(failureCount),
      timeWindow,
      action: 'Possible attack detected. Review access logs.',
    }
  );
}

/**
 * Alert for successful deployment
 */
export async function alertDeploymentSuccess(version: string): Promise<void> {
  await sendAlert(
    'Deployment Successful',
    `Flow Scheduled Transactions v${version} deployed successfully`,
    'info',
    {
      version,
      timestamp: new Date().toISOString(),
    }
  );
}

/**
 * Alert for system health check failure
 */
export async function alertHealthCheckFailure(
  component: string,
  error: string
): Promise<void> {
  await sendAlert(
    'Health Check Failed',
    `${component} health check failed: ${error}`,
    'critical',
    {
      component,
      error,
      action: 'Check service status and restart if necessary',
    }
  );
}

/**
 * Alert for database connection issues
 */
export async function alertDatabaseIssue(error: string): Promise<void> {
  await sendAlert(
    'Database Connection Issue',
    `Database connectivity problem detected: ${error}`,
    'critical',
    {
      error,
      action: 'Check DATABASE_URL and database server status',
    }
  );
}

/**
 * Alert for Flow network issues
 */
export async function alertFlowNetworkIssue(error: string): Promise<void> {
  await sendAlert(
    'Flow Network Issue',
    `Flow blockchain connectivity problem: ${error}`,
    'error',
    {
      error,
      action: 'Check https://status.onflow.org/ and consider using fallback RPC',
    }
  );
}

/**
 * Alert for idempotency violation
 */
export async function alertIdempotencyViolation(
  battleId: number,
  details: string
): Promise<void> {
  await sendAlert(
    'Idempotency Violation Prevented',
    `Attempted duplicate execution of battle ${battleId}: ${details}`,
    'warning',
    {
      battleId: String(battleId),
      details,
      action: 'Review execution logs for race conditions',
    }
  );
}

/**
 * Rate limiter to prevent alert spam
 */
const alertCache = new Map<string, number>();
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Send alert with rate limiting to prevent spam
 */
export async function sendAlertWithRateLimit(
  key: string,
  title: string,
  message: string,
  severity: AlertSeverity = 'info',
  context?: Record<string, unknown>
): Promise<void> {
  const now = Date.now();
  const lastSent = alertCache.get(key);

  if (lastSent && now - lastSent < ALERT_COOLDOWN_MS) {
    // Skip this alert, too soon since last one
    return;
  }

  alertCache.set(key, now);
  await sendAlert(title, message, severity, context);
}

/**
 * Clean up old alert cache entries
 */
export function cleanupAlertCache(): void {
  const now = Date.now();
  for (const [key, timestamp] of alertCache.entries()) {
    if (now - timestamp > ALERT_COOLDOWN_MS) {
      alertCache.delete(key);
    }
  }
}

// Clean up alert cache every 10 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(cleanupAlertCache, 10 * 60 * 1000);
}