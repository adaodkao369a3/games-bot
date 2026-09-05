import { Guild, Role } from 'discord.js';
import { TitleCategory, TitleOwnership, TITLE_CATEGORIES } from './TitleData.js';
import { getTitleOwnership, setTitleOwnership, getAllTitleOwnerships } from '../database/client.js';

// In-memory cache for title ownership (synced with database)
const titleOwnershipCache: Map<string, TitleOwnership> = new Map();

/**
 * Initialize title ownership by loading from database
 */
export async function initializeTitleOwnership(): Promise<void> {
  try {
    const ownerships = await getAllTitleOwnerships();
    
    // Load all ownerships from database into cache
    for (const [categoryId, ownership] of ownerships) {
      titleOwnershipCache.set(categoryId, {
        categoryId: ownership.category_id,
        holderId: ownership.holder_id,
        holderName: ownership.holder_name,
        acquiredAt: ownership.acquired_at,
      });
    }
    
    // Initialize any missing categories
    for (const categoryId of Object.keys(TITLE_CATEGORIES)) {
      if (!titleOwnershipCache.has(categoryId)) {
        titleOwnershipCache.set(categoryId, {
          categoryId,
          holderId: null,
          holderName: null,
          acquiredAt: null,
        });
      }
    }
    
    console.log('✓ Title ownership initialized from database');
  } catch (error) {
    console.error('✗ Failed to initialize title ownership from database:', error);
    // Initialize with empty state if database fails
    for (const categoryId of Object.keys(TITLE_CATEGORIES)) {
      if (!titleOwnershipCache.has(categoryId)) {
        titleOwnershipCache.set(categoryId, {
          categoryId,
          holderId: null,
          holderName: null,
          acquiredAt: null,
        });
      }
    }
  }
}

export class TitleSystem {
  /**
   * Get the current holder of a title category
   */
  static async getTitleHolder(categoryId: string): Promise<TitleOwnership | null> {
    // Try cache first
    if (titleOwnershipCache.has(categoryId)) {
      return titleOwnershipCache.get(categoryId) || null;
    }
    
    // Fallback to database
    try {
      const ownership = await getTitleOwnership(categoryId);
      if (ownership) {
        titleOwnershipCache.set(categoryId, {
          categoryId: ownership.category_id,
          holderId: ownership.holder_id,
          holderName: ownership.holder_name,
          acquiredAt: ownership.acquired_at,
        });
        return titleOwnershipCache.get(categoryId) || null;
      }
    } catch (error) {
      console.error(`[TitleSystem] Failed to get title ownership for ${categoryId}:`, error);
    }
    
    return null;
  }

  /**
   * Check if a user holds a specific title
   */
  static async userHoldsTitle(categoryId: string, userId: string): Promise<boolean> {
    const ownership = await this.getTitleHolder(categoryId);
    return ownership?.holderId === userId;
  }

  /**
   * Award a title to a user
   */
  static async awardTitle(categoryId: string, userId: string, username: string, guild: Guild): Promise<boolean> {
    const category = TITLE_CATEGORIES[categoryId];
    if (!category) {
      return false;
    }

    // Remove title from current holder if exists
    const currentOwnership = await this.getTitleHolder(categoryId);
    if (currentOwnership?.holderId) {
      await this.removeTitleFromUser(categoryId, currentOwnership.holderId, guild);
    }

    // Award role to new holder
    try {
      const role = await guild.roles.fetch(category.roleId);
      if (!role) {
        console.error(`Role ${category.roleId} not found for category ${categoryId}`);
        return false;
      }

      const member = await guild.members.fetch(userId);
      await member.roles.add(role);

      // Update database
      const success = await setTitleOwnership(categoryId, userId, username);
      if (success) {
        // Update cache
        titleOwnershipCache.set(categoryId, {
          categoryId,
          holderId: userId,
          holderName: username,
          acquiredAt: new Date(),
        });
      }

      return success;
    } catch (error) {
      console.error(`Failed to award title ${categoryId} to user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Remove a title from a user
   */
  static async removeTitleFromUser(categoryId: string, userId: string, guild: Guild): Promise<boolean> {
    const category = TITLE_CATEGORIES[categoryId];
    if (!category) {
      return false;
    }

    try {
      const role = await guild.roles.fetch(category.roleId);
      if (!role) {
        return false;
      }

      const member = await guild.members.fetch(userId);
      await member.roles.remove(role);

      // Update ownership if this was the holder
      const ownership = await this.getTitleHolder(categoryId);
      if (ownership?.holderId === userId) {
        const success = await setTitleOwnership(categoryId, null, null);
        if (success) {
          // Update cache
          titleOwnershipCache.set(categoryId, {
            categoryId,
            holderId: null,
            holderName: null,
            acquiredAt: null,
          });
        }
        return success;
      }

      return true;
    } catch (error) {
      console.error(`Failed to remove title ${categoryId} from user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Transfer title from one user to another
   */
  static async transferTitle(categoryId: string, fromUserId: string, toUserId: string, toUsername: string, guild: Guild): Promise<boolean> {
    const category = TITLE_CATEGORIES[categoryId];
    if (!category) {
      return false;
    }

    // Remove from current holder
    await this.removeTitleFromUser(categoryId, fromUserId, guild);

    // Award to new holder
    return await this.awardTitle(categoryId, toUserId, toUsername, guild);
  }

  /**
   * Get title category by ID
   */
  static getCategory(categoryId: string): TitleCategory | null {
    return TITLE_CATEGORIES[categoryId] || null;
  }

  /**
   * Get all title categories
   */
  static getAllCategories(): Record<string, TitleCategory> {
    return TITLE_CATEGORIES;
  }
}
