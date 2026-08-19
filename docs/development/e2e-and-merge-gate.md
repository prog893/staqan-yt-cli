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

```
@coderabbitai Requesting an explicit sign-off review on this PR.

1. <finding> - fixed in <sha>
2. <finding> - fixed in <sha>
3. <finding> - withdrawn by you after <evidence>

Nothing is outstanding, but the verdict is still CHANGES_REQUESTED from the
first pass. Please post an updated review. If anything is still open from your
side, say which and I will fix it rather than merge past it.
```

### Reading its silence

| symptom | cause | action |
|---|---|---|
| No acknowledgement at all | Quota exhausted. The limit notice does not always post. | Wait, then re-kick once. |
| "Review limit reached" comment | Quota, explicitly. | Wait for the stated window, then kick. |
| "Repository access failed during verification" | GitHub API incident. | Ask it to retry once the API recovers. |
| Posts `COMMENTED`, verdict unchanged | Stale verdict. | Ask for an explicit verdict, as above. |

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

```
distinct md5 across 5 formats:  before 1,  after 5
```

### Combining PRs that CI never tested together

When two open PRs touch the same files, each one's CI run tested it against the
`main` it branched from, not against the other. Trial-merge locally first:

```bash
git checkout -b trial/x main
git merge --no-ff --no-commit origin/<branch>
bun run type-check && bun run lint && bun test && bun run build
# live check here too, then:
git merge --abort && git checkout main && git branch -D trial/x
```

---

## Never Test Writes Against Published Videos

Mutating commands (`put-video-localization`, `update-video-localization`,
`put-caption`, `update-video*`, `update-video-tags`, `update-thumbnail`) must be
exercised against an **unlisted** test video only.

The round trip:

1. Capture the full prior state, including every field you are not changing.
2. Make the change and verify it.
3. Restore.
4. `diff` the captured state against a fresh read to prove the restore was exact.

Step 4 is not optional. It is what catches the restore being incomplete.

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

```
--format json  8698 bytes md5=7f488731...
--format srt   8698 bytes md5=7f488731...
--format vtt   8698 bytes md5=7f488731...
distinct md5 across formats: 1        <- the bug, stated as a number
```

After, on `main`:

```
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
