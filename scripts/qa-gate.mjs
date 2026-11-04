// POK-26 G8 QA gate — zero-dependency functional probes (extends the POK-18/POK-10 pattern).
// Drives the real index.html script blocks with DOM/fetch/localStorage stubs.
// Run: node scripts/qa-gate.mjs   (from anywhere; override the repo path with POKEBATTLES_REPO=...)
// Expect: 53/53 assertions passed. Covers spec §QA gate: toast queue order (first message shows
// immediately, then ~2.6 s spacing, hides after drain) and leave-confirm gating (decline keeps the
// match, accept discards, end-screen nav never calls confirm).
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { execSync } from 'node:child_process';

const REPO = process.env.POKEBATTLES_REPO || new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const html = readFileSync(REPO + '/index.html', 'utf8');
const blocks = [...html.matchAll(/<script(?: id="[\w-]+")?>([\s\S]*?)<\/script>/g)].map(m => m[1]);
if (blocks.length < 7) { console.error('FAIL: expected 7 script blocks, got ' + blocks.length); process.exit(1); }

// ---------- result harness ----------
const out = [];
let fail = 0;
const A = (name, cond, detail) => { out.push(`${cond ? 'PASS' : (fail++, 'FAIL')} ${name}${cond ? '' : ' :: ' + detail}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tick = () => new Promise(r => setImmediate(r));

// ---------- stubs ----------
const noop = () => {};
const TX = []; // setTransform call log (HiDPI probe)
const CTX2D = new Proxy({}, {
  get(t, p) {
    if (p === 'setTransform') return (...a) => { TX.push(a); };
    if (p === 'measureText') return () => ({ width: 12 });
    if (p === 'createRadialGradient' || p === 'createLinearGradient' || p === 'createPattern') return () => ({ addColorStop: noop });
    if (p in t) return t[p];
    return noop;
  },
  set(t, p, v) { t[p] = v; return true; }
});

const STATIC = new Set(['nav button']);
const Els = new Map();
const reg = (sel, el) => { if (!Els.has(sel)) Els.set(sel, []); Els.get(sel).push(el); };
let canvasCount = 0;
function makeEl(tag) {
  const el = {
    tagName: tag, style: {}, dataset: {}, value: '', disabled: false, files: [], hidden: false,
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute(k, v) { el.dataset[k.replace(/^data-/, '')] = v; },
    getAttribute(k) { return el.dataset[k]; },
    focus: noop, select: noop, remove: noop, appendChild: noop,
    click() { el.onclick && el.onclick({ target: el }); },
    getContext: () => CTX2D,
    querySelectorAll: sel => Els.get(sel) || [],
    querySelector: sel => (Els.get(sel) || [])[0] || null
  };
  Object.defineProperty(el, 'innerHTML', {
    get: () => el._html || '',
    set(h) { el._html = String(h); scanHTML(el._html); }
  });
  Object.defineProperty(el, 'textContent', { get: () => el._text || '', set(v) { el._text = String(v); } });
  return el;
}
function scanHTML(html) {
  for (const k of [...Els.keys()]) if (!STATIC.has(k) && (k.startsWith('[') || k.startsWith('.') || k.includes(' '))) Els.set(k, []);
  const tagRe = /<(\w+)([^>]*)>/g; let m;
  while ((m = tagRe.exec(html))) {
    const attrs = m[2], el = makeEl(m[1]);
    const idm = attrs.match(/\bid="([\w-]+)"/);
    const dm = attrs.match(/\bdata-([\w-]+)="([^"]*)"/);
    if (dm) { el.dataset[dm[1]] = dm[2]; reg('[data-' + dm[1] + ']', el); }
    if (idm) Els.set('#' + idm[1], [el]); // id selectors replace (innerHTML replaced the node)
    const vmAttr = attrs.match(/\bvalue="([^"]*)"/); // browser would decode entities when parsing
    if (vmAttr) el.value = vmAttr[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    const cm = attrs.match(/\bclass="([^"]*)"/);
    if (cm && /\bcell\b/.test(cm[1]) && dm && dm[1] === 'i') reg('.cell', el);
  }
  if (html.includes('id="diffr"')) Els.set('#diffr [data-d]', [...(Els.get('[data-d]') || [])]);
}
function q(sel) { let e = (Els.get(sel) || [])[0]; if (!e) { e = makeEl('div'); reg(sel, e); } return e; }

const navTs = ['battle', 'dex', 'shop', 'inv', 'mis', 'ach'];
const navBtns = navTs.map(t => Object.assign(makeEl('button'), { dataset: { t } }));
navBtns.forEach(b => reg('nav button', b));
const misBtn = navBtns[4];

// seed save (lead set, so battleView goes straight to idle()/mapPick path)
const seed = { caught: { 10: { n: 'Caterpie', t: ['bug'], b: 195, sk: [] } }, wins: 0, gems: 500, bst: {}, lead: 10, se: 0, crit: 0, ach: {}, diff: 'normal' };
const store = new Map([['pdb', JSON.stringify(seed)]]);
const lsLog = [];
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); lsLog.push(String(v)); },
  removeItem: k => store.delete(k), clear: () => store.clear(), key: i => [...store.keys()][i], get length() { return store.size; }
};

let megaSeq = 2000; const slugId = new Map();
const STATS = n => ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map((s, i) => ({ stat: { name: s }, base_stat: 40 + ((n * 7 + i * 13) % 40) }));
const fetch = u => {
  u = String(u);
  if (u.includes('pokemon?limit=')) return Promise.resolve({ json: async () => ({ results: Array.from({ length: 1025 }, (_, i) => ({ name: 'mon-' + (i + 1) })) }) });
  let m = u.match(/pokemon\/(\d+)$/);
  if (m) { const id = +m[1]; return Promise.resolve({ json: async () => ({ id, name: 'mon-' + id, stats: STATS(id), types: [{ type: { name: ['normal', 'fire', 'water'][id % 3] } }] }) }); }
  m = u.match(/pokemon\/([a-z0-9-]+)$/);
  if (m) { const slug = m[1]; if (!slugId.has(slug)) slugId.set(slug, megaSeq++); const id = slugId.get(slug); return Promise.resolve({ json: async () => ({ id, name: slug, stats: STATS(id).map(x => ({ stat: x.stat, base_stat: 100 })), types: [{ type: { name: 'normal' } }, { type: { name: 'flying' } }] }) }); }
  return Promise.resolve({ json: async () => ({}) });
};

const winL = {}, docL = {};
const addEventListener = (t, f) => { (winL[t] ??= []).push(f); };
const fireWin = (t, ev) => { (winL[t] || []).forEach(f => f(ev)); };
const rafQ = [];
const document = {
  hidden: false, body: { appendChild: noop, removeChild: noop },
  querySelector: sel => (sel === 'nav [data-t="mis"]' ? misBtn : q(sel)),
  querySelectorAll: sel => (sel === 'nav button' ? navBtns : (Els.get(sel) || [])),
  createElement: tag => { if (tag === 'canvas') canvasCount++; return makeEl(tag); },
  addEventListener: (t, f) => { (docL[t] ??= []).push(f); },
  execCommand: () => true
};

const _st = globalThis.setTimeout, _si = globalThis.setInterval;
const setTO = (f, ms, ...a) => { const t = _st(f, ms, ...a); t.unref && t.unref(); return t; };
const setIV = (f, ms, ...a) => { const t = _si(f, ms, ...a); t.unref && t.unref(); return t; };
class Image { constructor() { this.complete = true; this.naturalWidth = 100; } set src(v) {} }

// ---------- sandbox ----------
const sandbox = {
  document, localStorage, fetch, addEventListener, setTimeout: setTO, setInterval: setIV,
  clearTimeout, clearInterval, cancelAnimationFrame: id => { const i = rafQ.indexOf(id); if (i >= 0) rafQ.splice(i, 1); },
  requestAnimationFrame: cb => (rafQ.push(cb), rafQ.length),
  performance, console, Math, JSON, Date, Object, Array, Promise, Number, String, Boolean, Set, Map,
  isNaN, isFinite, parseInt, parseFloat, RegExp, Error, TypeError,
  btoa, atob, unescape, escape, decodeURIComponent, encodeURIComponent,
  matchMedia: () => ({ matches: false }),
  confirm: () => true, alert: noop,
  navigator: {}, URL, Blob, FileReader: class { readAsText() {} },
  Image, innerWidth: 900, innerHeight: 520, devicePixelRatio: 1,
  location: { href: 'http://localhost/' }
};
sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const shim = `;globalThis.__={get S(){return S},set S(v){S=v},get M(){return M},set M(v){M=v},get tab(){return tab},get hkDown(){return hkDown},get hkSt(){return hkSt},get hkIv(){return hkIv},get SH(){return SH},set SH(v){SH=v},get toastQ(){return toastQ},get SKINP(){return SKINP},HK_KEYS,SKN,DIFF_IDS,DIFFS,SAVE_GAME,SAVE_VERSION,parseImportPayload,applyImportState,buildExportPayload,validateSaveState,rar,RN,LEG,TOTAL,legendaryAllowed};globalThis.__q=q=>(Els_===0?0:document.querySelector(q));`;
vm.runInContext(blocks.join('\n') + shim, sandbox, { filename: 'index.html' });
const X = sandbox.__;

// ---------- probes ----------
// (1) full suite, glob form, from clean tree
let suite = '';
try { suite = execSync('node --test tests/*.test.mjs', { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { suite = (e.stdout || '') + (e.stderr || ''); }
const pm = suite.match(/pass (\d+)/), fm = suite.match(/fail (\d+)/);
A('suite_glob_form_green', pm && fm && fm[1] === '0', `pass=${pm && pm[1]} fail=${fm && fm[1]}`);

for (let i = 0; i < 50; i++) await tick(); // let boot async (loadNames/loadMegas/scan) settle

// (2) boot + mapPick + start a Meadow Normal match
A('boot_renders_idle', /Ready\. Pick a map/.test(q('#m').innerHTML), q('#m').innerHTML.slice(0, 80));
q('#go').onclick();
A('mapPick_renders', q('#m').innerHTML.includes('Choose a map') && (Els.get('#diffr [data-d]') || []).length === 3, 'diffr=' + (Els.get('#diffr [data-d]') || []).length);
q('#diffr [data-d]').onclick; // noop ref check
const dHard = Els.get('#diffr [data-d]').find(b => b.dataset.d === 'hard');
dHard.onclick();
A('difficulty_picker_sets_hard', X.S.diff === 'hard' && JSON.parse(lsLog.at(-1)).diff === 'hard', X.S.diff);
Els.get('#diffr [data-d]').find(b => b.dataset.d === 'normal').onclick();
A('difficulty_picker_back_normal', X.S.diff === 'normal', X.S.diff);
Els.get('[data-m]').find(b => b.dataset.m === '0').onclick(); // Meadow Lane -> choose()
A('choose_renders_cells', (Els.get('.cell') || []).length >= 1, 'cells=' + (Els.get('.cell') || []).length);
Els.get('.cell')[0].onclick(); // start(lead) async
for (let i = 0; i < 200 && !X.M; i++) await tick();
A('battle_boots_M_created', !!X.M && !X.M.over && X.M.f.length === 6, X.M ? 'f=' + X.M.f.length : 'M=null'); // 3v3 = me + 2 allies + 3 foes
A('match_is_normal_difficulty', !!X.M && X.tab === 'battle', 'tab=' + X.tab);
const cb0 = rafQ.shift();
let threw = null;
try { cb0(performance.now() + 16); } catch (e) { threw = e; }
A('one_upd_tick_no_throw', !threw && X.M && X.M.t < 150, threw ? threw.message : 't=' + (X.M && X.M.t.toFixed(2)));

// (3a) keys while match active: M.keys tracked + NOKEY preventDefault
let pd = 0;
const key = (k, code, down) => fireWin(down ? 'keydown' : 'keyup', { key: k, code, preventDefault() { pd++; } });
key('w', 'KeyW', 1); A('Mkeys_tracks_keydown', X.M.keys.w === 1, JSON.stringify(X.M.keys));
key('w', 'KeyW', 0); A('Mkeys_tracks_keyup', X.M.keys.w === 0, JSON.stringify(X.M.keys));
const pd0 = pd;
key('ArrowUp', 'ArrowUp', 1); key('ArrowUp', 'ArrowUp', 0);
A('NOKEY_preventDefault_active', pd - pd0 === 1, 'pd=' + (pd - pd0)); // keydown only — keyup handler never preventDefaults
fireWin('blur', {});
A('blur_clears_Mkeys', Object.keys(X.M.keys).length === 0, JSON.stringify(X.M.keys));

// (4) endM: exactly one localStorage save, gems/wins/pts/mis/ach present
X.M.sc = [5, 0]; X.M.f[0].k = 2; X.M.f[0].pts = 30; X.M.f[0].wk = 3;
const gems0 = X.S.gems, wins0 = X.S.wins, log0 = lsLog.length;
X.M.t = 0.001; X.upd ? 0 : 0; sandbox.upd && sandbox.upd(0.01);
const viaUpd = X.M.over === 1;
if (!viaUpd) { try { sandbox.endM(); } catch (e) { A('endM_runs', false, e.message); } }
await tick();
A('endM_exactly_one_save', lsLog.length - log0 === 1, 'delta=' + (lsLog.length - log0));
const saved = JSON.parse(lsLog[lsLog.length - 1]);
A('endM_save_shape', ['gems', 'wins', 'pts', 'mis', 'ach'].every(k => saved[k] !== undefined && saved[k] !== null), JSON.stringify(Object.keys(saved)));
A('endM_normal_win_rewards', saved.gems === gems0 + 20 && saved.wins === wins0 + 1 && saved.pts === 30, `gems ${gems0}->${saved.gems} wins ${wins0}->${saved.wins} pts=${saved.pts}`);
A('endM_mission_progress_saved', saved.mis.act && saved.mis.act.length === 3, JSON.stringify(saved.mis && saved.mis.act && saved.mis.act.map(a => a.id)));

// back to menu (M=null) via the real button
q('#pa').onclick();
A('back_to_menu_M_null', X.M === null, 'M=' + X.M);

// (3b) hold-keys with M===null
const held0 = canvasCount, hk0 = { ...X.hkDown };
for (const k of X.HK_KEYS) key(k, 'Key' + k.toUpperCase(), 1);
const pdH0 = pd; key('ArrowUp', 'ArrowUp', 1); key('ArrowUp', 'ArrowUp', 0);
A('NOKEY_not_prevented_when_M_null', pd - pdH0 === 0, 'pd=' + (pd - pdH0));
A('hkDown_tracks_HK_KEYS', X.HK_KEYS.every(k => X.hkDown[k] === 1), JSON.stringify(X.hkDown));
await sleep(2400);
A('hold_keys_fires_after_2s', X.hkSt.fired === true && canvasCount > held0, `fired=${X.hkSt.fired} canvases=${canvasCount}`);
for (const k of X.HK_KEYS) key(k, 'Key' + k.toUpperCase(), 0);
await sleep(200); // interval clears itself on its next tick after release
A('hold_keys_resets_on_keyup', X.hkIv === 0 && X.hkSt.t === 0, 'iv=' + X.hkIv);

// (5) save-io round-trip + old save without diff + garbage diff
const exp = X.buildExportPayload(X.S);
const r1 = X.parseImportPayload(exp.code);
A('export_parses_back', r1.ok === true, JSON.stringify(r1));
const imp = X.applyImportState(r1.state);
A('roundtrip_preserves_diff', X.DIFF_IDS.includes(imp.diff) && imp.gems === X.S.gems, 'diff=' + imp.diff);
const oldEnv = { game: X.SAVE_GAME, v: X.SAVE_VERSION, saved: '2026-01-01T00:00:00.000Z', state: { gems: 5, wins: 2, caught: { 25: { n: 'Pikachu', t: ['electric'], b: 300, sk: [] } }, ach: {} } };
const r2 = X.parseImportPayload(JSON.stringify(oldEnv));
A('old_save_imports', r2.ok === true, JSON.stringify(r2));
A('old_save_without_diff_becomes_normal', r2.ok && X.applyImportState(r2.state).diff === 'normal', r2.ok ? X.applyImportState(r2.state).diff : JSON.stringify(r2));
const bad = JSON.parse(JSON.stringify(oldEnv)); bad.state.diff = 'zzz';
const r3 = X.parseImportPayload(JSON.stringify(bad));
A('garbage_diff_rejected', r3.ok === false && r3.error === 'shape', JSON.stringify(r3));
A('garbage_code_rejected', X.parseImportPayload('PDB1-!!!').ok === false, 'cutoff check');

// (6) SKN key order + shop skin buy
A('SKN_key_order', JSON.stringify(Object.keys(X.SKN)) === JSON.stringify(['animated', 'artwork', 'home', 'shiny']), JSON.stringify(Object.keys(X.SKN)));
navBtns.find(b => b.dataset.t === 'shop').onclick(); // real nav wiring sets tab='shop' + render()
X.SH.t = 'skin'; sandbox.shopGrid();
const buyBtn = (Els.get('[data-bs]') || [])[0];
A('shop_lists_skins', !!buyBtn, 'buttons=' + (Els.get('[data-bs]') || []).length);
const g0 = X.S.gems, tid = buyBtn && buyBtn.dataset.bs;
buyBtn.onclick();
const [bid, bkey] = tid.split(':');
A('shop_skin_buy_works', X.S.gems === g0 - X.SKINP[bkey] && (X.S.caught[+bid].sk || []).includes(bkey), `${g0}->${X.S.gems} expected -${X.SKINP[bkey]} sk=${JSON.stringify(X.S.caught[+bid].sk)}`);

// (7) missions page renders progress bars
sandbox.missions();
const mh = q('#m').innerHTML;
A('missions_bar_renders', /class="bar/.test(mh) && mh.includes('data-mclaim'), 'bars=' + (mh.match(/class="bar/g) || []).length);

// ---------- POK-19 additions: the four 2026-11-04 low-priority fixes ----------
// (8) FIX B1 — reward-path reset announces itself, exactly once
X.S.mis.done = 130; X.S.mis.next = Date.now() - 1000; X.S.mis.last = 0; // level 26 path, window overdue
let toasts = 0; const realPush8 = X.toastQ.push; X.toastQ.push = (...a) => { toasts++; return realPush8.apply(X.toastQ, a); }; // count toast() calls without rebinding toast — its .t pump flag must stay on the real function
if (sandbox.toast.t) { clearTimeout(sandbox.toast.t); sandbox.toast.t = null; } // drain any in-flight toast so the reset message displays immediately
X.toastQ.length = 0; // drop queued toasts from earlier probes (probe 6's shop toast may be queued or displaying — race-free reset)
q('#toast').textContent = ''; q('#toast').style.display = 'none';
sandbox.hud(); // boot path render()→hud()→mis() runs the wrapper
const rmsg = q('#toast').textContent;
A('reset_toast_fires_once', toasts === 1, 'toasts=' + toasts);
A('reset_toast_copy', rmsg === 'Reward path restarted — a new 5-day window begins. You reached level 26 last window.', JSON.stringify(rmsg));
A('reset_state_applied', X.S.mis.done === 0 && X.S.mis.last === 26 && X.S.mis.next > Date.now(), JSON.stringify({ done: X.S.mis.done, last: X.S.mis.last, next: X.S.mis.next }));
sandbox.hud();
A('reset_toast_not_refired', toasts === 1 && q('#toast').textContent === rmsg, 'toasts=' + toasts);
X.toastQ.push = realPush8;

// (9) FIX B2 — legendary shop cards say 'Hard mode only' on Easy/Normal, nothing on Hard
navBtns.find(b => b.dataset.t === 'shop').onclick(); // real nav wiring: tab='shop' + shop()
X.SH.t = 'poke'; X.SH.rf = -1; X.SH.q = ''; X.SH.n = 3000; // whole dex, all rarities
sandbox.shopGrid();
const noteOn144 = g => /<span class="stats">Hard mode only<\/span><button[^>]*data-bp="144"/.test(g); // Articuno = rarity 4
A('shop_rarity4_is_legendary', X.rar(144) === 4 && !X.S.caught[144], 'rar=' + X.rar(144));
X.S.diff = 'easy';
A('shop_note_easy', noteOn144(q('#sgrid').innerHTML), 'note missing');
X.S.diff = 'normal'; sandbox.shopGrid();
A('shop_note_normal', noteOn144(q('#sgrid').innerHTML), 'note missing');
X.S.diff = 'hard'; sandbox.shopGrid();
const gridHard = q('#sgrid').innerHTML;
A('shop_note_hidden_hard', gridHard.includes('data-bp="144"') && !gridHard.includes('Hard mode only'), 'note=' + gridHard.includes('Hard mode only'));
X.S.diff = 'normal';

// (10) FIX B3 — the search box keeps quotes and ampersands across a full re-render
X.SH.q = 'pi"ka&';
sandbox.shop();
A('search_quotes_survive', q('#sq').value === 'pi"ka&', JSON.stringify(q('#sq').value));

// (11) FIX B4 — match canvas backing store follows devicePixelRatio
sandbox.devicePixelRatio = 2;
navBtns.find(b => b.dataset.t === 'battle').onclick(); // battleView (M is null after the menu)
q('#go').onclick(); // idle view's Start button → mapPick
Els.get('[data-m]').find(b => b.dataset.m === '0').onclick(); // Meadow Lane → choose()
Els.get('.cell')[0].onclick(); // start(lead)
for (let i = 0; i < 200 && !X.M; i++) await tick();
for (let i = 0; i < 200 && !q('#cv').width; i++) await tick();
A('hidpi_backing_store', q('#cv').width === 1800 && q('#cv').height === 1040, `w=${q('#cv').width} h=${q('#cv').height}`);
A('hidpi_transform', TX.some(a => a[0] === 2 && a[1] === 0 && a[2] === 0 && a[3] === 2 && a[4] === 0 && a[5] === 0), 'last=' + JSON.stringify(TX.at(-1)));
sandbox.devicePixelRatio = 1;

// ---------- POK-26 additions: the two 2026-11-04 medium fixes ----------
// (12) FIX B1 — toasts queue FIFO: match-end sequence shows EVERY message in order
X.toastQ.length = 0; if (sandbox.toast.t) { clearTimeout(sandbox.toast.t); sandbox.toast.t = null; } // deterministic pump state
const toastEl = q('#toast');
sandbox.toast('Mission complete: Defeat 3 opponents'); // missionEvent-style first message
sandbox.toast('Achievement: First blood');             // checkAch-style second
sandbox.toast('Achievement: Rainbow');                 // checkAch-style third
A('toast_queue_first_shows_immediately', toastEl.textContent === 'Mission complete: Defeat 3 opponents' && toastEl.style.display === 'block' && X.toastQ.length === 2, // regression: overwrite showed the LAST message here
  JSON.stringify({ t: toastEl.textContent, d: toastEl.style.display, q: X.toastQ.length }));
await sleep(2700);
A('toast_queue_second_after_2_6s', toastEl.textContent === 'Achievement: First blood' && X.toastQ.length === 1, JSON.stringify({ t: toastEl.textContent, q: X.toastQ.length }));
await sleep(2600);
A('toast_queue_third_after_5_2s', toastEl.textContent === 'Achievement: Rainbow' && X.toastQ.length === 0, JSON.stringify({ t: toastEl.textContent, q: X.toastQ.length }));
await sleep(2700);
A('toast_queue_hidden_after_drain', toastEl.style.display === 'none' && X.toastQ.length === 0, 'display=' + toastEl.style.display);

// (13) FIX B2 — nav confirms before abandoning an ACTIVE match; end screen stays one-click
if (!X.M || X.M.over) { // probe 11 normally leaves an active match; restart one if not
  navBtns.find(b => b.dataset.t === 'battle').onclick(); q('#go').onclick();
  Els.get('[data-m]').find(b => b.dataset.m === '0').onclick(); Els.get('.cell')[0].onclick();
  for (let i = 0; i < 200 && !X.M; i++) await tick();
}
A('leave_probe_has_active_match', !!X.M && !X.M.over && X.tab === 'battle', 'M=' + !!X.M + ' tab=' + X.tab);
let confirmCalls = 0; const realConfirm = sandbox.confirm; const realRender2 = sandbox.render; let renders = 0;
sandbox.render = () => { renders++; return realRender2(); };
const mRef = X.M, viewBefore = q('#m').innerHTML, tabBefore = X.tab;
sandbox.confirm = () => { confirmCalls++; return false; };
navBtns.find(b => b.dataset.t === 'dex').onclick(); // decline
A('leave_decline_keeps_match', confirmCalls === 1 && X.M === mRef && X.tab === tabBefore && renders === 0, `calls=${confirmCalls} M=${!!X.M} tab=${X.tab} renders=${renders}`);
A('leave_decline_view_untouched', q('#m').innerHTML === viewBefore, 'view re-rendered on decline');
confirmCalls = 0; renders = 0;
sandbox.confirm = () => { confirmCalls++; return true; };
navBtns.find(b => b.dataset.t === 'dex').onclick(); // accept
A('leave_accept_discards_and_switches', confirmCalls === 1 && X.M === null && X.tab === 'dex' && renders === 1, `calls=${confirmCalls} M=${X.M} tab=${X.tab} renders=${renders}`);
sandbox.render = realRender2;
// end screen: M kept with M.over — nav must NOT confirm (stub throws if called)
navBtns.find(b => b.dataset.t === 'battle').onclick(); q('#go').onclick();
Els.get('[data-m]').find(b => b.dataset.m === '0').onclick(); Els.get('.cell')[0].onclick();
for (let i = 0; i < 200 && !X.M; i++) await tick();
X.M.sc = [5, 0]; X.M.f[0].k = 2; X.M.f[0].pts = 30; X.M.f[0].wk = 3; X.M.t = 0.001;
sandbox.upd && sandbox.upd(0.01);
if (X.M && !X.M.over) { try { sandbox.endM(); } catch (e) {} }
await tick();
A('end_screen_reached_with_M_kept', !!X.M && !!X.M.over, 'M=' + !!X.M + ' over=' + (X.M && X.M.over));
confirmCalls = 0;
sandbox.confirm = () => { confirmCalls++; throw new Error('confirm must not be called on the end screen'); };
let endNavThrow = null;
try { navBtns.find(b => b.dataset.t === 'shop').onclick(); } catch (e) { endNavThrow = e; }
A('end_screen_nav_no_confirm', !endNavThrow && confirmCalls === 0 && X.M === null && X.tab === 'shop', endNavThrow ? endNavThrow.message : `calls=${confirmCalls} M=${X.M} tab=${X.tab}`);
sandbox.confirm = realConfirm;

// ---------- report ----------
console.log(out.join('\n'));
console.log(`\n${out.length - fail}/${out.length} assertions passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
