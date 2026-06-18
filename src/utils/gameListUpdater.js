import GamerPowerAPI from '../api/gamerpower.js';
import { createGameListEmbeds } from './embedBuilder.js';
import { getAllChannelSettings, getChannelSettings, updatePinnedMessageId } from '../commands/setchannel.js';

const api = new GamerPowerAPI();

// Fetch the current best games and build the embed array (header + up to 9 games)
async function buildGameListEmbeds() {
    const games = await api.getFilteredGames();

    // Up to 9 game embeds to stay within Discord's 10-embed-per-message limit (header takes the 10th)
    const gameListEmbeds = createGameListEmbeds(games, 'Latest Free Games', 9);

    const headerEmbed = {
        title: 'Free Game Deals',
        description: `**${games.length} Active Deals** • Updated every 2 hours\n` +
                    `**PC games prioritized** • **Best deals first** • **Last updated: <t:${Math.floor(Date.now() / 1000)}:R>**`,
        color: 0x00ff00,
        timestamp: new Date().toISOString(),
        footer: { text: 'GameFinder Bot • Use /games for interactive browsing' }
    };

    return { games, allEmbeds: [headerEmbed, ...gameListEmbeds] };
}

// Edit the existing persistent message for one guild, or post a new one if there isn't a valid one
async function updateGuildGameList(client, guildId, settings, allEmbeds) {
    const channel = client.channels.cache.get(settings.channelId);
    if (!channel || !channel.isTextBased()) {
        console.warn(`[refresh] Guild ${guildId}: channel ${settings.channelId} not found/usable; skipping`);
        return;
    }

    // Try to fetch and update the existing message
    if (settings.pinnedMessageId) {
        try {
            const existingMessage = await channel.messages.fetch(settings.pinnedMessageId);
            await existingMessage.edit({ embeds: allEmbeds });
            console.log(`[refresh] Guild ${guildId}: edited existing message ${settings.pinnedMessageId} in #${channel.name}`);
            return;
        } catch (error) {
            console.warn(`[refresh] Guild ${guildId}: could not edit ${settings.pinnedMessageId} (${error.message}); posting new message`);
        }
    }

    // Create a new persistent message and remember its ID for future updates
    const newMessage = await channel.send({ embeds: allEmbeds });
    updatePinnedMessageId(guildId, newMessage.id);
    console.log(`[refresh] Guild ${guildId}: posted new persistent message ${newMessage.id} in #${channel.name}`);
}

// Refresh the persistent game list for every configured server
export async function updateAllGameLists(client) {
    try {
        const allChannelSettings = getAllChannelSettings();
        if (allChannelSettings.length === 0) return;

        const { games, allEmbeds } = await buildGameListEmbeds();
        console.log(`[refresh] Fetched ${games.length} active games; updating ${allChannelSettings.length} server(s)`);

        for (const [guildId, settings] of allChannelSettings) {
            try {
                await updateGuildGameList(client, guildId, settings, allEmbeds);
                // Small delay between servers to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Failed to update game list for guild ${guildId}:`, error.message);
            }
        }
    } catch (error) {
        console.error('Error updating persistent game lists:', error);
    }
}

// Refresh the persistent game list for a single server (used right after /setchannel)
export async function updateSingleGuildGameList(client, guildId) {
    try {
        const settings = getChannelSettings(guildId);
        if (!settings) return;

        const { allEmbeds } = await buildGameListEmbeds();
        await updateGuildGameList(client, guildId, settings, allEmbeds);
    } catch (error) {
        console.error(`Failed to update game list for guild ${guildId}:`, error.message);
    }
}
