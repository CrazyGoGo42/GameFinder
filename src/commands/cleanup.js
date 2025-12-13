import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embedBuilder.js';
import GamerPowerAPI from '../api/gamerpower.js';

export const data = new SlashCommandBuilder()
    .setName('cleanup')
    .setDescription('Delete expired games, keep only currently free games (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
        
        const channel = interaction.channel;
        const botId = interaction.client.user.id;
        
        
        // Create API instance directly
        const api = new GamerPowerAPI();
        
        // Fetch current free games from API
        const activeGames = await api.getFilteredGames();
        
        // Create a set of active game identifiers for matching
        const activeGameData = activeGames.map(game => ({
            title: game.title.toLowerCase().trim(),
            url: game.gamerpower_url,
            id: game.id
        }));
        
        const activeGameTitles = new Set(activeGameData.map(g => g.title));
        const activeGameUrls = new Set(activeGameData.map(g => g.url));
        
        // Fetch ALL bot messages in batches
        let allBotMessages = [];
        let lastMessageId = null;
        let batchCount = 0;
        const maxBatches = 50; // Up to 5000 messages
        
        
        while (batchCount < maxBatches) {
            const options = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }
            
            const batch = await channel.messages.fetch(options);
            
            if (batch.size === 0) break; // No more messages
            
            // Filter bot messages from this batch
            const botMessages = batch.filter(msg => msg.author.id === botId);
            allBotMessages = allBotMessages.concat([...botMessages.values()]);
            
            // Set up for next batch
            lastMessageId = batch.last().id;
            batchCount++;
            
            // Rate limit protection
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        
        if (allBotMessages.length === 0) {
            const embed = createSuccessEmbed('No bot messages found in this channel');
            return await interaction.editReply({ embeds: [embed] });
        }
        
        // Analyze messages and determine which to keep/delete
        let messagesToDelete = [];
        let messagesToKeep = [];
        
        
        for (const message of allBotMessages) {
            let shouldKeep = false;
            
            if (message.embeds.length > 0) {
                const embed = message.embeds[0];
                const embedTitle = embed.title || '';
                const embedUrl = embed.url || '';
                
                // Method 1: Check by URL (most reliable)
                if (embedUrl && activeGameUrls.has(embedUrl)) {
                    shouldKeep = true;
                } else {
                    // Method 2: Check by title matching
                    const cleanTitle = embedTitle
                        .replace(/^(HOT: |POPULAR: |HIGH VALUE: |NEW: )/i, '') // Remove quality labels
                        .replace(/\(.*?\)/g, '') // Remove platform info like "(Epic Games)"
                        .trim()
                        .toLowerCase();
                    
                    // Check exact title match
                    if (cleanTitle && activeGameTitles.has(cleanTitle)) {
                        shouldKeep = true;
                    } 
                    // Check partial title match for games with similar names
                    else if (cleanTitle) {
                        const partialMatch = activeGameData.some(game => 
                            game.title.includes(cleanTitle) || cleanTitle.includes(game.title)
                        );
                        if (partialMatch) {
                            shouldKeep = true;
                        } else {
                        }
                    }
                }
            }
            
            if (shouldKeep) {
                messagesToKeep.push(message);
            } else {
                messagesToDelete.push(message);
            }
        }
        
        
        if (messagesToDelete.length === 0) {
            const embed = createSuccessEmbed(
                `**Channel is already clean!**\\n\\n` +
                `All ${messagesToKeep.length} bot messages contain currently active games.\\n` +
                `No cleanup needed!`
            );
            return await interaction.editReply({ embeds: [embed] });
        }
        
        // Delete expired/inactive game messages
        let deletedCount = 0;
        let failedCount = 0;
        
        
        for (const message of messagesToDelete) {
            try {
                await message.delete();
                deletedCount++;
                
                if (deletedCount % 5 === 0) {
                }
                
                // Rate limit: 1 second between deletions
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                failedCount++;
                console.error(`Failed to delete message ${message.id}: ${error.message}`);
                
                if (error.message.includes('rate limit')) {
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
        
        
        const embed = createSuccessEmbed(
            `**Smart Cleanup Complete!**\\n\\n` +
            `**Deleted:** ${deletedCount} expired/inactive games\\n` +
            `**Kept:** ${messagesToKeep.length} currently free games\\n` +
            `${failedCount > 0 ? `**Failed:** ${failedCount} messages\\n` : ''}` +
            `**Channel now shows only active deals!**`
        );
        await interaction.editReply({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error in cleanup command:', error);
        const errorEmbed = createErrorEmbed('Failed to execute cleanup command. Check bot permissions.');
        
        try {
            await interaction.editReply({ embeds: [errorEmbed] });
        } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
        }
    }
}