import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = html.slice(html.lastIndexOf('<script>'));
const endM = main.slice(main.indexOf('function endM('), main.indexOf('const kn=e=>'));
test('match_gems_win_15_otherwise_10', () => {
  assert.ok(endM.includes('g=win?15:10;'), 'win pays 15, loss (and draw) pays 10');
  assert.ok(endM.includes('S.gems+=g;'));
  assert.ok(endM.includes('You earned 💎 ${g}.'), 'the result screen shows the amount actually paid');
});
