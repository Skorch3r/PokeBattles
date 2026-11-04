# Medium Bugfix — Legendaries leak into Easy/Normal matches — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-04-legendary-leak-design.md`
**Base:** `ea3b365` · work directly on the planning issue (shape #1) · `node --test tests/*.test.mjs` (glob form).

## Task F1 — Filter rarity-4 from the opponent pool unless Hard (Systems)

Red: append test 7 to `tests/fixes-2026-11-04.test.mjs` (structural pins per spec §Test plan) → fails.
Green: add the `NLG` module const after `const LEG=new Set(...)`; rewrite l.369 exactly per spec §Design decisions (dfr hoisted, pool guard, `NLG` fallback). No other line changes.
Commit `fix: keep legendary-tier Pokémon out of Easy/Normal matches (cache, megas, and new-player fallback)` — suite green.

## Task F2 — CHANGELOG (Content)

Add to the Medium list: legendaries (incl. 700+ BST megas) no longer appear as opponents on Easy/Normal — fixes both the rarity-cache path and the new-player fallback.
Commit `docs: changelog for the legendary-pool fix`.

## Task G9 — QA gate (QA)

1. Full suite, clean tree, glob form.
2. Extend `scripts/qa-gate.mjs` with the four probe groups from spec §QA gate (leak-free Easy/Normal, new-player NLG path, Hard unchanged, wilds untouched). All green.
3. Human e2e: on Easy with a fresh save and after the dex cache fills, run several matches → no legendary or 700+ BST mega appears among the opponents.
