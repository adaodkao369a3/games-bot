import { Message, EmbedBuilder } from 'discord.js';
import { getLeaderboard } from '../database/client.js';

const MEDAL_EMOJIS = ['🥇', '🥈', '🥉'];
const RANK_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

export async function handleHighscoreCommand(message: Message): Promise<void> {
  try {
    const leaderboard = await getLeaderboard(10);

    if (leaderboard.length === 0) {
      const emptyEmbed = new EmbedBuilder()
        .setTitle('🏆 Bombo Coin Leaderboard')
        .setDescription('__No players yet!__ Be the first to earn some <:bombocoin:1545139736312815840>!')
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
        username = user.username;
      } catch (error) {
        // User might not be in cache or doesn't exist
        username = `<@${entry.user_id}>`;
      }

      // Format the entry
      const balanceFormatted = entry.balance.toLocaleString();
      const earnedFormatted = entry.lifetime_earned.toLocaleString();
      
      if (rank === 1) {
        // Special formatting for #1
        description += `**${rankEmoji} ${username}**\n`;
        description += `> 💰 **${balanceFormatted}** <:bombocoin:1545139736312815840>\n`;
        description += `> 📈 __Lifetime Earned:__ ${earnedFormatted}\n\n`;
      } else {
        description += `${rankEmoji} **${username}**\n`;
        description += `> 💰 ${balanceFormatted} <:bombocoin:1545139736312815840>\n\n`;
      }
    }

    const leaderboardEmbed = new EmbedBuilder()
      .setTitle('🏆 __Bombo Coin Leaderboard__')
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
