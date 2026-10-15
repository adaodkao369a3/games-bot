# Bombo Games Discord Bot - Commands Reference

| Command | Features |
|---------|----------|
| **.pscout** | Scout new talent (free, 30-minute cooldown). Discover characters with different tiers (Intern to Legend). Talent Agency channel only. |
| **.precruit <name>** | Sign discovered talent to your roster. Pay recruit price based on tier. Talent Agency channel only. |
| **.pwork <name>** | Send talent to work for 30-minute blocks. Earnings based on tier/level. Max 5 talent working at once. Talent Agency channel only. |
| **.pcollect** | Collect earnings from talent who finished 30-minute work blocks. Can collect up to 2 hours of work. Talent Agency channel only. |
| **.plist** | View agency hub with roster, status (working/resting), stamina bars, and talent profiles. Talent Agency channel only. |
| **.phelp** | Display Talent Agency guide with command list, hustle/gig mechanics, and tier payout information. |
| **.bj <amount>** | Single-player Blackjack against dealer. Game floor channel only. Supports wager amounts (500, 10k, 1.5m, all). |
| **.bj2 @user <amount>** | Two-player Blackjack against dealer. Challenge another user. Game floor channel only. Both players bet same amount. |
| **.bomb <amount>** | Bomb defusal game. Defuse the bomb before it explodes. Game floor channel only. Wager-based. |
| **.cash @user [amount]** | Admin-only command. Award coins to specific user, @everyone, or all members. Supports k/m/b suffixes. |
| **.cash all 0** | Admin-only command. Reset all server members' balances to 0. |
| **.cf <amount>** | Coin Flip game. Call heads or tails, build a streak, cash out. Game floor channel only. Wager-based. |
| **.croulette <amount>** | Card Roulette. Draw mystery cards and survive. Game floor channel only. Wager-based. |
| **.diceduel @user <amount>** | Dice duel game. First to winning score wins. Challenge another user. Game floor channel only. |
| **.gamble <amount>** | Bob's slot machine. 50/50 win chance (49% normal 2x, 1% jackpot 10x). Game floor channel only. Wager-based. |
| **.gig** | Book quick paid gigs. 400 coins (first 3/day) or 200 coins (4th+). 15 min cooldown. Game floor/Talent Agency/Goon-Edge channels only. |
| **.help** | Interactive help menu with categories: Currency, Everyday, Quotes, Casino, Talent Agency, Games. Button navigation. |
| **.hlow <amount>** | Higher or Lower. Guess if next card is higher or lower. Game floor channel only. Wager-based. |
| **.hustle** | Network and pitch for coins. 200 coins per use. 5 min cooldown. Game floor/Talent Agency/Goon-Edge channels only. |
| **.hs** | Bombo Coin leaderboard (alias for .highscore). Shows top players by balance. Pagination support. Game floor/Talent Agency channels only. |
| **.highscore** | Bombo Coin leaderboard. Shows top players by balance. Pagination support. Game floor/Talent Agency channels only. |
| **.impostor** | Find the impostor among the crew. Multiplayer game with button interactions. Channel-based game state. |
| **.mog [@user]** | Generate MOG Archive classification card. Shows rank (D-SS), stars, attributes, theme. Can ascend (reroll) for 1M coins. |
| **.moglb** | MOG Files leaderboard. Ranked by rank, stars, and total attributes. Pagination support. Server-specific. |
| **.numguess** | Guess the hidden number game. Channel-based. Users submit guesses via chat. |
| **.pisscomp @user** | Piss Competition. Fill your meter first by clicking buttons. Multiplayer challenge. Channel-based. |
| **.pisscompmax @user** | Piss Comp with JJK fight sequence. Normal Piss Comp first, then fight to finish. No coins awarded during first round. |
| **.quote** | Reply to a message to create a quote card. Supports 16 themes, 15 fonts. Theme/font selection menus. GIF conversion. 5-second cooldown. |
| **.dquote** | Reply to create stacked quote (replied-to + its reply). Same features as .quote. |
| **.rlt <amount> [number]** | Roulette. Bet on colors, odd/even, dozens, or exact number (0-36). Game floor channel only. Wager-based. |
| **.simonsays** | Simon Says game. Follow the commands and survive. Button-based. Channel-based game state. |
| **.trial @user [accusation]** | Put someone on trial in a courtroom. Accuse a user with a crime. Multiplayer voting game. Requires bot permissions. |
| **.wallet [@user]** | Check Bombo Coin balance. Can check own or another user's balance. Game floor/Talent Agency/Goon-Edge channels only. |
| **.wordbomb** | Fast word game. Don't be holding the bomb. Users submit words via chat. Channel-based. Join button. |
| **.av [@user]** | Show user's avatar in embed. Reply to user or mention them. Delete button for privacy (owner only). Also works as .avatar. |
| **.avatar [@user]** | Alias for .av. Show user's avatar in embed. Reply to user or mention them. Delete button for privacy. |
| **.bobkun** | Server guide with arcade theme. Shows trial command example and new player instructions. |
| **.redirect [on/off]** | Admin-only command. Toggle quote redirect to specific channel. Check status with no args. |

## Channel Restrictions

- **Game Floor Channels**: .bj, .bj2, .bomb, .cf, .croulette, .diceduel, .gamble, .hlow, .rlt
- **Talent Agency Channels**: .pscout, .precruit, .pwork, .pcollect, .plist, .phelp
- **Goon/Edge Channels**: .gig, .hustle
- **Multi-Channel**: .wallet, .highscore, .hs (work in Game Floor, Talent Agency, and Goon/Edge channels)
- **No Restrictions**: .help, .av, .avatar, .quote, .dquote, .trial, .impostor, .numguess, .simonsays, .wordbomb, .mog, .moglb, .bobkun
- **Staff Only**: .cash, .redirect

## Admin Commands

- **.cash** - Award coins to users (@user, @everyone, or all). Reset all balances with .cash all 0
- **.redirect** - Toggle quote redirect on/off for the server

## Currency Features

- **Bombo Coins** - Main currency for all games
- **Wager Support** - All casino games support amounts like 500, 10k, 1.5m, or "all"
- **Transaction Tracking** - All coin transactions are logged with reasons
- **Leaderboard** - .highscore/.hs shows top coin holders

## Game Categories

### Casino Games (Wager-based)
- .gamble (slots)
- .cf (coin flip)
- .bj / .bj2 (blackjack)
- .hlow (higher or lower)
- .croulette (card roulette)
- .bomb (bomb defusal)
- .diceduel (dice duel)
- .rlt (roulette)

### Multiplayer Games
- .trial (courtroom voting)
- .pisscomp / .pisscompmax (button mashing)
- .wordbomb (word chain)
- .impostor (find the impostor)
- .numguess (number guessing)
- .simonsays (sequence memory)
- .diceduel (dice competition)
- .bj2 (2-player blackjack)

### Everyday Tools
- .av / .avatar (view avatar)
- .mog (classification card)
- .moglb (MOG leaderboard)
- .quote / .dquote (quote cards)
- .wallet (check balance)
- .help (command guide)
- .bobkun (server guide)

### Passive Income
- .hustle (networking rewards)
- .gig (quick gig bookings)
- Talent Agency (.pscout, .precruit, .pwork, .pcollect, includes free starter Tsunade)
