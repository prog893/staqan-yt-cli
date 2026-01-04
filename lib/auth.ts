import { google } from 'googleapis';
import { promises as fs } from 'fs';
import http from 'http';
import url from 'url';
import open from 'open';
import chalk from 'chalk';
import { OAuth2Client } from 'google-auth-library';
import {
  CREDENTIALS_PATH,
  TOKEN_PATH,
  ensureConfigDir,
  error,
  info,
} from './utils';
import { OAuth2Credentials, OAuth2Token } from '../types';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
];

/**
 * Load OAuth2 credentials from file
 */
async function loadCredentials(): Promise<OAuth2Credentials | null> {
  try {
    const content = await fs.readFile(CREDENTIALS_PATH, 'utf-8');
    return JSON.parse(content) as OAuth2Credentials;
  } catch {
    return null;
  }
}

/**
 * Load saved token from file
 */
async function loadToken(): Promise<OAuth2Token | null> {
  try {
    const content = await fs.readFile(TOKEN_PATH, 'utf-8');
    return JSON.parse(content) as OAuth2Token;
  } catch {
    return null;
  }
}

/**
 * Save token to file
 */
async function saveToken(token: OAuth2Token): Promise<void> {
  await ensureConfigDir();
  await fs.writeFile(TOKEN_PATH, JSON.stringify(token, null, 2));
}

/**
 * Create OAuth2 client
 */
async function createOAuth2Client(): Promise<OAuth2Client> {
  const credentials = await loadCredentials();

  if (!credentials) {
    throw new Error('Credentials not found. Please run the auth command first.');
  }

  const { client_id, client_secret } = credentials.installed || credentials.web!;

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    'http://localhost:3000'
  );
}

/**
 * Get authenticated OAuth2 client
 */
async function getAuthenticatedClient(): Promise<OAuth2Client> {
  const oauth2Client = await createOAuth2Client();
  const token = await loadToken();

  if (!token) {
    throw new Error('No authentication token found. Please run: staqan-yt auth');
  }

  oauth2Client.setCredentials(token);

  // Refresh token if expired
  if (token.expiry_date && token.expiry_date < Date.now()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await saveToken(credentials as OAuth2Token);
      oauth2Client.setCredentials(credentials);
    } catch {
      throw new Error('Failed to refresh token. Please re-authenticate: staqan-yt auth');
    }
  }

  return oauth2Client;
}

/**
 * Authenticate user via OAuth2 flow
 */
async function authenticate(): Promise<OAuth2Client> {
  const credentials = await loadCredentials();

  if (!credentials) {
    error('Credentials file not found!');
    console.log('');
    info('To set up authentication:');
    console.log('1. Go to: ' + chalk.cyan('https://console.cloud.google.com/apis/credentials'));
    console.log('2. Create OAuth 2.0 Client ID (Desktop application)');
    console.log('3. Download the credentials JSON file');
    console.log('4. Save it as: ' + chalk.cyan(CREDENTIALS_PATH));
    console.log('');
    info('Required OAuth scopes:');
    SCOPES.forEach(scope => console.log('  - ' + scope));
    process.exit(1);
  }

  const oauth2Client = await createOAuth2Client();

  return new Promise((resolve, reject) => {
    // Create local server to receive callback
    const server = http.createServer(async (req, res) => {
      try {
        const queryParams = url.parse(req.url!, true).query;

        if (queryParams.code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p>');

          server.close();

          const { tokens } = await oauth2Client.getToken(queryParams.code as string);
          await saveToken(tokens as OAuth2Token);

          resolve(oauth2Client);
        }
      } catch (err) {
        reject(err);
      }
    });

    server.listen(3000, () => {
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
      });

      console.log('');
      info('Opening browser for authentication...');
      console.log('');
      console.log('If the browser does not open, visit this URL:');
      console.log(chalk.cyan(authUrl));
      console.log('');

      // Try to open browser
      open(authUrl).catch(() => {
        // Ignore error if open fails
      });
    });
  });
}

export {
  authenticate,
  getAuthenticatedClient,
  loadCredentials,
  loadToken,
  saveToken,
};
