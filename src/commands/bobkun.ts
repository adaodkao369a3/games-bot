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
        value: '<a:statustyping:1545155645630582794> **__.wordle__**\n*Start a multiplayer Wordle game*\n\n<:smash:1545149052017049751> **__.smash @user1 @user2__**\n*Start a Smash or Pass vote* <:pass:1545149029573329007>\n\n<a:hammer:1545148999386931272> **__.trial @user [accusation]__**\n*Put someone on trial in the courtroom*\n\n<:gunpoint:1545149018160631868> **__.roulette @user1 @user2...__**\n*Play Russian Roulette*\n\n<a:purplebomb:1545149042378407986> **__.roulettemax @user__**\n*Play Roulette Max — 2 players only*\n\n🤠 **__.quickdraw @user__**\n*Challenge someone to a Quick Draw duel*\n\n🌀 **__.quickdrawmax @user__**\n*Quick Draw Max with a distraction*\n\n<:15394trophy:1545135066148118628>Challenge your friends.\n🤡 Embarrass your friends.\n💀 Regret your decisions.',
        inline: false,
      },
      {
        name: '<a:cd:1545149009855778848> THE WHEEL OF CHAOS',
        value: 'Spin your fate and see what happens...\n\n🖼️ **__.wheel pfp__**\n*Spin the PFP-changing wheel*\n\n<a:dice:1545149015652307104> **__.wheel truthordare__**\n*Spin the Truth or Dare wheel*\n\n☠️ **__.wheel punishment__**\n*Spin the punishment wheel*\n\n🎭 **__.wheel act__**\n*Spin the acting & challenge wheel*\n\n⚠️ The wheel has spoken. No refunds.',
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
