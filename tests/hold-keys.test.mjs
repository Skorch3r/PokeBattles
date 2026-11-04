import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="hold-keys">([\s\S]*?)<\/script>/);
assert.ok(m, 'hold-keys script block not found in index.html');
const { HK_KEYS, HK_SECS, holdUpdate } = new Function(m[1] + '\nreturn {HK_KEYS,HK_SECS,holdUpdate};')();
const run = (st, held, secs, step = .1) => { let fired = 0; for (let t = 0; t < secs - 1e-9; t += step) if (holdUpdate(st, held, step)) fired++; return fired; };

test('three_keys_and_hold_is_two_seconds', () => {
  assert.equal(HK_KEYS.length, 3); assert.equal(HK_SECS, 2);
});
test('fires_once_after_two_seconds_not_before', () => {
  const st = { t: 0, fired: false };
  assert.equal(run(st, true, 1.9), 0);
  assert.equal(run(st, true, .3), 1);
  assert.equal(run(st, true, 5), 0, 'keeps holding: no repeat');
});
test('releasing_resets_the_timer', () => {
  const st = { t: 0, fired: false };
  assert.equal(run(st, true, 1.5), 0);
  holdUpdate(st, false, 0);
  assert.equal(run(st, true, 1.5), 0, 'starts over after a release');
  assert.equal(run(st, true, .6), 1);
});
test('can_fire_again_after_a_release', () => {
  const st = { t: 0, fired: false };
  assert.equal(run(st, true, 2.1), 1);
  holdUpdate(st, false, 0);
  assert.equal(run(st, true, 2.1), 1);
});

const main = html.slice(html.lastIndexOf('<script>'));
test('hold_wiring_is_global_and_stops_when_the_window_loses_focus', () => {
  assert.ok(main.includes("addEventListener('keydown',e=>{kn(e).forEach(k=>{if(HK_KEYS.includes(k))hkDown[k]=1});hkCheck()});"));
  assert.ok(main.includes("addEventListener('keyup',e=>{kn(e).forEach(k=>delete hkDown[k]);hkCheck()});"));
  assert.ok(main.includes("addEventListener('blur',hkClear)"));
  assert.ok(main.includes('visibilitychange'));
  assert.ok(main.includes('if(holdUpdate(hkSt,held,dt))confetti();'));
});
