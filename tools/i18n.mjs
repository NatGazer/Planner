/**
 * Two checks that keep three languages honest.
 *
 * 1. **Static.** Walk the source and find user-visible text that is still a
 *    literal — JSX text, and the props that carry words (label, placeholder,
 *    aria-label…). A string that never reaches `t()` can never be translated,
 *    and nothing at runtime will tell you: it just quietly shows English.
 *
 * 2. **Layout.** Load every screen in every language, at phone and desktop
 *    width, and measure what overflows. Portuguese and French run 15–30%
 *    longer than English, so a header that fits in English is not evidence
 *    that anything fits. This reports the page scrolling sideways, and any
 *    element whose own content is cut off inside it.
 *
 * Usage: node tools/i18n.mjs            (servers on :4310 / :4320)
 *        node tools/i18n.mjs --static   (no browser needed)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/* ============================================================ static pass === */

const ROOTS = ['apps/admin/src', 'apps/worker/src', 'packages/ui/src'];

/** Props whose value is read by a person. */
const TEXT_PROPS = new Set([
  'label', 'placeholder', 'title', 'subtitle', 'hint', 'body', 'message', 'alt',
  'aria-label', 'ariaLabel', 'confirmLabel', 'cancelLabel', 'emptyLabel', 'legend',
  'summary', 'description', 'caption', 'note', 'error', 'helper',
]);

/** Values that are legitimately literal: product names, and non-word tokens. */
const ALLOWED = new Set(['Maintenance', 'Control', 'Maintenance Control', 'Maintenance CONTROL']);

const files = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(entry)) files.push(p);
  }
};
ROOTS.forEach(walk);

const looksLikeSentence = (s) => /[A-Za-z]{2,}/.test(s) && !/^[A-Z_]+$/.test(s);

const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));

const staticFindings = [];
for (const file of files) {
  // Dictionaries and the i18n engine are where the English lives on purpose.
  if (/lib\/strings\//.test(file) || /lib\/i18n\.tsx$/.test(file)) continue;
  // Only .tsx can contain JSX. Scanning .ts finds nothing but generics.
  if (!file.endsWith('.tsx')) continue;
  const raw = readFileSync(file, 'utf8');
  const src = stripComments(raw);
  const lineOf = (index) => src.slice(0, index).split('\n').length;

  // Props carrying words, given a plain string literal.
  const propRe = /(\b[a-zA-Z-]+)=(["'])([^"'\n]{2,})\2/g;
  for (let m = propRe.exec(src); m; m = propRe.exec(src)) {
    const [, prop, , value] = m;
    if (!TEXT_PROPS.has(prop)) continue;
    if (ALLOWED.has(value) || !looksLikeSentence(value)) continue;
    staticFindings.push({ file, line: lineOf(m.index), kind: `${prop}=`, text: value });
  }

  // JSX text nodes: '>' then words then '<', with no braces between.
  // Single line, and no code punctuation: this must not match the tail of a
  // generic like useState<IntervalUnit>('months'), which is not JSX at all.
  // Nor may the opening '>' be the tail of an arrow: '=> Promise<void>' would
  // otherwise read as the JSX text "Promise".
  const textRe = /([^=\-])>([^<>{}();=\n]*[A-Za-z]{2,}[^<>{}();=\n]*)</g;
  for (let m = textRe.exec(src); m; m = textRe.exec(src)) {
    const value = m[2].trim();
    if (!value || ALLOWED.has(value) || !looksLikeSentence(value)) continue;
    // A <code> sample is a literal credential or command, shown as data.
    if (/<code>\s*$/.test(src.slice(0, m.index + m[1].length + 1))) continue;
    // A ternary caught between a self-closing tag and the next element:
    // ': icon ?' is JavaScript, not something anybody reads.
    if (/^[:?]/.test(value) || /\s\?\s/.test(value)) continue;
    // An address or a token is not prose, wherever it appears.
    if (/^\S+@\S+$/.test(value) || /^[a-z]+\d+$/.test(value)) continue;
    // Single lowercase words inside a tag are usually a type name or a unit
    // rendered from data; anything with a space is prose.
    if (!/\s/.test(value) && /^[a-z]+$/.test(value)) continue;
    staticFindings.push({ file, line: lineOf(m.index), kind: 'JSX text', text: value });
  }
}

console.log(`static: ${files.length} source files scanned`);
if (staticFindings.length) {
  for (const f of staticFindings.slice(0, 60)) {
    console.log(`  ${f.file}:${f.line}  ${f.kind}  "${f.text.slice(0, 70)}"`);
  }
  if (staticFindings.length > 60) console.log(`  …and ${staticFindings.length - 60} more`);
}
console.log(`static: ${staticFindings.length || 'no'} literal strings left unkeyed\n`);

if (process.argv.includes('--static')) process.exit(staticFindings.length ? 1 : 0);

/* ============================================================ layout pass === */

const { chromium } = await import('playwright');

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});

/**
 * What counts as broken:
 *   • the page itself scrolls sideways — always a bug, at any width;
 *   • an element's own content is wider than its box, and it is not a
 *     container that was built to scroll (a chart rail, a filter row).
 * Deliberate one-line truncation with an ellipsis is fine and is skipped:
 * a long asset name is data, and cutting it is the design.
 */
const overflowProbe = `(() => {
  const out = [];
  const doc = document.documentElement;
  if (doc.scrollWidth > window.innerWidth + 1) {
    out.push({ kind: 'page', cls: 'html', text: '', by: doc.scrollWidth - window.innerWidth });
  }
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    if (cs.textOverflow === 'ellipsis') continue;
    const by = el.scrollWidth - el.clientWidth;
    if (by <= 1 || el.clientWidth === 0) continue;
    // A parent that merely contains a scrollable child is not itself broken.
    if ([...el.children].some((c) => {
      const s = getComputedStyle(c);
      return s.overflowX === 'auto' || s.overflowX === 'scroll';
    })) continue;
    out.push({
      kind: 'element',
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 40) || el.tagName.toLowerCase(),
      text: (el.textContent || '').trim().slice(0, 44),
      by,
    });
  }
  const seen = new Set();
  return out.filter((o) => {
    const key = o.kind + '|' + o.cls + '|' + o.text;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
})()`;

const VIEWPORTS = [
  { name: 'phone', width: 402, height: 874, mobile: true },
  { name: 'desktop', width: 1440, height: 950, mobile: false },
];

const APPS = [
  {
    name: 'admin', url: 'http://localhost:4310/', storage: 'mm.admin.lang',
    email: 'ana@fieldworks.example', password: 'admin1234',
    routes: ['/', '/tasks', '/equipment', '/rules', '/types', '/history', '/activity'],
  },
  {
    name: 'worker', url: 'http://localhost:4320/', storage: 'mm.worker.lang',
    email: 'tomas@fieldworks.example', password: 'worker1234',
    routes: ['/'],
  },
];

let broken = 0;
let screens = 0;

for (const app of APPS) {
  for (const lang of ['en', 'pt', 'fr']) {
    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.mobile ? 2 : 1,
        isMobile: vp.mobile,
        hasTouch: vp.mobile,
        colorScheme: 'dark',
      });
      const page = await ctx.newPage();
      await page.goto(app.url, { waitUntil: 'networkidle' });
      await page.evaluate(([key, value]) => localStorage.setItem(key, value), [app.storage, lang]);
      await page.reload({ waitUntil: 'networkidle' });
      await page.fill('input[type=email]', app.email);
      await page.fill('input[type=password]', app.password);
      await page.click('button[type=submit]');
      await page.waitForTimeout(1800);

      for (const route of app.routes) {
        await page.goto(`${app.url}#${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1200);
        screens += 1;
        const found = await page.evaluate(overflowProbe);
        if (!found.length) continue;
        broken += found.length;
        console.log(`${app.name} ${lang} ${vp.name} ${route}`);
        for (const f of found) {
          console.log(`  +${f.by}px  ${f.kind}  .${f.cls}  "${f.text}"`);
        }
      }
      await ctx.close();
    }
  }
}

await browser.close();
console.log(`\nlayout: ${screens} screens measured in 3 languages at 2 widths — ${broken || 'no'} overflowing`);
process.exit(staticFindings.length || broken ? 1 : 0);
