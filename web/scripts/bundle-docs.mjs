// Copy built Astro documentation into the existing Vite publication folder.
// This affects static assets only; signing and settlement logic are untouched.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const docs = resolve(web, '../docs-site/dist');
const output = resolve(web, 'dist/docs');
for (const path of [
  resolve(web, 'dist/index.html'),
  resolve(web, 'dist/app.html'),
  resolve(docs, 'index.html'),
  resolve(docs, 'how-to-test/index.html'),
]) {
  if (!existsSync(path)) throw new Error('Build artifact missing: ' + path);
}
rmSync(output, { recursive: true, force: true });
cpSync(docs, output, { recursive: true });
if (!existsSync(resolve(output, 'index.html'))) throw new Error('Docs copy failed');
console.log('Setlora web and /docs/ are ready in web/dist');
