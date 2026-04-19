/**
 * MCP tool definitions — just 3 tools.
 *
 * These are the tool schemas registered with the MCP SDK.
 * Token-efficient descriptions optimized for minimal context usage.
 */

import { type Tool } from '@modelcontextprotocol/sdk/types.js';

export const allTools: Tool[] = [
  {
    name: 'search',
    description: `Search the BinaryLane API and SSH capabilities. Returns matching method signatures with parameters, return types, and descriptions.

Available method namespaces:
- bl.* — BinaryLane cloud API (servers, images, domains, VPCs, load balancers, SSH keys, billing, metrics, software)
- ssh.* — SSH operations (run commands, read/write files, list directories, upload/download, test connections)

Query with natural language, e.g. "firewall rules", "list servers", "ssh run command", "create domain record".`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Natural language query describing what you want to do',
        },
        max_results: {
          type: 'number',
          description: 'Maximum results to return (default: 10)',
        },
      },
      required: ['query'],
    },
    annotations: {
      title: 'Search API Methods',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'execute',
    description: `Execute JavaScript code in a sandboxed environment with BinaryLane API and SSH clients available.

Available globals:
- bl — BinaryLane API client. Call methods like bl.listServers(), bl.getServer(id), bl.performServerAction(id, action), etc.
- ssh — SSH client. ssh.run(target, command), ssh.readFile(target, path), ssh.writeFile(target, path, content), ssh.listDir(target, path), ssh.connections(), ssh.testConnection(target)
- console.log() — Output is captured and returned
- Standard JS: JSON, Promise, Array, Object, Map, Set, Date, Math, setTimeout

Code runs as async — use await directly. The return value of the last expression is captured as the result.

Use the 'search' tool first to discover available methods and their signatures.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: 'JavaScript code to execute. Async/await supported.',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in ms (default: 60000)',
        },
      },
      required: ['code'],
    },
    annotations: {
      title: 'Execute Code',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: 'describe',
    description: `Get detailed documentation for a specific API method including full parameter schemas, return types, code examples, and platform-specific gotchas.

Use this when you need complete details before writing code. Pass the full method name, e.g. 'bl.performServerAction' or 'ssh.run'.`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        method: {
          type: 'string',
          description: "Full method name, e.g. 'bl.createServer' or 'ssh.run'",
        },
      },
      required: ['method'],
    },
    annotations: {
      title: 'Describe Method',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
];
