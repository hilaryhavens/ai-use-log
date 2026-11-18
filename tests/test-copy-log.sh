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

PAGE=AI-Use-Log.html
has()   { grep -qF -- "$2" "$1"; }
count() { grep -oF -- "$2" "$1" | wc -l | tr -d ' '; }

echo "page created"
P="$T/proj8"; C="$T/claude8"; mkdir -p "$P"; make_session "$C" s8
run_hook "$P" "{\"session_id\":\"s8\",\"transcript_path\":\"$C/s8.jsonl\",\"cwd\":\"$P\"}"
F="$P/ai-log/$PAGE"
[ -f "$F" ] && ok "page exists" || bad "page exists" "$(ls "$P/ai-log")"
has "$F" "class=\"log\" data-path=\"${TODAY}_s8.jsonl\"" && ok "main block" || bad "main block"
has "$F" "data-path=\"${TODAY}_s8/subagents/agent-abc.jsonl\"" && ok "agent block" || bad "agent block"
has "$F" "data-path=\"${TODAY}_s8/subagents/agent-abc.meta.json\"" && ok "meta block" || bad "meta block"
! has "$F" "tool-results" && ok "no tool-results" || bad "no tool-results"
has "$F" 'id="ai-log-meta">{"project":"proj8","updated":"' && ok "header meta" || bad "header meta"
has "$F" 'function parseSession(' && ok "viewer inlined" || bad "viewer inlined"
[ "$CODE" = 0 ] && [ -z "$OUT" ] && ok "still silent" || bad "still silent" "$CODE $OUT"

echo "rebuild"
C2="$T/claude8b"; make_session "$C2" s8b
run_hook "$P" "{\"session_id\":\"s8b\",\"transcript_path\":\"$C2/s8b.jsonl\",\"cwd\":\"$P\"}"
has "$F" "data-path=\"${TODAY}_s8.jsonl\"" && has "$F" "data-path=\"${TODAY}_s8b.jsonl\"" && ok "both sessions" || bad "both sessions"
[ "$(count "$F" '<!doctype')" = 1 ] && ok "one page, not appended" || bad "one page, not appended" "$(count "$F" '<!doctype')"
[ ! -e "$F.tmp" ] && ok "no tmp left" || bad "no tmp left"

echo "script-tag injection"
P="$T/proj9"; C="$T/claude9"; mkdir -p "$P"; make_session "$C" s9
printf '%s\n' '{"type":"user","message":{"role":"user","content":"</script><script>alert(1)</script><!--"}}' >> "$C/s9.jsonl"
run_hook "$P" "{\"session_id\":\"s9\",\"transcript_path\":\"$C/s9.jsonl\",\"cwd\":\"$P\"}"
F="$P/ai-log/$PAGE"
has "$F" '\u003c/script>\u003cscript>alert(1)\u003c/script>\u003c!--' && ok "data escaped" || bad "data escaped"
[ "$(count "$F" '</script>')" = "$(count "$F" '<script')" ] && ok "tags balanced" || bad "tags balanced" "$(count "$F" '</script>') vs $(count "$F" '<script')"
cmp -s "$C/s9.jsonl" "$P/ai-log/${TODAY}_s9.jsonl" && ok "jsonl copy untouched" || bad "jsonl copy untouched"

echo "odd project name"
P="$T/Proj \"A\" <b>"
if mkdir -p "$P" 2>/dev/null; then
  C="$T/claude10"; make_session "$C" s10
  run_hook "$P" "{\"session_id\":\"s10\",\"transcript_path\":\"$C/s10.jsonl\",\"cwd\":\"x\"}"
  has "$P/ai-log/$PAGE" '{"project":"Proj \"A\" \u003cb>"' && ok "name escaped" || bad "name escaped" "$(grep -o 'ai-log-meta">[^<]*' "$P/ai-log/$PAGE")"
else
  echo "  skip (filesystem refuses the name)"
fi

echo "single session no agents"
P="$T/proj11"; C="$T/claude11"; mkdir -p "$P" "$C"
printf '{"type":"user","message":{"role":"user","content":"hi"}}\n' > "$C/s11.jsonl"
run_hook "$P" "{\"session_id\":\"s11\",\"transcript_path\":\"$C/s11.jsonl\",\"cwd\":\"$P\"}"
[ "$(count "$P/ai-log/$PAGE" 'class="log"')" = 1 ] && ok "one log block" || bad "one log block"
[ "$CODE" = 0 ] && [ -z "$OUT" ] && ok "still silent" || bad "still silent" "$CODE $OUT"

echo "stale tmp from an interrupted rebuild"
P="$T/proj13"; C="$T/claude13"; mkdir -p "$P/ai-log"; make_session "$C" s13
echo partial > "$P/ai-log/$PAGE.tmp.99999"; touch -d '1 hour ago' "$P/ai-log/$PAGE.tmp.99999"
echo partial > "$P/ai-log/$PAGE.tmp"; touch -d '1 hour ago' "$P/ai-log/$PAGE.tmp"
echo inflight > "$P/ai-log/$PAGE.tmp.88888"
run_hook "$P" "{\"session_id\":\"s13\",\"transcript_path\":\"$C/s13.jsonl\",\"cwd\":\"$P\"}"
[ ! -e "$P/ai-log/$PAGE.tmp.99999" ] && [ ! -e "$P/ai-log/$PAGE.tmp" ] && ok "old tmp removed" || bad "old tmp removed" "$(ls "$P/ai-log")"
[ -e "$P/ai-log/$PAGE.tmp.88888" ] && ok "fresh tmp (another run) left alone" || bad "fresh tmp (another run) left alone"
has "$P/ai-log/$PAGE" "data-path=\"${TODAY}_s13.jsonl\"" && ok "page still written" || bad "page still written"

echo "per-run tmp name"
grep -q 'AI-Use-Log.html.tmp.\$\$\|out.tmp.\$\$\|\$out\.tmp\.\$\$' "$HOOK" && ok "tmp name includes PID" || bad "tmp name includes PID"

echo "hook called by Windows path (as run-hook.cmd does)"
if command -v cygpath >/dev/null 2>&1; then
  P="$T/proj12"; C="$T/claude12"; mkdir -p "$P"; make_session "$C" s12
  WINHOOK="$(cygpath -w "$HOOK")"
  (cd "$T" && printf '%s' "{\"session_id\":\"s12\",\"transcript_path\":\"$C/s12.jsonl\",\"cwd\":\"$P\"}" \
    | CLAUDE_PROJECT_DIR="$P" bash "$WINHOOK" >/dev/null 2>&1)
  [ -f "$P/ai-log/$PAGE" ] && ok "page via windows path" || bad "page via windows path" "$WINHOOK"
else
  echo "  skip (no cygpath)"
fi

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" = 0 ]
