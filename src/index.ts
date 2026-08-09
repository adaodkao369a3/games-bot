import { DiscordClient } from './discord/client.js';
import { config } from './config/index.js';

async function main(): Promise<void> {
  try {
    const client = new DiscordClient();
    await client.login();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🍌 Bob Kun is shutting down...');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🍌 Bob Kun is shutting down...');
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start Bob Kun:', error);
    process.exit(1);
  }
}

main();
