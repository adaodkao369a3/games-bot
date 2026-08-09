import dotenv from 'dotenv';

dotenv.config();

export const config = {
  discord: {
    botToken: process.env.DISCORD_BOT_TOKEN || '',
    clientId: process.env.DISCORD_CLIENT_ID || '',
    guildId: process.env.DISCORD_GUILD_ID || '',
  },
  prefix: process.env.PREFIX || ',',
};

export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.discord.botToken) {
    errors.push('DISCORD_BOT_TOKEN is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }
}
