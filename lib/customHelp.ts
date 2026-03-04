/**
 * Custom help formatter that groups commands by semantic category
 */

import { Help, Command } from 'commander';

/**
 * Command grouping configuration
 * Maps category names to command names
 */
const COMMAND_GROUPS: Record<string, string[]> = {
  'Setup & Configuration': [
    'auth',
    'config',
  ],
  'Channel': [
    'get-channel',
    'get-channel-analytics',
    'list-playlists',
  ],
  'Video Discovery': [
    'list-videos',
    'get-video',
    'get-videos',
    'search-videos',
  ],
  'Video Metadata': [
    'update-video',
    'get-video-tags',
    'update-video-tags',
    'get-thumbnail',
  ],
  'Localizations': [
    'get-video-localizations',
    'get-video-localization',
    'put-video-localization',
    'update-video-localization',
  ],
  'Analytics & Insights': [
    'get-video-analytics',
    'get-video-retention',
    'get-search-terms',
    'get-traffic-sources',
  ],
  'Reporting API': [
    'list-report-types',
    'list-report-jobs',
    'get-report-data',
  ],
  'Playlist': [
    'get-playlist',
    'get-playlists',
  ],
  'Comments & Captions': [
    'list-comments',
    'list-captions',
    'get-caption',
  ],
};

/**
 * Custom Help class that organizes commands into semantic groups
 */
export class GroupedHelp extends Help {
  /**
   * Override formatHelp to group commands by category
   */
  formatHelp(cmd: Command, helper: Help): string {
    // Build standard help sections (usage, description, options)
    const parts: string[] = [];

    // Usage
    const usage = helper.commandUsage(cmd);
    if (usage) {
      parts.push('Usage: ' + usage);
      parts.push('');
    }

    // Description
    const cmdDescription = helper.commandDescription(cmd);
    if (cmdDescription) {
      parts.push(cmdDescription);
      parts.push('');
    }

    // Options
    const optionList = helper.visibleOptions(cmd);
    if (optionList.length > 0) {
      parts.push('Options:');
      optionList.forEach(opt => {
        parts.push('  ' + helper.optionTerm(opt).padEnd(30) + '  ' + helper.optionDescription(opt));
      });
      parts.push('');
    }

    // Grouped commands
    const commands = helper.visibleCommands(cmd);
    if (commands.length > 0) {
      parts.push(this.formatGroupedCommands(commands, helper));
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Format commands grouped by category
   */
  private formatGroupedCommands(commands: Command[], helper: Help): string {
    const parts: string[] = [];

    // Create map of command name -> command object for quick lookup
    const commandMap = new Map<string, Command>();
    commands.forEach(cmd => {
      commandMap.set(cmd.name(), cmd);
    });

    // Format each group
    for (const [groupName, commandNames] of Object.entries(COMMAND_GROUPS)) {
      const groupCommands = commandNames
        .map(name => commandMap.get(name))
        .filter((cmd): cmd is Command => cmd !== undefined);

      if (groupCommands.length > 0) {
        parts.push(`${groupName}:`);
        groupCommands.forEach(cmd => {
          parts.push('  ' + helper.subcommandTerm(cmd).padEnd(30) + '  ' + helper.subcommandDescription(cmd));
        });
        parts.push('');
      }
    }

    // Find ungrouped commands (commands not in any group)
    const groupedCommandNames = new Set(Object.values(COMMAND_GROUPS).flat());
    const ungroupedCommands = commands.filter(cmd => !groupedCommandNames.has(cmd.name()));

    if (ungroupedCommands.length > 0) {
      parts.push('Other Commands:');
      ungroupedCommands.forEach(cmd => {
        parts.push('  ' + helper.subcommandTerm(cmd).padEnd(30) + '  ' + helper.subcommandDescription(cmd));
      });
      parts.push('');
    }

    return parts.join('\n');
  }
}
