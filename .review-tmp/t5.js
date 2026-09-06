const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:4310/');
  await p.fill('input[type=email]', 'ana@fieldworks.example');
  await p.fill('input[type=password]', 'admin1234');
  await p.click('button[type=submit]');
  await p.waitForSelector('.page__title', { timeout: 15000 });

  // Delay the supporting /api/admin/types + /api/admin/rules calls by 4s
  await p.route('**/api/admin/types**', async r => { await new Promise(s => setTimeout(s, 4000)); await r.continue(); });
  await p.route('**/api/admin/rules**', async r => { await new Promise(s => setTimeout(s, 4000)); await r.continue(); });

  await p.evaluate(() => { window.location.hash = '#/equipment'; });
  await p.waitForSelector('.eq-card', { timeout: 15000 });
  await p.locator('.page__head-actions button', { hasText: 'Add equipment' }).click();
  await p.waitForSelector('.sheet input', { timeout: 5000 });

  const code = p.locator('.sheet .field').filter({ hasText: 'Asset code' }).locator('input');
  const name = p.locator('.sheet .field').filter({ hasText: 'Name' }).first().locator('input');
  await code.fill('HVAC-99');
  await name.fill('My new rooftop unit');
  console.log('typed ->  code:', await code.inputValue(), '| name:', await name.inputValue());
  await p.waitForTimeout(6000); // let the delayed support request land
  console.log('after support request resolved ->  code:', JSON.stringify(await code.inputValue()),
              '| name:', JSON.stringify(await name.inputValue()));
  await b.close();
})();
