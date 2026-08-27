import { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuInteraction } from 'discord.js';
import {
  QuoteImageGenerator,
  QuoteMessageData,
  QuoteMedia,
  QuoteTextPart,
  GRADIENT_PRESETS,
  GradientPresetId,
  DEFAULT_GRADIENT,
} from '../utils/quote-image-generator.js';
import { loadImage } from '@napi-rs/canvas';

// ============================================================
// QUOTE DATA STORAGE
// ============================================================

interface QuoteData {
  messageId: string;
  channelId: string;
  message1: QuoteMessageData;
  message1Url: string; // URL to original message
  message2?: QuoteMessageData;
  message2Url?: string; // URL to second message (if two-message quote)
  currentStyle: 'color' | 'bw';
  currentGradient: GradientPresetId;
  ownerId: string; // only the person who requested the quote may change its gradient
}

const activeQuotes = new Map<string, QuoteData>();

// ============================================================
// GRADIENT DROPDOWN
// ============================================================

function buildGradientRow(quoteId: string, selected: GradientPresetId): ActionRowBuilder<StringSelectMenuBuilder> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`quote_gradient_${quoteId}`)
    .setPlaceholder('🎨 Choose a gradient style')
    .addOptions(
      (Object.entries(GRADIENT_PRESETS) as [GradientPresetId, typeof GRADIENT_PRESETS[GradientPresetId]][]).map(
        ([id, preset]) => ({
          label: preset.label,
          description: preset.description,
          value: id,
          default: id === selected,
        })
      )
    );

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

function buildQuoteEmbed(quoteData: QuoteData): EmbedBuilder {
  // Build user mentions string
  let mentions = `<@${quoteData.message1.userId}>`;
  if (quoteData.message2) {
    mentions += ` and <@${quoteData.message2.userId}>`;
  }

  // Build description with message links
  let description = `Quoting ${mentions}`;
  if (quoteData.message2Url) {
    description += `\n[Jump to original message](${quoteData.message1Url})`;
    description += ` | [Jump to reply](${quoteData.message2Url})`;
  } else {
    description += `\n[Jump to message](${quoteData.message1Url})`;
  }

  return new EmbedBuilder()
    .setTitle('Quote')
    .setDescription(description)
    .setImage('attachment://quote.png')
    .setColor('#0099ff')
    .setTimestamp();
}

// ============================================================
// GRADIENT SELECT MENU INTERACTION
// ============================================================

export async function handleQuoteInteraction(interaction: StringSelectMenuInteraction): Promise<void> {
  const quoteId = interaction.customId.replace('quote_gradient_', '');
  const quoteData = activeQuotes.get(quoteId);

  if (!quoteData) {
    await interaction.reply({
      content: 'This quote has expired and can no longer be restyled. Run `,quote` again to make a new one.',
      ephemeral: true,
    });
    return;
  }

  if (interaction.user.id !== quoteData.ownerId) {
    await interaction.reply({
      content: 'Only the person who created this quote can change its gradient.',
      ephemeral: true,
    });
    return;
  }

  const selectedGradient = interaction.values[0] as GradientPresetId;
  if (!(selectedGradient in GRADIENT_PRESETS)) {
    await interaction.reply({ content: 'Unknown gradient style.', ephemeral: true });
    return;
  }

  quoteData.currentGradient = selectedGradient;

  try {
    await interaction.deferUpdate();

    const imageBuffer = await QuoteImageGenerator.generateQuoteImage({
      message1: quoteData.message1,
      message2: quoteData.message2,
      style: quoteData.currentStyle,
      gradient: quoteData.currentGradient,
    });

    const attachment = new AttachmentBuilder(imageBuffer, { name: 'quote.png' });
    const embed = buildQuoteEmbed(quoteData);
    const gradientRow = buildGradientRow(quoteId, quoteData.currentGradient);

    await interaction.editReply({
      embeds: [embed],
      files: [attachment],
      components: [gradientRow],
    });
  } catch (error) {
    console.error('[Quote Command] Error applying gradient:', error);
    try {
      await interaction.followUp({ content: 'Failed to apply that gradient. Please try again.', ephemeral: true });
    } catch {
      // Interaction may have already expired; nothing more we can do.
    }
  }
}

// ============================================================
// MESSAGE CONTENT EXTRACTION
// ============================================================

async function downloadImage(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function getImageDimensions(buffer: Buffer): Promise<{ width: number; height: number }> {
  const image = await loadImage(buffer);
  return { width: image.width, height: image.height };
}

const SUPPORTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

// Twemoji asset filenames drop the VARIATION SELECTOR-16 (U+FE0F) codepoint,
// so it has to be stripped before building the lookup URL or the request
// 404s and the emoji silently fails to render.
function toTwemojiCodepoint(value: string): string {
  return Array.from(value)
    .map(char => char.codePointAt(0)!)
    .filter(cp => cp !== 0xFE0F)
    .map(cp => cp.toString(16))
    .join('-');
}

// Twitter's original twemoji repo is no longer actively maintained;
// jdecked/twemoji is the community fork that keeps shipping new emoji, so
// it's tried first with the legacy repo as a fallback for older codepoints.
async function downloadTwemoji(value: string): Promise<Buffer> {
  const codepoint = toTwemojiCodepoint(value);

  if (!codepoint) {
    throw new Error(`No renderable codepoint for emoji: ${JSON.stringify(value)}`);
  }

  const sources = [
    `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${codepoint}.png`,
    `https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/72x72/${codepoint}.png`,
  ];

  let lastError: unknown;
  for (const url of sources) {
    try {
      return await downloadImage(url);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to download Twemoji for codepoint ${codepoint}`);
}

// Extract text parts from message content, handling custom emojis and Unicode emojis
function extractTextParts(content: string): QuoteTextPart[] {
  const parts: QuoteTextPart[] = [];
  const customEmojiRegex = /<(a)?:\w+:(\d+)>/g;
  const unicodeEmojiRegex = /[\p{Emoji}\u200D]+/gu;
  let lastIndex = 0;
  let customMatch;
  
  // First, find all custom emoji positions
  const customEmojiMatches: {index: number, text: string}[] = [];
  while ((customMatch = customEmojiRegex.exec(content)) !== null) {
    customEmojiMatches.push({ index: customMatch.index, text: customMatch[0] });
  }
  
  // Process the content, splitting by custom emojis and Unicode emojis
  let currentIndex = 0;
  
  for (const customMatch of customEmojiMatches) {
    // Process text before this custom emoji
    const beforeText = content.slice(currentIndex, customMatch.index);
    if (beforeText) {
      const textParts = extractUnicodeEmojis(beforeText);
      parts.push(...textParts);
    }
    
    // Add custom emoji
    parts.push({ 
      type: 'customEmoji', 
      value: customMatch.text
    });
    
    currentIndex = customMatch.index + customMatch.text.length;
  }
  
  // Process remaining text
  const remainingText = content.slice(currentIndex);
  if (remainingText) {
    const textParts = extractUnicodeEmojis(remainingText);
    parts.push(...textParts);
  }
  
  return parts;
}

// Extract Unicode emojis as complete grapheme clusters so sequences like
// skin-tone variants, flags, keycaps, and ZWJ emojis stay together.
function extractUnicodeEmojis(text: string): QuoteTextPart[] {
  const parts: QuoteTextPart[] = [];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  let textBuffer = '';

  const flushText = () => {
    if (textBuffer) {
      parts.push({ type: 'text', value: textBuffer });
      textBuffer = '';
    }
  };

  for (const { segment } of segmenter.segment(text)) {
    // Extended pictographic catches normal emoji as well as many emoji
    // sequences that do not carry Emoji_Presentation on every code point.
    // We also catch two cases that would otherwise slip through and get
    // rendered (or silently dropped) as plain text:
    //  - Text-presentation symbols explicitly forced into emoji style with
    //    a variation selector, e.g. "✔️", "™️", "☺️" (U+FE0F).
    //  - Keycap sequences, e.g. "1️⃣", "#️⃣", "*️⃣".
    const hasEmojiVariationSelector = /\p{Emoji}\uFE0F/u.test(segment);
    const isKeycapSequence = /[0-9#*]\uFE0F?\u20E3/u.test(segment);
    const isEmoji = /\p{Extended_Pictographic}/u.test(segment) ||
      /\p{Emoji_Presentation}/u.test(segment) ||
      hasEmojiVariationSelector ||
      isKeycapSequence;

    if (isEmoji) {
      flushText();
      parts.push({ type: 'unicodeEmoji', value: segment });
    } else {
      textBuffer += segment;
    }
  }

  flushText();
  return parts;
}

// Extract media from Discord message with deduplication
async function extractMedia(message: any): Promise<QuoteMedia[]> {
  const media: QuoteMedia[] = [];
  const seenUrls = new Set<string>();
  
  // Process attachments
  for (const attachment of message.attachments.values()) {
    if (!SUPPORTED_IMAGE_TYPES.includes(attachment.contentType)) {
      continue;
    }
    
    if (seenUrls.has(attachment.url)) {
      continue;
    }
    seenUrls.add(attachment.url);
    
    try {
      const buffer = await downloadImage(attachment.url);
      const dimensions = await getImageDimensions(buffer);
      
      media.push({
        type: attachment.contentType === 'image/gif' ? 'gif' : 'image',
        buffer,
        width: dimensions.width,
        height: dimensions.height,
        url: attachment.url,
      });
    } catch (error) {
      console.error('[Quote Command] Error downloading attachment:', error);
    }
  }
  
  // Process stickers
  for (const sticker of message.stickers.values()) {
    if (seenUrls.has(sticker.url)) {
      continue;
    }
    seenUrls.add(sticker.url);
    
    try {
      const buffer = await downloadImage(sticker.url);
      const dimensions = await getImageDimensions(buffer);
      
      media.push({
        type: 'sticker',
        buffer,
        width: dimensions.width,
        height: dimensions.height,
        url: sticker.url,
      });
    } catch (error) {
      console.error('[Quote Command] Error downloading sticker:', error);
    }
  }
  
  return media;
}

// Process custom emojis and Unicode emojis, downloading their images
async function processEmojis(textParts: QuoteTextPart[]): Promise<QuoteTextPart[]> {
  const processedParts: QuoteTextPart[] = [];
  
  for (const part of textParts) {
    if (part.type === 'customEmoji') {
      const match = part.value.match(/<(a)?:\w+:(\d+)>/);
      if (match) {
        const emojiId = match[2];
        const extension = match[1] ? 'gif' : 'png';
        try {
          const url = `https://cdn.discordapp.com/emojis/${emojiId}.${extension}?quality=lossless`;
          const buffer = await downloadImage(url);
          const dimensions = await getImageDimensions(buffer);
          
          processedParts.push({
            type: 'customEmoji',
            value: '', // Empty value since we'll render the image
            buffer,
            width: dimensions.width,
            height: dimensions.height,
          });
        } catch (error) {
          console.error('[Quote Command] Error downloading custom emoji:', error);
          // Fallback to text representation
          processedParts.push(part);
        }
      } else {
        processedParts.push(part);
      }
    } else if (part.type === 'unicodeEmoji') {
      try {
        const buffer = await downloadTwemoji(part.value);
        const dimensions = await getImageDimensions(buffer);

        processedParts.push({
          type: 'unicodeEmoji',
          value: '', // Empty value since we'll render the image
          buffer,
          width: dimensions.width,
          height: dimensions.height,
        });
      } catch (error) {
        console.error('[Quote Command] Error downloading Twemoji for', JSON.stringify(part.value), ':', error);
        // Fallback to text representation - the renderer will draw the raw
        // glyph with the bundled emoji font instead of dropping it entirely.
        processedParts.push(part);
      }
    } else {
      processedParts.push(part);
    }
  }
  
  return processedParts;
}

// Main extraction function
async function extractQuoteMessageData(message: any): Promise<QuoteMessageData> {
  const avatarBuffer = await downloadImage(message.author.displayAvatarURL({ size: 256 }));
  
  // Extract text parts
  const rawTextParts = extractTextParts(message.content);
  const textParts = await processEmojis(rawTextParts);
  
  // Extract media
  const media = await extractMedia(message);
  
  // Determine if message has actual text or emoji content
  const hasTextContent = textParts.some(part => part.type === 'text' && part.value.trim());
  const hasEmojiContent = textParts.some(part => part.type === 'unicodeEmoji' || part.type === 'customEmoji');
  const hasText = hasTextContent || hasEmojiContent;
  
  return {
    username: message.author.displayName || message.author.username,
    userId: message.author.id,
    avatarBuffer,
    textParts,
    media,
    hasText,
  };
}

// ============================================================
// ROLE PERMISSIONS
// ============================================================

const ALLOWED_ROLES = [
  '1540782365893337100', // booster
  '1535285114618249246', // producer
];

function hasPermission(member: any): boolean {
  // Check if user is admin
  if (member.permissions.has('Administrator')) {
    return true;
  }
  
  // Check if user has any of the allowed roles
  return member.roles.cache.some((role: any) => 
    ALLOWED_ROLES.includes(role.id)
  );
}

// ============================================================
// COMMAND HANDLER
// ============================================================

export async function handleQuoteCommand(message: any, args: string[]): Promise<void> {
  try {
    // Check permissions
    if (!message.member || !hasPermission(message.member)) {
      await message.reply({
        content: 'You do not have permission to use this command.',
      });
      return;
    }

    // Check if this is a reply
    if (!message.reference) {
      await message.reply({
        content: 'Please reply to a message to quote it.',
      });
      return;
    }

    // Check for "2" argument for two-message quote
    const isTwoMessage = args.length > 0 && args[0] === '2';

    // Fetch the replied-to message (Message A)
    const messageA = await message.fetchReference();
    
    if (!messageA) {
      await message.reply({
        content: 'Could not fetch the referenced message.',
      });
      return;
    }

    let quoteData: QuoteData;

    // Generate unique quote ID
    const quoteId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (isTwoMessage) {
      // Two-message quote: resolve the reply chain
      // Command message replies to Message A
      // Message A replies to Message B
      // We need: Message B (message1/original) + Message A (message2/current)
      
      if (!messageA.reference) {
        await message.reply({
          content: '`,quote 2` requires the message you\'re replying to to also be a reply to another message.',
        });
        return;
      }

      // Fetch Message B (the message that Message A is replying to)
      const messageB = await messageA.fetchReference();
      
      if (!messageB) {
        await message.reply({
          content: 'Could not fetch the original message in the reply chain.',
        });
        return;
      }

      // Build quote data for both messages
      const message1Data = await extractQuoteMessageData(messageB);
      const message2Data = await extractQuoteMessageData(messageA);

      quoteData = {
        messageId: message.id,
        channelId: message.channel.id,
        message1: message1Data,
        message1Url: messageB.url,
        message2: message2Data,
        message2Url: messageA.url,
        currentStyle: 'color',
        currentGradient: DEFAULT_GRADIENT,
        ownerId: message.author.id,
      };

      activeQuotes.set(quoteId, quoteData);
    } else {
      // Single message quote: just the replied-to message (Message A)
      const quotedMessage = messageA;

      const message1Data = await extractQuoteMessageData(quotedMessage);

      quoteData = {
        messageId: message.id,
        channelId: message.channel.id,
        message1: message1Data,
        message1Url: quotedMessage.url,
        currentStyle: 'color',
        currentGradient: DEFAULT_GRADIENT,
        ownerId: message.author.id,
      };

      activeQuotes.set(quoteId, quoteData);
    }

    // Generate the image
    const imageBuffer = await QuoteImageGenerator.generateQuoteImage({
      message1: quoteData.message1,
      message2: quoteData.message2,
      style: quoteData.currentStyle,
      gradient: quoteData.currentGradient,
    });

    // Create attachment
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'quote.png' });

    // Create embed with image
    const embed = buildQuoteEmbed(quoteData);

    // Gradient picker dropdown - lets the requester restyle the image
    // in place without re-running the command.
    const gradientRow = buildGradientRow(quoteId, quoteData.currentGradient);

    // Send the message to the original channel first
    const originalMessage = await message.channel.send({
      embeds: [embed],
      files: [attachment],
      components: [gradientRow],
    });

    // Redirect to directors cut channel
    const directorsCutChannelId = '1526869451834654821';
    try {
      const directorsCutChannel = await message.guild.channels.fetch(directorsCutChannelId);
      if (directorsCutChannel && directorsCutChannel.isTextBased()) {
        await directorsCutChannel.send({
          embeds: [embed],
          files: [new AttachmentBuilder(imageBuffer, { name: 'quote.png' })],
          components: [gradientRow],
        });
      }
    } catch (error) {
      console.error('[Quote Command] Error redirecting to directors cut channel:', error);
    }

  } catch (error) {
    console.error('[Quote Command] Error:', error);
    await message.reply({
      content: 'An error occurred while generating the quote.',
    });
  }
}