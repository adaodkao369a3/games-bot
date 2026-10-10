import { Message, EmbedBuilder } from 'discord.js';
import { config, isTalentAgencyChannel, isGameFloorChannel, isGoonEdgeChannel } from '../config/index.js';

const COIN = '<:bombocoin:1545139736312815840>';

export async function handlePhelpCommand(message: Message): Promise<void> {
  if (!isTalentAgencyChannel(message.channel.id) && !isGameFloorChannel(message.channel.id) && !isGoonEdgeChannel(message.channel.id)) {
    const allChannels = [...config.talentAgencyChannelIds, ...config.gameFloorChannelIds, ...config.goonEdgeChannelIds];
    await message.reply(`This command can only be used in ${allChannels.map(id => `<#${id}>`).join(', ')}.`);
    return;
  }

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.author.username, iconURL: message.author.displayAvatarURL() })
    .setTitle('🎭 BOB KUN TALENT AGENCY')
    .setDescription('Manage your roster of talent and earn coins!')
    .setThumbnail(message.author.displayAvatarURL())
    .setColor(0xFFD700)
    .addFields(
      { name: '__PIMP GAME COMMANDS__', value: '\u200b' },
      { name: '__.__pscout', value: 'Scout for new talent. Find all 20 characters!' },
      { name: '__.__precruit <name>', value: 'Recruit discovered talent to your roster.' },
      { name: '__.__pwork <name>', value: 'Send talent to work. Earnings based on tier/level.' },
      { name: '__.__pcollect', value: 'Collect earnings from working talent.' },
      { name: '__.__plist', value: 'View your roster and talent status.' },
      { name: '\u200b', value: '\u200b' },
      { name: '__EDGE & GOON__', value: '\u200b' },
      { name: '__.__edge', value: `Earn ${COIN} 200 base + streak bonus (+5% per edge, max +50%). 10 edges unlocks Goon Rush (halves .goon cooldown). 5 min cooldown.` },
      { name: '__.__goon', value: `Earn ${COIN} 400 (first 3/day) or ${COIN} 200 (4th+). 15 min cooldown (7.5m with Goon Rush). Resets edge streak.` },
      { name: '\u200b', value: '\u200b' },
      { name: '__TIER PAYOUTS__', value: `Intern: ${COIN} 150 | Trainee: ${COIN} 250 | Rookie: ${COIN} 400 | Pro: ${COIN} 600 | Star: ${COIN} 850 | Legend: ${COIN} 1200` }
    );

  await message.reply({ embeds: [embed] });
}
