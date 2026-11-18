# AI Use Log

A Claude Code plugin that **automatically saves a copy of every Claude Code conversation in your project's `ai-log` folder**, so you can submit a transparent record of how you used Claude.

Read the logs with the **[AI Use Log Viewer](https://hilaryhavens.github.io/ai-use-log/)**. It runs in your browser, and nothing is uploaded.

## Install (Claude Code)

Type these two commands in Claude Code, one at a time:

```
/plugin marketplace add hilaryhavens/ai-use-log
/plugin install ai-use-log@ai-use-log
```

Then quit Claude Code and start it again. That's it: there's nothing to remember after that.

**Installed version 1.0.0 before November 18, 2026?** Run `/plugin update ai-use-log` and restart Claude Code to get the submission page.

## Submit your log

Upload one file to Canvas: **`ai-log/AI-Use-Log.html`**. It's a readable page with every conversation from the project, and it opens in any browser with no viewer or unzipping. It updates itself after every reply, so upload it after your last session.

Can't find it? Type `/ai-use-log:submit` in Claude Code and it opens the folder with the file selected.

## What it does

- After **every reply Claude gives**, and when a session ends, it copies that session's conversation into your project:
  - `ai-log/2026-11-16_<session id>.jsonl` holds the whole conversation, one file per session, kept up to date as you work.
  - `ai-log/2026-11-16_<session id>/subagents/` holds the work of any helper agents Claude sent out (Superpowers does this often).
  - `ai-log/2026-11-16_<session id>/tool-results/` holds long tool outputs, when there are any.
  - `ai-log/AI-Use-Log.html` is rebuilt with every session's original log inside it, shown with the viewer. (Long tool outputs are left out; the conversation itself is complete.)
- The log includes your prompts, Claude's replies, every file Claude read or changed, every command it ran, the skills it used (for example Superpowers), and its Playwright browser actions.
- It works on Windows (through Git Bash, which Claude Code already needs) and macOS. It needs nothing else installed.
- If anything goes wrong, it stays silent and never interrupts Claude.

## Privacy

- The log contains **everything Claude saw**, including anything you paste in and the contents of files it read. Don't paste passwords or other people's personal information into Claude.
- If your project is in a **public** GitHub repository, pushing the `ai-log` folder publishes your conversations. To keep them private, add `ai-log/` to your `.gitignore` and upload `AI-Use-Log.html` to Canvas instead.

## Honest limits

- It only works in **Claude Code** (terminal, desktop app or IDE). It does not run in Claude Cowork, Claude on the web or the UT AI Hub. There, use `/export` or copy the conversation instead.
- These are the original records Claude Code keeps, but they are ordinary files, so they are not tamper-proof.
- It only records sessions started **after** you install it, in projects opened in Claude Code.

## Uninstall

```
/plugin uninstall ai-use-log@ai-use-log
```

Your existing `ai-log` folders are left as they are.

## For developers

- `hooks/copy-log`: the bash script the hook runs. `hooks/run-hook.cmd` is a cross-platform wrapper adapted from [obra/superpowers](https://github.com/obra/superpowers) (MIT).
- `docs/`: the viewer (GitHub Pages). `docs/parse.js` is the transcript parser.
- `hooks/page-template.html`: the viewer inlined into one file, used for `AI-Use-Log.html`. After changing anything in `docs/`, rebuild it with `node scripts/build-page.mjs` and commit it.
- `commands/submit.md`: the `/ai-use-log:submit` command.
- Tests: `bash tests/test-copy-log.sh` and `node --test tests/*.test.mjs`.

MIT License.
