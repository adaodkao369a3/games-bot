import { Message, MessageComponentInteraction, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { getLeaderboard, getLeaderboardCount } from '../database/client.js';

const MEDAL_EMOJIS = ['<a:firstplacetrophy:1545135079926267964>', '<a:secondplacetrophy:1545135074968608851>', '<a:thirdplacetrophy:1545135071068033024>'];
const RANK_EMOJIS = ['<:one:1545379088775258112>', '<:two:1545379099394969660>', '<:three:1545379095498727546>', '<:four:1545379083872112641>', '<:five:1545379011876622386>', '<:six:1545379093250310185>', '<:seven:1545379091287506994>', '<:eight:1545379009846706196>', '<:nine:1545379086174527530>', '<:zero:1545379101496311808>'];

const PAGE_SIZE = 10;

// Track active pagination sessions
const activeSessions = new Map<string, { page: number; totalCount: number; leaderboard: any[] }>();

export async function handleHighscoreCommand(message: Message): Promise<void> {
  try {
    const totalCount = await getLeaderboardCount();

    if (totalCount === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('<:bombocoin:1545139736312815840> Bombo Coin Leaderboard')
        .setDescription('__No players yet!__ Be the first to earn some <:bombocoin:1545139736312815840>!')
        .setColor(0xFFD700)
        .setFooter({ text: 'Start gambling to make your mark!' });

      await message.reply({ embeds: [emptyEmbed] });
      return;
    }

    const page = 0;
    const leaderboard = await getLeaderboard(PAGE_SIZE, page * PAGE_SIZE);

    // Store session
    const sessionId = message.author.id;
    activeSessions.set(sessionId, { page, totalCount, leaderboard });

    const embed = await buildLeaderboardEmbed(leaderboard, page, totalCount, message);
    const row = buildPaginationButtons(page, totalCount, sessionId);

    await message.reply({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('[HIGHSCORE] Error fetching leaderboard:', error);
    await message.reply('Failed to fetch the leaderboard. Please try again later.');
  }
}

export async function handleHighscoreInteraction(interaction: MessageComponentInteraction): Promise<void> {
  try {
    const customId = interaction.customId;
    const action = customId.split('_')[1];
    const sessionId = customId.split('_')[2];

    const session = activeSessions.get(sessionId);
    if (!session) {
      await interaction.reply({ content: 'This leaderboard session has expired.', ephemeral: true });
      return;
    }

    // Verify user
    if (interaction.user.id !== sessionId) {
      await interaction.reply({ content: 'This is not your leaderboard!', ephemeral: true });
      return;
    }

    let newPage = session.page;
    if (action === 'prev') {
      newPage = Math.max(0, session.page - 1);
    } else if (action === 'next') {
      const maxPage = Math.ceil(session.totalCount / PAGE_SIZE) - 1;
      newPage = Math.min(maxPage, session.page + 1);
    }

    if (newPage === session.page) {
      await interaction.reply({ content: 'Already at the edge of the leaderboard.', ephemeral: true });
      return;
    }

    const leaderboard = await getLeaderboard(PAGE_SIZE, newPage * PAGE_SIZE);
    activeSessions.set(sessionId, { page: newPage, totalCount: session.totalCount, leaderboard });

    const embed = await buildLeaderboardEmbed(leaderboard, newPage, session.totalCount, interaction);
    const row = buildPaginationButtons(newPage, session.totalCount, sessionId);

    await interaction.update({ embeds: [embed], components: [row] });
  } catch (error) {
    console.error('[HIGHSCORE] Error handling interaction:', error);
    await interaction.reply({ content: 'Failed to update leaderboard. Please try again later.', ephemeral: true });
  }
}

async function buildLeaderboardEmbed(leaderboard: any[], page: number, totalCount: number, messageOrInteraction: Message | MessageComponentInteraction): Promise<EmbedBuilder> {
  let description = '';

  for (let i = 0; i < leaderboard.length; i++) {
    const entry = leaderboard[i];
    const rank = (page * PAGE_SIZE) + i + 1;

    const rankEmoji = rank <= 3 ? MEDAL_EMOJIS[rank - 1] : RANK_EMOJIS[Math.min((rank - 1) % 10, 9)];

    const username = `<@!${entry.user_id}>`;
    const balanceFormatted = entry.balance.toLocaleString('en-US');
    const rankDisplay = rank <= 3 ? rankEmoji : `**${rank}.**`;

    description += `${rankDisplay} **${username}** | **${balanceFormatted}** <:bombocoin:1545139736312815840>\n`;
  }

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const startRank = page * PAGE_SIZE + 1;
  const endRank = Math.min((page + 1) * PAGE_SIZE, totalCount);

  return new EmbedBuilder()
    .setTitle('<:bombocoin:1545139736312815840> Bombo Coin Leaderboard')
    .setDescription(description)
    .setColor(0xFFD700)
    .setThumbnail('https://cdn.discordapp.com/emojis/1545139736312815840.webp?size=96&quality=lossless')
    .setFooter({ text: `Page ${page + 1}/${totalPages} • Ranks ${startRank}-${endRank} of ${totalCount} • 💎 Compete for glory and riches!` })
    .setTimestamp();
}

function buildPaginationButtons(page: number, totalCount: number, sessionId: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`hs_prev_${sessionId}`)
      .setLabel('◀')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0)
  );

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`hs_next_${sessionId}`)
      .setLabel('▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1)
  );

  return row;
}
