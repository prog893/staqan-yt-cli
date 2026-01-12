/**
 * Output formatters for different output modes
 */

import chalk from 'chalk';

/**
 * Format data as JSON
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format data as tab-delimited text (AWS CLI style)
 * Suitable for parsing with awk, cut, etc.
 */
export function formatText(data: unknown): string {
  if (Array.isArray(data)) {
    return data.map(row => formatTextRow(row)).join('\n');
  }
  return formatTextRow(data);
}

function formatTextRow(obj: unknown): string {
  if (typeof obj === 'string' || typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj);
  }

  if (obj === null || obj === undefined) {
    return '';
  }

  if (typeof obj === 'object') {
    const values = Object.values(obj).map(val => {
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val);
      }
      return String(val ?? '');
    });
    return values.join('\t');
  }

  return String(obj);
}

/**
 * Format data as ASCII table
 */
export function formatTable(data: unknown): string {
  let arrayData: unknown[];
  if (!Array.isArray(data)) {
    arrayData = [data];
  } else {
    arrayData = data;
  }

  if (arrayData.length === 0) {
    return '';
  }

  // Get all unique keys from all objects
  const allKeys = new Set<string>();
  arrayData.forEach(item => {
    if (typeof item === 'object' && item !== null) {
      Object.keys(item).forEach(key => allKeys.add(key));
    }
  });

  const headers = Array.from(allKeys);

  if (headers.length === 0) {
    // Primitive array
    return formatSimpleTable(['Value'], arrayData.map(v => [String(v)]));
  }

  // Build rows
  const rows = arrayData.map(item => {
    if (typeof item !== 'object' || item === null) {
      return [String(item)];
    }
    return headers.map(header => {
      const val = (item as Record<string, unknown>)[header];
      if (val === null || val === undefined) {
        return '';
      }
      if (typeof val === 'object') {
        return JSON.stringify(val);
      }
      return String(val);
    });
  });

  return formatSimpleTable(headers, rows);
}

function formatSimpleTable(headers: string[], rows: string[][]): string {
  // Calculate column widths
  const colWidths = headers.map((header, idx) => {
    const maxDataWidth = Math.max(...rows.map(row => (row[idx] || '').length));
    return Math.max(header.length, maxDataWidth);
  });

  // Format header
  const headerRow = headers.map((h, idx) => h.padEnd(colWidths[idx])).join(' | ');
  const separator = colWidths.map(w => '-'.repeat(w)).join('-+-');

  // Format rows
  const dataRows = rows.map(row =>
    row.map((cell, idx) => (cell || '').padEnd(colWidths[idx])).join(' | ')
  );

  return [headerRow, separator, ...dataRows].join('\n');
}

/**
 * Pretty format with colors (current default)
 * Used for human-readable terminal output
 */
export function formatPretty(data: unknown, label?: string): string {
  if (label) {
    return chalk.cyan(label) + '\n' + formatPrettyValue(data);
  }
  return formatPrettyValue(data);
}

function formatPrettyValue(value: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);

  if (value === null || value === undefined) {
    return chalk.gray('(none)');
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number') {
    return chalk.yellow(value.toString());
  }

  if (typeof value === 'boolean') {
    return value ? chalk.green('true') : chalk.red('false');
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return chalk.gray('(empty)');
    }
    return value.map((item, idx) => {
      if (typeof item === 'object' && item !== null) {
        return `${spaces}${chalk.gray(`[${idx}]`)}\n${formatPrettyValue(item, indent + 1)}`;
      }
      return `${spaces}${chalk.gray('•')} ${formatPrettyValue(item, 0)}`;
    }).join('\n');
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return chalk.gray('(empty)');
    }
    return entries.map(([key, val]) => {
      const formattedKey = chalk.cyan(`${spaces}${key}:`);
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        return `${formattedKey}\n${formatPrettyValue(val, indent + 1)}`;
      }
      return `${formattedKey} ${formatPrettyValue(val, 0)}`;
    }).join('\n');
  }

  return String(value);
}
