import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = html.slice(html.lastIndexOf('<script>'));
const endM = main.slice(main.indexOf('function endM('), main.indexOf('const kn=e=>'));
test('match_rewards_follow_difficulty', () => {
  assert.ok(endM.includes('dfr=diffOf(S),g=matchGems(dfr,win);'), 'gems come from the difficulty layer');
  assert.ok(endM.includes('boostBattle(S,matchPoints(dfr,win))'), 'battle points come from the difficulty layer');
  assert.ok(endM.includes('S.gems+=g;'));
  assert.ok(endM.includes('You earned 💎 ${g}.'), 'the result screen shows the amount actually paid');
  assert.ok(!endM.includes('win?15:10'), 'old hardcoded gems are gone');
  assert.ok(!endM.includes('win?100:50'), 'old hardcoded points are gone');
});
