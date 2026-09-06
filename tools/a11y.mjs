/**
 * Contrast audit against *composited pixels*, not computed styles.
 *
 * Reading `backgroundColor` up the ancestor chain is what most quick audits do,
 * and it is wrong here: half this interface is painted with gradients, which
 * leave `background-color` transparent. That approach both invents failures
 * (white on a brand-blue gradient looks like white on white) and hides real
 * ones (white initials on a pale gradient look fine because the pale colour is
 * never seen). So instead: hide the glyphs, screenshot the page, and read the
 * pixel each run of text is actually sitting on.
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });

const SELECTOR = 'p,span,h1,h2,h3,dd,dt,label,button,a,li,td,th,strong,em,small';

// Pass 1: find every visible run of text, remember where its glyphs sit, and
// make them transparent so the next screenshot shows only what is behind them.
const collect = `(() => {
  const out = [];
  for (const el of document.querySelectorAll(${JSON.stringify(SELECTOR)})) {
    if (!el.textContent || !el.textContent.trim()) continue;
    if (el.querySelector(${JSON.stringify(SELECTOR)})) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.35) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    range.detach();
    if (r.width < 3 || r.height < 5) continue;
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
    // Skip text nobody can read anyway: a row scrolled under the sticky header
    // is behind a blurred pane, and scoring it would report a failure that does
    // not exist on screen. Whatever is topmost at this point is what is seen.
    const cx = Math.round(r.x + r.width / 2), cy = Math.round(r.y + r.height / 2);
    const top = document.elementFromPoint(cx, cy);
    if (!top || !(top === el || el.contains(top) || top.contains(el))) continue;
    out.push({
      x: cx, y: cy,
      color: cs.color, size: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 600,
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 48),
      text: el.textContent.trim().slice(0, 32),
    });
    el.dataset.a11yHidden = '1';
    el.style.setProperty('color', 'transparent', 'important');
    el.style.setProperty('text-shadow', 'none', 'important');
  }
  // The aurora is a WebGL canvas without a preserved drawing buffer, so a
  // screenshot reads it back as pure black and every glyph over it would score
  // as a failure that nobody can see. Hide it and measure against the page
  // colour underneath instead — the shader is luminance-clamped to within 5%
  // of exactly that colour, so the reading stays honest.
  for (const c of document.querySelectorAll('canvas')) {
    c.dataset.a11yHidden = '1';
    c.style.setProperty('visibility', 'hidden', 'important');
  }
  return out;
})()`;

const restore = `(() => { for (const el of document.querySelectorAll('[data-a11y-hidden]')) { el.style.removeProperty('color'); el.style.removeProperty('text-shadow'); el.style.removeProperty('visibility'); delete el.dataset.a11yHidden; } })()`;

// Pass 2: decode the plate in-page and score every run against its own pixel.
function score({ b64, runs }) {
  return (async () => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const lum = (rgb) => { const [r, gc, b] = rgb.map((v) => { const t = v / 255; return t <= 0.03928 ? t / 12.92 : Math.pow((t + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * gc + 0.0722 * b; };
    const parse = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const scale = img.width / innerWidth;
    const bad = [], all = [], seen = new Set();
    for (const run of runs) {
      const d = g.getImageData(Math.round(run.x * scale), Math.round(run.y * scale), 1, 1).data;
      const bg = [d[0], d[1], d[2]], fg = parse(run.color);
      if (fg.length < 3) continue;
      const l1 = lum(fg), l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const large = run.size >= 24 || (run.size >= 18.66 && run.bold);
      const need = large ? 3 : 4.5;
      all.push({ cls: run.cls, text: run.text, ratio: +ratio.toFixed(2), need, size: run.size, on: 'rgb(' + bg.join(', ') + ')', color: run.color });
      if (ratio >= need) continue;
      const key = run.cls + '|' + run.text.slice(0, 24);
      if (seen.has(key)) continue;
      seen.add(key);
      bad.push({ cls: run.cls, text: run.text, ratio: +ratio.toFixed(2), need, size: run.size, on: 'rgb(' + bg.join(', ') + ')', color: run.color });
    }
    return { bad, all };
  })();
}

const focusProbe = `(() => [...document.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter(e => e.offsetParent !== null).length)()`;

async function audit(url, theme, email, password, routes) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: theme });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate((t) => localStorage.setItem(location.port === '4310' ? 'mm.admin.theme' : 'mm.worker.theme', t), theme);
  await page.reload({ waitUntil: 'networkidle' });
  await page.fill('input[type=email]', email);
  await page.fill('input[type=password]', password);
  await page.click('button[type=submit]');
  await page.waitForTimeout(1700);

  const results = [];
  for (const r of routes) {
    await page.goto(`${url}#${r}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1400);
    const tabStops = await page.evaluate(focusProbe);
    const runs = await page.evaluate(collect);
    await page.waitForTimeout(150);
    const plate = await page.screenshot({ type: 'png' });
    await page.evaluate(restore);
    const scored = await page.evaluate(score, { b64: plate.toString('base64'), runs });
    results.push({ route: r, theme, low: scored.bad, all: scored.all, runs: runs.length, tabStops });
  }
  await ctx.close();
  return results;
}

const routes = ['/', '/tasks', '/equipment', '/rules', '/types', '/history', '/activity'];
const all = [
  ...await audit('http://localhost:4310/', 'dark', 'ana@fieldworks.example', 'admin1234', routes),
  ...await audit('http://localhost:4310/', 'light', 'ana@fieldworks.example', 'admin1234', routes),
  ...await audit('http://localhost:4320/', 'dark', 'tomas@fieldworks.example', 'worker1234', ['/']),
  ...await audit('http://localhost:4320/', 'light', 'tomas@fieldworks.example', 'worker1234', ['/']),
];
await browser.close();

// `--worst` reports the tightest reading per class instead of only the misses,
// which is what the numbers quoted in docs/DESIGN.md are taken from.
if (process.argv.includes('--worst')) {
  for (const theme of ['dark', 'light']) {
    const tightest = new Map();
    for (const r of all.filter((x) => x.theme === theme)) {
      for (const m of r.all) {
        const cur = tightest.get(m.cls);
        if (!cur || m.ratio < cur.ratio) tightest.set(m.cls, m);
      }
    }
    console.log(`\n${theme} — tightest reading per class`);
    for (const m of [...tightest.values()].sort((a2, b2) => a2.ratio - b2.ratio).slice(0, 22)) {
      console.log(`  ${String(m.ratio).padStart(6)} : 1  ${String(m.size) + 'px'}  .${m.cls}  "${m.text}"  on ${m.on}`);
    }
  }
}

let failures = 0, measured = 0;
for (const r of all) {
  measured += r.runs;
  if (!r.low.length) continue;
  failures += r.low.length;
  console.log(`\n${r.theme} ${r.route}  (${r.runs} text runs, ${r.tabStops} tab stops)`);
  for (const l of r.low) console.log(`  ${l.ratio} < ${l.need}  ${l.size}px  .${l.cls}  "${l.text}"  ${l.color} on ${l.on}`);
}
console.log(`\n${measured} text runs measured on composited pixels — ${failures || 'no'} below AA`);
process.exit(failures ? 1 : 0);
