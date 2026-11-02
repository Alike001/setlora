import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../src/content/docs/', import.meta.url).pathname;
const paths = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.mdx')) paths.push(p);
  }
}
walk(root);
if (paths.length < 8) throw new Error('Missing expected guide pages');
const links = new Set();
for (const file of paths) {
  const content = readFileSync(file, 'utf8');
  if (!content.startsWith('---\n') || !/^title: /m.test(content) || !/^description: /m.test(content)) {
    throw new Error(`Missing MDX frontmatter: ${file}`);
  }
  for (const match of content.matchAll(/\]\(\/docs\/([^)]*)\)/g)) links.add(match[1].replace(/\/$/, ''));
}
for (const slug of links) {
  if (!slug) continue;
  if (!paths.some(p => p.endsWith(`/${slug}.mdx`) || p.endsWith(`/${slug}/index.mdx`))) {
    throw new Error(`Broken internal docs slug: ${slug}`);
  }
}
console.log(`Checked ${paths.length} MDX pages and ${links.size} internal docs links.`);
