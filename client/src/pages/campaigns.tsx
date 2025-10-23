import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bot, Copy, CheckCircle, AlertCircle, Loader2, BookOpen } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Campaign {
  id: string;
  name: string;
  description?: string;
}

export default function Campaigns() {
  const { toast } = useToast();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const userId = new URLSearchParams(window.location.search).get("userId");

  const { data: campaigns, isLoading, error} = useQuery<Campaign[]>({
    queryKey: ["/api/campaigns", userId],
    queryFn: async () => {
      const response = await fetch(`/api/campaigns?userId=${userId}`);
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch campaigns');
      }
      return response.json();
    },
    enabled: !!userId,
  });

  if (!userId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Please login first using the /setup command in Discord.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const copyToClipboard = async (campaignName: string, campaignId: string) => {
    const command = `/record ${campaignName}`;
    
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(campaignId);
      
      toast({
        title: "📋 Command Copied!",
        description: `Paste in Discord to start recording: ${command}`,
      });

      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      toast({
        title: "Copy Failed",
        description: "Please manually copy the command",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2">
            <Bot className="w-10 h-10 text-primary" />
            <h1 className="text-3xl font-bold text-foreground">Your Campaigns</h1>
          </div>
          <p className="text-muted-foreground">
            Click a campaign to copy the record command
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" data-testid="loader-campaigns" />
          </div>
        )}

        {error && (
          <Alert variant="destructive" data-testid="alert-error">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load campaigns. Please try logging in again.
            </AlertDescription>
          </Alert>
        )}

        {campaigns && campaigns.length === 0 && (
          <Alert data-testid="alert-no-campaigns">
            <BookOpen className="h-4 w-4" />
            <AlertDescription>
              No campaigns found. Create a campaign in TabletopScribe first.
            </AlertDescription>
          </Alert>
        )}

        {campaigns && campaigns.length > 0 && (
          <div className="grid gap-4">
            {campaigns.map((campaign) => (
              <Card
                key={campaign.id}
                className="hover-elevate transition-all cursor-pointer"
                onClick={() => copyToClipboard(campaign.name, campaign.id)}
                data-testid={`card-campaign-${campaign.id}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-xl mb-1 truncate" data-testid={`text-campaign-name-${campaign.id}`}>
                        {campaign.name}
                      </CardTitle>
                      {campaign.description && (
                        <CardDescription className="line-clamp-2">
                          {campaign.description}
                        </CardDescription>
                      )}
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyToClipboard(campaign.name, campaign.id);
                      }}
                      data-testid={`button-copy-${campaign.id}`}
                    >
                      {copiedId === campaign.id ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <Copy className="h-5 w-5" />
                      )}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">
                      /record {campaign.name}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-lg">How to Use</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Click on a campaign card above to copy the record command</p>
            <p>2. Join a voice channel in Discord</p>
            <p>3. Paste the command in any channel</p>
            <p>4. The bot will start recording your session</p>
            <p>5. Use <code className="bg-background px-1 rounded">/stop</code> when finished</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
