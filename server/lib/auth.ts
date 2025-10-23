import { CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserSession } from 'amazon-cognito-identity-js';
import { getAwsConfig } from './aws-config';

export interface AuthUser {
  username: string;
  sub: string;
  accessToken: string;
}

const getUserPool = () => {
  const config = getAwsConfig();
  return new CognitoUserPool({
    UserPoolId: config.userPoolId,
    ClientId: config.userPoolClientId,
  });
};

export class AuthService {
  static async signIn(username: string, password: string): Promise<AuthUser> {
    return new Promise((resolve, reject) => {
      const authenticationDetails = new AuthenticationDetails({
        Username: username,
        Password: password,
      });

      const cognitoUser = new CognitoUser({
        Username: username,
        Pool: getUserPool(),
      });

      cognitoUser.authenticateUser(authenticationDetails, {
        onSuccess: (result) => {
          const accessToken = result.getAccessToken().getJwtToken();
          const payload = result.getAccessToken().payload;
          
          console.log('✅ Authentication successful for user:', username);
          resolve({
            username,
            sub: payload.sub,
            accessToken,
          });
        },
        onFailure: (err) => {
          console.error('❌ Authentication failed:', err.message);
          reject(new Error(err.message || 'Authentication failed'));
        },
      });
    });
  }

  static async refreshSession(cognitoUser: CognitoUser): Promise<string> {
    return new Promise((resolve, reject) => {
      cognitoUser.getSession((err: any, session: CognitoUserSession) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (!session.isValid()) {
          reject(new Error('Session expired'));
          return;
        }

        resolve(session.getAccessToken().getJwtToken());
      });
    });
  }
}
