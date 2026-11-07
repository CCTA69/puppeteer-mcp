import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { schemas, type PageAction } from './tool-schemas.js';
import { BrowserSession } from './browser-session.js';
import { performPageAction } from './browser-actions.js';
import { jsonResult, toolError, SessionError } from './results.js';

// SDK validation errors can contain unexpected property names and values.
class PrivateErrorServer extends McpServer {
  override async connect(transport: Transport): Promise<void> {
    const send = transport.send.bind(transport);
    transport.send = async (message, options) => {
      if ('result' in message && message.result.isError && !message.result.structuredContent) {
        message = { ...message, result: toolError('invalid') };
      } else if ('error' in message) {
        message = { ...message, error: { code:message.error.code, message:'Invalid request.' } };
      }
      await send(message, options);
    };
    await super.connect(transport);
  }
}
export function createServer(session: BrowserSession): McpServer {
  const server = new PrivateErrorServer({name:'puppeteer-mcp',version:'1.1.0'});
  for (const name of Object.keys(schemas) as (keyof typeof schemas)[]) {
    server.registerTool(name, {
      title: name.replaceAll('_',' '), description: `Browser ${name.replaceAll('_',' ')}. Page operations use the active tab unless tab_id is provided.`,
      inputSchema: schemas[name], annotations: {readOnlyHint:['get_content','list_tabs'].includes(name), destructiveHint:!['get_content','list_tabs'].includes(name), idempotentHint:false, openWorldHint:true},
    }, async (args: unknown) => {
      try {
        if (name === 'close_browser') { await session.closeBrowser(); return jsonResult({status:'Browser closed'}); }
        if (name === 'list_tabs') return jsonResult({tabs:await session.listTabs()});
        if (name === 'new_tab') { const a=schemas.new_tab.parse(args); return jsonResult({...await session.newTab(a.url,a.timeout_ms)}); }
        if (name === 'switch_tab') return jsonResult({...await session.switchTab(schemas.switch_tab.parse(args).tab_id)});
        if (name === 'close_tab') { await session.closeTab(schemas.close_tab.parse(args).tab_id); return jsonResult({status:'Tab closed'}); }
        const action = { ...schemas[name].parse(args), name } as PageAction;
        return await session.withPage({tabId:action.tab_id, timeoutMs:action.timeout_ms}, (page,signal) => performPageAction(page, action, signal));
      } catch (error) { return toolError(error instanceof SessionError ? error.code : 'failed'); }
    });
  }
  return server;
}
