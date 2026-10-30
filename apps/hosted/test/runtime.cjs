const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');

const webRequire = createRequire(path.resolve(__dirname, '../../web/package.json'));
const { chromium } = webRequire('playwright');
const seed = fs.readFileSync(path.resolve(__dirname, '../src/web/demo-seed.json'), 'utf8');
const fake = fs.readFileSync(path.join(__dirname, 'fake-claude.js'), 'utf8');
const hostedUrl = pathToFileURL(path.resolve(__dirname, '../dist/index.html')).href;
const outputDir = path.resolve(__dirname, '../../..', 'test-results/hosted');
fs.mkdirSync(outputDir, { recursive: true });

module.exports = { chromium, seed, fake, hostedUrl, outputDir };
