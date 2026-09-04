import { Guild, Role } from 'discord.js';
import { TitleCategory, TitleOwnership, TITLE_CATEGORIES } from './TitleData.js';

// In-memory title ownership storage (could be moved to database later)
const titleOwnership: Map<string, TitleOwnership> = new Map();

// Initialize title ownership for all categories
for (const categoryId of Object.keys(TITLE_CATEGORIES)) {
  if (!titleOwnership.has(categoryId)) {
    titleOwnership.set(categoryId, {
      categoryId,
      holderId: null,
      holderName: null,
      acquiredAt: null,
    });
  }
}

export class TitleSystem {
  /**
   * Get the current holder of a title category
   */
  static getTitleHolder(categoryId: string): TitleOwnership | null {
    return titleOwnership.get(categoryId) || null;
  }

  /**
   * Check if a user holds a specific title
   */
  static userHoldsTitle(categoryId: string, userId: string): boolean {
    const ownership = titleOwnership.get(categoryId);
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
    const currentOwnership = titleOwnership.get(categoryId);
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

      // Update ownership
      titleOwnership.set(categoryId, {
        categoryId,
        holderId: userId,
        holderName: username,
        acquiredAt: new Date(),
      });

      return true;
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
      const ownership = titleOwnership.get(categoryId);
      if (ownership?.holderId === userId) {
        titleOwnership.set(categoryId, {
          categoryId,
          holderId: null,
          holderName: null,
          acquiredAt: null,
        });
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
