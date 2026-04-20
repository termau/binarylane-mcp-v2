/**
 * Sandbox globals — defines what's available inside the vm context.
 *
 * Creates explicit bound wrappers for bl and ssh methods to avoid
 * cross-realm issues with Proxy chains and `this` binding.
 */

import { BinaryLaneClient } from '../api/client.js';
import { SSHClientManager } from '../ssh/client.js';
import { SafetyInterceptor } from './safety.js';

export interface SandboxSSH {
  run: SSHClientManager['run'];
  readFile: SSHClientManager['readFile'];
  writeFile: SSHClientManager['writeFile'];
  listDir: SSHClientManager['listDir'];
  upload: SSHClientManager['upload'];
  download: SSHClientManager['download'];
  connections: () => ReturnType<SSHClientManager['listConnections']>;
  testConnection: SSHClientManager['testConnection'];
}

/**
 * Create a plain object with bound methods from the BinaryLane client.
 * Each method is explicitly bound to the real client instance,
 * avoiding Proxy `this`-binding issues across vm realms.
 */
const BL_PRIVATE_METHODS = new Set([
  'waitForSlot', 'releaseSlot', 'shouldRetry', 'calculateDelay', 'sleep', 'request',
]);

function createBlInterface(client: BinaryLaneClient, safety: SafetyInterceptor) {
  // Collect method names from both the prototype and own properties
  // (own properties handles mock objects in tests)
  const names = new Set<string>();
  const proto = Object.getPrototypeOf(client);
  if (proto) {
    for (const name of Object.getOwnPropertyNames(proto)) names.add(name);
  }
  for (const name of Object.keys(client)) names.add(name);

  const bl: Record<string, Function> = {};
  for (const name of names) {
    if (name === 'constructor' || BL_PRIVATE_METHODS.has(name)) continue;
    if (typeof (client as any)[name] !== 'function') continue;

    const boundMethod = (client as any)[name].bind(client);

    bl[name] = (...args: unknown[]) => {
      const record = safety.trackCall(`bl.${name}`, args);
      const result = boundMethod(...args);
      // If async, track completion/failure
      if (result && typeof result === 'object' && typeof result.then === 'function') {
        result.then(
          () => safety.completeCall(record),
          (e: Error) => safety.failCall(record, e.message),
        );
      } else {
        safety.completeCall(record);
      }
      return result;
    };
  }

  return bl;
}

/**
 * Build the sandbox globals object.
 */
export function buildSandboxGlobals(
  blClient: BinaryLaneClient,
  sshClient: SSHClientManager,
  safety: SafetyInterceptor,
  logs: string[],
  maxTimeout: number,
) {
  const bl = createBlInterface(blClient, safety);

  // Helper: wrap an async SSH method with call tracking
  function trackedSsh<T extends (...args: any[]) => Promise<any>>(
    name: string, fn: T
  ): T {
    return ((...args: any[]) => {
      const record = safety.trackCall(`ssh.${name}`, args);
      const result = fn(...args);
      result.then(
        () => safety.completeCall(record),
        (e: Error) => safety.failCall(record, e.message),
      );
      return result;
    }) as T;
  }

  const ssh: SandboxSSH = {
    run: trackedSsh('run', sshClient.run.bind(sshClient)),
    readFile: trackedSsh('readFile', sshClient.readFile.bind(sshClient)),
    writeFile: trackedSsh('writeFile', sshClient.writeFile.bind(sshClient)),
    listDir: trackedSsh('listDir', sshClient.listDir.bind(sshClient)),
    upload: trackedSsh('upload', sshClient.upload.bind(sshClient)),
    download: trackedSsh('download', sshClient.download.bind(sshClient)),
    connections: () => {
      const record = safety.trackCall('ssh.connections', []);
      const result = sshClient.listConnections();
      safety.completeCall(record);
      return result;
    },
    testConnection: trackedSsh('testConnection', sshClient.testConnection.bind(sshClient)),
  };

  const formatArg = (a: unknown) =>
    typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);

  const sandboxConsole = {
    log: (...args: unknown[]) => { logs.push(args.map(formatArg).join(' ')); },
    error: (...args: unknown[]) => { logs.push('[ERROR] ' + args.map(formatArg).join(' ')); },
    warn: (...args: unknown[]) => { logs.push('[WARN] ' + args.map(formatArg).join(' ')); },
    info: (...args: unknown[]) => { logs.push('[INFO] ' + args.map(formatArg).join(' ')); },
  };

  return {
    bl,
    ssh,
    console: sandboxConsole,
    JSON,
    Promise,
    Array,
    Object,
    Map,
    Set,
    Date,
    Math,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Number,
    String,
    Boolean,
    Symbol,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    atob: globalThis.atob,
    btoa: globalThis.btoa,
    setTimeout: (fn: Function, ms: number) => {
      return setTimeout(fn, Math.min(ms, maxTimeout));
    },
    clearTimeout,
    structuredClone: globalThis.structuredClone,
  };
}
