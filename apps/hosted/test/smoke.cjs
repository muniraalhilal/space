// Drives the hosted build locally with the fake runtime: node test/smoke.cjs [outPrefix]
const { chromium, seed: seedText, fake, hostedUrl, outputDir } = require('./runtime.cjs');
const path = require('node:path');
const out = process.argv[2] || path.join(outputDir, 'smoke');
(async () => {
  const seed = seedText;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1536, height: 1000 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push('console: ' + m.text().slice(0, 300)));
  await page.addInitScript(`window.__SPACE_SEED__ = ${seed};\n${fake}`);
  await page.goto(hostedUrl + '?still=1');
  await page.getByText('Who are you in this Space?').waitFor({ timeout: 30000 });
  await page.screenshot({ path: out + '_welcome.png' });
  await page.getByRole('button', { name: /Munira Alhilal/ }).first().click();
  try {
    await page.getByText('Team Presence').waitFor({ timeout: 40000 });
  } catch (e) {
    await page.screenshot({ path: out + '_fail.png' });
    console.log('FAILED waiting; errors:\n' + errors.join('\n'));
    await browser.close();
    process.exit(1);
  }
  await page.waitForTimeout(8000);
  await page.screenshot({ path: out + '_home.png' });
  console.log('errors:', errors.length ? errors.slice(0, 10).join('\n') : 'none');
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
