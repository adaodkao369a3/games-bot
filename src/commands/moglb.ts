import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageComponentInteraction } from 'discord.js';
import { getAllMogProfilesForGuild, MogLeaderboardEntry } from '../database/client.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Rank classifications matching the MOG system
const RANK_CLASSIFICATIONS = {
  'D': 'ROOKIE',
  'C': 'STANDARD',
  'B': 'ADVANCED',
  'A': 'ELITE',
  'S': 'LEGENDARY',
  'SS': 'MYTHIC',
};

// Rank colors matching the MOG system
const RANK_COLORS = {
  'D': '#888888',
  'C': '#4CAF50',
  'B': '#2196F3',
  'A': '#9C27B0',
  'S': '#FF9800',
  'SS': '#F44336',
};

// Rank priority for sorting (higher = better)
const RANK_PRIORITY = {
  'SS': 6,
  'S': 5,
  'A': 4,
  'B': 3,
  'C': 2,
  'D': 1,
};

// Pagination settings
const ENTRIES_PER_PAGE = 10;

// Track pagination state (simplified - just store per message)
const paginationStates = new Map<string, { currentPage: number; totalPages: number; entries: any[]; guildId: string }>();

/**
 * Calculate the total of all six attribute values safely
 */
function calculateAttributeTotal(attributes: { [key: string]: number }): number {
  if (!attributes || typeof attributes !== 'object') {
    return 0;
  }

  let total = 0;
  for (const [key, value] of Object.entries(attributes)) {
    if (typeof value === 'number' && !isNaN(value)) {
      total += value;
    }
  }
  return total;
}

/**
 * Sort MOG leaderboard entries according to the specified rules:
 * 1. Rank (SS > S > A > B > C > D)
 * 2. Stars (descending)
 * 3. Total attributes (descending)
 * 4. User ID (ascending for stable tie-breaking)
 */
function sortLeaderboardEntries(entries: MogLeaderboardEntry[]): MogLeaderboardEntry[] {
  return entries.sort((a, b) => {
    // Primary: Rank priority
    const rankPriorityA = RANK_PRIORITY[a.rank] || 0;
    const rankPriorityB = RANK_PRIORITY[b.rank] || 0;
    if (rankPriorityA !== rankPriorityB) {
      return rankPriorityB - rankPriorityA; // Descending rank priority
    }

    // Secondary: Stars (descending)
    if (a.stars !== b.stars) {
      return b.stars - a.stars;
    }

    // Tertiary: Total attributes (descending)
    const totalA = calculateAttributeTotal(a.attributes);
    const totalB = calculateAttributeTotal(b.attributes);
    if (totalA !== totalB) {
      return totalB - totalA;
    }

    // Final tie-breaker: User ID (ascending for stable order)
    return a.user_id.localeCompare(b.user_id);
  });
}

/**
 * Generate star display string
 */
function generateStarDisplay(stars: number): string {
  const fullStars = '★'.repeat(stars);
  const emptyStars = '☆'.repeat(5 - stars);
  return fullStars + emptyStars;
}

/**
 * Handle the MOG leaderboard command
 */
export async function handleMoglbCommand(message: Message): Promise<void> {
  try {
    // Check if command is used in a guild
    if (!message.guild) {
      await message.reply({
        content: 'The MOG leaderboard is server-specific. Please use this command in a Discord server.',
      });
      return;
    }

    const guildId = message.guild.id;
    console.log(`[MOG Leaderboard] Fetching leaderboard for guild: ${guildId}`);

    // Get all profiles for the guild
    const allProfiles = await getAllMogProfilesForGuild(guildId);

    if (allProfiles.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('🏆 THE MOG FILES — LEADERBOARD')
        .setDescription('No MOG profiles have been recorded yet. Run `.mog` to create the first file.')
        .setColor(0x4A90E2)
        .setFooter({ text: 'BOMBO PRODUCTIONS' });

      await message.reply({ embeds: [emptyEmbed] });
      return;
    }

    // Sort entries according to the ranking rules
    const sortedEntries = sortLeaderboardEntries(allProfiles);
    const totalPages = Math.ceil(sortedEntries.length / ENTRIES_PER_PAGE);

    // Generate the first page
    const pageData = generateLeaderboardPage(sortedEntries, 1, totalPages, message.guild);

    // Create pagination buttons
    const row = createPaginationButtons(1, totalPages, message.author.id);

    // Store pagination state
    const stateId = `${message.author.id}_${message.channel.id}`;
    paginationStates.set(stateId, {
      currentPage: 1,
      totalPages,
      entries: sortedEntries,
      guildId,
    });

    // Send the initial leaderboard
    await message.reply({
      embeds: [pageData.embed],
      components: [row],
    });

    console.log(`[MOG Leaderboard] Successfully sent leaderboard page 1/${totalPages}`);
  } catch (error) {
    console.error('[MOG Leaderboard] Error:', error);
    await ErrorHandler.handleMessageError(message, error, 'MOG leaderboard command');
  }
}

/**
 * Generate leaderboard page data
 */
function generateLeaderboardPage(
  entries: MogLeaderboardEntry[],
  currentPage: number,
  totalPages: number,
  guild: any
): { embed: EmbedBuilder; startRank: number; endRank: number } {
  const startIndex = (currentPage - 1) * ENTRIES_PER_PAGE;
  const endIndex = Math.min(startIndex + ENTRIES_PER_PAGE, entries.length);
  const pageEntries = entries.slice(startIndex, endIndex);

  let description = '';

  for (let i = 0; i < pageEntries.length; i++) {
    const entry = pageEntries[i];
    const globalRank = startIndex + i + 1;

    // Get member display name
    // Always display the user's actual Discord mention
    const displayName = `<@${entry.user_id}>`;


    // Calculate attribute total
    const attributeTotal = calculateAttributeTotal(entry.attributes);

    // Format the entry
    const rankDisplay = `**#${globalRank}**`;
    const starsDisplay = generateStarDisplay(entry.stars);
    const classification = RANK_CLASSIFICATIONS[entry.rank] || 'UNKNOWN';

    description += `${rankDisplay} **${displayName}** — ${entry.rank} ${classification} — ${starsDisplay} — Total: ${attributeTotal}\n`;
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 THE MOG FILES — LEADERBOARD')
    .setDescription('Server classifications, ranked by rank, stars, and total attributes.')
    .setColor(0x4A90E2)
    .addFields({ name: 'Leaderboard', value: description || 'No entries' })
    .setFooter({ text: `Page ${currentPage}/${totalPages} • BOMBO PRODUCTIONS` })
    .setTimestamp();

  return { embed, startRank: startIndex + 1, endRank: endIndex };
}

/**
 * Create pagination buttons
 */
function createPaginationButtons(currentPage: number, totalPages: number, userId: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  const prevButton = new ButtonBuilder()
    .setCustomId(`moglb_prev_${userId}`)
    .setLabel('Previous')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage === 1);

  const nextButton = new ButtonBuilder()
    .setCustomId(`moglb_next_${userId}`)
    .setLabel('Next')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(currentPage === totalPages);

  row.addComponents(prevButton, nextButton);

  return row;
}

/**
 * Handle MOG leaderboard button interactions
 */
export async function handleMoglbInteraction(interaction: MessageComponentInteraction): Promise<void> {
  try {
    const customId = interaction.customId;

    if (customId.startsWith('moglb_prev_') || customId.startsWith('moglb_next_')) {
      await handleMoglbPagination(interaction);
    }
  } catch (error) {
    console.error('[MOG Leaderboard] Interaction error:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'MOG leaderboard interaction');
  }
}

/**
 * Handle pagination button clicks
 */
async function handleMoglbPagination(interaction: MessageComponentInteraction): Promise<void> {
  const customId = interaction.customId;
  const isNext = customId.startsWith('moglb_next_');
  const userId = customId.split('_').pop();

  // Verify the user is the original requester
  if (interaction.user.id !== userId) {
    await interaction.reply({
      content: 'You can only navigate your own leaderboard view.',
      ephemeral: true,
    });
    return;
  }

  // Get the pagination state for this user/channel
  const stateId = `${userId}_${interaction.channelId}`;
  const state = paginationStates.get(stateId);

  if (!state) {
    await interaction.reply({
      content: 'This leaderboard view has expired. Please run `.moglb` again.',
      ephemeral: true,
    });
    return;
  }

  // Calculate new page
  let newPage = state.currentPage;
  if (isNext) {
    newPage = Math.min(state.currentPage + 1, state.totalPages);
  } else {
    newPage = Math.max(state.currentPage - 1, 1);
  }

  // Generate new page
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: 'This command can only be used in a server.',
      ephemeral: true,
    });
    return;
  }

  const pageData = generateLeaderboardPage(state.entries, newPage, state.totalPages, guild);
  const row = createPaginationButtons(newPage, state.totalPages, userId);

  // Update state
  state.currentPage = newPage;
  paginationStates.set(stateId, state);

  // Update the message
  await interaction.update({
    embeds: [pageData.embed],
    components: [row],
  });

  console.log(`[MOG Leaderboard] User ${userId} navigated to page ${newPage}/${state.totalPages}`);
}