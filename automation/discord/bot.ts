import {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  TextChannel,
  SlashCommandBuilder,
  REST,
  Routes,
  CommandInteraction,
  ColorResolvable,
} from 'discord.js';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { BlockchainService } from '../shared/blockchain';
import { ContentGenerator } from '../shared/contentGenerator';

dotenv.config();

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  token: process.env.DISCORD_BOT_TOKEN!,
  clientId: process.env.DISCORD_CLIENT_ID!,
  guildId: process.env.DISCORD_GUILD_ID!,
  channels: {
    announcements: process.env.DISCORD_ANNOUNCEMENTS_CHANNEL!,
    battleResults: process.env.DISCORD_BATTLE_RESULTS_CHANNEL!,
    leaderboard: process.env.DISCORD_LEADERBOARD_CHANNEL!,
    general: process.env.DISCORD_GENERAL_CHANNEL!,
  },
};

// ============================================================================
// DISCORD BOT
// ============================================================================

class WarriorsDiscordBot {
  private client: Client;
  private blockchain: BlockchainService;
  private contentGenerator: ContentGenerator;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
      ],
    });

    this.blockchain = new BlockchainService();
    this.contentGenerator = new ContentGenerator();

    this.setupEventHandlers();
  }

  // --------------------------------------------------------------------------
  // EVENT HANDLERS
  // --------------------------------------------------------------------------

  private setupEventHandlers(): void {
    this.client.once('ready', () => this.onReady());
    this.client.on('interactionCreate', (interaction) => this.onInteraction(interaction));
    this.client.on('guildMemberAdd', (member) => this.onMemberJoin(member));
  }

  private async onReady(): Promise<void> {
    console.log(`✅ Warriors AI Arena Bot is online as ${this.client.user?.tag}`);

    // Register slash commands
    await this.registerCommands();

    // Start blockchain event listeners
    this.startBlockchainListeners();

    // Set bot status
    this.client.user?.setActivity('Warriors Battle | /help', { type: 3 });
  }

  private async onInteraction(interaction: any): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
      switch (commandName) {
        case 'warrior':
          await this.handleWarriorCommand(interaction);
          break;
        case 'stats':
          await this.handleStatsCommand(interaction);
          break;
        case 'leaderboard':
          await this.handleLeaderboardCommand(interaction);
          break;
        case 'battle':
          await this.handleBattleCommand(interaction);
          break;
        case 'help':
          await this.handleHelpCommand(interaction);
          break;
        case 'mint':
          await this.handleMintCommand(interaction);
          break;
        case 'tournament':
          await this.handleTournamentCommand(interaction);
          break;
      }
    } catch (error) {
      console.error('Command error:', error);
      await interaction.reply({
        content: 'An error occurred while processing your command.',
        ephemeral: true,
      });
    }
  }

  private async onMemberJoin(member: any): Promise<void> {
    const welcomeEmbed = new EmbedBuilder()
      .setColor('#FFD700' as ColorResolvable)
      .setTitle('⚔️ Welcome to Warriors AI Arena!')
      .setDescription(`Hey ${member.user.username}! Welcome to the arena where AI meets combat.`)
      .addFields(
        { name: '🎮 Get Started', value: 'Mint your first warrior at our website', inline: true },
        { name: '📖 Learn', value: 'Check out #how-to-play for guides', inline: true },
        { name: '💬 Chat', value: 'Say hi in #general!', inline: true }
      )
      .setThumbnail(member.user.displayAvatarURL())
      .setFooter({ text: 'Train AI. Battle On-Chain. Win Glory.' })
      .setTimestamp();

    const channel = this.client.channels.cache.get(config.channels.general) as TextChannel;
    if (channel) {
      await channel.send({ embeds: [welcomeEmbed] });
    }
  }

  // --------------------------------------------------------------------------
  // SLASH COMMANDS
  // --------------------------------------------------------------------------

  private async registerCommands(): Promise<void> {
    const commands = [
      new SlashCommandBuilder()
        .setName('warrior')
        .setDescription('View warrior details')
        .addIntegerOption((option) =>
          option.setName('id').setDescription('Warrior ID').setRequired(true)
        ),

      new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View arena statistics'),

      new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View top warriors')
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('Leaderboard type')
            .addChoices(
              { name: 'Wins', value: 'wins' },
              { name: 'Damage Dealt', value: 'damage' },
              { name: 'Win Rate', value: 'winrate' }
            )
        ),

      new SlashCommandBuilder()
        .setName('battle')
        .setDescription('View recent battle or specific battle')
        .addStringOption((option) =>
          option.setName('id').setDescription('Battle ID (optional)')
        ),

      new SlashCommandBuilder()
        .setName('help')
        .setDescription('Get help with Warriors AI Arena'),

      new SlashCommandBuilder()
        .setName('mint')
        .setDescription('Get information about minting warriors'),

      new SlashCommandBuilder()
        .setName('tournament')
        .setDescription('View current/upcoming tournaments'),
    ];

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
      console.log('Registering slash commands...');
      await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), {
        body: commands.map((cmd) => cmd.toJSON()),
      });
      console.log('✅ Slash commands registered');
    } catch (error) {
      console.error('Failed to register commands:', error);
    }
  }

  // --------------------------------------------------------------------------
  // COMMAND HANDLERS
  // --------------------------------------------------------------------------

  private async handleWarriorCommand(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply();

    const warriorId = interaction.options.get('id')?.value as number;

    try {
      const warrior = await this.blockchain.getWarrior(warriorId);

      const embed = new EmbedBuilder()
        .setColor(this.getRankColor(warrior.rank))
        .setTitle(`⚔️ Warrior #${warriorId}`)
        .setDescription(`**${warrior.name}**`)
        .addFields(
          { name: '💪 Strength', value: `${warrior.traits.strength}`, inline: true },
          { name: '🧠 Wit', value: `${warrior.traits.wit}`, inline: true },
          { name: '✨ Charisma', value: `${warrior.traits.charisma}`, inline: true },
          { name: '🛡️ Defence', value: `${warrior.traits.defence}`, inline: true },
          { name: '🍀 Luck', value: `${warrior.traits.luck}`, inline: true },
          { name: '🏆 Rank', value: warrior.rank, inline: true },
          { name: '📊 Record', value: `${warrior.wins}W - ${warrior.losses}L`, inline: true },
          { name: '💰 Total Winnings', value: `${warrior.totalWinnings} CRwN`, inline: true }
        )
        .setFooter({ text: `Owner: ${warrior.owner.slice(0, 6)}...${warrior.owner.slice(-4)}` })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply('Warrior not found or error fetching data.');
    }
  }

  private async handleStatsCommand(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      const stats = await this.blockchain.getArenaStats();

      const embed = new EmbedBuilder()
        .setColor('#FFD700' as ColorResolvable)
        .setTitle('📊 Arena Statistics')
        .addFields(
          { name: '⚔️ Total Battles', value: stats.totalBattles.toString(), inline: true },
          { name: '🎭 Warriors Minted', value: stats.totalWarriors.toString(), inline: true },
          { name: '👥 Unique Players', value: stats.uniquePlayers.toString(), inline: true },
          { name: '💰 Total Volume', value: `${stats.totalVolume} CRwN`, inline: true },
          { name: '🔥 Battles Today', value: stats.battlesToday.toString(), inline: true },
          { name: '🏆 Active Tournaments', value: stats.activeTournaments.toString(), inline: true }
        )
        .setFooter({ text: 'Warriors AI Arena on 0G Network' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply('Error fetching arena statistics.');
    }
  }

  private async handleLeaderboardCommand(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply();

    const type = (interaction.options.get('type')?.value as string) || 'wins';

    try {
      const leaderboard = await this.blockchain.getLeaderboard(type, 10);

      const embed = new EmbedBuilder()
        .setColor('#FFD700' as ColorResolvable)
        .setTitle(`🏆 Leaderboard - ${type.charAt(0).toUpperCase() + type.slice(1)}`)
        .setDescription(
          leaderboard
            .map(
              (entry: any, index: number) =>
                `**${index + 1}.** Warrior #${entry.id} - ${entry.value} ${type === 'winrate' ? '%' : ''}`
            )
            .join('\n')
        )
        .setFooter({ text: 'Updated in real-time' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply('Error fetching leaderboard.');
    }
  }

  private async handleBattleCommand(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply();

    const battleId = interaction.options.get('id')?.value as string;

    try {
      const battle = battleId
        ? await this.blockchain.getBattle(battleId)
        : await this.blockchain.getLatestBattle();

      const embed = this.createBattleEmbed(battle);
      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply('Error fetching battle data.');
    }
  }

  private async handleHelpCommand(interaction: CommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor('#5865F2' as ColorResolvable)
      .setTitle('🎮 Warriors AI Arena - Help')
      .setDescription('Welcome to the AI-powered battle arena!')
      .addFields(
        { name: '/warrior <id>', value: 'View warrior details and stats', inline: false },
        { name: '/stats', value: 'View overall arena statistics', inline: false },
        { name: '/leaderboard [type]', value: 'View top warriors (wins/damage/winrate)', inline: false },
        { name: '/battle [id]', value: 'View recent or specific battle', inline: false },
        { name: '/mint', value: 'Get minting information', inline: false },
        { name: '/tournament', value: 'View tournaments', inline: false }
      )
      .addFields(
        { name: '🔗 Links', value: '[Website](https://warriorsai.arena) | [Docs](https://docs.warriorsai.arena)', inline: false }
      )
      .setFooter({ text: 'Train AI. Battle On-Chain. Win Glory.' });

    await interaction.reply({ embeds: [embed] });
  }

  private async handleMintCommand(interaction: CommandInteraction): Promise<void> {
    const embed = new EmbedBuilder()
      .setColor('#00FF00' as ColorResolvable)
      .setTitle('🎨 Mint Your Warrior')
      .setDescription('Create your AI-powered warrior and enter the arena!')
      .addFields(
        { name: '💰 Mint Cost', value: 'Free (gas only)', inline: true },
        { name: '🎲 Traits', value: 'AI-generated unique stats', inline: true },
        { name: '⚔️ Moves', value: '5 custom attack names', inline: true }
      )
      .addFields(
        { name: '📝 How to Mint', value: '1. Connect wallet\n2. Click "Mint Warrior"\n3. AI assigns traits\n4. Enter the arena!', inline: false }
      )
      .addFields(
        { name: '🔗 Mint Now', value: '[Click here to mint](https://warriorsai.arena/mint)', inline: false }
      )
      .setFooter({ text: 'Each warrior has a unique AI personality' });

    await interaction.reply({ embeds: [embed] });
  }

  private async handleTournamentCommand(interaction: CommandInteraction): Promise<void> {
    await interaction.deferReply();

    try {
      const tournaments = await this.blockchain.getActiveTournaments();

      if (tournaments.length === 0) {
        await interaction.editReply('No active tournaments at the moment. Check back soon!');
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('#FFD700' as ColorResolvable)
        .setTitle('🏆 Active Tournaments')
        .setDescription(
          tournaments
            .map(
              (t: any) =>
                `**${t.name}**\nPrize: ${t.prizePool} CRwN | Participants: ${t.participants}/${t.maxParticipants}\nStarts: <t:${Math.floor(t.startTime / 1000)}:R>`
            )
            .join('\n\n')
        )
        .setFooter({ text: 'Register at warriorsai.arena/tournaments' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      await interaction.editReply('Error fetching tournament data.');
    }
  }

  // --------------------------------------------------------------------------
  // BLOCKCHAIN EVENT LISTENERS
  // --------------------------------------------------------------------------

  private startBlockchainListeners(): void {
    // Listen for battle completion events
    this.blockchain.onBattleComplete(async (battle) => {
      await this.postBattleResult(battle);
    });

    // Listen for new warrior minted
    this.blockchain.onWarriorMinted(async (warrior) => {
      await this.postNewWarrior(warrior);
    });

    // Listen for rank promotions
    this.blockchain.onRankPromotion(async (promotion) => {
      await this.postRankPromotion(promotion);
    });

    console.log('✅ Blockchain event listeners started');
  }

  // --------------------------------------------------------------------------
  // AUTOMATED POSTS
  // --------------------------------------------------------------------------

  async postBattleResult(battle: any): Promise<void> {
    const channel = this.client.channels.cache.get(config.channels.battleResults) as TextChannel;
    if (!channel) return;

    const embed = this.createBattleEmbed(battle);
    await channel.send({ embeds: [embed] });
  }

  async postNewWarrior(warrior: any): Promise<void> {
    const channel = this.client.channels.cache.get(config.channels.announcements) as TextChannel;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor('#00FF00' as ColorResolvable)
      .setTitle('🎉 New Warrior Minted!')
      .setDescription(`**Warrior #${warrior.id}** has entered the arena!`)
      .addFields(
        { name: '💪 STR', value: `${warrior.traits.strength}`, inline: true },
        { name: '🧠 WIT', value: `${warrior.traits.wit}`, inline: true },
        { name: '✨ CHA', value: `${warrior.traits.charisma}`, inline: true },
        { name: '🛡️ DEF', value: `${warrior.traits.defence}`, inline: true },
        { name: '🍀 LCK', value: `${warrior.traits.luck}`, inline: true }
      )
      .setFooter({ text: `Minted by ${warrior.owner.slice(0, 6)}...${warrior.owner.slice(-4)}` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }

  async postRankPromotion(promotion: any): Promise<void> {
    const channel = this.client.channels.cache.get(config.channels.announcements) as TextChannel;
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(this.getRankColor(promotion.newRank))
      .setTitle('🏆 Rank Promotion!')
      .setDescription(
        `**Warrior #${promotion.warriorId}** has been promoted to **${promotion.newRank}**!`
      )
      .addFields(
        { name: 'Previous Rank', value: promotion.oldRank, inline: true },
        { name: 'New Rank', value: promotion.newRank, inline: true },
        { name: 'Total Winnings', value: `${promotion.totalWinnings} CRwN`, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }

  async postDailyStats(): Promise<void> {
    const channel = this.client.channels.cache.get(config.channels.announcements) as TextChannel;
    if (!channel) return;

    try {
      const stats = await this.blockchain.getDailyStats();

      const embed = new EmbedBuilder()
        .setColor('#FFD700' as ColorResolvable)
        .setTitle('📊 Daily Arena Report')
        .setDescription(`Here's what happened in the arena today!`)
        .addFields(
          { name: '⚔️ Battles', value: stats.battles.toString(), inline: true },
          { name: '🎭 New Warriors', value: stats.newWarriors.toString(), inline: true },
          { name: '💰 Volume', value: `${stats.volume} CRwN`, inline: true },
          { name: '🏆 Top Warrior', value: `#${stats.topWarrior.id} (${stats.topWarrior.wins} wins)`, inline: true },
          { name: '🔥 Biggest Win', value: `${stats.biggestWin} CRwN`, inline: true }
        )
        .setFooter({ text: 'See you tomorrow!' })
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error posting daily stats:', error);
    }
  }

  // --------------------------------------------------------------------------
  // UTILITY FUNCTIONS
  // --------------------------------------------------------------------------

  private createBattleEmbed(battle: any): EmbedBuilder {
    const moves = ['STRIKE', 'TAUNT', 'DODGE', 'SPECIAL', 'RECOVER'];

    let roundsText = '';
    for (let i = 0; i < 5; i++) {
      const w1Move = moves[battle.warrior1Moves[i]] || '?';
      const w2Move = moves[battle.warrior2Moves[i]] || '?';
      roundsText += `R${i + 1}: ${w1Move} vs ${w2Move}\n`;
    }

    const winner = battle.warrior1Damage < battle.warrior2Damage ? battle.warrior1Id : battle.warrior2Id;
    const winnerDamage = Math.min(battle.warrior1Damage, battle.warrior2Damage);
    const loserDamage = Math.max(battle.warrior1Damage, battle.warrior2Damage);

    return new EmbedBuilder()
      .setColor('#FF4500' as ColorResolvable)
      .setTitle(`⚔️ Battle Complete!`)
      .setDescription(`**Warrior #${battle.warrior1Id}** vs **Warrior #${battle.warrior2Id}**`)
      .addFields(
        { name: '📜 Round by Round', value: roundsText, inline: false },
        { name: '💥 Damage Taken', value: `#${battle.warrior1Id}: ${battle.warrior1Damage}\n#${battle.warrior2Id}: ${battle.warrior2Damage}`, inline: true },
        { name: '🏆 Winner', value: `Warrior #${winner}`, inline: true },
        { name: '💰 Prize Pool', value: `${battle.prizePool} CRwN`, inline: true }
      )
      .setFooter({ text: `Battle ID: ${battle.id}` })
      .setTimestamp();
  }

  private getRankColor(rank: string): ColorResolvable {
    const colors: Record<string, ColorResolvable> = {
      UNRANKED: '#808080',
      BRONZE: '#CD7F32',
      SILVER: '#C0C0C0',
      GOLD: '#FFD700',
      PLATINUM: '#E5E4E2',
    };
    return colors[rank] || '#808080';
  }

  // --------------------------------------------------------------------------
  // START BOT
  // --------------------------------------------------------------------------

  async start(): Promise<void> {
    try {
      await this.client.login(config.token);
    } catch (error) {
      console.error('Failed to start Discord bot:', error);
      process.exit(1);
    }
  }
}

// Start the bot
const bot = new WarriorsDiscordBot();
bot.start();

export { WarriorsDiscordBot };
