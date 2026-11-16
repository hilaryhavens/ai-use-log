// Run: node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseSession, attachSubagents, toolLabel } from '../docs/parse.js';

const fx = (p) => readFileSync(fileURLToPath(new URL('./fixtures/' + p, import.meta.url)), 'utf8');
const main = () => parseSession(fx('2026-11-16_s-main.jsonl'), { name: '2026-11-16_s-main.jsonl' });

test('prompts and replies in order', () => {
  const s = main();
  const prompts = s.steps.filter((x) => x.kind === 'prompt').map((x) => x.text);
  assert.deepEqual(prompts, ['Help me tag chapter 2 of my edition.', 'Persons and places.\n[image attached]']);
  const replies = s.steps.filter((x) => x.kind === 'reply').map((x) => x.text);
  assert.deepEqual(replies, ['Sure. First question:\n\nWhich tags matter most?', 'All done.']);
  const firstPrompt = s.steps.findIndex((x) => x.kind === 'prompt');
  const firstReply = s.steps.findIndex((x) => x.kind === 'reply');
  assert.ok(firstPrompt < firstReply);
});

test('slash commands and compaction become notes', () => {
  const notes = main().steps.filter((x) => x.kind === 'note').map((x) => x.text);
  assert.ok(notes.includes('Ran /plugin'));
  assert.ok(notes.includes('Conversation was compacted (older messages summarised)'));
  assert.ok(!notes.some((n) => n.includes('task-notification')));
});

test('empty thinking is dropped', () => {
  assert.equal(main().steps.filter((x) => x.kind === 'thinking').length, 0);
});

test('tool use paired with result', () => {
  const t = main().steps.find((x) => x.kind === 'tool' && x.tool.id === 't4');
  assert.equal(t.tool.result, '<script>alert(1)</script>');
  assert.equal(t.tool.isError, true);
  const ps = main().steps.find((x) => x.kind === 'tool' && x.tool.id === 't5');
  assert.equal(ps.tool.result, 'listing');
});

test('labels', () => {
  assert.equal(toolLabel('Edit', { file_path: 'C:\\Users\\s\\my project\\chapter2.xml' }), 'Edited chapter2.xml');
  assert.equal(toolLabel('Write', { file_path: '/home/s/notes.md' }), 'Created or overwrote notes.md');
  assert.equal(toolLabel('Bash', { command: 'xmllint x', description: 'Check the XML' }), 'Ran a command: Check the XML');
  assert.equal(toolLabel('Bash', { command: 'ls -la' }), 'Ran a command: ls -la');
  assert.equal(toolLabel('Skill', { skill: 'superpowers:brainstorming' }), 'Used skill: superpowers:brainstorming');
  assert.equal(toolLabel('mcp__plugin_playwright_playwright__browser_navigate', { url: 'https://e.org' }), 'Playwright: opened https://e.org');
  assert.equal(toolLabel('mcp__plugin_playwright_playwright__browser_take_screenshot', {}), 'Playwright: took a screenshot');
  assert.equal(toolLabel('mcp__plugin_playwright_playwright__browser_click', { element: 'Next link' }), 'Playwright: clicked Next link');
  assert.equal(toolLabel('mcp__plugin_playwright_playwright__browser_resize', {}), 'Playwright: resize');
  assert.equal(toolLabel('Agent', { description: 'Review tags' }), 'Sent a helper agent: Review tags');
  assert.equal(toolLabel('Task', { description: 'Review tags' }), 'Sent a helper agent: Review tags');
  assert.equal(toolLabel('Read', { file_path: '/a/b.txt' }), 'Read b.txt');
  assert.equal(toolLabel('WebFetch', { url: 'https://e.org' }), 'Fetched https://e.org');
  assert.equal(toolLabel('WebSearch', { query: 'Burney' }), 'Searched the web: Burney');
  assert.equal(toolLabel('FancyNewTool', { q: 1 }), 'FancyNewTool');
  assert.equal(toolLabel('mcp__claude_ai_Claude_Docs__batch', {}), 'Connected tool (claude ai Claude Docs): batch');
  assert.equal(toolLabel('mcp__zotero__search_items', {}), 'Connected tool (zotero): search items');
});

test('stats', () => {
  const st = main().stats;
  assert.equal(st.prompts, 2);
  assert.deepEqual(st.filesChanged, ['chapter2.xml', 'notes.md']);
  assert.equal(st.commands, 2);
  assert.deepEqual(st.skills, ['superpowers:brainstorming']);
  assert.equal(st.playwright, 4);
  assert.equal(st.subagents, 1);
});

test('skips bad and unknown lines', () => {
  const s = main();
  assert.equal(s.skipped, 1);
  assert.doesNotThrow(() => parseSession('{{{\n\n{"type":"brand-new-type"}\n'));
  assert.equal(parseSession('').steps.length, 0);
});

test('session metadata', () => {
  const s = main();
  assert.equal(s.id, 's-main');
  assert.equal(s.title, 'Tagging chapter 2');
  assert.equal(s.cwd, 'C:\\Users\\student\\my project');
  assert.equal(s.model, 'claude-opus-5-5');
  assert.equal(s.start, '2026-11-16T14:00:00.000Z');
  assert.equal(s.end, '2026-11-16T14:07:00.000Z');
});

test('title falls back to first prompt', () => {
  const s = parseSession('{"type":"user","message":{"role":"user","content":"' + 'x'.repeat(100) + '"}}');
  assert.equal(s.title, 'x'.repeat(60) + '…');
});

test('id falls back to file name', () => {
  assert.equal(parseSession('', { name: '2026-11-16_abc-123.jsonl' }).id, 'abc-123');
});

test('nests subagents via meta toolUseId', () => {
  const s = main();
  const agent = parseSession(fx('session/subagents/agent-agent1.jsonl'));
  attachSubagents(s, [{ agentId: 'agent1', meta: JSON.parse(fx('session/subagents/agent-agent1.meta.json')), session: agent }]);
  const step = s.steps.find((x) => x.kind === 'tool' && x.tool.id === 'tA');
  assert.ok(step.children);
  assert.equal(step.children.steps.find((x) => x.kind === 'reply').text, 'Tags look fine.');
});

test('nests subagents via agentId when meta missing', () => {
  const s = main();
  const agent = parseSession(fx('session/subagents/agent-agent1.jsonl'));
  attachSubagents(s, [{ agentId: 'agent1', meta: null, session: agent }]);
  assert.ok(s.steps.find((x) => x.kind === 'tool' && x.tool.id === 'tA').children);
});

test('unmatched subagents are kept, not lost', () => {
  const s = main();
  const agent = parseSession(fx('session/subagents/agent-agent1.jsonl'));
  attachSubagents(s, [{ agentId: 'zzz', meta: null, session: agent }]);
  assert.equal(s.orphanAgents.length, 1);
});
