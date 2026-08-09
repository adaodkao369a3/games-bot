import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
  },
  database: {
    url: process.env.DATABASE_URL || './data/bob-kun.json',
  },
  prefix: process.env.PREFIX || ',',
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.discord.botToken) {
    errors.push('DISCORD_BOT_TOKEN is required');
  }
  if (!config.discord.clientId) {
    errors.push('DISCORD_CLIENT_ID is required');
  }
  if (!config.discord.guildId) {
    errors.push('DISCORD_GUILD_ID is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
