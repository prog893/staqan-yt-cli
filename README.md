# staqan-yt-cli

A powerful command-line interface for managing YouTube videos and metadata using the YouTube Data API v3.

## Features

- **Video Management** - List, search, and update video metadata
- **Channel Analytics** - Access detailed analytics and performance reports
- **Thumbnail CTR Data** - Get thumbnail impressions and click-through rates
- **Report Archival** - Cache reports to prevent data loss from YouTube's 30-60 day expiration
- **Multiple Output Formats** - JSON, CSV, table, text, or pretty output
- **Shell Completions** - Tab completion for bash and zsh
- **MCP Server** - Integrate with AI assistants like Claude Desktop

## Installation

### Homebrew (Recommended)

```bash
brew tap prog893/staqan-yt https://github.com/prog893/staqan-yt-cli.git
brew install staqan-yt
```

### Install from Source

```bash
git clone https://github.com/prog893/staqan-yt-cli.git
cd staqan-yt-cli
bun install
bun build ./bin/staqan-yt.ts --compile --outfile staqan-yt
sudo mv staqan-yt /usr/local/bin/
```

## Upgrading from v1.2.x?

**Important:** v1.3.0 introduces breaking changes. All commands now use required named flags instead of positional arguments.

See [BREAKING-CHANGES.md](BREAKING-CHANGES.md) for detailed migration guide.

## Quick Start

### 1. Set up OAuth Credentials

Create a Google Cloud Project and enable the YouTube Data API v3, then create OAuth 2.0 credentials:

```bash
# Save your credentials to the standard location
mkdir -p ~/.staqan-yt-cli
cp ~/Downloads/client_secret_*.json ~/.staqan-yt-cli/credentials.json
```

### 2. Authenticate

```bash
staqan-yt auth
```

### 3. Start Using

```bash
# List videos from a channel
staqan-yt list-videos --channel @mkbhd --limit 10

# Get video information
staqan-yt get-video --video-id dQw4w9WgXcQ

# Search within a channel
staqan-yt search-videos --query "iPhone" --channel @mkbhd

# Get analytics
staqan-yt get-video-analytics --video-id dQw4w9WgXcQ --output csv

# Archive thumbnail CTR reports
staqan-yt fetch-reports --type=channel_reach_basic_a1
```

## Global Options

```bash
# Show version (takes precedence over all other arguments)
staqan-yt --version
staqan-yt -V

# Quiet mode - suppress informational messages
staqan-yt --quiet list-videos --channel @yourchannel
staqan-yt -q get-video --video-id VIDEO_ID --output json

# Verbose mode - show technical debug messages
staqan-yt --verbose list-videos --channel @yourchannel
staqan-yt -v update-video --video-id VIDEO_ID --title "New Title"
```

## Configuration

Set defaults to avoid repeating common options:

```bash
# Set default channel
staqan-yt config set default.channel @yourchannel

# Set default output format
staqan-yt config set default.output csv

# Now commands use your defaults
staqan-yt list-videos --limit 5  # Uses @yourchannel
```

## Shell Completions

Enable tab completion for commands, options, and live YouTube data:

```bash
# Auto-install completions (detects zsh or bash)
staqan-yt config completion auto --install

# Or specify shell explicitly
staqan-yt config completion zsh --install
staqan-yt config completion bash --install

# Reload your shell
source ~/.zshrc  # or source ~/.bashrc
```

Once enabled, tab completion works at every level:

```bash
staqan-yt ge<Tab>                         # Commands: get-video, get-videos, get-channel…
staqan-yt get-video --video-id <Tab>     # Live video IDs with titles from your channel
staqan-yt get-playlist --playlist-id <Tab>  # Live playlist IDs with titles
staqan-yt list-report-jobs --type <Tab>   # Live report type IDs
staqan-yt get-video --output <Tab>        # json  table  text  pretty  csv
```

Dynamic ID completion uses your configured default channel and caches results locally for 5 minutes, so it stays fast. Set your channel first:

```bash
staqan-yt config set default.channel @yourchannel
```

**Note:** Shell completions are automatically installed when using Homebrew.

## MCP Server Integration

Connect with Claude Desktop for natural language YouTube management:

**Add to `~/Claude/claude_desktop_config.json`:**
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

**Then use natural language:**
- "Get information about video dQw4w9WgXcQ"
- "List the 10 most recent videos from @mkbhd"
- "Search for videos about 'craft beer' in my channel"

## Common Use Cases

### Batch Update Video Titles

```bash
staqan-yt --quiet list-videos --channel @mychannel --output json | \
  jq -r '.[].id' | \
  xargs -I {} staqan-yt update-video --video-id {} --title "New Title" --yes
```

### Export Analytics to CSV

```bash
staqan-yt --quiet list-videos --channel @mychannel --output json | \
  jq -r '.[].id' | \
  xargs -I {} staqan-yt get-video-analytics --video-id {} --output csv > analytics.csv
```

### Archive All Reports

```bash
# Download and cache all available reports
staqan-yt fetch-reports

# Verify cached files
staqan-yt fetch-reports --verify
```

## Documentation

**[📚 Full Command Reference](docs/README.md)** - Complete documentation for all commands

**Key Documentation:**
- [Setup & Installation](docs/setup.md) - Detailed installation instructions
- [Shell Completions](docs/setup.md#shell-completions) - Enable tab completion
- [Command Reference](docs/README.md#commands) - All commands organized by purpose
- [Output Formats](docs/output-formats.md) - JSON, CSV, table, text, pretty
- [Troubleshooting](docs/troubleshooting.md) - Common issues and solutions
- [MCP Integration](docs/configuration.md#mcp-server-integration) - AI assistant integration

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Development setup
- Code conventions
- CLI patterns
- Testing guidelines

## License

MIT

## Support

For issues and feature requests, please create an issue on [GitHub](https://github.com/prog893/staqan-yt-cli/issues).

---

**Note:** This CLI uses the YouTube Data API v3. Make sure you comply with [YouTube's Terms of Service](https://www.youtube.com/t/terms) and [API Terms of Service](https://developers.google.com/youtube/terms/api-services-terms-of-service).
