# Four Low-Bug Fixes — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-11-04-low-bugfixes-design.md`
**Base:** `b820bbb` · strictly sequential (every task edits `index.html`) · test command `node --test tests/*.test.mjs` (glob form).

## Task F1 — Reward-path reset toast (Systems)

Red: create `tests/fixes-2026-11-04.test.mjs` with test 1 (structural pins per spec §Test plan) → fails.
Green: in the main script replace
`const mis=()=>{S.mis=misNormalize(S.mis);misReset(S.mis,Date.now());return S.mis};`
with
`const mis=()=>{S.mis=misNormalize(S.mis);if(misReset(S.mis,Date.now()))toast('Reward path restarted — a new 5-day window begins.'+(S.mis.last?' You reached level '+S.mis.last+' last window.':''));return S.mis};`
Commit `fix: announce the 5-day reward-path reset (toast on first visit)` — suite green.

## Task F2 — Legendary note on shop cards (Systems)

Red: append test 2 → fails.
Green: in `shopGrid()`'s `data-bp` card template, after the rarity `<span>`, insert
`${r==4&&!legendaryAllowed(diffOf(S))?'<span class="stats">Hard mode only</span>':''}`
Commit `fix: tag legendaries 'Hard mode only' on Easy/Normal shop cards` — suite green.

## Task F3 — Search box preserves quotes (Systems)

Red: append test 3 → fails.
Green: replace `value="${SH.q.replace(/&/g,'')...` — exactly: `value="${SH.q.replace(/"/g,'')}"` → `value="${SH.q.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"` (escape `&` first).
Commit `fix: shop search survives quotes and ampersands across redraws` — suite green.

## Task F4 — HiDPI-sharp match canvas (Systems)

Red: append test 4 → fails.
Green:
1. `matchView()` template: remove `width="900" height="520"` from the `<canvas id="cv"...>` tag (keep the style attribute).
2. Right after the `$('#m').innerHTML=...` assignment in `matchView()`: `const cv=$('#cv'),dpr=window.devicePixelRatio||1;cv.width=900*dpr;cv.height=520*dpr;cv.getContext('2d').setTransform(dpr,0,0,dpr,0,0);`
3. `draw()` first line becomes: `function draw(){const c=$('#cv').getContext('2d'),dpr=window.devicePixelRatio||1;c.setTransform(dpr,0,0,dpr,0,0);const me=M.f[0],cx=...` (insertion only — no reordering of the pinned fragments).
All coordinates stay logical 900×520. Commit `fix: render the match canvas at devicePixelRatio (sharp on HiDPI)` — suite green.

## Task F5 — CHANGELOG (Content)

Add a "Bug fixes (2026-11-04)" section: reset announcement toast, legendary shop note, search-box quote preservation, HiDPI canvas. Commit `docs: changelog for the four low-priority fixes`.

## Task G7 — QA gate (QA)

1. Full suite, clean tree, glob form.
2. Extend `/tmp/gate.mjs` (stub-DOM harness from POK-18) with the 4 probes from spec §QA gate; all green.
3. Human e2e: switch difficulty to Easy → shop shows `Hard mode only` on legendary cards; search `pi"ka` → switch tabs and back → text intact; set system date 5+ days past `next` (or simulate) → toast on load; match canvas crisp on a HiDPI screen.
