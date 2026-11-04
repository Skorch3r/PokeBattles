import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="save-io">([\s\S]*?)<\/script>/);
const d = html.match(/<script id="difficulty">([\s\S]*?)<\/script>/);
assert.ok(m, 'save-io script block not found in index.html');
assert.ok(d, 'difficulty script block not found in index.html');
// save-io reads DIFF_IDS, so the difficulty block source is prepended inside new Function.
// Deep validation (POK-29) also derives TYPES/SKKEYS from the main block's X/SKINS consts and
// repairs `mis` through misNormalize, so the missions block and those const lines are pulled in too.
const ms = html.match(/<script id="missions">([\s\S]*?)<\/script>/);
const mainSrc = html.slice(html.lastIndexOf('<script>'));
assert.ok(ms, 'missions script block not found in index.html');
const mainLine = (re, what) => { const mm = mainSrc.match(re); assert.ok(mm, 'main block missing ' + what); return mm[0]; };
const io = new Function(d[1] + '\n' + m[1] + '\n' + ms[1] + '\n'
  + mainLine(/^const X=\{.*\};$/m, 'type chart X') + '\n'
  + mainLine(/^const SKINS=\[\[.*\];$/m, 'SKINS list') + '\n'
  + mainLine(/^const TYPES=new Set\(Object\.keys\(X\)\);$/m, 'TYPES set') + '\n'
  + mainLine(/^const SKKEYS=new Set\(\[\.\.\.SKINS\.map\(\(\[k\]\)=>k\),'shiny'\]\);$/m, 'SKKEYS set') + '\n'
  + '\nreturn {SAVE_GAME,SAVE_VERSION,SAVE_CODE_PREFIX,buildExportPayload,b64urlEncode,b64urlDecode,parseImportPayload,validateSaveState,applyImportState,misNormalize,TYPES,SKKEYS};')();
const { buildExportPayload, parseImportPayload, validateSaveState, applyImportState, b64urlEncode, b64urlDecode, misNormalize } = io;

const S0 = { caught:{25:{n:'pikachu',t:['electric'],b:320,sk:[]}}, wins:6, gems:240, bst:{25:320}, lead:25, se:3, crit:1, ach:{a:1}, mgs:{}, mute:false };
const decodeCode = code => JSON.parse(decodeURIComponent(escape(atob(code.slice(5).replace(/-/g,'+').replace(/_/g,'/')))));
const wrap = env => io.SAVE_CODE_PREFIX + b64urlEncode(JSON.stringify(env));
const goodEnv = (state = { caught:{}, ach:{}, gems:1, wins:0 }) => ({ game:'pokebattles', v:1, saved:'2026-11-02T00:00:00.000Z', state });

// ---------- Task 1: payload builder ----------
test('build_export_shape', () => {
  const before = JSON.stringify(S0);
  const p = buildExportPayload(S0);
  assert.ok(p.code.startsWith('PDB1-'));
  const env = decodeCode(p.code);
  assert.equal(env.game, io.SAVE_GAME); assert.equal(env.v, io.SAVE_VERSION);
  assert.ok(!Number.isNaN(Date.parse(env.saved)));
  const { bst, ...rest } = S0;
  assert.deepEqual(env.state, rest);
  assert.ok(!('bst' in env.state));
  assert.equal(JSON.stringify(S0), before); assert.ok('bst' in S0);
});
test('build_export_summary', () => {
  const p = buildExportPayload(S0);
  assert.deepEqual(p.summary, { gems:240, caught:1, wins:6, saved:decodeCode(p.code).saved });
});
test('build_export_file', () => {
  const p = buildExportPayload(S0);
  const env = JSON.parse(p.fileJson);
  assert.equal(env.game, 'pokebattles');
  assert.match(p.fileBase, /^pokebattles-save-\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.fileBase.slice('pokebattles-save-'.length), env.saved.slice(0, 10));
  assert.deepEqual(env, decodeCode(p.code).saved === env.saved ? decodeCode(p.code) : env);
});
test('build_export_code_is_one_line', () => {
  const { code } = buildExportPayload(S0);
  assert.ok(!code.includes('\n') && !code.includes('+') && !code.includes('/') && !code.endsWith('='));
});
test('build_export_unicode_name_survives', () => {
  const S = { ...S0, caught:{ 669:{ n:'Flabébé', t:['fairy'], b:303, sk:[] } } };
  assert.equal(decodeCode(buildExportPayload(S).code).state.caught[669].n, 'Flabébé');
  assert.equal(b64urlDecode(b64urlEncode('Flabébé ★ 日本')), 'Flabébé ★ 日本');
});

// ---------- Task 2: parser / validator / apply ----------
test('roundtrip_fresh_state', () => {
  const fresh = { caught:{}, wins:0, gems:0, bst:{}, lead:0, se:0, crit:0, ach:{} };
  const r = parseImportPayload(buildExportPayload(fresh).code);
  assert.equal(r.ok, true);
  assert.deepEqual({ gems:r.summary.gems, caught:r.summary.caught, wins:r.summary.wins }, { gems:0, caught:0, wins:0 });
});
test('roundtrip_full_state', () => {
  const r = parseImportPayload(buildExportPayload(S0).code);
  assert.equal(r.ok, true);
  const { bst, ...rest } = S0;
  assert.deepEqual(r.state, rest);
  assert.deepEqual({ gems:r.summary.gems, caught:r.summary.caught, wins:r.summary.wins }, { gems:240, caught:1, wins:6 });
});
test('parse_accepts_file_json', () => {
  const p = buildExportPayload(S0);
  const r = parseImportPayload(p.fileJson);
  assert.equal(r.ok, true); assert.equal(r.summary.gems, 240);
});
test('parse_import_either_surface_either_form', () => {
  const p = buildExportPayload(S0);
  assert.equal(parseImportPayload('\n  ' + p.code + '  \n').ok, true);
  assert.equal(parseImportPayload(p.fileJson).ok, true);
  // code that was hard-wrapped by an email client / chat app
  const wrapped = p.code.replace(/(.{40})/g, '$1\n');
  assert.equal(parseImportPayload(wrapped).ok, true);
});
test('parse_empty_fails', () => {
  assert.deepEqual(parseImportPayload(''), { ok:false, error:'empty' });
  assert.deepEqual(parseImportPayload('   '), { ok:false, error:'empty' });
  assert.deepEqual(parseImportPayload(null), { ok:false, error:'empty' });
});
test('parse_garbage_fails', () => {
  assert.equal(parseImportPayload('hello world').error, 'format');
  assert.equal(parseImportPayload('{"a":1}').error, 'format');
  assert.equal(parseImportPayload('[1,2,3]').error, 'format');
  assert.equal(parseImportPayload('null').error, 'format');
});
test('parse_truncated_code_fails', () => {
  const { code } = buildExportPayload(S0);
  assert.deepEqual(parseImportPayload(code.slice(0, -10)), { ok:false, error:'cutoff' });
  assert.equal(parseImportPayload('PDB1-').error, 'cutoff');
  assert.equal(parseImportPayload('PDB1-!!!notbase64!!!').error, 'cutoff');
});
test('parse_wrong_game_fails', () => {
  const env = goodEnv(); env.game = 'other';
  assert.equal(parseImportPayload(wrap(env)).error, 'format');
  assert.equal(parseImportPayload(JSON.stringify(env)).error, 'format');
});
test('parse_wrong_version_fails', () => {
  const env = goodEnv(); env.v = 2;
  assert.equal(parseImportPayload(wrap(env)).error, 'version');
  assert.equal(parseImportPayload(JSON.stringify(env)).error, 'version');
});
test('parse_shape_rejects', () => {
  const bad = [
    { caught:[], ach:{}, gems:1, wins:0 },
    { caught:{}, ach:{}, gems:-5, wins:0 },
    { caught:{}, ach:{}, gems:'many', wins:0 },
    { caught:{}, ach:{}, gems:1, wins:'six' },
    { caught:{}, ach:{}, gems:Infinity, wins:0 },
    { caught:{ 1:null }, ach:{}, gems:1, wins:0 },
    { caught:{}, ach:{}, gems:1, wins:0, mgs:[] },
    { caught:{}, ach:{}, gems:1, wins:0, mis:[] },
    { caught:{}, ach:{}, gems:1, wins:0, items:[] },
    { caught:{}, ach:{}, gems:1, wins:0, boost:-1 },
    { caught:{}, ach:{}, gems:1, wins:0, boost:'lots' },
    { caught:{}, ach:{}, gems:1, wins:0, se:-1 },
    { caught:{}, gems:1, wins:0 },
    'a string', null, 42, [],
  ];
  for (const st of bad) assert.equal(parseImportPayload(JSON.stringify(goodEnv(st))).error, 'shape', JSON.stringify(st));
});
test('validate_preserves_unknown_keys', () => {
  const v = validateSaveState({ caught:{}, ach:{}, gems:1, wins:0, futureThing:'x' });
  assert.equal(v.futureThing, 'x');
  assert.equal(v.se, 0); assert.equal(v.crit, 0); assert.equal(v.lead, 0);
  const input = { caught:{}, ach:{}, gems:1, wins:0 };
  const out = validateSaveState(input);
  assert.notEqual(out, input); assert.ok(!('se' in input));
});
test('validate_survives_proto_key', () => {
  const st = JSON.parse('{"caught":{},"ach":{},"gems":1,"wins":0,"__proto__":{"polluted":1}}');
  const out = validateSaveState(st);
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.getPrototypeOf(out), Object.prototype);
});
test('apply_fills_lazy_defaults', () => {
  const imported = { caught:{}, ach:{}, gems:1, wins:0 };
  const prev = JSON.parse(JSON.stringify(S0));
  const out = applyImportState(imported);
  assert.deepEqual(out.mgs, {}); assert.equal(out.pts, 0);
  // mirrors the load path (index.html line 44): skin, gems, bst, mgs must all exist
  assert.deepEqual(out.skin, {}); assert.deepEqual(out.bst, {}); assert.equal(out.gems, 1);
  assert.deepEqual(imported, { caught:{}, ach:{}, gems:1, wins:0 });
  assert.deepEqual(S0, prev);
});
test('apply_keeps_imported_values_and_isolates', () => {
  const imported = { caught:{ 25:{ n:'pikachu', t:['electric'], b:320, sk:[] } }, ach:{}, gems:9, wins:2, pts:77, mgs:{ 10033:{ n:'Mega' } }, skin:{ 25:'art' } };
  const out = applyImportState(imported);
  assert.equal(out.pts, 77); assert.deepEqual(out.mgs, imported.mgs); assert.deepEqual(out.skin, { 25:'art' });
  out.caught[25].n = 'changed';
  assert.equal(imported.caught[25].n, 'pikachu');
});

// ---------- Task 3 / 4: structural probes (DOM code can't run headless in node) ----------
const main = html.slice(html.lastIndexOf('<script>'));
const doImportFull = main.slice(main.indexOf('function doImport('), main.indexOf('function inv('));
test('export_ui_wiring', () => {
  for (const s of ['data-save="export"', 'data-save="file"', 'id="saveta"', 'id="saveinfo"', 'Save data', "execCommand('copy')", 'navigator.clipboard'])
    assert.ok(main.includes(s), 'missing: ' + s);
  assert.match(main, /\.join\(''\)\+saveSection\(\);wireSave\(\);wireItems\(\)\}/);
});
test('import_ui_wiring', () => {
  for (const s of ['data-save="import"', 'data-save="filepick"', 'id="savefile"', 'function doImport(',
    'Nothing to import — paste a code or choose a file first.', 'That code looks cut off — copy the whole code and try again.',
    "That doesn't look like a PokéBattles save.", 'That save is from a different version of the game.',
    'That save is damaged or incomplete.', 'Import cancelled — nothing changed.'])
    assert.ok(main.includes(s), 'missing: ' + s);
  assert.ok(doImportFull.includes('confirm('), 'doImport must confirm before replacing');
  // the confirm must come before the state is replaced
  assert.ok(doImportFull.indexOf('confirm(') < doImportFull.indexOf('S=applyImportState('));
  // regression pin (found by the G10 QA gate): the cleanup refactor made applyImportState 1-arg
  // but left the 2-arg call, silently turning import into a no-op
  assert.ok(doImportFull.includes('S=applyImportState(r.state)'), 'import must apply the parsed state, not the current one');
  assert.ok(!doImportFull.includes('applyImportState(S,'), 'old 2-arg call must stay gone');
});
test('load_path_untouched', () => {
  assert.ok(main.includes("let S;try{S=JSON.parse(localStorage.getItem('pdb'))||fresh()}catch(e){S=fresh()}"));
  assert.ok(main.includes("const save=()=>{try{localStorage.setItem('pdb',JSON.stringify(S))}catch(e){}};"));
  assert.ok(main.includes('S.skin=S.skin||{};S.gems=S.gems??0;S.bst=S.bst||{};S.mgs=S.mgs||{};'));
});

// ---------- Difficulty Task 2: optional diff field ----------
test('diff_field_validation_and_import_default', () => {
  const base = { caught: {}, ach: {}, gems: 0, wins: 0 };
  assert.notEqual(validateSaveState({ ...base, diff: 'easy' }), null);
  assert.notEqual(validateSaveState({ ...base, diff: 'hard' }), null);
  assert.equal(validateSaveState({ ...base, diff: 'zzz' }), null);
  assert.equal(validateSaveState({ ...base, diff: 7 }), null);
  assert.equal(applyImportState({}).diff, 'normal', 'missing diff imports as normal');
  assert.equal(applyImportState({ diff: 'hard' }).diff, 'hard');
  assert.equal(applyImportState({ diff: 'zzz' }).diff, 'normal');
});

// ---------- Import hardening (POK-29 F1): deep validation / repair ----------
// Principle: names/types that aren't plain text reject the import; everything else repairs.
const hb = (caught, extra = {}) => ({ game: 'pokebattles', v: 1, saved: '2026-11-02T00:00:00.000Z', state: { caught, ach: {}, gems: 1, wins: 0, ...extra } });
const imp = env => parseImportPayload(JSON.stringify(env));

test('hardening_names_and_types_reject_hostile_payloads', () => {
  const c = (n, t) => ({ 1: { n, t } });
  const bad = [
    hb(c('<img src=x onerror=alert(1)>', ['fire'])),   // stored-XSS name
    hb(c('ok', 'fire')),                               // t not an array
    hb(c('ok', [])),                                   // no types
    hb(c('ok', ['fire', 'water', 'grass'])),           // 3 types
    hb(c('ok', ['fire', 'bogus'])),                    // unknown type
    hb(c('', ['fire'])),                               // empty name
    hb(c('x'.repeat(61), ['fire'])),                   // over 60 chars
    hb(c('back`tick', ['fire'])),
    hb(c('double"quote', ['fire'])),
    hb(c('ampersand&', ['fire'])),
    hb(c('tab\tchar', ['fire'])),                      // control character
    hb({ 1: { n: 'ok', t: ['fire'] }, 2: 'junk' }),    // non-object caught entry
    hb(c('ok', ['fire']), { pts: '3' }),               // text pts would corrupt score math
    hb({ 1: { n: 'ok', t: ['fire'] } }, { mgs: { 10033: { n: '<svg onload=alert(1)' } } }) // hostile mega name
  ];
  for (const env of bad) assert.equal(imp(env).error, 'shape', JSON.stringify(env.state).slice(0, 90));
});

test('hardening_names_keep_apostrophes_colons_and_60_chars', () => {
  const st = hb({ 83: { n: "Farfetch'd", t: ['normal', 'flying'] }, 772: { n: 'Type: Null', t: ['normal'] }, 25: { n: 'Pikachu'.padEnd(60, 'x'), t: ['electric'] } });
  const r = imp(st);
  assert.equal(r.ok, true);
  assert.equal(r.state.caught[83].n, "Farfetch'd");
  assert.equal(r.state.caught[772].n, 'Type: Null');
  assert.equal(r.state.caught[25].n.length, 60);
});

test('hardening_repairs_per_caught_numeric_and_aux_fields', () => {
  const st = hb({ 25: { n: 'pikachu', t: ['electric'], b: '320', bp: '5', sk: ['artwork', 'bogus', 'shiny', 7], rb: [1, 'gold', null], junk: 'keepme' } });
  const r = imp(st);
  assert.equal(r.ok, true);
  const c = r.state.caught[25];
  assert.equal(c.b, 320, 'BST numeric string coerced');
  assert.equal(c.bp, 5, 'battle points numeric string coerced');
  assert.deepEqual(c.sk, ['artwork', 'shiny'], 'skin keys filtered to real skin keys');
  assert.deepEqual(c.rb, ['gold'], 'ribbons filtered to strings');
  assert.equal(c.junk, 'keepme', 'unknown fields preserved');
  const lean = imp(hb({ 25: { n: 'pikachu', t: ['electric'], b: 320, sk: [] } }));
  assert.deepEqual(lean.state.caught[25], { n: 'pikachu', t: ['electric'], b: 320, sk: [] }, 'absent aux fields stay absent');
});

test('hardening_repairs_mgs_skin_bst_ach_items_mis', () => {
  const st = hb({ 25: { n: 'pikachu', t: ['electric'] } }, {
    mgs: { 10033: { n: 'Mega Venusaur', sl: 'venusaur-mega', t: ['grass', 'poison'], b: '625' }, junk: { n: 'x' }, 0: { n: 'zero' } },
    skin: { 25: { s: 'artwork', sh: 1 }, 7: 'art', 8: { s: 'bogus' } },
    bst: { 25: 320, 26: '303', x: 1 },
    ach: { a: 1, b: 'yes', c: 0 },
    items: { boost: '2', junk: 'nope', neg: -3 },
    mis: { done: 'x', prize: 9, act: [{ id: 'nope', p: 'zzz' }] }
  });
  const r = imp(st);
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.mgs, { 10033: { n: 'Mega Venusaur', sl: 'venusaur-mega', t: ['grass', 'poison'], b: 625 } }, 'non-integer keys dropped, BST coerced');
  assert.deepEqual(r.state.skin, { 25: { s: 'artwork', sh: 1 } }, 'junk skin values dropped, valid ones kept verbatim');
  assert.deepEqual(r.state.bst, { 25: 320 }, 'bst cache keeps finite numbers only');
  assert.deepEqual(r.state.ach, { a: 1, b: 1, c: 0 }, 'achievement flags coerce via truthiness to 0/1');
  assert.deepEqual(r.state.items, { boost: 2, junk: 0, neg: 0 }, 'item counts coerce to finite numbers');
  const m = r.state.mis;
  assert.equal(m.done, 0); assert.equal(m.prize, 0); assert.equal(m.next, 0); assert.equal(m.last, 0, 'mis scalars self-heal');
  assert.ok(Array.isArray(m.act) && m.act.length >= 1 && m.act.every(a => a && typeof a.id == 'string' && a.id != 'nope' && Number.isInteger(a.p) && a.p >= 0), 'broken act entries are replaced with valid mission slots');
});

test('hardening_valid_rich_save_roundtrips_byte_identical', () => {
  const rich = { caught: { 83: { n: "Farfetch'd", t: ['normal', 'flying'], b: 352, bp: 1234, sk: ['artwork'], rb: ['green'] } }, ach: { a: 1 }, gems: 99, wins: 3, pts: 45, se: 2, crit: 1, lead: 83, diff: 'hard', mute: true, mgs: { 10033: { n: 'Mega Venusaur', sl: 'venusaur-mega', t: ['grass', 'poison'], b: 625 } }, skin: { 83: { s: 'artwork', sh: 1 } }, items: { boost: 2 }, mis: misNormalize({}) };
  const p = buildExportPayload(rich);
  const r = parseImportPayload(p.code);
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(r.state), JSON.stringify(rich), 'validated state must be byte-identical to the exported state');
  assert.equal(parseImportPayload(p.fileJson).ok, true, 'file surface imports too');
});
