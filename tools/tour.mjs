#!/usr/bin/env node
/**
 * Screenshot every screen of both apps, in both themes, at desktop and phone
 * sizes — and fail loudly on any console error or page exception along the
 * way. Run it after a change to see the whole product at once.
 *
 *   node tools/tour.mjs <output-dir>
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const OUT = process.argv[2] || '/tmp/tour';
fs.mkdirSync(OUT, { recursive: true });
const problems = [];

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const ADMIN = { port: 4310, email: 'ana@fieldworks.example', password: 'admin1234', key: 'mm.admin.theme' };
const WORKER = { port: 4320, email: 'tomas@fieldworks.example', password: 'worker1234', key: 'mm.worker.theme' };

async function tour({ app, theme, width, height, mobile, routes, prefix }) {
  const ctx = await browser.newContext({
    viewport: { width, height }, deviceScaleFactor: 2, isMobile: mobile, hasTouch: mobile, colorScheme: theme,
  });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => problems.push(`[${prefix}] uncaught: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('401')) problems.push(`[${prefix}] console: ${m.text()}`);
  });

  await page.goto(`http://localhost:${app.port}/`, { waitUntil: 'networkidle' });
  await page.evaluate(([k, t]) => localStorage.setItem(k, t), [app.key, theme]);
  await page.reload({ waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/${prefix}-signin.png` });

  await page.fill('input[type=email]', app.email);
  await page.fill('input[type=password]', app.password);
  await page.click('button[type=submit]');
  await page.waitForTimeout(2000);

  for (const [route, name] of routes) {
    await page.goto(`http://localhost:${app.port}/#${route}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/${prefix}-${name}.png` });
  }
  await ctx.close();
}

const ADMIN_ROUTES = [['/', 'overview'], ['/tasks', 'tasks'], ['/equipment', 'equipment'],
  ['/rules', 'maintenance'], ['/types', 'types'], ['/history', 'history'], ['/activity', 'activity']];

for (const theme of ['dark', 'light']) {
  await tour({ app: ADMIN, theme, width: 1440, height: 950, mobile: false, routes: ADMIN_ROUTES, prefix: `admin-${theme}` });
  await tour({ app: ADMIN, theme, width: 402, height: 874, mobile: true, routes: ADMIN_ROUTES.slice(0, 3), prefix: `admin-phone-${theme}` });
  await tour({ app: WORKER, theme, width: 402, height: 874, mobile: true, routes: [['/', 'list']], prefix: `worker-${theme}` });
}

await browser.close();
const shots = fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).length;
console.log(`${shots} screenshots in ${OUT}`);
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : 'no console errors or page exceptions');
process.exit(problems.length ? 1 : 0);
