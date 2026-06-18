import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { createSuccessEmbed, createErrorEmbed } from '../utils/embedBuilder.js';
import fs from 'fs';
import path from 'path';

// Store channel settings per server
const channelSettings = new Map();

// Persistent location for channel bindings
const SETTINGS_PATH = path.join(process.cwd(), 'data', 'bound-channels.json');

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
        // Acknowledge immediately so we never hit Discord's 3-second interaction limit
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const guildId = interaction.guild?.id;

        if (!guildId) {
            const errorEmbed = createErrorEmbed('This command can only be used in servers, not DMs.');
            await interaction.editReply({ embeds: [errorEmbed] });
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
            await interaction.editReply({ embeds: [errorEmbed] });
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
            'Posting the latest free games here now — the list updates in place every 2 hours.'
        );

        await interaction.editReply({ embeds: [successEmbed] });

        // Post the game list immediately so it appears right away (instead of waiting for the 2-hour cycle).
        // Dynamic import avoids a circular static import with the updater module.
        import('../utils/gameListUpdater.js')
            .then(({ updateSingleGuildGameList }) => updateSingleGuildGameList(interaction.client, guildId))
            .catch(error => console.error('Failed to post initial game list:', error));

    } catch (error) {
        console.error('Error setting notification channel:', error);
        const errorEmbed = createErrorEmbed('Failed to set notification channel. Please try again.');
        // Use editReply if we already deferred; otherwise reply. Guard against expired interactions.
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        } catch (replyError) {
            console.error('Failed to send error reply:', replyError);
        }
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

// Get all channel settings
export function getAllChannelSettings() {
    return Array.from(channelSettings.entries());
}

// Save channel settings to file
function saveChannelSettings() {
    try {
        fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
        const settingsObject = Object.fromEntries(channelSettings);
        fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settingsObject, null, 2));
    } catch (error) {
        console.error('Error saving channel settings:', error);
    }
}

// Load channel settings from file
export function loadChannelSettings() {
    try {
        if (fs.existsSync(SETTINGS_PATH)) {
            const settingsObject = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
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