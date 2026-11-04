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

// B3 — the shop search box drops quotes on redraw: the value attribute must escape, not strip
test('shop_search_escapes_quotes_and_ampersands', () => {
  assert.ok(main.includes("SH.q.replace(/&/g,'&amp;').replace(/\"/g,'&quot;')"), 'attribute-safe escape chain (& first)');
  assert.ok(!main.includes("SH.q.replace(/\"/g,'')"), 'old quote-stripping must be gone');
});

// B4 — the match canvas is blurry on HiDPI: backing store must follow devicePixelRatio
const matchRegion = main.slice(main.indexOf('function matchView('), main.indexOf('function loop('));
const drawRegion = main.slice(main.indexOf('function draw('), main.indexOf('function matchView('));
test('match_canvas_scales_by_devicePixelRatio', () => {
  assert.ok(matchRegion.includes('devicePixelRatio'), 'matchView reads devicePixelRatio');
  assert.ok(matchRegion.includes('cv.width=900*dpr'), 'backing store assignment');
  assert.ok(drawRegion.includes('c.setTransform(dpr,0,0,dpr,0,0)'), 'draw() reapplies the transform each frame');
  assert.ok(!html.includes('width="900"'), 'fixed-size canvas attributes removed from the template');
});
