import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { loadSettings } from "./config";
import { extractResponseFromContent } from "./helpers";
import { triggerSessionHooks } from "./hooks/session-hooks";
import type { HookMatcherValue, SettingsFile } from "./types";

export type NotifyType = "info" | "error" | "warning";

// Debounce buffer for injectHiddenContext — module-level so parallel calls
// within the same process share one queue. 50ms window collapses a burst of
// grep/glob injections into one combined sendMessage.
const _injectBuffer: { content: string[]; details: Record<string, unknown>; timer: NodeJS.Timeout | undefined } = {
  content: [],
  details: {},
  timer: undefined,
};

export type HookModuleContext = {
  pi: ExtensionAPI;
  currentSettings: SettingsFile | undefined;
  firedSessionStartKeys: Set<string>;
  pendingUserPromptContext?: string;
  stopHookActive: boolean;
  getSessionId: (ctx: any) => string;
  notify: (ctx: any, msg: string, type: NotifyType) => void;
  injectHiddenContext: (
    content: string,
    details: Record<string, unknown>,
  ) => void;
  initSettings: (cwd: string) => SettingsFile | undefined;
  buildToolResponse: (event: {
    content: unknown;
    details?: unknown;
    isError?: boolean;
  }) => Record<string, unknown>;
  triggerSessionStartHook: (
    matcher: HookMatcherValue<"SessionStart">,
    ctx: any,
  ) => Promise<void>;
};

export function createHookContext(pi: ExtensionAPI): HookModuleContext {
  const shared: HookModuleContext = {
    pi,
    currentSettings: undefined,
    firedSessionStartKeys: new Set<string>(),
    pendingUserPromptContext: undefined,
    stopHookActive: false,
    getSessionId: (ctx: any) =>
      ctx.sessionManager.getSessionFile() ?? "ephemeral",
    notify: (ctx: any, msg: string, type: NotifyType) =>
      ctx.ui.notify(msg, type),
    injectHiddenContext: (content, details) => {
      // 50ms debounce — parallel grep/glob calls trigger concurrent sendMessage
      // calls that trip OMP's stale-guard (pending parallel tool calls skipped
      // with "Skipped due to queued user message"). Collapses a burst of parallel
      // injections into one combined sendMessage after the burst settles.
      _injectBuffer.content.push(content);
      if (details) Object.assign(_injectBuffer.details, details);
      clearTimeout(_injectBuffer.timer);
      _injectBuffer.timer = setTimeout(() => {
        const combined = _injectBuffer.content.join("\n\n");
        shared.pi.sendMessage({
          customType: "omp-hooks",
          content: combined,
          display: false,
          details: _injectBuffer.details,
        });
        _injectBuffer.content = [];
        _injectBuffer.details = {};
        _injectBuffer.timer = undefined;
      }, 50);
    },
    initSettings: (cwd: string) => {
      const { settings } = loadSettings(cwd);
      shared.currentSettings = settings;
      return settings;
    },
    buildToolResponse: (event) => {
      const toolResponse: Record<string, unknown> = {
        content: event.content,
        is_error: event.isError ?? false,
      };

      if (event.details !== undefined) {
        toolResponse.details = event.details;
      }

      const extracted = extractResponseFromContent(event.content);
      if (Object.keys(extracted).length > 0) {
        toolResponse.output = extracted.output ?? extracted;
      }

      return toolResponse;
    },
    triggerSessionStartHook: async (matcher, ctx) => {
      const sessionId = shared.getSessionId(ctx);
      const dedupeKey = `${matcher}:${sessionId}`;
      if (shared.firedSessionStartKeys.has(dedupeKey)) {
        return;
      }
      shared.firedSessionStartKeys.add(dedupeKey);

      const result = await triggerSessionHooks(
        "SessionStart",
        matcher,
        {
          sessionId,
          cwd: ctx.cwd,
          hookEventName: "SessionStart",
          source: matcher,
        },
        shared.currentSettings,
        (msg, type) => shared.notify(ctx, msg, type),
      );

      if (result.additionalContext) {
        shared.injectHiddenContext(result.additionalContext, {
          hookEventName: "SessionStart",
          source: matcher,
        });
      }
    },
  };

  return shared;
}
