# Code Cleanup — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-04-code-cleanup-design.md`
**Base:** `6109b0c` · single-file app (`index.html`) + tests + CHANGELOG · **strictly sequential** (every task edits `index.html`).
**Test command:** `node --test tests/*.test.mjs` (glob form; directory form breaks on Node 24).

## Task 1 — Dead code removal + file deletions (Systems)

Red: add `tests/cleanup.test.mjs` (assertions listed in spec §Test impact) → run, expect failures.
Green, then commit `chore: remove dead turn-based battle code and leftover files`:

1. Delete `pokedex-battler.html`, `STUDIO-SMOKE.md`.
2. `index.html` CSS: remove `.arena{...}` (l.15); `.mon{...}`, `.foe{...}.me{...}`, `.mon img{...}`, `.card{...}` (l.16-19); whole `@media(max-width:560px){.mon img{...}.card{...}}` line (l.32). **Keep `.bar`** (live — missions progress bars).
3. Const chain (l.218): drop `cap=...` and `w=ms=>new Promise(...)` → `const $=s=>document.querySelector(s),rnd=n=>Math.floor(Math.random()*n);`
4. `let` chain (l.230): drop `B=null` → `let NAMES={},cache={},tab='battle',onlyCaught=false;`
5. Delete `mk()` (l.294-295, includes its `heals:3`), `log()` (l.297), `bars()` (l.299).
6. `render()` (l.310): `play(B||M?'battle':'menu')` → `play(M?'battle':'menu')`.
7. battleView template: remove `<div class="arena" id="arena"></div>`. `#log` div STAYS.

## Task 2 — DIFF_IDS single source (Systems)

Commit `refactor: reuse DIFF_IDS as single source for difficulty ids`:

1. Move the whole `<script id="difficulty">…</script>` block to immediately before `<script id="save-io">`.
2. validateSaveState: `!['easy','normal','hard'].includes(st.diff)` → `!DIFF_IDS.includes(st.diff)`.
3. applyImportState: `s.diff=['easy','normal','hard'].includes(s.diff)?s.diff:'normal';` → `s.diff=DIFF_IDS.includes(s.diff)?s.diff:'normal';`
4. Load repair: `if(S.diff!=='easy'&&S.diff!=='normal'&&S.diff!=='hard')S.diff='normal';` → `if(!DIFF_IDS.includes(S.diff))S.diff='normal';`
5. `tests/save-io.test.mjs`: harness extracts the difficulty block too and prepends it inside `new Function(...)`; update structural pins (validate/apply/repair lines) to the DIFF_IDS forms.
6. `tests/difficulty.test.mjs`: update load-repair structural pin to the DIFF_IDS form.
Run full suite → green.

## Task 3 — Unused params + unshadow `nm` (Systems)

Commit `refactor: drop unused parameters and unshadow nm`:

1. `burst(e,r,pow,cdi)` → `burst(e,r,pow)` (sole caller passes 3 args).
2. `applyImportState(prevS,imported)` → `applyImportState(imported)`; doImport call `S=applyImportState(S,r.state)` → `S=applyImportState(r.state)`; `tests/save-io.test.mjs` callers → 1-arg.
3. `pw=(p,d)=>Math.max(.4,Math.min(1.5,me.bst/p.bst))*d` → `pw=p=>Math.max(.4,Math.min(1.5,me.bst/p.bst))`; call `pw(p,1)*(t?enemyPower(dfr):1)` → `pw(p)*(t?enemyPower(dfr):1)`; update `tests/difficulty.test.mjs` pin.
4. Unshadow `nm`: skill() `const[nm,kind,st,pow,cd]=` → `const[mvName,kind,st,pow,cd]=` + `s:nm` → `s:mvName`; rosterDraw() `nm=(e.p&&e.p.name)||'?'` → `fname=(e.p&&e.p.name)||'?'` + its uses; HUD badges `([k,nm,cd])` → `([k,label,cd])` + `k+' '+nm` → `k+' '+label`. Global `nm` untouched.
Run full suite → green.

## Task 4 — Merge duplicates (Systems)

Commit `refactor: merge duplicated definitions (SKN, .cell img, listeners, endM saves)`:

1. `const SKN={animated:'Animated',artwork:'Artwork',home:'3D',shiny:'Shiny ✨'};` → `const SKN={...Object.fromEntries(SKINS.filter(([k])=>k!='classic').map(([k,l])=>[k,l])),shiny:'Shiny ✨'};`
2. `.cell img`: merge l.26+ l.30 into `.cell img{width:64px;height:64px;image-rendering:pixelated;object-fit:contain}`.
3. Replace the two listener sets with one keydown/keyup/blur per spec §Design decisions (hold-keys tracking always-on; `M.keys` only when `M&&!M.over`; preventDefault only for NOKEY in active match; blur = `hkClear()` + `if(M)M.keys={}`; visibilitychange untouched). Update the three pins in `tests/hold-keys.test.mjs`.
4. `checkAch()` → `checkAch(quiet)` with `if(!quiet)save()` in place of `save()`; `missionEvent(ev)` → `missionEvent(ev,quiet)` with `if(!quiet)save();`; `endM`: pass `true` to its `missionEvent({...},true)` and `checkAch(true)` calls, keep its single explicit `save()` (net: 1 save per match end). All other callers unchanged.
Run full suite → green.

## Task 5 — CHANGELOG (Content/Docs)

Commit `docs: changelog for code cleanup`:
1. Rewrite the mirror-convention sentence (single source of truth; mirror file removed).
2. Resolve the two open questions (mirror file, STUDIO-SMOKE) as decided.
3. Add "Code cleanup" section listing: dead battle code removed (mk/cap/w/log/bars/B, old battle CSS, #arena box, heals field), DIFF_IDS reuse, param drops, nm unshadow, merged duplicates, files removed.

## Task 6 — QA gate (QA)

1. Full suite from clean tree: `node --test tests/*.test.mjs` — all green.
2. Functional probes (harness pattern from POK-10):
   - Battle boots + plays a Normal match; `M.keys` tracked only while match active; NOKEY preventDefault during active match.
   - Hold-keys easter egg: HK_KEYS tracked with `M===null`; fires after ~2 s hold.
   - Match end: exactly **one** localStorage save per endM; gems/wins/pts/missions/achievements all present in that write.
   - Import round-trip incl. old save without `diff` → imports as Normal; garbage diff rejected.
   - Difficulty picker works; `SKN` key order [animated, artwork, home, shiny]; shop skin buy still works.
   - Missions page renders progress bars (`.bar` present).
3. Human e2e pass (browser): battle controls, hold-keys, missions bars, match rewards persist after reload, import old save, difficulty selector.
