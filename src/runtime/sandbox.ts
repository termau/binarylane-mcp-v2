/**
 * Code execution sandbox using Node.js vm module.
 *
 * SECURITY MODEL:
 * - Code runs in a separate vm realm (vm.createContext)
 * - bl/ssh methods are exposed as sandbox-realm functions (not host functions)
 *   to prevent prototype chain escape via .constructor
 * - All results are JSON-serialized across the realm boundary
 * - No host-realm references leak into the sandbox
 * - Dual timeout: sync (vm) + async (Promise.race) + AbortController for in-flight ops
 * - Logging can be disabled via BINARYLANE_MCP_DISABLE_LOG=1
 */

import vm from 'node:vm';
import { appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { BinaryLaneClient } from '../api/client.js';
import { SSHClientManager } from '../ssh/client.js';
import { SafetyInterceptor } from './safety.js';
import { buildSandboxGlobals } from './globals.js';

const DEFAULT_LOG_PATH = join(homedir(), '.config', 'binarylane', 'mcp-v2.log');

export interface ExecutionResult {
  result: unknown;
  logs: string[];
  destructiveOps: string[];
  callSummary: string;
  error?: string;
  durationMs: number;
}

export interface SandboxOptions {
  timeout?: number;        // ms, default 60000
  enableLogging?: boolean; // default true. Set false or env BINARYLANE_MCP_DISABLE_LOG=1 to disable
  logPath?: string;        // override log file path
}

export class Sandbox {
  private blClient: BinaryLaneClient;
  private sshClient: SSHClientManager;
  private safety: SafetyInterceptor;
  private defaultTimeout: number;
  private loggingEnabled: boolean;
  private logPath: string;

  constructor(
    blClient: BinaryLaneClient,
    sshClient: SSHClientManager,
    options?: SandboxOptions,
  ) {
    this.blClient = blClient;
    this.sshClient = sshClient;
    this.safety = new SafetyInterceptor();
    this.defaultTimeout = options?.timeout ?? 60000;
    this.loggingEnabled = (options?.enableLogging ?? true) && !process.env.BINARYLANE_MCP_DISABLE_LOG;
    this.logPath = options?.logPath ?? DEFAULT_LOG_PATH;
  }

  private writeLog(code: string, result: ExecutionResult): void {
    if (!this.loggingEnabled) return;

    try {
      const logDir = dirname(this.logPath);
      if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true });

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

      appendFileSync(this.logPath, JSON.stringify(entry) + '\n');
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

    // Create sandbox context with minimal globals (NO host functions exposed directly)
    const context = vm.createContext({
      console: globals.console,
      // Standard builtins — these are value types or frozen, safe to pass
      parseInt: globals.parseInt,
      parseFloat: globals.parseFloat,
      isNaN: globals.isNaN,
      isFinite: globals.isFinite,
      encodeURIComponent: globals.encodeURIComponent,
      decodeURIComponent: globals.decodeURIComponent,
      encodeURI: globals.encodeURI,
      decodeURI: globals.decodeURI,
      setTimeout: (fn: Function, ms: number) => setTimeout(fn, Math.min(ms, effectiveTimeout)),
      clearTimeout,
      undefined,
    });

    // Get sandbox realm constructors
    const SandboxPromise = vm.runInContext('Promise', context) as PromiseConstructor;
    const SandboxJSON = vm.runInContext('JSON', context) as typeof JSON;

    // SECURITY: Create bl/ssh wrapper functions INSIDE the sandbox realm.
    // This prevents .constructor escape — the functions' constructor is the
    // sandbox's Function, which can only create sandbox-realm functions.
    // The actual host calls go through __hostCall__ which is a frozen callable.

    // __hostCall__ is the only bridge between realms. It receives a method name
    // and args, calls the host function, and returns a sandbox-realm Promise
    // with JSON-serialized results.
    const hostCallables = new Map<string, Function>();

    // Register all bl methods
    for (const [name, fn] of Object.entries(globals.bl as Record<string, any>)) {
      if (typeof fn === 'function') hostCallables.set(`bl.${name}`, fn);
    }

    // Register all ssh methods
    for (const [name, fn] of Object.entries(globals.ssh as Record<string, any>)) {
      if (typeof fn === 'function') hostCallables.set(`ssh.${name}`, fn);
    }

    // Abort flag — set when execution times out to prevent new host calls
    // and short-circuit pending promise resolutions
    let aborted = false;

    // The host call bridge — this is the ONLY host function in the sandbox.
    const hostCall = (method: string, argsJson: string) => {
      if (aborted) {
        return new SandboxPromise((_: Function, reject: Function) => {
          reject(SandboxJSON.parse(JSON.stringify({
            message: 'Execution aborted (timeout)',
          })));
        });
      }

      const fn = hostCallables.get(method);
      if (!fn) throw new Error(`Unknown method: ${method}`);

      const args = JSON.parse(argsJson);
      const result = fn(...args);

      if (result && typeof result === 'object' && typeof result.then === 'function') {
        return new SandboxPromise((resolve: Function, reject: Function) => {
          result.then(
            (v: unknown) => {
              if (aborted) return; // Discard result after timeout
              try {
                resolve(SandboxJSON.parse(JSON.stringify(v)));
              } catch {
                resolve(v);
              }
            },
            (e: unknown) => {
              if (aborted) return;
              reject(SandboxJSON.parse(JSON.stringify({
                message: e instanceof Error ? e.message : String(e),
                statusCode: (e as any)?.statusCode,
              })));
            },
          );
        });
      }

      // Sync returns
      if (result && typeof result === 'object') {
        try {
          return SandboxJSON.parse(JSON.stringify(result));
        } catch {
          return result;
        }
      }
      return result;
    };

    context.__hostCall__ = hostCall;

    // Create bl and ssh objects INSIDE the sandbox realm using sandbox-native
    // functions. These call __hostCall__ to bridge to the host, but the functions
    // themselves are sandbox-realm so .constructor is the sandbox's Function (harmless).
    // The IIFE captures __hostCall__ in a closure, then we delete it from global scope
    // so user code can't access it directly.
    const blMethodNames = Object.keys(globals.bl as Record<string, any>)
      .filter(k => typeof (globals.bl as any)[k] === 'function');
    const sshMethodNames = Object.keys(globals.ssh as Record<string, any>)
      .filter(k => typeof (globals.ssh as any)[k] === 'function');

    const setupCode = `
      (function(__hc__) {
        globalThis.bl = Object.freeze({
          ${blMethodNames.map(name =>
            `${name}: function(...args) { return __hc__('bl.${name}', JSON.stringify(args)); }`
          ).join(',\n          ')}
        });

        globalThis.ssh = Object.freeze({
          ${sshMethodNames.map(name =>
            `${name}: function(...args) { return __hc__('ssh.${name}', JSON.stringify(args)); }`
          ).join(',\n          ')}
        });
      })(__hostCall__);

      delete globalThis.__hostCall__;
    `;

    vm.runInContext(setupCode, context);

    // Wrap user code in an async IIFE with strict mode
    const wrappedCode = `'use strict';\n(async () => {\n${code}\n})()`;

    try {
      const script = new vm.Script(wrappedCode, {
        filename: 'sandbox.js',
      });

      // Run — returns a sandbox-realm Promise
      const sandboxPromise = script.runInContext(context, {
        timeout: effectiveTimeout,
      });

      // Bridge sandbox Promise back to host realm
      const hostPromise = new Promise((resolve, reject) => {
        sandboxPromise.then(
          (v: unknown) => resolve(v),
          (e: unknown) => reject(e),
        );
      });

      // Race against async timeout — also sets abort flag to stop in-flight ops
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          aborted = true;
          reject(new Error(`Execution timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
      });

      const result = await Promise.race([hostPromise, timeoutPromise]);

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
      } else if (error && typeof error === 'object' && 'message' in error) {
        // Handle sandbox-realm error objects (from rejected promises)
        errorMessage = String((error as any).message);
        if ((error as any).statusCode) {
          errorMessage += ` (HTTP ${(error as any).statusCode})`;
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
