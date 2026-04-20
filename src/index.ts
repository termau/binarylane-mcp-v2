#!/usr/bin/env node

/**
 * BinaryLane MCP v2 — Code Mode
 *
 * 3 tools instead of 86. The model generates JavaScript that runs
 * in a sandbox with the BinaryLane API and SSH clients as capabilities.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

import { BinaryLaneClient } from './api/client.js';
import { SSHClientManager } from './ssh/client.js';
import { Sandbox } from './runtime/sandbox.js';
import { allTools } from './tools.js';
import { createHandlers } from './handlers.js';

// ==================== Token validation ====================

function getApiToken(): string {
  // Check environment variable first
  const envToken = process.env.BINARYLANE_API_TOKEN;
  if (envToken) return envToken;

  // Fall back to config file
  const configPaths = [
    join(homedir(), '.config', 'binarylane', 'config'),
    join(homedir(), '.config', 'binarylane', 'config.ini'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, 'utf-8');
        // Look for token in various formats
        const match = content.match(/(?:api[-_]token|token)\s*=\s*([a-zA-Z0-9]+)/);
        if (match && match[1]) return match[1];
        // Plain token file
        const trimmed = content.trim();
        if (/^[a-zA-Z0-9]{64}$/.test(trimmed)) return trimmed;
      } catch {
        // Continue to next config path
      }
    }
  }

  console.error('Error: BINARYLANE_API_TOKEN not set.');
  console.error('Set it via environment variable or in ~/.config/binarylane/config');
  console.error('Get your token at: https://home.binarylane.com.au/api-info');
  process.exit(1);
}

// ==================== Main ====================

async function main() {
  const apiToken = getApiToken();

  // Initialize clients
  const blClient = new BinaryLaneClient(apiToken);
  const sshClient = new SSHClientManager();

  // Initialize SSH connections (config + env + BinaryLane auto-discovery)
  console.error('Initializing SSH connections...');
  await sshClient.initialize(apiToken);

  // Create sandbox
  const sandbox = new Sandbox(blClient, sshClient);

  // Create handlers
  const handlers = createHandlers(sandbox);

  // Create MCP server
  const server = new Server(
    { name: 'binarylane-mcp-v2', version: '2.0.0' },
    { capabilities: { tools: {} } },
  );

  // Register tool listing
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  // Register tool execution
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'search':
          return await handlers.search(args as { query: string; max_results?: number });

        case 'execute':
          return await handlers.execute(args as { code: string; timeout?: number });

        case 'describe':
          return await handlers.describe(args as { method: string });

        default:
          return {
            content: [{ type: 'text' as const, text: `Unknown tool: ${name}. Available tools: search, execute, describe` }],
            isError: true,
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Provide actionable error messages
      let hint = '';
      if (message.includes('401') || message.includes('Unauthorized')) {
        hint = '\nHint: Check your API token validity.';
      } else if (message.includes('404')) {
        hint = '\nHint: Resource not found. Use search to find the correct method.';
      } else if (message.includes('429')) {
        hint = '\nHint: Rate limited. Wait a moment and try again.';
      }

      return {
        content: [{ type: 'text' as const, text: `Error: ${message}${hint}` }],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('BinaryLane MCP v2 (Code Mode) running — 3 tools, infinite possibilities');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
