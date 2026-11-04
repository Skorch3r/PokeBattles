# PokeBattles — progress log

Last updated: 2026-11-04

## Where things stand

- The game is one file, `index.html` — the single source of truth. The old identical mirror copy `pokedex-battler.html` was deleted in the code cleanup (see Code cleanup below); don't recreate it.
- Tests live in `tests/` and run with `node --test "tests/*.test.mjs"` (119 checks, all passing when last run). Browser checks were run separately in a headless browser and are not part of the repo.
- Design specs and implementation plans for each milestone live in the Paperclip studio folder (`PokeBattles-Paperclip-Studio/superpowers/`), not in this repo.
- On GitHub: https://github.com/Skorch3r/PokeBattles. After changing the game, save it with `git add .`, `git commit -m "..."` and `git push` in PowerShell.

## What was added

### Save export / import
- Inventory → **Save data**: copy a code (`PDB1-…`) or download `pokebattles-save-YYYY-MM-DD.json`; import from pasted text or a file.
- An import **replaces** progress (never merges) and always asks first, showing current vs imported gems, Pokémon and wins.
- Bad input (empty, cut-off code, wrong game, wrong version, damaged save) shows a message and changes nothing.
- The stat cache (`bst`) is left out of exports and refills itself.

### Missions tab
- 3 active missions at a time, 11 kinds (play/win matches, defeat opponents or wild Pokémon, score points, buy something in the Shop).
- Finish one and press **Claim** for 💎20; a new mission takes its place.
- **Reward path:** every 5 missions claimed = 1 level. Level rewards: 5 gems; every 5th level 10; level 25 pays 25; level 50 pays 50 gems and lets you pick one Pokémon to get the **3D skin** (only the biggest applicable reward, not stacked).
- **The path resets every 5 days** (back to level 0). Missions and their progress are kept, and an unpicked level-50 prize is kept. The screen shows the countdown and the last level reached.
- The Missions tab shows a count when something is ready to claim.

### Difficulty levels
- **Easy / Normal / Hard** selector at the top of the **Choose-a-map** screen. The pick is remembered, travels inside save codes (additive `diff` field — old saves and invalid values normalize to **Normal**), and defaults to Normal.
- Per-level knobs:

| | Easy | Normal | Hard |
|---|---|---|---|
| Enemy power | ×0.85 | ×1.0 | ×1.2 |
| AI skill 1 / skill 2 / Unite use | 1% / 0.75% / 2% | 2% / 1.5% / 5% | 5% / 4% / 12% |
| Enemy retreats below | 15% HP | 30% HP | 40% HP |
| Gems per match (win / loss; draw counts as loss) | 10 / 10 | 20 / 15 | 30 / 25 |
| Battle points (win / loss) | 80 / 40 | 100 / 50 | 140 / 90 |

- **Legendary rule:** "legendary" means rarity value 4 only — the ≥700-BST megas count as legendary, Epic (rarity 3) megas are unaffected. Legendaries are blocked as your lead outside Hard; on **Hard the enemy team fields one random legendary**. Your other allies and wild camps are unchanged on every level.
- Normal's gems were intentionally buffed from the old 15/10 to **20/15** when difficulty landed (Easy pays less, Hard pays more).

### Battle
- **Healing base:** standing in your own base heals 10% of max HP per second (same for the enemy in theirs). Computer-controlled Pokémon retreat there below 30% HP and stay until about 80%. (The retreat threshold now scales with difficulty — see Difficulty levels above.)
- **White speed circle** around each base (twice the base size): 30% faster for the team that owns it.
- **Unite meter** rises 5% every second, on top of charging from hits.
- **Gems per match:** now scale with difficulty (Normal: win 20, loss 15; draw counts as a loss) — see Difficulty levels above.
- **Potion:** every match you get one; press **I** to heal 25% of max HP; 15-second cooldown. Not used if you're at full health.
- **Cooldown pills** at the bottom of the match for K, L and I: green = ready, red = recharging.
- **Confetti:** winning a match shows about 7 seconds of falling confetti over the result screen. Losses and draws get none. It never blocks clicks, disappears when you press Back to menu, and is skipped if the device asks for reduced motion.
- **Team panels:** your team on the left, the opponents on the right, each with level and a health bar (works on the 10v10 Volcano map too).

### Items (Inventory → My items)
- **Points Booster:** doubles battle points for 105 battles. Each **win has a 25% chance to drop one**; it is not sold in the Shop. Using another while one is running adds 105 more battles. The top bar shows "×2 points (N)" while active.
- **Potion** is listed there too (always available, key I).

### Pokédex
- No shortcuts to the Shop any more; buying happens only in the Shop tab. Prices are still shown as information.

## Code cleanup (2026-11-04)

A zero-behavior-change cleanup pass; the test suite stayed green throughout.

- **Files removed:** `pokedex-battler.html` (stale full duplicate of the game — the "keep or delete" question was decided: delete; `index.html` alone is the source of truth) and `STUDIO-SMOKE.md` (leftover test file).
- **Dead battle code removed:** leftovers from the old turn-based battle — `mk()` (including its never-saved `heals:3` field), `cap`, `w`, `log()`, `bars()`, the unused `B` variable, the old battle CSS (`.arena`, `.mon`, `.foe`, `.me`, `.card`, the `max-width:560px` media rule) and the `#arena` box from the battle view. The `#log` intro text stays, and `.bar` CSS stays (missions progress bars use it).
- **`DIFF_IDS` reuse:** the `<script id="difficulty">` block moved to the top of the script order, and the three hardcoded `['easy','normal','hard']` lists (save validation, import normalization, load-path repair) now reuse `DIFF_IDS` — one list instead of four.
- **Unused parameters dropped:** `cdi` in `burst()`, `prevS` in `applyImportState()` (now single-argument), `d` in `pw()`.
- **`nm` unshadowed:** the global name formatter `nm` is no longer shadowed by locals — renamed to `mvName` in `skill()`, `fname` in `rosterDraw()` and `label` in the HUD key badges.
- **Merged duplicates:** `SKN` is now derived from `SKINS` (minus classic, plus shiny) instead of a hand-maintained copy; the two `.cell img` CSS rules became one; the two window key/blur listener sets merged into one keydown/keyup/blur (hold-keys tracking still works outside matches; match keys apply only while a match is active); a match end now writes to localStorage once instead of three times (`checkAch()` and `missionEvent()` take an optional `quiet` flag).

## Bug fixes (2026-11-04)

### Medium

Three medium fixes; the test suite stayed green throughout.

- **Pop-up messages no longer overwrite each other:** toasts now queue and play in order (~2.6 s each) instead of replacing the current one — at match end the "Mission complete" message and every earned achievement toast all show; several achievements at once no longer leave only the last one visible.
- **Leaving a match now asks first:** clicking one of the top tabs while a match is running shows a "Leave the match?" confirmation — Cancel keeps playing, OK discards the match. On the match-end screen the tabs still switch in one click, since there is nothing left to lose.
- **Legendaries no longer appear as opponents on Easy/Normal:** the opponent roll now drops Legendary-tier Pokémon (rarity 4, including the 700+ BST megas) from the matching pool, and a fresh save with a nearly empty stat cache rolls its fill-in opponents from a legendary-free list instead of the whole Pokédex — both leak paths closed. Hard mode still fields its random legendary boss; wild camps, your own roster, and rewards are unchanged.

### Low

Four low-priority fixes; the test suite stayed green throughout.

- **Reset announcement:** the 5-day reward-path reset used to happen silently. It now shows a toast the first time you play after a reset — "Reward path restarted — a new 5-day window begins.", plus the level you reached last window when that was above level 0.
- **Legendary note in the Shop:** legendary cards (rarity 4) now carry a "Hard mode only" note on Easy and Normal, matching the picker — they were already unbuyable there, just without saying why.
- **Shop search survives redraws:** the search box used to drop `"` characters (and mangled `&`) whenever the shop panel re-rendered; quotes and ampersands now survive tab switches and navigation.
- **Sharp match canvas on HiDPI:** the match canvas kept a fixed 900×520 backing store stretched by CSS, so it was blurry on retina/high-DPI screens. It now renders at the device pixel ratio and stays sharp; game coordinates are unchanged.

## Security & robustness (2026-11-04)

Three import-hardening fixes; the test suite stayed green throughout.

- **Import files are capped at 1 MB:** a huge save file used to be read straight into memory and could freeze the tab. Oversized files are now refused with a toast before anything is read (pasted codes were already size-bounded by the text box).
- **Every save field is validated on import:** names and types that aren't plain text (HTML/script markup, control characters, wrong shapes) now **reject the import** with the standard "damaged save" message instead of crashing panels — a saved type list like `"fire"` (text instead of a list) used to break the Pokédex panel outright, and text in the score field silently corrupted the points math. Numeric and map fields (base stats, battle points, ribbons, skin keys, mega entries, achievement flags, item counts, mission state) are **repaired in place** — numeric strings coerce, junk values drop or default — so a malformed save can no longer crash the game or quietly corrupt state. Only fields that are actually present are touched: valid saves import byte-for-byte identically, and names like "Farfetch'd" or "Type: Null" keep importing.
- **Save-supplied names and types are HTML-escaped everywhere they render** (Pokédex panel and cells, Shop, picker, prize select, inventory, sprite alt text). A crafted save whose Pokémon name contained `<img src=x onerror=…>` used to execute that markup every time the Pokédex or Shop opened; now nothing executes even if a future code path ever lets markup through the import door.
- **Import actually replaces progress again:** the code-cleanup refactor accidentally left a stale two-argument call to `applyImportState`, so accepted imports quietly re-applied the *current* state instead of the imported one — the QA gate caught it. Imports once again fully replace gems, Pokémon, missions, skins and settings exactly as the confirmation dialog promises.

## Numbers you may want to tune

| What | Value | Where in `index.html` |
|---|---|---|
| Mission reward / missions per level / max level / path reset | 20 gems / 5 / 50 / 5 days | `MIS_REWARD`, `MIS_PER_LEVEL`, `MIS_MAXLV`, `MIS_PERIOD` |
| Base healing | 10% max HP per second | `e.max*.1*dt` in `upd()` |
| Speed circle | 1.3× speed, radius 2× base | `ZONE_SPEED`, `inZone()` |
| Unite passive charge | 5 per second | `e.ch+5*dt` in `upd()` |
| Match gems | difficulty-scaled (Normal 20 win / 15 otherwise) | `matchGems(dfr,win)` in `endM()`, `DIFFS[*].gems` in `<script id="difficulty">` |
| Potion | 25% heal, 15 s cooldown | `POTION` |
| Confetti | up to 220 pieces, 7 s max | `confettiPieces()`, `confettiDone()` |
| Points Booster | 105 battles, 25% drop per win | `ITEMS.boost.battles`, `BOOST_DROP` |
| Enemy power per difficulty | ×0.85 / ×1.0 / ×1.2 | `DIFFS[*].power` in `<script id="difficulty">` |
| AI skill/Unite usage rates | easy 1%/0.75%/2% · normal 2%/1.5%/5% · hard 5%/4%/12% | `DIFFS[*].ai` in `<script id="difficulty">` |
| Enemy retreat threshold | 15% / 30% / 40% max HP | `DIFFS[*].retreat` in `<script id="difficulty">` |
| Gems & points per difficulty | gems 10/10, 20/15, 30/25 · points 80/40, 100/50, 140/90 | `DIFFS[*].gems`, `DIFFS[*].points` in `<script id="difficulty">` |
| Adding a difficulty level | add the id to `DIFF_IDS` and a `DIFFS` entry | `<script id="difficulty">` (single source after the cleanup) |

## Choices made on your behalf (easy to change)

- The list of missions was invented; you didn't specify any.
- Level 50 needs 250 missions inside one 5-day window (about 50 a day), because the path resets every 5 days.
- A 25% drop rate per win keeps a booster running almost all the time.
- The potion heals only you, not teammates.
- Confetti plays on wins only; say if you want a lighter version for losses.
- The team panels sit on top of the map edges and cover a little of it.

## Loose ends

- During this work the files in the folder were twice rolled back by something other than my edits. If changes ever disappear, check for another tool, sync or session working in the same folder.
