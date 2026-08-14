/**
 * Language normalization for YouTube localizations and captions.
 *
 * Accepts any BCP-47 language tag (issue #105). The alias table below is a
 * convenience layer for the channel's three main languages, so `japanese`,
 * `jpn` and `jp` all resolve to `ja`; everything else is validated and named
 * through `Intl`, which carries CLDR data for every tag the platform knows.
 *
 * This used to accept only `en`/`ja`/`ru` and throw `Invalid language` for
 * anything else, which blocked localizing into languages the channel already
 * publishes captions in.
 */

import { LanguageMap } from '../types';

// `fallback: 'none'` is the point of this: for a structurally well-formed tag
// that is not a real language (`bogus`, `xx`), `of()` returns undefined rather
// than echoing the input back. That is what separates a language code from an
// arbitrary string, since BCP-47 syntax alone accepts any 2-8 letter subtag.
const displayNames = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });

/**
 * Canonical BCP-47 form of a tag, or null when it is not well-formed.
 * Fixes case and separators: `EN` becomes `en`, `zh-hans` becomes `zh-Hans`.
 */
function canonicalizeTag(tag: string): string | null {
  try {
    return Intl.getCanonicalLocales(tag)[0] ?? null;
  } catch {
    // RangeError: not a structurally valid tag (empty, digits, single letter).
    return null;
  }
}

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
 * Normalize language input to a canonical BCP-47 tag.
 * @param input - Alias (`japanese`) or BCP-47 tag (`ja`, `zh-Hans`), any case
 * @returns Canonical tag, or null if it is not a real language
 *
 * @example
 * normalizeLanguage('JAPANESE')  // => 'ja'
 * normalizeLanguage('ko')        // => 'ko'
 * normalizeLanguage('zh-hans')   // => 'zh-Hans'
 * normalizeLanguage('bogus')     // => null  (well-formed, not a language)
 * normalizeLanguage('123')       // => null  (not well-formed)
 */
function normalizeLanguage(input: string | undefined | null): string | null {
  if (!input || typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  const normalized = trimmed.toLowerCase();

  // Aliases first, and not only for convenience: `jp` is a well-formed tag
  // (and a region subtag) but not a language code, so canonicalization alone
  // would accept it and then fail at the API. The table also collapses `eng`
  // and `english` to the two-letter form the channel's metadata uses.
  for (const [code, data] of Object.entries(LANGUAGE_MAP)) {
    if (data.aliases.includes(normalized)) {
      return code;
    }
  }

  const canonical = canonicalizeTag(trimmed);
  if (!canonical) {
    return null;
  }

  // Well-formed but not a language the platform recognizes. Passing it through
  // would trade a clear client-side error for an opaque one from the API.
  if (!displayNames.of(canonical)) {
    return null;
  }

  return canonical;
}

/**
 * Validate that input names a real language.
 * @param input - Alias or BCP-47 tag
 * @returns True when it resolves to a language
 *
 * @example
 * isValidLanguage('ja')       // => true
 * isValidLanguage('Japanese') // => true
 * isValidLanguage('vi')       // => true
 * isValidLanguage('bogus')    // => false
 */
function isValidLanguage(input: string | undefined | null): boolean {
  return normalizeLanguage(input) !== null;
}

/**
 * Human-readable name for a language code.
 * @param code - BCP-47 tag (a code, not an alias)
 * @returns Name, or null when the code names no language
 *
 * @example
 * getLanguageName('ja')      // => 'Japanese'
 * getLanguageName('vi')      // => 'Vietnamese'
 * getLanguageName('zh-Hans') // => 'Chinese, Simplified'
 * getLanguageName('bogus')   // => null
 */
function getLanguageName(code: string): string | null {
  if (!code || typeof code !== 'string') {
    return null;
  }

  // The alias table wins so the three main languages keep their established
  // names regardless of ICU version or platform. CLDR wording genuinely does
  // differ between the two: macOS names zh-Hans "Chinese, Simplified" while
  // Linux names it "Simplified Chinese". Display names are therefore for
  // humans to read, never for callers to compare against.
  if (LANGUAGE_MAP[code]) {
    return LANGUAGE_MAP[code].name;
  }

  const canonical = canonicalizeTag(code);
  if (!canonical) {
    return null;
  }

  return displayNames.of(canonical) ?? null;
}

/**
 * Language codes that have a friendly alias (`japanese`, `jp`, `eng`, ...).
 *
 * NOT the set of accepted languages: any BCP-47 tag is accepted since #105.
 * This is the shortcut list, used for help text and as a smoke-test set.
 *
 * @example
 * getAliasedLanguages() // => ['en', 'ja', 'ru']
 */
function getAliasedLanguages(): string[] {
  return Object.keys(LANGUAGE_MAP);
}

/**
 * @deprecated Misleading since #105: the CLI accepts any BCP-47 tag, so there
 * is no finite supported set. Kept as an alias for {@link getAliasedLanguages}
 * so existing callers keep working. Use `isValidLanguage` to test one tag.
 */
function getSupportedLanguages(): string[] {
  return getAliasedLanguages();
}

export {
  normalizeLanguage,
  isValidLanguage,
  getLanguageName,
  getAliasedLanguages,
  getSupportedLanguages,
  LANGUAGE_MAP
};
