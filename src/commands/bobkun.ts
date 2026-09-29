import { Message, EmbedBuilder, TextChannel } from 'discord.js';

/**
 * Handle the bobkun command - Server guide with arcade theme
 */
export async function handleBobkunCommand(message: Message): Promise<void> {
  try {
    const botAvatar = message.client.user.displayAvatarURL();
    
    // Only allow in guild text channels
    if (!(message.channel instanceof TextChannel)) {
      await message.reply('This command can only be used in server text channels!');
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle('<:bob:1545141387656302663> BOB\'S ARCADE')
      .setColor('#5865F2')
      .setDescription('<:controller:1545149011894210642> Games • Chaos • Challenges • Good Times\n\nWelcome to Bob\'s Arcade!\nYour home for multiplayer games, random challenges, questionable decisions, and maximum chaos.\n\nHow to play: Type `.` followed by a command to get started!');

    // Game Zone section
    embed.addFields([
      {
        name: '<:controller:1545149011894210642> GAME ZONE',
        value: '<a:hammer:1545148999386931272> **__.trial @user [accusation]__**\n*Put someone on trial in the courtroom*\n\n<:15394trophy:1545135066148118628>Challenge your friends.\n🤡 Embarrass your friends.\n💀 Regret your decisions.',
        inline: false,
      },
      {
        name: '📖 NEW PLAYER? START HERE',
        value: '① Type **__.help__** to see available commands\n② Mention players with @ for multiplayer games\n③ Follow the instructions shown by the game\n④ Use the buttons/reactions when prompted\n⑤ Have fun — and don\'t take anything too seriously 😎\n\n💡 QUICK TIP\nSome games require another player, so grab a friend and let the chaos begin!',
        inline: false,
      },
    ]);

    embed.setFooter({
      text: '🕹️ BOB\'S ARCADE\nInsert coin. Pick a game. Cause problems.\n\n🎮 Version 1.0 • Made with ❤️ by Bob Kun',
      iconURL: botAvatar
    });
    embed.setTimestamp();
    embed.setThumbnail(botAvatar);

    await message.channel.send({
      embeds: [embed],
    });
  } catch (error) {
    console.error('[Bobkun Command] Error:', error);
    await message.reply({
      content: '❌ There was an error showing the server guide. Please try again!',
    });
  }
}
