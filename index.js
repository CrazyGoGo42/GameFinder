import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handlePagination } from './src/utils/pagination.js';
import { loadChannelSettings } from './src/commands/setchannel.js';
import { updateAllGameLists } from './src/utils/gameListUpdater.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'src', 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

const commands = [];

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = await import(`file://${filePath}`);
    
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
    } else {
    }
}

// Deploy commands
async function deployCommands() {
    try {
        const rest = new REST().setToken(process.env.DISCORD_TOKEN);
        
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
    } catch (error) {
        console.error('Error deploying commands:', error);
    }
}

client.once('ready', async () => {
    console.log(`Bot ready. Logged in as ${client.user.tag}`);
    
    await deployCommands();
    
    // Load channel settings from file
    loadChannelSettings();
    
    // Start notification service
    startNotificationService();
});

client.on('interactionCreate', async interaction => {
    // Handle slash commands
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        
        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }
        
        try {
            await command.execute(interaction);
        } catch (error) {
            console.error('Error executing command:', error);
            
            // Don't try to respond if it's an unknown interaction error
            if (error.message?.includes('Unknown interaction')) {
                    return;
            }
            
            try {
                const reply = {
                    content: 'There was an error while executing this command!',
                    ephemeral: true
                };
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(reply);
                } else {
                    await interaction.reply(reply);
                }
            } catch (replyError) {
                console.error('Failed to send error reply:', replyError);
            }
        }
    }
    
    // Handle button interactions for pagination
    if (interaction.isButton()) {
        const customId = interaction.customId;
        
        if (customId.startsWith('prev_') || customId.startsWith('next_')) {
            const [action, ...paginationIdParts] = customId.split('_');
            const paginationId = paginationIdParts.join('_'); // Rejoin in case ID has underscores
            
            
            try {
                await handlePagination(interaction, action, paginationId);
            } catch (error) {
                console.error('Error handling pagination:', error);
                try {
                    await interaction.reply({ 
                        content: 'Error handling pagination. Please try the command again.', 
                        ephemeral: true 
                    });
                } catch (replyError) {
                    console.error('Failed to send pagination error reply:', replyError);
                }
            }
        }
    }
});

// Notification service
function startNotificationService() {
    // Update persistent game lists every 2 hours
    const interval = 2 * 60 * 60 * 1000; // 2 hours

    // Update shortly after the bot starts (give the gateway time to cache channels)
    setTimeout(() => updateAllGameLists(client), 10000);

    // Update persistent lists every 2 hours
    setInterval(() => updateAllGameLists(client), interval);
}

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
    // Don't exit on interaction errors
    if (!error.message?.includes('Unknown interaction')) {
        console.error('This is a critical error, but continuing...');
    }
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    // Don't exit on Discord interaction errors
    if (error.message?.includes('Unknown interaction')) {
        return;
    }
    process.exit(1);
});

// Login to Discord
if (!process.env.DISCORD_TOKEN) {
    console.error('DISCORD_TOKEN not found in environment variables!');
    process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);