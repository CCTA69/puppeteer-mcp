const messages = {
    cancelled: "The client cancelled this command. Inspect the page before repeating an action.",
    invalid: "Invalid arguments. Check the tool schema and try again.",
    failed: "Browser operation failed. Check the page, selector and browser state before trying again.",
    timeout: "Operation timed out. Its page or browser was closed for recovery. Effects may already have occurred; inspect the state before another action.",
    queued: "Command expired while waiting and was not executed.",
    stale: "Tab no longer exists. List tabs and choose a current tab ID.",
    stopped: "Browser session stopped or recovered. This command was not replayed; inspect the state before another action.",
    unusable: "Browser cleanup could not be confirmed. Restart the server before issuing more commands.",
    limit: "Requested output exceeds the image limit. Capture a smaller region or viewport.",
    serialization: "The script did not return a supported JSON value.",
};
export class SessionError extends Error {
    code;
    constructor(code) {
        super(messages[code]);
        this.code = code;
    }
}
export function toolError(code) {
    return {
        isError: true,
        content: [{ type: "text", text: messages[code] }],
        structuredContent: { error: code },
    };
}
export function jsonResult(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data) }],
        structuredContent: data,
    };
}
function excerpt(text, limit) {
    let end = Math.min(limit, text.length);
    if (end && /[\uD800-\uDBFF]/.test(text[end - 1]))
        end--;
    return text.slice(0, end);
}
export function textResult(text, limit = 25000) {
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
export function valueResult(value, limit = 25000) {
    if (value === undefined)
        return jsonResult({ type: "undefined" });
    let serialized;
    try {
        serialized = JSON.stringify(value);
    }
    catch {
        throw new SessionError("serialization");
    }
    if (serialized === undefined)
        throw new SessionError("serialization");
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
