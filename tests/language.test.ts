import { describe, it, expect } from 'bun:test';
import {
  normalizeLanguage,
  isValidLanguage,
  getLanguageName,
  getAliasedLanguages,
  getSupportedLanguages,
} from '../lib/language';

describe('normalizeLanguage', () => {
  it('normalizes names and codes case-insensitively', () => {
    expect(normalizeLanguage('JAPANESE')).toBe('ja');
    expect(normalizeLanguage('jp')).toBe('ja');
    expect(normalizeLanguage('english')).toBe('en');
    expect(normalizeLanguage(' ru ')).toBe('ru');
  });

  // Issue #105: this used to reject everything outside en/ja/ru, which blocked
  // localizing into languages the channel already publishes captions in.
  it('accepts any BCP-47 tag, not just the aliased three', () => {
    expect(normalizeLanguage('ko')).toBe('ko');
    expect(normalizeLanguage('vi')).toBe('vi');
    expect(normalizeLanguage('ar')).toBe('ar');
  });

  it('canonicalizes case and script/region subtags', () => {
    expect(normalizeLanguage('EN')).toBe('en');
    expect(normalizeLanguage('zh-hans')).toBe('zh-Hans');
    expect(normalizeLanguage('pt-br')).toBe('pt-BR');
    expect(normalizeLanguage('en-us')).toBe('en-US');
  });

  it('rejects well-formed tags that name no language', () => {
    // BCP-47 syntax alone accepts any 2-8 letter subtag, so canonicalization
    // is not enough on its own: these are structurally valid and still wrong.
    expect(normalizeLanguage('bogus')).toBeNull();
    expect(normalizeLanguage('xx')).toBeNull();
    expect(normalizeLanguage('klingon')).toBeNull();
  });

  it('still resolves a real code for an obscure language', () => {
    // The rejection above is about unassigned tags, not about obscurity.
    expect(normalizeLanguage('tlh')).toBe('tlh');
    expect(getLanguageName('tlh')).toBe('Klingon');
  });

  // Intl.DisplayNames.of() is stricter than getCanonicalLocales: it raises
  // RangeError for extension and private-use subtags that canonicalize fine.
  // Unguarded, that surfaced as the raw ICU text "argument is not a language
  // id" for input that is perfectly valid BCP-47.
  it('accepts tags carrying extension or private-use subtags', () => {
    expect(normalizeLanguage('en-x-private')).toBe('en-x-private');
    expect(normalizeLanguage('de-DE-u-co-phonebk')).toBe('de-DE-u-co-phonebk');
    expect(normalizeLanguage('en-US-x-foo')).toBe('en-US-x-foo');
  });

  it('names those tags from the base subtag instead of throwing', () => {
    expect(getLanguageName('en-x-private')).toMatch(/english/i);
    expect(getLanguageName('de-DE-u-co-phonebk')).toMatch(/german/i);
  });

  it('still rejects an extension tag whose base names no language', () => {
    expect(normalizeLanguage('bogus-x-private')).toBeNull();
    expect(getLanguageName('bogus-x-private')).toBeNull();
  });

  it('returns null for malformed or empty input', () => {
    expect(normalizeLanguage('123')).toBeNull();
    expect(normalizeLanguage('x')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });

  it('prefers the alias table over canonicalization', () => {
    // `jp` is a well-formed tag and a region subtag, but not a language code.
    // Without the alias it would canonicalize and then fail at the API.
    expect(normalizeLanguage('jp')).toBe('ja');
    expect(normalizeLanguage('eng')).toBe('en');
  });
});

describe('getLanguageName', () => {
  it('names languages outside the alias table', () => {
    expect(getLanguageName('ko')).toBe('Korean');
    expect(getLanguageName('vi')).toBe('Vietnamese');
    expect(getLanguageName('ar')).toBe('Arabic');
  });

  // Display strings come from CLDR and their wording varies by ICU version:
  // macOS returns "Chinese, Simplified" for zh-Hans where Linux CI returns
  // "Simplified Chinese". Assert what the code guarantees (a resolved name
  // that is not the raw tag) rather than one platform's phrasing. This is the
  // same reason the alias table pins the names for en/ja/ru.
  it('names script and region variants', () => {
    const zh = getLanguageName('zh-Hans');
    expect(zh).toBeTruthy();
    expect(zh).not.toBe('zh-Hans');
    expect(zh).toMatch(/chinese/i);

    const pt = getLanguageName('pt-BR');
    expect(pt).toBeTruthy();
    expect(pt).not.toBe('pt-BR');
    expect(pt).toMatch(/portuguese/i);
  });

  it('keeps the aliased three stable regardless of CLDR wording', () => {
    expect(getLanguageName('en')).toBe('English');
    expect(getLanguageName('ja')).toBe('Japanese');
    expect(getLanguageName('ru')).toBe('Russian');
  });

  it('returns null rather than echoing an unknown code back', () => {
    expect(getLanguageName('klingon')).toBeNull();
    expect(getLanguageName('bogus')).toBeNull();
    expect(getLanguageName('')).toBeNull();
  });
});

describe('isValidLanguage / getAliasedLanguages', () => {
  it('agree with each other', () => {
    for (const code of getAliasedLanguages()) {
      expect(isValidLanguage(code)).toBe(true);
      expect(getLanguageName(code)).toBeTruthy();
    }
    expect(isValidLanguage('klingon')).toBe(false);
    expect(getLanguageName('klingon')).toBeNull();
  });

  it('keeps getSupportedLanguages working as a deprecated alias', () => {
    expect(getSupportedLanguages()).toEqual(getAliasedLanguages());
  });
});
