import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = html.slice(html.lastIndexOf('<script>'));
const roster = main.slice(main.indexOf('function rosterDraw('), main.indexOf('function draw('));
test('side_panels_list_both_teams_with_levels', () => {
  assert.ok(roster.includes("[[0,8,'Your team','#3b82f6'],[1,900-8-W,'Opponents','#ef4444']]"), 'your team on the left, opponents on the right');
  assert.ok(roster.includes("M.f.filter(e=>e.team==tm)"), 'every fighter of that team (you and your teammates)');
  assert.ok(roster.includes("'Lv'+e.lv+' '"), 'level next to each name');
  assert.ok(roster.includes('e.hp/e.max'), 'health bar');
  assert.ok(roster.includes('e.dead?.4:1'), 'knocked-out fighters are dimmed');
  assert.ok(roster.includes("e.human?'#fbbf24'"), 'you are highlighted');
});
test('panels_are_drawn_every_frame_on_top_of_the_scene', () => {
  const draw = main.slice(main.indexOf('function draw('));
  assert.ok(draw.indexOf('c.restore();c.textAlign') < draw.indexOf('rosterDraw(c);'), 'after the world is drawn, in screen space');
  assert.ok(draw.indexOf('rosterDraw(c);') < draw.indexOf('if(me.dead)'));
});
