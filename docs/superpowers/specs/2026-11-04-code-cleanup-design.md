# Code Cleanup — Design Spec

**Status:** Approved by human 2026-11-04 (delete recommended for mirror file; all findings bash-verified against `6109b0c`).

## Goal

Remove dead turn-based-battle code and leftover files, make `DIFF_IDS` the single source of truth for difficulty ids, drop unused parameters, unshadow the `nm` identifier, and merge duplicated definitions — with zero behavior change and the test suite green throughout.

All changes are in the single-file game (`index.html`) plus test/CHANGELOG/docs updates. Line numbers below refer to `6109b0c` and will shift; edits are anchored by exact source text.

## Verified findings

| # | Finding | Evidence |
|---|---------|----------|
| F1 | `pokedex-battler.html` is a stale full duplicate | zero in-repo references outside CHANGELOG/git internals |
| F2 | `STUDIO-SMOKE.md` is a leftover test file (from `3e9e613`) | no references in code/tests/README |
| F3 | Dead code: `mk()` (l.294-295, sole home of `heals:3` — never saved/loaded), `cap`+`w` in the const chain (l.218; `cap` only called inside `mk`, `w` never called), `log()` (l.297, zero callers — `#log` div stays, static copy), `bars()` (l.299, zero callers), `B` variable (l.230 decl; `render()` l.310 `play(B||M?...)`), CSS `.arena` l.15, `.mon/.foe/.me/.card` l.16-19, `@media(max-width:560px)` l.32 (only `.mon img`/`.card` rules), `#arena` div in battleView template (l.333) | grep: zero call sites; render() references verified |
| F4 | `.bar` CSS is **live** — missions() uses it for reward-path progress bars (4 template uses). Only the `bars()` function dies. | `grep -c 'class="bar"'` = 4 |
| F5 | Difficulty literal `['easy','normal','hard']` written 3× outside the difficulty block: validateSaveState l.57, applyImportState l.83, load-repair l.226 (`if(S.diff!=='easy'&&...)`). `DIFF_IDS` defined at l.200 inside `<script id="difficulty">`, which sits AFTER save-io (l.37). | grep verified |
| F6 | Unused params: `cdi` in `burst(e,r,pow,cdi)` l.394 (sole call `burst(e,170,170)`), `prevS` in `applyImportState(prevS,imported)` l.80 (body uses only `imported`), `d` in `pw=(p,d)=>...` l.379 (sole call `pw(p,1)` l.381) | grep + call-site audit |
| F7 | `nm` shadowing: global `const nm=n=>...` l.231 (used by loadNames, nmM) shadowed by locals in `skill()` l.404 (destructured move name, used l.415), `rosterDraw()` l.452 (used l.453), and HUD key badges l.474 (destructured `[k,nm,cd]`) — **3 sites, not 2** | read verified |
| F8 | Duplicates: `SKINS` l.224 (4 wearable skins incl. classic) vs `SKN` l.337 (purchasable: animated/artwork/home/shiny — derivable: SKINS minus classic, plus shiny); `.cell img` rules at l.26 and l.30; two key/blur listener sets l.534-539 (hold-keys set + match set); `endM()` triggers 3 saves (1 explicit + 1 inside `missionEvent()` + 1 inside `checkAch()`) | read verified |

## Design decisions

- **Mirror file: delete** (human approved recommendation). No redirect — nothing links to it.
- **DIFF_IDS single source:** move `<script id="difficulty">` block to just before `<script id="save-io">`. All three off-block literal sites become `DIFF_IDS.includes(...)`. The difficulty block is dependency-free (pure data/functions), so hoisting is safe.
- **Save-io test harness:** `tests/save-io.test.mjs` evals the save-io block standalone with `new Function`; it must additionally extract the difficulty block and prepend its source so `DIFF_IDS` resolves.
- **applyImportState signature:** drop `prevS` → `applyImportState(imported)`. doImport call becomes `S=applyImportState(r.state)`. Test callers updated in same commit.
- **`nm` renames:** skill() local → `mvName`, rosterDraw() local → `fname`, HUD badges destructure → `label`. Global `nm` untouched.
- **Listener merge (one keydown / one keyup / one blur), preserving exact semantics:**
  - keydown: track `hkDown` for HK_KEYS **always** (easter egg works outside matches); set `M.keys[k]=1` only when `M && !M.over`; preventDefault only for NOKEY keys during an active, unfinished match.
  - keyup: delete `hkDown[k]` always; `M.keys[k]=0` when `M`.
  - blur: `hkClear()` + `if(M)M.keys={}`.
  - `visibilitychange` listener stays as-is (hold-keys only).
- **endM single save:** add optional `quiet` param to `checkAch(quiet)` and `missionEvent(ev,quiet)`; when truthy they skip their internal `save()`. `endM` passes `true` to both and keeps exactly one `save()` after all mutations. All other callers (shop buy, claims, scan, etc.) unchanged — they still save.
- **SKN derived:** `const SKN={...Object.fromEntries(SKINS.filter(([k])=>k!='classic').map(([k,l])=>[k,l])),shiny:'Shiny ✨'};` — preserves key order (animated, artwork, home, shiny) and SKINP alignment.
- **`.cell img`:** merge into one rule `.cell img{width:64px;height:64px;image-rendering:pixelated;object-fit:contain}`.
- **CHANGELOG:** rewrite the mirror-convention note (now moot), resolve the two open questions, add a Code Cleanup section.
- **No behavior change, no save-format change.** `heals` was never part of the save contract. Difficulty semantics untouched (structure only).

## Test impact (same-commit rule)

- `tests/save-io.test.mjs`: harness prepends difficulty block; `applyImportState` 1-arg calls; structural pins updated to DIFF_IDS forms.
- `tests/difficulty.test.mjs`: `pw(p,1)*(t?...)` pin → `pw(p)*(t?...)`; load-repair pin → `!DIFF_IDS.includes(S.diff)` form.
- `tests/hold-keys.test.mjs`: three listener pins → merged-listener forms.
- New `tests/cleanup.test.mjs`: asserts the dead code is gone (`function mk(`, `bars(`, `B||M`, `.arena{`, `heals:`, `prevS`, `cdi`, duplicate `.cell img` rule), the listener sets are merged (exactly one `keydown`/`keyup`/`blur` addEventListener on window), `endM` uses quiet calls (`missionEvent({...},true)`, `checkAch(true)`), and `.bar{` CSS is still present.

## Non-goals

- No gameplay/AI/difficulty rebalancing; no new features; no test rewrites beyond pins touched by the above; no README work beyond nothing (it doesn't reference the removed files).
