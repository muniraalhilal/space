// Turns Vite's single-file build into Artifact page content: the publish step adds the
// doctype/html/head/body skeleton, so the file carries only <title>, styles, markup and script.
import fs from 'node:fs';
const html = fs.readFileSync('dist/index.html', 'utf8');
const title = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '<title>Space</title>';
const styles = [...html.matchAll(/<style[^>]*>[\s\S]*?<\/style>/g)].map((m) => m[0]).join('\n');
const scripts = [...html.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
const body = html.match(/<body[^>]*>([\s\S]*)<\/body>/)?.[1].replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').trim() ?? '';
const out = [title, '<meta name="claude:viewport-fit-sides" content="cover">', styles, body, ...scripts].join('\n');
fs.mkdirSync('../../.artifact', { recursive: true });
fs.writeFileSync('../../.artifact/space.html', out);
console.log(`wrote .artifact/space.html (${(out.length / 1024 / 1024).toFixed(2)} MB)`);
