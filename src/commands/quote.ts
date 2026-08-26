import { AttachmentBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, EmbedBuilder } from 'discord.js';
import { QuoteImageGenerator, QuoteMessageData } from '../utils/quote-image-generator.js';

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
// COMMAND HANDLER
// ============================================================

export async function handleQuoteCommand(message: any, args: string[]): Promise<void> {
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
      // We need: Message B (top-left) + Message A (bottom-right)
      
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

      // Download avatars
      const avatarBBuffer = await QuoteImageGenerator.downloadImage(messageB.author.displayAvatarURL({ size: 256 }));
      const avatarABuffer = await QuoteImageGenerator.downloadImage(messageA.author.displayAvatarURL({ size: 256 }));

      quoteData = {
        messageId: message.id,
        channelId: message.channel.id,
        message1: {
          username: messageB.author.displayName || messageB.author.username,
          userId: messageB.author.id,
          content: messageB.content,
          avatarBuffer: avatarBBuffer,
        },
        message2: {
          username: messageA.author.displayName || messageA.author.username,
          userId: messageA.author.id,
          content: messageA.content,
          avatarBuffer: avatarABuffer,
        },
        currentStyle: 'color',
      };

      activeQuotes.set(quoteId, quoteData);
    } else {
      // Single message quote: just the replied-to message (Message A)
      const quotedMessage = messageA;

      // Download avatar
      const avatarBuffer = await QuoteImageGenerator.downloadImage(quotedMessage.author.displayAvatarURL({ size: 256 }));

      quoteData = {
        messageId: message.id,
        channelId: message.channel.id,
        message1: {
          username: quotedMessage.author.displayName || quotedMessage.author.username,
          userId: quotedMessage.author.id,
          content: quotedMessage.content,
          avatarBuffer,
        },
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

    // Create buttons
    const colorButton = new ButtonBuilder()
      .setCustomId(`quote_${quoteId}_color`)
      .setLabel('🎨 Color')
      .setStyle(ButtonStyle.Primary);

    const bwButton = new ButtonBuilder()
      .setCustomId(`quote_${quoteId}_bw`)
      .setLabel('🖤 B&W')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(colorButton, bwButton);

    // Send the message to the original channel first
    const originalMessage = await message.channel.send({
      embeds: [embed],
      files: [attachment],
      components: [row],
    });

    // Redirect to directors cut channel
    const directorsCutChannelId = '1526869451834654821';
    try {
      const directorsCutChannel = await message.guild.channels.fetch(directorsCutChannelId);
      if (directorsCutChannel && directorsCutChannel.isTextBased()) {
        await directorsCutChannel.send({
          embeds: [embed],
          files: [attachment],
          components: [row],
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

// ============================================================
// INTERACTION HANDLER
// ============================================================

export async function handleQuoteInteraction(interaction: any): Promise<void> {
  try {
    const customId = interaction.customId;
    
    if (!customId.startsWith('quote_')) {
      return;
    }

    const parts = customId.split('_');
    const quoteId = parts[1];
    const style = parts[2] as 'color' | 'bw';

    const quoteData = activeQuotes.get(quoteId);

    if (!quoteData) {
      await interaction.reply({
        content: 'This quote has expired.',
        ephemeral: true,
      });
      return;
    }

    // Update the style
    quoteData.currentStyle = style;

    // Regenerate the image
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

    // Create buttons
    const colorButton = new ButtonBuilder()
      .setCustomId(`quote_${quoteId}_color`)
      .setLabel('🎨 Color')
      .setStyle(ButtonStyle.Primary);

    const bwButton = new ButtonBuilder()
      .setCustomId(`quote_${quoteId}_bw`)
      .setLabel('🖤 B&W')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(colorButton, bwButton);

    // Update the message
    await interaction.update({
      embeds: [embed],
      files: [attachment],
      components: [row],
    });

  } catch (error) {
    console.error('[Quote Interaction] Error:', error);
    await interaction.reply({
      content: 'An error occurred while updating the quote.',
      ephemeral: true,
    });
  }
}