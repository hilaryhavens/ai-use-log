import { parseSession, attachSubagents } from './parse.js';

const LIMIT = 4000;
const $ = (id) => document.getElementById(id);
let sessions = [];

// ---------- loading files ----------

function readAsText(file) {
  return file.text ? file.text() : new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsText(file);
  });
}

// Walk folders dropped onto the page.
async function entriesToFiles(entries) {
  const out = [];
  async function walk(entry, path) {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, path: path + file.name });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e, path + entry.name + '/');
      } while (batch.length);
    }
  }
  for (const e of entries) await walk(e, '');
  return out;
}

async function load(items) {
  const status = $('status');
  const jsonl = items.filter((x) => /\.jsonl$/i.test(x.file.name));
  if (!jsonl.length) { status.textContent = 'No .jsonl log files found there. Choose the project\'s ai-log folder, or the .jsonl files inside it.'; return; }
  status.textContent = 'Reading ' + jsonl.length + ' file' + (jsonl.length === 1 ? '' : 's') + '…';

  const metas = new Map();
  for (const x of items.filter((i) => /^agent-.*\.meta\.json$/i.test(i.file.name))) {
    try { metas.set(x.path.replace(/\.meta\.json$/i, ''), JSON.parse(await readAsText(x.file))); } catch { /* ignore */ }
  }

  const mains = [], agents = [];
  for (const x of jsonl) {
    let text = '';
    try { text = await readAsText(x.file); } catch { continue; }
    if (/^agent-/i.test(x.file.name)) {
      const key = x.path.replace(/\.jsonl$/i, '');
      agents.push({
        path: x.path,
        agentId: x.file.name.replace(/^agent-|\.jsonl$/gi, ''),
        meta: metas.get(key) || null,
        session: parseSession(text, { name: x.file.name }),
      });
    } else {
      const s = parseSession(text, { name: x.file.name });
      s.fileName = x.file.name;
      s.key = x.file.name.replace(/\.jsonl$/i, '');
      mains.push(s);
    }
  }

  // Helper agents live in "<session file name>/subagents/". Match by folder, else by tool id.
  const leftovers = [];
  for (const a of agents) {
    const owner = mains.find((s) => a.path.includes(s.key + '/subagents/'));
    if (owner) attachSubagents(owner, [a]); else leftovers.push(a);
  }
  for (const a of leftovers) {
    const owner = mains.find((s) => s.steps.some((st) => st.kind === 'tool' &&
      ((a.meta && st.tool.id === a.meta.toolUseId) || st.tool.agentId === a.agentId)));
    if (owner) attachSubagents(owner, [a]);
    else if (mains.length === 1) attachSubagents(mains[0], [a]);
  }

  sessions = mains.sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const extra = agents.length ? ' and ' + agents.length + ' helper-agent log' + (agents.length === 1 ? '' : 's') : '';
  status.textContent = 'Loaded ' + sessions.length + ' session' + (sessions.length === 1 ? '' : 's') + extra + '.';
  if (sessions.length === 1) showSession(0); else showList();
}

// ---------- small DOM helpers (always textContent: logs never become markup) ----------

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else n.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) n.append(k);
  return n;
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}
function duration(a, b) {
  const ms = new Date(b) - new Date(a);
  if (!(ms > 0)) return '';
  const m = Math.round(ms / 60000);
  return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
}

function longText(text) {
  const pre = el('pre');
  const s = String(text ?? '');
  if (s.length <= LIMIT) { pre.textContent = s; return pre; }
  pre.textContent = s.slice(0, LIMIT) + '\n…';
  const more = el('button', { class: 'btn link', type: 'button', text: 'Show all (' + s.length.toLocaleString() + ' characters)' });
  more.addEventListener('click', () => { pre.textContent = s; more.remove(); });
  return el('div', {}, pre, more);
}

// ---------- rendering ----------

function showList() {
  $('view').hidden = true;
  const ul = $('sessions');
  ul.replaceChildren();
  sessions.forEach((s, i) => {
    const b = el('button', { type: 'button' },
      el('span', { class: 's-title', text: s.title }),
      el('span', { class: 's-meta', text: [fmtDate(s.start), duration(s.start, s.end), s.stats.prompts + ' prompt' + (s.stats.prompts === 1 ? '' : 's')].filter(Boolean).join(' · ') }));
    b.addEventListener('click', () => showSession(i));
    ul.append(el('li', {}, b));
  });
  $('list').hidden = false;
}

function renderSteps(steps) {
  const box = el('div', { class: 'timeline' });
  for (const st of steps) {
    if (st.kind === 'prompt') {
      box.append(el('div', { class: 'step prompt step-prompt' },
        el('div', { class: 'who' }, el('span', { text: 'Student' }), el('span', { text: fmtTime(st.time) })),
        el('div', { class: 'text', text: st.text })));
    } else if (st.kind === 'reply') {
      box.append(el('div', { class: 'step reply step-reply' },
        el('div', { class: 'who' }, el('span', { text: 'Claude' }), el('span', { text: fmtTime(st.time) })),
        el('div', { class: 'text', text: st.text })));
    } else if (st.kind === 'thinking') {
      const d = el('details', { class: 'step thinking step-thinking' }, el('summary', { text: 'Claude’s reasoning' }), longText(st.text));
      box.append(d);
    } else if (st.kind === 'note') {
      box.append(el('div', { class: 'step note step-note', text: st.text }));
    } else if (st.kind === 'tool') {
      const t = st.tool;
      const d = el('details', { class: 'tool step-tool' + (t.isError ? ' error' : '') },
        el('summary', { text: (t.isError ? '⚠ ' : '') + t.label }),
        el('p', { class: 'sub', text: 'Tool: ' + t.name }),
        longText(typeof t.detail === 'string' ? t.detail : JSON.stringify(t.detail, null, 2)),
        el('p', { class: 'sub', text: t.isError ? 'Result (error)' : 'Result' }),
        longText(t.result || '(no result recorded)'));
      if (st.children) d.append(renderAgent(st.children));
      box.append(d);
    }
  }
  return box;
}

function renderAgent(a) {
  return el('div', { class: 'agent' },
    el('p', { class: 'sub', text: 'Helper agent' + (a.description ? ': ' + a.description : '') + (a.model ? ' (' + a.model + ')' : '') }),
    renderSteps(a.steps));
}

function showSession(i) {
  const s = sessions[i];
  const st = s.stats;
  $('list').hidden = true;
  const root = $('session');
  root.replaceChildren();

  const facts = el('dl', { class: 'facts' });
  const fact = (k, v) => { if (v) facts.append(el('dt', { text: k }), el('dd', { text: v })); };
  fact('Started', fmtDate(s.start));
  fact('Length', duration(s.start, s.end));
  fact('Project folder', s.cwd);
  fact('Model', s.model);
  fact('Claude Code', s.version);
  fact('File', s.fileName);
  fact('Session id', s.id);

  const stat = (n, label) => el('div', { class: 'stat' }, el('b', { text: String(n) }), el('span', { text: label }));
  const lists = el('div', { class: 'lists' });
  if (st.filesChanged.length) lists.append(el('p', { text: 'Files Claude created or edited: ' + st.filesChanged.join(', ') }));
  if (st.skills.length) lists.append(el('p', { text: 'Skills used: ' + st.skills.join(', ') }));
  if (s.skipped) lists.append(el('p', { text: s.skipped + ' unreadable line' + (s.skipped === 1 ? ' was' : 's were') + ' skipped.' }));

  const onlyPrompts = el('input', { type: 'checkbox', id: 'only-prompts' });
  const timeline = renderSteps(s.steps);
  onlyPrompts.addEventListener('change', () => timeline.classList.toggle('hide-actions', onlyPrompts.checked));
  const expand = el('button', { class: 'btn', type: 'button', text: 'Expand all actions' });
  expand.addEventListener('click', () => {
    const all = timeline.querySelectorAll('details');
    const open = expand.dataset.open !== '1';
    all.forEach((d) => { d.open = open; });
    expand.dataset.open = open ? '1' : '0';
    expand.textContent = open ? 'Collapse all actions' : 'Expand all actions';
  });
  const print = el('button', { class: 'btn', type: 'button', text: 'Print / save as PDF' });
  print.addEventListener('click', () => window.print());

  root.append(
    el('div', { class: 's-head' }, el('h2', { id: 'view-title', tabindex: '-1', text: s.title }), facts),
    el('div', { class: 'stats' },
      stat(st.prompts, 'student prompts'),
      stat(st.filesChanged.length, 'files changed'),
      stat(st.commands, 'commands run'),
      stat(st.playwright, 'Playwright actions'),
      stat(st.subagents, 'helper agents')),
    lists,
    el('div', { class: 'toolbar' },
      el('label', {}, onlyPrompts, 'Show only the student’s prompts'), expand, print),
    timeline);

  if (s.orphanAgents.length) {
    root.append(el('h3', { text: 'Other helper-agent logs' }));
    for (const a of s.orphanAgents) root.append(renderAgent(a));
  }

  $('back').hidden = sessions.length < 2;
  $('view').hidden = false;
  $('view-title').focus();
}

// ---------- wiring ----------

$('back').addEventListener('click', showList);
for (const id of ['pick-folder', 'pick-files']) {
  $(id).addEventListener('change', (e) => {
    const files = [...e.target.files].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
    load(files);
    e.target.value = '';
  });
}
const drop = $('drop');
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('over')));
drop.addEventListener('drop', async (e) => {
  e.preventDefault();
  const items = [...(e.dataTransfer.items || [])];
  const entries = items.map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  const files = entries.length ? await entriesToFiles(entries)
    : [...e.dataTransfer.files].map((file) => ({ file, path: file.name }));
  load(files);
});
// Stop a missed drop from navigating away from the page.
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

// ---------- embedded mode: AI-Use-Log.html carries its own logs ----------

const embedded = [...document.querySelectorAll('script.log')];
if (embedded.length) {
  let meta = {};
  try { meta = JSON.parse($('ai-log-meta').textContent); } catch { /* no header info */ }
  $('loader').hidden = true;
  document.querySelector('.site .lede').hidden = true;
  const head = $('embedded-head');
  if (head) {
    const when = fmtDate(meta.updated);
    head.textContent = (meta.project ? 'Project: ' + meta.project : 'Project log') + (when ? ' · updated ' + when : '');
    head.hidden = false;
  }
  load(embedded.map((s) => {
    const path = s.dataset.path || '';
    const text = s.textContent;
    return { file: { name: path.split('/').pop(), text: () => Promise.resolve(text) }, path };
  }));
}

