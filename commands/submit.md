---
description: Open your ai-log folder with AI-Use-Log.html selected, ready to upload
---

The student wants to submit their AI Use Log. Do only the following, and do not read or summarize the logs themselves.

1. Find `ai-log/AI-Use-Log.html` in the current project folder (or in `$AI_USE_LOG_DIR` if that is set).
   - If it does not exist: say the page is created after Claude's first reply in a project where the AI Use Log plugin is installed. If an `ai-log` folder exists without the page, they should run `/plugin update ai-use-log`, restart Claude Code, and send any message. Then stop.
2. Show the file in the computer's file browser:
   - Windows: `explorer.exe /select,"<full Windows path to AI-Use-Log.html>"` (explorer may return a non-zero exit code even when it works; ignore that).
   - macOS: `open -R "<full path to AI-Use-Log.html>"`.
   - Anything else: just print the full path.
3. Tell the student, in two or three short sentences:
   - Upload that one file, `AI-Use-Log.html`, to the Canvas assignment along with their project. Nothing needs zipping.
   - It updates itself after every reply, so upload it after their last session.
   - It contains everything they pasted into Claude and everything Claude read, so they should check nothing private is in it.
