/**
 * Shell autocompletion utilities for staqan-yt CLI
 * Provides completion script generation and installation for bash and zsh
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { success, error } from './utils';

export type ShellType = 'bash' | 'zsh' | 'auto';

/**
 * Get list of all commands for completion
 */
export function getCommands(): string[] {
  return [
    // Core commands
    'auth',
    'config',
    'help',
    // Video discovery
    'get-video',
    'get-videos',
    'list-videos',
    'search-videos',
    // Channel operations
    'get-channel',
    // Metadata management
    'update-video',
    'get-video-localizations',
    'get-video-localization',
    'put-video-localization',
    'update-video-localization',
    // Analytics
    'get-video-analytics',
    'get-search-terms',
    'get-traffic-sources',
    'get-video-retention',
    'get-channel-analytics',
    'get-channel-search-terms',
    // Engagement
    'list-comments',
    // Content management
    'get-video-tags',
    'update-video-tags',
    'get-thumbnail',
    'list-captions',
    'get-caption',
    // Playlists
    'get-playlist',
    'get-playlists',
    'list-playlists',
    // Reporting API
    'list-report-types',
    'list-report-jobs',
    'get-report-data',
    'fetch-reports',
    // Configuration
    'mcp',
  ];
}

/**
 * Get list of global options for completion
 */
export function getGlobalOptions(): string[] {
  return [
    '--help',
    '--output',
    '--verbose',
  ];
}

/**
 * Get command-specific options for completion
 */
export function getCommandOptions(command: string): string[] {
  const outputOptions = ['--output', 'json', 'table', 'text', 'pretty', 'csv'];
  const verboseOption = ['--verbose', '-v'];

  const commandOptionMap: Record<string, string[]> = {
    'auth': [...outputOptions, ...verboseOption],
    'config': ['--show', ...outputOptions, ...verboseOption],
    'get-video': [...outputOptions, ...verboseOption],
    'get-videos': [...outputOptions, ...verboseOption],
    'list-videos': ['--limit', '-l', '--type', '-t', ...outputOptions, ...verboseOption],
    'search-videos': ['--global', '-g', '--channel', '-c', '--limit', '-l', ...outputOptions, ...verboseOption],
    'get-channel': [...outputOptions, ...verboseOption],
    'update-video': ['--title', '-t', '--description', '-d', '--dry-run', '--yes', '-y', ...outputOptions, ...verboseOption],
    'get-video-localizations': ['--languages', ...outputOptions, ...verboseOption],
    'get-video-localization': ['--language', ...outputOptions, ...verboseOption],
    'put-video-localization': ['--language', '--title', '--description', ...outputOptions, ...verboseOption],
    'update-video-localization': ['--language', '--title', '--description', ...outputOptions, ...verboseOption],
    'get-video-analytics': ['--start-date', '--end-date', '--metrics', ...outputOptions, ...verboseOption],
    'get-search-terms': ['--limit', '-l', ...outputOptions, ...verboseOption],
    'get-traffic-sources': [...outputOptions, ...verboseOption],
    'get-video-retention': [...outputOptions, ...verboseOption],
    'get-channel-analytics': ['--report', '--start-date', '--end-date', '--dimensions', '--metrics', ...outputOptions, ...verboseOption],
    'get-channel-search-terms': ['--limit', '-l', '--content-type', '--start-date', '--end-date', ...outputOptions, ...verboseOption],
    'list-comments': ['--limit', '-l', '--sort', '-s', ...outputOptions, ...verboseOption],
    'get-video-tags': [...outputOptions, ...verboseOption],
    'update-video-tags': ['--tags', '--add', '--remove', '--dry-run', '--yes', '-y', ...outputOptions, ...verboseOption],
    'get-thumbnail': ['--quality', ...outputOptions, ...verboseOption],
    'get-playlist': [...outputOptions, ...verboseOption],
    'get-playlists': [...outputOptions, ...verboseOption],
    'list-playlists': ['--limit', '-l', ...outputOptions, ...verboseOption],
    'list-captions': [...outputOptions, ...verboseOption],
    'get-caption': ['--format', ...verboseOption],
    'list-report-types': ['--output', 'json', 'table', 'text', ...verboseOption],
    'list-report-jobs': ['--type', '--output', 'json', 'table', 'text', ...verboseOption],
    'get-report-data': ['--type', '--video-id', '--start-date', '--end-date', '--output', 'json', 'csv', ...verboseOption],
    'fetch-reports': ['--type', '-t', '--types', '-T', '--start-date', '--end-date', '--force', '-f', '--verify', ...verboseOption],
  };

  return commandOptionMap[command] || [...outputOptions, ...verboseOption];
}

/**
 * Detect the current shell
 */
export function detectShell(): ShellType {
  const shell = process.env.SHELL;

  if (shell) {
    if (shell.includes('zsh')) return 'zsh';
    if (shell.includes('bash')) return 'bash';
  }

  // Try to detect using ps
  try {
    const psOutput = execSync('ps -p $$ -o comm=', { encoding: 'utf-8' }).trim();
    if (psOutput.includes('zsh')) return 'zsh';
    if (psOutput.includes('bash')) return 'bash';
  } catch {
    // Ignore error
  }

  // Default to zsh (default on macOS since Catalina)
  return 'zsh';
}

/**
 * Get the installation path for a completion script
 */
export function getCompletionPath(shell: 'bash' | 'zsh'): string {
  if (shell === 'bash') {
    const dataDir = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local/share');
    return path.join(dataDir, 'bash-completion/completions/staqan-yt');
  }

  if (shell === 'zsh') {
    // Check if using Homebrew zsh
    let brewPrefix = process.env.HOMEBREW_PREFIX;
    if (!brewPrefix) {
      try {
        brewPrefix = execSync('brew --prefix', { encoding: 'utf-8' }).trim();
      } catch {
        // Homebrew not found, use user directory
      }
    }

    if (brewPrefix) {
      return path.join(brewPrefix, 'share/zsh/site-functions/_staqan-yt');
    }
    return path.join(os.homedir(), '.zsh/completion/_staqan-yt');
  }

  throw new Error(`Unsupported shell: ${shell}`);
}

/**
 * Generate bash completion script
 */
function generateBashCompletion(): string {
  const commands = getCommands().join(' ');
  return `# staqan-yt bash completion
# Generated by staqan-yt config completion

_staqa_nyt_completion() {
  local cur prev words cword
  _init_completion || return

  # Global options
  local global_options="--help --output --verbose"

  # Command-specific options
  case "\${prev}" in
    --output)
      COMPREPLY=( \$(compgen -W "json table text pretty csv" -- "\${cur}") )
      return
      ;;
    staqan-yt)
      COMPREPLY=( \$(compgen -W "${commands}" -- "\${cur}") )
      return
      ;;
    get-video|get-videos|get-channel|get-video-localizations|get-video-localization|get-playlist|get-playlists|list-captions|get-caption)
      COMPREPLY=( \$(compgen -W "--output --verbose" -- "\${cur}") )
      ;;
    list-videos|list-playlists|list-comments)
      COMPREPLY=( \$(compgen -W "--limit --type --sort --channel --output --verbose" -- "\${cur}") )
      ;;
    search-videos)
      COMPREPLY=( \$(compgen -W "--global --channel --limit --output --verbose" -- "\${cur}") )
      ;;
    update-video|update-video-tags)
      COMPREPLY=( \$(compgen -W "--title --description --tags --add --remove --dry-run --yes --output --verbose" -- "\${cur}") )
      ;;
    get-video-analytics|get-channel-analytics)
      COMPREPLY=( \$(compgen -W "--start-date --end-date --metrics --report --dimensions --output --verbose" -- "\${cur}") )
      ;;
    get-thumbnail)
      COMPREPLY=( \$(compgen -W "--quality --output --verbose" -- "\${cur}") )
      ;;
    config)
      COMPREPLY=( \$(compgen -W "set get list completion --show --output --verbose" -- "\${cur}") )
      ;;
    *)
      ;;
  esac

  # Default completion for options
  if [[ "\${cur}" == -* ]]; then
    COMPREPLY=( \$(compgen -W "\${global_options}" -- "\${cur}") )
  fi
}

complete -F _staqa_nyt_completion staqan-yt
`;
}

/**
 * Generate zsh completion script
 */
function generateZshCompletion(): string {
  const commands = getCommands();
  const commandDescriptions: Record<string, string> = {
    'auth': 'Authenticate with YouTube API',
    'config': 'Manage CLI configuration',
    'help': 'Show help information',
    'get-video': 'Get metadata for a single video',
    'get-videos': 'Get metadata for multiple videos',
    'list-videos': 'List videos from a channel',
    'search-videos': 'Search for videos',
    'get-channel': 'Get channel metadata',
    'update-video': 'Update video metadata',
    'get-video-localizations': 'Get all video localizations',
    'get-video-localization': 'Get specific video localization',
    'put-video-localization': 'Create new localization',
    'update-video-localization': 'Update existing localization',
    'get-video-analytics': 'Get video analytics',
    'get-search-terms': 'Get search terms for a video',
    'get-traffic-sources': 'Get traffic sources',
    'get-video-retention': 'Get audience retention',
    'get-channel-analytics': 'Get channel analytics',
    'get-channel-search-terms': 'Get channel search terms',
    'list-comments': 'List video comments',
    'get-video-tags': 'Get video tags',
    'update-video-tags': 'Update video tags',
    'get-thumbnail': 'Get thumbnail URLs',
    'get-playlist': 'Get single playlist',
    'get-playlists': 'Get multiple playlists',
    'list-playlists': 'List channel playlists',
    'list-captions': 'List caption tracks',
    'get-caption': 'Download caption content',
    'list-report-types': 'List available report types',
    'list-report-jobs': 'List report jobs',
    'get-report-data': 'Get report data',
    'fetch-reports': 'Download and cache reports',
    'mcp': 'Start MCP server',
  };

  const commandList = commands.map(cmd => {
    const desc = commandDescriptions[cmd] || 'Command';
    return `      '${cmd}:${desc}'`;
  }).join('\n');

  return `#compdef staqan-yt
# staqan-yt zsh completion
# Generated by staqan-yt config completion

_staqa_nyt() {
  local -a commands

  # Define commands with descriptions
  commands=(
${commandList}
  )

  # Define arguments for specific commands
  case \$words[2] in
    config)
      _staqa_nyt_config
      return
      ;;
    get-video|get-videos|get-channel|get-video-localizations|get-video-localization|get-playlist|get-playlists|list-captions|get-caption)
      _arguments \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]' \\
        '*::filename:_files'
      ;;
    list-videos|list-playlists|list-comments)
      _arguments \\
        '--limit[Limit number of results]' \\
        '--type[Filter by type]' \\
        '--sort[Sort order]' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    search-videos)
      _arguments \\
        '--global[Search all of YouTube]' \\
        '--channel[Search within specific channel]' \\
        '--limit[Limit number of results]' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    update-video|update-video-tags)
      _arguments \\
        '--title[Video title]' \\
        '--description[Video description]' \\
        '--tags[Tags to set]' \\
        '--add[Tags to add]' \\
        '--remove[Tags to remove]' \\
        '--dry-run[Preview changes]' \\
        '--yes[Skip confirmation]' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-video-analytics|get-channel-analytics)
      _arguments \\
        '--start-date[Start date (YYYY-MM-DD)]' \\
        '--end-date[End date (YYYY-MM-DD)]' \\
        '--metrics[Metrics to fetch]' \\
        '--report[Report type]' \\
        '--dimensions[Dimensions]' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-thumbnail)
      _arguments \\
        '--quality[Thumbnail quality]' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    *)
      _describe 'command' commands
      ;;
  esac
}

_staqa_nyt_config() {
  local -a config_actions
  config_actions=(
    'set:Set a configuration value'
    'get:Get a configuration value'
    'list:List all configuration'
    'completion:Generate shell completion'
  )

  local -a config_keys=(
    'default.channel:Default channel handle'
    'default.output:Default output format'
  )

  if (( CURRENT == 3 )); then
    _describe 'action' config_actions
  elif (( CURRENT == 4 )); then
    case \$words[3] in
      set)
        _describe 'key' config_keys ;;
      get)
        _describe 'key' config_keys ;;
      completion)
        _values 'shell' bash zsh auto ;;
    esac
  fi
}

_staqa_nyt "$@"
`;
}

/**
 * Get completion script content for a shell
 */
export function getCompletionScript(shell: 'bash' | 'zsh'): string {
  switch (shell) {
    case 'bash':
      return generateBashCompletion();
    case 'zsh':
      return generateZshCompletion();
    default:
      throw new Error(`Unsupported shell: ${shell}`);
  }
}

/**
 * Install completion script to the appropriate location
 */
export async function installCompletion(
  shell: 'bash' | 'zsh',
  printOnly: boolean = false
): Promise<void> {
  const script = getCompletionScript(shell);

  if (printOnly) {
    console.log(script);
    return;
  }

  const targetPath = getCompletionPath(shell);

  try {
    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(targetPath), { recursive: true });

    // Write completion script
    await fs.writeFile(targetPath, script, { mode: 0o644 });

    success(`Installed ${shell} completion to ${targetPath}`);
    console.log('');
    console.log('To enable completions, reload your shell or run:');
    if (shell === 'zsh') {
      console.log('  source ~/.zshrc');
      console.log('');
      console.log('Or add this to your ~/.zshrc:');
      console.log(`  fpath=(${path.dirname(targetPath)} \$fpath)`);
      console.log('  autoload -U compinit && compinit');
    } else {
      console.log('  source ~/.bashrc');
    }
  } catch (err) {
    error(`Failed to install completion: ${(err as Error).message}`);
    throw err;
  }
}
