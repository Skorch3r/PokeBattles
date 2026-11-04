import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const m = html.match(/<script id="missions">([\s\S]*?)<\/script>/);
assert.ok(m, 'missions script block not found in index.html');
const L = new Function(m[1] + '\nreturn {MT,MIS_REWARD,MIS_MAXLV,misLevel,misLevelGems,misPick,misNormalize,misEvent,misReady,misClaim,misClaimPrize,misReset,misTimeLeft,MIS_PERIOD};')();
const { MT, misLevel, misLevelGems, misNormalize, misEvent, misReady, misClaim, misClaimPrize, misReset, misTimeLeft, MIS_PERIOD } = L;

// deterministic rng
const seeded = s => () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
const finish = (mm, i) => { const a = mm.act[i]; a.p = MT[a.id].n; };

test('reward_path_gems_table', () => {
  for (let l = 1; l <= 50; l++) {
    const want = l === 50 ? 50 : l % 25 === 0 ? 25 : l % 5 === 0 ? 10 : 5;
    assert.equal(misLevelGems(l), want, 'level ' + l);
  }
  assert.deepEqual([5, 10, 25, 30, 45, 50].map(misLevelGems), [10, 10, 25, 10, 10, 50]);
  assert.equal(misLevelGems(1), 5); assert.equal(misLevelGems(4), 5); assert.equal(misLevelGems(26), 5);
  let total = 0; for (let l = 1; l <= 50; l++) total += misLevelGems(l);
  assert.equal(total, 355);
});
test('level_from_missions_done', () => {
  assert.deepEqual([0, 4, 5, 9, 10, 249, 250, 400].map(misLevel), [0, 0, 1, 1, 2, 49, 50, 50]);
});
test('normalize_garbage_gives_three_valid_distinct_missions', () => {
  for (const bad of [undefined, null, 5, 'x', [], {}, { act: 'nope' }, { act: [null, 1, { id: 'zzz' }] }]) {
    const n = misNormalize(bad, seeded(7));
    assert.equal(n.act.length, 3); assert.equal(n.done, 0); assert.equal(n.prize, 0);
    assert.ok(n.act.every(a => MT[a.id] && a.p === 0));
    assert.equal(new Set(n.act.map(a => MT[a.id].s)).size, 3, 'distinct mission types');
  }
});
test('normalize_clamps_and_keeps_good_data', () => {
  const n = misNormalize({ done: 12.7, prize: 1, act: [{ id: 'win1', p: 99 }, { id: 'win1', p: 0 }, { id: 'kill12', p: -4 }, { id: 'buy1', p: 'x' }, { id: 'play2', p: 1 }] }, seeded(1));
  assert.equal(n.done, 12); assert.equal(n.prize, 1);
  assert.deepEqual(n.act, [{ id: 'win1', p: 1 }, { id: 'kill12', p: 0 }, { id: 'buy1', p: 0 }]); // dup dropped, p clamped, capped at 3 slots
  assert.equal(misNormalize({ done: -3, prize: 7 }).done, 0);
  assert.equal(misNormalize({ done: NaN, prize: 7 }).prize, 0);
});
test('event_adds_progress_caps_and_reports_completion_once', () => {
  const mm = misNormalize({ act: [{ id: 'win3', p: 0 }, { id: 'kill5', p: 3 }, { id: 'pts30', p: 0 }] });
  assert.deepEqual(misEvent(mm, { play: 1, win: 1, kills: 1, pts: 10 }), []);
  assert.deepEqual(mm.act.map(a => a.p), [1, 4, 10]);
  assert.deepEqual(misEvent(mm, { win: 1, kills: 9, pts: 5 }), ['kill5']);
  assert.equal(mm.act[1].p, 5);                       // capped
  assert.deepEqual(misEvent(mm, { kills: 3 }), []);   // already complete: not reported again
  assert.deepEqual(mm.act.map(a => a.p), [2, 5, 15]);
  assert.deepEqual(misEvent(mm, { win: -4, kills: 'x', bogus: 5 }), []);
  assert.deepEqual(mm.act.map(a => a.p), [2, 5, 15]);
});
test('claim_requires_finished_mission', () => {
  const mm = misNormalize({ act: [{ id: 'win3', p: 2 }, { id: 'kill5', p: 0 }, { id: 'pts30', p: 0 }] });
  const before = JSON.stringify(mm);
  assert.equal(misClaim(mm, 0), null); assert.equal(misClaim(mm, 5), null); assert.equal(misClaim(mm, -1), null);
  assert.equal(JSON.stringify(mm), before);
});
test('claim_gives_20_and_levels_every_5', () => {
  const mm = misNormalize({}, seeded(3));
  const got = [];
  for (let k = 1; k <= 10; k++) { finish(mm, 0); const r = misClaim(mm, 0, seeded(k)); got.push(r.gems); }
  // missions 1-4: 20; 5th: 20 + level 1 (5) ; 6-9: 20; 10th: 20 + level 2 (5)
  assert.deepEqual(got, [20, 20, 20, 20, 25, 20, 20, 20, 20, 25]);
  assert.equal(mm.done, 10); assert.equal(misLevel(mm.done), 2);
});
test('claim_replaces_mission_with_a_new_distinct_one', () => {
  const mm = misNormalize({ act: [{ id: 'win1', p: 1 }, { id: 'kill5', p: 0 }, { id: 'pts30', p: 0 }] });
  finish(mm, 0); misClaim(mm, 0, seeded(5));
  assert.equal(mm.act.length, 3); assert.notEqual(mm.act[0].id, 'win1'); assert.equal(mm.act[0].p, 0);
  assert.equal(new Set(mm.act.map(a => MT[a.id].s)).size, 3);
  assert.equal(new Set(mm.act.map(a => a.id)).size, 3);
});
test('full_path_totals_and_special_prize', () => {
  const mm = misNormalize({}, seeded(11)); let gems = 0, prizeAt = [], levels = [];
  for (let k = 1; k <= 260; k++) { finish(mm, k % 3); const r = misClaim(mm, k % 3, seeded(k)); gems += r.gems; if (r.prize) prizeAt.push(k); if (r.level) levels.push([r.level, r.levelGems]); }
  assert.equal(mm.done, 260);
  assert.deepEqual(prizeAt, [250]);                                   // exactly once, on the 250th mission (level 50)
  assert.equal(levels.length, 50);                                    // no levels beyond 50
  assert.deepEqual(levels.find(l => l[0] === 25), [25, 25]);
  assert.deepEqual(levels.find(l => l[0] === 50), [50, 50]);
  assert.equal(gems, 260 * 20 + 355);                                 // 20 per mission + the whole path
  assert.equal(mm.prize, 1);
  assert.equal(misLevel(mm.done), 50);
});
test('ready_badge_counts_claimable_and_prize', () => {
  const mm = misNormalize({ act: [{ id: 'win1', p: 1 }, { id: 'kill5', p: 5 }, { id: 'pts30', p: 0 }], prize: 1 });
  assert.equal(misReady(mm), 3);
  mm.prize = 2; assert.equal(misReady(mm), 2);
});
test('prize_gives_3d_skin_once_and_only_when_earned', () => {
  const S = { caught: { 25: { n: 'pikachu', sk: ['animated'] }, 6: { n: 'charizard' }, 9: { n: 'blastoise', sk: ['home'] } }, mis: { done: 250, prize: 0, act: [] } };
  assert.equal(misClaimPrize(S, 25), false);                          // not earned yet
  S.mis.prize = 1;
  assert.equal(misClaimPrize(S, 77), false);                          // not owned
  assert.equal(misClaimPrize(S, 9), false);                           // already has 3D: nothing spent
  assert.equal(S.mis.prize, 1);
  assert.equal(misClaimPrize(S, 6), true);
  assert.deepEqual(S.caught[6].sk, ['home']); assert.equal(S.mis.prize, 2);
  assert.equal(misClaimPrize(S, 25), false);                          // only one prize
  assert.deepEqual(S.caught[25].sk, ['animated']);
});

// ---------- structural probes for the UI / event wiring (DOM can't run headless in node) ----------
const main = html.slice(html.lastIndexOf('<script>'));
test('missions_ui_wiring', () => {
  assert.ok(html.includes('<button data-t="mis">Missions</button>'), 'nav tab');
  assert.ok(main.includes("if(tab=='mis')return missions();"), 'render dispatch');
  for (const s of ['function missions(', 'function claimMis(', 'function missionEvent(', 'data-mclaim', 'id="mpz"', 'id="mpg"', 'misClaimPrize(S,id)'])
    assert.ok(main.includes(s), 'missing: ' + s);
});
test('mission_events_are_hooked', () => {
  const endM = main.slice(main.indexOf('function endM('), main.indexOf('\n', main.indexOf('function endM(')));
  assert.ok(endM.includes('missionEvent({play:1,win:win?1:0,kills:me.k,pts:me.pts,wild:me.wk||0},true)'), 'endM reports the match (quiet — endM keeps the single explicit save)');
  assert.ok(main.includes("a.wk=(a.wk||0)+1;gain(a,70)"), 'wild defeats are counted in ko()');
  assert.equal((main.match(/missionEvent\(\{buy:1\}\)/g) || []).length, 2, 'Pokémon purchase + skin purchase');
});
test('existing_save_path_still_untouched', () => {
  assert.ok(main.includes("let S;try{S=JSON.parse(localStorage.getItem('pdb'))||fresh()}catch(e){S=fresh()}"));
  assert.ok(main.includes('S.skin=S.skin||{};S.gems=S.gems??0;S.bst=S.bst||{};S.mgs=S.mgs||{};'));
});

// ---------- reward path resets every 5 days ----------
const DAY = 864e5, T0 = Date.UTC(2026, 10, 1);
const board = (done = 130) => misNormalize({ done, prize: 0, act: [{ id: 'win1', p: 1 }, { id: 'kill12', p: 4 }, { id: 'pts30', p: 10 }] }, seeded(2));
test('reset_period_is_five_days', () => { assert.equal(MIS_PERIOD, 5 * DAY); });
test('reset_first_run_just_starts_the_clock', () => {
  const mm = board(); const before = JSON.stringify(mm.act);
  assert.equal(misReset(mm, T0), false);
  assert.equal(mm.next, T0 + 5 * DAY); assert.equal(mm.done, 130); assert.equal(JSON.stringify(mm.act), before);
});
test('reset_does_nothing_before_the_deadline', () => {
  const mm = board(); misReset(mm, T0); const before = JSON.stringify(mm);
  assert.equal(misReset(mm, T0 + 5 * DAY - 1), false);
  assert.equal(JSON.stringify(mm), before);
});
test('level_26_goes_back_to_the_start_after_5_days_and_missions_stay', () => {
  const mm = board(130); misReset(mm, T0);                 // 130 missions = path level 26
  assert.equal(misLevel(mm.done), 26);
  const actBefore = JSON.stringify(mm.act);
  assert.equal(misReset(mm, T0 + 5 * DAY), true);
  assert.equal(mm.done, 0); assert.equal(misLevel(mm.done), 0);   // back to the start
  assert.equal(mm.last, 26);                                       // remembered for the screen
  assert.equal(JSON.stringify(mm.act), actBefore);                 // missions and their progress untouched
  assert.equal(mm.next, T0 + 10 * DAY);
});
test('after_a_reset_the_path_climbs_again_from_the_start', () => {
  const mm = board(130); misReset(mm, T0); misReset(mm, T0 + 5 * DAY);
  const got = [];
  for (let k = 0; k < 5; k++) { mm.act[0].p = MT[mm.act[0].id].n; got.push(misClaim(mm, 0, seeded(k + 1)).gems); }
  assert.deepEqual(got, [20, 20, 20, 20, 25]);                     // level 1 (+5 gems) on the 5th mission of the new cycle
  assert.equal(misLevel(mm.done), 1);
});
test('reset_keeps_an_unpicked_level_50_prize_but_reopens_a_used_one', () => {
  const a = board(250); a.prize = 1; misReset(a, T0); misReset(a, T0 + 5 * DAY);
  assert.equal(a.prize, 1); assert.equal(a.done, 0); assert.equal(a.last, 50);   // not lost
  const b = board(250); b.prize = 2; misReset(b, T0); misReset(b, T0 + 5 * DAY);
  assert.equal(b.prize, 0);                                                      // can be earned again next cycle
});
test('reset_after_a_long_absence_happens_once_and_keeps_the_5_day_grid', () => {
  const mm = board(40); misReset(mm, T0);
  assert.equal(misReset(mm, T0 + 12 * DAY), true);
  assert.equal(mm.next, T0 + 15 * DAY); assert.equal(mm.done, 0); assert.equal(mm.last, 8);
  assert.equal(misReset(mm, T0 + 12 * DAY), false);
});
test('reset_survives_the_clock_being_moved_back', () => {
  const mm = board(); misReset(mm, T0);
  assert.equal(misReset(mm, T0 - 400 * DAY), false);
  assert.equal(mm.next, T0 - 400 * DAY + 5 * DAY); assert.equal(mm.done, 130);
  assert.equal(misReset(mm, NaN), false);
});
test('normalize_cleans_bad_reset_fields', () => {
  for (const bad of [NaN, -5, 'x', null, Infinity]) { assert.equal(misNormalize({ next: bad }).next, 0); assert.equal(misNormalize({ last: bad }).last, 0); }
  assert.equal(misNormalize({ next: 123456, last: 26.9 }).next, 123456); assert.equal(misNormalize({ last: 26.9 }).last, 26); assert.equal(misNormalize({ last: 99 }).last, 50);
});
test('time_left_text', () => {
  assert.equal(misTimeLeft(4 * DAY + 12 * 36e5 + 5), '4d 12h');
  assert.equal(misTimeLeft(5 * 36e5 + 20 * 6e4), '5h 20m');
  assert.equal(misTimeLeft(7 * 6e4), '7m'); assert.equal(misTimeLeft(1000), '1m');
  assert.equal(misTimeLeft(0), 'moments'); assert.equal(misTimeLeft(-5), 'moments');
});
test('reset_is_wired_into_the_game', () => {
  assert.ok(main.includes('const mis=()=>{S.mis=misNormalize(S.mis);if(misReset(S.mis,Date.now()))toast(\'Reward path restarted — a new 5-day window begins.\'+(S.mis.last?\' You reached level \'+S.mis.last+\' last window.\':\'\'));return S.mis};'));
  assert.ok(main.includes('The path goes back to the start in ${misTimeLeft(m.next-Date.now())}'));
  assert.ok(!main.includes('misRefresh'), 'the old board-refresh is gone');
});
