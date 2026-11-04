# Tests

Zero-dependency probes for the game features (save export/import, missions, items, confetti and more).
Run from the repo root with Node 18+: `node --test`
The suites pull the pure `<script id="save-io">` and `<script id="missions">` blocks out of `index.html` and test them directly; DOM wiring is checked structurally.
