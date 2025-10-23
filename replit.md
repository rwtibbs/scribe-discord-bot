# TabletopScribe Discord Bot

A Discord bot that allows authenticated TabletopScribe users to record voice channel audio directly in Discord, then automatically upload it to TabletopScribe for processing.

## Overview

This bot integrates with your existing TabletopScribe infrastructure (AWS Cognito, S3, AppSync GraphQL) to provide seamless voice recording capabilities from Discord.

## Project Structure

```
server/
  ├── bot/                      # Discord bot implementation
  │   ├── commands/            # Slash command handlers
  │   │   ├── login.ts        # /login command
  │   │   ├── campaigns.ts    # /campaigns command
  │   │   ├── record.ts       # /record command
  │   │   └── stop.ts         # /stop command
  │   ├── types.ts            # TypeScript interfaces
  │   ├── session-manager.ts  # In-memory session storage
  │   └── index.ts            # Bot initialization
  ├── lib/                     # AWS integration layer
  │   ├── aws-config.ts       # Multi-environment AWS config
  │   ├── auth.ts             # Cognito authentication
  │   ├── graphql.ts          # AppSync GraphQL client
  │   └── s3-upload.ts        # S3 upload helper
  └── index.ts                # Server entry point
client/
  └── src/
      └── pages/
          └── home.tsx         # Status/info page
```

## Features

- **Authentication**: Users authenticate with their TabletopScribe AWS Cognito credentials
- **Campaign Management**: Fetch and display user's campaigns via GraphQL
- **Voice Recording**: Join Discord voice channels and record audio
- **Auto-Upload**: Convert recordings to MP3 and upload to S3
- **Session Creation**: Automatically create sessions in TabletopScribe via GraphQL
- **Multi-Environment**: Support for DEV and DEVSORT environments

## Discord Commands

- `/login <username> <password>` - Authenticate with TabletopScribe
- `/campaigns` - List your campaigns
- `/record <campaign-name>` - Start recording in current voice channel
- `/stop` - Stop recording and upload to TabletopScribe

## Environment Variables

Required secrets (configured in Replit Secrets):
- `DISCORD_BOT_TOKEN` - Discord bot token
- `DISCORD_CLIENT_ID` - Discord application client ID
- `USER_POOL_CLIENT_ID_DEV` - AWS Cognito user pool client ID
- `APPSYNC_API_KEY` - AppSync API key
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret access key

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

1. User authenticates with `/login` command
2. Bot stores their Cognito access token in memory
3. User joins a voice channel and types `/record "Campaign Name"`
4. Bot joins channel and starts recording audio
5. User types `/stop` when finished
6. Bot:
   - Saves recording to temporary file
   - Converts PCM to MP3
   - Creates session in GraphQL
   - Uploads audio to S3
   - Updates session with audio URL
   - Sends confirmation message
7. TabletopScribe's existing Lambda processing takes over

## Recording Process

1. Audio is captured from Discord voice channel in PCM format
2. PCM is converted to MP3 using ffmpeg
3. MP3 is uploaded to S3 bucket at `public/audioUploads/`
4. Session is created in GraphQL with status "UPLOADED"
5. Session appears in TabletopScribe web app for processing

## Session Management

- User sessions stored in-memory with access tokens
- Recording sessions track active recordings
- Sessions cleared when user logs out or bot restarts
- For production: Consider Redis or database for persistent storage

## Notes

- Bot must have permission to join voice channels
- Recordings are stored temporarily and deleted after upload
- Audio quality: 48kHz, 2 channels, MP3 192kbps
- Maximum recording duration: Limited by Discord/system resources
