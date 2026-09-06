const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:4310/');
  await p.fill('input[type=email]', 'ana@fieldworks.example');
  await p.fill('input[type=password]', 'admin1234');
  await p.click('button[type=submit]');
  await p.waitForSelector('.page__title', { timeout: 15000 });

  // CONTROL: open via the page's own "New maintenance task" button
  await p.evaluate(() => { window.location.hash = '#/rules'; });
  await p.waitForTimeout(1200);
  await p.locator('.page__head-actions button', { hasText: 'New maintenance task' }).click();
  await p.waitForTimeout(800);
  console.log('control: sheet visible after open =', await p.locator('.sheet').isVisible());
  await p.locator('.sheet__footer button', { hasText: 'Cancel' }).click();
  await p.waitForTimeout(1200);
  console.log('control: sheet present after Cancel =', await p.locator('.sheet').count());

  // BUG: arrive with ?new=1
  await p.evaluate(() => { window.location.hash = '#/rules?new=1'; });
  await p.waitForTimeout(1200);
  console.log('bug: sheet visible after arriving =', await p.locator('.sheet').isVisible());
  await p.locator('.sheet__footer button', { hasText: 'Cancel' }).click();
  await p.waitForTimeout(2500);
  console.log('bug: sheet present after Cancel =', await p.locator('.sheet').count(),
              'visible =', await p.locator('.sheet').isVisible().catch(()=>false),
              'hash =', await p.evaluate(() => location.hash));
  // Try Cancel again
  await p.locator('.sheet__footer button', { hasText: 'Cancel' }).click();
  await p.waitForTimeout(1200);
  console.log('bug: after a 2nd Cancel =', await p.locator('.sheet').count());
  await b.close();
})();
