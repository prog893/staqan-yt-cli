# Setup & Installation

Complete installation and setup guide for staqan-yt-cli.

## Table of Contents

- [Installation](#installation)
- [OAuth Setup](#oauth-setup)
- [Authentication](#authentication)
- [Verification](#verification)
- [Configuration](#configuration)

## Installation

### Option 1: Homebrew (Recommended)

Homebrew is the recommended installation method for macOS users.

```bash
# Add the tap
brew tap prog893/staqan-yt https://github.com/prog893/staqan-yt-cli.git

# Install
brew install staqan-yt
```

**Or install directly from the formula URL:**

```bash
brew install https://raw.githubusercontent.com/prog893/staqan-yt-cli/main/Formula/staqan-yt.rb
```

Homebrew will automatically:
- Install Bun as a build dependency
- Compile the tool from source
- Install it to your PATH
- Handle updates via `brew upgrade staqan-yt`

**Updating:**

```bash
brew upgrade staqan-yt
```

**Uninstalling:**

```bash
brew uninstall staqan-yt
brew untap prog893/staqan-yt
```

### Option 2: Install from Source

For development or custom installations:

**Prerequisites:**
- Bun runtime - [Install Bun](https://bun.sh)

```bash
# Clone the repository
git clone https://github.com/prog893/staqan-yt-cli.git
cd staqan-yt-cli

# Install dependencies
bun install

# Build a single-file executable
bun build ./bin/staqan-yt.ts --compile --outfile staqan-yt

# Move to a directory in your PATH
sudo mv staqan-yt /usr/local/bin/
```

**Verify installation:**

```bash
staqan-yt --version
staqan-yt --help
```

## OAuth Setup

Before using the CLI, you need to set up OAuth 2.0 credentials with Google.

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the YouTube Data API v3:
   - Navigate to "APIs & Services" > "Library"
   - Search for "YouTube Data API v3"
   - Click "Enable"

### Step 2: Create OAuth 2.0 Credentials

1. Go to [API Credentials](https://console.cloud.google.com/apis/credentials)
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Desktop application" as the application type
4. Name it (e.g., "staqan-yt-cli")
5. Click "Create"
6. Download the credentials JSON file

### Step 3: Save Credentials

The CLI expects credentials at a specific location:

```bash
# Create the directory
mkdir -p ~/.staqan-yt-cli

# Copy your credentials
cp ~/Downloads/client_secret_*.json ~/.staqan-yt-cli/credentials.json
```

**Verify the credentials file:**

```bash
cat ~/.staqan-yt-cli/credentials.json
```

You should see JSON with:
- `client_id`
- `client_secret`
- `auth_uri`
- `token_uri`
- `redirect_uris` (containing "urn:ietf:wg:oauth:2.0:oob")

### Required OAuth Scopes

The CLI requires these OAuth scopes:

- `https://www.googleapis.com/auth/youtube.readonly` - Read YouTube data
- `https://www.googleapis.com/auth/youtube.force-ssl` - Manage YouTube videos
- `https://www.googleapis.com/auth/yt-analytics.readonly` - Access YouTube Analytics data

**Note:** If you've already authenticated and want to use analytics features, you'll need to re-authenticate:

```bash
staqan-yt auth
```

## Authentication

After setting up credentials, authenticate with Google:

```bash
staqan-yt auth
```

This will:

1. Open your browser for Google OAuth consent
2. Ask you to grant permissions to your YouTube account
3. Save the authentication token to `~/.staqan-yt-cli/token.json`
4. Enable you to use all CLI commands

**Authentication flow:**

```
1. CLI reads ~/.staqan-yt-cli/credentials.json
2. Opens browser with OAuth consent screen
3. You grant permissions
4. Google returns authorization code
5. CLI exchanges code for access token
6. Token saved to ~/.staqan-yt-cli/token.json
```

### Token Refresh

Access tokens expire after 1 hour. The CLI automatically:
- Detects expired tokens
- Uses the refresh token to get a new access token
- Updates `~/.staqan-yt-cli/token.json` automatically

If you see authentication errors, simply re-run:

```bash
staqan-yt auth
```

## Verification

Test your installation and authentication:

```bash
# Test CLI is installed
staqan-yt --version

# Test authentication
staqan-yt get-channel @YouTube --output json

# Test with a real channel
staqan-yt list-videos @mkbhd --limit 5
```

If these commands work, you're ready to go!

## Configuration

### Set Default Channel

Avoid repeating your channel handle:

```bash
# Set default channel
staqan-yt config set default.channel @yourchannel

# Now you can omit the channel argument
staqan-yt list-videos --limit 10
staqan-yt search-videos "keyword"
```

### Set Default Output Format

Set your preferred output format:

```bash
# Available formats: json, csv, table, text, pretty
staqan-yt config set default.output csv

# All commands now output CSV by default
staqan-yt list-videos --limit 10
```

### View Current Configuration

```bash
# Show all configuration
staqan-yt config show

# Get specific value
staqan-yt config get default.channel
```

### Configuration File Location

Configuration is stored at:

```
~/.staqan-yt-cli/
├── credentials.json    # OAuth client credentials
├── token.json          # Authentication token
├── config.json         # Your configuration
└── data/               # Cached report data
    ├── cache-index.json
    └── reports/
```

**Important:**
- Keep these files secure
- Never commit them to version control
- Back up `credentials.json` and `token.json` for safekeeping

## Next Steps

Now that you're set up:

1. **[Command Reference](README.md#commands)** - Explore all available commands
2. **[Output Formats](output-formats.md)** - Learn about different output options
3. **[Configuration](configuration.md)** - Advanced configuration options
4. **[Examples](README.md#quick-examples)** - Common usage patterns

## Troubleshooting

### "Credentials not found" Error

**Problem:** CLI can't find your OAuth credentials.

**Solution:**
```bash
# Verify credentials file exists
ls -la ~/.staqan-yt-cli/credentials.json

# If missing, re-create it
mkdir -p ~/.staqan-yt-cli
cp ~/Downloads/client_secret_*.json ~/.staqan-yt-cli/credentials.json
```

### "No authentication token found" Error

**Problem:** You haven't authenticated yet.

**Solution:**
```bash
staqan-yt auth
```

### "Failed to refresh token" Error

**Problem:** Your refresh token has expired.

**Solution:**
```bash
# Re-authenticate
staqan-yt auth
```

### Browser doesn't open

**Problem:** CLI can't open your browser automatically.

**Solution:** Manually visit the URL printed in the terminal, complete the auth flow, and paste the authorization code back into the terminal.

### Channel not found

**Problem:** Invalid channel handle or ID.

**Solution:**
- Verify the channel handle/ID is correct
- Try using the channel URL instead
- Make sure the channel is public

For more troubleshooting, see [Troubleshooting Guide](troubleshooting.md).
