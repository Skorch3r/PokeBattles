import { test } from 'node:test'; import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
// structural probes for the 2026-11-04 low-priority fixes (DOM can't run headless in node)
const main = html.slice(html.lastIndexOf('<script>'));

// B1 — reward path resets silently every 5 days: the mis() wrapper must announce the reset
test('reset_toast_is_wired_into_the_mis_wrapper', () => {
  assert.ok(main.includes('if(misReset(S.mis,Date.now()))toast('), 'mis() wrapper must react to the reset boolean');
  assert.ok(main.includes('Reward path restarted'), 'reset announcement copy');
});
