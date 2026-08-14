import { Message, AttachmentBuilder } from 'discord.js';
import { SmashImageGenerator, SmashImageData } from '../utils/smash-image-generator.js';

/**
 * Handle the smash test command to test the Canvas renderer
 */
export async function handleSmashTestCommand(message: Message): Promise<void> {
  try {
    // Use sample avatar URLs (Discord default avatars)
    const sampleAvatar1 = await SmashImageGenerator.downloadAvatar('https://cdn.discordapp.com/embed/avatars/0.png');
    const sampleAvatar2 = await SmashImageGenerator.downloadAvatar('https://cdn.discordapp.com/embed/avatars/1.png');

    // Test voting image
    const votingData: SmashImageData = {
      player1Name: 'Alex',
      player1Avatar: sampleAvatar1,
      player2Name: 'VeryLongDiscordUsername123',
      player2Avatar: sampleAvatar2,
      player1Votes: 1,
      player2Votes: 0,
    };

    console.log('[SmashTest] Generating voting image...');
    const votingImage = await SmashImageGenerator.generateVotingImage(votingData);
    const votingAttachment = new AttachmentBuilder(votingImage, { name: 'smash-test-voting.png' });

    await message.reply({
      content: '🧪 **Smash Canvas Renderer Test - Voting Image**',
      files: [votingAttachment],
    });

    // Test result image
    const resultData: SmashImageData = {
      player1Name: 'Alex',
      player1Avatar: sampleAvatar1,
      player2Name: 'VeryLongDiscordUsername123',
      player2Avatar: sampleAvatar2,
      player1Votes: 1,
      player2Votes: 0,
      isResult: true,
      winner: 'player1',
    };

    console.log('[SmashTest] Generating result image...');
    const resultImage = await SmashImageGenerator.generateResultImage(resultData);
    const resultAttachment = new AttachmentBuilder(resultImage, { name: 'smash-test-result.png' });

    await message.reply({
      content: '🧪 **Smash Canvas Renderer Test - Result Image**',
      files: [resultAttachment],
    });

    console.log('[SmashTest] Test completed successfully');
  } catch (error) {
    console.error('[SmashTest] Test failed:', error);
    await message.reply({
      content: `❌ Test failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}
