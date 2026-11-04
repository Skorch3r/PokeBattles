# Two Medium-Bug Fixes — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-04-medium-bugfixes-design.md`
**Base:** `c57c69b` · strictly sequential (every task edits `index.html`) · `node --test tests/*.test.mjs` (glob form).

## Task F1 — Toast queue (Systems)

Red: append test 5 to `tests/fixes-2026-11-04.test.mjs` (structural pins per spec §Test plan) → fails.
Green: replace the single-line `function toast(t){…}` (l.284) with the queue implementation from spec §Design decisions (`const toastQ=[]` + `toast()` + `nextToast()`). Keep every call-site unchanged.
Commit `fix: queue toast messages instead of overwriting (match-end toasts all show)` — suite green.

## Task F2 — Leave-the-match confirmation (Systems)

Red: append test 6 → fails.
Green: replace the nav handler (l.527) with the guarded version from spec §Design decisions. Confirm only when `M && !M.over`; decline = early return (loop keeps running, dt already clamped to 50 ms).
Commit `fix: confirm before abandoning an active match via the top tabs` — suite green.

## Task F3 — CHANGELOG (Content)

Extend the "Bug fixes" area with a 2026-11-04 (medium) subsection: toast queue (no lost match-end messages) and leave-match confirmation. Commit `docs: changelog for the two medium fixes`.

## Task G8 — QA gate (QA)

1. Full suite, clean tree, glob form.
2. Extend `/tmp/gate.mjs` with the two probe groups from spec §QA gate (queue order incl. "first message shows immediately"; confirm gating incl. end-screen no-confirm). All green.
3. Human e2e: win a match with a mission completing and an achievement triggering → both messages appear in sequence; click a top tab mid-match → confirmation appears, Cancel resumes the match, OK discards; on the end screen tabs still switch instantly.
