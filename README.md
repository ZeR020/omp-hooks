<div align="center">

# omp-hooks

[![npm version](https://img.shields.io/npm/v/omp-hooks?style=flat-square)](https://www.npmjs.com/package/omp-hooks)
[![npm downloads](https://img.shields.io/npm/dm/omp-hooks?style=flat-square)](https://www.npmjs.com/package/omp-hooks)
[![GitHub release](https://img.shields.io/github/v/release/ZeR020/omp-hooks?style=flat-square)](https://github.com/ZeR020/omp-hooks/releases)
[![License: MIT](https://img.shields.io/github/license/ZeR020/omp-hooks?style=flat-square)](https://github.com/ZeR020/omp-hooks/blob/main/LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/ZeR020/omp-hooks?style=flat-square)](https://github.com/ZeR020/omp-hooks/stargazers)
[![CI](https://img.shields.io/github/actions/workflow/status/ZeR020/omp-hooks/ci.yml?branch=main&style=flat-square)](https://github.com/ZeR020/omp-hooks/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=flat-square)](https://www.typescriptlang.org/)

Claude Code-compatible command hooks for the OMP (Oh My Pi) coding agent.

</div>

---

This package adapts Claude Code's hook configuration format to OMP's extension event system so existing command hook workflows can be reused with minimal changes. It is a native OMP plugin — it depends on `@oh-my-pi/pi-coding-agent` directly and reads its hook config from `~/.omp/agent/settings.json` (or `<cwd>/.omp/settings.json`), so it no longer collides with a real Pi install.

## Why

OMP's native `tool_call` handler can **block** a tool, but it **cannot inject hidden context** into the LLM before a tool runs. This means tools like [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) that rely on Claude Code's PreToolUse hooks to augment search results with graph context can't work on OMP out of the box.

omp-hooks bridges that gap. It reads Claude Code's hooks config format and wires it into OMP's extension events — firing shell commands on tool/session events and injecting their output as hidden context the LLM sees alongside normal tool results.

## Features

- **9 Claude Code hook events mapped** — SessionStart, SessionEnd, PreCompact, PostCompact, PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, Stop
- **Hidden context injection** — hook command output is injected into the LLM via `sendMessage({ display: false })`, the mechanism OMP's native `tool_call` lacks
- **Claude Code config compatibility** — uses the same `settings.json` hooks format, so existing Claude Code hook scripts work with minimal changes
- **Settings from `~/.omp/agent/settings.json`** — env-overridable via `OMP_HOOKS_SETTINGS`, plus project-local `<cwd>/.omp/settings.json` (merged)
- **Debounce buffer** — parallel `grep`/`glob` calls are collapsed into one combined injection (50ms window) to avoid tripping OMP's stale-guard
- **Bridge-script compatible** — spawns hook commands via `bash -c` with JSON on stdin, parses `additionalContext` from stdout, exit-code semantics (2=block, 0+JSON=inject, non-0/non-2=notify)

## Installation

### Option 1: Install from npm (recommended)

```bash
omp install omp-hooks
```

That's it. omp-hooks is now installed and active. Restart OMP (or run `/reload`) to load it.

### Option 2: Install from GitHub

```bash
omp install git:github.com/ZeR020/omp-hooks
```

### Option 3: Let your agent install it for you

Paste this into your OMP session:

```
Install omp-hooks from npm using omp install omp-hooks and then help me set up a basic hook in ~/.omp/agent/settings.json
```

Your agent will run the install command and walk you through configuring your first hook.

### Option 4: From source (for development)

```bash
git clone https://github.com/ZeR020/omp-hooks.git
omp plugin link omp-hooks
```

### Updating

```bash
omp plugin upgrade omp-hooks
```


### After install: add your first hook

omp-hooks reads hook config from `~/.omp/agent/settings.json` (global) or `.omp/settings.json` in your project (project-local, merged on top of global). The format matches Claude Code's `settings.json` hooks structure:

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

Restart OMP (or run `/reload`), then send a message — when the agent finishes responding, your `echo` command runs and its output is injected as hidden context.

## Current Support

- Only `type: "command"` is supported
- Supports the `if` field on individual hook handlers for tool events only
- Supported events:
  - `SessionStart`
  - `SessionEnd`
  - `PreCompact`
  - `PostCompact`
  - `PreToolUse`
  - `PostToolUse`
  - `PostToolUseFailure`
  - `UserPromptSubmit`
  - `Stop`
- Not supported: `http`, `prompt`, `agent`

## Event Mapping

- `SessionStart.startup` → `session_start(reason="startup")`
- `SessionStart.startup` → `session_start(reason="new")`
- `SessionStart.resume` → `session_start(reason="resume")`
- `SessionStart.compact` → `session_compact`
- `SessionEnd.other` → `session_shutdown`
- `Stop` → `agent_end` (best-effort emulation of Claude Code's “after response completes” behavior)

## Configuration Format

Configure hooks in `~/.omp/agent/settings.json` or `.omp/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session started'"
          }
        ]
      },
      {
        "matcher": "resume",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session resumed'"
          }
        ]
      },
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Context compacted'"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Session ended on shutdown/exit'"
          }
        ]
      }
    ]
  }
}
```

## `matcher` Behavior

To stay aligned with Claude Code, `matcher` is a **single regex string**.

- Omitted `matcher` means match everything
- `""` means match everything
- `"*"` means match everything
- Any other value is treated as a regular expression
- If the regex is invalid, it falls back to exact string matching

Example:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "bash",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'bash only'"
          }
        ]
      },
      {
        "matcher": "write|edit",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'write or edit'"
          }
        ]
      }
    ]
  }
}
```

Event-specific matching fields:

### SessionStart

Matches `source`:

- `startup`
- `resume`
- `compact`

### SessionEnd

Matches `reason`:

- `other`

### PreToolUse / PostToolUse / PostToolUseFailure

Matches `tool_name`.

Note: this uses Pi's raw tool names directly, so names are usually lowercase, for example:

- `bash`
- `read`
- `write`
- `edit`
- `grep`
- `find`
- `ls`
- `mcp__.*`

Notes:

- `SessionEnd` is triggered from `session_shutdown`
- When `matcher` is omitted, it defaults to `other` for `SessionEnd`
- `UserPromptSubmit` and `Stop` do not support `matcher`; if provided, it is ignored

## `if` Conditions

Following Claude Code's approach, `if` is configured on each individual hook handler and only works for tool events:

- `PreToolUse`
- `PostToolUse`
- `PostToolUseFailure`

If `if` is set on other event types, that hook will not run.

Currently supported forms:

- `Bash(git *)`
- `bash(git *)`
- `Edit(*.ts)`
- `Write(*.md)`
- `mcp__memory__create_entities(*)`

Rules:

- `if` syntax is `ToolName(pattern)`
- `ToolName` is compared case-insensitively
- `pattern` uses simple wildcard matching where `*` means any string
- `bash` mainly matches `tool_input.command`
- `read`, `write`, and `edit` mainly match `tool_input.path` (or `file_path`)
- Other tools first try common primary fields, then fall back to the JSON string of `tool_input`

Example: block only `git push`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(git push*)",
            "command": "printf '%s\n' '{\"hookSpecificOutput\":{\"hookEventName\":\"PreToolUse\",\"permissionDecision\":\"deny\",\"permissionDecisionReason\":\"git push is blocked\"}}'"
          }
        ]
      }
    ]
  }
}
```

## Hook Input

Input fields are designed to be as close as possible to Claude Code hooks:

- Common fields: `session_id`, `transcript_path`, `cwd`, `hook_event_name`
- Event-specific fields such as `source`, `reason`, `tool_name`, `tool_input`, `tool_response`
- **Pi-specific extra fields may also be included**, but they should not break Claude Code-style scripts

### SessionStart

```json
{
  "session_id": "session-file-path",
  "transcript_path": "/path/to/session.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "SessionStart",
  "source": "startup"
}
```

### SessionEnd

```json
{
  "session_id": "session-file-path",
  "transcript_path": "/path/to/session.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "SessionEnd",
  "reason": "other"
}
```

### UserPromptSubmit

```json
{
  "session_id": "session-file-path",
  "transcript_path": "/path/to/session.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "UserPromptSubmit",
  "prompt": "Write a function to calculate the factorial of a number"
}
```

Notes:

- `UserPromptSubmit` does not support `matcher`; if configured, it is ignored
- It runs after the user submits input and before the agent loop starts

### Stop

Mapped from Pi's `agent_end` event.

```json
{
  "session_id": "session-file-path",
  "transcript_path": "/path/to/session.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "Stop",
  "stop_hook_active": false,
  "last_assistant_message": "I have completed the task."
}
```

Notes:

- `Stop` runs after the current agent turn finishes
- `Stop` does not support `matcher`; if configured, it is ignored
- `stop_hook_active` indicates whether the current continuation was triggered by a previous `Stop` hook
- `last_assistant_message` tries to extract the last assistant text content; if none exists, it is an empty string
- When `decision: "block"` is returned, the extension best-effort simulates Claude Code's “prevent stopping and continue” behavior by injecting hidden context and starting another agent turn

### PreToolUse

Mapped from Pi's `tool_call` event.

```json
{
  "session_id": "session-file-path",
  "transcript_path": "/path/to/session.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "PreToolUse",
  "tool_name": "bash",
  "tool_input": {
    "command": "ls -la"
  },
  "tool_use_id": "toolu_123"
}
```

Notes:

- `PreToolUse` runs before the tool actually executes
- It maps to Pi's `tool_call`, not `tool_execution_start`
- `matcher` is supported and is applied to `tool_name`
- `permission_mode` is not included
- `tool_name` uses Pi's original event value without case conversion
- `tool_input` comes from `tool_call.event.input`
- `tool_use_id` comes from `tool_call.event.toolCallId`

### PostToolUse

Mapped from Pi's `tool_result` event and only fired when the tool succeeds.

```json
{
  "session_id": "session-file-path",
  "transcript_path": "/path/to/session.jsonl",
  "cwd": "/current/working/directory",
  "hook_event_name": "PostToolUse",
  "tool_name": "bash",
  "tool_input": {
    "command": "pwd"
  },
  "tool_response": {
    "content": [
      {
        "type": "text",
        "text": "/tmp/project"
      }
    ],
    "details": {},
    "is_error": false,
    "output": "/tmp/project"
  },
  "tool_use_id": "toolu_123"
}
```

Notes:

- `PostToolUse` runs after successful tool execution
- It maps to Pi's `tool_result`
- `permission_mode` is not included
- `tool_name` uses Pi's original event value without case conversion
- `tool_input` comes from `tool_result.event.input`
- `tool_response` is the Claude Code-style compatible tool result object
- `tool_use_id` comes from `tool_result.event.toolCallId`
- Failed tool results are routed to `PostToolUseFailure` instead of `PostToolUse`

## Hook Output

### UserPromptSubmit: block the prompt or inject extra context

```json
{
  "decision": "block",
  "reason": "Explanation for decision",
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "My additional context here"
  }
}
```

Notes:

- For `UserPromptSubmit`, the only meaningful `decision` value is `"block"`
- Omitting `decision` means allow
- Other values are ignored
- `reason` is shown to the user but not injected into context
- `additionalContext` is injected as hidden context into the current turn

### Stop: prevent stopping and continue for one more turn

```json
{
  "decision": "block",
  "reason": "Run a final self-check before stopping",
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "Verify there are no missing tests."
  }
}
```

Notes:

- For `Stop`, the only meaningful `decision` value is `"block"`
- Omitting `decision` means finish normally
- `reason` is injected as hidden context into the follow-up agent turn
- `additionalContext` is injected together with `reason` when `decision: "block"`; if no continuation happens, it is not kept for later user input
- `stop_hook_active` becomes `true` in follow-up `Stop` events triggered by a previous `Stop` hook, which helps avoid infinite loops
- The current implementation is based on Pi's `agent_end` + `sendMessage(..., { triggerTurn: true })`, so behavior is best-effort

### PreToolUse: deny or rewrite input

Available output fields:

- `permissionDecision`: `"allow" | "deny" | "ask"`
- `permissionDecisionReason`: the reason shown to the user/caller
- `updatedInput`: rewrites tool input before execution
- `additionalContext`: appends extra context for later processing

Example: deny execution

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Dangerous command blocked"
  }
}
```

Example: allow and rewrite input

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

Notes:

- `permissionDecision: "deny"` blocks the current tool call and returns `permissionDecisionReason` to the agent; it does **not** directly stop the entire current processing flow
- `permissionDecision: "allow"` lets the tool run; if `updatedInput` is provided, the input is merged before execution
- `permissionDecision: "ask"` is kept for compatibility only; this extension does not open an additional permission UI
- `updatedInput` is merged into `event.input`, while unspecified fields keep their original values
- `additionalContext` does not block execution; it is only injected as hidden context and does not normally create an extra UI message
- To explicitly stop the current processing flow, use Claude Code's generic field `continue: false`

### PostToolUse: append context or patch tool results

Claude Code-style output example:

```json
{
  "decision": "block",
  "reason": "Explanation for decision",
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Additional information for Claude"
  }
}
```

Or:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Command succeeded"
  }
}
```

Pi-specific direct result patching is also supported:

```json
{
  "systemMessage": "Hook patched tool result",
  "content": [
    {
      "type": "text",
      "text": "patched result"
    }
  ],
  "isError": false
}
```

Claude Code generic output fields are also supported:

```json
{
  "continue": false,
  "stopReason": "Stop current processing",
  "systemMessage": "Hook requested stop"
}
```

Notes:

- `hookSpecificOutput.hookEventName` is recognized following Claude Code behavior
- `decision: "block"` does not roll back an already executed tool; instead, `reason` is appended to model context as feedback
- `additionalContext` is injected into the current agent flow as hidden context, approximating Claude Code's “append context for Claude” behavior; it does not normally produce an extra UI message
- `systemMessage` is silent by default for tool-related events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`) and does not normally generate an extra UI message
- `continue: false` stops current processing in tool events on a best-effort basis; this is different from `PreToolUse.permissionDecision: "deny"`, which only blocks the current tool and returns a reason to the agent
- For `PostToolUse` and `PostToolUseFailure`, stop-processing behavior does not add an extra local warning by default; the hook's own returned message/result takes precedence
- In addition to Claude Code-compatible fields, OMP result patching is also supported:
  - top-level `content`, `details`, `isError`
  - `hookSpecificOutput.updatedToolResult`
  - `updatedMCPToolOutput` (for MCP tool output replacement)
  - `hookSpecificOutput.updatedMCPToolOutput`

## Project Structure

Source code lives in `src/`:

### Files

- `src/omp-hooks.ts` - extension entry point
- `src/config.ts` - config loading and merging
- `src/executor.ts` - command hook executor
- `src/hook-context.ts` - hook context, `injectHiddenContext`, debounce buffer
- `src/hooks/shared.ts` - shared parsing and execution helpers
- `src/hooks/session-hooks.ts` - `SessionStart` / `SessionEnd`
- `src/hooks/compact-hooks.ts` - `PreCompact` / `PostCompact`
- `src/hooks/prompt-hooks.ts` - `UserPromptSubmit`
- `src/hooks/tool-hooks.ts` - `PreToolUse` / `PostToolUse` / `PostToolUseFailure`
- `src/hooks/stop-hooks.ts` - `Stop`
- `src/types.ts` - type definitions

## Notes

- Hook commands run in the current session `cwd`
- Global config and project config are merged by concatenating event arrays
- `PostToolUse` and `PostToolUseFailure` support OMP result patching
- Input/output aims to be Claude Code-compatible where possible; anything that cannot be mapped exactly is handled in a best-effort way using OMP's event model
