import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="confetti">([\s\S]*?)<\/script>/);
assert.ok(m, 'confetti script block not found in index.html');
const { CONFETTI_COLORS, confettiPieces, confettiStep, confettiDone } = new Function(m[1] + '\nreturn {CONFETTI_COLORS,confettiPieces,confettiStep,confettiDone};')();
const seeded = s => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;

test('pieces_start_above_the_screen_with_valid_fields', () => {
  const ps = confettiPieces(100, 800, 600, seeded(1));
  assert.equal(ps.length, 100);
  for (const p of ps) {
    assert.ok(p.x >= 0 && p.x <= 800); assert.ok(p.y < 0);
    assert.ok(CONFETTI_COLORS.includes(p.c)); assert.ok(p.vy > 0 && p.d >= 0);
    for (const k of ['w', 'h', 'rot', 'vr', 'sw', 'ph', 'vx']) assert.ok(Number.isFinite(p[k]), k);
  }
  assert.ok(new Set(ps.map(p => p.c)).size > 3, 'several colours');
});
test('pieces_fall_and_respect_start_delay', () => {
  const ps = confettiPieces(50, 800, 600, seeded(2));
  const y0 = ps.map(p => p.y);
  confettiStep(ps, .016, 0);                       // t=0: only pieces with no delay move
  ps.forEach((p, i) => { if (p.d > 0) assert.equal(p.y, y0[i]); });
  for (let t = 0; t < 3; t += .016) confettiStep(ps, .016, t + 5); // after all delays
  assert.ok(ps.every((p, i) => p.y > y0[i]));
  assert.ok(ps.every(p => p.vy <= 380), 'terminal velocity');
});
test('done_when_all_below_screen_or_time_is_up', () => {
  const ps = confettiPieces(10, 800, 600, seeded(3));
  assert.equal(confettiDone(ps, 1, 600), false);
  assert.equal(confettiDone(ps, 7.1, 600), true);
  ps.forEach(p => p.y = 700);
  assert.equal(confettiDone(ps, 1, 600), true);
});
test('whole_run_finishes_within_the_time_limit', () => {
  const ps = confettiPieces(220, 1200, 800, seeded(4)); let t = 0;
  while (!confettiDone(ps, t, 800)) { t += .016; confettiStep(ps, .016, t); assert.ok(t < 8); }
  assert.ok(t > 2, 'lasts long enough to enjoy');
});

// ---------- structural probes for the wiring ----------
const main = html.slice(html.lastIndexOf('<script>'));
const endM = main.slice(main.indexOf('function endM('), main.indexOf('\n', main.indexOf('function endM(')));
test('confetti_only_on_a_win', () => {
  assert.ok(endM.includes('if(win)confetti();'));
  assert.equal((main.match(/\bconfetti\(\)/g) || []).length, 3, 'declared once; called on a win and by the hold-keys trigger');
});
test('confetti_is_cleared_when_leaving_the_result_screen', () => {
  assert.ok(main.includes('function render(){confettiStop();hud();'));
});
test('confetti_is_decorative_and_respects_reduced_motion', () => {
  for (const s of ['pointer-events:none', "aria-hidden", 'prefers-reduced-motion: reduce'])
    assert.ok(main.includes(s), 'missing: ' + s);
  assert.match(html, /#toast\{z-index:60;/);
});
test('canvas_id_does_not_clash_with_the_script_block_id', () => {
  assert.ok(main.includes("el.id='confetti-canvas'"));
  assert.equal((html.match(/id="confetti"/g) || []).length, 1, 'only the script block uses id="confetti"');
});
