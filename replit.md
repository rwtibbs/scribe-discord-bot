# TabletopScribe Discord Bot

A Discord bot that allows authenticated TabletopScribe users to record voice channel audio directly in Discord, then automatically upload it to TabletopScribe for processing.

## Overview

This bot integrates with your existing TabletopScribe infrastructure (AWS Cognito, S3, AppSync GraphQL) to provide seamless voice recording capabilities from Discord. Features secure web-based authentication where users authenticate via a browser (instead of typing credentials in Discord) and can copy campaign-specific commands to clipboard.

## 🚀 Deployment

**Recommended:** Deploy to **Railway** for full UDP support and reliable voice recording.

See [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md) for complete deployment instructions.

**Why Railway?**
- ✅ Full UDP support (required for Discord voice)
- ✅ PostgreSQL database included
- ✅ Automatic deployments from GitHub
- ✅ Built-in monitoring and logs
- ✅ $5/month free tier

**Replit Limitations:**
- ❌ Reserved VMs may not support outbound UDP
- ❌ Voice connections timeout after 20-30 seconds
- ✅ Web authentication works
- ✅ Database and API integrations work

## Project Structure

```
server/
  ├── bot/                      # Discord bot implementation
  │   ├── commands/            # Slash command handlers
  │   │   ├── setup.ts        # /setup command - generates secure setup link
  │   │   ├── campaigns.ts    # /campaigns command
  │   │   ├── record.ts       # /record command
  │   │   └── stop.ts         # /stop command
  │   ├── types.ts            # TypeScript interfaces
  │   ├── session-manager.ts  # Recording session tracking
  │   └── index.ts            # Bot initialization
  ├── lib/                     # AWS integration layer
  │   ├── aws-config.ts       # Multi-environment AWS config
  │   ├── auth.ts             # Cognito authentication
  │   ├── graphql.ts          # AppSync GraphQL client
  │   └── s3-upload.ts        # S3 upload helper
  ├── storage.ts              # Database storage interface
  ├── routes.ts               # Express API routes
  └── index.ts                # Server entry point
client/
  └── src/
      └── pages/
          ├── home.tsx         # Status/info page
          ├── login.tsx        # Web-based login form
          └── campaigns.tsx    # Campaign list with clipboard copy
shared/
  └── schema.ts               # Database schema (discord_sessions, setup_tokens)
```

## Features

- **Secure Web Authentication**: Users authenticate via browser using cryptographically secure, time-limited setup tokens
- **Persistent Sessions**: PostgreSQL database stores user credentials across bot restarts
- **Campaign Selection UI**: Web interface displays campaigns with clipboard copy for /record commands
- **Voice Recording**: Join Discord voice channels and record audio
- **Auto-Upload**: Convert recordings to AAC and upload to S3
- **Session Creation**: Automatically create sessions in TabletopScribe via GraphQL using Cognito sub
- **Multi-Environment**: Support for DEV and DEVSORT environments

## Discord Commands

- `/setup` - Generate secure link for web-based authentication (15-minute expiry, single-use)
- `/campaigns` - List your campaigns (requires prior /setup authentication)
- `/record <campaign-name>` - Start recording in current voice channel (requires authentication)
- `/stop` - Stop recording and upload to TabletopScribe

## Discord Bot Setup

### Required OAuth2 Permissions

The bot must be invited to your Discord server with these permissions:
- **Connect** (1048576) - Join voice channels
- **Speak** (2097152) - Transmit audio (required for voice connection)
- **View Channels** - See channels
- **Send Messages** - Respond to commands

**Bot Invite URL Format:**
```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3146752&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your Discord bot's client ID from the environment variables.

**Permission Value: 3146752** (Connect + Speak + basic permissions)

⚠️ **Important**: If you're getting "operation was aborted" errors when trying to record, the bot likely needs to be re-invited with the correct permissions using the URL above.

## Environment Variables

Required secrets (configured in Replit Secrets):
- `DISCORD_BOT_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application client ID
- `USER_POOL_CLIENT_ID_DEV` - AWS Cognito user pool client ID
- `APPSYNC_API_KEY` - AppSync API key
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key

**For Reserved VM Deployments:**
- `PUBLIC_URL` - **REQUIRED** for deployments. Set this to your deployment URL (e.g., `https://your-subdomain.replit.app`)
  - Without this, the `/setup` command will fail on deployed bots
  - Not needed in development (auto-detected)

Optional environment variables:
- `AWS_ENVIRONMENT` - Set to 'DEVSORT' for dev environment (defaults to 'DEV')
- `AWS_REGION` - AWS region (defaults to 'us-east-2')

## Tech Stack

- **Runtime**: Node.js with TypeScript
- **Discord**: discord.js, @discordjs/voice
- **Audio**: opusscript, prism-media, ffmpeg
- **AWS**: amazon-cognito-identity-js, aws-sdk
- **Frontend**: React, Vite (status page)

## Workflow

### Initial Setup (One-Time Authentication)
1. User types `/setup` command in Discord
2. Bot generates cryptographically secure token (32 bytes, 15-minute expiry)
3. Bot stores token in database and sends private link to user
4. User clicks link and is directed to web-based login page
5. Login page validates token (not expired, not previously used)
6. User enters TabletopScribe credentials
7. Backend authenticates with AWS Cognito
8. Backend stores session in database: {discordUserId, accessToken, username, cognitoSub}
9. Token is marked as used (prevents reuse/account hijacking)
10. User redirected to campaigns page showing their campaigns
11. User clicks "Copy Command" button for desired campaign
12. User pastes `/record "Campaign Name"` command into Discord

### Recording Workflow
1. User joins a voice channel and pastes `/record "Campaign Name"` (from campaigns page)
2. Bot looks up stored credentials from database using Discord user ID
3. Bot joins channel and starts recording audio
4. User types `/stop` when finished
5. Bot:
   - Saves recording to temporary file
   - Converts PCM to AAC
   - Uploads audio to S3
   - Shows confirmation with Submit/Delete/Download buttons
6. User clicks **Submit**:
   - Modal appears with pre-filled session name (editable)
   - Session created in TabletopScribe GraphQL API
   - Audio URL linked to session
   - Local and S3 files cleaned up
7. OR User clicks **Delete**:
   - S3 file and local AAC deleted
   - Recording discarded without creating session
8. TabletopScribe's existing Lambda processing takes over (if submitted)

## Recording Process

1. Audio is captured from Discord voice channel in PCM format
2. PCM is converted to AAC (96kbps mono .m4a) using ffmpeg
3. AAC file is uploaded to S3 bucket at `public/audioUploads/`
4. Session is created in GraphQL with status "UPLOADED"
5. Session appears in TabletopScribe web app for processing

## Session Management

### Authentication Sessions (PostgreSQL)
- User credentials stored persistently in `discord_sessions` table
- Each session contains: Discord user ID, Cognito access token, username, and Cognito sub
- Sessions survive bot restarts
- Used for all GraphQL API calls (campaigns, session creation)

### Setup Tokens (PostgreSQL)
- Stored in `setup_tokens` table with 15-minute expiration
- Cryptographically random (32 bytes from crypto.randomBytes)
- Single-use enforcement: marked as used after successful login
- Expired or used tokens rejected to prevent security vulnerabilities

### Recording Sessions (Database + In-Memory)
- Active recording state tracked in both database and memory for reliability
- Database persistence ensures recordings survive bot restarts
- Each session includes: Discord user ID, guild ID, channel ID, campaign info, file path, start time
- When `/stop` is called, checks database if not found in memory
- Cleared from both database and memory after `/stop` command completes upload

### Pending Uploads (Database + In-Memory with TTL)
- Processed recordings waiting for user confirmation (Submit/Delete/Download)
- Database persistence ensures pending uploads survive bot restarts
- Each entry contains: AAC file path, S3 URL, duration, campaign info, timestamps
- When buttons are clicked, checks database if not found in memory
- TTL: 30 minutes with cleanup running every 10 minutes
- Automatic cleanup deletes S3 file, local AAC, and removes from both database and memory

## Security Features

- **Cryptographic Tokens**: Setup tokens use Node.js crypto.randomBytes (32 bytes = 256 bits of entropy)
- **Time-Limited Access**: Setup tokens expire after 15 minutes
- **Single-Use Tokens**: Tokens marked as used after login, preventing reuse and account hijacking
- **No Credentials in Discord**: Users never type passwords in Discord chat
- **Cognito Sub Usage**: All GraphQL calls use Cognito sub (user ID) instead of username for proper authentication
- **Database Validation**: Every request validates session existence and token status

## Known Limitations

### Voice Recording on Replit
⚠️ **IMPORTANT: Voice recording does not work on standard Replit hosting.**

Discord voice connections require:
- **WebSocket (TCP)** - for signaling/control ✅ Works
- **UDP ports 50000-65535** - for voice data transmission ❌ Blocked by Replit

The bot will successfully join voice channels (you'll see it appear in the channel), but the voice connection times out after 20-30 seconds because UDP traffic is blocked. The connection gets stuck in "connecting" state and never reaches "ready".

**Connection State Observed:**
```
signalling → connecting → [stuck] → timeout → destroyed
```

### Solutions

1. **Deploy to Reserved VM** - Replit's Reserved VM Deployments may support UDP (not confirmed)
2. **Alternative Hosting** - Deploy to VPS (DigitalOcean, AWS EC2) or specialized Discord bot hosting (Railway, Fly.io)
3. **Hybrid Approach** - Keep web UI on Replit, run bot on UDP-compatible hosting, share the same database

All non-voice features work perfectly on Replit:
- ✅ Authentication (`/setup`)
- ✅ Campaign listing (`/campaigns`)
- ✅ Database operations
- ✅ GraphQL API integration
- ❌ Voice recording (UDP required)

## Notes

- Bot must have permission to join voice channels
- Recordings are stored temporarily and deleted after upload
- Audio quality: 48kHz, AAC 96kbps mono (.m4a format)
- Maximum recording duration: Limited by Discord/system resources
- Setup tokens automatically cleaned up when expired (consider scheduled cleanup task for production)
