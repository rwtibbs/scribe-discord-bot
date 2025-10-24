import fetch from 'node-fetch';
import { getAwsConfig, getEnvironment } from './aws-config';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  owner: string;
  _deleted?: boolean;
}

class GraphQLClient {
  private endpoint: string;
  private apiKey: string;

  constructor() {
    const config = getAwsConfig();
    this.endpoint = config.graphqlEndpoint;
    this.apiKey = config.appsyncApiKey;
    
    const environment = getEnvironment();
    console.log(`🔧 GraphQL Client configured for ${environment} environment`);
  }

  async query<T = any>(query: string, variables?: Record<string, any>, accessToken?: string): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    } else {
      headers['x-api-key'] = this.apiKey;
    }
    
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`GraphQL request failed: ${response.status}`);
    }

    const result = await response.json() as any;
    
    if (result.errors && result.errors.length > 0) {
      throw new Error(result.errors[0].message);
    }

    return result.data;
  }

  async getCampaignsByOwner(owner: string, accessToken?: string): Promise<Campaign[]> {
    console.log(`🔍 Fetching campaigns for user with access token`);
    console.log(`🔍 Using accessToken: ${accessToken ? 'YES' : 'NO (using API key)'}`);
    
    const query = `
      query ListCampaigns {
        listCampaigns(limit: 100) {
          items {
            id
            name
            description
            owner
            _deleted
          }
        }
      }
    `;

    const result = await this.query<{ listCampaigns: { items: Campaign[] } }>(
      query, 
      {}, 
      accessToken
    );
    
    console.log(`📊 GraphQL returned ${result.listCampaigns.items.length} total campaigns`);
    
    // Log each campaign with its details
    result.listCampaigns.items.forEach((campaign, index) => {
      console.log(`  Campaign ${index + 1}: "${campaign.name}" (ID: ${campaign.id})`);
      console.log(`    Owner field value: "${campaign.owner}"`);
      console.log(`    Deleted: ${campaign._deleted ? 'YES' : 'NO'}`);
      console.log(`    Owner match: eq=${campaign.owner === owner}, contains=${campaign.owner.includes(owner)}`);
    });
    
    const filtered = result.listCampaigns.items.filter(campaign => !campaign._deleted);
    console.log(`✅ After filtering deleted: ${filtered.length} campaigns remaining`);
    
    // Log the final campaigns being returned
    console.log(`📋 Final campaigns being returned:`);
    filtered.forEach((campaign, index) => {
      console.log(`  ${index + 1}. "${campaign.name}"`);
    });
    
    return filtered;
  }

  async createSession(sessionData: {
    name: string;
    duration: number;
    audioFile: string;
    transcriptionFile: string;
    transcriptionStatus: string;
    campaignSessionsId: string;
    date: Date | string;
  }, accessToken?: string): Promise<{ id: string; _version: number }> {
    const mutation = `
      mutation CreateSession($input: CreateSessionInput!) {
        createSession(input: $input) {
          id
          name
          duration
          audioFile
          transcriptionFile
          transcriptionStatus
          purchaseStatus
          campaignSessionsId
          date
          _version
        }
      }
    `;

    // Convert date to YYYY-MM-DD format (AWSDate format)
    const dateObj = sessionData.date instanceof Date ? sessionData.date : new Date(sessionData.date);
    const formattedDate = dateObj.toISOString().split('T')[0];

    const input = {
      ...sessionData,
      date: formattedDate,
      purchaseStatus: 'NOTPURCHASED'
    };

    const result = await this.query<{ createSession: { id: string; _version: number } }>(
      mutation,
      { input },
      accessToken
    );

    return result.createSession;
  }

  async updateSessionAudioFile(
    sessionId: string, 
    audioFile: string, 
    transcriptionFile: string, 
    version: number, 
    accessToken?: string
  ): Promise<void> {
    const mutation = `
      mutation UpdateSession($input: UpdateSessionInput!) {
        updateSession(input: $input) {
          id
          audioFile
          transcriptionFile
          transcriptionStatus
        }
      }
    `;

    await this.query(mutation, {
      input: {
        id: sessionId,
        audioFile,
        transcriptionFile,
        transcriptionStatus: "UPLOADED",
        _version: version,
      }
    }, accessToken);
  }
}

export const graphqlClient = new GraphQLClient();
