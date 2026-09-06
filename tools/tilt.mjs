import { chromium } from 'playwright';
const OUT = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox','--disable-dev-shm-usage','--use-gl=swiftshader','--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, deviceScaleFactor: 2, colorScheme: 'dark' });
const page = await ctx.newPage();
await page.goto('http://localhost:4310/', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'ana@fieldworks.example');
await page.fill('input[type=password]', 'admin1234');
await page.click('button[type=submit]');
await page.waitForTimeout(2400);

const tile = page.locator('.tile').nth(1);
const box = await tile.boundingBox();
await page.mouse.move(box.x + box.width * 0.86, box.y + box.height * 0.14);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/tilt-corner.png`, clip: { x: box.x - 30, y: box.y - 30, width: box.width + 60, height: box.height + 60 } });

const state = await page.evaluate(() => {
  const el = document.querySelectorAll('.tile')[1];
  const value = el.querySelector('.tile__value');
  return {
    tileTransform: getComputedStyle(el).transform,
    tileStyle3d: getComputedStyle(el).transformStyle,
    valueTranslate: getComputedStyle(value).translate,
    glarePresent: !!el.querySelector('.surface__glare'),
    glareX: getComputedStyle(el.querySelector('.surface__glare')).getPropertyValue('--gx'),
  };
});
await browser.close();
console.log(JSON.stringify(state, null, 1));
