// Parses Claude Code transcript files (.jsonl) into a readable session.
// Pure functions, no DOM: used by the viewer page and by the Node tests.

const PLAYWRIGHT = /^mcp__.*playwright.*__browser_(.+)$/;
const FILE_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const COMMAND_TOOLS = new Set(['Bash', 'PowerShell']);
const AGENT_TOOLS = new Set(['Agent', 'Task']);
// User-role text that Claude Code adds itself, not something the person typed.
const NOT_TYPED = /^\s*<(local-command-caveat|local-command-stdout|local-command-stderr|system-reminder|task-notification|bash-input|bash-stdout|bash-stderr)>/;

export function baseName(p) {
  if (!p) return '';
  const parts = String(p).split(/[\\/]/);
  return parts[parts.length - 1];
}

function short(s, n) {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function toolLabel(name, input) {
  input = input || {};
  const pw = PLAYWRIGHT.exec(name);
  if (pw) {
    const action = pw[1];
    if (action === 'navigate') return 'Playwright: opened ' + (input.url || 'a page');
    if (action === 'take_screenshot') return 'Playwright: took a screenshot';
    if (action === 'snapshot') return 'Playwright: read the page';
    if (action === 'click') return 'Playwright: clicked ' + (input.element || 'an element');
    if (action === 'type') return 'Playwright: typed into ' + (input.element || 'a field');
    return 'Playwright: ' + action.replace(/_/g, ' ');
  }
  switch (name) {
    case 'Edit': case 'MultiEdit': return 'Edited ' + baseName(input.file_path);
    case 'Write': return 'Created or overwrote ' + baseName(input.file_path);
    case 'NotebookEdit': return 'Edited notebook ' + baseName(input.notebook_path || input.file_path);
    case 'Read': return 'Read ' + baseName(input.file_path);
    case 'Bash': case 'PowerShell': return 'Ran a command: ' + short(input.description || input.command, 80);
    case 'Skill': return 'Used skill: ' + (input.skill || '?');
    case 'Agent': case 'Task': return 'Sent a helper agent: ' + short(input.description || input.prompt, 80);
    case 'WebFetch': return 'Fetched ' + (input.url || 'a web page');
    case 'WebSearch': return 'Searched the web: ' + short(input.query, 80);
    case 'Grep': return 'Searched files for: ' + short(input.pattern, 60);
    case 'Glob': return 'Listed files: ' + short(input.pattern, 60);
    default: return name;
  }
}

function resultText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((c) => {
      if (c.type === 'text') return c.text;
      if (c.type === 'image') return '[image]';
      if (c.type === 'tool_reference') return '[loaded tool ' + c.tool_name + ']';
      return '[' + c.type + ']';
    }).join('\n');
  }
  return JSON.stringify(content);
}

function userText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((c) => {
    if (c.type === 'text') return c.text;
    if (c.type === 'image') return '[image attached]';
    if (c.type === 'document') return '[document attached]';
    return '';
  }).filter(Boolean).join('\n');
}

export function parseSession(text, opts = {}) {
  const s = {
    id: '', title: '', cwd: '', model: '', start: '', end: '', version: '',
    steps: [], skipped: 0, orphanAgents: [],
    stats: { prompts: 0, filesChanged: [], commands: 0, skills: [], playwright: 0, subagents: 0 },
  };
  const toolsById = new Map();
  const files = new Set();
  const skills = new Set();
  let aiTitle = '';

  for (const raw of String(text).split(/\r?\n/)) {
    if (!raw.trim()) continue;
    let d;
    try { d = JSON.parse(raw); } catch { s.skipped++; continue; }
    if (!d || typeof d !== 'object') { s.skipped++; continue; }

    if (d.sessionId && !s.id) s.id = d.sessionId;
    if (d.type === 'ai-title' && d.aiTitle) { aiTitle = d.aiTitle; continue; }
    if (d.type !== 'user' && d.type !== 'assistant' && d.type !== 'system') continue;

    const time = d.timestamp || '';
    if (time) { if (!s.start) s.start = time; s.end = time; }
    if (d.cwd && !s.cwd) s.cwd = d.cwd;
    if (d.version && !s.version) s.version = d.version;

    if (d.type === 'system') {
      if (d.subtype === 'compact_boundary') s.steps.push({ kind: 'note', time, text: 'Conversation was compacted (older messages summarised)' });
      continue;
    }

    const content = d.message && d.message.content;

    if (d.type === 'assistant') {
      if (d.message.model && !s.model && !String(d.message.model).startsWith('<')) s.model = d.message.model;
      for (const c of Array.isArray(content) ? content : []) {
        if (c.type === 'text' && c.text && c.text.trim()) s.steps.push({ kind: 'reply', time, text: c.text });
        else if (c.type === 'thinking' && c.thinking && c.thinking.trim()) s.steps.push({ kind: 'thinking', time, text: c.thinking });
        else if (c.type === 'tool_use') {
          const tool = { id: c.id, name: c.name, label: toolLabel(c.name, c.input), detail: c.input || {}, result: '', isError: false };
          toolsById.set(c.id, tool);
          s.steps.push({ kind: 'tool', time, tool });
          if (FILE_TOOLS.has(c.name)) files.add(baseName((c.input || {}).file_path || (c.input || {}).notebook_path));
          if (COMMAND_TOOLS.has(c.name)) s.stats.commands++;
          if (c.name === 'Skill' && c.input && c.input.skill) skills.add(c.input.skill);
          if (PLAYWRIGHT.test(c.name)) s.stats.playwright++;
          if (AGENT_TOOLS.has(c.name)) s.stats.subagents++;
        }
      }
      continue;
    }

    // user records
    if (Array.isArray(content) && content.some((c) => c.type === 'tool_result')) {
      for (const c of content) {
        if (c.type !== 'tool_result') continue;
        const tool = toolsById.get(c.tool_use_id);
        if (!tool) continue;
        tool.result = resultText(c.content);
        tool.isError = !!c.is_error;
        const agentId = d.toolUseResult && typeof d.toolUseResult === 'object' && d.toolUseResult.agentId;
        if (agentId) tool.agentId = agentId;
      }
      continue;
    }
    if (d.isMeta || d.isCompactSummary) continue;
    const t = userText(content);
    if (!t.trim() || NOT_TYPED.test(t)) continue;
    const cmd = /^\s*<command-name>([^<]*)<\/command-name>/.exec(t);
    if (cmd) {
      const args = /<command-args>([^<]*)<\/command-args>/.exec(t);
      s.steps.push({ kind: 'note', time, text: 'Ran ' + cmd[1].trim() + (args && args[1].trim() ? ' ' + args[1].trim() : '') });
      continue;
    }
    s.steps.push({ kind: 'prompt', time, text: t });
    s.stats.prompts++;
  }

  if (!s.id && opts.name) {
    const m = /^(?:\d{4}-\d{2}-\d{2}_)?(.+?)\.jsonl$/i.exec(baseName(opts.name));
    if (m) s.id = m[1];
  }
  const firstPrompt = s.steps.find((x) => x.kind === 'prompt');
  s.title = aiTitle || (firstPrompt ? short(firstPrompt.text, 60) : '(no prompts)');
  s.stats.filesChanged = [...files].filter(Boolean);
  s.stats.skills = [...skills];
  return s;
}

// agents: [{ agentId, meta, session }] — nests each helper agent under the step that launched it.
export function attachSubagents(main, agents) {
  const tools = main.steps.filter((x) => x.kind === 'tool');
  for (const a of agents) {
    const byMeta = a.meta && a.meta.toolUseId && tools.find((x) => x.tool.id === a.meta.toolUseId);
    const byId = !byMeta && tools.find((x) => x.tool.agentId && x.tool.agentId === a.agentId);
    const step = byMeta || byId;
    if (a.meta && a.meta.description && !a.session.description) a.session.description = a.meta.description;
    if (step) step.children = a.session;
    else main.orphanAgents.push(a.session);
  }
}
