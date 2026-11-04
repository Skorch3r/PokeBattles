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

// B5 — pop-up messages overwrite each other (match end: mission toast replaced by achievement toasts):
// toast() must push onto a FIFO queue and drain one message at a time instead of overwriting
const oldOverwrite = "clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',2600)";
test('toast_messages_queue_fifo_instead_of_overwriting', () => {
  assert.ok(main.includes('const toastQ=[]'), 'FIFO queue declared');
  assert.ok(main.includes('function toast(t){toastQ.push(t)'), 'toast() pushes and only starts the pump when idle');
  assert.ok(main.includes('function nextToast('), 'queue pump present');
  assert.ok(/function nextToast\(\)\{const t=toastQ\.shift\(\);if\(t===undefined\)\{\$\('#toast'\)\.style\.display='none'/.test(main), 'nextToast drains and hides the element');
  assert.ok(!main.includes(oldOverwrite), 'old overwrite-and-restart line must be gone');
});

// B6 — clicking a top tab during a match throws the match away without asking:
// the nav handler must confirm while a match is actively running (M && !M.over)
test('nav_confirms_before_abandoning_active_match', () => {
  assert.ok(main.includes("if(M&&!M.over&&!confirm('Leave the match? Progress in this match will be lost.'))return"), 'guarded nav handler with the leave copy');
});

// B7 — legendaries leak into Easy/Normal matches (POK-28): the opponent roll must filter
// rarity-4 ids out of the pool unless Hard, and the new-player fallback must roll a
// legendary-free list (NLG) instead of the whole dex (1..TOTAL).
test('easy_normal_opponent_roll_excludes_legendary_tier', () => {
  assert.ok(main.includes('const NLG=Array.from({length:TOTAL},(_,k)=>k+1).filter(i=>!LEG.has(i))'), 'legendary-free NLG list defined next to LEG');
  assert.ok(main.includes('if(!legendaryAllowed(dfr))pool=pool.filter(i=>rar(i)!=4)'), 'pool guard drops rarity-4 ids on Easy/Normal');
  assert.ok(!main.includes('1+rnd(TOTAL)'), 'old whole-dex fallback (leaks ~90 LEG ids on fresh saves) must be gone');
  assert.ok(main.includes('NLG[rnd(NLG.length)]'), 'thin-pool fallback rolls from the legendary-free list');
});
