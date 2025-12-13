import { Client, GatewayIntentBits, Collection, REST, Routes } from 'discord.js';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import GamerPowerAPI from './src/api/gamerpower.js';
import { createGameEmbed } from './src/utils/embedBuilder.js';
import { handlePagination } from './src/utils/pagination.js';
import { loadChannelSettings, getAllChannelSettings, updatePinnedMessageId } from './src/commands/setchannel.js';
import { createGameListEmbeds } from './src/utils/embedBuilder.js';

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
const api = new GamerPowerAPI();
let lastNotifiedGames = new Set();

async function updatePersistentGameLists() {
    try {
        
        // Get all configured channels
        const allChannelSettings = getAllChannelSettings();
        if (allChannelSettings.length === 0) {
            return;
        }
        
        // Get current active games with smart sorting
        const games = await api.getFilteredGames();
        
        // Create embeds for the game list (up to 9 games to fit Discord's 10 embed limit)
        const gameListEmbeds = createGameListEmbeds(games, 'Latest Free Games', 9);
        
        // Add a header embed with last updated time
        const headerEmbed = {
            title: 'Free Game Deals',
            description: `**${games.length} Active Deals** • Updated every 2 hours\n` +
                        `**PC games prioritized** • **Best deals first** • **Last updated: <t:${Math.floor(Date.now() / 1000)}:R>**`,
            color: 0x00ff00,
            timestamp: new Date().toISOString(),
            footer: { text: 'GameFinder Bot • Use /games for interactive browsing' }
        };
        
        // Combine header with game embeds
        const allEmbeds = [headerEmbed, ...gameListEmbeds];
        
        // Update each server's persistent game list
        for (const [guildId, settings] of allChannelSettings) {
            try {
                const channel = client.channels.cache.get(settings.channelId);
                if (!channel || !channel.isTextBased()) continue;
                
                
                // Try to fetch and update existing message
                if (settings.pinnedMessageId) {
                    try {
                        const existingMessage = await channel.messages.fetch(settings.pinnedMessageId);
                        await existingMessage.edit({ embeds: allEmbeds });
                        continue;
                    } catch (error) {
                    }
                }
                
                // Create new persistent message
                const newMessage = await channel.send({ embeds: allEmbeds });
                
                // Store the message ID for future updates
                updatePinnedMessageId(guildId, newMessage.id);
                
                
                // Small delay between servers
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`Failed to update game list for guild ${guildId}:`, error.message);
            }
        }
        
        
    } catch (error) {
        console.error('Error updating persistent game lists:', error);
    }
}

async function performAutomaticCleanup() {
    try {
        
        // Get all configured notification channels
        const notificationChannels = getAllNotificationChannels();
        if (notificationChannels.length === 0) return;
        
        // Get current active games for comparison
        const activeGames = await api.getFilteredGames();
        let totalDeleted = 0;
        let totalChecked = 0;
        
        // Clean up each configured channel
        for (const [guildId, channelId] of notificationChannels) {
            try {
                const channel = client.channels.cache.get(channelId);
                if (!channel || !channel.isTextBased()) continue;
                
                
                let deletedCount = 0;
                let checkedCount = 0;
                let lastMessage;
                const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
                
                while (true) {
                    const messages = await channel.messages.fetch({
                        limit: 50, // Smaller batches for multiple channels
                        before: lastMessage?.id
                    });
                    
                    if (messages.size === 0) break;
                    
                    for (const message of messages.values()) {
                        checkedCount++;
                        
                        // Stop if message is older than 7 days
                        if (message.createdTimestamp < sevenDaysAgo) {
                            break;
                        }
                        
                        // Skip non-bot messages
                        if (message.author.id !== client.user.id) continue;
                        
                        // Check if message is about a deal that's no longer active
                        const embed = message.embeds[0];
                        if (embed && embed.url) {
                            const isStillActive = activeGames.some(game => 
                                embed.url.includes(game.gamerpower_url) || 
                                embed.title?.includes(game.title)
                            );
                            
                            if (!isStillActive) {
                                await message.delete().catch(() => {}); // Ignore errors
                                deletedCount++;
                                
                                // Small delay to avoid rate limits
                                await new Promise(resolve => setTimeout(resolve, 300));
                            }
                        }
                    }
                    
                    lastMessage = messages.last();
                    if (lastMessage?.createdTimestamp < sevenDaysAgo) break;
                    
                    // Delay between batches
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                
                totalDeleted += deletedCount;
                totalChecked += checkedCount;
                
            } catch (error) {
                console.error(`Cleanup failed for channel ${channelId}:`, error.message);
            }
            
            // Delay between servers to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        
    } catch (error) {
        console.error('Error during automatic cleanup:', error);
    }
}

function startNotificationService() {
    // Update persistent game lists every 2 hours
    const interval = 2 * 60 * 60 * 1000; // 2 hours
    
    
    // Update immediately on start
    setTimeout(updatePersistentGameLists, 10000); // Wait 10 seconds after bot starts
    
    // Update persistent lists every 2 hours
    setInterval(updatePersistentGameLists, interval);
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