# Difficulty Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Easy/Normal/Hard difficulty to PokeBattles — scaling enemy power, AI competence, and match rewards — with Legendary-rarity Pokémon (rarity value 4) exclusive to Hard.

**Architecture:** A new DOM-free `<script id="difficulty">` pure layer holds the config table and accessor helpers, following the repo's `save-io`/`missions` pattern. Thin wiring in the main script reads it at match start (`start()`), per AI tick (`ai()`), and at match end (`endM()`). The selector lives on the map-pick screen and persists as `S.diff` (additive, optional save field defaulting `'normal'`).

**Tech Stack:** Single-file vanilla JS/HTML game; zero-dependency `node --test` suites that extract pure `<script>` blocks from `index.html` and assert main-script wiring structurally.

**Spec:** `docs/superpowers/specs/2026-11-04-difficulty-levels-design.md` (approved)

## Global Constraints

- All game changes land in `index.html`; `pokedex-battler.html` is an identical copy, synced in Task 7 only.
- The `<script id="difficulty">` block is pure: no DOM, no references to main-script globals (`S` is always a parameter).
- Difficulty values verbatim: power ×0.85 / ×1.0 / ×1.2; AI rates easy `1% / 0.75% / 2%`, normal `2% / 1.5% / 5%`, hard `5% / 4% / 12%`; retreat 15% / 30% / 40% HP; gems 10/10, 20/15, 30/25; points 80/40, 100/50, 140/90 (win/loss; draw counts as loss).
- Legendary rule keys off `rar(id)===4` only. Blocked as lead on Easy/Normal; on Hard the enemy team fields exactly one random `LEG` species; allies never get one; wild camps unchanged.
- `SAVE_VERSION` stays `1`; `diff` is additive and optional — missing/invalid always normalizes to `'normal'`.
- Legendary exclusivity covers Mega Pokémon **only when their rarity value is itself 4** (≥700-BST megas); rarity-3 megas are unaffected.
- Tests run from repo root: `node --test tests/` (Node 18+). The existing 74 checks must keep passing; two pin old values and are updated in Tasks 3 and 4.
- Every task edits the same file — execute tasks strictly sequentially, never in parallel.

## Review Focus

- Old saves and old save codes with no `diff` field → load and import as Normal, nothing crashes. *(Pinned: Task 2, `diff_field_validation_and_import_default`.)*
- Corrupted/hand-edited `diff` values (e.g. `'zzz'`, `7`, `'toString'`) → treated as Normal, never trusted. *(Pinned: Task 1 `diffOf_defaults_to_normal_and_rejects_garbage`, Task 2.)*
- Player's lead is a legendary, then they switch to Easy/Normal → match refuses to start with a toast, returns to the picker. *(Pinned: Task 5 `legendary_leads_blocked_outside_hard`.)*
- Hard-mode legendary fetch fails (offline) → the legendary id flows through the same `Promise.all(info)`/catch path as every other pick, so the existing "Could not reach PokeAPI" toast handles it. *(Pinned: Task 5 `hard_fields_a_legendary_on_the_enemy_team`.)*
- Draw matches → paid the loss amount on every difficulty, same as today. *(Pinned: Task 3 `match_rewards_follow_difficulty`.)*

---

### Task 1: Pure difficulty layer

**Files:**
- Modify: `index.html` (insert `<script id="difficulty">` between the `missions` block's `</script>` and the main `<script>`)
- Test: `tests/difficulty.test.mjs` (create)

**Interfaces:**
- Consumes: nothing (self-contained pure layer).
- Produces: `DIFF_IDS` (`['easy','normal','hard']`), `DIFFS` (object keyed by id, each `{label, hint, power, ai:[k1,k2,unite], retreat, gems:[win,loss], points:[win,loss], leg}`), `diffOf(s)->'easy'|'normal'|'hard'`, `enemyPower(d)->number`, `aiRates(d)->[number,number,number]`, `retreatAt(d)->number`, `matchGems(d,win)->number`, `matchPoints(d,win)->number`, `legendaryAllowed(d)->boolean`. Later tasks call these by exactly these names.

- [ ] **Step 1: Write the failing test** — create `tests/difficulty.test.mjs`:

```js
import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="difficulty">([\s\S]*?)<\/script>/);
assert.ok(m, 'difficulty script block not found in index.html');
const L = new Function(m[1] + '\nreturn {DIFFS,DIFF_IDS,diffOf,enemyPower,aiRates,retreatAt,matchGems,matchPoints,legendaryAllowed};')();
const { DIFFS, DIFF_IDS, diffOf, enemyPower, aiRates, retreatAt, matchGems, matchPoints, legendaryAllowed } = L;

test('difficulty_table_matches_spec', () => {
  assert.deepEqual(DIFF_IDS, ['easy', 'normal', 'hard']);
  assert.equal(DIFFS.easy.power, .85); assert.equal(DIFFS.normal.power, 1); assert.equal(DIFFS.hard.power, 1.2);
  assert.deepEqual(DIFFS.easy.ai, [.01, .0075, .02]);
  assert.deepEqual(DIFFS.normal.ai, [.02, .015, .05]);
  assert.deepEqual(DIFFS.hard.ai, [.05, .04, .12]);
  assert.equal(DIFFS.easy.retreat, .15); assert.equal(DIFFS.normal.retreat, .3); assert.equal(DIFFS.hard.retreat, .4);
  for (const d of DIFF_IDS) {
    assert.ok(typeof DIFFS[d].label === 'string' && DIFFS[d].label, 'label set for ' + d);
    assert.ok(typeof DIFFS[d].hint === 'string' && DIFFS[d].hint, 'hint set for ' + d);
  }
});
test('rewards_table', () => {
  assert.deepEqual([matchGems('easy', true), matchGems('easy', false)], [10, 10]);
  assert.deepEqual([matchGems('normal', true), matchGems('normal', false)], [20, 15]);
  assert.deepEqual([matchGems('hard', true), matchGems('hard', false)], [30, 25]);
  assert.deepEqual([matchPoints('easy', true), matchPoints('easy', false)], [80, 40]);
  assert.deepEqual([matchPoints('normal', true), matchPoints('normal', false)], [100, 50]);
  assert.deepEqual([matchPoints('hard', true), matchPoints('hard', false)], [140, 90]);
});
test('legendary_allowed_on_hard_only', () => {
  assert.equal(legendaryAllowed('easy'), false);
  assert.equal(legendaryAllowed('normal'), false);
  assert.equal(legendaryAllowed('hard'), true);
});
test('diffOf_defaults_to_normal_and_rejects_garbage', () => {
  assert.equal(diffOf({ diff: 'easy' }), 'easy');
  assert.equal(diffOf({ diff: 'hard' }), 'hard');
  assert.equal(diffOf({}), 'normal');
  assert.equal(diffOf(undefined), 'normal');
  for (const bad of ['toString', 'EASY', 1, null]) assert.equal(diffOf({ diff: bad }), 'normal');
});
test('accessors_index_the_table', () => {
  assert.equal(enemyPower('hard'), 1.2);
  assert.deepEqual(aiRates('easy'), [.01, .0075, .02]);
  assert.equal(retreatAt('normal'), .3);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/difficulty.test.mjs`
Expected: FAIL — "difficulty script block not found in index.html"

- [ ] **Step 3: Implement the pure layer in `index.html`**

Insert between the `missions` block's closing `</script>` and the main `<script>`:

```html
<script id="difficulty">
// Difficulty levels — pure layer. No DOM, no globals from the main script.
const DIFF_IDS=['easy','normal','hard'];
const DIFFS={
 easy:{label:'Easy',power:.85,ai:[.01,.0075,.02],retreat:.15,gems:[10,10],points:[80,40],leg:false,
  hint:'Enemies ×0.85, lazier AI, gentle rewards. No legendary Pokémon.'},
 normal:{label:'Normal',power:1,ai:[.02,.015,.05],retreat:.3,gems:[20,15],points:[100,50],leg:false,
  hint:'The standard game.'},
 hard:{label:'Hard',power:1.2,ai:[.05,.04,.12],retreat:.4,gems:[30,25],points:[140,90],leg:true,
  hint:'Enemies ×1.2, sharper AI, a legendary on their team — and the best rewards.'}
};
const diffOf=s=>s&&DIFF_IDS.includes(s.diff)?s.diff:'normal';
const enemyPower=d=>DIFFS[d].power,aiRates=d=>DIFFS[d].ai,retreatAt=d=>DIFFS[d].retreat;
const matchGems=(d,win)=>DIFFS[d].gems[win?0:1],matchPoints=(d,win)=>DIFFS[d].points[win?0:1];
const legendaryAllowed=d=>DIFFS[d].leg;
</script>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/difficulty.test.mjs`
Expected: PASS (all 5 tests)

- [ ] **Step 5: Commit**

```bash
git add index.html tests/difficulty.test.mjs
git commit -m "feat: pure difficulty layer (easy/normal/hard config + accessors)"
```

---

### Task 2: Save integration (`diff` field)

**Files:**
- Modify: `index.html` — `validateSaveState` and `applyImportState` in the `save-io` block; `fresh()` and the localStorage load line in the main script
- Test: `tests/save-io.test.mjs` (append), `tests/difficulty.test.mjs` (append)

**Interfaces:**
- Consumes: nothing new (the `save-io` block keeps its own hardcoded allowed list — it must not depend on the `difficulty` block).
- Produces: saves carry `S.diff` ∈ `'easy'|'normal'|'hard'`; `validateSaveState` accepts `diff` only as one of those three or absent; `applyImportState` always returns a state whose `diff` is one of the three.

- [ ] **Step 1: Write the failing tests**

Append to `tests/save-io.test.mjs` (reuse its existing extraction variables; if `validateSaveState`/`applyImportState` are not yet in its `new Function` return object, add them):

```js
test('diff_field_validation_and_import_default', () => {
  const base = { caught: {}, ach: {}, gems: 0, wins: 0 };
  assert.notEqual(validateSaveState({ ...base, diff: 'easy' }), null);
  assert.notEqual(validateSaveState({ ...base, diff: 'hard' }), null);
  assert.equal(validateSaveState({ ...base, diff: 'zzz' }), null);
  assert.equal(validateSaveState({ ...base, diff: 7 }), null);
  assert.equal(applyImportState(base, {}).diff, 'normal', 'missing diff imports as normal');
  assert.equal(applyImportState(base, { diff: 'hard' }).diff, 'hard');
  assert.equal(applyImportState(base, { diff: 'zzz' }).diff, 'normal');
});
```

Append to `tests/difficulty.test.mjs`:

```js
test('fresh_and_load_default_to_normal', () => {
  const main = html.slice(html.lastIndexOf('<script>'));
  assert.ok(main.includes("diff:'normal'"), 'fresh() starts saves on normal');
  assert.ok(main.includes("S.diff!=='easy'&&S.diff!=='normal'&&S.diff!=='hard'"), 'load path repairs missing/invalid diff');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/save-io.test.mjs tests/difficulty.test.mjs`
Expected: FAIL — the two new tests (all Task 1 tests still pass)

- [ ] **Step 3: Implement**

1. In `validateSaveState`, after the `st.boost` check line, add:
   `if(st.diff!==undefined&&!['easy','normal','hard'].includes(st.diff))return null;`
2. In `applyImportState`, after the `s.pts=s.pts||0;` line, add:
   `s.diff=['easy','normal','hard'].includes(s.diff)?s.diff:'normal';`
3. In `fresh()`, add `diff:'normal'` to the object literal.
4. Immediately after the `let S;try{S=JSON.parse(...)...` load line, add the line:
   `if(S.diff!=='easy'&&S.diff!=='normal'&&S.diff!=='hard')S.diff='normal';`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/save-io.test.mjs tests/difficulty.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/save-io.test.mjs tests/difficulty.test.mjs
git commit -m "feat: persist difficulty in save state (optional diff field, defaults normal)"
```

---

### Task 3: Match rewards follow difficulty (`endM`)

**Files:**
- Modify: `index.html` — `endM()` (first line and the `boostBattle` call)
- Test: `tests/rewards.test.mjs` (update — it pins the old hardcoded gems)

**Interfaces:**
- Consumes: `diffOf(S)`, `matchGems(d,win)`, `matchPoints(d,win)` from Task 1.
- Produces: rewards paid by `endM()` follow the table; local name `dfr` holds `diffOf(S)` inside `endM`.

- [ ] **Step 1: Update the test** — replace the body of `tests/rewards.test.mjs`'s test with:

```js
test('match_rewards_follow_difficulty', () => {
  assert.ok(endM.includes('dfr=diffOf(S),g=matchGems(dfr,win);'), 'gems come from the difficulty layer');
  assert.ok(endM.includes('boostBattle(S,matchPoints(dfr,win))'), 'battle points come from the difficulty layer');
  assert.ok(endM.includes('S.gems+=g;'));
  assert.ok(endM.includes('You earned 💎 ${g}.'), 'the result screen shows the amount actually paid');
  assert.ok(!endM.includes('win?15:10'), 'old hardcoded gems are gone');
  assert.ok(!endM.includes('win?100:50'), 'old hardcoded points are gone');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/rewards.test.mjs`
Expected: FAIL — hardcoded values still present

- [ ] **Step 3: Implement in `endM()`**

1. First line: `g=win?15:10;` → `dfr=diffOf(S),g=matchGems(dfr,win);` (draws still fall into `win=false` → loss payout).
2. `boostBattle(S,win?100:50)` → `boostBattle(S,matchPoints(dfr,win))`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/rewards.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/rewards.test.mjs
git commit -m "feat: match gems and points scale by difficulty (10/10, 20/15, 30/25 gems)"
```

---

### Task 4: AI competence follows difficulty (`ai`)

**Files:**
- Modify: `index.html` — `ai()` (top-of-function consts, retreat condition, three skill gates)
- Test: `tests/base-heal.test.mjs` (update — its retreat assertion pins the old hardcoded threshold), `tests/difficulty.test.mjs` (append)

**Interfaces:**
- Consumes: `diffOf(S)`, `retreatAt(d)`, `aiRates(d)` from Task 1. `aiRates` order is `[k1, k2, unite]`; in `ai()` the skill-2 call (`skill(e,2,…)`) uses index `1`, skill-1 (`skill(e,1)`) uses index `0`, unite uses index `2`.
- Produces: AI retreat threshold and skill-use odds read from the difficulty layer; return-at threshold stays `retreat + .5` HP fraction.

- [ ] **Step 1: Write the failing tests**

In `tests/base-heal.test.mjs`, replace the assertion `assert.ok(main.includes('(e.hp<e.max*.3||(inb&&e.hp<e.max*.8))&&!e.carry'));` with:

```js
  assert.ok(main.includes('(e.hp<e.max*rt||(inb&&e.hp<e.max*(rt+.5)))&&!e.carry'), 'retreat threshold comes from the difficulty layer; return-at stays retreat+50 HP%');
```

Append to `tests/difficulty.test.mjs`:

```js
test('ai_uses_difficulty_rates_and_retreat', () => {
  const main = html.slice(html.lastIndexOf('<script>'));
  assert.ok(main.includes('const rt=retreatAt(diffOf(S)),ra=aiRates(diffOf(S))'), 'ai() reads the difficulty layer');
  assert.ok(main.includes('Math.random()<ra[1])skill(e,2,tg)'), 'skill-2 gate uses the difficulty rate');
  assert.ok(main.includes('Math.random()<ra[0])skill(e,1)'), 'skill-1 gate uses the difficulty rate');
  assert.ok(main.includes('Math.random()<ra[2])unite(e)'), 'unite gate uses the difficulty rate');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/base-heal.test.mjs tests/difficulty.test.mjs`
Expected: FAIL — hardcoded `.3`/`.8` and `.02`/`.015`/`.05` still present

- [ ] **Step 3: Implement in `ai()`**

1. Function top: `function ai(e,dt){const lv=` → `function ai(e,dt){const rt=retreatAt(diffOf(S)),ra=aiRates(diffOf(S)),lv=`
2. Retreat condition: `(e.hp<e.max*.3||(inb&&e.hp<e.max*.8))&&!e.carry` → `(e.hp<e.max*rt||(inb&&e.hp<e.max*(rt+.5)))&&!e.carry`
3. Skill gates: `if(Math.random()<.02)skill(e,2,tg);if(Math.random()<.015)skill(e,1);if(e.ch>=100&&en.length&&Math.random()<.05)unite(e)` → `if(Math.random()<ra[1])skill(e,2,tg);if(Math.random()<ra[0])skill(e,1);if(e.ch>=100&&en.length&&Math.random()<ra[2])unite(e)`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/base-heal.test.mjs tests/difficulty.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/base-heal.test.mjs tests/difficulty.test.mjs
git commit -m "feat: AI skill usage and retreat threshold scale by difficulty"
```

---

### Task 5: Team build & legendary gating (`start`, `choose`)

**Files:**
- Modify: `index.html` — `start()` (lead gate, pick list, `mkF` power argument), `choose()` (cell rendering + click handler), style block (`.cell.lock`)
- Test: `tests/difficulty.test.mjs` (append)

**Interfaces:**
- Consumes: `diffOf(S)`, `DIFFS[d].leg`, `legendaryAllowed(d)`, `enemyPower(d)` from Task 1; existing `LEG` set, `rar()`, `mkF()`, `pw()`, `choose()`, `toast()`.
- Produces: on Hard the enemy team's first slot (`ids[n-1]`, the pick that lands at `ps[n]` = team-1 slot 0) is a random `LEG` species; enemy fighters' `pw` is multiplied by `enemyPower(diffOf(S))`; legendary leads refused outside Hard.

- [ ] **Step 1: Write the failing tests** — append to `tests/difficulty.test.mjs`:

```js
test('hard_fields_a_legendary_on_the_enemy_team', () => {
  const main = html.slice(html.lastIndexOf('<script>'));
  assert.ok(main.includes('if(DIFFS[dfr].leg)ids[n-1]=[...LEG][rnd(LEG.size)]'), 'team-1 slot 0 becomes a random legendary on hard');
  assert.ok(main.includes('pw(p,1)*(t?enemyPower(dfr):1)'), 'enemy power multiplier applies to team 1 only');
});
test('legendary_leads_blocked_outside_hard', () => {
  const main = html.slice(html.lastIndexOf('<script>'));
  assert.ok(main.includes("rar(mid)==4){toast('Legendary Pokémon can only be used in Hard mode.'"), 'start() refuses a legendary lead on easy/normal');
  assert.ok(main.includes('Hard mode only'), 'picker tags locked legendaries');
  assert.ok(main.includes('.cell.lock{opacity:.45}'), 'locked cells are visually greyed');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/difficulty.test.mjs`
Expected: FAIL — the two new tests

- [ ] **Step 3: Implement**

1. In `start()`, immediately after `async function start(mid){`, insert:
   `if(!legendaryAllowed(diffOf(S))&&rar(mid)==4){toast('Legendary Pokémon can only be used in Hard mode.');return choose()}`
2. Replace the pick line
   `const pk=()=>pool.length>5?pool[rnd(pool.length)]:1+rnd(TOTAL),ps=[me,...await Promise.all(Array.from({length:2*n-1},pk).map(info))];`
   with
   `const pk=()=>pool.length>5?pool[rnd(pool.length)]:1+rnd(TOTAL),dfr=diffOf(S),ids=Array.from({length:2*n-1},pk);if(DIFFS[dfr].leg)ids[n-1]=[...LEG][rnd(LEG.size)];const ps=[me,...await Promise.all(ids.map(info))];`
   (the legendary flows through the same `Promise.all(info)`/`catch` as every pick, so an offline fetch hits the existing PokeAPI toast)
3. In the `M.f` build, change `mkF(p,t,x,y,i==0,i==0?1:pw(p,1))` → `mkF(p,t,x,y,i==0,i==0?1:pw(p,1)*(t?enemyPower(dfr):1))`
4. In `choose()`, before the `.map(...)`, add `const lk=!legendaryAllowed(diffOf(S));`; in the cell template add `${lk&&rar(i)==4?'lock':''}` to the class list and `${ld?'<div class="stats">Hard mode only</div>':''}` after the name div, where the map callback computes `const ld=lk&&rar(i)==4;`; change the click handler to
   `document.querySelectorAll('.cell').forEach(e=>e.onclick=()=>{const id=+e.dataset.i;if(lk&&rar(id)==4){toast('Legendary Pokémon can only be used in Hard mode.');return}start(id)})`
5. In the style block, extend `.cell.cur{outline:2px solid #fff}` → `.cell.cur{outline:2px solid #fff}.cell.lock{opacity:.45}`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/difficulty.test.mjs`
Expected: PASS (all tests, including Task 1/2/4 ones)

- [ ] **Step 5: Commit**

```bash
git add index.html tests/difficulty.test.mjs
git commit -m "feat: legendary exclusivity (hard-only leads, enemy legendary slot, enemy power scaling)"
```

---

### Task 6: Difficulty picker UI (`mapPick`)

**Files:**
- Modify: `index.html` — `mapPick()` (row HTML + wiring)
- Test: `tests/difficulty.test.mjs` (append)

**Interfaces:**
- Consumes: `DIFF_IDS`, `DIFFS`, `diffOf(S)` from Task 1.
- Produces: the selector row `#diffr` with one `data-d` button per difficulty; clicking persists `S.diff` and re-renders; the current level gets class `sel`; the row shows `DIFFS[diffOf(S)].hint`.

- [ ] **Step 1: Write the failing test** — append to `tests/difficulty.test.mjs`:

```js
test('map_pick_shows_persistent_difficulty_row', () => {
  const main = html.slice(html.lastIndexOf('<script>'));
  assert.ok(main.includes('data-d="${d}"'), 'one button per difficulty');
  assert.ok(main.includes("d==dfr?'sel':''"), 'current level is highlighted');
  assert.ok(main.includes('S.diff=b.dataset.d;save();mapPick()'), 'clicking a level persists it and re-renders');
  assert.ok(main.includes('DIFFS[dfr].hint'), 'the row explains what the level changes');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/difficulty.test.mjs`
Expected: FAIL — the new test

- [ ] **Step 3: Implement in `mapPick()`**

1. Function top: `function mapPick(){$('#m').innerHTML=` → `function mapPick(){const dfr=diffOf(S);$('#m').innerHTML=`
2. After the Back-button ctl div (`<button class="btn" id="bk">Back</button></div>`), insert:
   `+'<div class="ctl" id="diffr" style="margin-bottom:12px">'+DIFF_IDS.map(d=>`<button class="btn ${d==dfr?'sel':''}" data-d="${d}">${DIFFS[d].label}</button>`).join('')+'</div><div class="stats" style="margin-bottom:12px">'+DIFFS[dfr].hint+'</div>'`
3. Extend the wiring line: after the `document.querySelectorAll('[data-m]')...` statement, add:
   `document.querySelectorAll('#diffr [data-d]').forEach(b=>b.onclick=()=>{S.diff=b.dataset.d;save();mapPick()})`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/difficulty.test.mjs`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add index.html tests/difficulty.test.mjs
git commit -m "feat: difficulty selector on the map screen (persisted, with per-level hint)"
```

---

### Task 7: Sync mirror, changelog, full suite

**Files:**
- Modify: `pokedex-battler.html` (sync copy), `CHANGELOG.md`

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces: mirrored single-file game; documented feature; green full suite.

- [ ] **Step 1: Sync the mirror copy**

```bash
cd /sandbox/shared/PokeBattles && cp index.html pokedex-battler.html
```

- [ ] **Step 2: Update `CHANGELOG.md`** — under "What was added", add a "### Difficulty levels" section: the selector on the Choose-a-map screen (remembered, save-code compatible, defaults Normal), the full knob table (power ×0.85/×1.0/×1.2; AI rates; retreat 15/30/40%; gems 10/10, 20/15, 30/25; points 80/40, 100/50, 140/90), and the legendary rule (rarity value 4 only; blocked outside Hard; Hard enemy team fields one random legendary; Epic megas unaffected). In "Numbers you may want to tune", point the difficulty rows at `DIFFS` in the `<script id="difficulty">` block. Note that Normal's gems were intentionally buffed from the old 15/10 to 20/15.

- [ ] **Step 3: Run the full suite**

Run: `node --test tests/`
Expected: PASS — all suites including the pre-existing 74 checks (two updated by Tasks 3–4)

- [ ] **Step 4: Commit**

```bash
git add index.html pokedex-battler.html CHANGELOG.md
git commit -m "docs: difficulty levels changelog; sync pokedex-battler mirror"
```
