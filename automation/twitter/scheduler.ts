import cron from 'node-cron';
import { WarriorsTwitterBot } from './bot';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// TWITTER SCHEDULER
// ============================================================================

class TwitterScheduler {
  private bot: WarriorsTwitterBot;

  constructor() {
    this.bot = new WarriorsTwitterBot();
  }

  // --------------------------------------------------------------------------
  // SCHEDULE CONFIGURATION
  // --------------------------------------------------------------------------

  start(): void {
    console.log('🕐 Starting Twitter scheduler...');

    // -------------------------------------------------------------------------
    // DAILY CONTENT (Every day)
    // -------------------------------------------------------------------------

    // Morning stats (9 AM UTC)
    cron.schedule('0 9 * * *', async () => {
      console.log('📊 Posting daily stats...');
      await this.bot.postDailyStats();
    });

    // Strategy tip (2 PM UTC)
    cron.schedule('0 14 * * *', async () => {
      console.log('💡 Posting strategy tip...');
      await this.bot.postStrategyTip();
    });

    // Engagement question (6 PM UTC)
    cron.schedule('0 18 * * *', async () => {
      console.log('❓ Posting engagement question...');
      await this.bot.postEngagementQuestion();
    });

    // Leaderboard update (10 PM UTC)
    cron.schedule('0 22 * * *', async () => {
      console.log('🏆 Posting leaderboard update...');
      await this.bot.postLeaderboardUpdate();
    });

    // -------------------------------------------------------------------------
    // WEEKLY CONTENT
    // -------------------------------------------------------------------------

    // Weekly recap (Sunday 8 PM UTC)
    cron.schedule('0 20 * * 0', async () => {
      console.log('📈 Posting weekly recap...');
      await this.bot.postWeeklyRecap();
    });

    // Tournament reminder (Friday 4 PM UTC)
    cron.schedule('0 16 * * 5', async () => {
      console.log('🏆 Posting tournament reminder...');
      // Check for upcoming tournament and post reminder
      // await this.bot.postTournamentReminder(tournament);
    });

    // -------------------------------------------------------------------------
    // MENTION MONITORING (Every 15 minutes)
    // -------------------------------------------------------------------------

    cron.schedule('*/15 * * * *', async () => {
      console.log('🔍 Checking mentions...');
      await this.bot.monitorMentions();
    });

    // -------------------------------------------------------------------------
    // BLOCKCHAIN LISTENERS
    // -------------------------------------------------------------------------

    this.bot.startBlockchainListeners();

    console.log('✅ Twitter scheduler started with the following schedule:');
    console.log('   - 9:00 UTC: Daily stats');
    console.log('   - 14:00 UTC: Strategy tip');
    console.log('   - 18:00 UTC: Engagement question');
    console.log('   - 22:00 UTC: Leaderboard update');
    console.log('   - Sunday 20:00 UTC: Weekly recap');
    console.log('   - Every 15 min: Mention monitoring');
    console.log('   - Real-time: Battle results & epic battles');
  }
}

// ============================================================================
// CONTENT CALENDAR TEMPLATES
// ============================================================================

const contentCalendar = {
  monday: {
    morning: 'battleHighlights', // Weekend battle highlights
    afternoon: 'strategyTip',
    evening: 'engagementQuestion',
  },
  tuesday: {
    morning: 'dailyStats',
    afternoon: 'strategyTip',
    evening: 'leaderboardUpdate',
  },
  wednesday: {
    morning: 'communitySpotlight', // Feature top warrior/player
    afternoon: 'techUpdate', // Development news
    evening: 'engagementQuestion',
  },
  thursday: {
    morning: 'dailyStats',
    afternoon: 'strategyTip',
    evening: 'tournamentPreview',
  },
  friday: {
    morning: 'weekendPreview',
    afternoon: 'tournamentReminder',
    evening: 'hypePost',
  },
  saturday: {
    morning: 'tournamentDay',
    afternoon: 'liveBattleUpdates',
    evening: 'dailyStats',
  },
  sunday: {
    morning: 'tournamentResults',
    afternoon: 'weeklyRecap',
    evening: 'lookAhead', // Preview next week
  },
};

// ============================================================================
// MANUAL TWEET TEMPLATES
// ============================================================================

const tweetTemplates = {
  // Announcement templates
  announcement: {
    feature: (feature: string) => `
🚀 NEW FEATURE ALERT

${feature}

Now live in Warriors AI Arena!

Try it out: [link]

#WarriorsAIArena #Update`,

    partnership: (partner: string) => `
🤝 PARTNERSHIP ANNOUNCEMENT

We're excited to partner with ${partner}!

Stay tuned for what's coming...

#WarriorsAIArena #Partnership`,

    maintenance: (time: string, duration: string) => `
🔧 SCHEDULED MAINTENANCE

The arena will be down for maintenance:

📅 Time: ${time}
⏱️ Duration: ~${duration}

We'll be back stronger!

#WarriorsAIArena`,
  },

  // Hype templates
  hype: {
    countdown: (days: number, event: string) => `
⏰ ${days} DAYS TO GO

${event} is almost here!

Are you ready?

#WarriorsAIArena`,

    milestone: (metric: string, value: string) => `
🎉 WE DID IT!

${value} ${metric}!

Thank you to everyone who believed in AI-powered combat.

This is just the beginning.

#WarriorsAIArena #Milestone`,
  },

  // Educational templates
  education: {
    howTo: (topic: string, steps: string[]) => `
📖 HOW TO: ${topic}

${steps.map((step, i) => `${i + 1}. ${step}`).join('\n')}

Questions? Drop them below!

#WarriorsAIArena #Guide`,

    explainer: (concept: string, explanation: string) => `
🧠 EXPLAINED: ${concept}

${explanation}

Now you know!

#WarriorsAIArena #Learn`,
  },
};

// ============================================================================
// START SCHEDULER
// ============================================================================

const scheduler = new TwitterScheduler();
scheduler.start();

export { TwitterScheduler, contentCalendar, tweetTemplates };
