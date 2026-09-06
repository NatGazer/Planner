const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto('http://localhost:4310/');
  await p.fill('input[type=email]', 'ana@fieldworks.example');
  await p.fill('input[type=password]', 'admin1234');
  await p.click('button[type=submit]');
  await p.waitForSelector('.page__title', { timeout: 15000 });

  // Navigate to /rules?new=1 exactly as EquipmentDetail's button does
  await p.evaluate(() => { window.location.hash = '#/rules?new=1'; });
  await p.waitForTimeout(1500);
  const openBefore = await p.locator('.sheet__title').count();
  const title1 = await p.locator('.sheet__title').first().textContent().catch(()=>null);
  console.log('sheet open after arriving with ?new=1:', openBefore, JSON.stringify(title1));

  // Press Cancel
  await p.locator('.sheet__footer button', { hasText: 'Cancel' }).click();
  await p.waitForTimeout(1500);
  const openAfter = await p.locator('.sheet__title').count();
  const hash = await p.evaluate(() => window.location.hash);
  console.log('sheet open after Cancel:', openAfter, 'hash now:', hash);
  console.log('errors:', errs);
  await b.close();
})();
