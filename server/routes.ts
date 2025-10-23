import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { AuthService } from "./lib/auth";
import { graphqlClient } from "./lib/graphql";

export async function registerRoutes(app: Express): Promise<Server> {
  // Authentication endpoint - login via web UI
  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password, discordUserId } = req.body;

      if (!username || !password || !discordUserId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      // Authenticate with Cognito
      const authUser = await AuthService.signIn(username, password);

      // Store session in database
      await storage.upsertDiscordSession({
        discordUserId,
        accessToken: authUser.accessToken,
        username: authUser.username,
      });

      res.json({ 
        success: true, 
        username: authUser.username,
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
      const discordUserId = req.query.userId as string;

      if (!discordUserId) {
        return res.status(400).json({ error: "Missing userId parameter" });
      }

      // Get stored session
      const session = await storage.getDiscordSession(discordUserId);

      if (!session) {
        return res.status(401).json({ error: "Not authenticated. Please login first." });
      }

      // Fetch campaigns from GraphQL using the stored username
      const campaigns = await graphqlClient.getCampaignsByOwner(
        session.username, 
        session.accessToken
      );

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
