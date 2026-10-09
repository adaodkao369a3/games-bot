import { Message } from 'discord.js';
import { awardCoins } from './coins.js';
import { createOrUpdateUser } from '../database/client.js';
import {
  getChatRewardsTracking,
  upsertChatRewardsTracking,
  updateChatRewardsAfterReward,
} from '../database/client.js';
import { config } from '../config/index.js';

// Configuration constants
const COINS_PER_REWARD = 20;
const MESSAGES_PER_REWARD = 10;
const COOLDOWN_MS = 30 * 1000; // 30 seconds
const MIN_MESSAGE_LENGTH = 5; // Minimum non-whitespace characters
const MAX_CONSECUTIVE_DUPLICATES = 3; // Maximum allowed duplicate messages in a row

/**
 * Chat Rewards Service
 * Handles awarding coins for chat participation with spam protection
 */
export class ChatRewardsService {
  /**
   * Process a message for potential chat rewards
   * @param message Discord message
   * @returns true if reward was given, false otherwise
   */
  static async processMessage(message: Message): Promise<boolean> {
    // Skip if not in the configured guild
    if (!message.guild || message.guild.id !== config.discord.guildId) {
      return false;
    }

    // Skip if user is a bot
    if (message.author.bot) {
      return false;
    }

    // Skip if message is too short
    const nonWhitespaceContent = message.content.replace(/\s/g, '');
    if (nonWhitespaceContent.length < MIN_MESSAGE_LENGTH) {
      return false;
    }

    // Skip if message is a command
    if (message.content.startsWith(config.prefix)) {
      return false;
    }

    const userId = message.author.id;
    const guildId = message.guild.id;
    const now = new Date();

    try {
      // Ensure user exists in the database
      await createOrUpdateUser(userId);

      // Get existing tracking data
      const tracking = await getChatRewardsTracking(userId);

      // Check if user is on cooldown
      if (tracking && tracking.cooldown_until && tracking.cooldown_until > now) {
        // Still on cooldown, just update message progress if needed
        // But we don't want to count messages during cooldown to prevent farming
        return false;
      }

      // Check for duplicate messages
      const currentContent = message.content.toLowerCase().trim();
      const isDuplicate = tracking && tracking.last_message_content === currentContent;
      const duplicateCount = isDuplicate
        ? (tracking.consecutive_duplicate_count || 0) + 1
        : 0;

      // If too many consecutive duplicates, skip
      if (duplicateCount > MAX_CONSECUTIVE_DUPLICATES) {
        console.log(`[CHAT_REWARDS] User ${userId} spamming duplicates, skipping`);
        return false;
      }

      // Calculate new message count
      const newMessageCount = tracking ? tracking.message_count + 1 : 1;
      const totalRewards = tracking ? tracking.total_rewards_earned : 0;

      // Update tracking (atomic operation)
      await upsertChatRewardsTracking(
        userId,
        guildId,
        newMessageCount,
        currentContent,
        duplicateCount,
        totalRewards
      );

      // Check if user has earned a reward
      if (newMessageCount >= MESSAGES_PER_REWARD) {
        return await this.awardReward(userId, newMessageCount);
      }

      return false;
    } catch (error) {
      console.error('[CHAT_REWARDS] Error processing message:', error);
      return false;
    }
  }

  /**
   * Award coins to a user for chat participation
   * @param userId Discord user ID
   * @param currentMessageCount Current message count (will be reset)
   * @returns true if reward was successful
   */
  private static async awardReward(userId: string, currentMessageCount: number): Promise<boolean> {
    try {
      const now = new Date();
      const cooldownUntil = new Date(now.getTime() + COOLDOWN_MS);

      // Get current tracking to get total rewards
      const tracking = await getChatRewardsTracking(userId);
      if (!tracking) {
        console.error(`[CHAT_REWARDS] Tracking not found for user ${userId} during reward`);
        return false;
      }

      const newTotalRewards = tracking.total_rewards_earned + 1;

      // Award coins using the existing coin system
      const result = await awardCoins(userId, COINS_PER_REWARD, 'chat_rewards', {
        reason: 'Chat participation reward',
        description: `Reward for ${MESSAGES_PER_REWARD} messages`,
        gameInstanceId: `chat_reward_${userId}_${now.getTime()}`,
      });

      if (result === null) {
        console.error(`[CHAT_REWARDS] Failed to award coins to user ${userId}`);
        return false;
      }

      // Update tracking after successful reward (atomic operation)
      await updateChatRewardsAfterReward(userId, 0, cooldownUntil, newTotalRewards);

      console.log(`[CHAT_REWARDS] Awarded ${COINS_PER_REWARD} coins to user ${userId} (Reward #${newTotalRewards})`);
      return true;
    } catch (error) {
      console.error('[CHAT_REWARDS] Error awarding reward:', error);
      return false;
    }
  }

  /**
   * Get a user's chat rewards statistics
   * @param userId Discord user ID
   * @returns Statistics object or null if not found
   */
  static async getUserStats(userId: string): Promise<{
    messageCount: number;
    totalRewardsEarned: number;
    lastRewardAt: Date | null;
    cooldownUntil: Date | null;
  } | null> {
    try {
      const tracking = await getChatRewardsTracking(userId);
      if (!tracking) {
        return null;
      }

      return {
        messageCount: tracking.message_count,
        totalRewardsEarned: tracking.total_rewards_earned,
        lastRewardAt: tracking.last_reward_at,
        cooldownUntil: tracking.cooldown_until,
      };
    } catch (error) {
      console.error('[CHAT_REWARDS] Error getting user stats:', error);
      return null;
    }
  }
}
