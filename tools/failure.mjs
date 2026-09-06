import { chromium } from 'playwright';
const OUT = process.argv[2], PHOTO = process.argv[3];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

await page.goto('http://localhost:4320/', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'kwame@fieldworks.example');
await page.fill('input[type=password]', 'worker1234');
await page.click('button[type=submit]');
await page.waitForTimeout(1700);

const code = await page.locator('.w-card__code').first().innerText();
await page.locator('.w-card').first().click();
await page.waitForTimeout(900);
await page.locator('.w-check').click();
await page.setInputFiles('input[type=file][accept="image/*"]:not([capture])', PHOTO);
await page.waitForTimeout(1500);
await page.fill('textarea', 'This note must survive the failure.');

// Now cut the wire, exactly as a warehouse dead spot would.
await page.route('**/complete', (route) => route.abort('connectionfailed'));
await page.locator('.w-submitbar .btn').click();
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/fail-01.png` });

const state = await page.evaluate(() => ({
  error: document.querySelector('.w-failure')?.textContent?.trim() ?? null,
  stillChecked: !!document.querySelector('.w-check.is-checked'),
  photoStillThere: !!document.querySelector('.capture__preview img'),
  comment: document.querySelector('textarea')?.value ?? '',
  buttonLabel: document.querySelector('.w-submitbar .btn')?.textContent?.trim() ?? '',
  onDetailStill: !!document.querySelector('.w-hero'),
}));

// Restore the connection and retry — the same photo and note must still work.
await page.unroute('**/complete');
await page.locator('.w-submitbar .btn').click();
await page.waitForTimeout(1800);
const recovered = await page.evaluate(() => document.querySelector('.w-success__panel')?.textContent?.replace(/\n/g, ' | ') ?? 'NO SUCCESS');
await page.screenshot({ path: `${OUT}/fail-02-recovered.png` });

await browser.close();
console.log(JSON.stringify({ code, ...state, recovered, errs }, null, 1));
