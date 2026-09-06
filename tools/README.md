# Verification harness

The scripts that produced the numbers in `docs/DESIGN.md`. They are how the
claims in this repository were checked, not decoration — every one of them
found something.

They need a browser, so they are not part of `npm test`. Build, start the
servers, then run them.

```bash
npm run build
sh tools/servers.sh          # admin :4310, worker :4320

node tools/a11y.mjs          # contrast on real composited pixels, both themes
node tools/perf.mjs /tmp     # frame timings and layout counts under load
node tools/flow.mjs /tmp shot.png   # a worker completion, end to end
node tools/failure.mjs /tmp shot.png # the same with the network cut mid-submit
node tools/package.mjs       # build the deliverable archive
```

**`a11y.mjs`** walks every text node on every screen, resolves the first opaque
ancestor background, and computes the WCAG ratio against the real rendered
colour. Token pairs pass on paper; composited pixels are what a person reads.
This is what caught the light theme sitting at 3.81:1.

**`perf.mjs`** drives a pointer sweep and a list fling through the CDP
performance domain, reporting frame times, **layout entries** and style
recalculation. The layout count is the number that matters: zero during a
scroll means the interface is pure compositing.

**`flow.mjs` / `failure.mjs`** complete a real task with a real photo upload,
and then do it again with the connection cut mid-submission — asserting the
checkbox, photo and comment all survive and the retry succeeds.

`servers.sh` restarts both apps; `package.mjs` builds the shipped archive.

Two more paths worth re-checking by hand, both verified during the build: a
session that ends while a completion form is open (the worker is told, and
handed the sign-in rather than left on a screen that can never succeed), and a
brand-new database with nothing in it (every list, chart and count survives it,
and the overview says what to set up first).
