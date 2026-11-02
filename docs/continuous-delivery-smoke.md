# Continuous delivery smoke test

## Purpose

Record the `2026-11-02T06-28-04-634Z` integration smoke test for an independent,
external Codex Delivery Agent prototype. The target flow is Feishu assignment →
GitHub Issue → Codex changes in an isolated worktree → pull request.

This prototype does not establish that `feishu-codex-code-bridge` provides automatic
task intake or delivery automation.

This run is tracked by [Issue #4](https://github.com/Github-Shaw/feishu-codex-code-bridge/issues/4).
The authorized change is limited to this document, including any later Review/CI
additions for this smoke test. No application code or workflows are changed.
The existing `pnpm typecheck`, `pnpm test`, and `pnpm build` checks must pass.

Local worker validation: `pnpm typecheck` and `pnpm build` passed. `pnpm test`
exited with an error: all 25 tests passed, but the existing logger attempted to
write `~/.feishu-codex-code-bridge/logs/2026-11-02.log` outside the worktree and
raised an unhandled `EPERM` error. This restricted worker run does not count as a
passing test check or CI.

The [host verification report](https://github.com/Github-Shaw/feishu-codex-code-bridge/issues/4#issuecomment-6570805397)
states that all three checks exited with code 0 in this ticket's worktree, with
7 test files and 25 tests passing. These are host-reported results; the worker did
not independently observe that run. The host independently gates publication on
all three checks and validates the final change before publishing.

## Manual merge

The worker leaves the change and check results for the host to validate, commit,
and publish to [PR #5](https://github.com/Github-Shaw/feishu-codex-code-bridge/pull/5).
Acceptance of the full target flow still requires host validation and human review.

A human must review the pull request and its checks and perform the merge.
Merge is always manual; neither the agent nor the host may perform automatic merges.

## Recovery

After a process interruption, inspect the current files and Git history before
resuming. Confirm that the same task, worktree, exact recorded Codex session, and
bound PR refer to the same delivery. For ticket `158fe599b97c3edf8d536dbd233f2014`,
the review destination is the existing PR #5 linked above. Resume the recorded
session and continue that PR; do not treat the interruption as a new task or
create a duplicate PR.

If authorization or the outcome of a remote write is unclear, pause dependent
actions and reconcile the authorization and remote state before continuing.
Verify whether the previous write already succeeded before retrying it.
Recovery must preserve the authorized scope and the requirement for human merge.
