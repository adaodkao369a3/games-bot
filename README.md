# Bob Kun Discord Bot <:bob:1545141387656302663>

A cute, chaotic Minion-inspired gaming Discord bot for the Mi Bom3o server. Bob Kun brings social gaming fun with the first game: **Smash This**.

## Features

- **Smash This**: A simple head-to-head voting game between two random recently active users
- **Smart Activity-Based Spawning**: Events spawn automatically after periods of inactivity followed by renewed chat activity
- **20-Second Voting**: Fast-paced voting periods with instant winner reveals
- **Prefix Commands**: Use `.smash` to force an event immediately
- **Recent Activity Selection**: Events feature people who have actually been active in the channel recently
- **Random Delays**: Automatic events have a random 1-5 minute delay for surprise factor
- **Persistent Data**: All event data and votes are stored in JSON
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

### Activity-Based Spawning Behavior

Bob Kun uses intelligent activity-based spawning for Smash events:

1. **User Chat Activity**: Users are talking normally in the channel
2. **Chat Goes Quiet**: No qualifying user messages for 30+ minutes
3. **Inactivity Gap Detected**: Bob Kun detects the extended quiet period
4. **User Starts Talking Again**: A user sends a message after the inactivity gap
5. **Spawn Opportunity Created**: Bob Kun may spawn a Smash event
6. **Random Delay**: 1-5 minute random delay before event appears
7. **Event Posted**: Smash This event appears with two selected users

**Key Rules:**
- Continuous active conversation does NOT repeatedly trigger Smash events
- A 30-minute cooldown alone does NOT trigger Smash events
- Bob Kun requires an actual 30+ minute inactivity gap followed by renewed activity
- Bob Kun's own messages do NOT count as user activity
- Bot messages do NOT incorrectly reset the inactivity timer
- Multiple messages after the quiet period cannot create multiple simultaneous spawn events
- An active event prevents another event from spawning
- Fewer than two eligible recent users prevents spawning
- Random 1-5 minute delay adds surprise factor

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

## How Smash This Works

### Overview

Smash This is a simple head-to-head voting game between two random recently active users. Each event is standalone with no tournaments or rounds.

### Automatic Behavior

Bob Kun automatically creates Smash events based on chat activity:

1. **Chat Activity**: Users are talking normally in the channel
2. **Quiet Period**: Channel goes quiet for 30+ minutes
3. **Renewed Activity**: Users start talking again after the quiet period
4. **User Selection**: Bob Kun selects two random recently active human users
5. **Random Delay**: Bob Kun waits 1-5 minutes (randomly generated)
6. **Event Posted**: Smash This event appears with the two selected users
7. **Voting Period**: 20-second voting period opens
8. **Winner Revealed**: Winner is announced or tie is declared
9. **Done**: Event ends, Bob Kun returns to lurking

### Manual Trigger

You can force an event immediately using `.smash`:

1. Use `.smash` command
2. Bob Kun selects two random recently active users
3. Event appears immediately (no delay)
4. Normal 20-second voting period
5. Winner revealed

### Testing Specific Users

You can specify users to smash:

1. Use `.smash @User1 @User2` command
2. Bob Kun validates both users are real members and not bots
3. Event appears immediately with the specified users
4. Normal 20-second voting period
5. Winner revealed

### Event Selection Pool

- Bob Kun selects from **recently active users** in the channel
- Selection pool is based on actual chat activity (not random server members)
- Default time window: 7 days of recent activity
- Bots (including Bob Kun) are excluded from selection
- Requires at least 2 eligible recently active users

### Voting Rules

- 20-second voting period
- One vote per user per event
- Bot votes are rejected
- Duplicate votes are prevented
- Users can't change their vote after casting
- Ties result in no winner (both players lose)

### Visual Design

- Landscape card (approximately 554px × 251px)
- Two player panels with avatars
- One "<a:purplebomb:1545149042378407986> SMASH" button under each player
- Cute decorative border with hearts/stars/sparkles/banana motifs
- No giant VS graphic in center
- Clean, symmetrical layout

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
│   │   └── smash.ts        # .smash command
│   ├── games/              # Game modules
│   │   └── smash-this/
│   │       ├── smash-event.ts    # Event handler
│   │       └── voting-system.ts  # Voting logic
│   ├── database/           # Database layer
│   │   ├── schema.ts       # Database schema
│   │   ├── connection.ts   # Database connection
│   │   └── repositories/
│   │       └── smash-repository.ts
│   ├── services/           # Business logic
│   │   ├── bob-kun-personality.ts
│   │   ├── activity-tracker.ts
│   │   ├── recent-user-tracker.ts
│   │   └── smash-scheduler.ts
│   ├── ui/                 # UI components
│   │   └── smash-ui.ts
│   ├── discord/            # Discord client
│   │   └── client.ts
│   ├── utils/              # Utilities
│   │   ├── logger.ts
│   │   └── error-handler.ts
│   ├── config/             # Configuration
│   │   └── index.ts
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

### Activity spawning not working

- Ensure there are at least 2 recently active users in the channel
- Activity requires genuine inactivity followed by renewed activity
- Users need to have sent messages recently (within 7 days) to be eligible
- Check that the random 1-5 minute delay hasn't made it seem like spawning isn't working

### `.smash` command fails

- Ensure there are at least 2 recently active users in the channel
- Check that users have sent messages recently (within 7 days)
- Verify bot has permission to send messages in the channel
- Check that there isn't already an active Smash event in the channel
- When using `.@User1 @User2`, ensure both tags are valid server members and not bots

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
