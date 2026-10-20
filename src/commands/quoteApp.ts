import {
  ActionRowBuilder,
  ApplicationCommandType,
  ApplicationIntegrationType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContextMenuCommandBuilder,
  InteractionContextType,
  MessageComponentInteraction,
  MessageContextMenuCommandInteraction,
  StickerFormatType,
  StringSelectMenuBuilder,
} from 'discord.js';
import sharp from 'sharp';
import { renderQuoteCard, renderPortraitQuoteCard, QuoteCardOptions } from '../quote/renderer.js';
import { GRADIENT_PRESETS, FONT_OPTIONS, PresetName, FontName } from '../quote/config.js';
import { getEffectOptions, EffectName } from '../quote/effects.js';

/**
 * "Apps > Quote" message command.
 *
 * Works in any server, DM or group chat for anyone who has added the app to
 * their ACCOUNT (user install), even where the bot itself is not a member.
 * Everything comes from the interaction (the bot cannot read messages in
 * servers it is not in), and the reply is posted through the interaction, so
 * no channel access is needed.
 */

export const QUOTE_APP_COMMAND_NAME = 'Quote';

export const quoteContextCommand = new ContextMenuCommandBuilder()
  .setName(QUOTE_APP_COMMAND_NAME)
  .setType(ApplicationCommandType.Message)
  .setIntegrationTypes(ApplicationIntegrationType.GuildInstall, ApplicationIntegrationType.UserInstall)
  .setContexts(InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel);

const COOLDOWN_MS = 5000;
const SESSION_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 200;

const cooldowns = new Map<string, number>();

interface Session {
  ownerId: string;
  base: Omit<QuoteCardOptions, 'preset' | 'font' | 'effect'>;
  preset: PresetName;
  font: FontName;
  effect: EffectName;
  portrait: boolean;
  canPortrait: boolean;
  buffer: Buffer;
  expires: number;
}

/** Card settings live in memory, keyed by the id of the message that carries the card. */
const sessions = new Map<string, Session>();

function prune(): void {
  const now = Date.now();
  for (const [id, s] of sessions) {
    if (s.expires < now) sessions.delete(id);
  }
  while (sessions.size >= MAX_SESSIONS) {
    const oldest = sessions.keys().next().value;
    if (oldest === undefined) break;
    sessions.delete(oldest);
  }
}

async function render(s: Session): Promise<Buffer> {
  const opts: QuoteCardOptions = { ...s.base, preset: s.preset, font: s.font, effect: s.effect };
  if (s.portrait && s.canPortrait) {
    const { stickerUrl, imageUrl, ...textOnly } = opts;
    return renderPortraitQuoteCard(textOnly);
  }
  return renderQuoteCard(opts);
}

function buildRows(s: Session) {
  const themeSelect = new StringSelectMenuBuilder()
    .setCustomId('qapp_theme')
    .setPlaceholder('Choose a theme…')
    .addOptions(
      (Object.keys(GRADIENT_PRESETS) as PresetName[]).map((name) => ({
        label: GRADIENT_PRESETS[name].label,
        value: name,
        default: name === s.preset,
      }))
    );

  const fontSelect = new StringSelectMenuBuilder()
    .setCustomId('qapp_font')
    .setPlaceholder('Choose a font…')
    .addOptions(
      (Object.keys(FONT_OPTIONS) as FontName[]).map((name) => ({
        label: FONT_OPTIONS[name].label,
        value: name,
        default: name === s.font,
      }))
    );

  const effectSelect = new StringSelectMenuBuilder()
    .setCustomId('qapp_effect')
    .setPlaceholder('Choose an effect…')
    .addOptions(
      Object.entries(getEffectOptions()).map(([name, opt]) => ({
        label: opt.label,
        description: opt.description,
        value: name,
        default: name === s.effect,
      }))
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('qapp_gif').setLabel('GIF').setStyle(ButtonStyle.Secondary)
  );
  if (s.canPortrait) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId('qapp_mode')
        .setLabel(s.portrait ? 'Landscape' : 'Portrait')
        .setStyle(ButtonStyle.Secondary)
    );
  }

  return [
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(themeSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(fontSelect),
    new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(effectSelect),
    buttons,
  ];
}

/** Right-click a message > Apps > Quote */
export async function handleQuoteContextMenu(interaction: MessageContextMenuCommandInteraction): Promise<void> {
  const now = Date.now();
  const until = cooldowns.get(interaction.user.id) ?? 0;
  if (now < until) {
    await interaction.reply({
      content: `Wait ${Math.ceil((until - now) / 1000)}s before the next quote.`,
      ephemeral: true,
    });
    return;
  }
  cooldowns.set(interaction.user.id, now + COOLDOWN_MS);

  await interaction.deferReply();

  try {
    const target = interaction.targetMessage;
    const author = target.author;

    // Name and avatar: server nickname/avatar only when the bot happens to be
    // in that server; otherwise the account's display name and avatar.
    let nickname = author.globalName ?? author.username;
    let avatarUrl = author.displayAvatarURL({ extension: 'png', size: 1024 });
    if (interaction.guild) {
      const member = await interaction.guild.members.fetch(author.id).catch(() => null);
      if (member) {
        nickname = member.nickname ?? author.username;
        avatarUrl = member.displayAvatarURL({ extension: 'png', size: 1024 });
      }
    }

    const sticker = target.stickers?.first();
    const stickerUrl = sticker && sticker.format !== StickerFormatType.Lottie ? sticker.url : undefined;
    const imageUrl = stickerUrl
      ? undefined
      : target.attachments?.find((a) => a.contentType?.startsWith('image/'))?.url;

    const hasText = Boolean(target.content && target.content.trim().length > 0);
    let quoteText = hasText ? target.content : stickerUrl || imageUrl ? '' : '[no text content]';

    // Mentions: use the users Discord sent along with the message
    quoteText = quoteText
      .replace(/<@!?(\d+)>/g, (full, id) => {
        const u = target.mentions?.users?.get(id);
        return u ? `@${u.globalName ?? u.username}` : full;
      })
      .replace(/<@&\d+>/g, '@role');

    const session: Session = {
      ownerId: interaction.user.id,
      base: { avatarUrl, quoteText, nickname, username: author.username, stickerUrl, imageUrl },
      preset: 'classic',
      font: 'butler',
      effect: 'none',
      portrait: false,
      canPortrait: hasText,
      buffer: Buffer.alloc(0),
      expires: Date.now() + SESSION_MS,
    };
    session.buffer = await render(session);

    const sent = await interaction.editReply({
      content: target.url ? `🔗 [Jump to original message](${target.url})` : undefined,
      files: [new AttachmentBuilder(session.buffer, { name: 'quote.png' })],
      components: buildRows(session),
    });

    prune();
    sessions.set(sent.id, session);
  } catch (error) {
    console.error('[QuoteApp] Failed to make quote:', error);
    await interaction.editReply({ content: 'Could not make that quote. Try again.' }).catch(() => {});
  }
}

/** Dropdowns and buttons on a card made by the app command (custom ids start with qapp_). */
export async function handleQuoteAppInteraction(i: MessageComponentInteraction): Promise<void> {
  const session = sessions.get(i.message.id);
  if (!session || session.expires < Date.now()) {
    await i.reply({ content: 'This card has expired. Run Apps > Quote again.', ephemeral: true });
    return;
  }
  if (i.user.id !== session.ownerId) {
    await i.reply({ content: "This isn't your card to customize.", ephemeral: true });
    return;
  }
  session.expires = Date.now() + SESSION_MS;

  if (i.isButton() && i.customId === 'qapp_gif') {
    try {
      await i.deferReply();
      const { width } = await sharp(session.buffer).metadata();
      const gif = await sharp(session.buffer)
        .resize({ width: Math.round(width! / 2) })
        .gif({ colours: 256, dither: 1.0, effort: 7 })
        .toBuffer();
      await i.editReply({ files: [new AttachmentBuilder(gif, { name: 'quote.gif' })] });
    } catch (error) {
      console.error('[QuoteApp] GIF failed:', error);
      await i.editReply({ content: 'Could not make the GIF. Try again.' }).catch(() => {});
    }
    return;
  }

  // Everything else re-renders the card
  await i.deferUpdate();

  const before = { preset: session.preset, font: session.font, effect: session.effect, portrait: session.portrait };
  if (i.isButton() && i.customId === 'qapp_mode') {
    session.portrait = !session.portrait;
  } else if (i.isStringSelectMenu()) {
    const chosen = i.values[0];
    if (i.customId === 'qapp_theme') session.preset = chosen as PresetName;
    else if (i.customId === 'qapp_font') session.font = chosen as FontName;
    else if (i.customId === 'qapp_effect') session.effect = chosen as EffectName;
    else return;
  } else {
    return;
  }

  try {
    session.buffer = await render(session);
  } catch (error) {
    Object.assign(session, before);
    console.error('[QuoteApp] Re-render failed:', error);
    await i.followUp({ content: 'Could not apply that. Try again.', ephemeral: true }).catch(() => {});
    return;
  }

  await i.editReply({
    attachments: [],
    files: [new AttachmentBuilder(session.buffer, { name: 'quote.png' })],
    components: buildRows(session),
  });
}
