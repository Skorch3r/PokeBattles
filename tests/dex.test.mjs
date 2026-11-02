import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = html.slice(html.lastIndexOf('<script>'));
const dex = main.slice(main.indexOf('function dex('), main.indexOf('function dex(') + 4000);
test('pokedex_has_no_way_to_buy_or_jump_to_the_shop', () => {
  assert.ok(!main.includes('goShop'), 'no helper that sends the player from the Pokédex to the Shop');
  assert.ok(!main.includes('id="gs"') && !main.includes('id="gk"'), 'no shop shortcut buttons');
  assert.ok(!/🛒|Find in the Shop|Skins in the Shop/.test(dex), 'no shop wording in the Pokédex view');
  assert.ok(!dex.includes("tab='shop'") && !dex.includes('data-bp') && !dex.includes('data-bs'), 'no purchase hooks in the Pokédex');
});
test('shop_still_sells', () => {
  assert.ok(main.includes('data-bp="${i}"') && main.includes('data-bs="${i}:${k}"'), 'Shop buy buttons are still there');
});
