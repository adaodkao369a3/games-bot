import { Message, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

/**
 * Handle the help command
 */
export async function handleHelpCommand(message: Message): Promise<void> {
  try {
    const isStaff = message.member?.permissions.has(PermissionFlagsBits.Administrator) || false;

    const embed = new EmbedBuilder()
      .setTitle('🤖 Bob Kun — Commands')
      .setColor('#5865F2')
      .setDescription('Here are all the commands you can use:');

    // User-facing commands
    embed.addFields([
      {
        name: '🎮 **Games**',
        value: '`,wordle` — Start a multiplayer Wordle game\n`,smash @user1 @user2` — Start a Smash or Pass vote',
        inline: false,
      },
      {
        name: '🎡 **Wheels**',
        value: '`,wheel pfp` — Spin the PFP-changing wheel\n`,wheel truthordare` — Spin the Truth or Dare wheel\n`,wheel punishment` — Spin the punishment wheel\n`,wheel act` — Spin the acting/challenge wheel',
        inline: false,
      },
    ]);

    // Staff-only section
    if (isStaff) {
      embed.addFields([
        {
          name: '🛠️ **Staff Commands**',
          value: '`,fonttest` — Test font rendering\n`,smashtest` — Test Smash image generation\n`,wheeltest` — Test wheel geometry\n`,wheelfonttest` — Test wheel font rendering',
          inline: false,
        },
      ]);
    }

    embed.setFooter({ text: 'Bob Kun v1.0' });
    embed.setTimestamp();

    await message.reply({
      embeds: [embed],
    });
  } catch (error) {
    console.error('[Help Command] Error:', error);
    await message.reply({
      content: '❌ There was an error showing the help message.',
    });
  }
}
