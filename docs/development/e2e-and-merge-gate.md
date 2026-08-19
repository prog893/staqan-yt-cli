# E2E Proof and the Merge Gate

How a change gets from a branch to `main`: what has to be proven, and who
approves it.

**→ Back to [Development Guides](README.md)**

---

## The Merge Gate

**CodeRabbit is the merge gate.** A PR merges when CodeRabbit has posted an
`APPROVED` review and CI is green. No separate human sign-off is required.

### Check the review, not just the checks

`gh pr checks` passing is not approval. A PR can have every check green and
still carry a blocking `CHANGES_REQUESTED`.

```bash
gh pr view <N> --repo prog893/staqan-yt-cli --json reviewDecision,reviews \
  --jq '{decision:.reviewDecision, reviews:[.reviews[]|.state]}'
```

Never merge while `reviewDecision` is `CHANGES_REQUESTED`, even when you believe
every finding is addressed.

### Treat it as a reviewer, not a rubber stamp

Findings are sometimes wrong. Disagreeing with evidence works, and is preferred
over silently complying with a change that makes the code worse.

- **Bring measurements, not opinions.** A finding asking for byte-level
  normalization of caption output was withdrawn once the actual API bytes were
  shown (srt/vtt/sbv end with two newlines, and that blank line terminates the
  final cue).
- **Bring the codebase convention, measured.** A finding asking for every field
  in every output format was withdrawn after a table showing `csv` carries the
  complete record while `table`/`text` are curated subsets in every comparable
  command.
- **Partial acceptance is normal.** Take the part that is right, decline the
  rest with reasons. It records accepted reasoning as learnings and applies
  them to later PRs.

### Getting a verdict unstuck

A follow-up review that lands as `COMMENTED` does **not** supersede an earlier
`CHANGES_REQUESTED`. The PR stays blocked even after the bot says it is happy.

What does not reliably work:

- A bare `@coderabbitai review` after pushing fixes. Often a no-op.
- Repeating the kick. Each attempt can consume the quota window.

What works: **ask for an explicit verdict**, listing each finding and its
current status.

```text
@coderabbitai Requesting an explicit sign-off review on this PR.

1. <finding> - fixed in <sha>
2. <finding> - fixed in <sha>
3. <finding> - withdrawn by you after <evidence>

Nothing is outstanding, but the verdict is still CHANGES_REQUESTED from the
first pass. Please post an updated review. If anything is still open from your
side, say which and I will fix it rather than merge past it.
```

### Never kick a rate-limited PR on a guess

When the quota is exhausted, CodeRabbit posts a comment saying
`Next review available in: N minutes`. **Do the arithmetic before kicking.**
Polling a rate-limited PR, or re-kicking to "check", is pure noise.

The `N minutes` value is relative to the comment's **`updated_at`**, not its
`created_at`, and it does not tick down on its own. So:

```text
available_at = updated_at + N minutes
```

Fails closed: a `gh` outage exits non-zero rather than printing nothing and
looking like "no limit, go ahead". Reports only the newest notice, since older
ones on the same PR are stale.

```bash
#!/usr/bin/env bash
set -euo pipefail

# Fetch separately so a gh failure is its own exit code. Folding it into the
# pipeline would report "still waiting", and a caller that sleeps on that would
# wait forever on an expired token.
json=$(gh api \
  "/repos/prog893/staqan-yt-cli/issues/${1:?PR number required}/comments?per_page=100" \
  --jq '[.[] | select(.user.login=="coderabbitai[bot]")]') \
  || { echo "gh api failed: cannot determine rate-limit state" >&2; exit 3; }

printf '%s' "$json" | python3 -c "
import sys, json, re, datetime

notices = []
for o in json.load(sys.stdin):
    m = re.search(r'Next review available in:\**\s*\**(\d+)\s*minutes', o['body'])
    if m:
        upd = datetime.datetime.fromisoformat(o['updated_at'].replace('Z', '+00:00'))
        notices.append((upd, upd + datetime.timedelta(minutes=int(m.group(1)))))

if not notices:
    print('no rate-limit notice on this PR')
    raise SystemExit(2)

_, avail = max(notices)                     # newest notice only
wait = (avail - datetime.datetime.now(datetime.timezone.utc)).total_seconds()
jst = (avail + datetime.timedelta(hours=9)).strftime('%H:%M JST')
print(avail.strftime('%H:%M UTC'), '=', jst,
      '| wait %.0f min' % (wait / 60) if wait > 0 else '| OPEN')
raise SystemExit(1 if wait > 0 else 0)
"
```

Exit codes: `0` open, `1` still waiting, `2` no notice found, `3` lookup failed.
Only `0` and `2` mean it is safe to kick.

Kicking early is not catastrophic, just wasteful. Three readings on #172, each
after a kick:

| anchor | states | resolves to |
|---|---|---|
| `created 01:02:40` | 57 min | `01:59:40` |
| `updated 01:18:55` | 41 min | `01:59:55` |
| `updated 01:28:02` | 31 min | `01:59:02` |

The resolved times differ by up to 53 seconds, so they are not identical. What
matters is the scale: the spread is under a minute against a window of roughly
40, meaning a kick **recomputes the countdown against the new `updated_at`
without restarting the quota window**. Treat the resolved time as accurate to
about a minute, not to the second.

So an early kick does not push the wait out. It still adds a comment and tells
you nothing you could not have computed, which is reason enough not to.

One kick after `available_at`, not a poll loop before it.

### Reading its silence

| symptom | likely cause | action |
|---|---|---|
| No acknowledgement at all | **Ambiguous.** Most often quota, whose notice does not always post, but auth, bot configuration and GitHub outages look identical. | Diagnose before waiting (below). |
| "Review limit reached" comment | Quota, explicitly. | Compute the window, then one kick. |
| "Repository access failed during verification" | GitHub API incident. | Ask it to retry once the API recovers. |
| "Action not completed / Review rate limited" with no countdown | Incremental no-op: the commits are already marked reviewed. | `@coderabbitai full review`. |
| `Reviews resumed` but still no review | `resume` un-pauses; it does not re-examine seen commits. | `@coderabbitai full review`. |
| Posts `COMMENTED`, verdict unchanged | Stale verdict. | Ask for an explicit verdict, as above. |

Silence is not proof of quota. Rule it out before waiting an hour on a guess:

```bash
gh auth status                                    # token still valid?
gh api /repos/prog893/staqan-yt-cli --jq .full_name   # API reachable at all?
gh api /repos/prog893/staqan-yt-cli/installation --jq .app_slug 2>/dev/null \
  || echo "app install not visible"               # bot still installed?
```

A GitHub incident is the common non-quota cause, and it shows up as scattered
`HTTP 503`/`504` from `gh` itself rather than as anything CodeRabbit posts.

### Which command to use

The three are not interchangeable, and picking the wrong one wastes a cycle:

| command | what it does | use when |
|---|---|---|
| `@coderabbitai review` | Incremental. Skips commits it has already seen. | New commits were pushed since the last review. |
| `@coderabbitai resume` | Un-pauses automatic reviews. | Reviews were paused. |
| `@coderabbitai full review` | Re-examines everything, ignoring incremental state. | `review` no-ops, or a failed attempt marked commits as seen without producing a review. |

A rate-limited first attempt marks the commits reviewed, so `review` afterwards
answers "does not re-review already reviewed commits" and `resume` reports
success while changing nothing. `full review` is what actually produces the
review in that state.

---

## E2E Proof

Unit tests are not sufficient. Tests encode what you believed while writing the
fix, so a fix built on a wrong belief ships with tests that agree with it. Run
the real binary against the real API and prove three things.

### 1. The bug was there

Capture the broken behavior on `main` **before** merging. Without this, "it
works now" is unfalsifiable: there is no evidence anything was ever wrong.

### 2. The bug is gone

Re-run the **identical** commands after merging. Same commands, same order.
Save both runs to files and diff them.

### 3. Nothing else broke

- **Positive controls**: inputs that already worked must still work.
- **Negative controls**: invalid inputs must still be rejected. A fix that
  starts accepting garbage is a new bug, not a fix.
- Full suite: `bun run type-check && bun run lint && bun test`.
- A smoke sweep of neighbouring commands.

### Prefer objective evidence

Exit codes, byte counts, checksums, distinct-value counts. Not eyeballing.

"`--format` now works" is weak. This is not:

```text
distinct md5 across 5 formats:  before 1,  after 5
```

### Combining PRs that CI never tested together

When two open PRs touch the same files, each one's CI run tested it against the
`main` it branched from, not against the other. Trial-merge locally first:

Cleanup runs on a trap, not chained after validation with `&&`. Chaining leaves
the trial branch and a half-merged working tree behind on exactly the runs where
something failed, which is when you least want to be untangling git state.

```bash
#!/usr/bin/env bash
set -euo pipefail

trial="trial/$(date +%s)"
cleanup() {
  git merge --abort 2>/dev/null || true
  git checkout main -q
  git branch -D "$trial" -q 2>/dev/null || true
}
trap cleanup EXIT

git checkout -b "$trial" main -q
git merge --no-ff --no-commit "origin/$1"

bun run type-check
bun run lint
bun test
bun run build
# live check against the real API here too
```

---

## Never Test Writes Against Published Videos

Mutating commands (`put-video-localization`, `update-video-localization`,
`put-caption`, `update-video*`, `update-video-tags`, `update-thumbnail`) must be
exercised against an **unlisted** test video only.

The round trip:

1. Capture a **canonical projection** of the prior state: every field you are
   changing, plus every field you might disturb, and nothing server-managed.
2. Make the change and verify it.
3. Restore.
4. `diff` the projection against a fresh read to prove the restore was exact.

Step 4 is not optional. It is what catches the restore being incomplete.

**Do not diff the raw API envelope.** YouTube resources carry server-managed
fields that a write can change, which would make step 4 fail on runs where the
restore was perfectly correct, training you to ignore the one check that matters.

- `etag` is byte-stable across repeated reads of an untouched resource, so any
  change in it reflects a write rather than read noise. Including it in the
  projection turns every write test into a false positive.
- Caption `snippet.lastUpdated` is write-stamped. Visible directly in the
  archive: a track carrying `2023-11-02T13:35:10Z` sits beside one stamped at
  the moment of upload.

Project the fields under test instead:

```ts
// Read both times through the same projection, so the diff can only show a
// real difference. Adding `etag` here would make every run look like a failure.
const r = await yt.videos.list({ part: ['snippet', 'localizations'], id: [videoId] });
const v = r.data.items![0];
console.log(JSON.stringify({
  defaultLanguage: v.snippet?.defaultLanguage,
  defaultAudioLanguage: v.snippet?.defaultAudioLanguage,   // the field that drifted
  title: v.snippet?.title,
  categoryId: v.snippet?.categoryId,
  tags: v.snippet?.tags,
  localizations: v.localizations ?? null,
}, null, 2));
```

The projection has to be wider than the field under test. `defaultAudioLanguage`
was not being changed deliberately, and including it anyway is the only reason
the drift below was caught.

> **Send the whole `snippet` on `videos.update`.** Fields omitted from the
> payload get re-derived by YouTube rather than left alone. A restore that sent
> only title/description/categoryId/tags/defaultLanguage silently flipped
> `defaultAudioLanguage` from `en` to `en-US`. `putVideoLocalization` spreads
> `...video.snippet` for exactly this reason.

Caption tracks can be created and deleted freely on an unlisted video: there is
no `delete-caption` command, but `captions.delete` is available through the API
for cleanup.

---

## Worked Example

The `get-caption --format` fix (#167).

Before, on `main`:

```text
--format json  8698 bytes md5=7f488731...
--format srt   8698 bytes md5=7f488731...
--format vtt   8698 bytes md5=7f488731...
distinct md5 across formats: 1        <- the bug, stated as a number
```

After, on `main`:

```text
--format raw   8697 bytes md5=4e322db6...
--format srt   8238 bytes md5=8fa29c79...
--format vtt   7990 bytes md5=81ed25e4...   first line: WEBVTT
--format ttml 11687 bytes md5=0b156114...   first line: <?xml version="1.0" ...
distinct md5 across formats: 5
json alias == raw:      YES     <- back-compat control
no-flag default == raw: YES     <- default unchanged
scc rejected: exit=1            <- negative control
bogus rejected: exit=1          <- negative control
```

Every claim is a number or an exit code, and the controls prove the fix did not
buy its win by loosening something else.

---

## Related Guides

- **[Testing Guide](testing-guide.md)** - manual testing strategies, local builds
- **[Git Workflow Guide](git-workflow.md)** - branches, commits, releases
- **[Error Handling Guide](error-handling.md)** - user-facing error patterns
