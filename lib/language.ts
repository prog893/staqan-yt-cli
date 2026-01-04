/**
 * Language mapping and normalization utility for YouTube video localizations
 * Supports English, Japanese, and Russian with case-insensitive matching
 */

import { LanguageMap } from '../types';

const LANGUAGE_MAP: LanguageMap = {
  'en': {
    code: 'en',
    name: 'English',
    aliases: ['english', 'en', 'eng']
  },
  'ja': {
    code: 'ja',
    name: 'Japanese',
    aliases: ['japanese', 'ja', 'jpn', 'jp']
  },
  'ru': {
    code: 'ru',
    name: 'Russian',
    aliases: ['russian', 'ru', 'rus']
  }
};

/**
 * Normalize language input to ISO 639-1 code
 * @param input - Human-readable name or ISO code (case-insensitive)
 * @returns ISO code (en, ja, ru) or null if invalid
 *
 * @example
 * normalizeLanguage('JAPANESE') // => 'ja'
 * normalizeLanguage('english') // => 'en'
 * normalizeLanguage('ru') // => 'ru'
 * normalizeLanguage('invalid') // => null
 */
function normalizeLanguage(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const normalized = input.toLowerCase().trim();

  for (const [code, data] of Object.entries(LANGUAGE_MAP)) {
    if (data.aliases.includes(normalized)) {
      return code;
    }
  }

  return null;
}

/**
 * Validate if language is supported
 * @param input - Language to validate
 * @returns True if language is supported
 *
 * @example
 * isValidLanguage('ja') // => true
 * isValidLanguage('Japanese') // => true
 * isValidLanguage('invalid') // => false
 */
function isValidLanguage(input: string | undefined | null): boolean {
  return normalizeLanguage(input) !== null;
}

/**
 * Get human-readable name from ISO code
 * @param code - ISO language code
 * @returns Human-readable name or null
 *
 * @example
 * getLanguageName('ja') // => 'Japanese'
 * getLanguageName('en') // => 'English'
 * getLanguageName('invalid') // => null
 */
function getLanguageName(code: string): string | null {
  return LANGUAGE_MAP[code]?.name || null;
}

/**
 * Get all supported language codes
 * @returns Array of ISO codes
 *
 * @example
 * getSupportedLanguages() // => ['en', 'ja', 'ru']
 */
function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_MAP);
}

export {
  normalizeLanguage,
  isValidLanguage,
  getLanguageName,
  getSupportedLanguages,
  LANGUAGE_MAP
};
