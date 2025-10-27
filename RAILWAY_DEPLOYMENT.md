# Railway Deployment Guide

This guide will help you deploy the TabletopScribe Discord Bot to Railway, which supports UDP traffic required for Discord voice connections.

## Prerequisites

- Railway account (https://railway.app)
- GitHub account (to connect your repository)
- All required API keys and credentials (listed below)

## Step 1: Prepare Your Repository

1. **Push your code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit - TabletopScribe Discord Bot"
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```

2. **Verify these files are in your repository:**
   - `package.json` (✅ included)
   - `server/` directory with all bot code
   - `client/` directory with web interface
   - All dependencies listed in package.json

## Step 2: Create Railway Project

1. Go to https://railway.app/new
2. Click **"Deploy from GitHub repo"**
3. Authorize Railway to access your GitHub account
4. Select your repository
5. Railway will automatically detect Node.js and create a service

## Step 3: Configure Environment Variables

In the Railway dashboard, go to your service → **Variables** tab and add:

### Required Discord Variables
```
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here
```

### Required AWS Variables
```
AWS_ACCESS_KEY_ID=your_aws_access_key_here
AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key_here
AWS_REGION=us-east-2
AWS_ENVIRONMENT=DEV
```

(Change `AWS_ENVIRONMENT` to `DEVSORT` if using the DEVSORT environment)

### Required TabletopScribe API Variables
```
USER_POOL_CLIENT_ID_DEV=your_cognito_user_pool_client_id_here
APPSYNC_API_KEY=your_appsync_api_key_here
```

### Database Configuration

Railway provides PostgreSQL databases. Create one:

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"PostgreSQL"**
3. Railway will automatically create a `DATABASE_URL` variable
4. Copy the `DATABASE_URL` and add it to your bot service variables

**Note:** The `DATABASE_URL` is automatically generated and looks like:
```
postgresql://postgres:password@host:port/database
```

### Optional Variables
```
NODE_ENV=production
PUBLIC_URL=https://your-railway-app.railway.app
```

(Railway will auto-generate `PUBLIC_URL` - update this after deployment)

## Step 4: Configure Build & Start Commands

Railway should auto-detect these from `package.json`, but verify in **Settings**:

- **Build Command:** `npm run build`
- **Start Command:** `npm start`

These commands run:
- Build: `vite build && esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist`
- Start: `NODE_ENV=production node dist/index.js`

## Step 5: Run Database Migrations

After deployment, you need to push your database schema:

1. Install Railway CLI locally:
   ```bash
   npm i -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

3. Link to your project:
   ```bash
   railway link
   ```

4. Run database push:
   ```bash
   railway run npm run db:push
   ```

## Step 6: Deploy

1. Railway will automatically deploy when you push to GitHub
2. Or click **"Deploy"** in the Railway dashboard
3. Monitor the deployment logs in the **Deployments** tab

## Step 7: Get Your Public URL

1. Go to **Settings** → **Networking**
2. Click **"Generate Domain"**
3. Copy the generated URL (e.g., `https://tabletopscribe-bot-production.railway.app`)
4. Update the `PUBLIC_URL` environment variable with this URL
5. Redeploy for the change to take effect

## Step 8: Verify Deployment

1. **Check Logs:**
   - Go to the **Deployments** tab
   - Look for these success messages:
     ```
     ✅ Discord bot logged in as Scribe Uploader#XXXX
     🤖 Bot is ready and listening for commands
     ✅ Discord Bot started successfully
     ```

2. **Test Discord Commands:**
   - `/setup` - Should generate a login link
   - `/campaigns` - Should list your campaigns (after setup)
   - `/record` - Should join voice channel and start recording

## Step 9: Discord Bot Invite URL

Update your Discord bot invite URL with the correct permissions:

```
https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3146752&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your actual Discord Client ID.

**Permissions Breakdown (3146752):**
- Connect (join voice channels)
- Speak (transmit audio)
- View Channels
- Send Messages
- Use Application Commands

## Troubleshooting

### Bot Not Starting
- Check Railway logs for errors
- Verify all environment variables are set
- Ensure `DATABASE_URL` is configured

### Database Connection Issues
- Run `railway run npm run db:push` to create tables
- Verify `DATABASE_URL` format is correct
- Check PostgreSQL database is running in Railway

### Voice Connection Fails
- Railway DOES support UDP, unlike Replit
- Verify bot permissions in Discord server
- Check bot has been re-invited with correct permissions (see invite URL above)

### Authentication Not Working
- Ensure `PUBLIC_URL` is set correctly
- Verify AWS credentials are correct
- Check Cognito and AppSync configurations

## Continuous Deployment

Railway automatically deploys when you push to GitHub:

```bash
git add .
git commit -m "Update bot features"
git push origin main
```

Railway will detect the push and deploy automatically.

## Scaling & Monitoring

- **Logs:** View real-time logs in Railway dashboard
- **Metrics:** Check CPU, memory, and network usage
- **Pricing:** Railway offers $5 free credit per month
- **Scaling:** Railway automatically scales based on usage

## Environment-Specific Notes

### DEV Environment
- Uses `AWS_ENVIRONMENT=DEV`
- Points to dev Cognito pool and AppSync API

### DEVSORT Environment  
- Uses `AWS_ENVIRONMENT=DEVSORT`
- Points to DEVSORT Cognito pool and AppSync API

## Security Best Practices

1. **Never commit secrets to Git:**
   - All secrets are in Railway environment variables
   - Add `.env` to `.gitignore` (already included)

2. **Rotate credentials regularly:**
   - Discord bot token
   - AWS access keys
   - Database passwords

3. **Use Railway's secret management:**
   - All variables are encrypted at rest
   - Never exposed in logs

## Support

For Railway-specific issues:
- Documentation: https://docs.railway.app
- Discord: https://discord.gg/railway
- Status: https://status.railway.app

For bot-specific issues:
- Check application logs in Railway dashboard
- Review database schema with `railway run npm run db:push`
- Test Discord commands in your server
