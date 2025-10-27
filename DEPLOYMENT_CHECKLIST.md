# Railway Deployment Checklist

Use this checklist to deploy your TabletopScribe Discord Bot to Railway.

## ✅ Pre-Deployment Checklist

### 1. GitHub Repository Setup
- [ ] Create a GitHub repository
- [ ] Push code to GitHub:
  ```bash
  git init
  git add .
  git commit -m "Initial commit"
  git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
  git push -u origin main
  ```

### 2. Gather Required Credentials
Have these ready before starting:

**Discord:**
- [ ] Discord Bot Token
- [ ] Discord Client ID

**AWS:**
- [ ] AWS Access Key ID
- [ ] AWS Secret Access Key
- [ ] AWS Region (default: `us-east-2`)
- [ ] AWS Environment (`DEV` or `DEVSORT`)

**TabletopScribe:**
- [ ] Cognito User Pool Client ID
- [ ] AppSync API Key

## 🚂 Railway Deployment Steps

### 1. Create Railway Project
- [ ] Go to https://railway.app/new
- [ ] Click "Deploy from GitHub repo"
- [ ] Authorize Railway to access GitHub
- [ ] Select your repository
- [ ] Wait for Railway to detect Node.js

### 2. Add PostgreSQL Database
- [ ] Click "+ New" in Railway project
- [ ] Select "Database" → "PostgreSQL"
- [ ] Note: `DATABASE_URL` is auto-generated

### 3. Configure Environment Variables
Go to your service → Variables tab:

**Discord Variables:**
- [ ] `DISCORD_BOT_TOKEN` = (your token)
- [ ] `DISCORD_CLIENT_ID` = (your client ID)

**AWS Variables:**
- [ ] `AWS_ACCESS_KEY_ID` = (your key)
- [ ] `AWS_SECRET_ACCESS_KEY` = (your secret)
- [ ] `AWS_REGION` = `us-east-2`
- [ ] `AWS_ENVIRONMENT` = `DEV` (or `DEVSORT`)

**TabletopScribe Variables:**
- [ ] `USER_POOL_CLIENT_ID_DEV` = (your Cognito client ID)
- [ ] `APPSYNC_API_KEY` = (your AppSync key)

**Optional:**
- [ ] `NODE_ENV` = `production`
- [ ] `PUBLIC_URL` = (leave empty for now, add after deployment)

### 4. Verify Build Settings
In Settings tab:
- [ ] Build Command: `npm run build`
- [ ] Start Command: `npm start`

### 5. Deploy
- [ ] Click "Deploy" or wait for auto-deploy
- [ ] Monitor deployment logs
- [ ] Look for success message: `✅ Discord bot logged in as...`

### 6. Configure Database
Install Railway CLI and run migrations:
```bash
npm i -g @railway/cli
railway login
railway link
railway run npm run db:push
```
- [ ] Railway CLI installed
- [ ] Logged into Railway
- [ ] Project linked
- [ ] Database schema pushed

### 7. Set Public URL
- [ ] Go to Settings → Networking
- [ ] Click "Generate Domain"
- [ ] Copy the generated URL
- [ ] Add `PUBLIC_URL` environment variable with this URL
- [ ] Redeploy (or wait for auto-deploy)

## 🧪 Testing Checklist

### Discord Bot Testing
- [ ] Bot appears online in Discord
- [ ] `/setup` command works
  - [ ] Generates a clickable link
  - [ ] Link opens login page
  - [ ] Can login successfully
- [ ] `/campaigns` command works
  - [ ] Lists campaigns after login
  - [ ] Can copy campaign commands
- [ ] `/record` command works
  - [ ] Bot joins voice channel
  - [ ] "Recording Started" message appears
  - [ ] No timeout errors
- [ ] `/stop` command works
  - [ ] Shows confirmation with buttons
  - [ ] Submit button opens modal
  - [ ] Session created successfully
  - [ ] Download button works

### Web Interface Testing
- [ ] Login page loads at `/login`
- [ ] Campaigns page shows after login
- [ ] Can copy commands to clipboard

### Database Testing
- [ ] Sessions persist across bot restarts
- [ ] Setup tokens expire after 15 minutes
- [ ] Active recordings survive reconnects

## 🔧 Troubleshooting

If something doesn't work, check:

### Bot Won't Start
- [ ] Check Railway logs for errors
- [ ] Verify all environment variables are set
- [ ] Ensure DATABASE_URL is configured

### Voice Doesn't Work
- [ ] Re-invite bot with permissions URL:
  ```
  https://discord.com/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=3146752&scope=bot%20applications.commands
  ```
- [ ] Check bot has Connect + Speak permissions
- [ ] Verify you're in a voice channel

### Authentication Fails
- [ ] Verify `PUBLIC_URL` is set correctly
- [ ] Check AWS credentials are correct
- [ ] Ensure token hasn't expired (15 min limit)

### Database Errors
- [ ] Run `railway run npm run db:push --force`
- [ ] Check PostgreSQL is running in Railway
- [ ] Verify `DATABASE_URL` format

## 📊 Post-Deployment

### Monitor Your Bot
- [ ] Check Railway logs regularly
- [ ] Monitor CPU/memory usage
- [ ] Watch for errors in Discord

### Security
- [ ] Never commit `.env` files to Git
- [ ] Rotate credentials periodically
- [ ] Keep dependencies updated

### Continuous Deployment
After initial setup, deploy updates with:
```bash
git add .
git commit -m "Your update message"
git push origin main
```
Railway will automatically deploy!

## 🎉 Success Criteria

Your bot is successfully deployed when:
- ✅ Bot shows online in Discord
- ✅ All commands work without errors
- ✅ Voice recording works (joins channel, records, uploads)
- ✅ Sessions appear in TabletopScribe
- ✅ Web authentication flows complete successfully

## 📚 Resources

- [Full Deployment Guide](./RAILWAY_DEPLOYMENT.md)
- [Railway Documentation](https://docs.railway.app)
- [Discord.js Guide](https://discordjs.guide)
- [Project README](./README.md)

## Need Help?

1. Check Railway deployment logs
2. Review bot console output
3. Verify environment variables
4. Test Discord permissions
5. Ensure database schema is current

Good luck with your deployment! 🚀
