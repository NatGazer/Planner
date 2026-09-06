const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo', locale: 'en-GB' });
  const p = await ctx.newPage();
  await p.goto('http://localhost:4310/');
  await p.fill('input[type=email]', 'ana@fieldworks.example');
  await p.fill('input[type=password]', 'admin1234');
  await p.click('button[type=submit]');
  await p.waitForSelector('.page__title', { timeout: 15000 });

  await p.evaluate(() => { window.location.hash = '#/history?completion=comp_X6lq7uLm2USThZYq'; });
  await p.waitForSelector('.completion-detail__title', { timeout: 15000 });
  await p.waitForTimeout(600);
  const facts = await p.locator('.factlist__item').allTextContents();
  console.log('SHEET facts:'); facts.forEach(f => console.log('   ', f.replace(/\s+/g,' ').trim()));
  // close sheet, find the same record's row
  await p.locator('.sheet__close').click();
  await p.waitForTimeout(800);
  const row = p.locator('.completion-row', { hasText: 'FLT-01' }).first();
  console.log('LIST row  :', (await row.textContent()).replace(/\s+/g,' ').trim());
  await b.close();
})();
