import { Message, MessageComponentInteraction, AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { QuoteImageGenerator, QuoteImageData, QuoteMessageData } from '../utils/quote-image-generator.js';
import { ErrorHandler } from '../utils/error-handler.js';

// Store active quote data for button interactions
interface QuoteData {
  messageId: string;
  channelId: string;
  message1: QuoteMessageData;
  message2?: QuoteMessageData;
  currentStyle: 'color' | 'bw';
}

const activeQuotes = new Map<string, QuoteData>();

/**
 * Handle ,quote command (single message quote)
 */
export async function handleQuoteCommand(message: Message, args: string[]): Promise<void> {
  try {
    // Check if this is a reply
    if (!message.reference) {
      await message.reply({
        content: 'Please reply to a message to quote it.',
      });
      return;
    }

    // Check for "2" argument for two-message quote
    const isTwoMessage = args.length > 0 && args[0] === '2';

    // Fetch the replied-to message
    const referencedMessage = await message.fetchReference();
    
    if (!referencedMessage) {
      await message.reply({
        content: 'Could not fetch the referenced message.',
      });
      return;
    }

    let quoteData: QuoteData;

    // Generate unique quote ID
    const quoteId = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    if (isTwoMessage) {
      // Two-message quote: Message A (replied-to) + Message B (current)
      const messageA = referencedMessage;
      const messageB = message;

      // Download avatars
      const avatarABuffer = await QuoteImageGenerator.downloadImage(messageA.author.displayAvatarURL({ size: 256 }));
      const avatarBBuffer = await QuoteImageGenerator.downloadImage(messageB.author.displayAvatarURL({ size: 256 }));

      quoteData = {
        messageId: message.id,
        channelId: message.channel.id,
        message1: {
          username: messageA.author.displayName || messageA.author.username,
          content: messageA.content,
          avatarBuffer: avatarABuffer,
        },
        message2: {
          username: messageB.author.displayName || messageB.author.username,
          content: messageB.content,
          avatarBuffer: avatarBBuffer,
        },
        currentStyle: 'color',
      };

      activeQuotes.set(quoteId, quoteData);
    } else {
      // Single message quote: just the replied-to message
      const quotedMessage = referencedMessage;

      // Download avatar
      const avatarBuffer = await QuoteImageGenerator.downloadImage(quotedMessage.author.displayAvatarURL({ size: 256 }));

      quoteData = {
        messageId: message.id,
        channelId: message.channel.id,
        message1: {
          username: quotedMessage.author.displayName || quotedMessage.author.username,
          content: quotedMessage.content,
          avatarBuffer,
        },
        currentStyle: 'color',
      };

      activeQuotes.set(quoteId, quoteData);
    }

    // Generate the quote image
    const imageData: QuoteImageData = {
      message1: quoteData.message1,
      message2: quoteData.message2,
      style: quoteData.currentStyle,
    };

    const quoteImage = await QuoteImageGenerator.generateQuoteImage(imageData);
    const attachment = new AttachmentBuilder(quoteImage, { name: 'quote.png' });

    // Create buttons
    const actionRow = createActionRow(quoteId);

    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setDescription(isTwoMessage ? '💬 Reply Chain Quote' : '💬 Message Quote')
      .setImage('attachment://quote.png')
      .setFooter({ text: 'Bob Kun 🍌' });

    const replyMessage = await message.reply({
      files: [attachment],
      embeds: [embed],
      components: [actionRow],
    });

    // Update the stored data with the actual message ID
    quoteData.messageId = replyMessage.id;
    activeQuotes.set(quoteId, quoteData);

  } catch (error) {
    await ErrorHandler.handleMessageError(message, error, 'quote');
  }
}

/**
 * Handle quote button interactions (Color/B&W)
 */
export async function handleQuoteInteraction(interaction: MessageComponentInteraction): Promise<void> {
  const customId = interaction.customId;

  if (!customId.startsWith('quote_')) {
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const parts = customId.split('_');
    const quoteId = parts[1];
    const style = parts[2] as 'color' | 'bw';

    const quoteData = activeQuotes.get(quoteId);

    if (!quoteData) {
      await interaction.editReply({
        content: 'Quote not found or expired.',
      });
      return;
    }

    // Update style
    quoteData.currentStyle = style;

    // Regenerate image with new style
    const imageData: QuoteImageData = {
      message1: quoteData.message1,
      message2: quoteData.message2,
      style: quoteData.currentStyle,
    };

    const updatedImage = await QuoteImageGenerator.generateQuoteImage(imageData);
    const attachment = new AttachmentBuilder(updatedImage, { name: 'quote.png' });

    const isTwoMessage = !!quoteData.message2;
    const embed = new EmbedBuilder()
      .setColor(0xFFD700)
      .setDescription(isTwoMessage ? '💬 Reply Chain Quote' : '💬 Message Quote')
      .setImage('attachment://quote.png')
      .setFooter({ text: 'Bob Kun 🍌' });

    // Update the original message
    const channel = await interaction.client.channels.fetch(quoteData.channelId);
    if (channel && 'messages' in channel) {
      const message = await channel.messages.fetch(quoteData.messageId);
      await message.edit({
        files: [attachment],
        embeds: [embed],
      });
    }

    await interaction.editReply({
      content: `Quote updated to ${style === 'color' ? 'Color' : 'Black & White'}!`,
    });

  } catch (error) {
    console.error('[Quote Interaction] Error:', error);
    await ErrorHandler.handleInteractionError(interaction, error, 'quote-interaction');
  }
}

/**
 * Create action row with Color and B&W buttons
 */
function createActionRow(quoteId: string): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>();

  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`quote_${quoteId}_color`)
      .setLabel('🎨 Color')
      .setStyle(ButtonStyle.Primary),
    
    new ButtonBuilder()
      .setCustomId(`quote_${quoteId}_bw`)
      .setLabel('🖤 B&W')
      .setStyle(ButtonStyle.Secondary)
  );

  return row;
}
