# Submission Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After every Claude reply the hook writes `ai-log/AI-Use-Log.html`, a self-contained readable page students upload to Canvas instead of a ZIP.

**Architecture:** A repo build script inlines the existing viewer (css + parse.js + viewer.js) into a committed template with a data marker. The bash hook splices the raw logs in at the marker as `<script type="application/json">` blocks; viewer.js detects them and feeds them to its existing `load()`.

**Tech Stack:** bash + coreutils/sed (hook), Node ≥18 (repo build + `node --test` only), vanilla JS viewer.

**Spec:** `docs/superpowers/specs/2026-11-18-submission-page-design.md`

## Global Constraints
- Output file name: `AI-Use-Log.html`, in the same log dir as the `.jsonl` files (`$AI_USE_LOG_DIR` or `<project>/ai-log`).
- Hook: bash + coreutils + sed only; prints nothing; always exits 0; still finishes inside the 30 s timeout.
- Every `<` in embedded data is written as `<`. `data-path` values must match `^[A-Za-z0-9._/-]+$`, else skipped.
- Logs never become markup: viewer keeps using textContent only.
- Page works offline from `file://` (classic inline `<script>`, not a module).
- Plugin version `1.1.0`.

## Review Focus
- Log text containing `</script>` or `<!--` must stay inert data → hook test `script-tag injection` (Task 2).
- Project folder name with spaces, quotes or `<` must render as text in the header → hook test `odd project name` (Task 2).
- Second run must replace, not append to, the page; no `.tmp` left behind → hook test `rebuild` (Task 2).
- A session with no subagents folder, and an empty `ai-log` except one file → hook test `single session no agents` (Task 2).
- Opening the page with no embedded data (the hosted viewer) must still show the folder picker unchanged → browser check (Task 4).

---

### Task 1: Viewer embedded mode + page template

**Files:**
- Modify: `docs/viewer.js` (wiring section at end; add embedded loader)
- Modify: `docs/viewer.css` (styles for `#embedded-head` if needed)
- Create: `scripts/build-page.mjs`
- Create: `hooks/page-template.html` (generated, committed)
- Test: `tests/build-page.test.mjs`

**Interfaces:**
- Produces: `hooks/page-template.html` containing exactly one line `<!--AI-USE-LOG-DATA-->`. Everything above it (head: doctype, inline css, body markup same as `docs/index.html` plus an empty `<div id="embedded-head" hidden></div>` in `<header>`) and below it (tail: one classic `<script>` with parse.js + viewer.js, `import`/`export` lines stripped, then `</body></html>`).
- Produces (data contract the hook writes between head and tail):
  - `<script type="application/json" id="ai-log-meta">{"project":"<name>","updated":"<ISO-8601 local time>"}</script>`
  - per file: `<script type="application/json" class="log" data-path="<path relative to log dir>">…raw file text…</script>`
- viewer.js: at startup, if `document.querySelectorAll('script.log')` is non-empty → hide `#loader` and the `.help` section's drop instructions, fill `#embedded-head` ("Project: <name> · updated <date time>", textContent) and call `load(items)` where each item is `{ file: { name: <basename of data-path>, text: () => Promise.resolve(el.textContent) }, path: <data-path> }`.

- [ ] **Step 1: Write failing test `tests/build-page.test.mjs`**
  - `build produces template with one marker`: run `node scripts/build-page.mjs`; read `hooks/page-template.html`; exactly one line equals `<!--AI-USE-LOG-DATA-->`.
  - `template has no module syntax`: no `type="module"`, no line matching `^\s*(import|export)\b`, no `src="viewer.js"`, no `href="viewer.css"`.
  - `marker precedes viewer script`: index of marker < index of `parseSession(` definition; tail ends with `</html>`.
  - `template is current`: building twice yields identical bytes (deterministic, no timestamps).
- [ ] **Step 2: Run `node --test tests/*.test.mjs` → new tests FAIL (script missing).**
- [ ] **Step 3: Implement `scripts/build-page.mjs`** — reads `docs/index.html`, replaces the stylesheet link with inline `<style>`, removes the module script tag, inserts marker + `<script>` (parse.js then viewer.js, `export ` keyword removed from declarations, import line dropped) before `</body>`; adds `#embedded-head`. Implement embedded mode in `docs/viewer.js` per Interfaces.
- [ ] **Step 4: Run `node --test tests/*.test.mjs` → all PASS (existing parse tests included).**
- [ ] **Step 5: Commit** `feat: viewer embedded mode and page template`

### Task 2: Hook writes AI-Use-Log.html

**Files:**
- Modify: `hooks/copy-log` (after the copy block)
- Test: `tests/test-copy-log.sh`

**Interfaces:**
- Consumes: `hooks/page-template.html` from Task 1 (located via the hook's own dir: `"$(dirname "$0")/page-template.html"`); marker and data contract above.
- Produces: `<logdir>/AI-Use-Log.html`, written to `AI-Use-Log.html.tmp` then `mv -f`.

- [ ] **Step 1: Add failing tests to `tests/test-copy-log.sh`**
  - `page created`: after the first run, `ai-log/AI-Use-Log.html` exists, contains `class="log" data-path="${TODAY}_s1.jsonl"`, `data-path="${TODAY}_s1/subagents/agent-abc.jsonl"` and `data-path="${TODAY}_s1/subagents/agent-abc.meta.json"`, and does not contain `tool-results`.
  - `rebuild`: run a second session in the same project → page has both sessions' blocks, exactly one `<!doctype`, no `AI-Use-Log.html.tmp`.
  - `script-tag injection`: transcript line `{"type":"user","message":{"role":"user","content":"</script><script>alert(1)</script><!--"}}` → page contains `</script><script>alert(1)` and the count of `</script>` equals the count of `<script` openings in the page.
  - `odd project name`: project dir `Proj "A" <b>` (skip where the filesystem refuses) → meta block contains `Proj \"A\" <b>`.
  - `single session no agents`: session without subagents dir → page created with one `class="log"` block.
  - `still silent`: stdout empty and exit 0 for all of the above.
- [ ] **Step 2: Run `bash tests/test-copy-log.sh` → new tests FAIL.**
- [ ] **Step 3: Implement in `hooks/copy-log`** a `write_page <logdir> <project-name>` function: head = template lines before the marker, then meta block, then for each file under logdir matching `*.jsonl` (depth 1) and `*/subagents/agent-*.jsonl` / `*/subagents/agent-*.meta.json` (sorted) whose relative path passes the charset check, a log block with content piped through `sed 's/</\\u003c/g'`; then tail; to `.tmp`, then `mv -f`. Project name JSON-escaped with `sed 's/\\/\\\\/g; s/"/\\"/g; s/</\\u003c/g'`. Missing template → skip silently.
- [ ] **Step 4: Run `bash tests/test-copy-log.sh` → all PASS.**
- [ ] **Step 5: Commit** `feat: hook writes self-contained AI-Use-Log.html`

### Task 3: Submit command, version, README

**Files:**
- Create: `commands/submit.md`
- Modify: `.claude-plugin/plugin.json` (version `1.1.0`), `.claude-plugin/marketplace.json` (version if present), `README.md` (submit section)

- [ ] **Step 1: Write `commands/submit.md`** (frontmatter `description: Open your ai-log folder with AI-Use-Log.html selected, ready to upload`). Body tells Claude to: find `AI-Use-Log.html` in the project's `ai-log` folder (if missing: say a reply must happen first, or the plugin isn't installed); reveal it (Windows `explorer.exe /select,"<windows path>"`, macOS `open -R "<path>"`, else print the path); tell the student in 2–3 sentences to upload that one file to Canvas, and that it contains everything they pasted into Claude. No other actions, no reading the logs' content.
- [ ] **Step 2: Bump versions; rewrite README "Submitting" to: upload `ai-log/AI-Use-Log.html` (or run `/ai-use-log:submit`); updating from 1.0.0 via `/plugin update ai-use-log`.**
- [ ] **Step 3: Verify** `claude plugin validate .` (if available) passes; `node --test tests/*.test.mjs` and `bash tests/test-copy-log.sh` still PASS.
- [ ] **Step 4: Commit** `feat: /ai-use-log:submit command; v1.1.0`

### Task 4: Real-browser check, ship, guide

- [ ] **Step 1:** Run the hook against `tests/fixtures` copied into a temp project; open the resulting `AI-Use-Log.html` over `file://` in Playwright: session list or timeline renders, helper agent present, header shows project + time, zero console errors, injected `alert` never fires, no horizontal scroll at 375 px.
- [ ] **Step 2:** Open `docs/index.html` (hosted viewer, no data) → folder picker visible as before.
- [ ] **Step 3:** Push `main`; reinstall plugin locally (`/plugin update ai-use-log`), do one real Claude reply in a scratch project, confirm `AI-Use-Log.html` appears and opens.
- [ ] **Step 4:** DH guide: Claude Doc "How to submit" → upload `ai-log/AI-Use-Log.html` (or `/ai-use-log:submit`), update note; mirror in `claude-dh-features-guide/src/body.html`, `python src/build.py`, commit, push.
