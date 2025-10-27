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
    console.log(`🔍 Fetching campaigns for owner: "${owner}"`);
    console.log(`🔍 Owner bytes (hex): ${Buffer.from(owner).toString('hex')}`);
    console.log(`🔍 Using accessToken: ${accessToken ? 'YES' : 'NO (using API key)'}`);
    
    const query = `
      query GetCampaignsByOwner($owner: String!, $nextToken: String) {
        listCampaigns(
          filter: { 
            or: [
              { owner: { eq: $owner } },
              { owner: { contains: $owner } }
            ]
          }
          limit: 100
          nextToken: $nextToken
        ) {
          items {
            id
            name
            description
            owner
            _deleted
          }
          nextToken
        }
      }
    `;

    let allCampaigns: Campaign[] = [];
    let nextToken: string | null = null;
    let pageNumber = 0;

    // Loop through all pages
    do {
      pageNumber++;
      console.log(`📄 Fetching page ${pageNumber}...`);
      
      const result: { listCampaigns: { items: Campaign[]; nextToken?: string } } = await this.query<{ listCampaigns: { items: Campaign[]; nextToken?: string } }>(
        query, 
        { owner, nextToken }, 
        accessToken
      );
      
      // Log raw response for debugging
      console.log(`📊 Page ${pageNumber} - Raw response:`, JSON.stringify({
        itemsCount: result.listCampaigns.items.length,
        hasNextToken: !!result.listCampaigns.nextToken,
        nextToken: result.listCampaigns.nextToken
      }));
      
      // Log each campaign with byte-level comparison
      result.listCampaigns.items.forEach((campaign: Campaign, index: number) => {
        const ownerMatch = campaign.owner === owner;
        const ownerBytes = Buffer.from(campaign.owner).toString('hex');
        const expectedBytes = Buffer.from(owner).toString('hex');
        
        console.log(`  Campaign ${index + 1} (Page ${pageNumber}): "${campaign.name}" (ID: ${campaign.id})`);
        console.log(`    Owner: "${campaign.owner}"`);
        console.log(`    Owner bytes: ${ownerBytes}`);
        console.log(`    Match: ${ownerMatch ? '✅ EXACT' : '❌ NO'}`);
        if (!ownerMatch) {
          console.log(`    Expected: "${owner}"`);
          console.log(`    Expected bytes: ${expectedBytes}`);
        }
        console.log(`    Deleted: ${campaign._deleted ? 'YES' : 'NO'}`);
      });
      
      allCampaigns = allCampaigns.concat(result.listCampaigns.items);
      nextToken = result.listCampaigns.nextToken || null;
      
      if (nextToken) {
        console.log(`➡️  More results available, fetching next page...`);
      }
      
    } while (nextToken);
    
    console.log(`📊 Total campaigns fetched across ${pageNumber} page(s): ${allCampaigns.length}`);
    
    const filtered = allCampaigns.filter(campaign => !campaign._deleted);
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
