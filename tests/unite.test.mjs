import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = html.slice(html.lastIndexOf('<script>'));
test('unite_meter_rises_5_percent_per_second_for_living_fighters', () => {
  assert.ok(main.includes('e.ch=Math.min(100,e.ch+5*dt);'));
  // runs in the per-fighter update, after the dead-fighter early return and before the stun early return
  const upd = main.slice(main.indexOf('function upd(dt)'));
  assert.ok(upd.indexOf('if(e.dead){') < upd.indexOf('e.ch=Math.min(100,e.ch+5*dt);'));
  assert.ok(upd.indexOf('e.ch=Math.min(100,e.ch+5*dt);') < upd.indexOf('if(e.stun>0)'));
});
test('charging_from_hits_is_still_there_and_unite_still_needs_a_full_meter', () => {
  assert.ok(main.includes('a.ch=Math.min(100,a.ch+n/6)'));
  assert.ok(main.includes('function unite(e){if(e.ch<100)return;e.ch=0;'));
});
