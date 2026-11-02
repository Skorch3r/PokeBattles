import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = html.slice(html.lastIndexOf('<script>'));
test('white_circle_around_each_base_speeds_up_its_own_team', () => {
  assert.ok(main.includes("const ZONE_SPEED=1.3,inZone=e=>{const g=M.gl[e.team];return !!g&&Math.hypot(e.x-g[0],e.y-g[1])<M.gr*2};"), 'own team\'s circle, twice the base radius, +30%');
  assert.ok(main.includes('(inZone(e)?ZONE_SPEED:1)*dt'), 'applied to walking speed');
});
test('white_circle_is_drawn_under_the_coloured_base_and_explained', () => {
  const draw = main.slice(main.indexOf('function draw('));
  const ring = draw.indexOf("c.arc(g[0],g[1],M.gr*2,0,7);c.fillStyle='rgba(255,255,255,.07)'");
  assert.ok(ring > 0 && ring < draw.indexOf("[[M.gl[0],'#3b82f6'],[M.gl[1],'#ef4444']]"));
  assert.ok(draw.includes("c.strokeStyle='#fff'"));
  assert.ok(main.includes('the white circle around it makes you move 30% faster'));
});
