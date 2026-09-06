/**
 * Three interaction bugs that unit tests cannot see, each verified in a real
 * browser against the real servers. They are here because every one of them
 * was found by using the app, not by reading it — and a rebuild could bring
 * any of them back without a single test failing.
 *
 *   1. A deep-linked sheet must close when it is dismissed, and stay closed.
 *   2. A dialog reused for many rows must not carry one row's answers to the
 *      next one — a pre-filled date that moves the wrong occurrence.
 *   3. A form must not lose what somebody typed when a background fetch lands.
 *
 * Usage: node tools/regress.mjs      (servers on :4310 / :4320)
 */
import { chromium } from 'playwright';

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

const results = [];
const check = (name, pass, detail) => { results.push({ name, pass, detail }); };

async function signedIn(context) {
  const page = await context.newPage();
  await page.goto('http://localhost:4310/', { waitUntil: 'networkidle' });
  await page.fill('input[type=email]', 'ana@fieldworks.example');
  await page.fill('input[type=password]', 'admin1234');
  await page.click('button[type=submit]');
  await page.waitForTimeout(1800);
  return page;
}

// 1 — the deep-linked "new maintenance task" sheet, dismissed three ways.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await signedIn(ctx);
  for (const [how, dismiss] of [
    ['Escape', async () => page.keyboard.press('Escape')],
    ['Cancel', async () => page.locator('.sheet__footer .btn', { hasText: 'Cancel' }).click()],
    ['scrim', async () => page.locator('.sheet-scrim').click({ position: { x: 20, y: 20 } })],
  ]) {
    await page.goto('http://localhost:4310/#/rules?new=1', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1300);
    const opened = await page.locator('.sheet').count();
    await dismiss();
    await page.waitForTimeout(1100);
    const left = await page.locator('.sheet').count();
    check(`deep-linked sheet closes on ${how}`, opened === 1 && left === 0, `opened=${opened} after=${left}`);
  }
  await ctx.close();
}

// 2 — the reschedule dialog must start blank for every task it is opened on.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await signedIn(ctx);
  await page.goto('http://localhost:4310/#/tasks', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const openRow = async (n) => {
    await page.locator('.task-row__action').nth(n).click();
    await page.waitForTimeout(900);
  };
  await openRow(1);
  const secondRowDate = await page.locator('.sheet input[type=date]').inputValue();
  await page.locator('.reschedule__shortcuts .chip', { hasText: 'In a month' }).click();
  await page.locator('.sheet textarea').fill('Contractor unavailable');
  await page.waitForTimeout(200);
  const picked = await page.locator('.sheet input[type=date]').inputValue();
  await page.locator('.sheet__footer .btn', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(900);

  await openRow(0);
  const firstRowDate = await page.locator('.sheet input[type=date]').inputValue();
  const carriedReason = await page.locator('.sheet textarea').inputValue();
  // Not "different from the other row": two tasks may honestly fall due on the
  // same day. What must never happen is the *picked* date following you over,
  // and the tell is the submit button being live on a form nobody has touched.
  const moveDisabled = await page.locator('.sheet__footer .btn').last().isDisabled();
  check('reschedule dialog shows the task it was opened on', firstRowDate !== picked,
    `picked=${picked} now=${firstRowDate} (other row was ${secondRowDate})`);
  check('reschedule dialog opens with nothing to submit', moveDisabled,
    `the move button was live on an untouched form`);
  check('reschedule dialog carries no reason across tasks', carriedReason === '', `reason="${carriedReason}"`);
  await ctx.close();
}

// 3 — typing into a form while its supporting fetch is still in flight.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } });
  const page = await signedIn(ctx);
  // Hold the supporting lists back so the sheet opens before they land.
  await page.route('**/api/admin/types**', async (route) => {
    await new Promise((r) => setTimeout(r, 2500));
    await route.continue();
  });
  await page.goto('http://localhost:4310/#/equipment', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await page.locator('.page__head .btn', { hasText: 'Add equipment' }).click();
  await page.waitForTimeout(500);
  await page.locator('.sheet input').first().fill('TYPED-WHILE-LOADING');
  await page.waitForTimeout(3500);          // the fetch lands here
  const survived = await page.locator('.sheet input').first().inputValue();
  check('a form keeps what was typed when its lists arrive', survived === 'TYPED-WHILE-LOADING', `value="${survived}"`);
  await ctx.close();
}

await browser.close();

let failed = 0;
for (const r of results) {
  if (!r.pass) failed += 1;
  console.log(`${r.pass ? 'ok  ' : 'FAIL'}  ${r.name}${r.pass ? '' : `  — ${r.detail}`}`);
}
console.log(`\n${results.length} interaction checks — ${failed || 'none'} failing`);
process.exit(failed ? 1 : 0);
