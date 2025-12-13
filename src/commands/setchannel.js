import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embedBuilder.js';
import fs from 'fs';
import path from 'path';

// Store channel settings per server
const channelSettings = new Map();

export const data = new SlashCommandBuilder()
    .setName('setchannel')
    .setDescription('Set the notification channel for new game deals')
    .addChannelOption(option =>
        option.setName('channel')
            .setDescription('Channel to receive game notifications')
            .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels);

export async function execute(interaction) {
    try {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const guildId = interaction.guild?.id;
        
        if (!guildId) {
            const errorEmbed = createErrorEmbed('This command can only be used in servers, not DMs.');
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            return;
        }

        // Check if bot has permission to send messages in the channel
        const botMember = interaction.guild.members.me;
        const permissions = channel.permissionsFor(botMember);
        
        if (!permissions.has(['SendMessages', 'EmbedLinks'])) {
            const errorEmbed = createErrorEmbed(
                `I don't have permission to send messages in ${channel}.\n` +
                'Please ensure I have "Send Messages" and "Embed Links" permissions.'
            );
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            return;
        }

        // Store the channel setting for this server
        channelSettings.set(guildId, {
            channelId: channel.id,
            pinnedMessageId: null // Will store the persistent game list message ID
        });
        
        // Save to file for persistence across restarts
        saveChannelSettings();

        const successEmbed = createSuccessEmbed(
            `Notification channel set to ${channel}.\n` +
            'A persistent game list will be maintained here, updated every 2 hours with the latest deals.'
        );
        
        await interaction.reply({ embeds: [successEmbed] });

        // Send a test message to confirm it works
        setTimeout(async () => {
            try {
                const testEmbed = createSuccessEmbed(
                    'Test notification\n' +
                    'Channel configured for game notifications.\n' +
                    'Free games will appear here automatically.'
                );
                await channel.send({ embeds: [testEmbed] });
            } catch (error) {
                console.error('Failed to send test notification:', error);
            }
        }, 2000);

    } catch (error) {
        console.error('Error setting notification channel:', error);
        const errorEmbed = createErrorEmbed('Failed to set notification channel. Please try again.');
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}

// Get the notification channel for a specific server
export function getNotificationChannel(guildId) {
    return channelSettings.get(guildId)?.channelId;
}

// Get channel settings including pinned message ID
export function getChannelSettings(guildId) {
    return channelSettings.get(guildId);
}

// Update pinned message ID for a server
export function updatePinnedMessageId(guildId, messageId) {
    const settings = channelSettings.get(guildId);
    if (settings) {
        settings.pinnedMessageId = messageId;
        channelSettings.set(guildId, settings);
        saveChannelSettings();
    }
}

// Get all notification channels (for broadcasting new deals)
export function getAllNotificationChannels() {
    return Array.from(channelSettings.entries()).map(([guildId, settings]) => [guildId, settings.channelId]);
}

// Get all channel settings
export function getAllChannelSettings() {
    return Array.from(channelSettings.entries());
}

// Save channel settings to file
function saveChannelSettings() {
    try {
        const settingsPath = path.join(process.cwd(), 'channel-settings.json');
        const settingsObject = Object.fromEntries(channelSettings);
        fs.writeFileSync(settingsPath, JSON.stringify(settingsObject, null, 2));
    } catch (error) {
        console.error('Error saving channel settings:', error);
    }
}

// Load channel settings from file
export function loadChannelSettings() {
    try {
        const settingsPath = path.join(process.cwd(), 'channel-settings.json');
        if (fs.existsSync(settingsPath)) {
            const settingsObject = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
            for (const [guildId, settings] of Object.entries(settingsObject)) {
                // Handle both old format (just channelId) and new format (object)
                if (typeof settings === 'string') {
                    channelSettings.set(guildId, { channelId: settings, pinnedMessageId: null });
                } else {
                    channelSettings.set(guildId, settings);
                }
            }
        }
    } catch (error) {
        console.error('Error loading channel settings:', error);
    }
}