// Clicks through every main screen of the hosted build and reports page errors.
const { chromium, seed: seedText, fake, hostedUrl, outputDir } = require('./runtime.cjs');
const path = require('node:path');
(async () => {
  const seed = seedText;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  await page.addInitScript(`window.__SPACE_SEED__ = ${seed};\n${fake}`);
  await page.goto(hostedUrl + '?still=1&quality=low');
  await page.getByRole('button', { name: /Munira Alhilal/ }).first().click();
  await page.getByText('Team Presence').waitFor({ timeout: 60000 });
  for (const name of ['My Tasks', 'Projects', 'Requests', 'Calendar', 'Messages', 'Team', 'AI Agents', 'Files', 'Reports', 'Settings']) {
    const before = errors.length;
    await page.locator('nav[aria-label=Main] a', { hasText: name }).first().click();
    await page.waitForTimeout(1500);
    const text = await page.locator('main').innerText().catch(() => '');
    const shot = path.join(outputDir, `walk_${name.replace(/\s+/g, '_')}.png`);
    await page.screenshot({ path: shot });
    console.log(`${name}: ${errors.length > before ? 'ERRORS ' + errors.slice(before).join(' | ') : 'ok'} — ${text.replace(/\s+/g, ' ').slice(0, 90)}`);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
