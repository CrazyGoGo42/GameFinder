import fetch from 'node-fetch';

class GamerPowerAPI {
    constructor() {
        this.baseURL = 'https://www.gamerpower.com/api';
        this.rateLimitDelay = 250; // 4 requests per second max
    }

    async sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async makeRequest(endpoint) {
        try {
            await this.sleep(this.rateLimitDelay);
            
            const response = await fetch(`${this.baseURL}${endpoint}`);
            
            if (!response.ok) {
                throw new Error(`API request failed: ${response.status}`);
            }
            
            return await response.json();
        } catch (error) {
            console.error('GamerPower API Error:', error);
            throw error;
        }
    }

    async getAllGiveaways() {
        return await this.makeRequest('/giveaways');
    }

    async getGiveawaysByPlatform(platform) {
        const validPlatforms = ['pc', 'steam', 'epic-games-store', 'ubisoft', 'gog', 'itchio', 'ps4', 'ps5', 'xbox-one', 'xbox-series-xs', 'switch', 'android', 'ios'];
        
        if (!validPlatforms.includes(platform)) {
            throw new Error(`Invalid platform. Valid platforms: ${validPlatforms.join(', ')}`);
        }
        
        return await this.makeRequest(`/giveaways?platform=${platform}`);
    }

    async getGiveawaysByType(type) {
        const validTypes = ['game', 'loot', 'beta'];
        
        if (!validTypes.includes(type)) {
            throw new Error(`Invalid type. Valid types: ${validTypes.join(', ')}`);
        }
        
        return await this.makeRequest(`/giveaways?type=${type}`);
    }

    async getGiveawayById(id) {
        return await this.makeRequest(`/giveaway?id=${id}`);
    }

    async getWorthStats() {
        return await this.makeRequest('/worth');
    }

    async getFilteredGames(platform = null, type = 'game') {
        let games;
        
        if (platform) {
            games = await this.getGiveawaysByPlatform(platform);
        } else {
            games = await this.getAllGiveaways();
        }

        const activeGames = games.filter(game => 
            game.type.toLowerCase() === type.toLowerCase() && 
            game.status === 'Active'
        );

        // Sort by best deals first
        return this.sortGamesByBestDeals(activeGames, platform);
    }

    // Sort games by best deals using smart scoring system
    sortGamesByBestDeals(games, platform = null) {
        return games.sort((a, b) => {
            const aScore = this.calculateGameScore(a);
            const bScore = this.calculateGameScore(b);
            return bScore - aScore; // Higher score first
        });
    }

    // Calculate smart game score combining worth, popularity, PC platform, and recency
    calculateGameScore(game) {
        let score = 0;
        
        // 1. Worth Score (major factor) - $50+ games get massive boost
        const worth = this.parseWorthValue(game.worth);
        if (worth >= 50) score += 1000; // AAA games like Hogwarts Legacy
        else if (worth >= 20) score += 500; // Mid-tier games
        else if (worth >= 10) score += 200; // Indie games with decent value
        else if (worth > 0) score += 50;   // Small value games
        
        // 2. PC Platform Bonus (important for PC gamers)
        if (this.isPCPlatform(game.platforms)) score += 300;
        
        // 3. Popularity Score (normalized to prevent dominance of old games)
        const users = parseInt(game.users) || 0;
        if (users > 100000) score += 200;
        else if (users > 50000) score += 150;
        else if (users > 20000) score += 100;
        else if (users > 5000) score += 50;
        
        // 4. Recency Bonus (newer games get boost)
        const publishDate = new Date(game.published_date);
        const now = new Date();
        const daysDiff = (now - publishDate) / (1000 * 60 * 60 * 24);
        
        if (daysDiff <= 1) score += 100;      // New today
        else if (daysDiff <= 3) score += 50;  // New this week
        else if (daysDiff <= 7) score += 25;  // New this week
        
        // 5. Bonus for Epic/Steam major releases
        if (game.platforms?.toLowerCase().includes('epic') && worth >= 40) {
            score += 200; // Epic freebies of AAA games are always hot
        }
        if (game.platforms?.toLowerCase().includes('steam') && worth >= 30) {
            score += 150; // Steam deals of good games
        }
        
        return score;
    }

    // Check if platform is PC-related
    isPCPlatform(platforms) {
        if (!platforms) return false;
        const platformLower = platforms.toLowerCase();
        const pcPlatforms = ['pc', 'steam', 'epic', 'gog', 'origin', 'ubisoft', 'battlenet', 'drm-free'];
        return pcPlatforms.some(platform => platformLower.includes(platform));
    }

    // Parse worth value to number for sorting
    parseWorthValue(worth) {
        if (!worth || worth === 'N/A' || worth === 'Free') return 0;
        
        const numericValue = parseFloat(worth.replace(/[^0-9.]/g, ''));
        return isNaN(numericValue) ? 0 : numericValue;
    }
}

export default GamerPowerAPI;