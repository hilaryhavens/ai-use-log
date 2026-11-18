# Submission page — design (2026-11-18)

## Intent
Students currently zip the `ai-log` folder and upload the ZIP to Canvas; Hilary then opens it in the
web viewer. Make submission one file: a self-contained, readable HTML page that students upload as-is
and Hilary opens straight from Canvas, no viewer site or unzipping needed.

## Goals / non-goals / anti-goals
- Goal: `ai-log/AI-Use-Log.html` always exists and is current after every Claude reply. Students do nothing new.
- Goal: the page looks and works like the existing viewer (session list, timeline, helper agents, print).
- Goal: a `/ai-use-log:submit` command that opens the folder with the file selected.
- Non-goal: replacing the `.jsonl` files or the web viewer (both stay; the viewer still opens folders).
- Anti-goal: Claude writing or summarising the record (the page carries the raw logs, rendered by code).
- Anti-goal: any new install for students (no Node, Python or jq at hook time — bash + coreutils only).
- Anti-goal: the hook ever interrupting Claude (still silent, always exits 0).

## Approaches
- **A. Hook rebuilds the page after every reply (picked).** Always current, nothing to remember. Cost: rebuild each reply; file grows with the project.
- B. Built only by a submit command. Students forget, or submit a stale page.
- C. Claude writes the page. Rejected: Claude would author the record of its own use; slow and costly.

## Design
1. **Template, built in the repo.** `node scripts/build-page.mjs` inlines `viewer.css`, `parse.js` and
   `viewer.js` (imports/exports stripped) into `hooks/page-template.html`, which is committed and split at a
   marker line into a head and a tail. Hook needs no build tools.
2. **Embedded mode in the viewer.** On load, if the page contains `<script type="application/json" class="log" data-path="…">`
   blocks, viewer.js feeds them to the existing `load()` as file-like items (`{name, text()}`), hides the
   folder picker, and shows a heading with the project folder name and "updated <date time>". Same code
   path as dropped folders, so the parser stays tested once.
3. **Hook.** After copying, `copy-log` writes head + one JSON block per `*.jsonl` (main sessions and
   `*/subagents/agent-*.jsonl`) and each `agent-*.meta.json`, + tail, to `AI-Use-Log.html.tmp`, then `mv` over
   `AI-Use-Log.html` (no half-written file). Safety: every `<` in the data is written as `<` (valid
   inside JSON strings, the only place `<` can occur), so log text can never close the script tag or become markup;
   `data-path` values are checked against `[A-Za-z0-9._/-]`, else skipped. `tool-results/` is not embedded (the viewer never reads it).
4. **Command.** `commands/submit.md`: Claude opens the project's `ai-log` folder with `AI-Use-Log.html`
   selected (Windows `explorer /select,`, Mac `open -R`), tells the student to upload that one file, and
   reminds them it contains everything they pasted.
5. **Release.** Plugin version 1.1.0; README + DH guide "How to submit" become "upload `ai-log/AI-Use-Log.html`";
   guide notes `/plugin update ai-use-log` for anyone on 1.0.0.

## Tests
Hook test: page is created, rebuilt on a second run, contains every session, and a log containing
`</script><script>alert(1)</script>` stays inert data. Browser check (Playwright): the generated page
from the fixtures renders sessions and helper agents with no console errors, offline.

## Left to the builder
Exact heading wording and styling of the embedded-mode header; size handling beyond the existing
"show more" truncation.
