import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import * as loginCommand from './commands/login';
import * as setupCommand from './commands/setup';
import * as campaignsCommand from './commands/campaigns';
import * as recordCommand from './commands/record';
import * as stopCommand from './commands/stop';

const commands = [
  loginCommand,
  setupCommand,
  campaignsCommand,
  recordCommand,
  stopCommand,
];

export class DiscordBot {
  private client: Client;
  private commands: Collection<string, any>;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
      ],
    });

    this.commands = new Collection();

    commands.forEach(command => {
      this.commands.set(command.data.name, command);
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.client.once('ready', () => {
      console.log(`✅ Discord bot logged in as ${this.client.user?.tag}`);
      console.log(`🤖 Bot is ready and listening for commands`);
    });

    this.client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      const command = this.commands.get(interaction.commandName);

      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        
        const errorMessage = 'There was an error while executing this command!';
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: errorMessage, ephemeral: true });
        } else {
          await interaction.reply({ content: errorMessage, ephemeral: true });
        }
      }
    });

    this.client.on('error', error => {
      console.error('Discord client error:', error);
    });
  }

  async registerCommands() {
    const token = process.env.DISCORD_BOT_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;

    if (!token || !clientId) {
      throw new Error('Missing DISCORD_BOT_TOKEN or DISCORD_CLIENT_ID environment variables');
    }

    const rest = new REST().setToken(token);

    const commandsData = commands.map(cmd => cmd.data.toJSON());

    try {
      console.log('🔄 Started refreshing application (/) commands.');

      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandsData }
      );

      console.log('✅ Successfully reloaded application (/) commands.');
    } catch (error) {
      console.error('Error registering commands:', error);
      throw error;
    }
  }

  async start() {
    const token = process.env.DISCORD_BOT_TOKEN;

    if (!token) {
      throw new Error('Missing DISCORD_BOT_TOKEN environment variable');
    }

    try {
      await this.registerCommands();
      await this.client.login(token);
    } catch (error) {
      console.error('Failed to start bot:', error);
      throw error;
    }
  }

  getClient() {
    return this.client;
  }
}
