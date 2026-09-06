const { chromium } = require('playwright');
const PHOTO = '/home/user/Planner/.review-tmp/photo.jpg';

async function signIn(ctx) {
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  p._errs = errs;
  await p.goto('http://localhost:4320/');
  await p.fill('input[type=email]', 'tomas@fieldworks.example');
  await p.fill('input[type=password]', 'worker1234');
  await p.click('button[type=submit]');
  await p.waitForSelector('.w-card', { timeout: 20000 });
  return p;
}

(async () => {
  const b = await chromium.launch();
  const p1 = await signIn(await b.newContext());
  const p2 = await signIn(await b.newContext());

  const href = await p1.locator('.w-card').first().evaluate(() => null).catch(()=>null);
  await p1.locator('.w-card').first().click();
  await p1.waitForSelector('.w-hero__title', { timeout: 15000 });
  const taskHash = await p1.evaluate(() => location.hash);
  console.log('task:', taskHash, '|', await p1.locator('.w-hero__title').textContent());

  // --- keyboard: can the "Maintenance completed" checkbox be operated? ---
  await p1.locator('.w-check').focus();
  const focused = await p1.evaluate(() => document.activeElement?.className);
  await p1.keyboard.press('Space');
  await p1.waitForTimeout(300);
  console.log('checkbox focusable:', focused, '| aria-checked after Space:',
    await p1.locator('.w-check').getAttribute('aria-checked'));

  // --- submit button state before photo ---
  const btn = p1.locator('.w-submitbar button');
  console.log('button label with no photo:', (await btn.textContent()).trim());
  console.log('aria-describedby target present?',
    await p1.locator('#submit-state').count());

  await p1.setInputFiles('input[type=file][capture]', PHOTO);
  await p1.waitForSelector('.capture__preview', { timeout: 15000 });
  console.log('button label with photo:', (await btn.textContent()).trim());
  console.log('aria-describedby="submit-state" now resolves to', await p1.locator('#submit-state').count(), 'element(s)');

  // --- second worker prepares the same task ---
  await p2.evaluate(h => { location.hash = h; }, taskHash);
  await p2.waitForSelector('.w-hero__title', { timeout: 15000 });
  await p2.locator('.w-check').click();
  await p2.setInputFiles('input[type=file][capture]', PHOTO);
  await p2.waitForSelector('.capture__preview', { timeout: 15000 });

  // --- worker 1 submits ---
  await btn.click();
  await p1.waitForSelector('.w-success', { timeout: 20000 });
  console.log('worker1 success panel:', (await p1.locator('.w-success__panel').textContent()).replace(/\s+/g,' ').trim().slice(0,140));

  // --- worker 2 submits the same task ---
  await p2.locator('.w-submitbar button').click();
  await p2.waitForTimeout(2500);
  console.log('worker2 failure text:', await p2.locator('.w-failure').count() ? (await p2.locator('.w-failure').textContent()).trim() : '(none)');
  console.log('worker2 toast:', await p2.locator('.toast').count() ? (await p2.locator('.toast').textContent()).replace(/\s+/g,' ').trim() : '(none)');
  await p2.waitForTimeout(1500);
  console.log('worker2 hash after:', await p2.evaluate(() => location.hash));
  console.log('p1 errors:', p1._errs, 'p2 errors:', p2._errs);
  await b.close();
})();
