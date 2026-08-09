import { REST, Routes } from 'discord.js';
import { config, validateConfig } from '../config/index.js';
import { smashCommand } from '../commands/smash.js';

async function registerCommands(): Promise<void> {
  try {
    validateConfig();

    const commands = [
      smashCommand.toJSON(),
    ];

    const rest = new REST().setToken(config.discord.botToken);

    console.log('Started refreshing application (/) commands.');

    // Register commands for a specific guild (faster for development)
    if (config.discord.guildId) {
      await rest.put(
        Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
        { body: commands }
      );
      console.log('Successfully registered guild commands.');
    } else {
      // Register global commands (takes up to 1 hour to propagate)
      await rest.put(
        Routes.applicationCommands(config.discord.clientId),
        { body: commands }
      );
      console.log('Successfully registered global commands.');
    }

  } catch (error) {
    console.error('Error registering commands:', error);
    process.exit(1);
  }
}

registerCommands();
