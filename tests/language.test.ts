import { describe, it, expect } from 'bun:test';
import { normalizeLanguage, isValidLanguage, getLanguageName, getSupportedLanguages } from '../lib/language';

describe('normalizeLanguage', () => {
  it('normalizes names and codes case-insensitively', () => {
    expect(normalizeLanguage('JAPANESE')).toBe('ja');
    expect(normalizeLanguage('jp')).toBe('ja');
    expect(normalizeLanguage('english')).toBe('en');
    expect(normalizeLanguage(' ru ')).toBe('ru');
  });

  it('returns null for unsupported input', () => {
    // NOTE: this pins the current hardcoded en/ja/ru limitation — when #105
    // (accept any BCP-47) lands, this expectation must flip.
    expect(normalizeLanguage('ko')).toBeNull();
    expect(normalizeLanguage('')).toBeNull();
    expect(normalizeLanguage(null)).toBeNull();
    expect(normalizeLanguage(undefined)).toBeNull();
  });
});

describe('isValidLanguage / getLanguageName / getSupportedLanguages', () => {
  it('agree with each other', () => {
    for (const code of getSupportedLanguages()) {
      expect(isValidLanguage(code)).toBe(true);
      expect(getLanguageName(code)).toBeTruthy();
    }
    expect(isValidLanguage('klingon')).toBe(false);
    expect(getLanguageName('klingon')).toBeNull();
  });
});
