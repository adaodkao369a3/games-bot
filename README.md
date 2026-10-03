# Bob Kun Discord Bot <:bob:1545141387656302663>

A cute, chaotic Minion-inspired gaming Discord bot for the Mi Bom3o server. Bob Kun brings social gaming fun with multiplayer games.

## Features

- **Multiple Games**: Trial, Higher/Lower, Card Roulette, Blackjack, 2-Player Blackjack, Gamble, Dice Duel, Coin Flip, Bomb, Impostor, Number Guess, Simon Says, Wordbomb, MOG, JJK Quiz, and more
- **Bombo Coins**: Currency system with wallet, and highscore leaderboard
- **Talent Agency**: Recruit goofy characters, send them to work, and earn Bombo Coins (see below)
- **Quote Generation**: Create beautiful quote cards from messages
- **Bob Kun Personality**: Cute, chaotic, Minion-inspired responses throughout

## Talent Agency

A minigame where you are the boss of a fictional talent agency. Scout and recruit goofy characters, send them out on gigs, and collect Bombo Coins. It only works in the game-floor channel.

### Commands

| Command | What it does |
|---|---|
| `.pscout` | Scout for talent you haven't discovered yet. Free, once per 30 minutes. Shows a card with a Recruit button. |
| `.precruit <name>` | Recruit a scouted character by (partial) name. Same as pressing the Recruit button. |
| `.pwork <name>` | Send a character out to work (up to 4 at once). Pays nothing until you collect. |
| `.pcollect` | Collect earnings from everyone who has finished at least one 30-minute block; they go back to resting. |
| `.plist` | Your hub: roster, who is out, who is ready, coins waiting. Pick someone from the menu to open their profile (Care, Train, Send to work). |

### How it works

- **Scouting** only rolls characters you haven't discovered yet. Odds depend on tier; if a tier runs dry, the remaining odds are rescaled. Discovered characters never expire.
- **Working:** each full 30-minute block pays the character's income, up to 4 blocks (2 hours) per trip. Every block costs stamina (10 by default; Grandpa Ichiro 15, Sir Barkington and Mochi 5). A block can't start without enough stamina.
- **Stamina** is 0 to 100 and regenerates 10 per 30 minutes while resting.
- **Care** (profile button) refills stamina to 100 for (tier care price x missing stamina / 100), rounded up.
- **Train** (profile button) raises level n to n+1 for 10% of the character's recruit price x n. Max level 10. Income multiplier is 1 + 0.08 x (level - 1), so level 10 earns 1.72x.
- Care and Train aren't available while a character is out working.
- You can own up to 20 characters (the whole roster).

### Economy

| Tier | Recruit | Earns / 30 min | Care (full) | Scout odds |
|---|---:|---:|---:|---:|
| Intern | 5,000 | 150 | 400 | 30% |
| Trainee | 13,000 | 250 | 650 | 25% |
| Rookie | 33,000 | 400 | 1,000 | 20% |
| Pro | 85,000 | 600 | 1,500 | 15% |
| Star | 200,000 | 850 | 2,100 | 8% |
| Legend | 500,000 | 1,200 | 3,000 | 2% |

Grandpa Ichiro, Sir Barkington and Mochi the Menace are low-income Interns: 3,500 to recruit, 75 per block.

Tier names, prices and odds live in the `pa_tiers` / `pa_characters` tables, seeded from `src/database/agency-seed.sql` on every startup. **To change a name, price or odd, edit the seed file** (manual edits to seeded rows are overwritten on the next start).

### Character images

Every character needs an image at `assets/characters/<slug>.png` (square, 512 to 1024 px). Missing images don't break anything, the card just has no picture. See `assets/characters/README.md` for the full list of 20 file names.

### Tests

```bash
npm test                      # pure game-logic unit tests (no database needed)
DATABASE_URL=... npx tsx tests/agency-concurrency.ts   # race/refund tests (needs a throwaway Postgres DB)
DATABASE_URL=... npx tsx tests/agency-handlers.ts      # command/button dry-run
DATABASE_URL=... npx tsx tests/goon-edge.ts            # goon/edge rules
```

The integration tests create and delete rows with user ids starting with `t_`.

## Goon and Edge

- `.goon` pays 400 (cooldown 15 min). Using it 3 times in a day blocks `.edge` for 1 hour (as before, `.goon` itself is paused during that hour too). More than 10 `.goon` uses in one day still pay 400 but cost 600 more each (net -200; if you can't afford 600 it takes whatever you have).
- `.edge` pays 200 (cooldown 5 min). Consecutive edges add +10% each, up to +50%. The streak breaks if more than 30 minutes pass between edges or you use `.goon`. 10 edges in a row grants a 1-hour power-up that halves the `.goon` cooldown. Reaching 10 edges in a day still gives the +2,000 daily bonus.

## Requirements

- Node.js 18 or higher
- npm or yarn
- A PostgreSQL database (the bot creates its own tables on startup)
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
DATABASE_URL=postgresql://user:password@localhost:5432/bobkun
```

### Environment Variables

**Required:**
- `DISCORD_BOT_TOKEN`: Your bot's token from Discord Developer Portal
- `DISCORD_CLIENT_ID`: Your application's client ID
- `DISCORD_GUILD_ID`: Your server's ID (for faster command registration during development)
- `DATABASE_URL`: PostgreSQL connection string, e.g. `postgresql://user:password@host:5432/dbname`

**Optional:**
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
│   ├── agency/             # Talent Agency pure game logic
│   ├── games/              # Game modules
│   ├── database/           # Database layer (SQL files for schema/seed live here)
│   ├── services/           # Business logic
│   ├── ui/                 # UI components
│   ├── discord/            # Discord client
│   ├── utils/              # Utilities
│   ├── config/             # Configuration
│   └── index.ts            # Entry point
├── assets/                 # Fonts, effects, and Talent Agency character art
├── tests/                  # Agency + goon/edge tests
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

- Check that `DATABASE_URL` in `.env` is a valid PostgreSQL connection string and the database is reachable
- Tables are created automatically on startup (see `initializeSchema` in `src/database/client.ts`); the bot's database user needs permission to create tables
- The Talent Agency tables (`pa_*`) are created and re-seeded on every startup; this is safe to repeat

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
