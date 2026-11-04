import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

// E1 (POK-13): the stale turn-based battle layer is gone for good. These are
// absence pins — if the dead code ever comes back, they fail.
test('dead_turn_based_helpers_are_gone', () => {
  assert.ok(!html.includes('function mk('), 'mk() removed (stale battle builder, sole home of heals:3)');
  assert.ok(!html.includes('const log=t=>'), 'log() removed (#log div stays as the static intro copy)');
  assert.ok(!html.includes('bars('), 'bars() removed (only the .bar CSS stays — missions progress bars)');
  assert.ok(!html.includes('heals:'), 'heals: was never saved/loaded — not part of the save contract');
  assert.ok(!html.includes('cap='), 'cap= helper removed (its only caller was mk())');
  assert.ok(!html.includes('w=ms=>new Promise'), 'w=ms=>new Promise removed (never called)');
  assert.ok(!html.includes('B=null'), 'B (stale battle state) dropped from the let chain');
  assert.ok(!html.includes('B||M'), 'render() no longer branches on B — play(M?\'battle\':\'menu\')');
});

test('dead_battle_css_and_arena_box_are_gone_but_live_pieces_stay', () => {
  assert.ok(!html.includes('.arena{'), '.arena CSS removed');
  assert.ok(!html.includes('<div class="arena"'), '#arena div removed from the battleView template');
  assert.ok(!html.includes('.mon{') && !html.includes('.foe{') && !html.includes('.me{') && !html.includes('.card{'), 'turn-based fighter/card CSS removed');
  assert.ok(!html.includes('@media(max-width:560px)'), 'mobile battle-card media query removed');
  assert.ok(html.includes('.bar{'), '.bar CSS stays — missions/boost/ribbon progress bars are live');
  assert.ok(html.includes('id="log"'), '#log div stays in battleView');
});

test('leftover_files_are_gone', () => {
  assert.ok(!existsSync(new URL('../pokedex-battler.html', import.meta.url)), 'stale mirror pokedex-battler.html deleted');
  assert.ok(!existsSync(new URL('../STUDIO-SMOKE.md', import.meta.url)), 'leftover STUDIO-SMOKE.md deleted');
});

// E3 (POK-15) drops the unused parameters and unshadows the nm identifier.
// Absence pins — if an unused param or one of the three nm shadows returns, they fail.
test('unused_params_are_gone_and_nm_is_unshadowed', () => {
  assert.ok(!html.includes('cdi'), 'burst() drops the unused cdi param (sole call passes 3 args)');
  assert.ok(!html.includes('prevS'), 'applyImportState() drops the unused prevS param');
  assert.ok(!html.includes('pw(p,1)') && !html.includes('(p,d)=>'), 'pw is 1-arg; sole call site is pw(p)');
  assert.ok(!html.includes('const[nm,'), 'skill() destructures the move name as mvName, not a nm shadow');
  assert.ok(!html.includes(',nm=(e.p&&e.p.name)'), 'rosterDraw() names the fighter fname, not a nm shadow');
  assert.ok(!html.includes('[k,nm,cd]'), 'HUD badges destructure label, not a nm shadow');
  assert.ok(html.includes('const nm=n=>'), 'the global nm name-formatter is untouched');
});

// E4 (POK-16) merges the two window listener sets and adds the quiet save path.
test('exactly_one_window_keydown_keyup_blur_listener_each', () => {
  for (const ev of ['keydown', 'keyup', 'blur'])
    assert.equal((html.match(new RegExp(`addEventListener\\('${ev}'`, 'g')) || []).length, 1, `exactly one window ${ev} listener after the merge`);
});

test('endM_quiet_calls_skip_internal_saves', () => {
  assert.ok(/missionEvent\(\{[^}]*\},true\)/.test(html), 'endM passes quiet=true to missionEvent');
  assert.ok(html.includes('checkAch(true)'), 'endM passes quiet=true to checkAch');
});
