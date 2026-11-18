import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const MARKER = '<!--AI-USE-LOG-DATA-->';
const build = () => {
  execFileSync(process.execPath, ['scripts/build-page.mjs'], { cwd: root });
  return readFileSync(root + 'hooks/page-template.html', 'utf8');
};

test('build produces template with one marker', () => {
  const lines = build().split('\n');
  assert.equal(lines.filter((l) => l === MARKER).length, 1);
});

test('template has no module syntax or external viewer files', () => {
  const t = build();
  assert.ok(!t.includes('type="module"'));
  assert.ok(!/^\s*(import|export)\b/m.test(t));
  assert.ok(!t.includes('src="viewer.js"'));
  assert.ok(!t.includes('href="viewer.css"'));
});

test('marker precedes viewer script and page closes', () => {
  const t = build();
  assert.ok(t.indexOf(MARKER) < t.indexOf('function parseSession('));
  assert.ok(t.includes('id="embedded-head"'));
  assert.ok(t.trimEnd().endsWith('</html>'));
});

test('hidden attribute beats .btn display (single-session page hides "All sessions")', () => {
  assert.match(build(), /\[hidden\]\s*\{\s*display:\s*none\s*!important;?\s*\}/);
});

test('embedded mode hides the folder instructions, not its own header', () => {
  const t = build();
  assert.ok(!t.includes("querySelector('.site .lede')"), 'must not grab the first .lede (that is #embedded-head)');
  assert.ok(t.includes(".site .lede:not(#embedded-head)"));
});

test('template build is deterministic', () => {
  assert.equal(build(), build());
});
