import { DiscordClient } from './discord/client.js';
import { config } from './config/index.js';
import { connect, disconnect } from './database/client.js';

async function main(): Promise<void> {
  try {
    // Connect to database
    await connect();

    const client = new DiscordClient();
    await client.login();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n<:bob:1545141387656302663> Bob Kun is shutting down...');
      await disconnect();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n<:bob:1545141387656302663> Bob Kun is shutting down...');
      await disconnect();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start Bob Kun:', error);
    await disconnect();
    process.exit(1);
  }
}

main();
