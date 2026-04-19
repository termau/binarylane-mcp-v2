/**
 * Tool handlers — dispatch search/execute/describe to their implementations.
 */

import { searchCatalog, formatCatalogEntry, formatMethodDoc } from './catalog/index.js';
import { Sandbox } from './runtime/sandbox.js';

export function createHandlers(sandbox: Sandbox) {
  return {
    search: async (args: { query: string; max_results?: number }) => {
      const results = searchCatalog(args.query, args.max_results ?? 10);

      if (results.length === 0) {
        return {
          content: [{ type: 'text' as const, text: `No methods found matching "${args.query}". Try broader terms or use 'describe' with a known method name.` }],
        };
      }

      const formatted = results.map(formatCatalogEntry).join('\n\n');
      return {
        content: [{ type: 'text' as const, text: `Found ${results.length} matching method(s):\n\n${formatted}` }],
      };
    },

    execute: async (args: { code: string; timeout?: number }) => {
      const result = await sandbox.execute(args.code, args.timeout);

      let output = '';

      // Include console output
      if (result.logs.length > 0) {
        output += `Console output:\n${result.logs.join('\n')}\n\n`;
      }

      // Include destructive operation warnings
      if (result.destructiveOps.length > 0) {
        output += `⚠ Destructive operations performed:\n${result.destructiveOps.map(op => `  - ${op}`).join('\n')}\n\n`;
      }

      if (result.error) {
        output += `Error: ${result.error}`;
        return {
          content: [{ type: 'text' as const, text: output }],
          isError: true,
        };
      }

      // Format the result
      if (result.result !== undefined) {
        const resultStr = typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result, null, 2);
        output += `Result:\n${resultStr}`;
      } else if (output === '') {
        output = 'Code executed successfully (no return value).';
      }

      output += `\n\n[${result.durationMs}ms]`;

      return {
        content: [{ type: 'text' as const, text: output }],
      };
    },

    describe: async (args: { method: string }) => {
      const doc = formatMethodDoc(args.method);

      if (!doc) {
        // Try fuzzy matching
        const results = searchCatalog(args.method, 5);
        if (results.length > 0) {
          const suggestions = results.map(r => r.name).join(', ');
          return {
            content: [{ type: 'text' as const, text: `Method "${args.method}" not found. Did you mean: ${suggestions}?` }],
          };
        }

        return {
          content: [{ type: 'text' as const, text: `Method "${args.method}" not found. Use 'search' to discover available methods.` }],
        };
      }

      return {
        content: [{ type: 'text' as const, text: doc }],
      };
    },
  };
}
