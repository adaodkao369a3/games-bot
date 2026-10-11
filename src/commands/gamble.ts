import { Message, EmbedBuilder } from 'discord.js';
import { getCoinBalanceInfo, removeCoins, awardCoins } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';
import { parseWagerAmount } from '../utils/wager-parser.js';
import { config, isGameFloorChannel } from '../config/index.js';
import { EMOJIS } from '../utils/emoji-registry.js';
import { CROSS, TICK, coins, signedCoins } from '../utils/casino-ui.js';

const SLOT_SYMBOLS = ['<:slotsbanana:1545161905574903868>', '<:slotsbar:1545161910348029963>', '<:slotscherry:1545161913045098537>', '<:slotsseven:1545161915649753119>', '<:slotsstrawberry:1545161917834993804>'];
const WIN_SYMBOL = '<:slotsseven:1545161915649753119>';

function randomSymbol(exclude?: string): string {
  let symbol: string;
  do {
    symbol = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
  } while (symbol === exclude);
  return symbol;
}

function randomReelFrame(): string {
  return `<a:slots:1545149049328640120> <a:slots:1545149049328640120> <a:slots:1545149049328640120>`;
}

function progressiveReelFrame(stopped1: string | null, stopped2: string | null, stopped3: string | null): string {
  const reel1 = stopped1 || '<a:slots:1545149049328640120>';
  const reel2 = stopped2 || '<a:slots:1545149049328640120>';
  const reel3 = stopped3 || '<a:slots:1545149049328640120>';
  return `${reel1} ${reel2} ${reel3}`;
}

// Landing frame: 3-of-a-kind on the win symbol for a win, a guaranteed
// non-matching combo for a loss.
function finalReelFrame(won: boolean): string {
  if (won) {
    return `${WIN_SYMBOL} ${WIN_SYMBOL} ${WIN_SYMBOL}`;
  }
  const a = randomSymbol();
  const b = randomSymbol(a);
  const c = randomSymbol(b);
  return `${a} ${b} ${c}`;
}

function buildLoadingMessage(): string {
  return randomReelFrame();
}

function buildSpinMessage(): string {
  return randomReelFrame();
}

export async function handleGambleCommand(message: Message, args: string[]): Promise<void> {
  // Check if command is used in game floor channel
  if (!isGameFloorChannel(message.channel.id)) {
    await message.reply(`This command can only be used in <#${config.gameFloorChannelIds[0]}>.`);
    return;
  }

  const userId = message.author.id;

  // Parse wager amount
  if (args.length === 0) {
    await message.reply(
      'Please specify an amount to gamble. Usage: `.gamble [amount]`\n' +
      'Examples: `.gamble 500`, `.gamble 10k`, `.gamble 1.5m`, `.gamble all`'
    );
    return;
  }

  // Get user's current balance first, since "all"/"max" depend on it.
  const coinInfo = await getCoinBalanceInfo(userId);
  if (!coinInfo) {
    await message.reply('Unable to retrieve your Bombo Coin balance. Please try again later.');
    return;
  }

  const wagerArg = args[0];
  const wager = parseWagerAmount(wagerArg, coinInfo.balance);

  // Validate wager is a valid positive number
  if (wager === null || isNaN(wager) || wager <= 0) {
    await message.reply(
      'Please specify a valid positive amount to gamble.\n' +
      'Examples: `.gamble 500`, `.gamble 10k`, `.gamble 1.5m`, `.gamble all`'
    );
    return; 
  }

  // Check if user has enough coins
  if (coinInfo.balance < wager) {
    await message.reply(
      `Not enough coins. You have ${coins(coinInfo.balance)}.\n` +
      `Tip: use \`.gamble all\` to wager your entire balance.`
    );
    return;
  }

  // Money tracking, so the error handler only refunds a wager that was really taken
  // and not yet settled (no free coins if the first message fails, no double pay after a win).
  let charged = false;
  let settled = false;

  try {
    const balanceBefore = coinInfo.balance;

    // Send initial message with spinning animation
    const initialMessage = await message.reply(buildLoadingMessage());

    // Determine result up front (50/50) so the reel animation can land on it.
    // 1% chance for 10x jackpot, 49% for normal win, 50% for loss
    const jackpotChance = Math.random();
    let won = false;
    let jackpot = false;
    
    if (jackpotChance < 0.01) {
      // 1% jackpot
      won = true;
      jackpot = true;
    } else if (jackpotChance < 0.5) {
      // 49% normal win
      won = true;
      jackpot = false;
    } else {
      // 50% loss
      won = false;
      jackpot = false;
    }

    // Pre-calculate the final landing frame and extract individual symbols
    const landingFrame = finalReelFrame(won);
    // Extract the three symbols by splitting (format: "emoji1 emoji2 emoji3")
    const parts = landingFrame.split(' ').filter(part => part.trim().length > 0);
    const symbol1 = parts[0] || '<:slotsseven:1545161915649753119>';
    const symbol2 = parts[1] || '<:slotsseven:1545161915649753119>';
    const symbol3 = parts[2] || '<:slotsseven:1545161915649753119>';

    // Stop reels one by one in the first message
    // Reel 1 stops after 2 seconds (run database deduction in parallel)
    const [deductionResult] = await Promise.all([
      removeCoins(userId, wager, 'gamble', {
        reason: 'Wager deducted for gamble',
        description: `Gamble wager: ${wager} coins`
      }),
      new Promise(resolve => setTimeout(resolve, 1000))
    ]);

    if (deductionResult === null) {
      console.error(`[GAMBLE] Failed to deduct wager for user ${userId}. Amount: ${wager}`);
      await initialMessage.edit({ content: 'Failed to process your wager (not enough coins, or a database hiccup). Please try again.' });
      return;
    }

    charged = true;
    const balanceAfterDeduction = deductionResult;

    await initialMessage.edit(progressiveReelFrame(symbol1, null, null));

    // Reel 2 stops 1 second after reel 1
    await new Promise(resolve => setTimeout(resolve, 1000));
    await initialMessage.edit(progressiveReelFrame(symbol1, symbol2, null));

    // Reel 3 stops 1 second after reel 2 (final result in first message)
    await new Promise(resolve => setTimeout(resolve, 1000));
    await initialMessage.edit(progressiveReelFrame(symbol1, symbol2, symbol3));

    // Second message: result with details
    if (won) {
      // WIN: Award 10x for jackpot, 2x for normal win (user already lost wager, so add payout to get net gain)
      const payout = jackpot ? wager * 10 : wager * 2;
      
      // Award winnings (no retries needed - transaction system handles this)
      const awardResult = await awardCoins(
        userId,
        payout,
        'gamble',
        {
          reason: 'Gamble winnings',
          description: `Gamble win: ${payout} coins (wager: ${wager})`
        }
      );

      if (awardResult === null) {
        console.error(`[GAMBLE] Failed to award winnings for user ${userId}. Wager: ${wager}, Payout: ${payout}. Attempting refund.`);

        // Refund the wager if payout fails
        const refundResult = await awardCoins(
          userId,
          wager,
          'gamble_refund',
          {
            reason: 'Refund after payout failure',
            description: `Refunded wager: ${wager} coins`
          }
        );

        if (refundResult === null) {
          console.error(`[GAMBLE] CRITICAL: Failed to refund wager for user ${userId} after payout failure. Amount: ${wager}`);
          await message.reply('Failed to process your winnings. Please contact support immediately - your wager may be affected.');
        } else {
          await message.reply('Failed to process your winnings due to a database issue. Your wager has been refunded. Please try again.');
        }

        settled = true;
        return;
      }

      settled = true;
      const balanceAfter = balanceAfterDeduction + payout;

      // Edit message with win result embed (net profit; the reels move into the embed)
      const net = payout - wager;
      const winResultEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setDescription(
          `${symbol1} ${symbol2} ${symbol3}\n` +
          (jackpot
            ? `${EMOJIS.win} **JACKPOT x10** ${signedCoins(net)}`
            : `${TICK} **WIN** ${signedCoins(net)}`)
        )
        .setColor(jackpot ? 0xFFD700 : 0x2ecc71);

      await initialMessage.edit({ content: null, embeds: [winResultEmbed] });
    } else {
      // LOSE: User gets nothing back (wager already deducted)
      settled = true;
      // Edit message with lose result embed
      const loseResultEmbed = new EmbedBuilder()
        .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
        .setDescription(`${symbol1} ${symbol2} ${symbol3}\n${CROSS} **LOSS** ${signedCoins(-wager)}`)
        .setColor(0xe74c3c);

      await initialMessage.edit({ content: null, embeds: [loseResultEmbed] });
    }

  } catch (error) {
    console.error(`[GAMBLE] Unexpected error for user ${userId}. Wager: ${wager}. Error:`, error);

    // Attempt to refund the wager, but only if it was taken and the game was not settled yet
    try {
      if (!charged || settled) {
        throw new Error('no refund needed');
      }
      const refundResult = await awardCoins(
        userId,
        wager,
        'gamble_error_refund',
        {
          reason: 'Refund after unexpected error',
          description: `Refunded wager due to error: ${wager} coins`
        }
      );

      if (refundResult === null) {
        console.error(`[GAMBLE] CRITICAL: Failed to refund wager for user ${userId} after unexpected error. Amount: ${wager}`);
      }
    } catch (refundError) {
      if (charged && !settled) {
        console.error(`[GAMBLE] CRITICAL: Exception during refund attempt for user ${userId}:`, refundError);
      }
    }

    await message.reply(
      charged && !settled
        ? 'Something broke during the spin, your wager was refunded. Please try again.'
        : 'Something broke, please try again.'
    ).catch(() => {});
  }
}
