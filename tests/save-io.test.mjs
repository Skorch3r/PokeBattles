import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="save-io">([\s\S]*?)<\/script>/);
assert.ok(m, 'save-io script block not found in index.html');
const io = new Function(m[1] + '\nreturn {SAVE_GAME,SAVE_VERSION,SAVE_CODE_PREFIX,buildExportPayload,b64urlEncode,b64urlDecode,parseImportPayload,validateSaveState,applyImportState};')();
const { buildExportPayload, parseImportPayload, validateSaveState, applyImportState, b64urlEncode, b64urlDecode } = io;

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
  const out = applyImportState(S0, imported);
  assert.deepEqual(out.mgs, {}); assert.equal(out.pts, 0);
  // mirrors the load path (index.html line 44): skin, gems, bst, mgs must all exist
  assert.deepEqual(out.skin, {}); assert.deepEqual(out.bst, {}); assert.equal(out.gems, 1);
  assert.deepEqual(imported, { caught:{}, ach:{}, gems:1, wins:0 });
  assert.deepEqual(S0, prev);
});
test('apply_keeps_imported_values_and_isolates', () => {
  const imported = { caught:{ 25:{ n:'pikachu', t:['electric'], b:320, sk:[] } }, ach:{}, gems:9, wins:2, pts:77, mgs:{ 10033:{ n:'Mega' } }, skin:{ 25:'art' } };
  const out = applyImportState(S0, imported);
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
  assert.equal(applyImportState(base, {}).diff, 'normal', 'missing diff imports as normal');
  assert.equal(applyImportState(base, { diff: 'hard' }).diff, 'hard');
  assert.equal(applyImportState(base, { diff: 'zzz' }).diff, 'normal');
});
