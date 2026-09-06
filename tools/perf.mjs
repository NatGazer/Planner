import { chromium } from 'playwright';
import fs from 'node:fs';
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, colorScheme: 'dark' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
const THROTTLE = Number(process.argv[3] || 4);
const HIDE_SHADER = process.argv[4] === 'no-shader';
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

await page.goto('http://localhost:4310/', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'ana@fieldworks.example');
await page.fill('input[type=password]', 'admin1234');
await page.click('button[type=submit]');
await page.waitForTimeout(2600);
if (HIDE_SHADER) await page.evaluate(() => { const c = document.querySelector('canvas.aurora-field'); if (c) c.style.display = 'none'; });

async function measure(label, action) {
  const marks = await page.evaluate(() => {
    window.__frames = [];
    window.__stop = false;
    let last = performance.now();
    const tick = (t) => { window.__frames.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    return true;
  });
  void marks;
  await cdp.send('Performance.enable');
  const before = await cdp.send('Performance.getMetrics');
  await action();
  const after = await cdp.send('Performance.getMetrics');
  const frames = await page.evaluate(() => { window.__stop = true; return window.__frames; });
  const val = (m, k) => m.metrics.find((x) => x.name === k)?.value ?? 0;
  const layoutMs = (val(after, 'LayoutDuration') - val(before, 'LayoutDuration')) * 1000;
  const recalcMs = (val(after, 'RecalcStyleDuration') - val(before, 'RecalcStyleDuration')) * 1000;
  const scriptMs = (val(after, 'ScriptDuration') - val(before, 'ScriptDuration')) * 1000;
  const layoutCount = val(after, 'LayoutCount') - val(before, 'LayoutCount');
  const sorted = [...frames].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const long = frames.filter((f) => f > 34).length;
  return {
    label,
    frames: frames.length,
    medianMs: +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(1),
    p95Ms: +p95.toFixed(1),
    framesOver34ms: long,
    layoutCount,
    layoutMs: +layoutMs.toFixed(1),
    recalcStyleMs: +recalcMs.toFixed(1),
    scriptMs: +scriptMs.toFixed(1),
  };
}

const results = [];

results.push(await measure('pointer sweep across the whole dashboard (4x CPU throttle)', async () => {
  for (let i = 0; i <= 24; i += 1) {
    await page.mouse.move(420 + i * 40, 300 + Math.sin(i / 3) * 220);
    await page.waitForTimeout(28);
  }
}));

await page.goto('http://localhost:4310/#/tasks', { waitUntil: 'networkidle' });
await page.waitForTimeout(2200);
results.push(await measure('fling the 58-row outstanding list (4x CPU throttle)', async () => {
  for (let i = 0; i < 22; i += 1) {
    await page.mouse.wheel(0, 260);
    await page.waitForTimeout(28);
  }
}));

results.push(await measure('switch due-status tabs five times', async () => {
  const tabs = page.locator('.filterbar .segmented__option');
  const n = await tabs.count();
  for (let i = 0; i < Math.min(n, 5); i += 1) {
    await tabs.nth(i).click();
    await page.waitForTimeout(380);
  }
}));

await browser.close();
fs.writeFileSync(`${OUT}/perf.json`, JSON.stringify(results, null, 2));
for (const r of results) console.log(`throttle=${THROTTLE}${HIDE_SHADER ? ' no-shader' : ''} ` + JSON.stringify(r));
