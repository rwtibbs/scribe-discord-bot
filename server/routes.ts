import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AuthService } from "./lib/auth";
import { graphqlClient } from "./lib/graphql";
import { randomBytes } from "crypto";

export async function registerRoutes(app: Express): Promise<Server> {
  // Create setup token endpoint
  app.post("/api/auth/create-setup-token", async (req, res) => {
    try {
      const { discordUserId } = req.body;

      if (!discordUserId) {
        return res.status(400).json({ error: "Missing discordUserId" });
      }

      // Generate secure token (32 bytes = 64 hex characters)
      const token = randomBytes(32).toString('hex');
      
      // Token expires in 15 minutes
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await storage.createSetupToken({
        token,
        discordUserId,
        expiresAt,
      });

      res.json({ token });
    } catch (error) {
      console.error("Create setup token error:", error);
      res.status(500).json({ error: "Failed to create setup token" });
    }
  });

  // Authentication endpoint - login via web UI
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password, token } = req.body;

      if (!username || !password || !token) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Validate setup token
      const setupToken = await storage.getSetupToken(token);

      if (!setupToken) {
        return res.status(401).json({ error: "Invalid or expired setup link. Please use /setup in Discord to get a new link." });
      }

      if (setupToken.used) {
        return res.status(401).json({ error: "This setup link has already been used. Please use /setup in Discord to get a new link." });
      }

      // Authenticate with Cognito
      const authUser = await AuthService.signIn(username, password);

      // Store session in database with sub
      await storage.upsertDiscordSession({
        discordUserId: setupToken.discordUserId,
        accessToken: authUser.accessToken,
        username: authUser.username,
        sub: authUser.sub,
      });

      // Mark token as used
      await storage.markTokenUsed(token);

      res.json({ 
        success: true, 
        username: authUser.username,
        discordUserId: setupToken.discordUserId,
      });
    } catch (error) {
      console.error("Login error:", error);
      const errorMessage = error instanceof Error ? error.message : "Authentication failed";
      res.status(401).json({ error: errorMessage });
    }
  });

  // Get campaigns for authenticated user
  app.get("/api/campaigns", async (req, res) => {
    try {
      const userId = req.query.userId as string;

      if (!userId) {
        return res.status(400).json({ error: "Missing userId parameter" });
      }

      // Get stored session directly by Discord user ID
      const session = await storage.getDiscordSession(userId);

      if (!session) {
        return res.status(401).json({ error: "Not authenticated. Please use /setup in Discord to login." });
      }

      // Fetch campaigns from GraphQL using the composite owner format (userId::username)
      const campaigns = await graphqlClient.getCampaignsByOwner(
        `${session.sub}::${session.username}`, 
        session.accessToken
      );

      // Add no-cache headers to ensure fresh data
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(campaigns);
    } catch (error) {
      console.error("Get campaigns error:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch campaigns";
      res.status(500).json({ error: errorMessage });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
