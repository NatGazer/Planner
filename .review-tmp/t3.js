const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('http://localhost:4310/');
  await p.fill('input[type=email]', 'ana@fieldworks.example');
  await p.fill('input[type=password]', 'admin1234');
  await p.click('button[type=submit]');
  await p.waitForSelector('.page__title', { timeout: 15000 });
  await p.evaluate(() => { window.location.hash = '#/tasks'; });
  await p.waitForSelector('.task-row', { timeout: 15000 });
  await p.waitForTimeout(800);

  const rows = p.locator('.task-row');
  const n = await rows.count();
  console.log('task rows:', n);

  // Open reschedule for the FIRST task
  await rows.nth(0).locator('.task-row__action').click();
  await p.waitForTimeout(700);
  const sub1 = await p.locator('.sheet__subtitle').textContent();
  const cur1 = await p.locator('.reschedule__current').textContent();
  const val1 = await p.locator('.sheet input[type=date]').inputValue();
  console.log('TASK A  subtitle:', sub1.trim(), '| date input:', val1, '|', cur1.replace(/\s+/g,' ').trim());

  // Pick the "In a month" shortcut, then CANCEL
  await p.locator('.reschedule__shortcuts button', { hasText: 'In a month' }).click();
  await p.waitForTimeout(300);
  const picked = await p.locator('.sheet input[type=date]').inputValue();
  console.log('TASK A  picked "In a month" ->', picked);
  await p.locator('.sheet__footer button', { hasText: 'Cancel' }).click();
  await p.waitForTimeout(900);

  // Open reschedule for a DIFFERENT task
  let idx = 1;
  await rows.nth(idx).locator('.task-row__action').click();
  await p.waitForTimeout(700);
  const sub2 = await p.locator('.sheet__subtitle').textContent();
  const cur2 = await p.locator('.reschedule__current').textContent();
  const val2 = await p.locator('.sheet input[type=date]').inputValue();
  const btn = p.locator('.sheet__footer button', { hasText: 'Move this occurrence' });
  console.log('TASK B  subtitle:', sub2.trim(), '| date input:', val2, '|', cur2.replace(/\s+/g,' ').trim());
  console.log('TASK B  submit button disabled?', await btn.isDisabled());
  console.log('LEAKED?', val2 === picked ? 'YES - shows task A\'s chosen date' : 'no');
  await b.close();
})();
