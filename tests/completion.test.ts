/**
 * Regression guard for #182: per-command flag lists must survive to COMPREPLY.
 *
 * The generated bash completion ends with a fallback that offers the three
 * global options. The per-command arms above it set COMPREPLY and fall through
 * without returning, so an unconditional fallback overwrote all of them: a flag
 * name being completed always starts with "-", so the branch always ran, and
 * every one of the 34 commands offered only --help/--output/--verbose.
 *
 * The bug is invisible in the cases exercised most often by hand, because the
 * value-completion arms (--output, --video-id) return explicitly and were never
 * affected. Only flag-NAME completion broke.
 *
 * These tests drive the real generated script through a real bash, because the
 * defect is in shell control flow and nothing about it is observable from
 * TypeScript. `_init_completion` comes from the bash-completion package, which
 * is not present on every machine (notably macOS), so it is stubbed with the
 * four variables the script actually reads.
 */
import { describe, it, expect } from 'bun:test';
import { spawnSync } from 'child_process';
import { getCompletionScript } from '../lib/completion';

const SCRIPT = getCompletionScript('bash');

/** Stub standing in for the bash-completion package's _init_completion. */
const HARNESS = `
_init_completion() {
  words=( "\${COMP_WORDS[@]}" )
  cword=$COMP_CWORD
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  return 0
}
`;

/**
 * Complete `line` and return the resulting COMPREPLY entries.
 *
 * `partial` distinguishes the two shapes bash passes in. A trailing space means
 * a new, empty word is being completed (`--sort <TAB>`), so an empty element is
 * appended. A partial word means the last token is itself the word being
 * completed (`--s<TAB>`), so it is left alone. Getting this wrong silently
 * tests the wrong branch.
 */
function complete(line: string, partial = false): string[] {
  const words = line.split(' ');
  const compWords = partial ? words : [...words, ''];
  const script = [
    HARNESS,
    SCRIPT,
    `COMP_WORDS=(${compWords.map(w => `'${w}'`).join(' ')})`,
    `COMP_CWORD=${compWords.length - 1}`,
    'COMPREPLY=()',
    '_staqa_nyt_completion 2>/dev/null',
    'printf "%s\\n" "${COMPREPLY[@]}"',
  ].join('\n');

  const res = spawnSync('bash', ['-c', script], { encoding: 'utf8' });
  return res.stdout.split('\n').map(s => s.trim()).filter(Boolean);
}

describe('bash completion: per-command flags (#182)', () => {
  it('offers a command\'s own flags, not just the global options', () => {
    const reply = complete('staqan-yt get-channel-analytics --', true);
    expect(reply).toContain('--report');
    expect(reply).toContain('--dimensions');
    expect(reply).toContain('--metrics');
    expect(reply).toContain('--sort');
    // The regression: these three were the ONLY entries returned.
    expect(reply.length).toBeGreaterThan(3);
  });

  it('narrows on a partial flag name', () => {
    const reply = complete('staqan-yt get-channel-analytics --s', true);
    expect(reply.sort()).toEqual(['--sort', '--start-date']);
  });

  it('still falls back to global options for an unknown command', () => {
    // Nothing in the case matches, so COMPREPLY is empty and the fallback runs.
    const reply = complete('staqan-yt not-a-real-command --', true);
    expect(reply.sort()).toEqual(['--help', '--output', '--verbose']);
  });

  it('keeps per-command flags distinct across commands', () => {
    const tags = complete('staqan-yt update-video-tags --', true);
    expect(tags).toContain('--replace');
    expect(tags).toContain('--remove');
    expect(tags).not.toContain('--dimensions');
  });
});

describe('bash completion: flag values (#182)', () => {
  it('enumerates --report, which bash previously never completed', () => {
    const reply = complete('staqan-yt get-channel-analytics --report');
    expect(reply.sort()).toEqual([
      'demographics', 'devices', 'geography', 'subscription-status', 'traffic-sources',
    ]);
  });

  it('leaves the returning value arms untouched', () => {
    expect(complete('staqan-yt get-channel-analytics --output').sort())
      .toEqual(['csv', 'json', 'pretty', 'table', 'text']);
    expect(complete('staqan-yt put-caption --format').sort())
      .toEqual(['raw', 'sbv', 'srt', 'ttml', 'vtt']);
  });

  it('scopes --sort values to list-comments (#179 follow-up)', () => {
    expect(complete('staqan-yt list-comments --sort').sort()).toEqual(['new', 'top']);
    expect(complete('staqan-yt list-comments -s').sort()).toEqual(['new', 'top']);
    // get-channel-analytics --sort takes a field the query selects, which is
    // not knowable here, so it must offer nothing rather than comment sorts.
    expect(complete('staqan-yt get-channel-analytics --sort')).toEqual([]);
  });
});
