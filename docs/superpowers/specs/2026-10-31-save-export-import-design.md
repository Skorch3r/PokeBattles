# Save Export/Import — Design

_Date: 2026-10-31 · Status: awaiting human approval · Size: small (one feature, single file)_

## Intent & why

PokeBattles progress (gems, collection, skins, Megas, wins, achievements, settings) is
saved only in `localStorage['pdb']` — glued to one browser on one device. Clearing site
data or switching browsers loses everything forever. This feature gives players a way to
carry and back up their progress: an export/import UI in the game.

## Goals

- Export the full meta save as **a copyable code** and **a downloadable file**.
- Import from **a pasted code** or **a chosen file**, on desktop and mobile browsers.
- Show what you're about to lose/gain before an import happens (preview + confirm).
- Works entirely offline in the existing single-file game; zero dependencies.

## Non-goals

- No cloud sync, no accounts, no server.
- No mid-battle resume (battle state stays memory-only).
- No merge of two saves.

## Anti-goals (failure even if it works)

- Infinite-gem exploit: import must never be a way to duplicate currency or items
  (this is why merge was rejected).
- Silent data loss: an import must never wipe progress without an explicit confirm
  showing both sides.
- Breaking existing saves: normal `localStorage` load path untouched.

## Approaches considered

| Approach | Tradeoff | Verdict |
|---|---|---|
| A — copy/paste save code only | simplest UI; clunky for archiving | considered |
| B — save file only | good archival; worst for quick device-to-device moves | considered |
| **C — both, one engine** | one extra button + file input over A; covers quick transfer *and* backups | **chosen (human approved)** |

Import semantics: **replace with preview + confirm** (chosen). Merge rejected: re-importing
an older save would duplicate gems/items. Exports **strip the `bst` stat cache**
(re-fetchable from PokeAPI; `scan()` re-fetches missing entries automatically) to keep
codes small. Payload carries a **version number** for future save-format migrations.

## The design

**Payload.** One canonical JSON envelope, built once, surfaced two ways:

```json
{ "game": "pokebattles", "v": 1, "saved": "<ISO 8601 date>", "state": { ...S minus bst } }
```

- **Code**: compact text — `PDB1-<base64url(JSON envelope)>` (single line, easy to copy).
- **File**: the same envelope as pretty-printed JSON, named
  `pokebattles-save-YYYY-MM-DD.json`.

**Export (Inventory tab, "Save data" section).** Shows current summary
(gems · Pokémon owned · wins), then "Copy code" (writes code to clipboard, auto-select
fallback) and "Download file".

**Import.** Paste into a textarea or pick a file, then:

1. Parse: strip optional whitespace, base64-decode codes vs. parse JSON directly for
   files (accept either form in either surface — detect by prefix).
2. Validate: `game` must be `pokebattles`, `v` must be `1` (anything else → clear
   "unsupported save version" message); `state` must satisfy the shape check
   (required keys with correct types: `caught` object, `gems`/`wins`/`se`/`crit`
   non-negative finite numbers, `ach` object; unknown extra keys **preserved** so
   future fields ride along).
3. Preview + confirm (native `confirm()` fits the game's minimal style):
   "Replace your progress? Current: 240 gems, 18 Pokémon, 6 wins → Imported: 500 gems,
   31 Pokémon, 12 wins (saved 2026-11-02)". Cancel = no changes.
4. Apply: sanitize-validated state replaces `S` (lazy defaults re-applied exactly as in
   the normal load path), `save()` persists, HUD/dex/shop/inventory re-render, toast
   confirms success.

**Where the logic lives.** Pure, testable functions inside the existing script —
`buildExportPayload(S)`, `parseImportPayload(text)` (returns parsed+validated state or a
typed error), `applyImport(state)` — kept separated from DOM code so QA can probe them
with node (browser-less sandbox: extract the script, stub DOM, run probes).

## Constraints

- Single HTML file, vanilla JS/CSS only; game must keep working offline after import
  failures (all errors are toasts, never thrown to top level).
- Import/export must not depend on network (only the `bst` re-scan does, and that's
  optional/async as today).

## What's left to the builder

- Exact checksum decision: a light integrity hash is allowed but optional — JSON parse
  failure already catches truncation; validation is the real gate. If added, keep it
  cheap and explained in the error toasts.
- Clipboard API with fallback (textarea select+copy) for older browsers.
- File `input type=file` styling consistent with the game's buttons.
- Any UI polish within the Inventory tab section described above.
