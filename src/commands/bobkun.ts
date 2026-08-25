import { Message, EmbedBuilder } from 'discord.js';
import { isStaff } from '../utils/permissions.js';

/**
 * Handle the bobkun command - Server guide with arcade theme
 */
export async function handleBobkunCommand(message: Message): Promise<void> {
  try {
    const staffMember = isStaff(message.member);

    const embed = new EmbedBuilder()
      .setTitle('🕹️ BOB\'S ARCADE')
      .setColor('#5865F2')
      .setDescription('### � Games • Chaos • Challenges • Good Times\n\n> **Welcome to Bob\'s Arcade!** 🕹️\n> Your home for multiplayer games, random challenges, questionable decisions, and maximum chaos.\n>\n> **How to play:** Type `,` followed by a command to get started!');

    // Game Zone section
    embed.addFields([
      {
        name: '## � GAME ZONE',
        value: '� **`,wordle`** — Start a multiplayer Wordle game\n� **`,smash @user1 @user2`** — Start a Smash or Pass vote\n⚖️ **`,trial @user [accusation]`** — Put someone on trial in the courtroom\n� **`,roulette @user1 @user2...`** — Play Russian Roulette\n� **`,roulettemax @user`** — Play Roulette Max — **2 players only**\n🤠 **`,quickdraw @user`** — Challenge someone to a Quick Draw duel\n🌀 **`,quickdrawmax @user`** — Quick Draw Max with a distraction\n\n> 🏆 **Challenge your friends.**\n> 🤡 **Embarrass your friends.**\n> 💀 **Regret your decisions.**',
        inline: false,
      },
      {
        name: '## 🎡 THE WHEEL OF CHAOS',
        value: 'Spin your fate and see what happens...\n\n🖼️ **`,wheel pfp`** — Spin the PFP-changing wheel\n� **`,wheel truthordare`** — Spin the Truth or Dare wheel\n☠️ **`,wheel punishment`** — Spin the punishment wheel\n� **`,wheel act`** — Spin the acting & challenge wheel\n\n> ⚠️ **The wheel has spoken. No refunds.**',
        inline: false,
      },
      {
        name: '## � NEW PLAYER? START HERE',
        value: '**①** Type `,help` to see available commands\n**②** Mention players with `@` for multiplayer games\n**③** Follow the instructions shown by the game\n**④** Use the buttons/reactions when prompted\n**⑤** Have fun — and don\'t take anything too seriously �\n\n### 💡 QUICK TIP\nSome games require another player, so grab a friend and **let the chaos begin!**',
        inline: false,
      },
    ]);

    // Staff-only section
    if (staffMember) {
      embed.addFields([
        {
          name: '## 🛠️ STAFF TOOLS',
          value: '⚙️ `,fonttest` — Test font rendering\n⚙️ `,smashtest` — Test Smash image generation\n⚙️ `,wheeltest` — Test wheel geometry\n⚙️ `,wheelfonttest` — Test wheel font rendering',
          inline: false,
        },
      ]);
    }

    embed.setFooter({ 
      text: '### �️ BOB\'S ARCADE\n**Insert coin. Pick a game. Cause problems.**\n\n🎮 **Version 1.0** • Made with ❤️ by **Bob Kun**',
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
      content: '❌ There was an error showing the server guide. Please try again!',
    });
  }
}
