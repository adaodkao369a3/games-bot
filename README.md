# Bob Kun Discord Bot <:bob:1545141387656302663>

A cute, chaotic Minion-inspired gaming Discord bot for the Mi Bom3o server. Bob Kun brings social gaming fun with multiplayer games.

## Features

- **Multiple Games**: Trial, Higher/Lower, Card Roulette, Blackjack, 2-Player Blackjack, Gamble, Dice Duel, Coin Flip, Bomb, Impostor, Number Guess, Simon Says, Wordbomb, MOG, JJK Quiz, and more
- **Bombo Coins**: Currency system with wallet, highscore leaderboard, and fishing
- **Quote Generation**: Create beautiful quote cards from messages
- **Bob Kun Personality**: Cute, chaotic, Minion-inspired responses throughout

## Requirements

- Node.js 18 or higher
- npm or yarn
- A Discord bot token and application

## Discord Application Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and name it "Bob Kun"
3. Go to the "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this for `.env`)

### Required Discord Intents

In the Discord Developer Portal under your bot's "Bot" section, enable these privileged intents:

- **Server Members Intent**
- **Message Content Intent** (required for prefix commands and activity tracking)

### Required Bot Permissions

Invite the bot with these permissions:

- Read Messages/View Channels
- Send Messages
- Read Message History
- Add Reactions
- Embed Links
- Attach Files

## Installation

1. Clone or download this repository
2. Install dependencies:

```bash
npm install
```

## Configuration

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Fill in the required values in `.env`:

```env
DISCORD_BOT_TOKEN=your_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
DISCORD_GUILD_ID=your_guild_id_here
```

### Environment Variables

**Required:**
- `DISCORD_BOT_TOKEN`: Your bot's token from Discord Developer Portal
- `DISCORD_CLIENT_ID`: Your application's client ID
- `DISCORD_GUILD_ID`: Your server's ID (for faster command registration during development)

**Optional:**
- `DATABASE_URL`: Path to JSON database file (default: `./data/bob-kun.json`)
- `PREFIX`: Command prefix for bot commands (default: `.`)

## Running the Bot

### Development Mode

```bash
npm run dev
```

### Production Mode

First build the project:

```bash
npm run build
```

Then run:

```bash
npm start
```

## Deployment

### Production Deployment

1. Build the project: `npm run build`
2. Deploy the bot to your hosting service
3. Start with `npm start`

### Hosting Options

- **VPS**: Any VPS with Node.js support (DigitalOcean, Linode, etc.)
- **PaaS**: Heroku, Railway, Render, etc.
- **Container**: Docker (create a Dockerfile if needed)
- **Local**: Run on your own machine with process manager (PM2, systemd)

### Process Manager (PM2)

Install PM2:

```bash
npm install -g pm2
```

Start the bot:

```bash
pm2 start dist/index.js --name bob-kun
```

View logs:

```bash
pm2 logs bob-kun
```

Restart:

```bash
pm2 restart bob-kun
```

## Project Structure

```
bob-kun-discord-bot/
├── src/
│   ├── commands/           # Prefix command handlers
│   ├── games/              # Game modules
│   ├── database/           # Database layer
│   ├── services/           # Business logic
│   ├── ui/                 # UI components
│   ├── discord/            # Discord client
│   ├── utils/              # Utilities
│   ├── config/             # Configuration
│   └── index.ts            # Entry point
├── data/                   # Database files (gitignored)
├── .env.example            # Environment template
├── .gitignore              # Git ignore rules
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
└── README.md               # This file
```

## Troubleshooting

### Commands not working

- Ensure your message starts with the configured prefix (default: `.`)
- Check that Message Content Intent is enabled in Discord Developer Portal
- Verify bot has permission to read messages in the channel
- Try restarting the bot if prefix commands aren't responding

### Database errors

- Ensure the `data/` directory exists and is writable
- Check that `DATABASE_URL` in `.env` is correct (or use default)
- Try deleting the database file and letting it recreate

### Bot not responding

- Check that `DISCORD_BOT_TOKEN` is correct in `.env`
- Verify bot has proper permissions in the server
- Check console logs for error messages
- Ensure required intents are enabled in Discord Developer Portal

## Adding More Games

The architecture is designed for easy game addition:

1. Create a new game module in `src/games/your-game/`
2. Implement game logic, UI, and data models
3. Add prefix commands in `src/commands/`
4. Integrate with the activity tracker if needed

## Security Notes

- Never commit `.env` file or share your bot token
- Use environment variables for all sensitive data
- Validate all user inputs
- Implement rate limiting for production
- Keep dependencies updated
- Use process managers for auto-restart

## License

MIT

## Support

For issues or questions, please check the troubleshooting section or create an issue in the repository.

---

<:bob:1545141387656302663> **Bob Kun** - Bringing chaotic fun to Mi Bom3o! <:bob:1545141387656302663>
