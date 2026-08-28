import { google } from 'googleapis';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import http from 'http';
import open from 'open';
import chalk from 'chalk';
import { OAuth2Client } from 'google-auth-library';
import {
  CREDENTIALS_PATH,
  TOKEN_PATH,
  ensureConfigDir,
  info,
  loadJsonIfPresent,
  isTransportFailure,
  getOAuthErrorCode,
} from './utils';
import { OAuth2Credentials, OAuth2Token } from '../types';

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'https://www.googleapis.com/auth/yt-analytics-monetary.readonly',
];

/**
 * Load OAuth2 credentials from file.
 * Null if absent, so the caller prints setup guidance. Throws if damaged,
 * since re-running auth does not repair a malformed credentials.json.
 */
async function loadCredentials(): Promise<OAuth2Credentials | null> {
  return loadJsonIfPresent<OAuth2Credentials>(CREDENTIALS_PATH, 'OAuth credentials');
}

/**
 * Load saved token from file.
 * Null if absent, which triggers the sign-in prompt. Throws if damaged, so a
 * corrupt token is not answered with a silent full re-auth.
 */
async function loadToken(): Promise<OAuth2Token | null> {
  return loadJsonIfPresent<OAuth2Token>(TOKEN_PATH, 'auth token');
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
 *
 * `redirectUri` is the redirect URI registered with / accepted by Google. It is
 * only used when generating auth URLs and exchanging the authorization code, so
 * for token-refresh paths it is irrelevant — callers there pass a placeholder.
 */
async function createOAuth2Client(redirectUri: string): Promise<OAuth2Client> {
  const credentials = await loadCredentials();

  if (!credentials) {
    throw new Error('Credentials not found. Please run the auth command first.');
  }

  // Google OAuth credentials have either 'installed' or 'web' at root level
  const authConfig = credentials.installed || credentials.web;

  if (!authConfig) {
    throw new Error('Invalid credentials format. Expected "installed" or "web" properties.');
  }

  const { client_id, client_secret } = authConfig;

  return new google.auth.OAuth2(
    client_id,
    client_secret,
    redirectUri
  );
}

/**
 * Error thrown when the OAuth2 credentials file is missing.
 * Carries the setup-instruction message so the caller's catch block can
 * decide whether (and how) to print it before exiting.
 */
class CredentialsMissingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialsMissingError';
  }
}

/**
 * Print the multi-line setup instructions for obtaining OAuth2 credentials.
 * Used by `authenticate()` (via a thrown CredentialsMissingError) and by the
 * `auth` command's catch block to surface the same UX in one place.
 */
function printCredentialsSetupInstructions(): void {
  info('To set up authentication:');
  console.log('1. Go to: ' + chalk.cyan('https://console.cloud.google.com/apis/credentials'));
  console.log('2. Create OAuth 2.0 Client ID (Desktop application)');
  console.log('3. Download the credentials JSON file');
  console.log('4. Save it as: ' + chalk.cyan(CREDENTIALS_PATH));
  console.log('');
  info('Required OAuth scopes:');
  SCOPES.forEach(scope => console.log('  - ' + scope));
}

/**
 * Get authenticated OAuth2 client
 */
async function getAuthenticatedClient(): Promise<OAuth2Client> {
  // redirect_uri is unused on the token-refresh path; a placeholder is fine.
  const oauth2Client = await createOAuth2Client('http://localhost');
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
    } catch (err) {
      // Only `invalid_grant` means the saved credentials are actually dead.
      // A bare catch here prescribed a full re-auth for a dropped connection
      // or a Google 5xx as well, which throws away a working session in
      // response to a network blip (#197).
      const oauthError = getOAuthErrorCode(err);
      const detail = (err as Error).message;

      if (oauthError === 'invalid_grant') {
        throw new Error(
          'Refresh token rejected by Google (invalid_grant): it has been revoked, ' +
          'expired, or the account password changed. Please re-authenticate: staqan-yt auth'
        );
      }

      if (isTransportFailure(err)) {
        throw new Error(
          `Could not reach Google to refresh the access token: ${detail}. ` +
          'The saved credentials are still valid, so this does not need a re-authentication. ' +
          'Retry once connectivity is restored.'
        );
      }

      // Still not a reason to prescribe a re-auth. Google reports a dead
      // refresh token as invalid_grant, handled above, so anything reaching
      // here left the saved session intact. invalid_client in particular is
      // about the OAuth client in credentials.json, which re-running auth
      // cannot repair.
      const hint = oauthError === 'invalid_client'
        ? ` The OAuth client in ${CREDENTIALS_PATH} was rejected, and re-authenticating will not repair that.`
        : ' The saved refresh token was not rejected, so re-authenticating is unlikely to help.';

      throw new Error(
        `Failed to refresh the access token: ${detail}` +
        (oauthError ? ` (${oauthError})` : '') + '.' + hint
      );
    }
  }

  return oauth2Client;
}

/**
 * Pick the loopback host for the OAuth redirect URI.
 *
 * Desktop ("installed") OAuth clients register a loopback redirect URI such as
 * `http://localhost:3000`. Per RFC 8252 §7.3, the authorization server MUST
 * accept any port for loopback redirects, so we bind an OS-assigned free port at
 * runtime rather than a fixed one (which crashes with EADDRINUSE when port 3000
 * is already taken). We keep the SAME host the user registered so the redirect
 * still matches Google's expectations — defaulting to `localhost`.
 */
function getRedirectHost(credentials: OAuth2Credentials | null): string {
  const uris = credentials?.installed?.redirect_uris ?? [];

  for (const uri of uris) {
    try {
      const { hostname } = new URL(uri);
      if (hostname === '127.0.0.1' || hostname === 'localhost') {
        return hostname;
      }
    } catch {
      // Ignore malformed redirect URI entries.
    }
  }
  return 'localhost';
}

/**
 * Escape a string for safe interpolation into an HTML response body.
 * Used when reflecting the OAuth `error` query param back to the browser.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
}

/**
 * Authenticate user via OAuth2 flow
 *
 * Spins up a throwaway local HTTP server on an OS-assigned free port to receive
 * the OAuth callback. Binding to port 0 makes the kernel atomically pick a free
 * port, so we never collide with another process (the original hardcoded 3000
 * crashed with EADDRINUSE whenever 3000 was occupied). The same host registered
 * in credentials is reused; only the port varies, which RFC 8252 guarantees
 * Google will accept for loopback redirects.
 */
async function authenticate(): Promise<OAuth2Client> {
  const credentials = await loadCredentials();

  if (!credentials) {
    // Throw instead of exiting — the caller (commands/auth.ts) decides how
    // to surface the message and exit. The setup instructions live in a
    // shared helper so the caller's catch block can print them in the same
    // shape as the old direct-exit path.
    throw new CredentialsMissingError('Credentials file not found!');
  }

  // The loopback OAuth flow requires a Desktop ("installed") client. Web-type
  // clients use exact-match redirect URIs and cannot accept the runtime-assigned
  // loopback port, so reject them up front with a clear message.
  if (!credentials.installed) {
    throw new Error(
      'Desktop ("installed") OAuth credentials are required. ' +
      'Create an OAuth 2.0 Client ID of type "Desktop application" in Google Cloud Console ' +
      'and save it to ' + CREDENTIALS_PATH + '.'
    );
  }
  const { client_id, client_secret } = credentials.installed;
  const redirectHost = getRedirectHost(credentials);

  return new Promise<OAuth2Client>((resolve, reject) => {
    // oauth2Client is created inside the listen callback once the assigned port
    // is known. It is referenced by the request handler, which only fires after
    // the browser is redirected back — by then this is already assigned.
    let oauth2Client: OAuth2Client;

    // OAuth `state` nonce: binds the authorization code to this auth attempt so
    // a forged callback (CSRF) can't inject an attacker's code. Google echoes
    // this value on the redirect; we compare it before using the code.
    const expectedState = randomUUID();
    // Create local server to receive the OAuth callback
    const server = http.createServer((req, res) => {
      (async () => {
        try {
          // WHATWG URL API — avoids the deprecated url.parse() (DEP0169).
          // req.url looks like "/?code=...&scope=..." or "/?error=access_denied".
          const callbackUrl = new URL(req.url ?? '/', 'http://localhost');
          const code = callbackUrl.searchParams.get('code');
          const oauthError = callbackUrl.searchParams.get('error');

          if (oauthError) {
            // User denied consent or Google reported an error (e.g. access_denied).
            res.writeHead(400, { 'Content-Type': 'text/html', 'Connection': 'close' });
            res.end(
              '<h1>Authentication failed</h1>' +
              `<p>Google reported: ${escapeHtml(oauthError)}</p>` +
              '<p>You can close this window and retry in your terminal.</p>'
            );
            server.closeAllConnections();
            server.close();
            reject(new Error(`Google reported an authentication error: ${oauthError}`));
            return;
          }

          if (!code) {
            // Not the OAuth callback (e.g. a favicon request). Ignore it so the
            // server stays up for the real callback.
            res.writeHead(404, { 'Content-Type': 'text/plain', 'Connection': 'close' });
            res.end('Not found');
            return;
          }

          // CSRF protection: bind the returned code to this auth attempt via the
          // OAuth `state` nonce. Reject any callback whose state doesn't match.
          const state = callbackUrl.searchParams.get('state');
          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/plain', 'Connection': 'close' });
            res.end('Invalid OAuth state');
            server.closeAllConnections();
            server.close();
            reject(new Error('OAuth state mismatch: authentication callback rejected.'));
            return;
          }

          // Exchange the code using the same client (and thus the same
          // redirect_uri) that generated the auth URL. Apply the resulting
          // tokens so the resolved client is authenticated — getToken() does
          // not set credentials itself in google-auth-library 10.x.
          const { tokens } = await oauth2Client.getToken(code);
          oauth2Client.setCredentials(tokens);
          await saveToken(tokens as OAuth2Token);

          // Only signal success to the browser once the exchange and persistence
          // have actually succeeded, so the browser and terminal can't disagree.
          res.writeHead(200, { 'Content-Type': 'text/html', 'Connection': 'close' });
          res.end('<h1>Authentication successful!</h1><p>You can close this window and return to the terminal.</p>');

          // Close all connections and server
          server.closeAllConnections();
          server.close((err) => {
            void err; // Ignore close errors
            resolve(oauth2Client);
          });
        } catch (err) {
          // If the exchange/persistence failed before we responded, tell the
          // browser instead of leaving it hanging on a stale connection.
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/html', 'Connection': 'close' });
            res.end('<h1>Authentication failed</h1><p>The token exchange failed. Please return to the terminal and retry.</p>');
          }
          server.closeAllConnections();
          server.close();
          reject(err);
        }
      })();
    });

    // Surface server errors as a friendly rejection instead of letting the
    // unhandled 'error' event crash the process with a raw stack trace.
    server.on('error', (err) => {
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'EADDRINUSE') {
        reject(new Error('Could not bind a free local port for the authentication callback. Please close other processes or retry.'));
      } else {
        reject(new Error(`Failed to start the local authentication server: ${e.message}`));
      }
    });

    // Configure server to prevent hanging
    server.keepAliveTimeout = 1; // Short keep-alive timeout
    server.headersTimeout = 5; // Short headers timeout
    server.setTimeout(5000, () => {
      server.closeAllConnections();
      server.close();
    });

    // Port 0 → the kernel atomically assigns a free port, guaranteeing no
    // EADDRINUSE collision even when a fixed port (e.g. 3000) is in use.
    server.listen(0, () => {
      const address = server.address();
      const port = address && typeof address === 'object' ? address.port : 0;
      const redirectUri = `http://${redirectHost}:${port}`;

      // Build the client with the exact redirect URI we are listening on; the
      // same instance is reused for getToken() so the code exchange matches.
      oauth2Client = new google.auth.OAuth2(client_id, client_secret, redirectUri);

      const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state: expectedState,
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
  CredentialsMissingError,
  printCredentialsSetupInstructions,
};
