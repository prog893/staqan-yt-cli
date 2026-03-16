# Configuration Commands

Commands for authentication, configuration, and MCP server integration.

## auth

Authenticate with YouTube API using OAuth 2.0.

### Usage

```bash
staqan-yt auth
```

### Options

- `--output <format>` - Output format: json, table, text, pretty, csv
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Authenticate (opens browser)
staqan-yt auth

# Authenticate with verbose output
staqan-yt auth --verbose
```

### What It Does

1. Reads OAuth credentials from `~/.staqan-yt-cli/credentials.json`
2. Opens your browser for Google OAuth consent
3. Asks you to grant permissions to your YouTube account
4. Exchanges authorization code for access token
5. Saves tokens to `~/.staqan-yt-cli/token.json`

### Required OAuth Scopes

The CLI requires these scopes:
- `https://www.googleapis.com/auth/youtube.readonly` - Read YouTube data
- `https://www.googleapis.com/auth/youtube.force-ssl` - Manage YouTube videos
- `https://www.googleapis.com/auth/yt-analytics.readonly` - Access analytics data

### Token Refresh

- Access tokens expire after 1 hour
- Refresh tokens are long-lived
- CLI automatically refreshes expired tokens
- If refresh fails, re-run `staqan-yt auth`

### Authentication Issues

**"Credentials not found":**
```bash
# Verify credentials file exists
ls -la ~/.staqan-yt-cli/credentials.json

# Re-create if missing
mkdir -p ~/.staqan-yt-cli
cp ~/Downloads/client_secret_*.json ~/.staqan-yt-cli/credentials.json
```

**"Failed to refresh token":**
```bash
# Re-authenticate
staqan-yt auth
```

---

## config

Manage CLI configuration (set defaults, view settings).

### Usage

```bash
staqan-yt config [action] [key] [value]
```

### Actions

- `show` - Show all configuration settings
- `set` - Set a configuration value
- `get` - Get a specific configuration value
- `completion` - Generate or install shell completions

### Options

- `--show` - Show all configuration settings (same as `show` action)
- `--install` - Install shell completion to appropriate location (for `completion` action)
- `--print` - Print completion script to stdout (for `completion` action)
- `--output <format>` - Output format: json, table, text, pretty, csv
- `-v, --verbose` - Enable verbose output with debug information
- `-h, --help` - Show help

### Examples

```bash
# Show all configuration
staqan-yt config show

# Set default channel
staqan-yt config set default.channel @yourchannel

# Set default output format
staqan-yt config set default.output csv

# Get specific value
staqan-yt config get default.channel

# Delete a value
staqan-yt config delete default.channel
```

### Configuration Options

**default.channel**
- Channel handle or ID for list-videos and search-videos
- Example: `@yourchannel` or `UCZY6mkkAfPYvbpBq09wLjzg`
- Commands that use it: `list-videos`, `search-videos`, `get-channel-analytics`, `get-channel-search-terms`

**default.output**
- Default output format for all commands
- Options: `json`, `table`, `text`, `pretty`, `csv`
- Default: `pretty`
- Can be overridden with `--output` flag

### Configuration File Location

```
~/.staqan-yt-cli/config.json
```

### Example Configuration File

```json
{
  "default.channel": "@yourchannel",
  "default.output": "csv"
}
```

### Priority Order

1. **CLI flags** - Highest priority (e.g., `--output json`)
2. **Configuration** - Used if no flag provided
3. **Defaults** - Built-in defaults if no config

### Shell Completions

The `config completion` action generates shell completion scripts for bash and zsh.

#### Usage

```bash
# Auto-detect shell and install
staqan-yt config completion auto --install

# Specify shell explicitly
staqan-yt config completion zsh --install
staqan-yt config completion bash --install

# Print completion script to stdout
staqan-yt config completion zsh --print > ~/.zsh/completion/_staqan-yt
staqan-yt config completion bash --print > ~/.bash_completion.d/staqan-yt.bash
```

#### Arguments

- `<shell>` - Shell type: `bash`, `zsh`, or `auto` (auto-detect)

#### Options

- `--install` - Install completion to the appropriate system directory
- `--print` - Print completion script to stdout (default behavior)

#### Auto-Installation Paths

**Zsh:**
- Homebrew: `$(brew --prefix)/share/zsh/site-functions/_staqan-yt`
- User-specific: `~/.zsh/completion/_staqan-yt`

**Bash:**
- XDG-compliant: `${XDG_DATA_HOME:-$HOME/.local/share}/bash-completion/completions/staqan-yt`

#### Examples

```bash
# Install zsh completion (auto-detected)
staqan-yt config completion zsh --install
source ~/.zshrc

# Install bash completion
staqan-yt config completion bash --install
source ~/.bashrc

# Commands and flags
staqan-yt ge<Tab>                    # get-video, get-videos, get-channel…
staqan-yt get-video --<Tab>          # --output, --verbose

# Live YouTube data completion (requires default.channel to be set)
staqan-yt get-video --video-id <Tab>            # Video IDs with titles from your channel
staqan-yt get-playlist --playlist-id <Tab>         # Playlist IDs with titles
staqan-yt list-report-jobs --type <Tab>  # Report type IDs

# Static value completion
staqan-yt get-video --output <Tab>   # json  table  text  pretty  csv
staqan-yt list-comments --sort <Tab> # top  new
staqan-yt get-caption --format <Tab> # srt  vtt  sbv  srv2  ttml  json
```

Dynamic completion caches results locally for 5 minutes (report types: 1 hour), so it stays fast on repeated presses.

#### Enabling Completions

After installation, reload your shell:

**Zsh:**
```bash
source ~/.zshrc
```

**Bash:**
```bash
source ~/.bashrc
```

Or add to your shell startup file:

**Zsh (`~/.zshrc`):**
```bash
# Add zsh completion directory to fpath
fpath=($(brew --prefix)/share/zsh/site-functions $fpath)
autoload -U compinit && compinit
```

**Bash (`~/.bashrc`):**
```bash
# Load bash completions
if [[ -d /usr/local/share/bash-completion/completions ]]; then
  source /usr/local/share/bash-completion/completions/staqan-yt
fi
```

---

## MCP Server Integration

The Model Context Protocol (MCP) allows this CLI to expose tools to AI assistants like Claude Desktop. Instead of remembering command syntax, you can use natural language.

### What is MCP?

- **Protocol** for AI assistants to use tools
- **Standardized** interface across applications
- **Context-aware** - remembers conversation history
- **Natural language** - no command syntax needed

### Setup for Claude Desktop

**1. Install the CLI globally**

```bash
brew install staqan-yt
```

**2. Configure Claude Desktop**

Add to your Claude Desktop MCP settings:

**macOS:** `~/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "staqan-yt": {
      "command": "staqan-yt",
      "args": ["mcp"]
    }
  }
}
```

**3. Restart Claude Desktop**

**4. Start chatting**

```
You: "Get information about video dQw4w9WgXcQ"
Claude: [Uses youtube_get_video tool and shows results]

You: "List the 10 most recent videos from @mkbhd"
Claude: [Uses youtube_list_videos tool]

You: "Search for videos about 'iPhone' in @mkbhd's channel"
Claude: [Uses youtube_search_videos tool]
```

### Available MCP Tools

**Video Operations:**
- `youtube_get_video` - Get detailed metadata for a single video
- `youtube_get_videos` - Get metadata for multiple videos
- `youtube_list_videos` - List all videos from a channel
- `youtube_search_videos` - Search for videos on YouTube
- `youtube_update_video` - Update video title and/or description

**Localizations:**
- `youtube_get_localization` - Get specific language localization
- `youtube_get_all_localizations` - Get all available localizations
- `youtube_create_localization` - Create new localization for a language
- `youtube_update_localization` - Update existing localization

**Analytics:**
- `youtube_get_channel_analytics` - Get channel-level analytics
- `youtube_get_video_analytics` - Get performance metrics
- `youtube_get_search_terms` - Get YouTube search terms for a video
- `youtube_get_channel_search_terms` - Get top search keywords for channel
- `youtube_get_traffic_sources` - Get traffic source breakdown
- `youtube_get_video_retention` - Get audience retention curve

**Reporting API (Thumbnail CTR & Bulk Reports):**
- `youtube_list_report_types` - List available report types
- `youtube_list_report_jobs` - List report jobs with status
- `youtube_get_report_data` - Get report data including thumbnail CTR
- `youtube_fetch_reports` - Download and cache reports for archival

**Tags & Thumbnails:**
- `youtube_get_video_tags` - Get video tags
- `youtube_update_video_tags` - Update tags (add, remove, replace)
- `youtube_get_thumbnail` - Get thumbnail URLs in all qualities

**Playlists:**
- `youtube_list_playlists` - List channel playlists
- `youtube_get_playlist` - Get specific playlist details
- `youtube_get_playlists` - Get multiple playlists

**Comments & Captions:**
- `youtube_list_comments` - List video comments
- `youtube_list_captions` - List caption tracks
- `youtube_get_caption` - Download caption content

### Benefits of MCP Integration

- **Natural language interface** - No need to remember command syntax
- **Batch operations** - Process multiple videos in one conversation
- **Context awareness** - Claude remembers previous results
- **AI-powered workflows** - Combine YouTube operations with other tasks
- **Error handling** - Claude can interpret errors and suggest fixes

### Example Conversations

**Batch update video titles:**
```
You: "Update the titles of my last 10 videos to include '[2026]'"
Claude: [Lists videos, asks for confirmation]
You: "Yes"
Claude: [Updates all 10 videos with confirmation]
```

**Analyze performance:**
```
You: "Which of my videos have the highest CTR?"
Claude: [Gets CTR data, analyzes, presents top performers]
You: "What patterns do you notice in the thumbnails?"
Claude: [Downloads thumbnails, provides analysis]
```

**Content research:**
```
You: "What search terms drive traffic to my channel?"
Claude: [Gets channel search terms, presents findings]
You: "What about videos about 'craft beer'?"
Claude: [Searches, analyzes, provides insights]
```

### Troubleshooting MCP

**"MCP server not found":**
- Verify CLI is installed: `staqan-yt --version`
- Check config file path and syntax
- Restart Claude Desktop

**"Tools not available":**
- Check MCP server is running in Claude logs
- Verify auth: `staqan-yt auth`
- Check verbose logs: `staqan-yt mcp --verbose`

**Performance issues:**
- MCP server is lightweight and fast
- Slow performance may indicate network issues
- Check YouTube API quota

### Advanced Configuration

**Custom timeout:**
```json
{
  "mcpServers": {
    "staqan-yt": {
      "command": "staqan-yt",
      "args": ["mcp"],
      "env": {
        "TIMEOUT": "30000"
      }
    }
  }
}
```

**Debug mode:**
```json
{
  "mcpServers": {
    "staqan-yt": {
      "command": "staqan-yt",
      "args": ["mcp", "--verbose"]
    }
  }
}
```

---

## Common Patterns

### Initial Setup

```bash
# 1. Set up credentials
mkdir -p ~/.staqan-yt-cli
cp ~/Downloads/client_secret_*.json ~/.staqan-yt-cli/credentials.json

# 2. Authenticate
staqan-yt auth

# 3. Set defaults
staqan-yt config set default.channel @yourchannel
staqan-yt config set default.output csv

# 4. Verify
staqan-yt config show
staqan-yt list-videos --limit 1
```

### Switch Between Channels

```bash
# Work on channel A
staqan-yt config set default.channel @channelA
staqan-yt list-videos --limit 10

# Switch to channel B
staqan-yt config set default.channel @channelB
staqan-yt list-videos --limit 10
```

### Reset Configuration

```bash
# View current config
staqan-yt config show

# Delete specific value
staqan-yt config delete default.channel

# Or manually edit
rm ~/.staqan-yt-cli/config.json
staqan-yt config set default.channel @yourchannel
```

### MCP Testing

```bash
# Test MCP server locally
staqan-yt mcp

# Should see JSON-RPC protocol messages
# Press Ctrl+C to exit
```

## Tips

1. **Set defaults** for frequently used options
2. **Use MCP** for natural language interactions
3. **Check config** before troubleshooting
4. **Re-authenticate** if authentication fails
5. **Use verbose mode** to debug issues

## File Structure

```
~/.staqan-yt-cli/
├── credentials.json    # OAuth client credentials (you create)
├── token.json          # Authentication token (auto-generated)
├── config.json         # Your configuration
└── data/               # Cached report data
    ├── cache-index.json
    └── reports/         # Cached reports by type
```

## Security Notes

- **Never commit** credentials or tokens to version control
- **Keep credentials secure** - they grant access to your YouTube account
- **Tokens auto-refresh** - no need to manually update
- **Revoke access** in Google Account settings if needed

## Troubleshooting

### Credentials Issues

```bash
# Check credentials file
cat ~/.staqan-yt-cli/credentials.json

# Should contain:
# - client_id
# - client_secret
# - auth_uri
# - token_uri
```

### Configuration Issues

```bash
# View configuration
staqan-yt config show

# Reset to defaults
rm ~/.staqan-yt-cli/config.json
```

### MCP Issues

```bash
# Test MCP server
staqan-yt mcp --verbose

# Check CLI is working
staqan-yt --version
staqan-yt auth
```

## API Quota Costs

Configuration commands quota usage:
- **auth**: 0 units (authentication only)
- **config**: 0 units (local file operations)
- **mcp**: Depends on tools called via MCP
