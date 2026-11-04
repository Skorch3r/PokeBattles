# Two Medium-Bug Fixes — Design Spec

**Status:** Pending human approval. Both bugs verified in source at `c57c69b` (single-file `index.html`; anchor edits by exact text).

## Verified findings

| # | Bug | Root cause (verified) |
|---|-----|----------------------|
| B1 | Pop-up messages overwrite each other; at match end "Mission complete" is replaced by an achievement toast; several achievements at once show only the last | `toast()` (l.284) is a single element: `e.textContent=t; e.style.display='block'; clearTimeout(toast.t); toast.t=setTimeout(hide,2600)` — every call replaces the text and restarts the one timer. Match end fires `missionEvent` toast (l.475, 'Mission complete: …') then `checkAch` toasts one per new achievement (l.283) — last write wins. `toast.t` is referenced nowhere else. |
| B2 | Clicking a top tab during a match throws the match away without asking | Nav handler (l.527): `onclick=()=>{M=null;tab=b.dataset.t;render()}` — unconditional discard. `loop()` already clamps `dt` to `Math.min(.05,(now-M.last)/1000)` (l.468), so a blocking `confirm()` mid-match cannot cause a physics jump, and `M.over` distinguishes an active match from the end screen. `confirm()` is established house style (used by import). |

## Design decisions

- **B1 — queue, don't overwrite.** Replace `toast()` internals with a FIFO queue; messages display in order, 2600 ms each, element hides when the queue drains:
  ```js
  const toastQ=[];
  function toast(t){toastQ.push(t);if(!toast.t)nextToast()}
  function nextToast(){const t=toastQ.shift();if(t===undefined){$('#toast').style.display='none';toast.t=null;return}$('#toast').textContent=t;$('#toast').style.display='block';toast.t=setTimeout(nextToast,2600)}
  ```
  - `toast.t` doubles as the timer handle and a "currently displaying" flag (starts falsy). First `toast()` starts the pump; later calls only queue. No `clearTimeout` needed — nothing is ever interrupted, so no message is lost.
  - All existing call-sites (`toast('…')` syntax) unchanged; pinned call-site strings (difficulty.test, missions.test, fixes test) untouched.
  - Uniform 2600 ms per message; a match end with mission + 2 achievements plays ~7.8 s of toasts — acceptable, and strictly better than losing messages.
- **B2 — "Leave the match?" confirmation.** Nav handler becomes:
  ```js
  document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{if(M&&!M.over&&!confirm('Leave the match? Progress in this match will be lost.'))return;M=null;tab=b.dataset.t;render()});
  ```
  - Confirms **only** while a match is actively running (`M && !M.over`). On the match-end screen (`M.over`) navigation stays one-click — there is nothing left to lose.
  - Decline → early return: match view, state, and rAF loop untouched (dt already clamped).
  - Accept → exact previous behavior (`M=null;tab=…;render()`), loop exits via its `!M` guard.
- **No save-format, gameplay, or difficulty changes.** Both fixes are pure UX.

## Test plan (red-first, same-commit pins)

Extend `tests/fixes-2026-11-04.test.mjs`:
5. **B1**: structural — `toastQ` queue present; old overwrite line `clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',2600)` absent; `nextToast` drains and hides.
6. **B2**: structural — nav handler contains `if(M&&!M.over&&!confirm(` and the 'Leave the match?' copy.

## QA gate

Extend `/tmp/gate.mjs` with functional probes:
1. **Queue order**: fire three toasts back-to-back (missionEvent-style + two achievements) → element shows the **first** message immediately (regression: previously the last), the second after ~2.6 s, third after ~5.2 s, hidden after ~7.8 s.
2. **Leave-confirm**: active match + `confirm=()=>false` + nav click → match still running, view unchanged, no re-render; `confirm=()=>true` → match discarded, tab switched; on the end screen (`M.over`) nav click does **not** invoke confirm (stub throws if called).

## Issue shape (proposed)

4 issues, strictly sequential (all edit `index.html`): F1 toast queue (Systems) → F2 leave-match confirm (Systems) → F3 CHANGELOG (Content) → G8 QA gate (QA).
