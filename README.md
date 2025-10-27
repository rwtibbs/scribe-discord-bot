# TabletopScribe Discord Bot

Record tabletop RPG sessions directly from Discord and automatically upload them to TabletopScribe for processing.

## Features

- 🎙️ **Voice Recording** - Record Discord voice channels with high-quality audio
- 🔐 **Secure Authentication** - Web-based login with TabletopScribe credentials
- 📤 **Auto-Upload** - Automatic conversion to AAC and upload to S3
- 🎯 **Campaign Integration** - Select campaigns and create sessions via GraphQL
- 💾 **Download Option** - Download recordings before submitting
- 🔄 **Session Persistence** - Credentials stored across bot restarts

## Quick Start

### Prerequisites

- Node.js 18+ or 20+
- PostgreSQL database
- Discord bot application
- AWS account (S3, Cognito)
- TabletopScribe account

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/YOUR_USERNAME/tabletopscribe-discord-bot.git
   cd tabletopscribe-discord-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` with your credentials (see Environment Variables below)

4. **Push database schema:**
   ```bash
   npm run db:push
   ```

5. **Run the bot:**
   ```bash
   npm run dev
   ```

## Environment Variables

Required variables:

```env
# Discord
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id

# AWS
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_REGION=us-east-2
AWS_ENVIRONMENT=DEV

# TabletopScribe API
USER_POOL_CLIENT_ID_DEV=your_cognito_client_id
APPSYNC_API_KEY=your_appsync_key

# Database
DATABASE_URL=postgresql://user:password@host:5432/database

# Optional
PUBLIC_URL=https://your-domain.com  # Required for production
NODE_ENV=development
```

## Deployment

**Recommended:** Deploy to Railway for full UDP support.

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for complete instructions.

### Why Railway?

- ✅ UDP support for Discord voice
- ✅ PostgreSQL database included
- ✅ Auto-deploy from GitHub
- ✅ $5/month free tier

## Discord Commands

- `/setup` - Generate login link (15-min expiry, single-use)
- `/campaigns` - List your campaigns
- `/record <campaign>` - Start recording in voice channel
- `/stop` - Stop recording and show options

## Bot Permissions

Invite URL format:
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3146752&scope=bot%20applications.commands
```

Required permissions (3146752):
- Connect to voice channels
- Speak in voice channels
- View channels
- Send messages
- Use application commands

## Project Structure

```
server/
  ├── bot/          # Discord bot implementation
  ├── lib/          # AWS integration (Cognito, S3, GraphQL)
  ├── storage.ts    # Database interface
  └── routes.ts     # Express API routes
client/
  └── src/pages/    # Web authentication UI
shared/
  └── schema.ts     # Database schema
```

## Development

```bash
# Run in development mode
npm run dev

# Type check
npm run check

# Push database schema changes
npm run db:push

# Build for production
npm run build

# Run production build
npm start
```

## How It Works

### 1. Authentication Flow
1. User runs `/setup` in Discord
2. Bot generates secure token and link
3. User clicks link and logs in via web browser
4. Credentials stored in PostgreSQL

### 2. Recording Flow
1. User joins voice channel
2. User runs `/record "Campaign Name"`
3. Bot joins channel and records audio
4. User runs `/stop` when finished
5. Bot converts PCM → AAC and uploads to S3

### 3. Session Creation
1. User clicks "Submit to TabletopScribe"
2. Enters session name in modal
3. Bot creates session via GraphQL API
4. Audio file linked to session
5. TabletopScribe processes automatically

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Discord:** discord.js, @discordjs/voice
- **Audio:** ffmpeg, opusscript
- **AWS:** Cognito, S3, AppSync GraphQL
- **Database:** PostgreSQL + Drizzle ORM
- **Frontend:** React + Vite
- **Backend:** Express

## Security

- Web-based authentication (no passwords in Discord)
- Cryptographically secure setup tokens (32 bytes)
- Time-limited access (15-minute token expiry)
- Single-use tokens prevent account hijacking
- Cognito sub for GraphQL authentication

## Limitations

### Replit Hosting
- ❌ UDP blocked on standard hosting
- ❌ Voice connections timeout
- ✅ Web features work fine

### Railway Hosting
- ✅ Full UDP support
- ✅ Voice recording works
- ✅ All features supported

## Troubleshooting

### Voice connection fails
- Verify bot has Connect + Speak permissions
- Check UDP ports (50000-65535) are accessible
- Re-invite bot with correct permissions

### Authentication not working
- Ensure `PUBLIC_URL` is set correctly
- Verify AWS credentials
- Check token hasn't expired (15 min)

### Database errors
- Run `npm run db:push` to sync schema
- Verify `DATABASE_URL` format
- Check PostgreSQL is running

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT

## Support

For issues and questions:
- Check [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for deployment help
- Review bot logs for error messages
- Verify all environment variables are set

## Links

- [Railway Documentation](https://docs.railway.app)
- [Discord.js Guide](https://discordjs.guide)
- [TabletopScribe](https://tabletopscribe.com)
