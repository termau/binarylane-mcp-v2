/**
 * Code execution sandbox using Node.js vm module.
 *
 * Runs model-generated JavaScript in an isolated context
 * with only bl and ssh exposed as capabilities.
 *
 * IMPORTANT: vm.runInContext's `timeout` option only works for synchronous
 * code. Async code (awaiting API/SSH calls) won't be killed by it.
 * We use Promise.race with AbortController to enforce async timeouts.
 */

import vm from 'node:vm';
import { BinaryLaneClient } from '../api/client.js';
import { SSHClientManager } from '../ssh/client.js';
import { SafetyInterceptor } from './safety.js';
import { buildSandboxGlobals } from './globals.js';

export interface ExecutionResult {
  result: unknown;
  logs: string[];
  destructiveOps: string[];
  error?: string;
  durationMs: number;
}

export interface SandboxOptions {
  timeout?: number; // ms, default 60000
}

export class Sandbox {
  private blClient: BinaryLaneClient;
  private sshClient: SSHClientManager;
  private safety: SafetyInterceptor;
  private defaultTimeout: number;

  constructor(
    blClient: BinaryLaneClient,
    sshClient: SSHClientManager,
    options?: SandboxOptions,
  ) {
    this.blClient = blClient;
    this.sshClient = sshClient;
    this.safety = new SafetyInterceptor();
    this.defaultTimeout = options?.timeout ?? 60000;
  }

  async execute(code: string, timeout?: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    const effectiveTimeout = timeout ?? this.defaultTimeout;
    this.safety.clearLog();

    const logs: string[] = [];

    // Build sandbox globals
    const globals = buildSandboxGlobals(
      this.blClient,
      this.sshClient,
      this.safety,
      logs,
      effectiveTimeout,
    );

    const context = vm.createContext(globals);

    // Wrap code in an async IIFE so await works at top level.
    // Use return for the last expression to be captured.
    const wrappedCode = `(async () => {\n${code}\n})()`;

    try {
      // Compile the script (catches syntax errors early)
      const script = new vm.Script(wrappedCode, {
        filename: 'sandbox.js',
      });

      // Run with both sync timeout (catches infinite loops in sync code)
      // and async timeout (catches hanging await calls)
      const promise = script.runInContext(context, {
        timeout: effectiveTimeout,
      });

      // Race the async result against a timeout
      const result = await Promise.race([
        promise,
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Execution timed out after ${effectiveTimeout}ms`));
          }, effectiveTimeout);
        }),
      ]);

      return {
        result,
        logs,
        destructiveOps: this.safety.getDestructiveOps(),
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      let errorMessage: string;

      if (error instanceof Error) {
        // Clean up vm-specific error noise
        if (error.message.includes('Script execution timed out')) {
          errorMessage = `Execution timed out after ${effectiveTimeout}ms. Try breaking the operation into smaller steps or increasing the timeout.`;
        } else {
          errorMessage = error.message;
          // Include stack trace for code errors (helps debugging)
          if (error.stack && error.stack.includes('sandbox.js')) {
            const sandboxLines = error.stack
              .split('\n')
              .filter(line => line.includes('sandbox.js'))
              .map(line => line.trim());
            if (sandboxLines.length > 0) {
              errorMessage += `\n  at ${sandboxLines.join('\n  at ')}`;
            }
          }
        }
      } else {
        errorMessage = String(error);
      }

      return {
        result: undefined,
        logs,
        destructiveOps: this.safety.getDestructiveOps(),
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }
}
