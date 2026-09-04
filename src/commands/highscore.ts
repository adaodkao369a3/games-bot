import { Message, EmbedBuilder } from 'discord.js';
import { getLeaderboard } from '../database/client.js';

const MEDAL_EMOJIS = ['<a:firstplacetrophy:1545135079926267964>', '<a:secondplacetrophy:1545135074968608851>', '<a:thirdplacetrophy:1545135071068033024>'];
const RANK_EMOJIS = ['<:one:1545379088775258112>', '<:two:1545379099394969660>', '<:three:1545379095498727546>', '<:four:1545379083872112641>', '<:five:1545379011876622386>', '<:six:1545379093250310185>', '<:seven:1545379091287506994>', '<:eight:1545379009846706196>', '<:nine:1545379086174527530>', '<:zero:1545379101496311808>'];

export async function handleHighscoreCommand(message: Message): Promise<void> {
  try {
    const leaderboard = await getLeaderboard(10);

    if (leaderboard.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('<:cash:1545149005544165416> Bombo Coin Leaderboard')
        .setDescription('__No players yet!__ Be the first to earn some <:cash:1545149005544165416>!')
        .setColor(0xFFD700)
        .setFooter({ text: 'Start gambling to make your mark!' });

      await message.reply({ embeds: [emptyEmbed] });
      return;
    }

    // Build leaderboard description with formatting
    let description = '';
    
    for (let i = 0; i < leaderboard.length; i++) {
      const entry = leaderboard[i];
      const rank = i + 1;
      
      // Get medal emoji for top 3, otherwise use number emoji
      const rankEmoji = rank <= 3 ? MEDAL_EMOJIS[rank - 1] : RANK_EMOJIS[Math.min(rank - 1, 9)];
      
      // Fetch user from Discord to get username
      let username = 'Unknown User';
      try {
        const user = await message.client.users.fetch(entry.user_id);
        username = `<@!${entry.user_id}>`;
      } catch (error) {
        // User might not be in cache or doesn't exist
        username = `<@!${entry.user_id}>`;
      }

      // Format the entry
      const balanceFormatted = entry.balance.toLocaleString('en-US');
      
      // Use trophy emoji for top 3, bold plain number for others
      const rankDisplay = rank <= 3 ? rankEmoji : `**${rank}.**`;
      
      description += `${rankDisplay} **${username}** | **${balanceFormatted}** <:bombocoin:1545139736312815840>\n`;
    }

    const leaderboardEmbed = new EmbedBuilder()
      .setTitle('<:cash:1545149005544165416> Bombo Coin Leaderboard')
      .setDescription(description)
      .setColor(0xFFD700)
      .setThumbnail('https://cdn.discordapp.com/emojis/1545139736312815840.webp?size=96&quality=lossless')
      .setFooter({ text: '💎 Compete for glory and riches!' })
      .setTimestamp();

    await message.reply({ embeds: [leaderboardEmbed] });
  } catch (error) {
    console.error('[HIGHSCORE] Error fetching leaderboard:', error);
    await message.reply('Failed to fetch the leaderboard. Please try again later.');
  }
}
