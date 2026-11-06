import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { BrowserSession } from './browser-session.js';
import { createServer } from './server.js';
const session = new BrowserSession({ headless: process.env.PUPPETEER_MCP_HEADLESS === 'true' });
const server = createServer(session);
let stopping = false;
async function shutdown(): Promise<void> {
  if (stopping) return;
  stopping = true;
  await session.shutdown();
  await server.close();
}
process.once('SIGINT', () => { void shutdown(); });
process.once('SIGTERM', () => { void shutdown(); });
process.stdin.once('end', () => { void shutdown(); });
server.server.onclose = () => { void shutdown(); };
server.connect(new StdioServerTransport()).catch(async () => {
  console.error('Unable to start the browser tool server.');
  await shutdown();
  process.exitCode = 1;
});
