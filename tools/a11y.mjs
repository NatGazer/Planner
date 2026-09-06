import { chromium } from 'playwright';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });

// Relative luminance and contrast, per WCAG.
const probe = `(() => {
  const lum = (rgb) => {
    const [r,g,b] = rgb.map(v => { const c = v/255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); });
    return 0.2126*r + 0.7152*g + 0.0722*b;
  };
  const parse = (s) => (s.match(/[\\d.]+/g) || []).slice(0,3).map(Number);
  const bgOf = (el) => {
    let n = el;
    while (n && n !== document.documentElement) {
      const c = getComputedStyle(n).backgroundColor;
      const p = parse(c);
      const a = (c.match(/[\\d.]+/g) || [])[3];
      if (p.length === 3 && (a === undefined || Number(a) > 0.85)) return p;
      n = n.parentElement;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const out = [];
  const seen = new Set();
  for (const el of document.querySelectorAll('p,span,h1,h2,h3,dd,dt,label,button,a,li,td,th')) {
    if (!el.textContent || !el.textContent.trim()) continue;
    if (el.querySelector('p,span,h1,h2,h3,button,a')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) < 0.35) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const fg = parse(cs.color);
    const bg = bgOf(el);
    if (fg.length < 3 || bg.length < 3) continue;
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
    const size = parseFloat(cs.fontSize);
    const bold = Number(cs.fontWeight) >= 600;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      const key = el.className + '|' + el.textContent.trim().slice(0,26);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ cls: (typeof el.className === 'string' ? el.className : '').slice(0,50), text: el.textContent.trim().slice(0,32), ratio: +ratio.toFixed(2), need, size });
    }
  }
  return out;
})()`;

const focusProbe = `(() => {
  const els = [...document.querySelectorAll('a[href],button:not([disabled]),input,select,textarea,[tabindex]:not([tabindex="-1"])')]
    .filter(e => e.offsetParent !== null);
  return { count: els.length };
})()`;

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
    await page.waitForTimeout(1300);
    const low = await page.evaluate(probe);
    const focus = await page.evaluate(focusProbe);
    if (low.length) results.push({ route: r, theme, low, tabStops: focus.count });
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
for (const r of all) {
  console.log(`\n${r.theme} ${r.route}  (${r.tabStops} tab stops)`);
  for (const l of r.low) console.log(`  ${l.ratio} < ${l.need}  ${l.size}px  .${l.cls}  "${l.text}"`);
}
if (!all.length) console.log('no contrast failures');
