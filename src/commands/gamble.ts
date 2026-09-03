import { Message, EmbedBuilder } from 'discord.js';
import { getCoinBalanceInfo, removeCoins, awardCoins } from '../services/coins.js';
import { ErrorHandler } from '../utils/error-handler.js';

const SLOT_SYMBOLS = ['🍒', '🍋', '🍇', '💎', '7️⃣', '🔔', '⭐'];
const WIN_SYMBOL = '💎';

function randomSymbol(exclude?: string): string {
  let symbol: string;
  do {
    symbol = SLOT_SYMBOLS[Math.floor(Math.random() * SLOT_SYMBOLS.length)];
  } while (symbol === exclude);
  return symbol;
}

function randomReelFrame(): string {
  return `${randomSymbol()} ${randomSymbol()} ${randomSymbol()}`;
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

/**
 * Parses a wager string that supports:
 *   - Plain numbers, with or without commas: "500", "1,500"
 *   - Shorthand suffixes: "10k" -> 10,000, "2.5m" -> 2,500,000
 *   - "all" / "max": wagers the player's entire current balance
 */
function parseWagerAmount(raw: string, balance: number): number | null {
  const input = raw.trim().toLowerCase().replace(/,/g, '');

  if (!input) return null;

  if (input === 'all' || input === 'max') {
    return balance > 0 ? balance : null;
  }

  const match = input.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!match) return null;

  let value = parseFloat(match[1]);
  if (!Number.isFinite(value)) return null;

  if (match[2] === 'k') value *= 1_000;
  else if (match[2] === 'm') value *= 1_000_000;

  value = Math.floor(value);

  if (value <= 0) return null;

  return value;
}

function buildLoadingEmbed(wager: number, balanceBefore: number): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🎰 BOB\'S GAMBLE')
    .setDescription('_Putting your Bombo Coins on the line..._\n\n**```\n' + randomReelFrame() + '\n```**')
    .setColor(0xFFD700)
    .addFields(
      { name: '💵 Wager', value: `${wager.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
      { name: '🏦 Balance', value: `${balanceBefore.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
      { name: '🎲 Odds', value: '50/50 · 2x payout', inline: true }
    )
    .setFooter({ text: 'Spinning the reels...' });
}

function buildSpinEmbed(wager: number, balanceBefore: number): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle('🎰 BOB\'S GAMBLE')
    .setDescription('**```\n' + randomReelFrame() + '\n```**')
    .setColor(0xFFD700)
    .addFields(
      { name: '💵 Wager', value: `${wager.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
      { name: '🏦 Balance', value: `${balanceBefore.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
      { name: '🎲 Odds', value: '50/50 · 2x payout', inline: true }
    )
    .setFooter({ text: 'Spinning the reels...' });
}

export async function handleGambleCommand(message: Message, args: string[]): Promise<void> {
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
      `You don't have enough Bombo Coins! Your current balance: ${coinInfo.balance.toLocaleString()} <:bombocoin:1545139736312815840>.\n` +
      `Tip: use \`.gamble all\` to wager your entire balance.`
    );
    return;
  }

  try {
    const balanceBefore = coinInfo.balance;

    // Send initial loading message with a spinning reel
    const initialMessage = await message.reply({ embeds: [buildLoadingEmbed(wager, balanceBefore)] });

    // Deduct wager amount atomically (no retries needed - transaction system handles this)
    const deductionResult = await removeCoins(
      userId,
      wager,
      'gamble',
      {
        reason: 'Wager deducted for gamble',
        description: `Gamble wager: ${wager} coins`
      }
    );

    if (deductionResult === null) {
      console.error(`[GAMBLE] Failed to deduct wager for user ${userId}. Amount: ${wager}`);
      await initialMessage.edit('Failed to process your wager. This may be due to a database connection issue. Please try again in a moment.');
      return;
    }

    const balanceAfterDeduction = deductionResult;

    // Determine result up front (50/50) so the reel animation can land on it.
    const won = Math.random() < 0.5;

    // Slot-machine style suspense: a couple of spinning frames before the
    // reveal, landing on the pre-determined result.
    const spinFrames = 3;
    for (let i = 0; i < spinFrames; i++) {
      await new Promise(resolve => setTimeout(resolve, 550));
      await initialMessage.edit({ embeds: [buildSpinEmbed(wager, balanceAfterDeduction)] });
    }
    await new Promise(resolve => setTimeout(resolve, 550));

    // Create result embed
    const resultEmbed = new EmbedBuilder()
      .setTitle('🎰 BOB\'S GAMBLE')
      .setThumbnail(message.author.displayAvatarURL({ size: 128 }));

    const landingFrame = finalReelFrame(won);

    if (won) {
      // WIN: Award 2x wager (user already lost wager, so add 2x to get net +wager)
      const payout = wager * 2;
      
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
          await initialMessage.edit('Failed to process your winnings. Please contact support immediately - your wager may be affected.');
        } else {
          await initialMessage.edit('Failed to process your winnings due to a database issue. Your wager has been refunded. Please try again.');
        }

        return;
      }

      const balanceAfter = balanceAfterDeduction + payout;

      resultEmbed
        .setDescription('**```\n' + landingFrame + '\n```**\n💰 **THE MACHINE LIKES YOU.**')
        .setColor(0x00FF00)
        .addFields(
          { name: '💵 You bet', value: `${wager.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
          { name: '<:15394trophy:1545135066148118628>Payout', value: `${payout.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
          { name: '✨ Profit', value: `+${wager.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
          { name: '🏦 New Balance', value: `${balanceAfter.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: false }
        )
        .setFooter({ text: 'Bob has temporarily approved your financial decisions.' });
    } else {
      // LOSE: User gets nothing back (wager already deducted)
      resultEmbed
        .setDescription('**```\n' + landingFrame + '\n```**\n💀 **THE MACHINE HAS SPOKEN.**')
        .setColor(0xFF0000)
        .addFields(
          { name: '💵 You bet', value: `${wager.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
          { name: '<:15394trophy:1545135066148118628>Payout', value: '0 <:bombocoin:1545139736312815840>', inline: true },
          { name: '📉 Loss', value: `-${wager.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: true },
          { name: '🏦 New Balance', value: `${balanceAfterDeduction.toLocaleString()} <:bombocoin:1545139736312815840>`, inline: false }
        )
        .setFooter({ text: 'Bob recommends pretending this never happened.' });
    }

    // Edit message with result
    await initialMessage.edit({ embeds: [resultEmbed] });

  } catch (error) {
    console.error(`[GAMBLE] Unexpected error for user ${userId}. Wager: ${wager}. Error:`, error);

    // Attempt to refund the wager on any unexpected error
    try {
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
      console.error(`[GAMBLE] CRITICAL: Exception during refund attempt for user ${userId}:`, refundError);
    }

    await message.reply('An unexpected error occurred during gambling. Your wager may be refunded automatically. If you experience issues, please try again.');
    await ErrorHandler.handleMessageError(message, error, 'gamble command');
  }
}
