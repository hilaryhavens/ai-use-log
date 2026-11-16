#!/usr/bin/env bash
# Tests for hooks/copy-log. Run: bash tests/test-copy-log.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
HOOK="$HERE/../hooks/copy-log"
PASS=0; FAIL=0
TODAY="$(date +%Y-%m-%d)"

ok()   { PASS=$((PASS+1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1${2:+ — $2}"; }

# make_session <claude-projects-dir> <session-id>: creates a fake transcript + subagent + tool-result
make_session() {
  mkdir -p "$1/$2/subagents" "$1/$2/tool-results"
  printf '{"type":"user","message":{"role":"user","content":"hello"}}\n' > "$1/$2.jsonl"
  printf '{"type":"user","isSidechain":true}\n' > "$1/$2/subagents/agent-abc.jsonl"
  printf '{"toolUseId":"toolu_1"}\n' > "$1/$2/subagents/agent-abc.meta.json"
  printf 'big output\n' > "$1/$2/tool-results/toolu_9.txt"
}

# run_hook <project-dir> <json>: runs the hook, captures stdout and exit code
run_hook() {
  OUT="$(printf '%s' "$2" | CLAUDE_PROJECT_DIR="$1" bash "$HOOK" 2>/dev/null)"; CODE=$?
}

T="$(mktemp -d)"; trap 'rm -rf "$T"' EXIT

echo "copies main transcript"
P="$T/proj1"; C="$T/claude1"; mkdir -p "$P"; make_session "$C" s1
run_hook "$P" "{\"session_id\":\"s1\",\"transcript_path\":\"$C/s1.jsonl\",\"cwd\":\"$P\",\"hook_event_name\":\"Stop\"}"
[ -f "$P/ai-log/${TODAY}_s1.jsonl" ] && ok "main file" || bad "main file" "$(ls -R "$P" 2>&1)"
cmp -s "$C/s1.jsonl" "$P/ai-log/${TODAY}_s1.jsonl" && ok "identical content" || bad "identical content"
[ "$CODE" = 0 ] && ok "exit 0" || bad "exit 0" "$CODE"
[ -z "$OUT" ] && ok "no stdout" || bad "no stdout" "$OUT"

echo "copies subagents and tool-results"
[ -f "$P/ai-log/${TODAY}_s1/subagents/agent-abc.jsonl" ] && ok "subagent jsonl" || bad "subagent jsonl"
[ -f "$P/ai-log/${TODAY}_s1/subagents/agent-abc.meta.json" ] && ok "subagent meta" || bad "subagent meta"
[ -f "$P/ai-log/${TODAY}_s1/tool-results/toolu_9.txt" ] && ok "tool-results" || bad "tool-results"

echo "spaces in project path"
P="$T/My Project - Fall 2026"; C="$T/claude dir 2"; mkdir -p "$P"; make_session "$C" s2
run_hook "$P" "{\"session_id\":\"s2\",\"transcript_path\":\"$C/s2.jsonl\",\"cwd\":\"$P\"}"
[ -f "$P/ai-log/${TODAY}_s2.jsonl" ] && ok "copied with spaces" || bad "copied with spaces"

echo "windows-style transcript_path"
if command -v cygpath >/dev/null 2>&1; then
  P="$T/proj3"; C="$T/claude3"; mkdir -p "$P"; make_session "$C" s3
  WIN="$(cygpath -w "$C/s3.jsonl" | sed 's/\\/\\\\/g')"
  run_hook "$P" "{\"session_id\":\"s3\",\"transcript_path\":\"$WIN\",\"cwd\":\"x\"}"
  [ -f "$P/ai-log/${TODAY}_s3.jsonl" ] && ok "windows path" || bad "windows path" "$WIN"
  [ -f "$P/ai-log/${TODAY}_s3/subagents/agent-abc.jsonl" ] && ok "windows path subagents" || bad "windows path subagents"
else
  echo "  skip (no cygpath)"
fi

echo "falls back to cwd when CLAUDE_PROJECT_DIR unset"
P="$T/proj4"; C="$T/claude4"; mkdir -p "$P"; make_session "$C" s4
printf '%s' "{\"session_id\":\"s4\",\"transcript_path\":\"$C/s4.jsonl\",\"cwd\":\"$P\"}" | env -u CLAUDE_PROJECT_DIR bash "$HOOK" >/dev/null 2>&1
[ -f "$P/ai-log/${TODAY}_s4.jsonl" ] && ok "cwd fallback" || bad "cwd fallback"

echo "reuses existing dated file"
P="$T/proj5"; C="$T/claude5"; mkdir -p "$P/ai-log"; make_session "$C" s5
echo old > "$P/ai-log/2026-01-01_s5.jsonl"
run_hook "$P" "{\"session_id\":\"s5\",\"transcript_path\":\"$C/s5.jsonl\",\"cwd\":\"$P\"}"
cmp -s "$C/s5.jsonl" "$P/ai-log/2026-01-01_s5.jsonl" && ok "old file updated" || bad "old file updated"
[ "$(ls "$P/ai-log"/*_s5.jsonl | wc -l)" = 1 ] && ok "no second file" || bad "no second file" "$(ls "$P/ai-log")"
[ -d "$P/ai-log/2026-01-01_s5/subagents" ] && ok "subagents under old date" || bad "subagents under old date"

echo "missing transcript"
P="$T/proj6"; mkdir -p "$P"
run_hook "$P" "{\"session_id\":\"s6\",\"transcript_path\":\"$T/nope.jsonl\",\"cwd\":\"$P\"}"
[ "$CODE" = 0 ] && [ -z "$OUT" ] && ok "exit 0 silently" || bad "exit 0 silently" "$CODE $OUT"
[ ! -e "$P/ai-log" ] && ok "no ai-log created" || bad "no ai-log created"

echo "garbage stdin"
run_hook "$P" "not json at all"
[ "$CODE" = 0 ] && [ -z "$OUT" ] && ok "exit 0 silently" || bad "exit 0 silently" "$CODE $OUT"

echo "session id with path characters is rejected"
P="$T/proj7"; C="$T/claude7"; mkdir -p "$P"; make_session "$C" s7
run_hook "$P" "{\"session_id\":\"../evil\",\"transcript_path\":\"$C/s7.jsonl\",\"cwd\":\"$P\"}"
[ ! -e "$P/evil.jsonl" ] && [ ! -e "$T/evil.jsonl" ] && [ "$CODE" = 0 ] && ok "no escape" || bad "no escape"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = 0 ]
