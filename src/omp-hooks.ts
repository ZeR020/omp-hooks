import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { createHookContext } from "./hook-context";
import { registerCompactHooks } from "./hooks/compact-hooks";
import { registerPromptHooks } from "./hooks/prompt-hooks";
import { registerSessionHooks } from "./hooks/session-hooks";
import { registerStopHooks } from "./hooks/stop-hooks";
import { registerToolHooks } from "./hooks/tool-hooks";

// ============================================================================
// 扩展主入口
// ============================================================================

export default function (pi: ExtensionAPI) {
  const shared = createHookContext(pi);

  registerSessionHooks(pi, shared);
  registerCompactHooks(pi, shared);
  registerPromptHooks(pi, shared);
  registerStopHooks(pi, shared);
  registerToolHooks(pi, shared);
}
