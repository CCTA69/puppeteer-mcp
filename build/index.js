import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BrowserSession } from './browser-session.js';
import { createServer } from './server.js';
const session = new BrowserSession({ headless: process.env.PUPPETEER_MCP_HEADLESS === 'true' });
const server = createServer(session);
let stopping;
function shutdown() {
    return stopping ??= Promise.resolve().then(async () => {
        try {
            await session.shutdown();
        }
        catch {
            process.exitCode = 1;
            console.error('Could not confirm browser cleanup.');
        }
        finally {
            await server.close();
        }
    }).catch(() => { process.exitCode = 1; console.error('Could not complete server shutdown.'); });
}
function fatal() {
    process.exitCode = 1;
    console.error('Unexpected server failure. Closing the owned browser.');
    void shutdown();
}
process.once('uncaughtException', fatal);
process.once('unhandledRejection', fatal);
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
process.stdin.once('end', () => { void shutdown(); });
server.server.onclose = () => { void shutdown(); };
server.connect(new StdioServerTransport()).catch(fatal);
