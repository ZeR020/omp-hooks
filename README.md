<div align="center">

# omp-hooks

[![npm version](https://img.shields.io/npm/v/omp-hooks?style=flat-square)](https://www.npmjs.com/package/omp-hooks)
[![npm downloads](https://img.shields.io/npm/dm/omp-hooks?style=flat-square)](https://www.npmjs.com/package/omp-hooks)
[![GitHub release](https://img.shields.io/github/v/release/ZeR020/omp-hooks?style=flat-square)](https://github.com/ZeR020/omp-hooks/releases)
[![CI](https://img.shields.io/github/actions/workflow/status/ZeR020/omp-hooks/ci.yml?branch=main&style=flat-square)](https://github.com/ZeR020/omp-hooks/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/github/license/ZeR020/omp-hooks?style=flat-square)](https://github.com/ZeR020/omp-hooks/blob/main/LICENSE)

Claude Code-style command hooks for OMP (Oh My Pi).

</div>

---

`omp-hooks` lets OMP run Claude Code-style `settings.json` command hooks.
It is useful when a Claude-native tool already writes hook config, but OMP only
loads its MCP/skills/extension surfaces and does not execute Claude hook arrays.

OMP already has native extensions and hook APIs. Use those when you are writing a
new OMP-only plugin. Use `omp-hooks` when you want to reuse Claude Code command
hook workflows such as `PreToolUse`, `SessionStart`, or `Stop` scripts.

## Install

```bash
omp install omp-hooks
```

Then restart OMP or run `/reload`.

### Install from GitHub

```bash
omp install git:github.com/ZeR020/omp-hooks
```

### Local development

```bash
git clone https://github.com/ZeR020/omp-hooks.git
omp plugin link ./omp-hooks
```

## Quick start

Create `~/.omp/agent/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'agent finished'"
          }
        ]
      }
    ]
  }
}
```

Restart OMP. When the agent finishes a response, the command runs and stdout is
injected as hidden context for the model.

Project-local config is also supported at:

```text
<project>/.omp/settings.json
```

Project config is merged over global config. Override the settings path with:

```bash
OMP_HOOKS_SETTINGS=/path/to/settings.json
```

## What this solves

Claude Code hooks are configured as JSON command handlers. OMP's native
extension API can block tools and send custom context, but it does not execute
Claude `settings.json` hook arrays directly. `omp-hooks` bridges that gap:

```text
Claude-style hook config
        ↓
omp-hooks
        ↓
OMP extension events
        ↓
command stdout → hidden model context
```

This is especially useful for tools that augment context before tool calls, such
as code graph or skill-discovery helpers.

## Supported Claude hook subset

`omp-hooks` intentionally supports the command-hook subset. It does not try to
implement every Claude Code hook feature.

### Handler type

| Claude handler type | Status |
| --- | --- |
| `command` | Supported |
| `http` | Not supported |
| `prompt` | Not supported |
| `agent` | Not supported |
| `mcp_tool` | Not supported |

### Command fields

| Field | Status | Notes |
| --- | --- | --- |
| `command` | Supported | Shell form by default. |
| `args` | Supported | Exec form; no shell when present. |
| `timeout` | Supported | Seconds. |
| `shell` | Supported | `bash` by default; `powershell` supported for shell form. |
| `async` | Supported | Runs in the background. Blocking decisions are ignored. |
| `asyncRewake` | Best effort | Exit code 2 injects a hidden reminder and asks OMP to start another turn. |
| `if` | Tool events only | Supports `ToolName(pattern)` with `*` wildcards. |

### Events

| Claude event | OMP event | Status |
| --- | --- | --- |
| `SessionStart.startup` | `session_start` | Supported |
| `SessionStart.resume` | `session_before_switch(reason="resume")` | Supported |
| `SessionStart.compact` | `session_compact` | Supported |
| `SessionEnd.other` | `session_shutdown` | Supported |
| `PreCompact` | `session_before_compact` | Supported |
| `PostCompact` | `session_compact` | Supported |
| `PreToolUse` | `tool_call` | Supported |
| `PostToolUse` | `tool_result` success | Supported |
| `PostToolUseFailure` | `tool_result` error | Supported |
| `UserPromptSubmit` | `input` / before-agent injection | Supported |
| `Stop` | `agent_end` | Best effort |

Not supported yet: `PostToolBatch`, `PermissionRequest`, `PermissionDenied`,
`Notification`, `MessageDisplay`, `SubagentStart`, `SubagentStop`, `StopFailure`,
and newer Claude events that have no direct OMP mapping yet.

## Matchers

`matcher` follows Claude Code-style matching:

- omitted, `""`, or `"*"` → match all
- plain names → exact match, for example `"Bash"`
- pipe/comma lists → exact alternatives, for example `"Edit|Write"` or `"Edit, Write"`
- regex syntax → JavaScript regex, for example `"mcp__.*"`

OMP raw tool names are normalized to Claude-style tool names before matching:

| OMP | Hook payload / matcher |
| --- | --- |
| `bash` | `Bash` |
| `read` | `Read` |
| `write` | `Write` |
| `edit` | `Edit` |
| `grep` | `Grep` |
| `glob` | `Glob` |
| `ls` | `LS` |
| `mcp__...` | unchanged |

Lowercase matchers such as `"bash"` still work for existing configs.

## Examples

### Run a command before Bash tools

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash is about to run'"
          }
        ]
      }
    ]
  }
}
```

### Block `git push`

Exit code `2` blocks synchronous tool hooks. Stderr becomes the reason.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(git push*)",
            "command": "echo 'git push is blocked from this agent' >&2; exit 2"
          }
        ]
      }
    ]
  }
}
```

### Use exec form with `args`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Grep|Glob",
        "hooks": [
          {
            "type": "command",
            "command": "/home/me/.local/bin/codebase-memory-mcp",
            "args": ["hook-augment"]
          }
        ]
      }
    ]
  }
}
```

### Inject structured additional context

A command can print Claude-style JSON:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "Relevant context for the next tool call."
  }
}
```

For simple hooks, plain stdout is also injected as hidden context.

### Replace tool output (`PostToolUse` only)

A `PostToolUse` hook can replace what the model sees by returning `updatedToolOutput`:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "updatedToolOutput": "replacement content the model sees instead"
  }
}
```

The value is passed through as OMP-shaped `content`. For MCP tools, `updatedMCPToolOutput` is also accepted. The tool has already run — only what the model sees changes.

## Hook input

Hook commands receive JSON on stdin. Common fields include:

```json
{
  "session_id": "...",
  "cwd": "/path/to/project",
  "hook_event_name": "PreToolUse"
}
```

Tool events also include:

```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "git status" },
  "tool_use_id": "..."
}
```

Post-tool events include `tool_response` and, on failures, `error`.

## Exit and output behavior

| Result | Behavior |
| --- | --- |
| exit `0`, plain stdout | Inject stdout as hidden context. |
| exit `0`, JSON stdout | Parse Claude-style output fields. |
| exit `2` in `PreToolUse` | Block the tool; stderr is the reason. |
| other non-zero | Notify the user; do not block. |
| `async: true` | Return immediately; inject JSON `additionalContext` when the process exits. |

## Parallel execution

Matching hooks run in parallel (Claude Code behavior). When multiple hooks match the same event:

- **All hooks fire concurrently** via `Promise.allSettled` — total time is `max(hook durations)`, not the sum.
- **Identical handlers are deduplicated** by `command` + `args` (so a hook defined in both global and project settings fires once).
- **Deny wins**: for `PreToolUse`, if any hook returns `deny`/exit-2, the tool is blocked regardless of `allow` from other hooks. `stopProcessing` wins over deny.
- **`updatedInput` merges** in config order (last wins per key).
- **`additionalContext` concatenates** in config order for stable output.
- **PostToolUse patches**: first non-undefined `content`/`details`/`isError` wins (by config order).

## Development

```bash
bun install
bun run typecheck
bun run build
```

`dist/` is build output only. OMP loads the TypeScript source entry directly:

```text
src/omp-hooks.ts
```

## Relationship to OMP native hooks

OMP native extensions are still the best choice for new OMP-specific plugins.
They are more powerful and typed directly against OMP. `omp-hooks` exists for a
different reason: compatibility with Claude Code-style command hook config.

If you control the plugin and only target OMP, write an OMP extension. If you are
porting a Claude Code tool that already ships command hooks, use `omp-hooks`.

## License

MIT
