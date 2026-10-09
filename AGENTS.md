# AGENTS.md - Bob Kun Discord Bot

This file contains project-specific instructions for AI coding agents working on the Bob Kun Discord Bot. These rules are based on the actual repository structure and verified behavior.

## A. Project Architecture

### Entry Points and Startup Sequence
1. **Entry point**: `src/index.ts`
   - Connects to PostgreSQL database
   - Initializes title ownership from database
   - Starts Discord client
   - Sets up graceful shutdown handlers (SIGINT, SIGTERM)

2. **Discord client**: `src/discord/client.ts`
   - Configures intents: Guilds, GuildMessages, MessageContent, GuildMembers
   - Routes prefix commands in `onMessageCreate`
   - Routes button interactions in `onInteractionCreate` via customId prefixes
   - Routes modal submissions in `handleModalSubmit`

### Directory Structure
```
src/
├── commands/          # Prefix command handlers (.trial, .bj, .pisscomp, etc.)
├── agency/            # Talent Agency pure game logic (no I/O, no DB)
├── games/             # Game modules
│   ├── shared/        # Shared utilities (VoteManager)
│   └── trial/         # Trial game implementation
├── database/          # PostgreSQL layer + SQL schema/seed files
├── services/          # Business logic (coins, chat-rewards, personality, AniList)
├── discord/           # Discord client setup and event routing
├── utils/             # Utilities (error-handler, gif-duration, wager-parser)
├── config/            # Configuration and validation
├── types/             # TypeScript type definitions
├── pisscomp/          # Piss Comp game (PissCompGame + PissCompMaxGame)
├── blackjack/         # Blackjack game (BlackjackGame + Blackjack2Game)
├── [other games]/     # Individual game modules (bomb, coinflip, etc.)
├── titles/            # Title system (QuizGame, TitleDuelGame, TitleSystem)
├── quote/             # Quote generation
└── index.ts           # Entry point
```

### Important Modules and Dependencies
- **Database**: PostgreSQL via `pg` library, automatic schema migration on startup
- **Discord.js**: v14.14.1, prefix-based commands with button/modal interactions
- **Currency**: Bombo Coins system with transaction tracking and game_instance_id for duplicate prevention
- **Talent Agency**: Complex minigame with stamina, leveling, 30-minute work blocks, character roster
- **Assets**: `assets/` directory (fonts, effects, character images) copied to `dist/assets` on build

### Interaction Routing Convention
Button interactions are routed in `discord/client.ts` by checking `customId` prefixes:
- `pisscomp_*` → `handlePissCompInteraction`
- `trial_*` → `handleTrialInteraction`
- `pa_*` → `handleAgencyInteraction` (Talent Agency)
- `diceduel_*` → `handleDiceDuelInteraction`
- `higherlower_*` → `handleHigherLowerInteraction`
- `croulette_*` → `handleCardRouletteInteraction`
- `bomb_*` → `handleBombInteraction`
- `wordbomb_*` → `handleWordBombInteraction`
- `bj_*` → `handleBjInteraction`
- `bj2_*` → `handleBj2Interaction`
- `cf_*` → `handleCfInteraction`
- `impostor_*` → `handleImpostorInteraction`
- `numguess_*` → `handleNumGuessInteraction`
- `simonsays_*` → `handleSimonSaysInteraction`
- `quiz_*` → `handleQuizInteraction`
- `duel_*` → `handleChallengeInteraction`
- `mog_*` → `handleMogInteraction`
- `moglb_*` → `handleMoglbInteraction`
- `hs_*` → `handleHighscoreInteraction`
- `rlt_*` → `handleRltInteraction`
- `forfeit_role_*` → `handleRolesInteraction`

### Channel Restrictions
Some commands are restricted to specific channels (checked in `config/index.ts`):
- `isGameFloorChannel()`: Commands like .bj, .hlow, .croulette, .bomb only work in game floor channels
- `isTalentAgencyChannel()`: Talent Agency commands (.pscout, .precruit, .pwork, .pcollect, .plist) only work in talent agency channel
- `isGoonEdgeChannel()`: .goon and .edge commands only work in goon/edge channel

### Game State Management
- Games use in-memory Maps to track active games (e.g., `activeGames` Map in pisscomp.ts)
- Game state is **not persisted** to database
- Bot restart loses all active game state
- This is a known limitation, not a bug

### Database Schema and Seeding
- Schema initialization in `database/client.ts` → `initializeSchema()`
- Automatic migration on startup with idempotent ALTER TABLE statements
- Talent Agency tables (`pa_*`) are created and **re-seeded on every startup**
- Seed data in `database/agency-seed.sql` uses UPSERT, so manual DB edits to seeded rows are overwritten
- To change character data, edit `agency-seed.sql`, not the database directly

## B. TypeScript and Discord.js Safety

### TypeScript Configuration
- **Strict mode is disabled** (`strict: false`, `noImplicitAny: false`)
- Do not enable strict mode across the entire project in this phase
- Fix type errors individually as they are discovered
- Never use `@ts-ignore` or unsafe casts to hide compilation errors

### Discord.js Type Safety Rules
1. **Use public APIs only**: Discord.js ButtonBuilder, SelectMenuBuilder, etc. have public methods for setting properties
2. **Never access internal properties**: Do not access `.data`, `.toJSON()`, or other internal properties of builders
3. **Example of unsafe access (DO NOT DO THIS)**:
   ```typescript
   const button = new ButtonBuilder().setCustomId('test');
   console.log(button.data.custom_id); // ❌ Type error: custom_id does not exist on Partial<APIButtonComponent>
   ```
4. **Correct approach**: Use the public API methods provided by Discord.js
5. **Narrow union types before accessing variant-specific properties**: Discord.js interaction types are unions; use type guards or check the specific interaction type before accessing its properties

### Type Safety Incident
The `custom_id` error occurred when debug logging attempted to access `button.data.custom_id`. This property is not part of the public API and caused a TypeScript compilation error. The fix was to remove the unsafe access. This demonstrates why internal Discord.js properties must not be accessed.

### Required Validation Before Committing
- **Always run**: `npm run build` - TypeScript compilation must succeed
- **Always run**: `npm test` - All available tests must pass
- **Never fix compilation errors by weakening TypeScript configuration**
- **Fix the underlying cause of type errors rather than suppressing them**

## C. Discord Interaction and Gameplay Compatibility

### CustomId Format Conventions
- Follow existing pattern: `<game>_<action>_<params>`
- Talent Agency uses: `pa_<action>_<ownerUserId>_<arg>` (every handler validates ownerUserId)
- Examples: `pisscomp_pump_p1`, `trial_guilty_vote`, `pa_care_12345_42`
- Never reuse prefixes across different games
- Keep customIds consistent with their handlers

### Interaction Handler Requirements
1. **Check interaction expiration**: Handle cases where interactions have expired (collectors timeout)
2. **Validate user permissions**: Only game participants should be able to click buttons
3. **Handle response requirements**: Use `reply()`, `update()`, or `deferUpdate()` appropriately
4. **Preserve game rules**: Do not change payout calculations, Bombo Coins accounting, or win conditions without understanding the full impact
5. **Consider concurrency**: Multiple users may interact simultaneously; use appropriate locking or state validation

### Preserving Existing Behavior
- **Game rules**: Preserve all game mechanics unless explicitly requested to change them
- **Currency accounting**: Bombo Coins transactions must maintain integrity (no negative balances, correct tracking)
- **Database invariants**: Preserve foreign key relationships, unique constraints, and data validation
- **Concurrency behavior**: Talent Agency uses lazy stamina calculation; do not break this without understanding the impact
- **Interaction routing**: Changes to customId formats must update both the setter and the router in discord/client.ts

### Checking Affected Callers
When changing a shared function or type:
1. Search for all usages of the function/type across the codebase
2. Verify each usage still works with the change
3. Add regression tests for behavior that could break silently

## D. Database and Persistence Safety

### PostgreSQL Architecture
- Connection pooling via `pg` library (max 10 connections)
- Automatic schema migration on startup in `database/client.ts`
- Transaction pattern: `BEGIN` → operations → `COMMIT`/`ROLLBACK`
- Row locking with `FOR UPDATE` for atomic coin transactions

### Schema Initialization and Migration
- Schema files in `database/` directory: `schema.sql`, `agency-schema.sql`, `chat-rewards-schema.sql`, `agency-seed.sql`
- Migration logic in `database/client.ts` → `initializeSchema()` (435 lines)
- Migrations are idempotent (use `IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
- No rollback mechanism currently exists

### Database Safety Rules
1. **Inspect existing schema and queries before modifying persistence**
2. **Preserve data integrity**: Maintain foreign key relationships, unique constraints, and check constraints
3. **Avoid destructive schema changes**: Do not drop tables or columns without explicit requirement
4. **Test database-dependent changes using a safe environment**: Use a separate test database, not production
5. **Never run destructive operations against production as part of routine validation**
6. **Respect seed-data behavior**: Talent Agency seed runs on every startup; edit `agency-seed.sql` to change character data

### Transaction Patterns
- Coin transactions use row-level locking: `SELECT ... FOR UPDATE`
- Atomic balance updates prevent race conditions
- Game instance IDs prevent duplicate rewards via UNIQUE constraint on `coin_transactions.game_instance_id`

### Data Seeding Rules
- Talent Agency tables (`pa_tiers`, `pa_characters`) are seeded on every startup
- Seed uses UPSERT (`ON CONFLICT DO UPDATE`), so manual DB edits to seeded rows are overwritten
- To change tier prices, character stats, or scout odds: edit `database/agency-seed.sql`
- Do not manually edit seeded rows in the database; changes will be lost on next restart

## E. Required Validation Commands

### Mandatory Before Every Commit
```bash
npm run build  # TypeScript compilation + asset copy
npm test       # Run available unit tests
```

Both commands must succeed before committing. If either fails:
- Fix the underlying issue
- Do not suppress errors
- Do not commit until both pass

### Additional Validation for Specific Changes
- **Database changes**: Test with a safe database environment, verify migrations
- **Game logic changes**: Run the affected game manually if possible, add regression tests
- **Asset changes**: Verify assets are copied to dist/assets
- **Dependency changes**: Run `npm ci` to verify clean install, test build

### What These Commands Do
- `npm run build`: Runs `tsc` (TypeScript compiler) then `npm run copy-assets` (copies assets to dist/)
- `npm test`: Runs `tsx --test tests/agency-logic.test.ts` (8 unit tests for Talent Agency logic)

## F. Git and Deployment Rules

### Git Workflow
- **Branch**: Work on `main` branch
- **Push destination**: `origin/main` (https://github.com/adaodkao369a3/games-bot.git)
- **No force-push**: Never force-push or rewrite shared history
- **No branch protection**: Currently no branch protection rules; changes go directly to main

### Pre-Commit Checklist
1. Inspect working tree: `git status` - ensure only task-related files are changed
2. Run required validation: `npm run build` and `npm test`
3. Stage only task-related files: `git add <files>`
4. Review staged diff: `git diff --staged`
5. Commit with descriptive message
6. Push to main: `git push origin main`

### Commit Message Format
Use descriptive commit messages explaining what was changed and why. Example:
```
Fix PissCompMax button interaction logging

Removed unsafe access to button.data.custom_id which caused
TypeScript compilation error. The logging was debug-only and
not functionally necessary.
```

### Deployment Notes
- Railway builds automatically on push to main
- A successful local build is NOT proof that Railway deployed successfully
- Verify Railway deployment status in the Railway dashboard after pushing
- Railway uses Node 24.21.0 (Railpack default LTS)
- Railway build command: `npm run build`
- Railway start command: `npm start`

### Git Safety Rules
- **Never commit secrets**: .env, tokens, credentials, database URLs
- **Never commit unrelated user work**: Check git status before staging
- **Never force-push**: Use normal push only
- **Never bypass failed checks**: Pre-commit hook blocks commits when validation fails
- **Verify push result**: Check that push succeeded and commit hash is on remote

## G. Project-Specific Risk Areas

### High-Risk Modules
1. **Database layer (`database/client.ts`)**: 435 lines of migration logic, handles all coin transactions
   - Risk: Data corruption, migration failures
   - Convention: Use idempotent SQL, test migrations locally

2. **Talent Agency (`agency/`, `database/agency-client.ts`)**: Complex game logic with stamina, leveling, work blocks
   - Risk: Balance issues, data corruption, economic exploits
   - Convention: Pure logic in agency-logic.ts (no I/O), DB operations in agency-client.ts

3. **Currency system (`services/coins.ts`, `database/client.ts`)**: Transaction tracking, balance management
   - Risk: Double-spending, negative balances, incorrect accounting
   - Convention: Use row locking, game_instance_id for duplicate prevention

4. **Interaction routing (`discord/client.ts`)**: Central routing for all buttons and modals
   - Risk: Broken interactions, dead routes
   - Convention: Match customId prefixes exactly between builders and routers

5. **Game state management (various game modules)**: In-memory Maps, no persistence
   - Risk: State loss on restart, orphaned games
   - Convention: Document this limitation, warn users for long games

### Critical Conventions
- **CustomId prefixes**: Never change without updating the router in discord/client.ts
- **Channel restrictions**: Check isGameFloorChannel, isTalentAgencyChannel before allowing commands
- **Game instance IDs**: Always generate unique IDs for coin transactions to prevent duplicate rewards
- **Stamina calculation**: Talent Agency uses lazy stamina (regens while resting, frozen while working)
- **Seed data**: Edit agency-seed.sql to change character data, not the database directly

### Testing Limitations
- Only 1 test file exists: `tests/agency-logic.test.ts` (8 tests for Talent Agency pure logic)
- Most games have no automated tests
- No integration tests for Discord interactions
- No database migration tests
- **Action**: When changing game logic, add regression tests for critical paths if practical

### Known Limitations
- Game state is not persisted (lost on bot restart)
- No rollback mechanism for database migrations
- TypeScript strict mode is disabled
- No CI/CD pipeline
- No automated testing for most games
- Package-lock.json was previously ignored (now fixed)

## H. Summary of Required Actions

Before any code change:
1. Read relevant sections of this file
2. Inspect the actual code you're modifying
3. Run `npm run build` and `npm test`
4. Understand the impact on callers and dependencies

Before committing:
1. Run `npm run build` - must succeed
2. Run `npm test` - must succeed
3. Check `git status` - only task-related files
4. Review `git diff --staged`
5. Commit with descriptive message
6. Push to main

Before touching database:
1. Read the schema and migration logic
2. Test in a safe environment
3. Ensure migrations are idempotent
4. Do not run destructive operations against production

Before changing game rules:
1. Understand the full game mechanics
2. Check all affected code paths
3. Consider economic impact (Bombo Coins)
4. Add regression tests if practical
