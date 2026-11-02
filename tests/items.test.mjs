import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="items">([\s\S]*?)<\/script>/);
assert.ok(m, 'items script block not found in index.html');
const { ITEMS, itemCount, boostLeft, boostDrop, BOOST_DROP, itemUse, boostBattle, POTION, potionUse, potionTick } = new Function(m[1] + '\nreturn {ITEMS,itemCount,boostLeft,boostDrop,BOOST_DROP,itemUse,boostBattle,POTION,potionUse,potionTick};')();
const main = html.slice(html.lastIndexOf('<script>'));

test('points_booster_definition', () => {
  assert.equal(ITEMS.boost.n, 'Points Booster'); assert.equal(ITEMS.boost.battles, 105);
  assert.ok(ITEMS.boost.d.includes('Doubles') && ITEMS.boost.d.includes('105 battles'));
  assert.ok(!('price' in ITEMS.boost), 'earned in battles, not sold');
});
test('a_win_has_a_25_percent_chance_to_drop_a_booster', () => {
  assert.equal(BOOST_DROP, .25);
  const S = { items: {} };
  assert.equal(boostDrop(S, () => 0.249), true); assert.equal(itemCount(S, 'boost'), 1);
  assert.equal(boostDrop(S, () => 0.25), false); assert.equal(boostDrop(S, () => 0.99), false); assert.equal(itemCount(S, 'boost'), 1);
  assert.equal(boostDrop(S, () => 0), true); assert.equal(itemCount(S, 'boost'), 2);   // drops stack
});
test('drop_rate_is_about_a_quarter_with_the_real_random_and_repairs_bad_items_fields', () => {
  let hits = 0; for (let k = 0; k < 20000; k++) if (boostDrop({}, undefined)) hits++;
  assert.ok(hits > 4600 && hits < 5400, 'got ' + hits + ' drops in 20000 wins');
  for (const bad of [undefined, null, [], 'x', 7]) { const S = { items: bad }; assert.equal(boostDrop(S, () => 0), true); assert.equal(itemCount(S, 'boost'), 1); }
});
test('use_needs_an_item_and_starts_105_battles', () => {
  const S = { items: {}, boost: 0 };
  assert.equal(itemUse(S, 'boost'), false); assert.equal(boostLeft(S), 0);
  S.items.boost = 2;
  assert.equal(itemUse(S, 'boost'), true); assert.equal(boostLeft(S), 105); assert.equal(itemCount(S, 'boost'), 1);
});
test('using_a_second_booster_adds_on_top', () => {
  const S = { items: { boost: 2 }, boost: 0 };
  itemUse(S, 'boost'); boostBattle(S, 100); boostBattle(S, 100);   // 103 left
  itemUse(S, 'boost');
  assert.equal(boostLeft(S), 103 + 105); assert.equal(itemCount(S, 'boost'), 0);
});
test('no_booster_means_normal_points_and_nothing_is_used_up', () => {
  const S = { boost: 0 };
  assert.deepEqual(boostBattle(S, 100), { bp: 100, boosted: false, left: 0 }); assert.equal(boostLeft(S), 0);
  assert.deepEqual(boostBattle({}, 50), { bp: 50, boosted: false, left: 0 });
});
test('booster_doubles_points_for_exactly_105_battles', () => {
  const S = { items: { boost: 1 } }; itemUse(S, 'boost');
  const got = []; for (let k = 0; k < 110; k++) got.push(boostBattle(S, k % 2 ? 50 : 100));   // wins pay 100, losses 50
  assert.equal(got.filter(g => g.boosted).length, 105);
  assert.ok(got.slice(0, 105).every((g, k) => g.boosted && g.bp === (k % 2 ? 100 : 200)));    // doubled
  assert.ok(got.slice(105).every((g, k) => !g.boosted && g.bp === ((k + 105) % 2 ? 50 : 100))); // back to normal
  assert.equal(got[0].left, 104); assert.equal(got[104].left, 0); assert.equal(boostLeft(S), 0);
});
test('bad_values_are_treated_as_zero', () => {
  for (const bad of [undefined, null, -3, NaN, 'x']) { assert.equal(boostLeft({ boost: bad }), 0); assert.equal(itemCount({ items: { boost: bad } }, 'boost'), 0); }
});
test('booster_is_wired_into_inventory_hud_and_match_end_and_not_sold', () => {
  for (const s of ['My items', 'data-use="${k}"', 'itemUse(S,k)', 'itemsSection()+', 'wireItems()', 'const bb=boostBattle(S,win?100:50),bp=bb.bp,', 'drop=win&&boostDrop(S);',
    'You found a Points Booster!', 'Points Booster ×2 —', '×2 points (${boostLeft(S)})', 'chance to drop one'])
    assert.ok(main.includes(s), 'missing: ' + s);
  assert.ok(main.indexOf('boostBattle(S,win?100:50)') < main.indexOf('award(me.p.id,bp)'), 'doubled before points are awarded');
  assert.ok(!main.includes("['item','Items']") && !main.includes('data-bi=') && !main.includes('itemBuy'), 'no Shop purchase of items');
});

// ---------- Potion ----------
test('potion_definition', () => { assert.equal(POTION.cd, 15); assert.equal(POTION.heal, .25); assert.ok(POTION.d.includes('Press I') && POTION.d.includes('15 seconds')); });
test('potion_heals_a_quarter_and_starts_the_15s_cooldown', () => {
  const f = { hp: 40, max: 100, pot: 0 };
  assert.equal(potionUse(f), 25); assert.equal(f.hp, 65); assert.equal(f.pot, 15);
});
test('potion_cannot_be_used_during_cooldown', () => {
  const f = { hp: 10, max: 100 }; potionUse(f); const hp = f.hp;
  assert.equal(potionUse(f), 0); assert.equal(f.hp, hp);
  potionTick(f, 14.9); assert.equal(potionUse(f), 0);
  potionTick(f, .2); assert.equal(f.pot, 0); assert.equal(potionUse(f), 25);
});
test('potion_never_overheals_and_is_not_wasted_at_full_health', () => {
  const f = { hp: 90, max: 100 }; assert.equal(potionUse(f), 10); assert.equal(f.hp, 100);
  const g = { hp: 100, max: 100 }; assert.equal(potionUse(g), 0); assert.equal(g.pot || 0, 0, 'cooldown not spent');
});
test('potion_ignores_dead_or_broken_fighters', () => {
  assert.equal(potionUse({ hp: 0, max: 100, dead: 5 }), 0); assert.equal(potionUse(null), 0); assert.equal(potionUse({ hp: 1, max: 0 }), 0);
  const f = { pot: 3 }; potionTick(f, 1); assert.equal(f.pot, 2); potionTick(f, 99); assert.equal(f.pot, 0); potionTick({}, 1);
});
test('potion_is_wired_into_the_match_and_inventory', () => {
  for (const s of ['potionTick(e,dt);', 'if(k.i)usePotion(e)', 'function usePotion(e){', "['I','Potion',me.pot||0]", 'Potion: I heals a quarter of your health', '${POTION.n}'])
    assert.ok(main.includes(s), 'missing: ' + s);
  assert.ok(!/ai\(e,dt\)[^]{0,3000}usePotion/.test(main.slice(main.indexOf('function ai('), main.indexOf('function upd('))), 'AI does not use the potion');
});
