import { getHookGroups, matcherMatches } from "../config";
import { buildHookInput, executeHook } from "../executor";
import type {
  Hook,
  HookExecutionContext,
  HookEventName,
  HookRunResult,
  NotifyFn,
  SettingsFile,
  ToolResultPatch,
} from "../types";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globToRegex(pattern: string): RegExp {
  const regex = `^${escapeRegex(pattern).replace(/\\\*/g, ".*")}$`;
  return new RegExp(regex, "i");
}

function getToolInputMatchValue(
  toolName: string,
  toolInput: Record<string, unknown> | undefined,
): string {
  if (!toolInput) return "";

  const normalizedToolName = toolName.toLowerCase();
  const getString = (...keys: string[]): string | undefined => {
    for (const key of keys) {
      const value = toolInput[key];
      if (typeof value === "string") return value;
    }
    return undefined;
  };

  switch (normalizedToolName) {
    case "bash":
      return getString("command") ?? JSON.stringify(toolInput);
    case "read":
    case "write":
    case "edit":
      return getString("path", "file_path") ?? JSON.stringify(toolInput);
    case "grep":
    case "find":
    case "glob":
      return getString("pattern", "path") ?? JSON.stringify(toolInput);
    case "ls":
      return getString("path") ?? JSON.stringify(toolInput);
    default:
      return JSON.stringify(toolInput);
  }
}

export function hookIfMatches(
  context: HookExecutionContext,
  condition: string | undefined,
): boolean {
  if (!condition) return true;

  if (
    context.hookEventName !== "PreToolUse" &&
    context.hookEventName !== "PostToolUse" &&
    context.hookEventName !== "PostToolUseFailure"
  ) {
    return false;
  }

  const toolName = context.toolName ?? "";
  const trimmed = condition.trim();
  const match = trimmed.match(/^([^()]+?)(?:\((.*)\))?$/);
  if (!match) return false;

  const expectedToolName = match[1].trim();
  const inputPattern = match[2];

  if (
    expectedToolName &&
    expectedToolName.toLowerCase() !== toolName.toLowerCase()
  ) {
    return false;
  }

  if (inputPattern === undefined) {
    return true;
  }

  const target = getToolInputMatchValue(toolName, context.toolInput);
  return globToRegex(inputPattern).test(target);
}

export function appendAdditionalContext(
  current: string | undefined,
  next: string | undefined,
): string | undefined {
  if (!next) return current;
  return current ? `${current}\n${next}` : next;
}

export function parseJsonOutput(
  stdout: string,
): Record<string, unknown> | undefined {
  const trimmed = stdout.trim();
  if (!trimmed) return undefined;

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

export function getHookSpecificOutput(
  eventName: HookEventName,
  jsonOutput: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (
    typeof jsonOutput.hookSpecificOutput !== "object" ||
    jsonOutput.hookSpecificOutput === null
  ) {
    return undefined;
  }

  const hookSpecificOutput = jsonOutput.hookSpecificOutput as Record<
    string,
    unknown
  >;
  const hookEventName = hookSpecificOutput.hookEventName;
  if (typeof hookEventName === "string" && hookEventName !== eventName) {
    return undefined;
  }

  return hookSpecificOutput;
}

export function getStringField(
  ...values: Array<string | unknown>
): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return undefined;
}

export function extractCommonOutput(
  eventName: HookEventName,
  jsonOutput: Record<string, unknown>,
): {
  hookSpecificOutput?: Record<string, unknown>;
  systemMessage?: string;
  suppressOutput: boolean;
  stopProcessing: boolean;
  stopReason?: string;
} {
  const hookSpecificOutput = getHookSpecificOutput(eventName, jsonOutput);

  return {
    hookSpecificOutput,
    systemMessage: getStringField(jsonOutput.systemMessage),
    suppressOutput: jsonOutput.suppressOutput === true,
    stopProcessing: jsonOutput.continue === false,
    stopReason: getStringField(jsonOutput.stopReason),
  };
}

export function extractToolResultPatch(
  eventName: HookEventName,
  jsonOutput: Record<string, unknown>,
): ToolResultPatch {
  const hookSpecificOutput = getHookSpecificOutput(eventName, jsonOutput);

  const updatedToolResult =
    typeof hookSpecificOutput?.updatedToolResult === "object" &&
    hookSpecificOutput.updatedToolResult !== null
      ? (hookSpecificOutput.updatedToolResult as Record<string, unknown>)
      : undefined;

  const updatedMCPToolOutput =
    hookSpecificOutput?.updatedMCPToolOutput ?? jsonOutput.updatedMCPToolOutput;

  return {
    content:
      updatedToolResult?.content ?? updatedMCPToolOutput ?? jsonOutput.content,
    details: updatedToolResult?.details ?? jsonOutput.details,
    isError:
      typeof (updatedToolResult?.isError ?? jsonOutput.isError) === "boolean"
        ? ((updatedToolResult?.isError ?? jsonOutput.isError) as boolean)
        : undefined,
  };
}

export async function executeParsedHook(
  hook: Hook,
  context: HookExecutionContext,
  eventName: HookEventName,
): Promise<{
  hookResult: { stdout: string; stderr: string; exitCode: number };
  plainStdout: string;
  jsonOutput?: Record<string, unknown>;
  commonOutput?: ReturnType<typeof extractCommonOutput>;
}> {
  const input = buildHookInput(context);
  const timeout = hook.timeout ? hook.timeout * 1000 : 60000;
  const hookResult = await executeHook(hook, input, context.cwd, timeout);
  const jsonOutput = hookResult.stdout
    ? parseJsonOutput(hookResult.stdout)
    : undefined;
  const plainStdout = hookResult.stdout.trim();

  return {
    hookResult,
    plainStdout,
    jsonOutput,
    commonOutput: jsonOutput
      ? extractCommonOutput(eventName, jsonOutput)
      : undefined,
  };
}

export async function triggerSimpleHooks(
  eventName: HookEventName,
  matcherValue: string,
  context: HookExecutionContext,
  settings: SettingsFile | undefined,
  notify?: NotifyFn,
): Promise<HookRunResult> {
  const groups = getHookGroups(settings, eventName);
  const aggregatedResult: HookRunResult = {};

  for (const group of groups) {
    const effectiveMatcher =
      eventName === "SessionEnd" ? (group.matcher ?? "other") : group.matcher;

    if (!matcherMatches(effectiveMatcher, matcherValue)) continue;

    for (const hook of group.hooks ?? []) {
      if (hook.if && !hookIfMatches(context, hook.if)) continue;

      try {
        const { hookResult, plainStdout, jsonOutput, commonOutput } =
          await executeParsedHook(hook, context, eventName);

        const additionalContext = jsonOutput
          ? getStringField(
              commonOutput?.hookSpecificOutput?.additionalContext,
              jsonOutput.additionalContext,
            )
          : undefined;
        aggregatedResult.additionalContext = appendAdditionalContext(
          aggregatedResult.additionalContext,
          additionalContext,
        );

        if (
          eventName === "SessionStart" &&
          hookResult.exitCode === 0 &&
          !jsonOutput &&
          plainStdout
        ) {
          aggregatedResult.additionalContext = appendAdditionalContext(
            aggregatedResult.additionalContext,
            plainStdout,
          );
        }

        if (commonOutput?.systemMessage) {
          notify?.(commonOutput.systemMessage, "warning");
        }

        if (hookResult.exitCode !== 0) {
          notify?.(
            `Hook 失败 (exit ${hookResult.exitCode}): ${hookResult.stderr}`,
            "error",
          );
        } else if (
          plainStdout &&
          eventName !== "SessionStart" &&
          !jsonOutput &&
          commonOutput?.suppressOutput !== true
        ) {
          notify?.(`Hook 输出: ${plainStdout}`, "info");
        }
      } catch (err) {
        notify?.(`Hook 执行错误: ${String(err)}`, "error");
      }
    }
  }

  return aggregatedResult;
}
