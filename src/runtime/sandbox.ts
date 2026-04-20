/**
 * Code execution sandbox using Node.js vm module.
 *
 * Runs model-generated JavaScript in an isolated context
 * with only bl and ssh exposed as capabilities.
 *
 * CROSS-REALM PROMISE HANDLING:
 * vm.createContext creates a new JS realm with its own Promise constructor.
 * Methods on bl/ssh are bound to the real client instances (in globals.ts)
 * and return host-realm Promises. After creating the context, we wrap
 * every function property on bl/ssh to convert host-realm Promises into
 * sandbox-realm Promises that the sandbox's `await` can handle.
 */

import vm from 'node:vm';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { BinaryLaneClient } from '../api/client.js';
import { SSHClientManager } from '../ssh/client.js';
import { SafetyInterceptor } from './safety.js';
import { buildSandboxGlobals } from './globals.js';

const LOG_DIR = join(homedir(), '.config', 'binarylane');
const LOG_PATH = join(LOG_DIR, 'mcp-v2.log');

export interface ExecutionResult {
  result: unknown;
  logs: string[];
  destructiveOps: string[];
  callSummary: string;
  error?: string;
  durationMs: number;
}

export interface SandboxOptions {
  timeout?: number; // ms, default 60000
}

/**
 * Wrap all function properties on an object so that any returned
 * host-realm Promise is converted to a target-realm Promise.
 */
function bridgeAllMethods(
  obj: Record<string, any>,
  TargetPromise: PromiseConstructor,
  TargetJSON: typeof JSON,
): Record<string, any> {
  const bridged: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'function') {
      bridged[key] = (...args: unknown[]) => {
        const result = value(...args);
        if (result && typeof result === 'object' && typeof result.then === 'function') {
          return new TargetPromise((resolve: Function, reject: Function) => {
            result.then(
              (v: unknown) => {
                try {
                  resolve(TargetJSON.parse(JSON.stringify(v)));
                } catch {
                  resolve(v);
                }
              },
              (e: unknown) => reject(e),
            );
          });
        }
        // Sync returns: also bridge to sandbox realm
        if (result && typeof result === 'object') {
          try {
            return TargetJSON.parse(JSON.stringify(result));
          } catch {
            return result;
          }
        }
        return result;
      };
    } else {
      bridged[key] = value;
    }
  }
  return bridged;
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

  private writeLog(code: string, result: ExecutionResult): void {
    try {
      if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

      const entry = {
        timestamp: new Date().toISOString(),
        durationMs: result.durationMs,
        calls: this.safety.getCallLog().map(c => ({
          method: c.method,
          durationMs: c.durationMs,
          status: c.status,
          ...(c.destructive && { destructive: true }),
          ...(c.error && { error: c.error }),
        })),
        ...(result.error && { error: result.error }),
        code: code.trim(),
      };

      appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
    } catch {
      // Don't let logging failures break execution
    }
  }

  async execute(code: string, timeout?: number): Promise<ExecutionResult> {
    const startTime = Date.now();
    const effectiveTimeout = timeout ?? this.defaultTimeout;
    this.safety.clearLog();

    const logs: string[] = [];

    // Build sandbox globals with explicitly bound methods
    const globals = buildSandboxGlobals(
      this.blClient,
      this.sshClient,
      this.safety,
      logs,
      effectiveTimeout,
    );

    // Create sandbox context
    const context = vm.createContext(globals);

    // Get the sandbox realm's Promise and JSON constructors
    const SandboxPromise = vm.runInContext('Promise', context) as PromiseConstructor;
    const SandboxJSON = vm.runInContext('JSON', context) as typeof JSON;

    // Bridge bl and ssh methods to return sandbox-realm Promises
    // with sandbox-realm objects (via SandboxJSON.parse)
    context.bl = bridgeAllMethods(globals.bl as Record<string, any>, SandboxPromise, SandboxJSON);
    context.ssh = bridgeAllMethods(globals.ssh as Record<string, any>, SandboxPromise, SandboxJSON);

    const wrappedCode = `(async () => {\n${code}\n})()`;

    try {
      const script = new vm.Script(wrappedCode, {
        filename: 'sandbox.js',
      });

      // Run the script — returns a sandbox-realm Promise
      const sandboxPromise = script.runInContext(context, {
        timeout: effectiveTimeout,
      });

      // Bridge sandbox-realm Promise back to host realm
      const hostPromise = new Promise((resolve, reject) => {
        sandboxPromise.then(
          (v: unknown) => resolve(v),
          (e: unknown) => reject(e),
        );
      });

      // Race against async timeout
      const result = await Promise.race([
        hostPromise,
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Execution timed out after ${effectiveTimeout}ms`));
          }, effectiveTimeout);
        }),
      ]);

      const execResult: ExecutionResult = {
        result,
        logs,
        destructiveOps: this.safety.getDestructiveOps(),
        callSummary: this.safety.getCallSummary(),
        durationMs: Date.now() - startTime,
      };
      this.writeLog(code, execResult);
      return execResult;
    } catch (error) {
      let errorMessage: string;

      if (error instanceof Error) {
        if (error.message.includes('Script execution timed out')) {
          errorMessage = `Execution timed out after ${effectiveTimeout}ms. Try breaking the operation into smaller steps or increasing the timeout.`;
        } else {
          errorMessage = error.message;
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

      const execResult: ExecutionResult = {
        result: undefined,
        logs,
        destructiveOps: this.safety.getDestructiveOps(),
        callSummary: this.safety.getCallSummary(),
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
      this.writeLog(code, execResult);
      return execResult;
    }
  }
}
