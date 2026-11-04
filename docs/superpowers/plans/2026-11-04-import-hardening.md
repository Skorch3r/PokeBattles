# Import Hardening — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-04-import-hardening-design.md`
**Base:** `ea3b365` · work directly on the planning issue (shape #1) · `node --test tests/*.test.mjs` (glob form).

## Task F1 — Size limit + deep validation/repair (Systems)

Red: append tests 8–9 to `tests/fixes-2026-11-04.test.mjs` + functional repair/reject tests to `tests/save-io.test.mjs` → fail.
Green: exactly per spec §Fix 2 — `TYPES`/`SKKEYS` consts; per-PRG loop (name/type reject, b/sk/rb/bp repair); `pts` reject; `mgs` entry validation; `skin/bst/ach/items` repair; `mis` via `misNormalize`; `fi.onchange` size guard. No other changes.
Commit `fix: validate and repair every save field on import, cap import files at 1 MB` — suite green.

## Task F2 — Escape layer (Systems)

Red: append test 10 → fails.
Green: `esc()` helper + `img()` alt escape + the 7 content sites per spec §Fix 3. Rendering output for legitimate names is visually identical (apostrophes/colons render as-is).
Commit `fix: escape save-supplied names and types in every render path (stored XSS)` — suite green.

## Task F3 — CHANGELOG (Content)

Add under a new "Security & robustness" heading: 1 MB import cap, full save-field validation with repair, HTML-escaping of save-supplied names/types (stored-XSS fix).
Commit `docs: changelog for the import hardening`.

## Task G10 — QA gate (QA)

1. Full suite, clean tree, glob form.
2. Extend `scripts/qa-gate.mjs` with the five probe groups from spec §QA gate. All green.
3. Human e2e card for the user (rejection messages, benign-save round-trip, nothing executes on hostile codes).
