import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
const messages = {
  invalid: "Invalid arguments. Check the tool schema and try again.",
  failed:
    "Browser operation failed. Check the page, selector and browser state before trying again.",
  timeout:
    "Operation timed out. Its page or browser was closed for recovery. Effects may already have occurred; inspect the state before another action.",
  queued: "Command expired while waiting and was not executed.",
  stale: "Tab no longer exists. List tabs and choose a current tab ID.",
  stopped:
    "Browser session stopped or recovered. This command was not replayed; inspect the state before another action.",
  unusable:
    "Browser cleanup could not be confirmed. Restart the server before issuing more commands.",
  limit:
    "Requested output exceeds the image limit. Capture a smaller region or viewport.",
  serialization: "The script did not return a supported JSON value.",
} as const;
export type ErrorCode = keyof typeof messages;
export class SessionError extends Error {
  constructor(public readonly code: ErrorCode) {
    super(messages[code]);
  }
}
export function toolError(code: ErrorCode): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: messages[code] }],
    structuredContent: { error: code },
  };
}
export function jsonResult(data: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
  };
}
function excerpt(text: string, limit: number): string {
  let end = Math.min(limit, text.length);
  if (end && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
  return text.slice(0, end);
}
export function textResult(text: string, limit = 25000): CallToolResult {
  const content = excerpt(text, limit);
  return {
    content: [{ type: "text", text: content }],
    structuredContent: {
      content,
      truncated: text.length > content.length,
      total_chars: text.length,
    },
  };
}
export function valueResult(value: unknown, limit = 25000): CallToolResult {
  if (value === undefined) return jsonResult({ type: "undefined" });
  let serialized: string | undefined;
  try {
    serialized = JSON.stringify(value);
  } catch {
    throw new SessionError("serialization");
  }
  if (serialized === undefined) throw new SessionError("serialization");
  if (serialized.length > limit)
    return jsonResult({
      preview: excerpt(serialized, limit),
      truncated: true,
      total_chars: serialized.length,
    });
  return {
    content: [{ type: "text", text: serialized }],
    structuredContent: { value, truncated: false },
  };
}
