# Shell Completion Guide

This guide covers the two-layer completion architecture, key patterns used in
`lib/completion.ts`, and a step-by-step checklist for adding completion support
for a new flag.

---

## Overview: Two-Layer Architecture

```
getCommandOptions()          ← exported TypeScript function
  Used externally (MCP, tests, etc.)
  Source of truth for "what flags does command X have?"

generateBashCompletion()     ← private, produces installed bash script
generateZshCompletion()      ← private, produces installed zsh script
  Both read getCommandOptions() implicitly via the same command lists,
  but their actual completion logic is hand-written for correctness.
```

**Important**: `getCommandOptions` and the generated scripts must be kept in
sync manually. When you add a flag to a command, update both the
`commandOptionMap` entry *and* the corresponding `case` block in the script.

---

## Bash Completion Patterns

### Single-value flags — `case "$prev"`

For flags that take exactly one value, add a case in the `case "${prev}" in`
block near the top of `_staqa_nyt_completion`:

```bash
--output)
  COMPREPLY=( $(compgen -W "json table text pretty csv" -- "${cur}") )
  return ;;
--quality)
  COMPREPLY=( $(compgen -W "maxres standard high medium default" -- "${cur}") )
  return ;;
```

This fires when the user's cursor is immediately after the flag name.

### Space-separated variadic flags — backwards-walk scan

For flags like `--privacy public private unlisted` or `--video-ids id1 id2`,
the user types multiple values separated by spaces after a single flag
occurrence. `$prev` alone can't detect this (it points to the last word, which
is one of the values, not the flag name).

**Pattern**: walk backwards from `$cword-1` until you find the flag name or
hit another flag:

```bash
if [[ "${cur}" != -* ]]; then
  local j
  for ((j=cword-1; j>=1; j--)); do
    case "${words[$j]}" in
      --privacy)
        # Collect already-used values, offer remaining
        local -A _used=()
        local k
        for (( k=j+1; k<cword; k++ )); do
          _used["${words[$k]}"]=1
        done
        local _rem=()
        for v in public private unlisted; do
          [[ -z "${_used[$v]}" ]] && _rem+=("$v")
        done
        COMPREPLY=( $(compgen -W "${_rem[*]}" -- "${cur}") ); return ;;
      public|private|unlisted)
        continue ;;   # skip known values, keep walking
      --video-ids)
        _staqan_yt_complete_type video-id; return ;;
      -*)
        break ;;      # hit a different flag, stop
      *)
        continue ;;
    esac
  done
fi
```

The `public|private|unlisted` arm keeps the scan moving past already-typed
values. The `-*` arm breaks the loop when a different flag boundary is reached.

### Command-level flag lists — `case "$cmd"` inside `case "$prev"`

After the variadic scan, there's a `case "${prev}" in` block where one of the
arms matches the command name itself (set as `$prev` when the user typed
`staqan-yt <cmd> <TAB>`):

```bash
case "${prev}" in
  list-videos)
    COMPREPLY=( $(compgen -W "--channel --limit --type --privacy --output --verbose" -- "${cur}") )
    ;;
  fetch-reports)
    COMPREPLY=( $(compgen -W "--channel --type --types --start-date --end-date --force --verify --verbose" -- "${cur}") )
    ;;
esac
```

Every command must have an arm here; commands without one silently fall through
to no suggestions.

---

## Zsh Completion Patterns

Zsh completion uses `_arguments` specs and a backwards-walk pre-check for
variadic flags. The `_staqa_nyt` function dispatches on `$words[2]`.

### `_arguments` spec format

```zsh
_arguments \
  '--flag[description]:metavar:action'
```

- `metavar` — the label shown in the completion menu (e.g. `format`, `n`)
- `action` — `(val1 val2)` for inline enums, `:funcname` to call a helper
  function, empty `:` for free text

Examples:

```zsh
'--output[Output format]:format:(json table text pretty csv)'
'--video-id[Video ID]: :_staqan_yt_video_ids'
'--limit[Limit number of results]:n:'
```

### `*` prefix semantics — flag can repeat, NOT space-separated values

From `man zshcompsys`:

> Specifications beginning with `*` indicate the option may be given any
> number of times on the command line (i.e. the flag itself repeats).

`*--flag` means:
```
staqan-yt cmd --flag val1 --flag val2   ← correct zsh interpretation
```

It does **NOT** mean:
```
staqan-yt cmd --flag val1 val2          ← space-separated, single occurrence
```

Commander.js processes `--video-ids id1 --video-ids id2` as two invocations,
with the second **overwriting** the first. So `*--video-ids` actively breaks
batch input. Never use `*` for space-separated variadic flags.

### `_describe` for fixed-set enums with descriptions

```zsh
local -a _rem
_rem=(public private unlisted)
_describe -t privacy-status 'privacy status' _rem
```

`_describe` shows items with optional `:description` suffixes in the completion
menu. The `-t` tag keeps the completion group labelled.

### `compadd -F array` for excluding already-used dynamic values

Sourced from `_docker` (`/opt/homebrew/share/zsh/site-functions/_docker`):

```zsh
local -a _vused=()
# ... populate _vused with already-typed IDs ...
local -a _all
_all=(${(f)"$(staqan-yt __complete --type video-id 2>/dev/null | cut -f1)"})
compadd -F _vused -- $_all
```

`compadd -F _vused` filters out all values in `_vused` before offering
completions. Use this for dynamic lists (IDs fetched from cache) where
`_describe` can't help.

### Variadic pre-check pattern

Walk backwards before calling `_arguments`. If we're currently completing a
non-flag token and we find a variadic flag behind us, handle it and `return`
before `_arguments` ever runs:

```zsh
if [[ $words[$CURRENT] != -* ]]; then
  local j=$(($CURRENT - 1))
  local -a _pused=()
  while (( j >= 1 )); do
    case $words[$j] in
      --privacy)
        local -a _rem=()
        local v
        for v in public private unlisted; do
          [[ -z "${_pused[(r)$v]}" ]] && _rem+=($v)
        done
        _describe -t privacy-status 'privacy status' _rem
        return ;;
      public|private|unlisted) _pused+=($words[$j]); (( j-- )) ;;
      *) break ;;
    esac
  done
fi
_arguments \
  '--privacy[...]:status:(public private unlisted)' \
  ...
```

The `_pused[(r)$v]` subscript uses zsh's reverse-subscript operator: it
returns `$v` if found, empty string if not. Combined with `-z`, this filters
already-used values.

---

## Decision Guide — Which Pattern to Use?

| Flag type | Values | Pattern |
|-----------|--------|---------|
| Single fixed enum | `public private unlisted` | `case "$prev"` + `compgen -W` (bash) / `_arguments` spec inline `(val1 val2)` (zsh) |
| Space-separated variadic, fixed enum | `--privacy public private` | Backwards-walk + `_describe` with `_pused` filter |
| Space-separated variadic, dynamic IDs | `--video-ids id1 id2` | Backwards-walk + `compadd -F _vused` from `__complete` call |
| Comma-separated single value | `--types "type1,type2"` | No pre-check; `_arguments` spec `:ids:` (free text) |
| Boolean / text flags | `--dry-run`, `--title` | `case "$prev"` only for the prev-flag arm; no special action needed |

---

## Adding Completion for a New Flag

### Step 1: Update `getCommandOptions`

In `lib/completion.ts`, find your command's entry in `commandOptionMap` and
add the flag name:

```typescript
'my-command': ['--my-flag', ...outputOptions, ...verboseOption],
```

### Step 2: Update the bash `case "$prev"` command arm

Find the `case "${prev}" in` block and locate your command's arm. Add the new
flag to the `compgen -W` list:

```bash
my-command)
  COMPREPLY=( $(compgen -W "--my-flag --output --verbose" -- "${cur}") )
  ;;
```

If the command has no arm yet, add one before the `config)` arm.

### Step 3: Add bash value completion (if needed)

If the flag takes a fixed set of values, add a case in `case "${prev}" in`:

```bash
--my-flag)
  COMPREPLY=( $(compgen -W "val1 val2 val3" -- "${cur}") )
  return ;;
```

If it's variadic (space-separated), add an arm to the backwards-walk block:

```bash
--my-flag)
  COMPREPLY=( $(compgen -W "val1 val2 val3" -- "${cur}") ); return ;;
val1|val2|val3)
  continue ;;
```

### Step 4: Update the zsh `_arguments` spec

Find the `case $words[2] in` arm for your command and add the flag:

```zsh
'--my-flag[Description]:metavar:(val1 val2 val3)'
```

For variadic flags, add a pre-check block *before* `_arguments` (see
[Variadic pre-check pattern](#variadic-pre-check-pattern) above) and use a
plain spec without `*` in `_arguments`.

### Step 5: Build and verify

```bash
npm run type-check
npm run build

# Inspect generated bash completion for your command
node -e "const {getCompletionScript} = require('./dist/lib/completion'); \
  console.log(getCompletionScript('bash'))" | grep -A 3 "my-command)"

# Inspect generated zsh completion
node -e "const {getCompletionScript} = require('./dist/lib/completion'); \
  console.log(getCompletionScript('zsh'))" | grep -A 15 "my-command)"

# Reinstall and test live
staqan-yt config completion zsh
exec zsh
staqan-yt my-command --my-flag <TAB>
```

---

## Related Files

- `lib/completion.ts` — all completion logic
- `commands/config.ts` — `config completion` subcommand that calls `installCompletion()`
- `commands/complete.ts` — `__complete` hidden command (returns ID lists for dynamic completions)
