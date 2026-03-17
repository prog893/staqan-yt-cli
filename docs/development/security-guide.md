# Security Guide

This guide covers security best practices for the staqan-yt-cli project.

## OAuth Token Security

### Token Storage

Tokens are stored in `~/.staqan-yt-cli/token.json`:

```json
{
  "access_token": "...",
  "refresh_token": "...",
  "token_type": "Bearer",
  "expiry_date": 1234567890
}
```

### File Permissions

Token files should have restrictive permissions (read/write for user only).

### Security Rules

1. **Never log tokens**: Don't output tokens to console or logs
2. **Auto-refresh expired tokens**: Handle token expiration gracefully
3. **Secure storage**: Use the standard `~/.staqan-yt-cli/` location
4. **Don't commit tokens**: Never include credentials in the repository

## Input Validation

### Validate Video IDs

```typescript
// Video IDs are 11 characters, alphanumeric + - _
if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
  error('Invalid video ID format. Video IDs must be 11 characters.');
  process.exit(1);
}
```

### Validate Channel Handles

```typescript
// Channel handles start with @
if (!channelHandle.startsWith('@')) {
  error('Invalid channel handle. Channel handles must start with @');
  process.exit(1);
}
```

### Validate Required Parameters

```typescript
if (!options.title && !options.description) {
  error('At least one of --title or --description must be provided');
  process.exit(1);
}
```

### Sanitize User Input

```typescript
// Trim whitespace
const title = options.title?.trim();

// Escape HTML if outputting to web
const escapedTitle = escapeHtml(title);

// Validate ranges
if (limit && (limit < 1 || limit > 50)) {
  error('Limit must be between 1 and 50');
  process.exit(1);
}
```

## Credential Management

### Credentials Location

All credentials are stored in: `~/.staqan-yt-cli/`

```
~/.staqan-yt-cli/
├── credentials.json      # OAuth 2.0 client credentials
├── token.json            # User access/refresh tokens
└── config.json           # User configuration
```

### Never Store Credentials In:

- ❌ The repository
- ❌ Project directories
- ❌ Environment variables (use the centralized location)
- ❌ Code files

## API Security

### Use HTTPS Only

All YouTube API calls use HTTPS via the `googleapis` library.

### Scope Management

Only request necessary scopes:

```typescript
const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',      // Read operations
  'https://www.googleapis.com/auth/youtube.force-ssl',     // Write operations
];
```

Don't request broader scopes than needed.

### Quota Management

- Respect API quota limits (10,000 units/day)
- Implement caching to reduce API calls
- Use batch operations when possible
- Handle quota exceeded errors gracefully

## File Operation Security

### Lock Strategy

Use file-based locks to prevent concurrent writes:

```typescript
import { acquireLock, getLockPath } from '../lib/lock';

async function writeSomething(): Promise<void> {
  const lockPath = getLockPath('completion_cache', channelId);
  let release: (() => Promise<void>) | null = null;

  try {
    release = await acquireLock(lockPath, { timeout: 5000 });
    // ... write operations ...
  } finally {
    if (release) await release();
  }
}
```

See [Architecture Guide](architecture.md#lock-strategy) for details.

## Code Security

### Avoid Command Injection

```typescript
// ❌ NEVER: Direct command execution
const exec = require('child_process').exec;
exec(`youtube-dl ${videoId}`);  // Dangerous!

// ✅ Use safe alternatives
const ytdl = require('ytdl-core');
const stream = ytdl(videoId);  // Safe
```

### Avoid Path Traversal

```typescript
import path from 'path';

// Validate file paths are within expected directory
const safePath = path.resolve(baseDir, userPath);
if (!safePath.startsWith(baseDir)) {
  throw new Error('Invalid path');
}
```

### Handle External Data Carefully

```typescript
// Validate API responses
if (!response.data.items || response.data.items.length === 0) {
  throw new Error('No results found');
}

// Type-check before using
const title = video.snippet?.title;
if (!title) {
  throw new Error('Video title missing');
}
```

## Dependency Security

### Keep Dependencies Updated

```bash
npm update
npm audit fix
```

### Monitor Dependabot Alerts

Check for vulnerabilities regularly:

```bash
gh api '/repos/prog893/staqan-yt-cli/dependabot/alerts?state=open'
```

See [Maintenance Guide](maintenance-guide.md#dependabot-vulnerability-management) for details.

## Security Checklist

Before committing code:

- [ ] No credentials in code
- [ ] Input validation on all user inputs
- [ ] Error messages don't expose sensitive data
- [ ] File paths are validated
- [ ] Lock strategy used for concurrent file access
- [ ] API scopes are minimal required
- [ ] No hardcoded secrets
- [ ] Dependencies are up to date

## Related Guides

- [Maintenance Guide](maintenance-guide.md) - Vulnerability management
- [Error Handling Guide](error-handling.md) - Security error patterns
- [Architecture Guide](architecture.md) - Lock strategy
