import { chromium } from 'playwright';
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto('http://localhost:4510/', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'ana@fieldworks.example');
await page.fill('input[type=password]', 'admin1234');
const t0 = Date.now();
await page.click('button[type=submit]');
await page.waitForSelector('.tile__value', { timeout: 20000 });
const dashMs = Date.now() - t0;
await page.waitForTimeout(2000);
await page.screenshot({ path: `${OUT}/big-dash.png` });

const t1 = Date.now();
await page.goto('http://localhost:4510/#/tasks', { waitUntil: 'networkidle' });
await page.waitForSelector('.task-row', { timeout: 30000 });
const listMs = Date.now() - t1;
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/big-tasks.png` });
const info = await page.evaluate(() => ({
  rows: document.querySelectorAll('.task-row').length,
  notice: document.querySelector('.note-strip')?.textContent?.replace(/\s+/g, ' ').trim() ?? null,
  lede: document.querySelector('.page__lede')?.textContent?.trim() ?? null,
}));
await browser.close();
console.log(JSON.stringify({ dashMs, listMs, ...info, errs }, null, 1));
