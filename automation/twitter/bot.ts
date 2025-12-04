import { TwitterApi } from 'twitter-api-v2';
import dotenv from 'dotenv';
import { BlockchainService } from '../shared/blockchain';
import { ContentGenerator } from '../shared/contentGenerator';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  appKey: process.env.TWITTER_API_KEY!,
  appSecret: process.env.TWITTER_API_SECRET!,
  accessToken: process.env.TWITTER_ACCESS_TOKEN!,
  accessSecret: process.env.TWITTER_ACCESS_SECRET!,
};

// ============================================================================
// TWITTER BOT
// ============================================================================

class WarriorsTwitterBot {
  private client: TwitterApi;
  private blockchain: BlockchainService;
  private contentGenerator: ContentGenerator;

  constructor() {
    this.client = new TwitterApi({
      appKey: config.appKey,
      appSecret: config.appSecret,
      accessToken: config.accessToken,
      accessSecret: config.accessSecret,
    });

    this.blockchain = new BlockchainService();
    this.contentGenerator = new ContentGenerator();
  }

  // --------------------------------------------------------------------------
  // CORE TWEET FUNCTIONS
  // --------------------------------------------------------------------------

  async tweet(content: string): Promise<string | null> {
    try {
      const result = await this.client.v2.tweet(content);
      console.log(`✅ Tweet posted: ${result.data.id}`);
      return result.data.id;
    } catch (error) {
      console.error('Failed to post tweet:', error);
      return null;
    }
  }

  async tweetThread(tweets: string[]): Promise<string[]> {
    const tweetIds: string[] = [];
    let lastTweetId: string | undefined;

    for (const content of tweets) {
      try {
        const result = lastTweetId
          ? await this.client.v2.reply(content, lastTweetId)
          : await this.client.v2.tweet(content);

        lastTweetId = result.data.id;
        tweetIds.push(lastTweetId);
        console.log(`✅ Thread tweet posted: ${lastTweetId}`);

        // Rate limit protection
        await this.delay(2000);
      } catch (error) {
        console.error('Failed to post thread tweet:', error);
        break;
      }
    }

    return tweetIds;
  }

  async replyTo(tweetId: string, content: string): Promise<string | null> {
    try {
      const result = await this.client.v2.reply(content, tweetId);
      console.log(`✅ Reply posted: ${result.data.id}`);
      return result.data.id;
    } catch (error) {
      console.error('Failed to post reply:', error);
      return null;
    }
  }

  async quote(tweetId: string, content: string): Promise<string | null> {
    try {
      const result = await this.client.v2.tweet(content, {
        quote_tweet_id: tweetId,
      });
      console.log(`✅ Quote tweet posted: ${result.data.id}`);
      return result.data.id;
    } catch (error) {
      console.error('Failed to post quote tweet:', error);
      return null;
    }
  }

  // --------------------------------------------------------------------------
  // BATTLE RESULT TWEETS
  // --------------------------------------------------------------------------

  async postBattleResult(battle: any): Promise<void> {
    const moves = ['STRIKE', 'TAUNT', 'DODGE', 'SPECIAL', 'RECOVER'];

    const winner =
      battle.warrior1Damage < battle.warrior2Damage
        ? battle.warrior1Id
        : battle.warrior2Id;

    let roundsText = '';
    for (let i = 0; i < 5; i++) {
      roundsText += `R${i + 1}: ${moves[battle.warrior1Moves[i]]} vs ${moves[battle.warrior2Moves[i]]}\n`;
    }

    const content = `⚔️ BATTLE COMPLETE

Warrior #${battle.warrior1Id} vs Warrior #${battle.warrior2Id}

${roundsText}
🏆 Winner: Warrior #${winner}
💥 Damage: ${battle.warrior1Damage} vs ${battle.warrior2Damage}
💰 Prize: ${battle.prizePool} CRwN

The AI has spoken.

#WarriorsAIArena #0G #Web3Gaming`;

    await this.tweet(content);
  }

  async postEpicBattle(battle: any): Promise<void> {
    // For close/exciting battles
    const margin = Math.abs(battle.warrior1Damage - battle.warrior2Damage);
    const winner =
      battle.warrior1Damage < battle.warrior2Damage
        ? battle.warrior1Id
        : battle.warrior2Id;

    const content = `🔥 EPIC BATTLE ALERT

Warrior #${battle.warrior1Id} vs Warrior #${battle.warrior2Id}

Final margin: Only ${margin} damage difference!

Winner: Warrior #${winner} by a hair!

This is why AI battles hit different.

#WarriorsAIArena #0G`;

    await this.tweet(content);
  }

  // --------------------------------------------------------------------------
  // DAILY/SCHEDULED CONTENT
  // --------------------------------------------------------------------------

  async postDailyStats(): Promise<void> {
    const stats = await this.blockchain.getDailyStats();

    const content = `📊 ARENA STATS - ${new Date().toLocaleDateString()}

⚔️ Battles: ${stats.battles}
🎭 New Warriors: ${stats.newWarriors}
💰 Volume: ${stats.volume} CRwN
🏆 Top Warrior: #${stats.topWarrior.id}

The arena never sleeps.

#WarriorsAIArena #0G #DailyStats`;

    await this.tweet(content);
  }

  async postWeeklyRecap(): Promise<void> {
    const stats = await this.blockchain.getWeeklyStats();

    const content = `📈 WEEKLY RECAP

This week in Warriors AI Arena:

⚔️ ${stats.battles} battles fought
🎭 ${stats.newWarriors} warriors minted
💰 ${stats.volume} CRwN wagered
🏆 Champion: Warrior #${stats.topWarrior.id} (${stats.topWarrior.wins} wins)

See you next week!

#WarriorsAIArena #WeeklyRecap`;

    await this.tweet(content);
  }

  async postStrategyTip(): Promise<void> {
    const tips = [
      `💡 STRATEGY TIP

Warriors with high WIT use TAUNT more often.

TAUNT reduces opponent's influence costs, making their buffs cheaper.

Counter? High DEFENCE warriors can DODGE the psychological damage.

What's your warrior's build?`,

      `💡 STRATEGY TIP

LUCK affects your success rate on ALL moves.

Min 10%, Max 90% - no guaranteed hits or misses.

High LUCK warriors are unpredictable. Low LUCK? Consistent but risky.

How lucky is your warrior?`,

      `💡 STRATEGY TIP

RECOVER heals previous damage, but it's based on DEFENCE + CHARISMA.

Tank builds with high DEF excel at outlasting aggressive opponents.

Sometimes the best offense is staying alive.`,

      `💡 STRATEGY TIP

SPECIAL MOVE uses ALL your stats for maximum damage.

But it's high risk - if it misses, you've wasted a round.

Best used when you're ahead or desperate.`,

      `💡 STRATEGY TIP

INFLUENCE during battles boosts your warrior's damage.

DEFLUENCE weakens your opponent (one-time per game).

When to use each? That's where strategy meets spending.`,
    ];

    const tip = tips[Math.floor(Math.random() * tips.length)];
    await this.tweet(tip + '\n\n#WarriorsAIArena #Strategy');
  }

  async postLeaderboardUpdate(): Promise<void> {
    const leaderboard = await this.blockchain.getLeaderboard('wins', 5);

    let leaderboardText = '';
    leaderboard.forEach((entry: any, index: number) => {
      const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      leaderboardText += `${medals[index]} Warrior #${entry.id} - ${entry.wins} wins\n`;
    });

    const content = `🏆 LEADERBOARD UPDATE

Top Warriors by Wins:

${leaderboardText}
Think you can climb higher?

#WarriorsAIArena #Leaderboard`;

    await this.tweet(content);
  }

  // --------------------------------------------------------------------------
  // ENGAGEMENT & COMMUNITY
  // --------------------------------------------------------------------------

  async postEngagementQuestion(): Promise<void> {
    const questions = [
      `Quick poll for warriors:

What trait do you prioritize?

💪 STRENGTH - Maximum damage
🧠 WIT - Outsmart opponents
✨ CHARISMA - Manipulate battles
🛡️ DEFENCE - Outlast everyone
🍀 LUCK - Trust fate

Reply with your pick!`,

      `Question for the arena:

Aggressive or defensive playstyle?

⚔️ Aggressive - Strike hard, win fast
🛡️ Defensive - Outlast, counter, win

Which AI personality do you prefer?`,

      `If you could add one new move to Warriors AI Arena, what would it be?

Current moves:
- STRIKE
- TAUNT
- DODGE
- SPECIAL
- RECOVER

Drop your ideas below 👇`,

      `What's your warrior's biggest win?

Share your best battle stories!

Screenshots welcome 📸`,
    ];

    const question = questions[Math.floor(Math.random() * questions.length)];
    await this.tweet(question + '\n\n#WarriorsAIArena');
  }

  async postMilestone(type: string, value: number): Promise<void> {
    const milestones: Record<string, string> = {
      battles: `🎉 MILESTONE REACHED!

${value.toLocaleString()} battles completed in Warriors AI Arena!

Every battle is AI-powered, on-chain verified, and unique.

Thank you to our amazing community!`,

      warriors: `🎉 MILESTONE REACHED!

${value.toLocaleString()} warriors have entered the arena!

Each one with unique AI personality and traits.

The army grows stronger!`,

      volume: `🎉 MILESTONE REACHED!

${value.toLocaleString()} CRwN wagered in the arena!

The stakes are real. The battles are AI.

Who's next?`,
    };

    const content = milestones[type];
    if (content) {
      await this.tweet(content + '\n\n#WarriorsAIArena #Milestone');
    }
  }

  // --------------------------------------------------------------------------
  // TOURNAMENT TWEETS
  // --------------------------------------------------------------------------

  async postTournamentAnnouncement(tournament: any): Promise<void> {
    const content = `🏆 TOURNAMENT ANNOUNCEMENT

${tournament.name}

📅 Date: ${new Date(tournament.startTime).toLocaleDateString()}
💰 Prize Pool: ${tournament.prizePool} CRwN
👥 Max Participants: ${tournament.maxParticipants}
🎫 Entry: ${tournament.entryFee > 0 ? `${tournament.entryFee} CRwN` : 'FREE'}

Registration now open!

Link: ${tournament.registrationLink}

#WarriorsAIArena #Tournament`;

    await this.tweet(content);
  }

  async postTournamentReminder(tournament: any): Promise<void> {
    const content = `⏰ TOURNAMENT REMINDER

${tournament.name} starts in 24 hours!

Current registrations: ${tournament.participants}/${tournament.maxParticipants}

Don't miss your chance to compete!

Register: ${tournament.registrationLink}

#WarriorsAIArena`;

    await this.tweet(content);
  }

  async postTournamentResult(tournament: any): Promise<void> {
    const content = `🏆 TOURNAMENT COMPLETE

${tournament.name} Results:

🥇 1st: Warrior #${tournament.first.id} - ${tournament.first.prize} CRwN
🥈 2nd: Warrior #${tournament.second.id} - ${tournament.second.prize} CRwN
🥉 3rd: Warrior #${tournament.third.id} - ${tournament.third.prize} CRwN

Congratulations to all participants!

Next tournament coming soon...

#WarriorsAIArena #Tournament`;

    await this.tweet(content);
  }

  // --------------------------------------------------------------------------
  // NEW WARRIOR MINTED
  // --------------------------------------------------------------------------

  async postNewWarrior(warrior: any): Promise<void> {
    // Only post for notable warriors (every 10th, or special traits)
    const isNotable =
      warrior.id % 10 === 0 ||
      warrior.traits.strength > 8000 ||
      warrior.traits.luck > 8000;

    if (!isNotable) return;

    const content = `🎭 NEW WARRIOR ENTERS

Warrior #${warrior.id} has been minted!

💪 STR: ${warrior.traits.strength}
🧠 WIT: ${warrior.traits.wit}
✨ CHA: ${warrior.traits.charisma}
🛡️ DEF: ${warrior.traits.defence}
🍀 LCK: ${warrior.traits.luck}

Ready for battle!

#WarriorsAIArena #NewWarrior`;

    await this.tweet(content);
  }

  // --------------------------------------------------------------------------
  // AUTO-REPLY SYSTEM
  // --------------------------------------------------------------------------

  async monitorMentions(): Promise<void> {
    try {
      const mentions = await this.client.v2.userMentionTimeline(
        (await this.client.v2.me()).data.id,
        { max_results: 10 }
      );

      for (const mention of mentions.data.data || []) {
        await this.handleMention(mention);
        await this.delay(5000); // Rate limiting
      }
    } catch (error) {
      console.error('Error monitoring mentions:', error);
    }
  }

  private async handleMention(mention: any): Promise<void> {
    const text = mention.text.toLowerCase();

    // Determine response based on content
    let response: string | null = null;

    if (text.includes('how') && (text.includes('play') || text.includes('start'))) {
      response = `Hey! Here's how to get started:

1️⃣ Visit our website
2️⃣ Connect your wallet
3️⃣ Mint a warrior (free, gas only)
4️⃣ Enter the arena
5️⃣ Watch your AI battle!

Full guide: [link]`;
    } else if (text.includes('mint') || text.includes('nft')) {
      response = `Minting is live! 🎭

Visit our website, connect wallet, and mint your AI warrior.

Each warrior gets unique traits that shape their AI personality.

Let me know if you have questions!`;
    } else if (text.includes('price') || text.includes('cost')) {
      response = `Warriors AI Arena minting is FREE (just pay gas)!

Crown Tokens (CRwN) are 1:1 with FLOW for betting.

No hidden costs, no pay-to-win.`;
    } else if (text.includes('when') && text.includes('tournament')) {
      response = `Tournaments happen regularly:

📅 Weekly: Every Saturday
📅 Monthly: Last weekend of month
📅 Seasonal: Quarterly finals

Check our Discord for the full schedule!`;
    }

    if (response) {
      await this.replyTo(mention.id, response);
    }
  }

  // --------------------------------------------------------------------------
  // UTILITY
  // --------------------------------------------------------------------------

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // --------------------------------------------------------------------------
  // START LISTENERS
  // --------------------------------------------------------------------------

  startBlockchainListeners(): void {
    this.blockchain.onBattleComplete(async (battle) => {
      // Only post 10% of battles to avoid spam
      if (Math.random() < 0.1) {
        await this.postBattleResult(battle);
      }

      // Always post epic battles (close margin)
      const margin = Math.abs(battle.warrior1Damage - battle.warrior2Damage);
      if (margin < 500) {
        await this.postEpicBattle(battle);
      }
    });

    this.blockchain.onWarriorMinted(async (warrior) => {
      await this.postNewWarrior(warrior);
    });

    console.log('✅ Twitter blockchain listeners started');
  }
}

export { WarriorsTwitterBot };
