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
    const query = `
      query GetCampaignsByOwner($owner: String!) {
        listCampaigns(
          filter: { 
            or: [
              { owner: { eq: $owner } },
              { owner: { contains: $owner } }
            ]
          }
          limit: 100
        ) {
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
      { owner }, 
      accessToken
    );
    
    return result.listCampaigns.items.filter(campaign => !campaign._deleted);
  }

  async createSession(sessionData: {
    name: string;
    duration: number;
    audioFile: string;
    transcriptionFile: string;
    transcriptionStatus: string;
    campaignSessionsId: string;
    date: string;
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

    const input = {
      ...sessionData,
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
