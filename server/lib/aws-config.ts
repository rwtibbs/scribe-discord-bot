export interface AWSConfig {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
  s3Bucket: string;
  appsyncApiKey: string;
  graphqlEndpoint: string;
}

type Environment = 'DEV' | 'DEVSORT';

export const getEnvironment = (): Environment => {
  const env = process.env.AWS_ENVIRONMENT as Environment;
  return env === 'DEVSORT' ? 'DEVSORT' : 'DEV';
};

const environmentConfigs: Record<Environment, AWSConfig> = {
  DEV: {
    region: process.env.AWS_REGION || 'us-east-2',
    userPoolId: process.env.USER_POOL_ID_DEV || 'us-east-2_2sxvJnReu',
    userPoolClientId: process.env.USER_POOL_CLIENT_ID_DEV || '',
    s3Bucket: process.env.S3_BUCKET_DEV || 'scribe8a8fcf3f6cb14734bce4bd48352f8043195641-dev',
    appsyncApiKey: process.env.APPSYNC_API_KEY || '',
    graphqlEndpoint: process.env.GRAPHQL_ENDPOINT_DEV || 'https://lm5nq7s75raxnd24y67v3civhm.appsync-api.us-east-2.amazonaws.com/graphql',
  },
  DEVSORT: {
    region: process.env.AWS_REGION || 'us-east-2',
    userPoolId: process.env.USER_POOL_ID_DEVSORT || 'us-east-2_N5trdtp4e',
    userPoolClientId: process.env.USER_POOL_CLIENT_ID_DEVSORT || 'kpk9rjugfg5997ann3v40s7hs',
    s3Bucket: process.env.S3_BUCKET_DEVSORT || 'scribe8a8fcf3f6cb14734bce4bd48352f8043acdd4-devsort',
    appsyncApiKey: process.env.APPSYNC_API_KEY || '',
    graphqlEndpoint: process.env.GRAPHQL_ENDPOINT_DEVSORT || 'https://bbypecanqjgyblz7ikrrk46rbe.appsync-api.us-east-2.amazonaws.com/graphql',
  },
};

export const getAwsConfig = (): AWSConfig => {
  const currentEnv = getEnvironment();
  return environmentConfigs[currentEnv];
};
