import { Message, EmbedBuilder } from 'discord.js';
import { isStaff } from '../utils/permissions.js';

/**
 * Handle the help command
 */
export async function handleHelpCommand(message: Message): Promise<void> {
  try {
    const staffMember = isStaff(message.member);

    const embed = new EmbedBuilder()
      .setTitle('<:bob:1545141387656302663> Bob Kun — Commands')
      .setColor('#5865F2')
      .setDescription('Here are all the commands you can use:');

    // User-facing commands
    embed.addFields([
      {
        name: '<:controller:1545149011894210642> **Games**',
        value: '`.trial @user [accusation]` — Hold a courtroom trial\n`.gamble [amount]` — Play Bob\'s slot machine gamble *(game floor only)*\n`.diceduel @user [amount]` — Challenge someone to a dice duel *(game floor only)*\n`.hlow [amount]` — Predict if the next card is higher or lower *(game floor only)*\n`.croulette [amount]` — Draw mystery cards and survive *(game floor only)*\n`.bomb [amount]` — Defuse the bomb before it explodes *(game floor only)*\n`.wordbomb` — Fast-paced multiplayer word game\n`.bj [amount]` — Single-player Blackjack vs dealer *(game floor only)*\n`.bj2 @user [amount]` — 2-player Blackjack vs dealer *(game floor only)*\n`.cf [amount]` — Predict coin flips and build streaks *(game floor only)*\n`.impostor` — Find the Impostor among the crew\n`.numguess` — Guess the hidden number closest\n`.simonsays` — Follow the commands and survive\n`.mog [@user]` — Generate a MOG Archive classification card\n`.moglb` — View the MOG Files leaderboard',
        inline: false,
      },
      {
        name: '👑 **Titles**',
        value: '`.quiz jjk` — Take the JJK quiz to claim the Lord of the Heian Era title\n`.challenge @user jjk` — Challenge the current title holder for JJK',
        inline: false,
      },
      {
        name: '<:pixelsymbolupside:1545149037135536168> **Quotes** <:pixelsymboltop:1545149034593910886>',
        value: '`.quote` — Create a quote card from a replied message (themes: classic, sunset, ocean, purple)',
        inline: false,
      },
      {
        name: '<:moneybag:1545149026528268308> **Currency**',
        value: '`.wallet` — Check your Bombo Coin balance\n`.highscore` / `.hs` — View the Bombo Coin leaderboard\n`.fish` — Go fishing (costs 500 💵)',
        inline: false,
      },
    ]);

    // Staff-only section
    if (staffMember) {
      embed.addFields([
        {
          name: '<a:staff:1545149054936289345> **Staff Commands**',
          value: '`.cash @user [amount]` — Give Bombo Coins to a user',
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
