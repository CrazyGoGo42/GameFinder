import { EmbedBuilder } from 'discord.js';

// Platform indicators (clean text)
const platformNames = {
    'steam': 'Steam',
    'epic-games-store': 'Epic Games',
    'epic games store': 'Epic Games',
    'gog': 'GOG',
    'ubisoft': 'Ubisoft',
    'origin': 'Origin',
    'battlenet': 'Battle.net',
    'ps4': 'PlayStation 4',
    'ps5': 'PlayStation 5',
    'playstation': 'PlayStation',
    'xbox-one': 'Xbox One',
    'xbox-series-xs': 'Xbox Series X/S',
    'xbox': 'Xbox',
    'switch': 'Nintendo Switch',
    'nintendo switch': 'Nintendo Switch',
    'pc': 'PC',
    'android': 'Android',
    'ios': 'iOS',
    'mobile': 'Mobile',
    'vr': 'VR',
    'itchio': 'itch.io',
    'drm-free': 'DRM-Free'
};

// Get clean platform name
function getPlatformName(platform) {
    if (!platform) return 'PC';
    const platformLower = platform.toLowerCase();
    
    // Check for exact matches first
    if (platformNames[platformLower]) {
        return platformNames[platformLower];
    }
    
    // Check for partial matches
    for (const [key, name] of Object.entries(platformNames)) {
        if (platformLower.includes(key)) {
            return name;
        }
    }
    
    return platform; // Return original if no match
}

// Convert USD to EUR (approximate)
function convertToEur(usdString) {
    if (!usdString || usdString === 'N/A' || usdString === 'Free') return usdString;
    
    const usdAmount = parseFloat(usdString.replace(/[^0-9.]/g, ''));
    if (isNaN(usdAmount)) return usdString;
    
    const eurAmount = (usdAmount * 0.85).toFixed(2); // Approximate conversion
    return `€${eurAmount}`;
}

// Check if platform is PC-related
function isPCPlatform(platforms) {
    if (!platforms) return false;
    const platformLower = platforms.toLowerCase();
    const pcPlatforms = ['pc', 'steam', 'epic', 'gog', 'origin', 'ubisoft', 'battlenet', 'drm-free'];
    return pcPlatforms.some(platform => platformLower.includes(platform));
}

// Get platform type indicator for footer
function getPlatformTypeIndicator(platforms) {
    if (!platforms) return 'Multi-Platform';
    
    const platformLower = platforms.toLowerCase();
    
    if (isPCPlatform(platforms)) return 'PC';
    if (platformLower.includes('android')) return 'Android';
    if (platformLower.includes('ios')) return 'iOS';
    if (platformLower.includes('ps4') || platformLower.includes('ps5') || platformLower.includes('playstation')) return 'PlayStation';
    if (platformLower.includes('xbox')) return 'Xbox';
    if (platformLower.includes('switch') || platformLower.includes('nintendo')) return 'Nintendo';
    
    return 'Multi-Platform';
}

// Smart scoring function for consistent quality indicators
function calculateSmartScore(game) {
    let score = 0;
    const worth = parseFloat(game.worth?.replace(/[^0-9.]/g, '')) || 0;
    const users = parseInt(game.users) || 0;
    
    // Worth score (major factor)
    if (worth >= 50) score += 1000; // AAA games like Hogwarts Legacy
    else if (worth >= 20) score += 500; // Mid-tier games
    else if (worth >= 10) score += 200; // Indie games with decent value
    else if (worth > 0) score += 50;   // Small value games
    
    // PC Platform bonus
    if (isPCPlatform(game.platforms)) score += 300;
    
    // Popularity score
    if (users > 100000) score += 200;
    else if (users > 50000) score += 150;
    else if (users > 20000) score += 100;
    else if (users > 5000) score += 50;
    
    // Recency bonus
    const publishDate = new Date(game.published_date);
    const now = new Date();
    const daysDiff = (now - publishDate) / (1000 * 60 * 60 * 24);
    
    if (daysDiff <= 1) score += 100;
    else if (daysDiff <= 3) score += 50;
    else if (daysDiff <= 7) score += 25;
    
    // Epic/Steam major release bonus
    if (game.platforms?.toLowerCase().includes('epic') && worth >= 40) {
        score += 200; // Epic freebies of AAA games are always hot
    }
    if (game.platforms?.toLowerCase().includes('steam') && worth >= 30) {
        score += 150;
    }
    
    return score;
}

export function createGameEmbed(game) {
    const platformName = getPlatformName(game.platforms);
    const worthValue = convertToEur(game.worth);
    const users = parseInt(game.users) || 0;
    const worth = parseFloat(game.worth?.replace(/[^0-9.]/g, '')) || 0;
    
    // Add quality indicators using smart scoring
    let titlePrefix = '';
    const gameScore = calculateSmartScore(game);
    
    if (gameScore >= 1200 || worth >= 50) titlePrefix = 'HOT: ';
    else if (gameScore >= 800 || users > 50000) titlePrefix = 'POPULAR: ';
    else if (worth >= 20) titlePrefix = 'HIGH VALUE: ';
    
    // Set color based on smart scoring
    let color = '#0099ff'; // Default blue
    if (gameScore >= 1200 || worth >= 50) color = '#ff6b6b'; // Red for hot deals
    else if (gameScore >= 800 || users > 50000) color = '#ffa500'; // Orange for popular
    else if (isPCPlatform(game.platforms)) color = '#00ff00'; // Green for PC
    
    const embed = new EmbedBuilder()
        .setTitle(`${titlePrefix}${game.title}`)
        .setDescription(game.description || 'No description available')
        .setColor(color)
        .setThumbnail(game.image || null)
        .addFields(
            { name: 'Platform', value: platformName, inline: true },
            { name: 'Worth', value: worthValue || 'Free', inline: true },
            { name: 'Popularity', value: `${users.toLocaleString()} users`, inline: true }
        )
        .setURL(game.open_giveaway_url || game.gamerpower_url)
        .setTimestamp()
        .setFooter({ text: 'GameFinder Bot powered by GamerPower API' });

    if (game.end_date && game.end_date !== 'N/A') {
        embed.addFields({ name: 'Ends', value: game.end_date, inline: true });
    }

    if (game.instructions) {
        embed.addFields({ name: 'Instructions', value: game.instructions.length > 1024 ? game.instructions.substring(0, 1021) + '...' : game.instructions });
    }

    return embed;
}

export function createGameListEmbeds(games, platform = 'All Platforms', maxGames = 9) {
    if (games.length === 0) {
        const embed = new EmbedBuilder()
            .setTitle(`Free Games - ${platform}`)
            .setDescription('No free games available at the moment.')
            .setColor('#0099ff')
            .setTimestamp()
            .setFooter({ text: 'GameFinder Bot' });
        return [embed];
    }

    const gamesToShow = games.slice(0, maxGames);
    const embeds = [];
    
    // Create individual embed for each game
    gamesToShow.forEach((game, index) => {
        const platformName = getPlatformName(game.platforms);
        const worthValue = convertToEur(game.worth);
        
        const users = parseInt(game.users) || 0;
        const worth = parseFloat(game.worth?.replace(/[^0-9.]/g, '')) || 0;
        
        // Add quality indicators using smart scoring
        let titlePrefix = '';
        const gameScore = calculateSmartScore(game);
        
        if (gameScore >= 1200 || worth >= 50) titlePrefix = 'HOT: ';
        else if (gameScore >= 800 || users > 50000) titlePrefix = 'POPULAR: ';
        else if (worth >= 20) titlePrefix = 'HIGH VALUE: ';
        
        // Set color based on smart scoring
        let color = '#0099ff';
        if (gameScore >= 1200 || worth >= 50) color = '#ff6b6b';
        else if (gameScore >= 800 || users > 50000) color = '#ffa500';
        else if (isPCPlatform(game.platforms)) color = '#00ff00';
        
        const embed = new EmbedBuilder()
            .setTitle(`${titlePrefix}${game.title}`)
            .setColor(color)
            .setThumbnail(game.image || null)
            .addFields(
                { name: 'Worth', value: worthValue || 'Free', inline: true },
                { name: 'Platform', value: platformName, inline: true },
                { name: 'Popularity', value: `${users.toLocaleString()} users`, inline: true }
            )
            .setURL(game.open_giveaway_url || game.gamerpower_url);
            
        // Add end date if available
        if (game.end_date && game.end_date !== 'N/A') {
            embed.addFields({ name: 'Ends', value: game.end_date, inline: true });
        }
        
        // Add description if it's not too long
        if (game.description && game.description.length <= 200) {
            embed.setDescription(game.description);
        }
        
        // Add footer with context and platform indicator for multiple games
        if (gamesToShow.length > 1) {
            const platformIndicator = getPlatformTypeIndicator(game.platforms);
            embed.setFooter({ text: `${platformIndicator} Game ${index + 1} of ${Math.min(games.length, maxGames)} • ${platform}` });
        } else {
            embed.setFooter({ text: `GameFinder Bot • ${platform}` });
        }
        
        embed.setTimestamp();
        embeds.push(embed);
    });
    
    // Add summary embed only if there are significantly more games and we have room
    if (games.length > maxGames && embeds.length < 9 && games.length > maxGames + 2) {
        const summaryEmbed = new EmbedBuilder()
            .setTitle(`More Games Available`)
            .setDescription(`Showing ${maxGames} of ${games.length} games from ${platform}.\nUse platform-specific commands for more results.`)
            .setColor('#ffa500')
            .setFooter({ text: 'GameFinder Bot' })
            .setTimestamp();
        embeds.push(summaryEmbed);
    }
    
    return embeds;
}

// Keep the old function name for backwards compatibility
export function createGameListEmbed(games, platform = 'All Platforms', maxGames = 5) {
    const embeds = createGameListEmbeds(games, platform, maxGames);
    return embeds[0]; // Return first embed for single embed usage
}

export function createErrorEmbed(message) {
    return new EmbedBuilder()
        .setTitle('Error')
        .setDescription(message)
        .setColor('#ff0000')
        .setTimestamp()
        .setFooter({ text: 'GameFinder Bot' });
}

export function createSuccessEmbed(message) {
    return new EmbedBuilder()
        .setTitle('Success')
        .setDescription(message)
        .setColor('#00ff00')
        .setTimestamp()
        .setFooter({ text: 'GameFinder Bot' });
}