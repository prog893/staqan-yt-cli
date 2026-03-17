# TypeScript Guide

This guide covers TypeScript patterns, type safety, and ESLint configuration for the staqan-yt-cli project.

## TypeScript Configuration

This project uses TypeScript with strict type checking enabled. Key configuration from `tsconfig.json`:

- **Target**: ES2020 (Node.js appropriate)
- **Module**: CommonJS (for CLI compatibility)
- **Strict mode**: enabled
- **Output directory**: `dist/`
- **Source maps and declaration files**: enabled

### Build Process

```bash
npm run build         # Compile TypeScript to dist/
npm run type-check    # Type checking without emit
npm run lint          # Run ESLint
npm run dev           # Development mode with tsx
```

## Type Safety Guidelines

### ⚠️ ZERO `any` TOLERANCE

**Never use `any` type.** It defeats TypeScript's entire purpose. This is a hard rule.

```typescript
// ❌ NEVER
function handler(...args: any[]): any { ... }
const data: any = response;

// ✅ Use specific types
function handler(videoId: string, options: VideoOptions): Promise<void> { ... }
const data: VideoInfo = response;

// ✅ If type is truly unknown, use `unknown` + type guard
function handler(input: unknown): void {
  if (typeof input === 'string') { ... }
}

// ✅ For external/untyped data, use a specific interface even if partial
interface ApiResponse { items?: Item[] }
```

If you find yourself reaching for `any`, use `unknown` with a type guard, or define a proper interface.

### Use Strict Types Everywhere

```typescript
// Good - explicit types
async function getVideoInfo(videoIds: string[]): Promise<VideoInfo[]> {
  // ...
}

// Avoid - implicit any
async function getVideoInfo(videoIds) {
  // ...
}
```

### Leverage Shared Types

Use shared types from `types/index.ts`:

```typescript
import { VideoInfo, VideoLocalization, JsonOption } from '../types';

async function videoInfoCommand(videoIds: string[], options: JsonOption): Promise<void> {
  const videos: VideoInfo[] = await getVideoInfo(videoIds);
  // ...
}
```

### Use Non-Null Assertions Sparingly

Prefer optional chaining and nullish coalescing:

```typescript
// Prefer optional chaining
const title = video.snippet?.title || 'Untitled';

// Only use ! when you're absolutely certain
const channelId = response.data.items![0].id!;
```

### Type API Responses Properly

```typescript
import { youtube_v3 } from 'googleapis';

async function getVideoWithLocalizations(videoId: string): Promise<youtube_v3.Schema$Video> {
  // Uses googleapis type definitions
}
```

## ESLint Configuration

ESLint is configured with TypeScript support (flat config format):
- **Parser**: `@typescript-eslint/parser`
- **Plugin**: `@typescript-eslint/eslint-plugin`
- **Rules**: Optimized for Node.js CLI development

### Running Linter

```bash
npm run lint          # Check all files
```

## Common TypeScript Patterns for CLI

### Command Modules Use `export =`

Command modules use CommonJS export:

```typescript
import ora from 'ora';
import { getVideoInfo } from '../lib/youtube';
import { JsonOption } from '../types';

async function videoInfoCommand(videoIds: string[], options: JsonOption): Promise<void> {
  // Command logic
}

export = videoInfoCommand;
```

### Type Error Handling

```typescript
try {
  // ...
} catch (err) {
  error((err as Error).message);
  process.exit(1);
}
```

### Type Commander.js Options

```typescript
interface UpdateVideoOptions {
  title?: string;
  description?: string;
  dryRun?: boolean;
  yes?: boolean;
}

async function updateMetadataCommand(videoId: string, options: UpdateVideoOptions): Promise<void> {
  // ...
}
```

## Non-Null Assertion Usage

**ESLint Rule**: `@typescript-eslint/no-non-null-assertion` is set to `'off'`

### Rationale

Non-null assertions (`!`) are used intentionally throughout the codebase, particularly in `lib/youtube.ts`, when working with YouTube API responses from the `googleapis` library.

### Why This Is Safe

1. **Explicit validation precedes all assertions**: Properties are validated before using `!`
   ```typescript
   // Good: Validate first, then assert
   if (response.data.items && response.data.items.length > 0) {
     const title = response.data.items[0].snippet!.title!;  // Safe!
   }
   ```

2. **YouTube API contract**: The YouTube Data API v3 guarantees certain properties exist when specific conditions are met
   - Example: If `items` array has elements, each `item.snippet` is guaranteed to exist

3. **googleapis type definitions**: The official TypeScript definitions use optional types extensively (`property?: type`), even for required fields

4. **Readability**: Using `!` after validation is more concise than repeated null checks

### Pattern to Follow

```typescript
// Good: Validate first, then assert
if (response.data.items && response.data.items.length > 0) {
  const title = response.data.items[0].snippet!.title!;  // Safe!
}

// Bad: Assert without validation
const title = response.data.items![0].snippet!.title!;  // Unsafe!
```

### When Adding New Code

- Always validate before asserting
- If unsure whether a property can be null, use optional chaining (`?.`) instead
- Prefer explicit checks over assertions for user input or external data

## Troubleshooting TypeScript Errors

### "Cannot find module" Errors

```bash
# Solution: Check imports use correct paths
import { getVideoInfo } from '../lib/youtube';  # Correct
import { getVideoInfo } from '../lib/youtube.ts';  # Wrong - no .ts extension
```

### Type Errors with googleapis

```typescript
// Use optional chaining and non-null assertions carefully
const channelId = response.data.items?.[0]?.snippet?.channelId;
if (!channelId) {
  throw new Error('Channel not found');
}
```

### ESLint Errors

```bash
npm run lint          # See all errors
# Fix common issues:
# - Unused imports: Remove them
# - Unused variables: Prefix with _ if intentional
# - any type: Add proper types
```

### Build Errors

```bash
# Clean build and try again
rm -rf dist/
npm run build

# Check for syntax errors in .ts files
npm run type-check
```

## Related Guides

- [Adding Commands Guide](adding-commands.md) - Command creation patterns
- [Error Handling Guide](error-handling.md) - Error type patterns
- [Troubleshooting Guide](troubleshooting.md) - Build and type error resolution
- [Architecture Guide](architecture.md) - Type system architecture
