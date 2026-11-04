# Difficulty Levels — Design Spec

_Date: 2026-11-04 · Status: awaiting human approval_

## Intent & why

The game currently has exactly one difficulty ("Normal", unnamed). Players of very
different skill get the same enemy strength, AI competence, and rewards. We add a
three-way difficulty selector — **Easy / Normal / Hard** — that changes enemy power,
AI behavior, and match rewards. Hard is additionally defined by a signature rule:
**Legendary-rarity Pokémon are exclusive to Hard** — the player may only use them
there, and only there does the enemy team field one.

Normal is deliberately buffed relative to today's game (gems 15/10 → 20/15): the
human chose this as a progression-speed increase, accepted as-is.

## Goals

- One selector, three levels, remembered across sessions and exported in save codes.
- Easy is forgiving and grind-free (flat 10/10 gems win or lose).
- Hard is a real step up: stronger enemies, sharper AI, a guaranteed legendary on the
  enemy team — and the best rewards (30/25 gems, 140/90 points).
- Legendary rule gives Hard an identity and gives legendary ownership a purpose.

## Non-goals

- No per-difficulty changes to wild Pokémon, potion, Unite charge, maps, missions,
  achievements, or shop prices.
- No new achievements tied to difficulty.
- No matchmaking or dynamic difficulty — the level is a fixed player choice.

## Anti-goals (failure modes)

- A Hard mode that is just stat inflation with no behavioral change.
- Difficulty that resets or silently reverts between sessions or after import.
- Blocking content without telling the player why (greyed legendary must explain
  itself: "Hard mode only").
- Breaking existing saves or save codes (old saves must load as Normal).

## Constraints

- Single-file game: all changes land in `index.html`; `pokedex-battler.html` is kept
  an identical copy (repo convention).
- Follow the repo's pure-layer pattern (like `save-io`, `missions` scripts): difficulty
  logic goes in a pure, DOM-free `<script>` block so `node --test` can cover it; DOM
  wiring stays thin.
- Save format: `validateSaveState` must tolerate/validate the new `diff` field;
  missing field defaults to `'normal'` on load and import. Save version stays
  `SAVE_VERSION` — the field is additive and optional.
- Enemy legendaries need stats from PokeAPI (`info(id)` works for any dex id); match
  start already handles async fetch failures with a toast.

## Approaches considered

**A. Three dials + legendary exclusivity (chosen).** Difficulty scales enemy team
power, AI skill-use rates, AI retreat threshold, and rewards; legendary-rarity
Pokémon are usable only on Hard and appear only there (enemy team). Small surface,
testable, big feel difference.

**B. Wider dial set (rejected).** Also scale wild HP/attack, potion cooldown, and
Unite passive charge per difficulty. More tuning surface and more ways to feel
unfair; none of it addresses the "Hard feels like Normal with bigger numbers"
problem better than AI behavior + the legendary rule does.

## Decided design (human-approved numbers)

### Reward & combat table

| Knob | Easy | Normal | Hard |
|---|---|---|---|
| Enemy team power multiplier | ×0.85 | ×1.0 | ×1.2 |
| AI skill-1 / skill-2 / Unite use odds | 1% / 0.75% / 2% | 2% / 1.5% / 5% | 5% / 4% / 12% |
| AI retreat threshold (HP fraction) | 15% | 30% | 40% |
| Win / loss gems | 10 / 10 | 20 / 15 | 30 / 25 |
| Win / loss battle points | 80 / 40 | 100 / 50 | 140 / 90 |

Everything else (wilds, potion, maps, missions, achievements, booster drop) is
identical on all difficulties. A Hard win still counts as one win for achievements.

### Legendary exclusivity rule

- "Legendary rarity" = `rar(id) === 4` — nothing else. For Mega Pokémon this means
  **only those whose rarity value is itself 4** (the ≥700-BST megas that display the
  gold Legendary tag). Epic-rarity megas (rarity 3, bst < 700) are unaffected and
  playable on every difficulty. The rule always follows the rarity value shown in
  the dex — no separate mega special-case.
  *(Builder note: this scope was the assistant's call — keying off the visible
  rarity value keeps the dex and the picker consistent. Human confirmed at doc
  review.)*
- **Easy/Normal:** rarity-4 Pokémon cannot be chosen as the battle lead. In the
  fighter picker they render greyed with a "Hard mode only" tag; tapping shows a
  toast. If the saved lead is rarity-4 when starting an Easy/Normal match, the match
  does not start — the player is returned to the picker with that toast.
- **Hard:** the player may lead with any owned Pokémon, rarity 4 included.
- **Enemy legendary on Hard:** the enemy team always includes exactly one random
  legendary (from `LEG`, bypassing the BST-similarity pool filter; stats via
  `info()`), placed in a normal enemy slot with the ×1.2 Hard multiplier. The
  player's AI allies never receive one.
- **Wild camps** stay the 12 common species on all difficulties. *(Builder note:
  enemy-only appearance was the assistant's call; a legendary boss camp was floated
  and left out.)*

### UI

- `mapPick()` gains a difficulty row above the map list: three buttons
  `Easy · Normal · Hard`, current one highlighted (`.btn.sel`), persisted to `S.diff`
  on click. The row shows a one-line hint of what the level changes (e.g. Hard:
  "Enemies ×1.2, sharper AI, legendary on their team, best rewards").
- Fighter picker: rarity-4 cells get `opacity`-style greying + the tag on Easy/Normal.

### Save integration

- `fresh()` gains `diff:'normal'`.
- Load path: after parsing localStorage, if `S.diff` is missing or invalid, set
  `'normal'`.
- `validateSaveState`: accept `diff` only as one of `easy|normal|hard`; undefined is
  allowed (older codes) and normalized to `'normal'` by `applyImportState`.
- `summarize`/export payload carry `diff` automatically via the existing spread.

## Implementation sketch (builder's latitude within this)

1. **Pure layer** (`<script id="difficulty">`): `DIFFS` config object keyed
   `easy|normal|hard` with the table values; helpers `diffOf(S)`, `enemyPower(d)`,
   `aiRates(d)`, `retreatAt(d)`, `matchGems(d,win)`, `matchPoints(d,win)`,
   `legendaryAllowed(d)`. No DOM.
2. **`start()`**: multiply enemy `pw` by `enemyPower(diff)`; on Hard swap one enemy
   slot for a random `LEG` species (await `info()`); reject rarity-4 leads with toast
   when `!legendaryAllowed(diff)`.
3. **`ai()`**: use `aiRates(diff)` for the three `Math.random()` gates; retreat check
   uses `retreatAt(diff)` (and scale the "return at" threshold proportionally,
   e.g. retreat + 50 points of HP%).
4. **`endM()`**: gems/points from `matchGems`/`matchPoints`.
5. **`mapPick()`** difficulty row; **`choose()`** greying; **fresh/load/validate**
   save bits.
6. **Tests** (`tests/difficulty.test.mjs`, node --test): reward math per difficulty,
   defaulting/validation of `diff` in the pure save-io path, legendary gating
   (allowed on hard only), enemy power multiplier plumbing into `pw`-style math.

## What's left to the builder

- Exact selectors/markup for the difficulty row and greying.
- Which enemy slot yields to the legendary (suggestion: slot 0 of team 1).
- Proportional "return to fight at X%" value for the retreat change.
- Whether the difficulty row also appears on the "Start a match" idle screen
  (suggestion: no — mapPick is the single home).
