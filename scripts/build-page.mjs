// Builds hooks/page-template.html: the viewer (docs/) inlined into one file with a data marker.
// The hook splices log data in at the marker line. Run: node scripts/build-page.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(root + p, 'utf8').replace(/\r\n/g, '\n');
const MARKER = '<!--AI-USE-LOG-DATA-->';

const stripModule = (js) => js
  .split('\n')
  .filter((l) => !/^\s*import\b/.test(l))
  .map((l) => l.replace(/^(\s*)export\s+/, '$1'))
  .join('\n');

let html = read('docs/index.html');
const swap = (from, to) => {
  if (!html.includes(from)) throw new Error('build-page: expected text not found: ' + from);
  html = html.replace(from, () => to);
};

swap('<link rel="stylesheet" href="viewer.css">', '<style>\n' + read('docs/viewer.css').trimEnd() + '\n</style>');
swap('<title>AI Use Log Viewer</title>', '<title>AI Use Log</title>');
swap('<h1>AI Use Log Viewer</h1>', '<h1>AI Use Log</h1>\n    <p id="embedded-head" class="lede" hidden></p>');
const script = stripModule(read('docs/parse.js')) + '\n' + stripModule(read('docs/viewer.js'));
if (script.includes('</script')) throw new Error('build-page: viewer code contains </script');
swap('<script type="module" src="viewer.js"></script>',
  MARKER + '\n<script>\n(() => {\n' + script.trimEnd() + '\n})();\n</script>');

const out = process.argv[2] || root + 'hooks/page-template.html';
writeFileSync(out, html.endsWith('\n') ? html : html + '\n');
