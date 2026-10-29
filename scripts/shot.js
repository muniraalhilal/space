// Visual QA helper: node scripts/shot.js <url> <out.png> [width] [height] [waitMs] [loginEmail]
const { chromium } = require(require('path').join(__dirname, '../apps/web/node_modules/playwright'));
(async () => {
  const [url, out, w = '1440', h = '900', wait = '6000', email] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) console.log('[console]', m.type(), m.text().slice(0, 300)); });
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 400)));
  if (email) {
    const base = new URL(url).origin;
    const r = await page.request.post(base + '/api/auth/login', { data: { email, password: 'space-demo-2026' }, headers: { 'x-space-csrf': '1' } });
    if (!r.ok()) console.log('login failed', r.status());
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(+wait);
  await page.screenshot({ path: out, timeout: 180000 });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
