import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Bot, Mic, Upload, Cloud } from "lucide-react";

export default function Home() {
  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Bot className="w-12 h-12 text-primary" />
            <h1 className="text-4xl font-bold text-foreground">TabletopScribe Discord Bot</h1>
          </div>
          <p className="text-xl text-muted-foreground">
            Record your tabletop RPG sessions directly from Discord
          </p>
          <Badge variant="outline" className="text-sm">
            <CheckCircle className="w-3 h-3 mr-1" />
            Bot Online
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>How It Works</CardTitle>
            <CardDescription>
              Connect your TabletopScribe account and start recording your gaming sessions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-start">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 text-primary shrink-0">
                1
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Authenticate</h3>
                <p className="text-sm text-muted-foreground">
                  Use <code className="bg-muted px-1 rounded">/setup</code> to securely connect your TabletopScribe account
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 text-primary shrink-0">
                2
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Select Campaign</h3>
                <p className="text-sm text-muted-foreground">
                  Login securely in your browser, then click a campaign to copy the record command
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 text-primary shrink-0">
                <Mic className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Start Recording</h3>
                <p className="text-sm text-muted-foreground">
                  Join a voice channel and paste your campaign's record command
                </p>
              </div>
            </div>

            <div className="flex gap-4 items-start">
              <div className="flex items-center justify-center w-10 h-10 rounded-md bg-primary/10 text-primary shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Upload Session</h3>
                <p className="text-sm text-muted-foreground">
                  Use <code className="bg-muted px-1 rounded">/stop</code> to end recording and automatically upload to TabletopScribe
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Available Commands</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <code className="text-sm">/setup</code>
              <span className="text-sm text-muted-foreground">Get secure login link</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <code className="text-sm">/campaigns</code>
              <span className="text-sm text-muted-foreground">List your campaigns</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <code className="text-sm">/record &lt;campaign-name&gt;</code>
              <span className="text-sm text-muted-foreground">Start recording in voice channel</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <code className="text-sm">/stop</code>
              <span className="text-sm text-muted-foreground">Stop recording and upload</span>
            </div>
            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <code className="text-sm">/login &lt;username&gt; &lt;password&gt;</code>
              <span className="text-sm text-muted-foreground">Legacy - use /setup instead</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="w-5 h-5" />
              Integration Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>✓ AWS Cognito authentication</p>
            <p>✓ S3 audio storage</p>
            <p>✓ GraphQL session management</p>
            <p>✓ Multi-environment support (DEV/DEVSORT)</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
