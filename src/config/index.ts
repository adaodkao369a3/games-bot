import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
  },
  prefix: process.env.PREFIX || '.',
  database: {
    url: process.env.DATABASE_URL || '',
  },
  gameFloorChannelIds: ['1542311921007460542', '1535286802871623831'],
};

/**
 * Check if a channel ID is in the allowed game floor channels
 */
export function isGameFloorChannel(channelId: string): boolean {
  return config.gameFloorChannelIds.includes(channelId);
}

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.discord.botToken) {
    errors.push('DISCORD_BOT_TOKEN is required');
  }

  if (!config.database.url) {
    errors.push('DATABASE_URL is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
