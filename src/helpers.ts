// ============================================================================
// 辅助函数：从 content 提取信息
// ============================================================================

export function extractTextFromContent(content: unknown): string {
  if (!content) return "";

  if (Array.isArray(content)) {
    const textItems = content.filter(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        item.type === "text" &&
        typeof item.text === "string",
    );

    if (textItems.length > 0) {
      return textItems.map((item) => item.text).join("\n");
    }
  }

  if (typeof content === "string") {
    return content;
  }

  if (typeof content === "object" && content !== null) {
    if ("text" in content && typeof content.text === "string") {
      return content.text;
    }
  }

  return "";
}

/**
 * 从 tool result content 中提取错误信息
 */
export function extractErrorFromContent(content: unknown): string {
  if (!content) return "Unknown error";

  const text = extractTextFromContent(content);
  if (text) {
    return text;
  }

  return JSON.stringify(content);
}

/**
 * 从 tool result content 中提取响应对象
 */
export function extractResponseFromContent(content: unknown): Record<string, unknown> {
  if (!content) return {};

  // content 可能是数组或单个对象
  if (Array.isArray(content)) {
    // 尝试构建响应对象
    const response: Record<string, unknown> = {};
    for (const item of content) {
      if (item.type === "text" && typeof item.text === "string") {
        response.output = item.text;
      }
    }
    return response;
  }

  if (typeof content === "object" && content !== null) {
    return content as Record<string, unknown>;
  }

  if (typeof content === "string") {
    return { output: content };
  }

  return {};
}