import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = html.slice(html.lastIndexOf('<script>'));
test('own_base_heals_in_the_match_update', () => {
  assert.ok(main.includes('const hb=M.gl[e.team];if(e.hp<e.max&&Math.hypot(e.x-hb[0],e.y-hb[1])<M.gr){const h=Math.min(e.max-e.hp,e.max*.1*dt);e.hp+=h;'), 'heals 10% of max HP per second inside the fighter\'s own base');
  // healing happens before the stun early-return so stunned Pokémon still heal, and only for living fighters (dead ones return earlier)
  assert.ok(main.indexOf('const hb=M.gl[e.team]') < main.indexOf('e.slow-=dt;e.sh-=dt;if(e.stun>0)'));
});
test('ai_retreats_to_base_and_stays_until_healed', () => {
  assert.ok(main.includes('(e.hp<e.max*.3||(inb&&e.hp<e.max*.8))&&!e.carry'));
});
test('base_is_drawn_as_a_heal_zone_and_explained', () => {
  assert.ok(main.includes("c.fillText('HEAL'"));
  assert.ok(main.includes('Your base (the blue circle) heals you while you stand in it'));
});
