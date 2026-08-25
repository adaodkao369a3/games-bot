import { Message, EmbedBuilder } from 'discord.js';
import { isStaff } from '../utils/permissions.js';

/**
 * Handle the bobkun command - Server guide with cute embed
 */
export async function handleBobkunCommand(message: Message): Promise<void> {
  try {
    const staffMember = isStaff(message.member);

    const embed = new EmbedBuilder()
      .setTitle('<:sunglas:1536398312448589884> Bob Kun Server Guide 🌟')
      .setColor('#FF69B4')
      .setDescription('🎀 *Welcome to the Bob Kun experience!* 🎀\n\n**How to use me:** Just type `,` followed by any command! I\'m here to bring fun games and chaos to your server! 🎮💕');

    // User-facing commands with cute emojis
    embed.addFields([
      {
        name: '🎳 **Fun Games**',
        value: '💕 `,wordle` — Start a multiplayer Wordle game\n💕 `,smash @user1 @user2` — Start a Smash or Pass vote\n💕 `,trial @user [accusation]` — Hold a courtroom trial\n💕 `,roulette @user1 @user2...` — Play Russian Roulette\n💕 `,roulettemax @user` — Play Roulette Max (2 players only)\n💕 `,quickdraw @user` — Start a Quick Draw duel\n💕 `,quickdrawmax @user` — Start a Quick Draw Max duel with distraction',
        inline: false,
      },
      {
        name: '🎡 **Spinning Wheels**',
        value: '🎪 `,wheel pfp` — Spin the PFP-changing wheel\n🎪 `,wheel truthordare` — Spin the Truth or Dare wheel\n🎪 `,wheel punishment` — Spin the punishment wheel\n🎪 `,wheel act` — Spin the acting/challenge wheel',
        inline: false,
      },
      {
        name: '📚 **Getting Started**',
        value: '🌸 **Tips for new users:**\n• Mention users with @ for multiplayer games\n• Follow the on-screen instructions\n• Most games have buttons or reactions to interact\n• Have fun and don\'t take it too seriously! 😄\n\n🌸 **Need help?** Just type `,help` anytime!',
        inline: false,
      },
    ]);

    // Staff-only section with cute styling
    if (staffMember) {
      embed.addFields([
        {
          name: '🛠️ **Staff Tools**',
          value: '⚙️ `,fonttest` — Test font rendering\n⚙️ `,smashtest` — Test Smash image generation\n⚙️ `,wheeltest` — Test wheel geometry\n⚙️ `,wheelfonttest` — Test wheel font rendering',
          inline: false,
        },
      ]);
    }

    embed.setFooter({ 
      text: '💖 Made with love by Bob Kun 💖 • Version 1.0',
      iconURL: 'https://cdn.discordapp.com/embed/avatars/0.png'
    });
    embed.setTimestamp();
    embed.setThumbnail('https://cdn.discordapp.com/embed/avatars/0.png');

    await message.reply({
      embeds: [embed],
    });
  } catch (error) {
    console.error('[Bobkun Command] Error:', error);
    await message.reply({
      content: '❌ There was an error showing the server guide. Please try again! 💔',
    });
  }
}
