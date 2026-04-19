/**
 * Sandbox globals — defines what's available inside the vm context.
 *
 * Separated from sandbox.ts for clarity and testability.
 */

import { BinaryLaneClient } from '../api/client.js';
import { SSHClientManager } from '../ssh/client.js';
import { SafetyInterceptor } from './safety.js';

/**
 * The SSH interface exposed as `ssh` inside the sandbox.
 * Cleaner than exposing the full SSHClientManager class.
 */
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
 * Build the sandbox globals object.
 */
export function buildSandboxGlobals(
  blClient: BinaryLaneClient,
  sshClient: SSHClientManager,
  safety: SafetyInterceptor,
  logs: string[],
  maxTimeout: number,
) {
  // Wrap BinaryLane client with safety proxy
  const bl = safety.wrapClient(blClient, 'bl');

  // Wrap SSH client with safety proxy for mutating methods
  const wrappedSshClient = safety.wrapClient(sshClient, 'ssh');
  const ssh: SandboxSSH = {
    run: wrappedSshClient.run.bind(wrappedSshClient),
    readFile: wrappedSshClient.readFile.bind(wrappedSshClient),
    writeFile: wrappedSshClient.writeFile.bind(wrappedSshClient),
    listDir: wrappedSshClient.listDir.bind(wrappedSshClient),
    upload: wrappedSshClient.upload.bind(wrappedSshClient),
    download: wrappedSshClient.download.bind(wrappedSshClient),
    connections: () => sshClient.listConnections(),
    testConnection: wrappedSshClient.testConnection.bind(wrappedSshClient),
  };

  // Custom console that captures output
  const formatArg = (a: unknown) =>
    typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a);

  const sandboxConsole = {
    log: (...args: unknown[]) => {
      logs.push(args.map(formatArg).join(' '));
    },
    error: (...args: unknown[]) => {
      logs.push('[ERROR] ' + args.map(formatArg).join(' '));
    },
    warn: (...args: unknown[]) => {
      logs.push('[WARN] ' + args.map(formatArg).join(' '));
    },
    info: (...args: unknown[]) => {
      logs.push('[INFO] ' + args.map(formatArg).join(' '));
    },
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
    // Useful for generated code patterns
    structuredClone: globalThis.structuredClone,
  };
}
