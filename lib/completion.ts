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
 * Get command-specific required flags for completion
 */
export function getRequiredFlags(command: string): string[] {
  const requiredFlagMap: Record<string, string[]> = {
    'get-video': ['--video-id'],
    'get-videos': ['--video-ids'],
    'update-video': ['--video-id'],
    'search-videos': ['--query'],
    'get-video-localizations': ['--video-ids'],
    'get-video-localization': ['--video-id'],
    'put-video-localization': ['--video-id'],
    'update-video-localization': ['--video-id'],
    'get-video-analytics': ['--video-id'],
    'get-search-terms': ['--video-id'],
    'get-traffic-sources': ['--video-id'],
    'get-video-retention': ['--video-id'],
    'get-video-tags': ['--video-id'],
    'update-video-tags': ['--video-id'],
    'get-thumbnail': ['--video-id'],
    'get-playlist': ['--playlist-id'],
    'get-playlists': ['--playlist-ids'],
    'list-comments': ['--video-id'],
    'list-captions': ['--video-id'],
    'get-caption': ['--caption-id'],
  };

  return requiredFlagMap[command] || [];
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
    'list-videos': ['--limit', '-l', '--type', '-t', '--privacy', ...outputOptions, ...verboseOption],
    'search-videos': ['--global', '-g', '--channel', '-c', '--limit', '-l', ...outputOptions, ...verboseOption],
    'get-channel': [...outputOptions, ...verboseOption],
    'update-video': ['--title', '-t', '--description', '-d', '--dry-run', '--yes', '-y', ...outputOptions, ...verboseOption],
    'get-video-localizations': ['--languages', ...outputOptions, ...verboseOption],
    'get-video-localization': ['--language', ...outputOptions, ...verboseOption],
    'put-video-localization': ['--language', '--title', '--description', ...outputOptions, ...verboseOption],
    'update-video-localization': ['--language', '--title', '--description', ...outputOptions, ...verboseOption],
    'get-video-analytics': ['--start-date', '--end-date', '--metrics', '--dimensions', '--all', ...outputOptions, ...verboseOption],
    'get-search-terms': ['--limit', '-l', ...outputOptions, ...verboseOption],
    'get-traffic-sources': [...outputOptions, ...verboseOption],
    'get-video-retention': [...outputOptions, ...verboseOption],
    'get-channel-analytics': ['--report', '--start-date', '--end-date', '--dimensions', '--metrics', ...outputOptions, ...verboseOption],
    'get-channel-search-terms': ['--channel', '--limit', '-l', '--content-type', '--start-date', '--end-date', ...outputOptions, ...verboseOption],
    'list-comments': ['--limit', '-l', '--sort', '-s', ...outputOptions, ...verboseOption],
    'get-video-tags': [...outputOptions, ...verboseOption],
    'update-video-tags': ['--tags', '--add', '--remove', '--dry-run', '--yes', '-y', ...outputOptions, ...verboseOption],
    'get-thumbnail': ['--quality', ...outputOptions, ...verboseOption],
    'get-playlist': [...outputOptions, ...verboseOption],
    'get-playlists': [...outputOptions, ...verboseOption],
    'list-playlists': ['--channel', '--limit', '-l', '--privacy', ...outputOptions, ...verboseOption],
    'list-captions': [...outputOptions, ...verboseOption],
    'get-caption': ['--format', ...verboseOption],
    'list-report-types': ['--output', 'json', 'table', 'text', ...verboseOption],
    'list-report-jobs': ['--type', '--output', 'json', 'table', 'text', ...verboseOption],
    'get-report-data': ['--type', '--video-id', '--start-date', '--end-date', '--output', 'json', 'csv', ...verboseOption],
    'fetch-reports': ['--channel', '--type', '-t', '--types', '-T', '--start-date', '--end-date', '--force', '-f', '--verify', ...verboseOption],
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

_staqan_yt_complete_type() {
  local ids
  ids=$(staqan-yt __complete --type "$1" 2>/dev/null | cut -f1)
  COMPREPLY=( $(compgen -W "$ids" -- "\${cur}") )
}

_staqa_nyt_completion() {
  local cur prev words cword
  _init_completion || return

  # Global options
  local global_options="--help --output --verbose"

  # Detect command name (first non-flag word after program)
  local cmd=""
  local i
  for ((i=1; i < cword; i++)); do
    if [[ "\${words[$i]}" != -* ]]; then
      cmd="\${words[$i]}"
      break
    fi
  done

  # Variadic flag scan: walk back to detect if we are still inside a
  # space-separated value list (e.g. --privacy public <TAB>, --video-ids abc <TAB>)
  if [[ "\${cur}" != -* ]]; then
    local j
    for ((j=cword-1; j>=1; j--)); do
      case "\${words[$j]}" in
        --privacy)
          # Forward-scan from the flag's position to cword-1 to collect
          # already-used values, then offer only the remaining ones.
          local -A _used=()
          local k
          for (( k=j+1; k<cword; k++ )); do
            _used["\${words[$k]}"]=1
          done
          local _rem=()
          for v in public private unlisted; do
            [[ -z "\${_used[$v]}" ]] && _rem+=("$v")
          done
          COMPREPLY=( \$(compgen -W "\${_rem[*]}" -- "\${cur}") ); return ;;
        public|private|unlisted)
          continue ;;
        --video-ids)
          _staqan_yt_complete_type video-id; return ;;
        --playlist-ids)
          _staqan_yt_complete_type playlist-id; return ;;
        --dimensions)
          # Forward-scan to collect already-used dimension values, offer remaining
          local -A _used_dims=()
          local k
          for (( k=j+1; k<cword; k++ )); do
            _used_dims["\${words[$k]}"]=1
          done
          local _rem_dims=()
          for v in country day month deviceType operatingSystem subscribedStatus ageGroup gender sharingService insightTrafficSourceType insightPlaybackLocationType liveOrOnDemand creatorContentType youtubeProduct province dma city; do
            [[ -z "\${_used_dims[$v]}" ]] && _rem_dims+=("$v")
          done
          COMPREPLY=( \$(compgen -W "\${_rem_dims[*]}" -- "\${cur}") ); return ;;
        country|day|month|deviceType|operatingSystem|subscribedStatus|ageGroup|gender|sharingService|insightTrafficSourceType|insightPlaybackLocationType|liveOrOnDemand|creatorContentType|youtubeProduct|province|dma|city)
          continue ;;
        -*)
          break ;;
        *)
          continue ;;
      esac
    done
  fi

  # Flag-based completion - complete after --video-id, --playlist-id, etc.
  case "\${prev}" in
    --video-id)
      _staqan_yt_complete_type video-id; return ;;
    --video-ids)
      _staqan_yt_complete_type video-id; return ;;
    --playlist-id)
      _staqan_yt_complete_type playlist-id; return ;;
    --playlist-ids)
      _staqan_yt_complete_type playlist-id; return ;;
    --channel|-c)
      COMPREPLY=( \$(compgen -W "\$(staqan-yt config get default.channel 2>/dev/null || echo '@')" -- "\${cur}") )
      return
      ;;
    --output)
      COMPREPLY=( \$(compgen -W "json table text pretty csv" -- "\${cur}") )
      return
      ;;
    --type)
      case "$cmd" in
        list-report-jobs|get-report-data|fetch-reports)
          _staqan_yt_complete_type report-type; return ;;
        list-videos)
          COMPREPLY=( \$(compgen -W "short regular" -- "\${cur}") ); return ;;
      esac
      ;;
    --privacy)
      COMPREPLY=( \$(compgen -W "public private unlisted" -- "\${cur}") ); return ;;
    --quality)
      COMPREPLY=( \$(compgen -W "maxres standard high medium default" -- "\${cur}") ); return ;;
    --sort|-s)
      COMPREPLY=( \$(compgen -W "top new" -- "\${cur}") ); return ;;
    --format)
      COMPREPLY=( \$(compgen -W "srt vtt sbv srv2 ttml json" -- "\${cur}") ); return ;;
    staqan-yt)
      COMPREPLY=( \$(compgen -W "${commands}" -- "\${cur}") )
      return
      ;;
    get-video)
      COMPREPLY=( \$(compgen -W "--video-id --output --verbose" -- "\${cur}") )
      ;;
    get-videos)
      COMPREPLY=( \$(compgen -W "--video-ids --output --verbose" -- "\${cur}") )
      ;;
    update-video)
      COMPREPLY=( \$(compgen -W "--video-id --title --description --dry-run --yes --output --verbose" -- "\${cur}") )
      ;;
    search-videos)
      COMPREPLY=( \$(compgen -W "--query --global --channel --limit --output --verbose" -- "\${cur}") )
      ;;
    get-video-localizations)
      COMPREPLY=( \$(compgen -W "--video-ids --languages --output --verbose" -- "\${cur}") )
      ;;
    get-video-localization|put-video-localization|update-video-localization)
      COMPREPLY=( \$(compgen -W "--video-id --language --title --description --output --verbose" -- "\${cur}") )
      ;;
    get-video-analytics)
      COMPREPLY=( \$(compgen -W "--video-id --start-date --end-date --metrics --dimensions --all --output --verbose" -- "\${cur}") )
      ;;
    get-channel-analytics)
      COMPREPLY=( \$(compgen -W "--start-date --end-date --metrics --report --dimensions --output --verbose" -- "\${cur}") )
      ;;
    get-search-terms|get-traffic-sources|get-video-retention|get-video-tags|list-captions)
      COMPREPLY=( \$(compgen -W "--video-id --output --verbose" -- "\${cur}") )
      ;;
    update-video-tags)
      COMPREPLY=( \$(compgen -W "--video-id --tags --add --remove --dry-run --yes --output --verbose" -- "\${cur}") )
      ;;
    get-thumbnail)
      COMPREPLY=( \$(compgen -W "--video-id --quality --output --verbose" -- "\${cur}") )
      ;;
    get-playlist)
      COMPREPLY=( \$(compgen -W "--playlist-id --output --verbose" -- "\${cur}") )
      ;;
    get-playlists)
      COMPREPLY=( \$(compgen -W "--playlist-ids --output --verbose" -- "\${cur}") )
      ;;
    list-videos)
      COMPREPLY=( \$(compgen -W "--channel --limit --type --privacy --output --verbose" -- "\${cur}") )
      ;;
    list-playlists)
      COMPREPLY=( \$(compgen -W "--channel --limit --privacy --output --verbose" -- "\${cur}") )
      ;;
    list-comments)
      COMPREPLY=( \$(compgen -W "--video-id --limit --sort --output --verbose" -- "\${cur}") )
      ;;
    get-caption)
      COMPREPLY=( \$(compgen -W "--caption-id --format --verbose" -- "\${cur}") )
      ;;
    get-channel)
      COMPREPLY=( \$(compgen -W "--channel --output --verbose" -- "\${cur}") )
      ;;
    get-channel-search-terms)
      COMPREPLY=( \$(compgen -W "--channel --limit --content-type --start-date --end-date --output --verbose" -- "\${cur}") )
      ;;
    list-report-types)
      COMPREPLY=( \$(compgen -W "--output --verbose" -- "\${cur}") )
      ;;
    list-report-jobs)
      COMPREPLY=( \$(compgen -W "--type --output --verbose" -- "\${cur}") )
      ;;
    get-report-data)
      COMPREPLY=( \$(compgen -W "--type --video-id --start-date --end-date --output --verbose" -- "\${cur}") )
      ;;
    fetch-reports)
      COMPREPLY=( \$(compgen -W "--channel --type --types --start-date --end-date --force --verify --verbose" -- "\${cur}") )
      ;;
    config)
      COMPREPLY=( \$(compgen -W "set get list completion --show --output --verbose" -- "\${cur}") )
      return
      ;;
    set|get)
      # \${cmd} is the first non-flag positional arg (set by the loop above).
      # For "staqan-yt config set <TAB>", cmd="config", so this guard is correct.
      # We also verify via \${words[*]} to be safe if flags precede the subcommand.
      if [[ "\${cmd}" == "config" ]]; then
        COMPREPLY=( \$(compgen -W "default.channel default.output lock.timeout" -- "\${cur}") )
        return
      fi
      ;;
    default.output)
      COMPREPLY=( \$(compgen -W "json table text pretty csv" -- "\${cur}") )
      return
      ;;
    lock.timeout)
      COMPREPLY=( \$(compgen -W "30000 60000 120000 300000" -- "\${cur}") )
      return
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

_staqan_yt_video_ids() {
  local -a descs lines
  local line
  lines=( \${(f)"\$(staqan-yt __complete --type video-id 2>/dev/null)"} )
  for line in \$lines; do
    descs+=("\${line%%	*}:\${line##*	}")
  done
  _describe 'video ID' descs
}

_staqan_yt_playlist_ids() {
  local -a descs lines
  local line
  lines=( \${(f)"\$(staqan-yt __complete --type playlist-id 2>/dev/null)"} )
  for line in \$lines; do
    descs+=("\${line%%	*}:\${line##*	}")
  done
  _describe 'playlist ID' descs
}

_staqan_yt_report_types() {
  local -a descs lines
  local line
  lines=( \${(f)"\$(staqan-yt __complete --type report-type 2>/dev/null)"} )
  for line in \$lines; do
    descs+=("\${line%%	*}:\${line##*	}")
  done
  _describe 'report type' descs
}

_staqa_nyt() {
  local -a commands

  # Define commands with descriptions
  commands=(
${commandList}
  )

  # Define arguments for specific commands (all flag-based, no positionals)
  case \$words[2] in
    config)
      _staqa_nyt_config
      return
      ;;
    get-video)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-videos)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      # Space-separated variadic: walk back to detect if we're inside --video-ids'
      # value list. Exclude already-used IDs via compadd -F.
      if [[ \$words[\$CURRENT] != -* ]]; then
        local j=\$((\$CURRENT - 1))
        local -a _vused=()
        while (( j >= 1 )); do
          case \$words[\$j] in
            --video-ids)
              local -a _all
              _all=(\${(f)"\$(staqan-yt __complete --type video-id 2>/dev/null | cut -f1)"})
              compadd -F _vused -- \$_all
              return ;;
            --*) break ;;
            *) _vused+=(\$words[\$j]); (( j-- )) ;;
          esac
        done
      fi
      _arguments \\
        '--video-ids[Video IDs (variadic)]: :_staqan_yt_video_ids' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    update-video)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--title[Video title]:title:' \\
        '--description[Video description]:desc:' \\
        '--dry-run[Preview changes without applying]' \\
        '--yes[Skip confirmation prompt]' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    search-videos)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--query[Search query]:query:' \\
        '--global[Search all of YouTube]' \\
        '--channel[Channel handle or ID]:channel:' \\
        '--limit[Limit number of results]:n:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-video-localizations)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      # Same variadic pre-check as get-videos
      if [[ \$words[\$CURRENT] != -* ]]; then
        local j=\$((\$CURRENT - 1))
        local -a _vused=()
        while (( j >= 1 )); do
          case \$words[\$j] in
            --video-ids)
              local -a _all
              _all=(\${(f)"\$(staqan-yt __complete --type video-id 2>/dev/null | cut -f1)"})
              compadd -F _vused -- \$_all
              return ;;
            --*) break ;;
            *) _vused+=(\$words[\$j]); (( j-- )) ;;
          esac
        done
      fi
      _arguments \\
        '--video-ids[Video IDs (variadic)]: :_staqan_yt_video_ids' \\
        '--languages[Comma-separated language codes]:langs:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-video-localization)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--language[Language code or name]:lang:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    put-video-localization)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--language[Language code or name]:lang:' \\
        '--title[Localized title]:title:' \\
        '--description[Localized description]:desc:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    update-video-localization)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--language[Language code or name]:lang:' \\
        '--title[New localized title]:title:' \\
        '--description[New localized description]:desc:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-video-analytics)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      # Space-separated variadic: walk back to detect if we're inside --dimensions
      if [[ \$words[\$CURRENT] != -* ]]; then
        local j=\$((\$CURRENT - 1))
        local -a _dused=()
        while (( j >= 1 )); do
          case \$words[\$j] in
            --dimensions)
              local -a _drem=()
              local v
              for v in country day month deviceType operatingSystem subscribedStatus ageGroup gender sharingService insightTrafficSourceType insightPlaybackLocationType liveOrOnDemand creatorContentType youtubeProduct province dma city; do
                [[ -z "\${_dused[(r)\$v]}" ]] && _drem+=(\$v)
              done
              _describe -t analytics-dimensions 'dimension' _drem
              return
              ;;
            country|day|month|deviceType|operatingSystem|subscribedStatus|ageGroup|gender|sharingService|insightTrafficSourceType|insightPlaybackLocationType|liveOrOnDemand|creatorContentType|youtubeProduct|province|dma|city) _dused+=(\$words[\$j]); (( j-- )) ;;
            *) break ;;
          esac
        done
      fi
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--start-date[Start date (YYYY-MM-DD)]:date:' \\
        '--end-date[End date (YYYY-MM-DD)]:date:' \\
        '--metrics[Metrics to fetch]:metrics:' \\
        '--dimensions[Breakdown dimensions (variadic)]:dim:(country day month deviceType operatingSystem subscribedStatus ageGroup gender sharingService insightTrafficSourceType insightPlaybackLocationType liveOrOnDemand creatorContentType youtubeProduct province dma city)' \\
        '--all[Breakdown by all standard dimensions]' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-search-terms)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--limit[Limit number of results]:n:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-traffic-sources)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-video-retention)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-video-tags)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    update-video-tags)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--tags[Replace all tags]:tags:' \\
        '--add[Add tags]:tags:' \\
        '--remove[Remove tags]:tags:' \\
        '--dry-run[Preview changes]' \\
        '--yes[Skip confirmation]' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-thumbnail)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--quality[Thumbnail quality]:quality:(maxres standard high medium default)' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-playlist)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--playlist-id[Playlist ID]: :_staqan_yt_playlist_ids' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-playlists)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--playlist-ids[Playlist IDs]: :_staqan_yt_playlist_ids' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    list-videos)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      # Space-separated variadic: walk back to detect if we're inside --privacy's
      # value list. Pattern from Docker/_docker: use \${words[(r)val]} to check
      # already-used values, then offer only the remaining ones.
      if [[ \$words[\$CURRENT] != -* ]]; then
        local j=\$((\$CURRENT - 1))
        local -a _pused=()
        while (( j >= 1 )); do
          case \$words[\$j] in
            --privacy)
              local -a _rem=()
              local v
              for v in public private unlisted; do
                [[ -z "\${_pused[(r)\$v]}" ]] && _rem+=(\$v)
              done
              _describe -t privacy-status 'privacy status' _rem
              return
              ;;
            public|private|unlisted) _pused+=(\$words[\$j]); (( j-- )) ;;
            *) break ;;
          esac
        done
      fi
      _arguments \\
        '--channel[Channel handle or ID]:channel:' \\
        '--limit[Limit number of results]:n:' \\
        '--type[Filter by type]:type:(short regular)' \\
        '--privacy[Filter by privacy status (variadic: public private unlisted)]:status:(public private unlisted)' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    list-playlists)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      # Same space-separated variadic pre-check as list-videos
      if [[ \$words[\$CURRENT] != -* ]]; then
        local j=\$((\$CURRENT - 1))
        local -a _pused=()
        while (( j >= 1 )); do
          case \$words[\$j] in
            --privacy)
              local -a _rem=()
              local v
              for v in public private unlisted; do
                [[ -z "\${_pused[(r)\$v]}" ]] && _rem+=(\$v)
              done
              _describe -t privacy-status 'privacy status' _rem
              return
              ;;
            public|private|unlisted) _pused+=(\$words[\$j]); (( j-- )) ;;
            *) break ;;
          esac
        done
      fi
      _arguments \\
        '--channel[Channel handle or ID]:channel:' \\
        '--limit[Limit number of results]:n:' \\
        '--privacy[Filter by privacy status (variadic: public private unlisted)]:status:(public private unlisted)' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    list-comments)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--limit[Limit number of results]:n:' \\
        '--sort[Sort order]:order:(top new)' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    list-captions)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--video-id[Video ID]: :_staqan_yt_video_ids' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-caption)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--caption-id[Caption ID]:id:( )' \\
        '--format[Caption format]:format:(srt vtt sbv srv2 ttml json)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-channel)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--channel[Channel handle or ID]:channel:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-channel-search-terms)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--channel[Channel handle or ID]:channel:' \\
        '--limit[Limit number of results]:n:' \\
        '--content-type[Filter by content type]:type:(all video shorts)' \\
        '--start-date[Start date (YYYY-MM-DD)]:date:' \\
        '--end-date[End date (YYYY-MM-DD)]:date:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    get-channel-analytics)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--channel[Channel handle or ID]:channel:' \\
        '--report[Report type]:type:(demographics devices geography traffic-sources subscription-status)' \\
        '--start-date[Start date (YYYY-MM-DD)]:date:' \\
        '--end-date[End date (YYYY-MM-DD)]:date:' \\
        '--dimensions[Custom dimensions (comma-separated)]:dims:' \\
        '--metrics[Custom metrics (comma-separated)]:metrics:' \\
        '--output[Output format]:format:(json table text pretty csv)' \\
        '--verbose[Enable verbose output]'
      ;;
    list-report-jobs|get-report-data)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '--type[Report type ID]: :_staqan_yt_report_types' \\
        '--output[Output format]:format:(json table text csv)' \\
        '--start-date[Start date (YYYY-MM-DD)]:date:' \\
        '--end-date[End date (YYYY-MM-DD)]:date:' \\
        '--verbose[Enable verbose output]'
      ;;
    fetch-reports)
      local words=(\$words[1] \$words[3,-1])
      local CURRENT=\$((\$CURRENT - 1))
      _arguments \\
        '(-c --channel)'{-c,--channel}'[Channel handle or ID]:channel:' \\
        '(-t --type)'{-t,--type}'[Report type ID]: :_staqan_yt_report_types' \\
        '(-T --types){-T,--types}[Report type IDs (comma-separated)]:ids:' \\
        '--start-date[Start date (YYYY-MM-DD)]:date:' \\
        '--end-date[End date (YYYY-MM-DD)]:date:' \\
        '(-f --force){-f,--force}[Re-download even if cached]' \\
        '--verify[Verify cached file completeness]' \\
        '--output[Output format]:format:(json table text csv)' \\
        '(-v --verbose){-v,--verbose}[Enable verbose output]'
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
    'default.output:Default output format (json|table|text|pretty|csv)'
    'lock.timeout:Lock acquisition timeout in ms (default: 60000)'
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
  elif (( CURRENT == 5 )) && [[ \$words[3] == 'set' ]]; then
    case \$words[4] in
      default.output)
        _values 'format' json table text pretty csv ;;
      lock.timeout)
        _values 'ms' 30000 60000 120000 300000 ;;
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
