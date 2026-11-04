# Four Low-Bug Fixes — Design Spec

**Status:** Pending human approval. All four bugs verified in source at `b820bbb` (single-file `index.html`; line refs from HEAD, anchor edits by exact text).

## Verified findings

| # | Bug | Root cause (verified) |
|---|-----|----------------------|
| B1 | Reward path resets silently every 5 days | `misReset()` (missions block, pure layer) returns `true` on reset, but the only caller `mis()` (main script, l.474) discards the return value. Boot path `render()→hud()→mis()` means a toast in the wrapper fires on first visit. `misReset`'s boolean contract is pinned by `tests/missions.test.mjs` — must not change its return type. After a reset, `m.last` holds the previous path level (also pinned). |
| B2 | Shop sells legendaries on Easy/Normal with no warning | `shopGrid()`'s Pokémon card template (`data-bp`, shared by the Pokédex and Mega tabs) shows name/#/rarity/price only. `choose()` already tags locked legendaries `Hard mode only` (string pinned positive by difficulty.test). `legendaryAllowed(diffOf(S))` is available in the main script. |
| B3 | Shop search box drops quotes on redraw | `shop()` template: `value="${SH.q.replace(/"/g,'')}"` — quotes are stripped from the rendered attribute (and `&` is unescaped), so any redraw of the shop panel (tab switch, nav back) visibly mangles the saved query. `shopGrid()` (the oninput redraw path) doesn't touch `#sq`, which is why it only breaks on full `shop()` renders. |
| B4 | Match canvas blurry on HiDPI | `matchView()`: `<canvas id="cv" width="900" height="520" style="width:100%;max-width:900px...">` — fixed 900×520 backing store stretched by CSS; at devicePixelRatio 2 the browser upscales 900 device px to 1800. `draw()` uses logical 900×520 coordinates (camera `cx`/`cy` math, `clearRect(0,0,900,520)`); the roster/speed-zone tests slice `function draw(` and pin fragment *ordering*, so edits must preserve signature and fragment order. |

## Design decisions

- **B1 — toast in the `mis()` wrapper** (main script only, pure layer untouched):
  `const mis=()=>{S.mis=misNormalize(S.mis);if(misReset(S.mis,Date.now()))toast('Reward path restarted — a new 5-day window begins.'+(S.mis.last?' You reached level '+S.mis.last+' last window.':''));return S.mis};`
  Fires exactly once per reset (state mutates on the first call); `last` suffix omitted at level 0. Toast element already exists (`toast()`, l.284, defined above use). No `misReset` contract change.
- **B2 — conditional card note**, same copy as the picker: in the `data-bp` card template append
  `${r==4&&!legendaryAllowed(diffOf(S))?'<span class="stats">Hard mode only</span>':''}`
  Shows on Easy/Normal only (matches the bug report); hidden on Hard; applies to both Pokédex and Mega tabs (shared template). Skins tab unaffected (usage is already gated in `choose()`).
- **B3 — escape, don't strip**: `value="${SH.q.replace(/&/g,'&amp;').replace(/"/g,'&quot;')}"` — attribute-safe HTML escaping that preserves quotes and ampersands through redraws. `&` must be escaped first.
- **B4 — devicePixelRatio-aware canvas**: drop the `width`/`height` attributes from the template; in `matchView()` after the innerHTML assignment set
  `const cv=$('#cv'),dpr=window.devicePixelRatio||1;cv.width=900*dpr;cv.height=520*dpr;cv.getContext('2d').setTransform(dpr,0,0,dpr,0,0);`
  and in `draw()` immediately after grabbing the context: `c.setTransform(dpr,0,0,dpr,0,0)` (fresh grab each frame, so re-apply defensively). All existing drawing code keeps its logical 900×520 coordinates — the transform maps them to device pixels. Camera math, `clearRect`, roster panels, and the error banner are untouched in coordinate terms; fragment-order pins unaffected (insertions at the top of `draw()` only).
- **No save-format change, no difficulty semantics change.** All four fixes are display/UX-level.

## Test plan (red-first, per fix, same-commit pins)

New `tests/fixes-2026-11-04.test.mjs`, one test per bug, appended by its issue:
1. **B1**: structural — main script contains `if(misReset(S.mis,Date.now()))toast(` and the copy fragment `Reward path restarted`.
2. **B2**: structural — shop card template contains `r==4&&!legendaryAllowed(diffOf(S))` and `Hard mode only` inside the `shopGrid` region (slice between `function shopGrid(` and `function mapPick(`).
3. **B3**: structural — the `&amp;`/`&quot;` escape chain present; old `.replace(/"/g,'')` absent.
4. **B4**: structural — `matchView` contains `devicePixelRatio` and the backing-store assignment; `draw()` contains `setTransform(dpr,0,0,dpr,0,0)`; template no longer contains `width="900"`.

## QA gate

Extend the existing `/tmp/gate.mjs` stub harness (survives from POK-18) with 4 functional probes:
1. **Reset toast**: craft `S.mis` with `next` in the past, boot, assert `#toast` shows the restart message exactly once.
2. **Shop note**: Easy diff, unowned legendary visible in the Pokédex tab → card contains `Hard mode only`; on Hard → absent.
3. **Search quotes**: set `SH.q='pi"ka&'`, re-render `shop()`, assert `#sq.value === 'pi"ka&'`.
4. **HiDPI**: stub `devicePixelRatio=2`, start a match, assert `$('#cv').width===1800`, `height===1040`, and context transform scale === 2.
Plus full suite from a clean tree.

## Issue shape (proposed)

6 issues, strictly sequential (all edit `index.html`): F1 reset toast (Systems) → F2 shop note (Systems) → F3 search escape (Systems) → F4 HiDPI canvas (Systems) → F5 CHANGELOG entry (Content) → G7 QA gate (QA).
