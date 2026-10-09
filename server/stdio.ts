import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCollavibeMcpServer } from "./mcp.js";

const server = createCollavibeMcpServer();
await server.connect(new StdioServerTransport());
