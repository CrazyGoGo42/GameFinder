# GameFinder Discord Bot

A Discord bot that automatically tracks and displays free games from multiple platforms including Steam, Epic Games, GOG, and more.

## Features

- **Persistent Game Lists**: Maintains one message per server that updates every 2 hours
- **Multi-Platform Support**: Steam, Epic Games, GOG, Origin, Ubisoft, Android, iOS, PlayStation, Xbox, Nintendo Switch
- **Smart Sorting**: PC games prioritized, best deals displayed first
- **Interactive Browsing**: Use `/games` command with pagination and filtering
- **Auto-Cleanup**: Remove expired deals automatically
- **Multi-Server**: Configure different channels for each Discord server

## Commands

- `/setchannel [channel]` - Set notification channel for game updates
- `/games [platform] [min_worth]` - Browse free games with filters
- `/cleanup` - Remove expired game deals from channel

## Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd GameFinder
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your Discord bot token and client ID
   ```

3. **Run with Docker**
   ```bash
   docker compose up -d
   ```

## Configuration

### Environment Variables

- `DISCORD_TOKEN` - Discord bot token
- `CLIENT_ID` - Discord application client ID
- `RAWG_API_KEY` - RAWG API key (optional)

### Bot Permissions

The bot requires the following Discord permissions:
- Send Messages
- Embed Links
- Read Message History
- Manage Messages (for cleanup)

## How It Works

1. **Setup**: Use `/setchannel` to configure notification channel
2. **Automatic Updates**: Bot updates game list every 2 hours
3. **Persistent Messages**: Same message gets updated instead of spam
4. **Smart Recovery**: Creates new message if previous one is deleted

## Supported Platforms

- Steam, Epic Games Store, GOG
- Origin, Ubisoft Connect
- PlayStation 4/5, Xbox One/Series
- Nintendo Switch
- Android, iOS
- PC (general)

## API

Uses the [GamerPower API](https://gamerpower.com/api) to fetch free game data.

## Docker

The bot runs in a lightweight Alpine Linux container with automatic restart policies.

## License

MIT License