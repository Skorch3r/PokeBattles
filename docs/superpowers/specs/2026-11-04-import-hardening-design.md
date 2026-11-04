# Import Hardening — size limit, deep validation/repair, XSS escape — Design Spec

**Status:** Pending human approval. Verified in source at `ea3b365` (single-file `index.html`). Severity: 1 Low + 1 Medium + **1 High (stored XSS via save codes)**.

## Verified findings (all reproduce in code)

1. **[Low] No file-size limit** — `fi.onchange` (l.505) reads any file straight into a string (`rd.readAsText(f)`); a 100 MB file freezes the tab. (Paste path is practically bounded by the textarea; out of scope.)
2. **[Medium] validateSaveState (l.51) checks outer shape only** — caught values are `isObj` but **no per-PRG field checks** (`n`/`t`/`b`/`sk`/`bp`/`rb`), `S.pts` is **not validated at all** (`endM` does `S.pts=(S.pts||0)+me.pts` → text concatenation), `skin`/`mgs`/`bst`/`ach`/`items`/`mis` internals unchecked. Repro: `t` as string → `c.t.join is not a function` in the dex panel (l.312).
3. **[High] Stored XSS via imported save** — owned names, caught types, and mega names are interpolated **raw** into `innerHTML` at l.312 (panel: `${c.n}`, `${c.t.join(' / ')}`), l.315 (cells: `${g.n}` / `NAMES[i]`), l.342 (shop owned: `${c.n}`), l.343 (shop: `${nmv}` from `NAMES[i]`), l.353 (picker: `${g.n}`), l.484 (prize select: `${S.caught[i].n}`), l.517 (inventory: `${c.n}`), plus **`img()` alt attribute** (l.222: `alt="${alt||''}"` — carries the raw name). `doImport` → l.511 copies imported mega names into `NAMES` (`NAMES[i]=m.n`). No `esc()` exists in the file (grep: 0). An `<img src=x onerror=…>` name runs on import + every dex/shop open.

## Design decisions

### Fix 1 — file-size limit (Low)
In `fi.onchange`, before `FileReader`: `if(f.size>1048576){fi.value='';toast('Import file is too large — the limit is 1 MB.');return}`.

### Fix 2 — deep validation + repair (Medium)
Extend `validateSaveState` (runs for both paste and file paths via `parseImportPayload`). Principle: **names/types that aren't plain text → reject the import; everything else → repair** (coerce or default), never crash. Exact rules:

- **New module consts** (after `X` at l.210 and after `SKINS`): `const TYPES=new Set(Object.keys(X));` and `const SKKEYS=new Set([...SKINS.map(([k])=>k),'shiny']);`
- **Per-PRG loop** over `Object.entries(o.caught)`:
  - `n`: reject unless `typeof=='string'`, 1..60 chars, no `<>`&"` backtick, no `\u0000-\u001f` (apostrophe/colon allowed — "Farfetch'd", "Type: Null" must keep importing; render-escaping covers the rest).
  - `t`: reject unless Array, length 1–2, every entry a string in `TYPES`.
  - `b`: repair — keep object; each of the 6 stat keys becomes a finite number, else 0.
  - `sk`: repair to array of valid `SKKEYS` entries; `rb`: repair to array of strings; `bp`: repair to finite number (else 0).
- **`S.pts`**: reject unless `isNum` (it feeds score math; text here was silent corruption).
- **`mgs`**: each entry — reject if `n` violates the name rule; repair `sl` to a slug-safe string, `t` to valid types, `b` to finite number; keys must be integer strings ≥ 1, others dropped.
- **`skin`**: repair — keep only entries whose key is numeric and value is in `SKKEYS`. **`bst`**: repair — keep only finite numeric values. **`ach`**: repair — values coerce to 0/1. **`items`**: repair — values to finite numbers.
- **`mis`**: repair via the existing self-healing normalizer: `o.mis=misNormalize(isObj(o.mis)?o.mis:undefined)` (l.117 already coerces `done/prize/next/last/act`).
- `gems/wins/diff/se/crit/lead/boost` keep their existing checks.

### Fix 3 — escape every name/type at render (High)
- New helper next to `img()` (l.222): `const esc=s=>String(s).replace(/[&<>"'`]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[m]));`
- `img()`: `alt="${esc(alt||'')}"` (covers panel/shop/inventory alt vectors in one place).
- Escape the 7 content sites: l.312 `${esc(c.n)}` + `${esc(c.t.join(' / '))}`; l.315 `${g?esc(g.n):esc(NAMES[i]||'???')}`; l.342/343/353/484/517 wrap the name in `esc(...)`. Battle HUD untouched (names there come from the live API, not the save).
- Defense in depth: even though Fix 2 now rejects non-plain-text names at the door, rendering stays safe if a future path (API drift, new feature) ever feeds HTML through a name.

**No save-format changes** — valid existing saves (incl. "Farfetch'd", "Type: Null", all 18 types, mega entries) import unchanged; only malformed/hostile payloads behave differently.

## Test plan (red-first, same-commit pins)

Extend `tests/fixes-2026-11-04.test.mjs` (8–10) and `tests/save-io.test.mjs` (functional, uses the real script blocks):
8. **size**: `f.size>1048576` present in `fi.onchange`.
9. **deep validation**: name plain-text reject regex + `TYPES` membership check + `!isNum(st.pts)` reject present; `misNormalize(isObj(o.mis)?o.mis:undefined)` present.
10. **escape**: `const esc=` definition; `alt="${esc(alt||'')}"`; each of the 7 content sites shows `esc(` around the name/type.
Functional (save-io): malicious name/type save → rejected; `bp:"5"`→5, `pts:"3"`→3, `rb` junk→[], broken `mis`→normalized, junk `skin` values dropped; valid save round-trip byte-identical.

## QA gate

Extend `scripts/qa-gate.mjs`:
1. **Size**: 2 MB file stub → rejected with toast, state unchanged.
2. **Reject**: `t:'fire'` (string) → import rejected; name `<img src=x onerror=…>` → rejected; mega name with markup → rejected.
3. **Repair**: bp/pts strings → numbers; junk `rb`/`sk`/`skin`/`ach`/`items`/`bst` repaired; broken `mis` → normalized fields.
4. **Escape**: `esc('<img>')` unit assert; rendered dex cell for a name containing an apostrophe renders `&#39;` and displays correctly; no `onerror` handler fires after import+render (window flag unset).
5. **Round-trip**: valid save still imports byte-identical (existing behavior preserved).
Human e2e: import the reproduced "t as text" save → clean rejection message; a "free gems" code with an HTML name → rejected, nothing executes; normal save round-trip still works.

## Issue shape (proposed)

Standing shape #1 — work directly on the planning issue, strictly sequential (all edits `index.html`): F1 size limit + deep validation/repair (Systems) → F2 escape layer (Systems) → F3 CHANGELOG (Content) → G10 QA gate (QA). Operator audits each commit; human e2e card at the end.
