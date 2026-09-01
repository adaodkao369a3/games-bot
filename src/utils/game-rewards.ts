import { EmbedBuilder, TextChannel } from 'discord.js';
import { awardCoins } from '../services/coins.js';

/**
 * Award Bombo Coins to a game winner and send reward announcement
 * @param winnerId Discord user ID of the winner
 * @param amount Amount of coins to award
 * @param gameName Name of the game for the reward message
 * @param channel Channel to send the reward message to
 * @param gameInstanceId Unique identifier for this specific game instance (prevents duplicate rewards)
 */
export async function awardGameReward(
  winnerId: string,
  amount: number,
  gameName: string,
  channel: TextChannel,
  gameInstanceId: string
): Promise<void> {
  try {
    // Award coins through the existing CoinsService with game_instance_id
    // The database UNIQUE constraint on game_instance_id will prevent duplicate rewards
    const result = await awardCoins(winnerId, amount, `game_win_${gameName.toLowerCase()}`, {
      reason: `Won ${gameName}`,
      gameInstanceId
    });

    if (result === null) {
      console.error(`[Game Rewards] Failed to award ${amount} coins to ${winnerId} for ${gameName} (instance: ${gameInstanceId})`);
      return;
    }

    // Send reward announcement embed only if coins were actually awarded
    const rewardEmbed = new EmbedBuilder()
      .setTitle('🪙 Bombo Coins Earned')
      .setDescription(`<@${winnerId}> won the game and earned **${amount.toLocaleString()} Bombo Coins!**`)
      .setColor(0xFFD700)
      .setFooter({ text: 'Bombo Coins are the currency of the realm.' });

    await channel.send({ embeds: [rewardEmbed] });
    console.log(`[Game Rewards] Awarded ${amount} coins to ${winnerId} for ${gameName} (instance: ${gameInstanceId})`);
  } catch (error) {
    // Check if this is a unique constraint violation (duplicate reward)
    if (error instanceof Error && error.message.includes('duplicate key')) {
      console.warn(`[Game Rewards] Duplicate reward blocked for game instance ${gameInstanceId} (already awarded)`);
      return;
    }
    console.error(`[Game Rewards] Error awarding coins for ${gameName}:`, error);
  }
}
