import {
  Message,
  AttachmentBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ComponentType,
  StickerFormatType,
} from 'discord.js';
import { renderQuoteCard, renderStackedQuoteCard, QuoteCardOptions } from '../quote/renderer.js';
import { GRADIENT_PRESETS, PresetName, THEME_SELECT_EXPIRY_MS } from '../quote/config.js';
import { ErrorHandler } from '../utils/error-handler.js';

const THEME_NAMES: PresetName[] = ['classic', 'sunset', 'ocean', 'purple'];
const QUOTE_REDIRECT_CHANNEL_ID = '1526869451834654821';

/** Everything renderQuoteCard needs for one message, minus the shared theme. */
type QuoteSourceOpts = Omit<QuoteCardOptions, 'preset'>;

interface QuoteSource {
  opts: QuoteSourceOpts;
  url: string;
}

/** Extracts avatar/nickname/text/sticker/image from a single target message. */
async function buildQuoteSource(message: Message, target: Message): Promise<QuoteSource> {
  // Server nickname (falling back to username) — never the account's
  // global display name, which resolves to the account-wide profile name
  // rather than anything server-specific when no nickname is set.
  const member = await message.guild?.members.fetch(target.author.id).catch(() => null);
  const nickname = member?.nickname ?? target.author.username;
  const username = target.author.username;

  // High-quality avatar (was 256px)
  const avatarUrl = target.author.displayAvatarURL({ extension: 'png', size: 1024 });

  // A replied-to message can carry a sticker. Lottie stickers are vector
  // animations, not raster images — they can't be loaded onto the canvas,
  // so those are skipped and treated as if no sticker were attached.
  const sticker = target.stickers.first();
  const stickerUrl =
    sticker && sticker.format !== StickerFormatType.Lottie ? sticker.url : undefined;

  // If there's no sticker, fall back to the first image attachment on the
  // message (ignoring any additional images, and non-image attachments
  // like videos/files/audio that the canvas can't render).
  const imageAttachment = stickerUrl
    ? undefined
    : target.attachments.find((a) => a.contentType?.startsWith('image/'));
  const imageUrl = imageAttachment?.url;

  // Get quote text (handle empty content). If a sticker or image is
  // present, an empty message is expected, so skip the "[no text
  // content]" placeholder in that case — the media fills the quote area
  // on its own instead.
  const hasRealText = Boolean(target.content && target.content.trim().length > 0);
  const quoteText =
    hasRealText ? target.content : stickerUrl || imageUrl ? '' : '[no text content]';

  return {
    opts: { avatarUrl, quoteText, nickname, username, stickerUrl, imageUrl },
    url: target.url,
  };
}

export async function handleQuoteCommand(message: Message, args: string[]): Promise<void> {
  // Check if this is a reply to another message
  if (!message.reference?.messageId) {
    await message.reply(
      'You need to reply to a message to create a quote card. Reply to a message and then use `.quote`.'
    );
    return;
  }

  try {
    // Fetch the referenced (bottom-most) message
    const bottomTarget = await message.channel.messages.fetch(message.reference.messageId);

    if (!bottomTarget) {
      await message.reply('Could not find the referenced message.');
      return;
    }

    // `.quote 2` stacks the replied-to message together with whatever IT
    // was replying to — oldest on top, newest on bottom. (`.quote 3`,
    // `.quote 4`, etc. can extend this later by walking further up the
    // reply chain the same way.) If the replied-to message isn't itself a
    // reply, there's nothing to stack with, so this silently falls back
    // to a normal single quote card instead of erroring.
    const requestedStack = args[0] === '2';
    let topTarget: Message | null = null;

    if (requestedStack && bottomTarget.reference?.messageId) {
      topTarget = await message.channel.messages
        .fetch(bottomTarget.reference.messageId)
        .catch(() => null);
    }

    const isStacked = requestedStack && topTarget !== null;

    const sources: QuoteSource[] = isStacked
      ? [await buildQuoteSource(message, topTarget!), await buildQuoteSource(message, bottomTarget)]
      : [await buildQuoteSource(message, bottomTarget)];

    let preset: PresetName = 'classic';

    // Shared theme across every card in the stack — one select-menu
    // controls all of them.
    const renderCard = async (chosenPreset: PresetName) => {
      const cardsWithTheme: QuoteCardOptions[] = sources.map((s) => ({
        ...s.opts,
        preset: chosenPreset,
      }));
      return isStacked ? renderStackedQuoteCard(cardsWithTheme) : renderQuoteCard(cardsWithTheme[0]);
    };

    const buildSelectRow = (disabled = false) => {
      const select = new StringSelectMenuBuilder()
        .setCustomId('quote-theme-select')
        .setPlaceholder('Choose a theme…')
        .setDisabled(disabled)
        .addOptions(
          THEME_NAMES.map((name) => ({
            label: GRADIENT_PRESETS[name].label,
            value: name,
            default: name === preset,
          }))
        );
      return [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)];
    };

    const buffer = await renderCard(preset);
    const attachment = new AttachmentBuilder(buffer, { name: 'quote.png' });

    // One jump link per quoted message, oldest first. Jump-to-original
    // link(s) go above the image, as message content — Discord renders
    // content above attachments, unlike an embed.
    const content = sources
      .map((s, i) => {
        const label = i === 0 ? 'Jump to original message' : 'Jump to reply';
        return `__**${i + 1}.**__ <:link:1545149023701180566> [${label}](${s.url})`;
      })
      .join('\n');

    const sent = await message.reply({
      content,
      files: [attachment],
      components: buildSelectRow(),
    });

    // Send copy to redirect channel (only once)
    let redirectMessage: Message | null = null;
    try {
      const redirectChannel = await message.guild?.channels.fetch(QUOTE_REDIRECT_CHANNEL_ID);
      if (redirectChannel && redirectChannel.isTextBased()) {
        redirectMessage = await redirectChannel.send({
          content,
          files: [attachment],
          components: buildSelectRow(),
        });
      }
    } catch (redirectError) {
      console.error('[QUOTE] Failed to send quote to redirect channel:', redirectError);
      // Don't fail the original quote if redirect fails
    }

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: THEME_SELECT_EXPIRY_MS,
    });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) {
        await i.reply({ content: "This isn't your card to customize.", ephemeral: true });
        return;
      }

      // Acknowledge the interaction immediately — Discord invalidates a
      // component interaction's token after 3s, and renderCard() (image
      // fetch + canvas draw, doubled for a stacked quote) routinely takes
      // longer than that. deferUpdate() extends the window to 15 minutes,
      // during which the deferred response is edited via editReply()
      // instead of the (no-longer-first) i.update() call this replaced.
      await i.deferUpdate();

      const chosen = i.values[0] as PresetName;
      preset = chosen;

      let newAttachment: AttachmentBuilder;
      try {
        const newBuffer = await renderCard(preset);
        newAttachment = new AttachmentBuilder(newBuffer, { name: 'quote.png' });
      } catch (renderError) {
        console.error('[QUOTE] Failed to re-render quote card on theme change:', renderError);
        await i.followUp({ content: 'Failed to apply that theme. Please try again.', ephemeral: true }).catch(() => {});
        return;
      }

      await i.editReply({
        files: [newAttachment],
        components: buildSelectRow(),
      });

      // Update existing redirect message instead of sending a new one
      if (redirectMessage) {
        try {
          await redirectMessage.edit({
            files: [newAttachment],
            components: buildSelectRow(),
          });
        } catch (redirectError) {
          console.error('[QUOTE] Failed to update quote in redirect channel:', redirectError);
        }
      }
    });

    collector.on('end', async () => {
      // After expiry the card is done changing — disable/remove the select
      // menu so no more edits can be made.
      await sent.edit({ components: buildSelectRow(true) }).catch(() => {});

      // Also disable the redirect message if it exists
      if (redirectMessage) {
        await redirectMessage.edit({ components: buildSelectRow(true) }).catch(() => {});
      }
    });

  } catch (error) {
    console.error('[QUOTE] Error generating quote card:', error);
    await message.reply('Failed to generate quote card. Please try again.');
    await ErrorHandler.handleMessageError(message, error, 'quote command');
  }
}