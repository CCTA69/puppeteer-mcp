# Puppeteer MCP Server

This is a Model Context Protocol (MCP) server that provides browser automation capabilities using Puppeteer. It allows AI clients (like the Google Gemini CLI or Claude Desktop) to open, view, and interact with web pages directly from the command line or UI.

## Features

The server provides the following tools to the LLM:

- **navigate**: Navigates the browser to a specified URL.
- **click**: Clicks on an element matching a given CSS selector.
- **type**: Types text into an input field matching a given CSS selector.
- **get_content**: Retrieves the outer HTML content of a specific element (by selector), or the entire page.
- **evaluate**: Executes arbitrary JavaScript within the page's context.
- **close_browser**: Closes the browser instance when finished.

The browser is launched in a headed mode (`headless: false`) so you can visually monitor the automation process.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- `npm` (Node Package Manager)

## Installation

1. Clone this repository or download the files.
2. Install the dependencies:

\`\`\`bash
npm install
\`\`\`

## Building

Since the server is written in TypeScript, you need to compile it before running:

\`\`\`bash
npm run build
\`\`\`

This will output the compiled JavaScript to the `build/` directory.

## Usage

You can run the server directly via Node:

\`\`\`bash
npm start
\`\`\`
*(Note: As an MCP server running on stdio transport, it will output its protocol messages to stdout and log messages to stderr. It is designed to be run as a subprocess by an MCP client.)*

### Integration with MCP Clients

To use this server with an MCP client, configure the client to run the build script.

**Example configuration (e.g., for Claude Desktop or Gemini CLI configuration):**

\`\`\`json
{
  "mcpServers": {
    "puppeteer-browser": {
      "command": "node",
      "args": ["/path/to/this/project/build/index.js"]
    }
  }
}
\`\`\`

*(Make sure to replace `/path/to/this/project` with the actual path to your repository.)*
