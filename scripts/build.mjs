// Bundles src/ into one self-contained page: dist/index.html.
// No dependencies: modules are joined in import order with their import lines removed and
// their `export` keywords dropped, so every top-level name must be unique across src/.
// Usage: node scripts/build.mjs [--fragment path]   (a fragment has no <html>/<head>/<body> wrapper)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const ENTRY = join(SRC, 'ui', 'main.js');
const IMPORT_RE = /^import\s[\s\S]*?\sfrom\s+'([^']+)';\s*$/gm;
const FONTS = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600;700&family=Graduate&display=swap';

async function collect(file, seen, order) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = await readFile(file, 'utf8');
  for (const m of code.matchAll(IMPORT_RE)) await collect(resolve(dirname(file), m[1]), seen, order);
  order.push({ file, code });
}

function strip({ file, code }) {
  const body = code
    .replace(IMPORT_RE, '')
    .replace(/^export\s+(?=(const|let|function|class|async)\b)/gm, '');
  if (/^export\b/m.test(body)) throw new Error(`${relative(ROOT, file)} has an export form the bundler does not support.`);
  return `// ---- ${relative(SRC, file)}\n${body}`;
}

function checkNames(mods) {
  const seen = new Map();
  for (const { file, code } of mods) {
    for (const m of code.matchAll(/^(?:export\s+)?(?:const|let|var|function|class|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
      const name = m[1];
      if (seen.has(name)) throw new Error(`Top-level name "${name}" is in both ${seen.get(name)} and ${relative(ROOT, file)}.`);
      seen.set(name, relative(ROOT, file));
    }
  }
}

const order = [];
await collect(ENTRY, new Set(), order);
checkNames(order);
const js = order.map(strip).join('\n').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
const css = await readFile(join(SRC, 'styles.css'), 'utf8');

const head = `<title>Pocket Gridiron</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<style>
${css}
</style>`;
const bodyHtml = `<div id="app"></div>
<script type="module">
${js}
</script>`;

const full = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
${head}
</head>
<body>
${bodyHtml}
</body>
</html>
`;
await mkdir(join(ROOT, 'dist'), { recursive: true });
await writeFile(join(ROOT, 'dist', 'index.html'), full);
const fragIdx = process.argv.indexOf('--fragment');
if (fragIdx > 0) await writeFile(resolve(process.argv[fragIdx + 1]), `${head}\n${bodyHtml}\n`);
console.log(`Bundled ${order.length} modules into dist/index.html (${(full.length / 1024).toFixed(0)} KB).`);
