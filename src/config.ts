import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HookEventName, HookGroup, HooksConfig, SettingsFile } from "./types";

// ============================================================================
// 配置读取
// ============================================================================

export const GLOBAL_SETTINGS_PATH =
  process.env.OMP_HOOKS_SETTINGS ??
  path.join(os.homedir(), ".omp", "agent", "settings.json");

const HOOK_KEYS: Array<keyof HooksConfig> = [
  "SessionStart",
  "SessionEnd",
  "PreCompact",
  "PostCompact",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "UserPromptSubmit",
  "Stop",
  "session_start",
  "session_end",
  "pre_compact",
  "post_compact",
  "pre_tool_use",
  "post_tool_use",
  "post_tool_use_failure",
  "user_prompt_submit",
  "stop",
];

const CLAUDE_TOOL_NAMES: Record<string, string> = {
  bash: "Bash",
  bashoutput: "BashOutput",
  edit: "Edit",
  glob: "Glob",
  grep: "Grep",
  killbash: "KillBash",
  ls: "LS",
  multiedit: "MultiEdit",
  notebookedit: "NotebookEdit",
  read: "Read",
  task: "Task",
  todowrite: "TodoWrite",
  webfetch: "WebFetch",
  websearch: "WebSearch",
  write: "Write",
};

const EXACT_MATCHER = /^[\w\s,|-]+$/;

export function toClaudeToolName(toolName: string): string {
  const key = toolName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return CLAUDE_TOOL_NAMES[key] ?? toolName;
}

export function readSettingsFile(settingsPath: string): SettingsFile | undefined {
  if (!existsSync(settingsPath)) {
    return undefined;
  }

  try {
    const raw = readFileSync(settingsPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed as SettingsFile;
  } catch {
    return undefined;
  }
}

function mergeHooks(
  globalHooks: HooksConfig | undefined,
  projectHooks: HooksConfig | undefined,
): HooksConfig | undefined {
  const merged: HooksConfig = {};
  let hasAnyHook = false;

  for (const key of HOOK_KEYS) {
    const groups = [
      ...(globalHooks?.[key] ?? []),
      ...(projectHooks?.[key] ?? []),
    ];

    if (groups.length > 0) {
      merged[key] = groups;
      hasAnyHook = true;
    }
  }

  return hasAnyHook ? merged : undefined;
}

export function loadSettings(cwd: string): {
  settings: SettingsFile | undefined;
  sourcePaths: string[];
} {
  const projectSettingsPath = path.join(cwd, ".omp", "settings.json");
  const globalSettings = readSettingsFile(GLOBAL_SETTINGS_PATH);
  const projectSettings = readSettingsFile(projectSettingsPath);

  const sourcePaths = [GLOBAL_SETTINGS_PATH, projectSettingsPath].filter((p) =>
    existsSync(p),
  );

  const hooks = mergeHooks(globalSettings?.hooks, projectSettings?.hooks);

  if (!hooks) {
    return { settings: undefined, sourcePaths };
  }

  return {
    settings: { hooks },
    sourcePaths,
  };
}

export function getHookGroups(
  settings: SettingsFile | undefined,
  eventName: HookEventName,
): HookGroup[] {
  const hooks = settings?.hooks;
  if (!hooks) return [];

  switch (eventName) {
    case "SessionStart":
      return [...(hooks.SessionStart ?? []), ...(hooks.session_start ?? [])];
    case "SessionEnd":
      return [...(hooks.SessionEnd ?? []), ...(hooks.session_end ?? [])];
    case "PreCompact":
      return [...(hooks.PreCompact ?? []), ...(hooks.pre_compact ?? [])];
    case "PostCompact":
      return [...(hooks.PostCompact ?? []), ...(hooks.post_compact ?? [])];
    case "PreToolUse":
      return [...(hooks.PreToolUse ?? []), ...(hooks.pre_tool_use ?? [])];
    case "PostToolUse":
      return [...(hooks.PostToolUse ?? []), ...(hooks.post_tool_use ?? [])];
    case "PostToolUseFailure":
      return [
        ...(hooks.PostToolUseFailure ?? []),
        ...(hooks.post_tool_use_failure ?? []),
      ];
    case "UserPromptSubmit":
      return [
        ...(hooks.UserPromptSubmit ?? []),
        ...(hooks.user_prompt_submit ?? []),
      ];
    case "Stop":
      return [...(hooks.Stop ?? []), ...(hooks.stop ?? [])];
    default:
      return [];
  }
}

/**
 * Match Claude Code matcher semantics:
 * omitted / "" / "*" match all; plain names and comma/pipe-separated lists are
 * exact matches; anything with regex syntax is treated as a JavaScript regex.
 */
export function matcherMatches(
  matcher: string | undefined,
  value: string,
  aliases: string[] = [],
): boolean {
  const trimmed = matcher?.trim();
  if (!trimmed || trimmed === "*") return true;

  const values = [value, ...aliases];

  if (EXACT_MATCHER.test(trimmed)) {
    return trimmed
      .split(/[|,]/)
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => values.includes(part));
  }

  try {
    const regex = new RegExp(trimmed);
    return values.some((candidate) => regex.test(candidate));
  } catch {
    return values.includes(trimmed);
  }
}
