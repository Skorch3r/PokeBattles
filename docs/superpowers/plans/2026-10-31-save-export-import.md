# Save Export/Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players can export their full progress as a copyable code or JSON file, and import it back (replace-with-preview) in any browser.

**Architecture:** A new pure, DOM-free `<script id="save-io">` block in `index.html` (placed immediately before the existing main `<script>`) holds the payload builder, parser/validator, and state-apply logic. A dependency-free node test harness (`tests/`) extracts that block and probes it — this is how QA works in the browser-less sandbox. The main script wires the pure layer into a "Save data" section at the end of the Inventory tab.

**Tech Stack:** Vanilla JS/CSS in a single HTML file; node (v22 on PATH) + `node:assert` for tests. Zero npm dependencies.

**Spec:** `docs/superpowers/specs/2026-10-31-save-export-import-design.md` — read it first; this plan argues from it.

## Global Constraints

- Single product file: **all product changes go in `index.html`**; new files allowed only under `tests/`.
- **Zero dependencies** — no npm install, no CDN, no build step.
- Do **not** modify the existing load path (`index.html` line 42–43: `S=JSON.parse(localStorage.getItem('pdb'))||fresh()` and `save=`). Import must make the game behave **exactly as if the imported save had been in localStorage at page load**.
- Every import failure path ends in a `toast()` message; nothing throws to top level; the game keeps working offline.
- Import **replaces** (never merges) and never touches progress without a `confirm()` that shows both current and imported summaries.
- Keep existing save data backward compatible: fresh `localStorage['pdb']` loading, `fresh()` defaults, and line 44's lazy default (`S.mgs=S.mgs||{}`) are untouched.
- Sandbox is browser-less: verification = node probes + code-read checklists; no Playwright.

## Review Focus

1. **Truncated copy-paste code** → clear "code looks cut off" toast, never a crash or partial import. (pinned: Task 2, `parse_truncated_code_fails`)
2. **Random text / another game's JSON pasted** → "not a PokéBattles save" toast. (pinned: Task 2, `parse_garbage_fails`, `parse_wrong_game_fails`)
3. **Future save version (v:2)** → refuses with "different version" toast, current progress untouched. (pinned: Task 2, `parse_wrong_version_fails`)
4. **Import of a minimal/hand-made save missing optional keys** (`mgs`, `skin`, `pts`, `se`, `crit`, `mute`) → game behaves as on fresh load; no TypeErrors. (pinned: Task 2, `apply_fills_lazy_defaults`)
5. **Export on a brand-new install** (0 gems, 0 Pokémon) → valid code that round-trips. (pinned: Task 2, `roundtrip_fresh_state`)

---

### Task 1: Pure save-io block — payload builder + node test harness

**Files:**
- Modify: `index.html` (insert new `<script id="save-io">…</script>` block immediately before the existing `<script>` tag on line 37; also update the `tests` note below)
- Create: `tests/save-io.test.mjs`
- Create: `tests/README.md` (3–4 lines: how to run)

**Interfaces:**
- Consumes: nothing (pure block, DOM-free, no globals from the main script).
- Produces (all later tasks + tests rely on these exact names):
  - `const SAVE_GAME='pokebattles', SAVE_VERSION=1, SAVE_CODE_PREFIX='PDB1-'`
  - `buildExportPayload(S)` → `{ code, fileJson, fileBase, summary:{gems, caught, wins, saved} }`
  - Helpers (internal but test-visible): `b64urlEncode(str)`, `b64urlDecode(str)`

**Behavior contract for `buildExportPayload(S)`:**
- `state` = shallow-cloned `S` with the `bst` key deleted (spec: strip re-fetchable cache). Original `S` must not be mutated.
- Envelope = `{ game:SAVE_GAME, v:SAVE_VERSION, saved:<ISO string>, state }`.
- `code` = `SAVE_CODE_PREFIX + b64urlEncode(JSON.stringify(envelope))` — one line, URL-safe alphabet (`-`, `_`, no `=` padding).
- `fileJson` = `JSON.stringify(envelope, null, 2)`; `fileBase` = `pokebattles-save-<YYYY-MM-DD>` (date from `saved`).
- `summary` = `{ gems:S.gems, caught:Object.keys(S.caught).length, wins:S.wins, saved:<same ISO string> }`.
- Unicode-safe base64 (names may contain non-ASCII): encode via `btoa(unescape(encodeURIComponent(json)))` then swap `+→-`, `/→_`, strip `=`; decode inverts exactly.

- [ ] **Step 1: Write the failing test** — `tests/save-io.test.mjs`:

Harness skeleton (reused by all later tests — write it now, complete):

```js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="save-io">([\s\S]*?)<\/script>/);
assert.ok(m, 'save-io script block not found in index.html');
const io = new Function(m[1] + '\nreturn {SAVE_GAME,SAVE_VERSION,SAVE_CODE_PREFIX,buildExportPayload,b64urlEncode,b64urlDecode};')();
// NOTE: Task 2 extends this return line with parseImportPayload/validateSaveState/applyImportState
// once those functions exist in the block (undefined names here would throw at import time).
```

Task 1 test cases (use `const { buildExportPayload } = io;` and a sample state):
```js
const S0 = { caught:{25:{n:'pikachu',t:['electric'],b:320,sk:[]}}, wins:6, gems:240, bst:{25:320}, lead:25, se:3, crit:1, ach:{a:1}, mgs:{}, mute:false };
```
- `build_export_shape`: payload.code starts `'PDB1-'`; decoding `code.slice(5)` (b64url→b64→`decodeURIComponent(escape(atob(...)))` in-test) yields JSON whose `game`/`v` match the constants, `saved` parses as a date, and `state` deep-equals `S0` minus `bst` (and `bst` is gone); `S0.bst` still present afterwards (no mutation).
- `build_export_summary`: `summary` deep-equals `{ gems:240, caught:1, wins:6, saved:<the envelope's saved> }`.
- `build_export_file`: `fileJson` re-parses to the same envelope; `fileBase` matches `/^pokebattles-save-\d{4}-\d{2}-\d{2}$/` and its date equals `saved.slice(0,10)`.
- `build_export_code_is_one_line`: `!code.includes('\n') && !code.includes('+') && !code.includes('/') && !code.endsWith('=')`.
- `build_export_unicode_name_survives`: name `'Flabébé'` in `caught[669].n` survives code decode byte-exactly.

- [ ] **Step 2: Run to verify failure** — `node tests/save-io.test.mjs` → FAIL (`save-io script block not found`).

- [ ] **Step 3: Implement** the `<script id="save-io">` block in `index.html` before line 37's `<script>`, containing only: the three constants, the two b64url helpers, and `buildExportPayload` per the contract above. No DOM access, no references to main-script globals.

- [ ] **Step 4: Run to verify pass** — `node tests/save-io.test.mjs` → all 5 tests PASS.

- [ ] **Step 5: Commit** — `git add index.html tests/ && git commit -m "feat(save): pure export-payload builder + node probe harness"`

### Task 2: Parser/validator + import-state semantics (pure layer complete)

**Files:**
- Modify: `index.html` (extend the `save-io` block only)
- Modify: `tests/save-io.test.mjs` (add Task 2 tests)

**Interfaces:**
- Consumes: Task 1 constants/helpers.
- Produces:
  - `validateSaveState(state)` → sanitized state object, or `null` if invalid.
  - `parseImportPayload(text)` → `{ ok:true, state, summary:{gems,caught,wins,saved} }` | `{ ok:false, error }` where `error` ∈ `'empty'|'cutoff'|'format'|'version'|'shape'`.
  - `applyImportState(prevS, importedState)` → the new `S` object (pure; caller assigns it).

**Behavior contracts:**
- `parseImportPayload`: trim input; empty → `'empty'`. If it starts with `SAVE_CODE_PREFIX` → b64url-decode → `JSON.parse`; JSON failure or non-object → `'cutoff'`. Otherwise `JSON.parse` directly; failure or non-object → `'format'`. Envelope must have `game===SAVE_GAME` (else `'format'`) and `v===SAVE_VERSION` (game ok, v wrong → `'version'`). Then `state=validateSaveState(envelope.state)`; null → `'shape'`. `summary` computed like Task 1 from validated state; `saved` = envelope.saved.
- `validateSaveState`: reject non-objects, arrays; require `caught` plain object, `ach` plain object; require `gems`,`wins` finite numbers ≥ 0 (coerce-integers stay as-is — no rounding); `se`,`crit` default to `0` when absent (finite ≥ 0 when present); `lead` finite number ≥ 0, default `0`; **unknown extra keys preserved as-is**; must NOT be mutated in place by the caller — return a shallow-cloned, sanitized object.
- `applyImportState(prevS, imported)`: returns a fresh object = validated imported state with lazy defaults mirroring the load path — `state.mgs = state.mgs || {}` (mirrors `index.html` line 44) — plus `state.pts = state.pts || 0`; everything else exactly as imported. Does not reference `prevS` except that callers may pass it for symmetry; never mutates either input.

- [ ] **Step 1: Write the failing tests** (first extend the harness's `return {…}` line with `parseImportPayload,validateSaveState,applyImportState`, then add):
  - `roundtrip_fresh_state`: `parseImportPayload(buildExportPayload(fresh-like-empty-state).code)` → ok, summary `{gems:0, caught:0, wins:0}`. (Review Focus #5)
  - `parse_accepts_file_json`: feeding `fileJson` (not the code) parses ok with same summary.
  - `parse_import_either_surface_either_form`: code pasted into a file context and file JSON pasted into code context both parse ok (prefix detection).
  - `parse_empty_fails`: `''` and `'   '` → `{ok:false, error:'empty'}`.
  - `parse_garbage_fails`: `'hello world'` and `'{"a":1}'` → `'format'`. (Review Focus #2)
  - `parse_truncated_code_fails`: valid code with last 10 chars removed → `'cutoff'`. (Review Focus #1)
  - `parse_wrong_game_fails`: envelope with `game:'other'` (wrap in code prefix via io helpers if convenient, else file JSON) → `'format'`.
  - `parse_wrong_version_fails`: envelope `v:2` → `'version'`; caller-side contract: error key maps to a toast, state untouched. (Review Focus #3)
  - `parse_shape_rejects`: `caught` as array; `gems:-5`; `gems:'many'`; `caught:{}` but `wins:'six'` → all `'shape'`.
  - `validate_preserves_unknown_keys`: state with extra `futureThing:'x'` keeps it after validate; `se/crit/lead` absent → defaulted 0/0/0.
  - `apply_fills_lazy_defaults`: `applyImportState(S0, {caught:{},ach:{},gems:1,wins:0})` has `mgs` and `pts` defined, leaves input objects unmutated. (Review Focus #4)
- [ ] **Step 2: Run to verify failure** — `node tests/save-io.test.mjs` → new tests FAIL (`parseImportPayload is not a function`).
- [ ] **Step 3: Implement** the three functions in the `save-io` block per contracts.
- [ ] **Step 4: Run to verify pass** — all tests (Task 1 + Task 2) PASS.
- [ ] **Step 5: Commit** — `git add index.html tests/ && git commit -m "feat(save): import parser/validator + state-apply semantics"`

### Task 3: Export UI in Inventory tab

**Files:**
- Modify: `index.html` — `inv()` renderer (function at char offset ≈46623 / source line 282) and its handler wiring; a few CSS rules in the existing `<style>` if needed (follow existing `.panel`/`.btn` patterns — no new design language).

**Interfaces:**
- Consumes: `buildExportPayload(S)` (Task 1), `toast(t)` (main script, line 112), existing `hud()`/`render()` not needed here.
- Produces (Task 4 relies on these DOM ids): `#saveinfo` (summary line), `#saveta` (textarea), and handler pattern `data-save` buttons.

**Behavior contract:**
- Appended at the **end of `inv()`'s returned template**: a `.panel` section titled **"Save data"** with the one-line explainer "Carry your progress to another browser or device, or keep a backup file." then:
  - `#saveinfo` line: `<gems> gems · <caught> Pokémon · <wins> wins` (values from `S`).
  - Button `data-save="export"` labeled **Copy code** → `buildExportPayload(S)`; puts `code` into `#saveta` (readonly, auto-select), then clipboard: `navigator.clipboard.writeText(code)` with fallback to `select()`+`document.execCommand('copy')`; toast `'Save code copied — paste it somewhere safe.'`; clipboard failure still leaves the code selected in the textarea + toast `'Code ready below — copy it manually.'`.
  - Button `data-save="file"` labeled **Download file** → uses `payload.fileJson`/`payload.fileBase`: `Blob([fileJson],{type:'application/json'})` + `URL.createObjectURL` + temp `<a download=fileBase+'.json'>`; toast `'Save file downloaded.'`.
  - `#saveta`: `<textarea>` placeholder `'Your save code appears here — or paste a code (or file contents) below to import.'`. No maxlength.
- Wiring follows the existing in-renderer pattern (`g.querySelectorAll('[data-bs]')…onclick`, line 169) — attach handlers right after the section is rendered inside `inv()`.

- [ ] **Step 1: Structural probe test** — add to `tests/save-io.test.mjs`: `export_ui_wiring`: main script contains `data-save="export"`, `data-save="file"`, `id="saveta"`, `id="saveinfo"`, and `inv()` section includes the `Save data` title; assert `navigator.clipboard` fallback string `execCommand('copy')` present. (Extraction: reuse the harness's `html` string with regex assertions — DOM code can't be evaluated headless; this is a checklist probe, per the browser-less ruling.)
- [ ] **Step 2: Run to verify failure** — probe FAILs (no wiring yet).
- [ ] **Step 3: Implement** the section + handlers per contract.
- [ ] **Step 4: Run to verify pass** — all tests PASS; code-read checklist: no `bst` in exported state (guaranteed by pure layer), readonly textarea set in export handler only.
- [ ] **Step 5: Commit** — `git add index.html tests/ && git commit -m "feat(save): export UI — copy code + download file in Inventory"`

### Task 4: Import UI — preview, confirm, apply

**Files:**
- Modify: `index.html` — same Inventory section (extend Task 3's markup + handlers) and one helper in the main script.

**Interfaces:**
- Consumes: `parseImportPayload(text)`, `applyImportState(prevS, imported)` (Task 2), `save()`/`toast()`/`hud()`/`render()` (main script), DOM ids `#saveta`, `#saveinfo` (Task 3).
- Produces: complete user-facing feature; no further consumers.

**Behavior contract:**
- Add to the section: button `data-save="import"` labeled **Import from text above** → `doImport($('#saveta').value)`; button `data-save="filepick"` labeled **Import from file…** + hidden `<input type="file" id="savefile" accept=".json,.txt,application/json,text/plain">` → `FileReader.readAsText` → `doImport(result)`.
- `doImport(text)` (main-script helper):
  1. `const r = parseImportPayload(text)`; on `!r.ok` map error keys → toasts, exactly: `empty`→`'Nothing to import — paste a code or choose a file first.'`, `cutoff`→`'That code looks cut off — copy the whole code and try again.'`, `format`→`"That doesn't look like a PokéBattles save."`, `version`→`'That save is from a different version of the game.'`, `shape`→`'That save is damaged or incomplete.'`; **return without touching S**.
  2. Preview + native confirm (spec's minimal-style ruling): `confirm('Replace your progress?\n\nCurrent: '+cur.gems+' gems, '+cur.caught+' Pokémon, '+cur.wins+' wins\nImported: '+r.summary.gems+' gems, '+r.summary.caught+' Pokémon, '+r.summary.wins+' wins (saved '+(r.summary.saved||'unknown date').slice(0,10)+')\n\nThis cannot be undone.')` where `cur` mirrors the summary shape from current `S`. Cancel → toast `'Import cancelled — nothing changed.'`, return.
  3. Apply: `S = applyImportState(S, r.state)`; then the exact post-load ritual used elsewhere: `save(); hud();` re-render current tab via `render()`; `toast('Imported! '+r.summary.gems+' gems · '+r.summary.caught+' Pokémon · '+r.summary.wins+' wins')`. Also refresh `#saveinfo` and clear `#saveta` if currently showing the just-imported code.

- [ ] **Step 1: Structural probe test** — `import_ui_wiring`: `data-save="import"`, `data-save="filepick"`, `id="savefile"`, `function doImport(`, all five error-toast strings present verbatim, `'Import cancelled — nothing changed.'` present, and `confirm(` appears in `doImport`.
- [ ] **Step 2: Run to verify failure** — probe FAILs.
- [ ] **Step 3: Implement** per contract.
- [ ] **Step 4: Run to verify pass** — full suite PASS (`node tests/save-io.test.mjs`).
- [ ] **Step 5: End-to-end manual script for the human** (QA attaches this to the issue, review-only per the browser-less ruling): open `index.html` → Inventory → Copy code → clear localStorage via devtools → reload (fresh install) → paste code → Import from text above → confirm → collection/gems/wins restored; then Download file → repeat import-from-file; then paste garbage → error toast, progress intact.
- [ ] **Step 6: Commit** — `git add index.html tests/ && git commit -m "feat(save): import UI — preview, confirm, replace"`

---

## Notes for the CTO (scheduling & scoping)

- Tasks 1→2 are strictly sequential (same file region, shared interfaces). Tasks 3→4 sequential (same section). So: single wave of 1→2, then a wave of 3→4, or one engineer takes all four in order. **Do not parallelize 1∥2 or 3∥4** — same-file conflicts.
- A QA gate issue (run the node suite, verify Review Focus probes, attach the manual script) fits after Task 4.
- Out-of-scope observation (separate candidate issue, do NOT fold in): `S.skin` is never lazily defaulted at load (line 140 `S.skin[SEL]=…` can throw on very old saves) — same class of bug `applyImportState` deliberately does not paper over.
- The new `tests/` directory is the studio's first test surface in this repo — future features should extend it rather than re-invent a harness.
