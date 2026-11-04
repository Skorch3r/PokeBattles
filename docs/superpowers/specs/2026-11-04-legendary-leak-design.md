# Medium Bugfix — Legendaries leak into Easy/Normal matches — Design Spec

**Status:** Pending human approval. Verified in source at `ea3b365` (single-file `index.html`).

## Verified findings (user report matches code exactly)

1. **Cached pool leaks 700+ BST megas.** `start()` builds the opponent pool at l.368 via `near2 = Object.keys(S.bst).map(Number).filter(...)`. The dex scan skips `LEG.has(i)`, but `loadMegas()` (l.392) writes **megas** into `S.bst` (`S.bst[d.id]=bst`) and megas are not in `LEG`. `rar(id)` returns 4 for a mega when `S.mgs[id].b>=700` (l.257) → strong megas sit in the Easy/Normal opponent pool.
2. **Empty-cache fallback leaks legendaries.** l.369 `const pk=()=>pool.length>5?pool[rnd(pool.length)]:1+rnd(TOTAL)` — a new player has an empty `S.bst`, so `pool.length` is 0 and every opponent id rolls the full 1..1025 range including `LEG` members. User measured 7/152 legendary opponents across 8 Easy matches.
3. **Wilds unaffected** — l.371 uses the static `WID` list, not `pk()`. Only the 2n−1 opponent ids need fixing.

## Design decisions

- **New module const** (placed directly after the `const LEG=new Set(...)` line; `TOTAL` is defined earlier):
  ```js
  const NLG=Array.from({length:TOTAL},(_,k)=>k+1).filter(i=>!LEG.has(i));
  ```
- **l.369 rewrite** — pull `dfr` out in front (needed by the filter), guard the pool, and make the fallback roll from `NLG`:
  ```js
  const dfr=diffOf(S);if(!legendaryAllowed(dfr))pool=pool.filter(i=>rar(i)!=4);
  const pk=()=>pool.length>5?pool[rnd(pool.length)]:NLG[rnd(NLG.length)],ids=Array.from({length:2*n-1},pk);if(DIFFS[dfr].leg)ids[n-1]=[...LEG][rnd(LEG.size)];const ps=[me,...await Promise.all(ids.map(info))];
  ```
  - `pool` is already `let` (l.368) — the reassignment is legal; if the filter empties it, `pk` falls through to `NLG` (still legendary-free).
  - Cache path: base legendaries never reached the pool; the filter removes only `rar===4` megas. Rarity-3 megas (BST < 700) stay — the game's tiering treats them as epic, not legendary, and the picker hint says "No legendary Pokémon" (rarity 4).
  - Hard: `legendaryAllowed(dfr)` true → no filter, forced-LEG boss slot and mega pool both untouched. Enemy power scaling (`enemyPower`) unchanged.
- **No save-format, gameplay-balance, or difficulty-semantics changes.**

## Test plan (red-first, same-commit pins)

Extend `tests/fixes-2026-11-04.test.mjs`:
7. **B1**: structural — `const NLG=Array.from({length:TOTAL},(_,k)=>k+1).filter(i=>!LEG.has(i));` present; `if(!legendaryAllowed(dfr))pool=pool.filter(i=>rar(i)!=4)` present; the old fallback `1+rnd(TOTAL)` absent; `NLG[rnd(NLG.length)]` present.

## QA gate

Extend `scripts/qa-gate.mjs` (now committed at repo root):
1. **Easy/Normal leak-free opponents**: prime `cache` + `S.bst` (incl. a 700-BST mega), run `start()` many times with randomized picks on Easy → every opponent id satisfies `rar(id)!=4` and is not a `LEG` member; repeat on Normal.
2. **New-player path**: empty `S.bst`/`S.mgs` → opponents all drawn from `NLG`, no `LEG` member among 2n−1 ids across repeated runs.
3. **Hard unchanged**: opponents may include rarity-4 (forced boss + megas in pool survive the run).
4. **Wilds untouched**: wild ids still from `WID`.

## Issue shape (proposed)

Same shape as the previous two rounds (#1, per standing preference): work directly on the planning issue — F1 fix (Systems, one commit) → F2 CHANGELOG (Content) → G9 QA gate (QA, extend `scripts/qa-gate.mjs`). Operator audits each commit; human e2e card at the end.
