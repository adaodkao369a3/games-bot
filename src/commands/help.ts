import { Message, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Interaction } from 'discord.js';
import { EMOJIS } from '../utils/emoji-registry.js';

/**
 * Help menu: a main page (currency, everyday commands, quotes) plus one page per
 * category, reached with buttons. Staff/admin commands are deliberately not listed.
 *
 * Button ids: help_<page>_<ownerUserId>. Only the person who opened the menu can use it.
 */

type HelpPage = 'main' | 'casino' | 'agency' | 'games';

const COLOR = 0xe06550;

/** One command entry: bold command on the first line, what it does underneath. */
function entry(command: string, text: string): string {
  return `**\`${command}\`**\n${text}`;
}

/** Blank line between entries so the page can breathe. */
function list(...entries: string[]): string {
  return entries.join('\n\n');
}

function mainEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${EMOJIS.bob}  Bob Kun  ·  Commands`)
    .setColor(COLOR)
    .setDescription('Pick a category with the buttons below.')
    .addFields([
      {
        name: `${EMOJIS.moneybag}  Currency`,
        value: list(
          entry('.wallet', 'Check your Bombo Coin balance'),
          entry('.highscore', 'The Bombo Coin leaderboard (also `.hs`)'),
          entry('.goon', 'Claim coins on a cooldown *(goon channel)*'),
          entry('.edge', 'Build an edge streak for bonus coins *(goon channel)*'),
        ),
        inline: false,
      },
      {
        name: `${EMOJIS.pin}  Everyday`,
        value: list(
          entry('.av [@user]', "Show someone's avatar (also `.avatar`)"),
          entry('.mog [@user]', 'Generate a MOG Archive classification card'),
          entry('.moglb', 'The MOG Files leaderboard'),
        ),
        inline: false,
      },
      {
        name: `${EMOJIS.chat}  Quotes`,
        value: list(
          entry('.quote', 'Reply to a message to turn it into a quote card'),
          entry('.dquote', 'Reply to a message to create a stacked quote (replied-to + its reply)'),
          'Themes: classic, white, sunset, purple, aurora, gold, cherry, midnight, plasma, emerald, rose, ember, sapphire, coral, lime',
        ),
        inline: false,
      },
    ]);
}

function casinoEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${EMOJIS.cash}  Casino`)
    .setColor(COLOR)
    .setDescription(
      'Everything here costs Bombo Coins and only works on the game floor.\n' +
      'Amounts accept `500`, `10k`, `1.5m` or `all`.\n\n' +
      list(
        entry('.gamble <amount>', "Bob's slot machine"),
        entry('.cf <amount>', 'Call heads or tails, build a streak, cash out'),
        entry('.rlt <amount> [number]', 'Roulette: colours, odd/even, dozens or an exact number'),
        entry('.bj <amount>', 'Blackjack against the dealer'),
        entry('.bj2 @user <amount>', 'Two-player blackjack against the dealer'),
        entry('.hlow <amount>', 'Higher or lower: guess the next card'),
        entry('.croulette <amount>', 'Draw mystery cards and survive'),
        entry('.bomb <amount>', 'Defuse the bomb before it explodes'),
        entry('.diceduel @user <amount>', 'Dice duel, first to the winning score'),
      )
    );
}

function agencyEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${EMOJIS.people}  Talent Agency`)
    .setColor(COLOR)
    .setDescription(
      'Scout talent, send them to work and collect coins.\n\n' +
      list(
        entry('.pscout', 'Scout new talent (free, every 30 minutes)'),
        entry('.precruit <name>', 'Sign talent you have scouted'),
        entry('.pwork <name>', 'Send a character out to work'),
        entry('.pcollect', 'Collect earnings from everyone who finished'),
        entry('.plist', 'Your agency hub: roster, care and training'),
        entry('.phelp', 'The full Talent Agency guide'),
      )
    );
}

function gamesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`${EMOJIS.controller}  Games`)
    .setColor(COLOR)
    .setDescription(
      list(
        entry('.trial @user [accusation]', 'Put someone on trial in a courtroom'),
        entry('.wordbomb', 'Fast word game, do not be holding the bomb'),
        entry('.impostor', 'Find the impostor among the crew'),
        entry('.numguess', 'Guess the hidden number'),
        entry('.simonsays', 'Follow the commands and survive'),
        entry('.pisscomp @user', 'Fill your meter first'),
        entry('.pisscompmax @user', 'Piss comp, then a fight to the finish'),
      )
    );
}

function embedFor(page: HelpPage): EmbedBuilder {
  switch (page) {
    case 'casino': return casinoEmbed();
    case 'agency': return agencyEmbed();
    case 'games': return gamesEmbed();
    default: return mainEmbed();
  }
}

/** Five buttons in one row. The page you are on is highlighted and locked. */
function buttonsFor(current: HelpPage, ownerId: string): ActionRowBuilder<ButtonBuilder>[] {
  const make = (page: HelpPage, label: string, emoji: string) =>
    new ButtonBuilder()
      .setCustomId(`help_${page}_${ownerId}`)
      .setEmoji(emoji)
      .setLabel(label)
      .setStyle(page === current ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(page === current);

  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      make('main', 'Home', EMOJIS.bob),
      make('casino', 'Casino', EMOJIS.cash),
      make('agency', 'Talent Agency', EMOJIS.people),
      make('games', 'Games', EMOJIS.controller),
    ),
  ];
}

export async function handleHelpCommand(message: Message): Promise<void> {
  try {
    await message.reply({
      embeds: [embedFor('main')],
      components: buttonsFor('main', message.author.id),
    });
  } catch (error) {
    console.error('[Help Command] Error:', error);
    await message.reply({ content: `${EMOJIS.cross} There was an error showing the help message.` }).catch(() => {});
  }
}

export async function handleHelpInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.isButton()) return;

  try {
    // help_<page>_<ownerId>
    const match = /^help_(main|casino|agency|games)_(\d+)$/.exec(interaction.customId);
    if (!match) {
      await interaction.deferUpdate().catch(() => {});
      return;
    }

    const page = match[1] as HelpPage;
    const ownerId = match[2];

    if (interaction.user.id !== ownerId) {
      await interaction.reply({ content: 'This is not your help menu. Type `.qhelp` to open your own.', ephemeral: true });
      return;
    }

    await interaction.update({
      embeds: [embedFor(page)],
      components: buttonsFor(page, ownerId),
    });
  } catch (error) {
    console.error('[Help Interaction] Error:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: `${EMOJIS.cross} There was an error updating the help menu.`, ephemeral: true }).catch(() => {});
    }
  }
}
