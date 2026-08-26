import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { QuoteImageGenerator, QuoteMessageData, QuoteMedia, QuoteTextPart } from '../utils/quote-image-generator.js';
import { loadImage } from '@napi-rs/canvas';

// ============================================================
// QUOTE DATA STORAGE
// ============================================================

interface QuoteData {
  messageId: string;
  channelId: string;
  message1: QuoteMessageData;
  message2?: QuoteMessageData;
  currentStyle: 'color' | 'bw';
}

const activeQuotes = new Map<string, QuoteData>();

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

// Extract Unicode emojis from text
function extractUnicodeEmojis(text: string): QuoteTextPart[] {
  const parts: QuoteTextPart[] = [];
  const unicodeEmojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;
  let lastIndex = 0;
  let match;
  
  while ((match = unicodeEmojiRegex.exec(text)) !== null) {
    // Add text before emoji
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      if (beforeText.trim()) {
        parts.push({ type: 'text', value: beforeText });
      }
    }
    
    // Add Unicode emoji
    parts.push({ 
      type: 'unicodeEmoji', 
      value: match[0]
    });
    
    lastIndex = unicodeEmojiRegex.lastIndex;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    if (remaining.trim()) {
      parts.push({ type: 'text', value: remaining });
    }
  }
  
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
        try {
          const url = `https://cdn.discordapp.com/emojis/${emojiId}.png`;
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
        // Download Twemoji for Unicode emoji
        const codepoint = Array.from(part.value).map(char => char.codePointAt(0)!.toString(16)).join('-');
        const url = `https://twemoji.maxcdn.com/v/latest/72x72/${codepoint}.png`;
        const buffer = await downloadImage(url);
        const dimensions = await getImageDimensions(buffer);
        
        processedParts.push({
          type: 'unicodeEmoji',
          value: '', // Empty value since we'll render the image
          buffer,
          width: dimensions.width,
          height: dimensions.height,
        });
      } catch (error) {
        console.error('[Quote Command] Error downloading Twemoji:', error);
        // Fallback to text representation
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
        message2: message2Data,
        currentStyle: 'color',
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
        currentStyle: 'color',
      };

      activeQuotes.set(quoteId, quoteData);
    }

    // Generate the image
    const imageBuffer = await QuoteImageGenerator.generateQuoteImage({
      message1: quoteData.message1,
      message2: quoteData.message2,
      style: quoteData.currentStyle,
    });

    // Create attachment
    const attachment = new AttachmentBuilder(imageBuffer, { name: 'quote.png' });

    // Build user mentions string
    let mentions = `<@${quoteData.message1.userId}>`;
    if (quoteData.message2) {
      mentions += ` and <@${quoteData.message2.userId}>`;
    }

    // Create embed with image
    const embed = new EmbedBuilder()
      .setTitle('Quote')
      .setDescription(`Quoting ${mentions}`)
      .setImage('attachment://quote.png')
      .setColor('#0099ff')
      .setTimestamp();

    // Send the message to the original channel first
    const originalMessage = await message.channel.send({
      embeds: [embed],
      files: [attachment],
    });

    // Redirect to directors cut channel
    const directorsCutChannelId = '1526869451834654821';
    try {
      const directorsCutChannel = await message.guild.channels.fetch(directorsCutChannelId);
      if (directorsCutChannel && directorsCutChannel.isTextBased()) {
        await directorsCutChannel.send({
          embeds: [embed],
          files: [attachment],
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