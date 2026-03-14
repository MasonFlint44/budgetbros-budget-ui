export type CognitoConfig = {
  readonly domain: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly logoutUri: string;
  readonly scopes: readonly string[];
};

const defaultAppUri =
  typeof window === 'undefined' ? 'http://localhost:4200/' : `${window.location.origin}/`;

export const COGNITO_CONFIG: CognitoConfig = {
  domain: 'https://us-east-1lqiryd1fd.auth.us-east-1.amazoncognito.com',
  clientId: '555epl19epj9i0erat76c44803',
  redirectUri: defaultAppUri,
  logoutUri: defaultAppUri,
  scopes: ['openid', 'email', 'phone']
};
