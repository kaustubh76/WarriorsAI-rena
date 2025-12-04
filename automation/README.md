# Warriors AI Arena - Automation Suite

Discord and Twitter automation for Warriors AI Arena.

## Features

### Discord Bot
- **Slash Commands**: `/warrior`, `/stats`, `/leaderboard`, `/battle`, `/help`, `/mint`, `/tournament`
- **Auto-posting**: Battle results, new warriors, rank promotions, daily stats
- **Welcome Messages**: Greet new members
- **Real-time Updates**: Listen to blockchain events

### Twitter Bot
- **Scheduled Content**: Daily stats, strategy tips, engagement questions, leaderboard updates
- **Battle Highlights**: Auto-post exciting battles
- **Mention Monitoring**: Auto-reply to common questions
- **Tournament Announcements**: Automated tournament promotion

## Setup

### 1. Install Dependencies

```bash
cd automation
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Discord
DISCORD_BOT_TOKEN=your_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_guild_id
DISCORD_ANNOUNCEMENTS_CHANNEL=channel_id
DISCORD_BATTLE_RESULTS_CHANNEL=channel_id
DISCORD_LEADERBOARD_CHANNEL=channel_id
DISCORD_GENERAL_CHANNEL=channel_id

# Twitter
TWITTER_API_KEY=your_api_key
TWITTER_API_SECRET=your_api_secret
TWITTER_ACCESS_TOKEN=your_access_token
TWITTER_ACCESS_SECRET=your_access_secret

# Blockchain
RPC_URL=https://evmrpc-testnet.0g.ai
ARENA_CONTRACT_ADDRESS=0x...
WARRIORS_NFT_ADDRESS=0x...
CROWN_TOKEN_ADDRESS=0x...

# OpenAI (for AI content)
OPENAI_API_KEY=your_openai_key
```

### 3. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section, create bot, copy token
4. Go to "OAuth2" → "URL Generator"
5. Select scopes: `bot`, `applications.commands`
6. Select permissions: `Send Messages`, `Embed Links`, `Read Message History`
7. Copy URL and invite bot to your server

### 4. Twitter API Setup

1. Go to [Twitter Developer Portal](https://developer.twitter.com)
2. Create a project and app
3. Enable OAuth 1.0a with Read and Write permissions
4. Generate access tokens
5. Copy all credentials to `.env`

### 5. Run the Bots

```bash
# Run Discord bot only
npm run discord

# Run Twitter scheduler only
npm run twitter:scheduler

# Run both
npm start
```

## Content Schedule

### Twitter (Daily)
| Time (UTC) | Content |
|------------|---------|
| 09:00 | Daily Stats |
| 14:00 | Strategy Tip |
| 18:00 | Engagement Question |
| 22:00 | Leaderboard Update |

### Twitter (Weekly)
| Day | Time (UTC) | Content |
|-----|------------|---------|
| Sunday | 20:00 | Weekly Recap |
| Friday | 16:00 | Tournament Reminder |

### Discord (Real-time)
- Battle results: Posted as they happen
- New warriors: Notable mints announced
- Rank promotions: Celebrated automatically
- Daily stats: Posted at 09:00 UTC

## File Structure

```
automation/
├── discord/
│   └── bot.ts           # Discord bot with slash commands
├── twitter/
│   ├── bot.ts           # Twitter posting functions
│   └── scheduler.ts     # Cron-based scheduling
├── shared/
│   ├── blockchain.ts    # Blockchain event listeners
│   └── contentGenerator.ts  # AI content generation
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Customization

### Adding Discord Commands

Edit `discord/bot.ts`:

```typescript
// Add to registerCommands()
new SlashCommandBuilder()
  .setName('mycommand')
  .setDescription('My custom command')

// Add handler in onInteraction()
case 'mycommand':
  await this.handleMyCommand(interaction);
  break;
```

### Adding Twitter Content

Edit `twitter/scheduler.ts`:

```typescript
// Add new scheduled content
cron.schedule('0 12 * * *', async () => {
  await this.bot.postMyContent();
});
```

### Modifying Content Templates

Edit `twitter/bot.ts` for tweet templates or `shared/contentGenerator.ts` for AI-generated content.

## Production Deployment

### Using PM2

```bash
npm install -g pm2

# Start bots
pm2 start npm --name "warriors-discord" -- run discord
pm2 start npm --name "warriors-twitter" -- run twitter:scheduler

# Save configuration
pm2 save

# Auto-start on reboot
pm2 startup
```

### Using Docker

```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

CMD ["npm", "start"]
```

```bash
docker build -t warriors-automation .
docker run -d --env-file .env warriors-automation
```

## Rate Limits

### Discord
- 50 requests per second per bot
- Slash commands: 200 per day per guild

### Twitter
- 500 tweets per month (free tier)
- 1,500 tweets per month (basic tier)
- 300 requests per 15 minutes

### Recommendations
- Post battles selectively (10% or epic only)
- Use caching for repeated data
- Implement exponential backoff

## Troubleshooting

### Discord bot not responding
1. Check bot token is correct
2. Verify bot has proper permissions
3. Ensure slash commands are registered (restart bot)

### Twitter posts failing
1. Verify API credentials
2. Check rate limits
3. Ensure tweets are under 280 characters

### Blockchain events not triggering
1. Verify RPC URL is correct
2. Check contract addresses
3. Ensure events match ABI

## Support

- Discord: [Your Discord]
- Twitter: [@WarriorsAIArena]
- GitHub: [Your Repo]
