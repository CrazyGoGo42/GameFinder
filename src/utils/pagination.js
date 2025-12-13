import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { createGameListEmbeds } from './embedBuilder.js';

// Store pagination data
export const paginationData = new Map();

export function createPaginationButtons(currentPage, totalPages, paginationId) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`prev_${paginationId}`)
                .setLabel('◀ Previous')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === 1),
            new ButtonBuilder()
                .setCustomId(`page_${paginationId}`)
                .setLabel(`Page ${currentPage}/${totalPages}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`next_${paginationId}`)
                .setLabel('Next ▶')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(currentPage === totalPages)
        );
    return row;
}

export async function handlePagination(interaction, action, paginationId) {
    await interaction.deferUpdate();
    
    
    const data = paginationData.get(paginationId);
    if (!data) {
        await interaction.editReply({
            content: 'Pagination data expired. Please run the command again.',
            embeds: [],
            components: []
        });
        return;
    }
    
    
    // Check if user is authorized to use these buttons
    if (data.userId !== interaction.user.id) {
        await interaction.followUp({
            content: 'You can only interact with your own search results.',
            ephemeral: true
        });
        return;
    }
    
    // Calculate new page
    let newPage = data.currentPage || 1;
    if (action === 'prev' && newPage > 1) {
        newPage--;
    } else if (action === 'next' && newPage < data.totalPages) {
        newPage++;
    }
    
    // Update stored page
    data.currentPage = newPage;
    
    // Get games for the new page
    const startIndex = (newPage - 1) * data.gamesPerPage;
    const pageGames = data.games.slice(startIndex, startIndex + data.gamesPerPage);
    const embeds = createGameListEmbeds(pageGames, data.platformName, data.gamesPerPage);
    
    // Update pagination buttons
    const components = data.totalPages > 1 ? [createPaginationButtons(newPage, data.totalPages, paginationId)] : [];
    
    await interaction.editReply({
        embeds: embeds.slice(0, 10),
        components
    });
}