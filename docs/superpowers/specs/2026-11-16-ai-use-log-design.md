# AI Use Log plugin + DH features guide — design (2026-11-16)

## Intent
Hilary's digital humanities students who use Claude Code in their projects must submit a record of their Claude conversations. The purpose is **transparency**: Hilary can see exactly what Claude did and what the student did. Reflection on AI use is not the goal for now.

## Goals
- Every Claude Code session in a student's project is saved automatically. Students don't have to remember to do anything.
- The logs live inside the project folder (`ai-log/`), so they travel with the project and get submitted with it.
- Hilary (and students) can read a log comfortably in a browser.
- The plugin installs the same way students installed superpowers and Playwright.
- A student guide covers the plugin plus the other recommended Claude Code features.

## Non-goals
- Student reflections or summaries (possible later add-on).
- Claude Code on the web, Cowork and the UT AI Hub (plugin hooks don't run there). The guide says so and points those students to `/export` or copy-paste.
- Tamper-proofing. The logs are the original records, but a determined student could edit them. The guide says this honestly.

## Anti-goals
- Anything students have to install beyond Claude Code itself (no Python, Node or jq requirement).
- Sending conversations anywhere. The viewer runs entirely in the browser and uploads nothing.

## Approaches considered
- A. `/export` + a setting change, no build: fragile (students forget, and files are easy to tidy up).
- **B. Hook copies the raw transcript + browser viewer — CHOSEN by Hilary.** It's complete, automatic, and has no dependencies.
- C. Hook also converts each log to Markdown: needs Python/Node on every laptop.

## Design
**Plugin `ai-use-log`**, in a new public GitHub repo `hilaryhavens/ai-use-log` that also works as its own plugin marketplace. Students run:
`/plugin marketplace add hilaryhavens/ai-use-log` → `/plugin install ai-use-log@ai-use-log`

**Hook:** runs on `Stop` (after every Claude reply) and `SessionEnd`. A small bash script (Claude Code on Windows already requires Git Bash, so it runs on Windows and Mac):
- reads the hook's input to find the session's transcript file (no jq; plain text matching, with Windows paths handled)
- copies it to `<project>/ai-log/<YYYY-MM-DD>-<session id>.jsonl`, overwriting the same file each time so there's exactly one up-to-date file per session
- also copies that session's **subagent transcripts** (superpowers dispatches subagents whose work isn't in the main file) into a subfolder for the same session
- never blocks or breaks Claude: on any error it exits quietly.

**Viewer:** one HTML page served on the repo's GitHub Pages (`hilaryhavens.github.io/ai-use-log/`). You drop in one or more `.jsonl` files and it shows:
- the session date, length, project folder and model
- the conversation in order: student prompts, Claude's replies, and tool actions collapsed under one-line summaries (e.g. "Edited chapter2.xml", "Ran: tweego …")
- a header summary counting prompts, files Claude created or edited, and commands it ran
- subagent work, nested and labelled.

It handles malformed lines gracefully, and works offline once loaded.

**Guide:** a new student guide, "Getting More from Claude Code for Your DH Project". Same pattern as the earlier guides: Claude Doc master (byline "Written by Claude and Hilary Havens") → GitHub Pages site → Canvas paste version. Sections:
1. Habits for every project: CLAUDE.md/`/init`, plan mode, rewind, output styles, `/resume`/`/compact`.
2. Working with the plugins students already have: how these habits combine with **Superpowers** (brainstorming → plan → build, verification) and **Playwright** (Claude checks the live page/project in a browser).
3. Going further: own skills, MCP, hooks.
4. **Required: the AI Use Log**: install, what gets saved (including Superpowers helper-agent work and Playwright browser actions), how to submit, privacy, plus a fallback for non-Claude Code users.
5. Verifying quotations and citations.

(Hilary removed the text-encoding, Twine and digital-storytelling sections, 2026-11-16.)

**Superpowers/Playwright in the plugin + viewer:** the viewer labels skill use (e.g. "Used skill: superpowers:brainstorming") and Playwright actions (e.g. "Playwright: opened https://…", "Playwright: took screenshot") in plain words, and nests Superpowers subagent work under the step that launched it.

## Calls Claude made (Hilary can override)
- **Submission:** the plugin does not edit `.gitignore`. The guide tells students to submit the `ai-log/` folder (zipped) on Canvas, and warns that pushing it to a **public** GitHub repo publishes their conversations.
- Plugin/repo name `ai-use-log`; the repo is public (it has to be for students to install it).
- Testing: the hook and viewer are tested on Hilary's Windows machine against real transcripts; Mac is untested and flagged as such.
- Order: plugin + viewer first, then the guide.

## Left to the builder
Viewer styling (accessible, light/dark, phone-friendly), exact tool-summary wording, and the script's internal details.
