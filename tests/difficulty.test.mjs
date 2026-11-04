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
test('fresh_and_load_default_to_normal', () => {
  const main = html.slice(html.lastIndexOf('<script>'));
  assert.ok(main.includes("diff:'normal'"), 'fresh() starts saves on normal');
  assert.ok(main.includes("S.diff!=='easy'&&S.diff!=='normal'&&S.diff!=='hard'"), 'load path repairs missing/invalid diff');
});
