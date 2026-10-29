// Visual QA helper: sweeps the pointer over the office until a desk hover card appears, then screenshots.
// node scripts/shot-hover.js <url> <out.png> [width] [height] [loginEmail]
const { chromium } = require(require('path').join(__dirname, '../apps/web/node_modules/playwright'));
(async () => {
  const [url, out, w = '1536', h = '1024', email] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: +w, height: +h } })).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  if (email) await page.request.post(new URL(url).origin + '/api/auth/login', { data: { email, password: 'space-demo-2026' }, headers: { 'x-space-csrf': '1' } });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(12000);
  const box = await page.locator('[data-office]').boundingBox();
  let found = false;
  for (let y = box.y + 120; y < box.y + box.height * 0.6 && !found; y += 14) {
    for (let x = box.x + box.width * 0.25; x < box.x + box.width * 0.55 && !found; x += 14) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(30);
      found = await page.getByText('Click to view profile').isVisible().catch(() => false);
    }
  }
  console.log('hover card found:', found);
  await page.waitForTimeout(800);
  await page.screenshot({ path: out, timeout: 180000 });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
