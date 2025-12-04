import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// AI CONTENT GENERATOR
// ============================================================================

class ContentGenerator {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  // --------------------------------------------------------------------------
  // BATTLE COMMENTARY
  // --------------------------------------------------------------------------

  async generateBattleCommentary(battle: any): Promise<string> {
    const moves = ['STRIKE', 'TAUNT', 'DODGE', 'SPECIAL', 'RECOVER'];

    const prompt = `You are a sports commentator for an AI-powered warrior battle game.
Generate exciting, brief commentary (max 200 characters) for this battle:

Warrior #${battle.warrior1Id} vs Warrior #${battle.warrior2Id}
Round moves: ${battle.warrior1Moves.map((m: number, i: number) => `R${i + 1}: ${moves[m]} vs ${moves[battle.warrior2Moves[i]]}`).join(', ')}
Final damage: ${battle.warrior1Damage} vs ${battle.warrior2Damage}
Winner: Warrior #${battle.winner}

Make it exciting and suitable for Twitter. No hashtags.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.8,
      });

      return response.choices[0].message.content || 'An epic battle concluded!';
    } catch (error) {
      console.error('Failed to generate commentary:', error);
      return 'Another thrilling battle in the arena!';
    }
  }

  // --------------------------------------------------------------------------
  // WARRIOR INTRODUCTIONS
  // --------------------------------------------------------------------------

  async generateWarriorIntro(warrior: any): Promise<string> {
    const prompt = `Create a brief, exciting introduction (max 150 characters) for a new warrior NFT with these traits:

Strength: ${warrior.traits.strength}/10000
Wit: ${warrior.traits.wit}/10000
Charisma: ${warrior.traits.charisma}/10000
Defence: ${warrior.traits.defence}/10000
Luck: ${warrior.traits.luck}/10000

Describe their fighting style personality based on their highest stats. Be creative and fun.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 80,
        temperature: 0.9,
      });

      return response.choices[0].message.content || 'A new challenger approaches!';
    } catch (error) {
      console.error('Failed to generate warrior intro:', error);
      return 'A new warrior enters the arena!';
    }
  }

  // --------------------------------------------------------------------------
  // STRATEGY TIPS
  // --------------------------------------------------------------------------

  async generateStrategyTip(): Promise<string> {
    const topics = [
      'the STRIKE move and when to use it',
      'defensive strategies using DODGE',
      'the power of TAUNT in psychological warfare',
      'timing your SPECIAL move for maximum impact',
      'using RECOVER to outlast aggressive opponents',
      'how LUCK affects battle outcomes',
      'building balanced vs specialized warriors',
      'the importance of CHARISMA in battles',
      'when to use INFLUENCE vs DEFLUENCE',
      'adapting strategy based on opponent traits',
    ];

    const topic = topics[Math.floor(Math.random() * topics.length)];

    const prompt = `You are a strategy guide writer for Warriors AI Arena, an AI-powered NFT battle game.

Write a helpful strategy tip about: ${topic}

The game has:
- 5 traits: Strength, Wit, Charisma, Defence, Luck (0-10000 scale)
- 5 moves: STRIKE (damage), TAUNT (psychological), DODGE (evade), SPECIAL (max damage), RECOVER (heal)
- Players can INFLUENCE (boost damage) or DEFLUENCE (weaken opponent) during battles

Keep it under 250 characters, practical, and engaging. Start with an emoji.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.7,
      });

      return response.choices[0].message.content || '💡 Master your warrior\'s strengths!';
    } catch (error) {
      console.error('Failed to generate strategy tip:', error);
      return '💡 Pro tip: Know your warrior\'s strengths and play to them!';
    }
  }

  // --------------------------------------------------------------------------
  // ENGAGEMENT QUESTIONS
  // --------------------------------------------------------------------------

  async generateEngagementQuestion(): Promise<string> {
    const prompt = `Generate an engaging question for the Warriors AI Arena community on Twitter.

The game is an AI-powered NFT battle game where:
- Warriors have 5 traits that affect AI behavior
- Battles are decided by AI, not RNG
- Players can influence battles with tokens

Create a fun, engaging question that encourages replies. Could be:
- Asking about favorite strategies
- Hypothetical scenarios
- Preferences between playstyles
- Community opinions

Keep it under 200 characters. Make it conversational.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.9,
      });

      return response.choices[0].message.content || 'What\'s your favorite battle strategy?';
    } catch (error) {
      console.error('Failed to generate question:', error);
      return 'Which trait do you value most in a warrior?';
    }
  }

  // --------------------------------------------------------------------------
  // REPLY GENERATION
  // --------------------------------------------------------------------------

  async generateReply(mention: string, context: string): Promise<string> {
    const prompt = `You are the social media manager for Warriors AI Arena, an AI-powered NFT battle game on 0G Network.

Someone mentioned us with: "${mention}"

Context: ${context}

Generate a helpful, friendly reply (max 250 characters). Be:
- Helpful and informative
- Friendly but professional
- Direct about pointing to resources if needed

Don't use excessive emojis. Don't be overly promotional.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 100,
        temperature: 0.7,
      });

      return response.choices[0].message.content || 'Thanks for reaching out! Check our website for more info.';
    } catch (error) {
      console.error('Failed to generate reply:', error);
      return 'Thanks for the message! Visit our website for more info.';
    }
  }

  // --------------------------------------------------------------------------
  // ANNOUNCEMENT GENERATION
  // --------------------------------------------------------------------------

  async generateAnnouncement(type: string, details: any): Promise<string> {
    const prompts: Record<string, string> = {
      feature: `Write a Twitter announcement for a new feature: ${details.feature}.
Keep it exciting, under 250 characters, mention it's live now.`,

      milestone: `Write a Twitter announcement celebrating reaching ${details.value} ${details.metric}.
Be excited but genuine. Under 250 characters. Thank the community.`,

      tournament: `Write a Twitter announcement for an upcoming tournament:
Name: ${details.name}
Prize: ${details.prize}
Date: ${details.date}
Keep it under 250 characters, create urgency.`,

      maintenance: `Write a professional Twitter announcement about scheduled maintenance:
Time: ${details.time}
Duration: ${details.duration}
Keep it informative, apologetic, under 200 characters.`,
    };

    const prompt = prompts[type] || 'Write a brief announcement for Warriors AI Arena.';

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 120,
        temperature: 0.7,
      });

      return response.choices[0].message.content || 'Exciting news from Warriors AI Arena!';
    } catch (error) {
      console.error('Failed to generate announcement:', error);
      return 'Stay tuned for updates from Warriors AI Arena!';
    }
  }
}

export { ContentGenerator };
