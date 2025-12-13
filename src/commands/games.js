import { SlashCommandBuilder } from 'discord.js';
import GamerPowerAPI from '../api/gamerpower.js';
import { createGameListEmbeds, createErrorEmbed } from '../utils/embedBuilder.js';
import { paginationData, createPaginationButtons } from '../utils/pagination.js';

const api = new GamerPowerAPI();

// Organize games by platform priority: PC first, then mobile, then consoles
function organizeGamesByPlatformPriority(allGames) {
    const platformGroups = {
        pc: [],
        android: [],
        ios: [],
        playstation: [],
        xbox: [],
        nintendo: [],
        other: []
    };
    
    // Categorize games by platform
    allGames.forEach(game => {
        const platforms = game.platforms?.toLowerCase() || '';
        
        if (isPCPlatform(platforms)) {
            platformGroups.pc.push(game);
        } else if (platforms.includes('android')) {
            platformGroups.android.push(game);
        } else if (platforms.includes('ios')) {
            platformGroups.ios.push(game);
        } else if (platforms.includes('ps4') || platforms.includes('ps5') || platforms.includes('playstation')) {
            platformGroups.playstation.push(game);
        } else if (platforms.includes('xbox')) {
            platformGroups.xbox.push(game);
        } else if (platforms.includes('switch') || platforms.includes('nintendo')) {
            platformGroups.nintendo.push(game);
        } else {
            platformGroups.other.push(game);
        }
    });
    
    // Sort each platform group by best deals
    Object.keys(platformGroups).forEach(platform => {
        platformGroups[platform] = api.sortGamesByBestDeals(platformGroups[platform]);
    });
    
    // Combine in priority order: PC → Android → iOS → PlayStation → Xbox → Nintendo → Other
    return [
        ...platformGroups.pc,
        ...platformGroups.android,
        ...platformGroups.ios,
        ...platformGroups.playstation,
        ...platformGroups.xbox,
        ...platformGroups.nintendo,
        ...platformGroups.other
    ];
}

// Helper function to check if platform is PC-related
function isPCPlatform(platforms) {
    if (!platforms) return false;
    const pcPlatforms = ['pc', 'steam', 'epic', 'gog', 'origin', 'ubisoft', 'battlenet', 'drm-free'];
    return pcPlatforms.some(platform => platforms.includes(platform));
}

export const data = new SlashCommandBuilder()
    .setName('games')
    .setDescription('Get free games')
    .addStringOption(option =>
        option.setName('platform')
            .setDescription('Filter by platform')
            .setRequired(false)
            .addChoices(
                { name: 'All Platforms', value: 'all' },
                { name: 'All PC Games', value: 'pc-all' },
                { name: 'Steam', value: 'steam' },
                { name: 'Epic Games', value: 'epic-games-store' },
                { name: 'GOG', value: 'gog' },
                { name: 'Ubisoft', value: 'ubisoft' },
                { name: 'Origin', value: 'origin' },
                { name: 'Android', value: 'android' },
                { name: 'iOS', value: 'ios' },
                { name: 'PlayStation', value: 'ps4' },
                { name: 'Xbox', value: 'xbox-one' },
                { name: 'Nintendo Switch', value: 'switch' }
            )
    )
    .addIntegerOption(option =>
        option.setName('min_worth')
            .setDescription('Minimum game worth in USD (e.g., 10 for games worth $10+)')
            .setRequired(false)
            .setMinValue(1)
            .setMaxValue(100)
    );

export async function execute(interaction) {
    const platform = interaction.options.getString('platform') || 'all';
    const minWorth = interaction.options.getInteger('min_worth');
    
    try {
        await interaction.deferReply();
        
        let games;
        let platformName = 'All Platforms';
        
        if (platform === 'all') {
            // Get all games and organize by platform priority
            games = await api.getFilteredGames();
            games = organizeGamesByPlatformPriority(games);
            platformName = 'All Platforms (PC First)';
        } else if (platform === 'pc-all') {
            // Get all games and filter for PC platforms
            games = await api.getFilteredGames();
            games = games.filter(game => {
                const platforms = game.platforms?.toLowerCase() || '';
                const pcPlatforms = ['pc', 'steam', 'epic', 'gog', 'origin', 'ubisoft', 'battlenet', 'drm-free'];
                return pcPlatforms.some(pcPlatform => platforms.includes(pcPlatform));
            });
            platformName = 'All PC Games';
        } else {
            games = await api.getFilteredGames(platform);
            platformName = interaction.options.getString('platform');
        }
        
        // Apply worth filter if specified
        if (minWorth) {
            games = games.filter(game => {
                if (!game.worth || game.worth === 'N/A') return false;
                const worth = parseFloat(game.worth.replace(/[^\\d.]/g, ''));
                return worth >= minWorth;
            });
            platformName += ` (Min $${minWorth})`;
        }
        
        // Pagination setup
        const gamesPerPage = 9;
        const totalPages = Math.ceil(games.length / gamesPerPage);
        const currentPage = 1;
        
        // Store pagination data
        const paginationId = `games_${interaction.user.id}_${Date.now()}`;
        
        
        paginationData.set(paginationId, {
            games,
            platformName,
            gamesPerPage,
            totalPages,
            currentPage: 1,
            userId: interaction.user.id
        });
        
        // Get current page games and embeds
        const startIndex = (currentPage - 1) * gamesPerPage;
        const pageGames = games.slice(startIndex, startIndex + gamesPerPage);
        const embeds = createGameListEmbeds(pageGames, platformName, gamesPerPage);
        
        // Create pagination buttons if needed
        const components = totalPages > 1 ? [createPaginationButtons(currentPage, totalPages, paginationId)] : [];
        
        
        await interaction.editReply({ 
            embeds: embeds.slice(0, 10),
            components
        });
        
        // Clean up pagination data after 30 minutes (increased from 10)
        setTimeout(() => {
            paginationData.delete(paginationId);
        }, 1800000); // 30 minutes
        
    } catch (error) {
        console.error('Error fetching games:', error);
        const errorEmbed = createErrorEmbed('Failed to fetch free games. Please try again later.');
        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

