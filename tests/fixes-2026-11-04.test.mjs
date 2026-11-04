import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// structural probes for the 2026-11-04 low-priority fixes (DOM can't run headless in node)
const main = html.slice(html.lastIndexOf('<script>'));

// B1 — reward path resets silently every 5 days: the mis() wrapper must announce the reset
test('reset_toast_is_wired_into_the_mis_wrapper', () => {
  assert.ok(main.includes('if(misReset(S.mis,Date.now()))toast('), 'mis() wrapper must react to the reset boolean');
  assert.ok(main.includes('Reward path restarted'), 'reset announcement copy');
});

// B2 — shop sells legendaries on Easy/Normal with no warning: the card must say they need Hard mode
const shopRegion = main.slice(main.indexOf('function shopGrid('), main.indexOf('function mapPick('));
test('shop_cards_tag_legendaries_hard_mode_only', () => {
  assert.ok(shopRegion.includes('r==4&&!legendaryAllowed(diffOf(S))'), 'legendary note condition in the shopGrid card template');
  assert.ok(shopRegion.includes('Hard mode only'), 'same copy as the picker');
});
