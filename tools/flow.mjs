import { chromium } from 'playwright';
const OUT = process.argv[2], PHOTO = process.argv[3];
const errors = [];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('401')) errors.push(`console: ${m.text()}`); });

await page.goto('http://localhost:4320/', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'mariana@fieldworks.example');
await page.fill('input[type=password]', 'worker1234');
await page.click('button[type=submit]');
await page.waitForTimeout(1600);

const before = await page.locator('.w-card').count();
const code = await page.locator('.w-card__code').first().innerText();
await page.locator('.w-card').first().click();
await page.waitForTimeout(900);

await page.locator('.w-check').click();
await page.setInputFiles('input[type=file][accept="image/*"]:not([capture])', PHOTO);
await page.waitForTimeout(1600);
await page.screenshot({ path: `${OUT}/flow-01-photo.png` });

await page.fill('textarea', 'Verified all four pull-cords. Station 3 cord needed re-tensioning.');
await page.waitForTimeout(300);
await page.locator('.w-submitbar .btn').click();
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/flow-02-success.png` });

const successText = await page.locator('.w-success__panel').innerText().catch(() => 'NO SUCCESS PANEL');
await page.waitForTimeout(3600);
await page.screenshot({ path: `${OUT}/flow-03-back.png` });
const after = await page.locator('.w-card').count();

await browser.close();
console.log(JSON.stringify({ code, before, after, success: successText.replace(/\n/g, ' | '), errors }, null, 1));
