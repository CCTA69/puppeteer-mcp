import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { schemas } from "./tool-schemas.js";
import { performPageAction } from "./browser-actions.js";
import { jsonResult, toolError, SessionError } from "./results.js";
// SDK validation errors can contain unexpected property names and values.
class PrivateErrorServer extends McpServer {
    async connect(transport) {
        const send = transport.send.bind(transport);
        transport.send = async (message, options) => {
            if ("result" in message &&
                message.result.isError &&
                !message.result.structuredContent) {
                message = { ...message, result: toolError("invalid") };
            }
            else if ("error" in message) {
                message = {
                    ...message,
                    error: { code: message.error.code, message: "Invalid request." },
                };
            }
            await send(message, options);
        };
        await super.connect(transport);
    }
}
export function createServer(session) {
    const server = new PrivateErrorServer({
        name: "puppeteer-mcp",
        version: "1.1.0",
    });
    const descriptions = {
        navigate: "Open an HTTP(S) URL or about:blank. By default return when the initial document is ready.",
        click: "Click an enabled element matching a CSS selector. Set wait_until only when navigation is expected.",
        type: "Type text at the caret in a matching field. The reply does not repeat the entered value.",
        fill: "Replace the contents of a matching field, or clear it with an empty string.",
        select_option: "Select exact values in a native select. Returns the number selected; does not operate custom menus.",
        press_key: "Press one keyboard key on a matching element, or on the focused control if selector is omitted.",
        wait_for: "Wait for a matching element to be visible, hidden, attached or detached. The default is visible.",
        get_content: "Read HTML for the page or one matching element. Large responses are shortened and marked.",
        evaluate: "Run JavaScript in the page, including scripts with side effects. Return its JSON result or a bounded preview.",
        screenshot: "Capture a JPEG of the viewport, full page or one element. Returns the image directly; no file is written.",
        new_tab: "Open and activate a tab, optionally navigating it. Returns its new ID, title and URL.",
        list_tabs: "List live tabs with IDs, titles, URLs and active status. Does not start a browser.",
        switch_tab: "Make the tab identified by tab_id the default for later page commands.",
        close_tab: "Close the identified tab. If active, the oldest remaining tab becomes active.",
        close_browser: "Close the browser owned by this server and invalidate its tab IDs. Repeated calls are safe.",
    };
    for (const name of Object.keys(schemas)) {
        const readOnly = [
            "get_content",
            "list_tabs",
            "screenshot",
            "wait_for",
        ].includes(name);
        server.registerTool(name, {
            title: name.replaceAll("_", " "),
            description: descriptions[name],
            inputSchema: schemas[name],
            annotations: {
                readOnlyHint: readOnly,
                destructiveHint: !readOnly,
                idempotentHint: name === "close_browser",
                openWorldHint: true,
            },
        }, async (args, { signal }) => {
            try {
                if (name === "close_browser") {
                    await session.closeBrowser(signal);
                    return jsonResult({ status: "Browser closed" });
                }
                if (name === "list_tabs")
                    return jsonResult({ tabs: await session.listTabs(signal) });
                if (name === "new_tab") {
                    const a = schemas.new_tab.parse(args);
                    return jsonResult({
                        ...(await session.newTab(a.url, a.timeout_ms, signal)),
                    });
                }
                if (name === "switch_tab")
                    return jsonResult({
                        ...(await session.switchTab(schemas.switch_tab.parse(args).tab_id, signal)),
                    });
                if (name === "close_tab") {
                    await session.closeTab(schemas.close_tab.parse(args).tab_id, signal);
                    return jsonResult({ status: "Tab closed" });
                }
                const action = { ...schemas[name].parse(args), name };
                return await session.withPage({ tabId: action.tab_id, timeoutMs: action.timeout_ms, signal }, (page, signal, tabId) => performPageAction(page, action, signal, tabId));
            }
            catch (error) {
                return toolError(error instanceof SessionError ? error.code : "failed");
            }
        });
    }
    return server;
}
