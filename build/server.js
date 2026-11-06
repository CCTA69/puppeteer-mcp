import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { schemas } from './tool-schemas.js';
import { performPageAction } from './browser-actions.js';
import { jsonResult, toolError, SessionError } from './results.js';
// SDK validation errors can contain unexpected property names and values.
class PrivateErrorServer extends McpServer {
    async connect(transport) {
        const send = transport.send.bind(transport);
        transport.send = async (message, options) => {
            if ('result' in message && message.result.isError && !message.result.structuredContent) {
                message = { ...message, result: toolError('invalid') };
            }
            else if ('error' in message) {
                message = { ...message, error: { code: message.error.code, message: 'Invalid request.' } };
            }
            await send(message, options);
        };
        await super.connect(transport);
    }
}
export function createServer(session) {
    const server = new PrivateErrorServer({ name: 'puppeteer-mcp', version: '1.1.0' });
    for (const name of Object.keys(schemas)) {
        server.registerTool(name, {
            title: name.replaceAll('_', ' '), description: `Browser ${name.replaceAll('_', ' ')}. Page operations use the active tab unless tab_id is provided.`,
            inputSchema: schemas[name], annotations: { readOnlyHint: ['get_content', 'list_tabs'].includes(name), destructiveHint: !['get_content', 'list_tabs'].includes(name), idempotentHint: false, openWorldHint: true },
        }, async (args) => {
            try {
                if (name === 'close_browser') {
                    await session.closeBrowser();
                    return jsonResult({ status: 'Browser closed' });
                }
                if (name === 'list_tabs')
                    return jsonResult({ tabs: await session.listTabs() });
                const action = { ...schemas[name].parse(args), name };
                return await session.withPage({ tabId: action.tab_id, timeoutMs: action.timeout_ms }, (page, signal) => performPageAction(page, action, signal));
            }
            catch (error) {
                return toolError(error instanceof SessionError ? error.code : 'failed');
            }
        });
    }
    return server;
}
