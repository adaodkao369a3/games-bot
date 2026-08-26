import { AttachmentBuilder, EmbedBuilder } from 'discord.js';
import { QuoteImageGenerator, QuoteMessageData, QuoteAttachment, QuoteSticker, QuoteEmoji } from '../utils/quote-image-generator.js';
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
// MEDIA DOWNLOADING HELPERS
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

async function processAttachments(message: any): Promise<QuoteAttachment[]> {
  const attachments: QuoteAttachment[] = [];
  
  for (const attachment of message.attachments.values()) {
    if (!SUPPORTED_IMAGE_TYPES.includes(attachment.contentType)) {
      continue;
    }
    
    try {
      const buffer = await downloadImage(attachment.url);
      const dimensions = await getImageDimensions(buffer);
      
      attachments.push({
        buffer,
        width: dimensions.width,
        height: dimensions.height,
        contentType: attachment.contentType,
      });
    } catch (error) {
      console.error('[Quote Command] Error downloading attachment:', error);
    }
  }
  
  return attachments;
}

async function processStickers(message: any): Promise<QuoteSticker[]> {
  const stickers: QuoteSticker[] = [];
  
  for (const sticker of message.stickers.values()) {
    try {
      // Use sticker URL (Discord CDN)
      const url = sticker.url;
      const buffer = await downloadImage(url);
      const dimensions = await getImageDimensions(buffer);
      
      stickers.push({
        buffer,
        width: dimensions.width,
        height: dimensions.height,
      });
    } catch (error) {
      console.error('[Quote Command] Error downloading sticker:', error);
    }
  }
  
  return stickers;
}

// Parse custom emojis from content: <:name:id> or <a:name:id>
function parseCustomEmojis(content: string): string[] {
  const emojiRegex = /<(a)?:\w+:(\d+)>/g;
  const emojis: string[] = [];
  let match;
  
  while ((match = emojiRegex.exec(content)) !== null) {
    emojis.push(match[0]);
  }
  
  return emojis;
}

async function processCustomEmojis(content: string): Promise<{ processedContent: string; emojis: QuoteEmoji[] }> {
  const emojis: QuoteEmoji[] = [];
  const emojiRegex = /<(a)?:\w+:(\d+)>/g;
  let processedContent = content;
  
  for (const match of content.matchAll(emojiRegex)) {
    const originalText = match[0];
    const emojiId = match[2];
    
    try {
      // Download static version from Discord CDN
      const url = `https://cdn.discordapp.com/emojis/${emojiId}.png`;
      const buffer = await downloadImage(url);
      const dimensions = await getImageDimensions(buffer);
      
      emojis.push({
        buffer,
        width: dimensions.width,
        height: dimensions.height,
        originalText,
      });
      
      // Replace with a placeholder for rendering
      processedContent = processedContent.replace(originalText, '📷');
    } catch (error) {
      console.error('[Quote Command] Error downloading custom emoji:', error);
    }
  }
  
  return { processedContent, emojis };
}

async function buildQuoteMessageData(message: any): Promise<QuoteMessageData> {
  const avatarBuffer = await downloadImage(message.author.displayAvatarURL({ size: 256 }));
  
  // Process attachments
  const attachments = await processAttachments(message);
  
  // Process stickers
  const stickers = await processStickers(message);
  
  // Process custom emojis
  const { processedContent, emojis } = await processCustomEmojis(message.content);
  
  return {
    username: message.author.displayName || message.author.username,
    userId: message.author.id,
    content: processedContent,
    avatarBuffer,
    attachments: attachments.length > 0 ? attachments : undefined,
    stickers: stickers.length > 0 ? stickers : undefined,
    customEmojis: emojis.length > 0 ? emojis : undefined,
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
      const message1Data = await buildQuoteMessageData(messageB);
      const message2Data = await buildQuoteMessageData(messageA);

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

      const message1Data = await buildQuoteMessageData(quotedMessage);

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