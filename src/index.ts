import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer, { Browser, Page } from "puppeteer";

const server = new Server(
  {
    name: "puppeteer-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let browser: Browser | null = null;
let page: Page | null = null;

async function getPage(): Promise<Page> {
  if (!browser) {
    browser = await puppeteer.launch({ headless: false });
  }
  if (!page) {
    const pages = await browser.pages();
    page = pages[0] || (await browser.newPage());
  }
  return page;
}

const TOOLS: Tool[] = [
  {
    name: "navigate",
    description: "Navigates the browser to a specific URL.",
    inputSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The URL to navigate to.",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "click",
    description: "Clicks on an element matching the given selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "The CSS selector to click on.",
        },
      },
      required: ["selector"],
    },
  },
  {
    name: "type",
    description: "Types text into an input field matching the given selector.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "The CSS selector for the input field.",
        },
        text: {
          type: "string",
          description: "The text to type.",
        },
      },
      required: ["selector", "text"],
    },
  },
  {
    name: "get_content",
    description: "Gets the outer HTML content of an element matching the given selector, or the entire page if no selector is provided.",
    inputSchema: {
      type: "object",
      properties: {
        selector: {
          type: "string",
          description: "The CSS selector. If not provided, gets the whole page content.",
        },
      },
    },
  },
  {
    name: "evaluate",
    description: "Evaluates JavaScript in the context of the page.",
    inputSchema: {
      type: "object",
      properties: {
        script: {
          type: "string",
          description: "The JavaScript to evaluate. Must return a JSON-serializable value or a promise that resolves to one.",
        },
      },
      required: ["script"],
    },
  },
  {
    name: "close_browser",
    description: "Closes the browser instance.",
    inputSchema: {
      type: "object",
      properties: {},
    },
  }
];

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: TOOLS,
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name, arguments: args } = request.params;

    // Tools that don't need a page
    if (name === "close_browser") {
      if (browser) {
        await browser.close();
        browser = null;
        page = null;
        return {
          content: [{ type: "text", text: "Browser closed successfully." }],
        };
      }
      return {
        content: [{ type: "text", text: "Browser is already closed." }],
      };
    }

    const p = await getPage();

    switch (name) {
      case "navigate": {
        const url = (args as { url: string }).url;
        await p.goto(url, { waitUntil: "networkidle2" });
        return {
          content: [{ type: "text", text: `Navigated to ${url}` }],
        };
      }
      case "click": {
        const selector = (args as { selector: string }).selector;
        await p.waitForSelector(selector);
        await p.click(selector);
        return {
          content: [{ type: "text", text: `Clicked element: ${selector}` }],
        };
      }
      case "type": {
        const { selector, text } = args as { selector: string; text: string };
        await p.waitForSelector(selector);
        await p.type(selector, text);
        return {
          content: [{ type: "text", text: `Typed '${text}' into element: ${selector}` }],
        };
      }
      case "get_content": {
        const selector = (args as { selector?: string })?.selector;
        let content;
        if (selector) {
          await p.waitForSelector(selector);
          content = await p.$eval(selector, (el) => el.outerHTML);
        } else {
          content = await p.content();
        }
        return {
          content: [{ type: "text", text: content }],
        };
      }
      case "evaluate": {
        const script = (args as { script: string }).script;
        const result = await p.evaluate(script);
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error: any) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error: ${error.message}`,
        },
      ],
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Puppeteer MCP server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
