/**
 * SSH Client Manager
 *
 * Manages SSH connections and provides command execution, file operations,
 * and connection testing. In code mode, this is exposed as `ssh` inside the sandbox.
 */

import { Client, ConnectConfig } from 'ssh2';
import { readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import type { SSHConnection, CommandResult, FileEntry, ConnectionInfo } from './types.js';
import {
  loadConfig, loadConnectionsFromConfig, loadConnectionsFromEnv,
  discoverBinaryLaneServers,
} from './connections.js';

export class SSHClientManager {
  private connections: Map<string, SSHConnection> = new Map();
  private defaultPrivateKeyPath?: string;
  private defaultUsername: string = 'root';

  /**
   * Load connections from multiple sources.
   * Priority: config (manual) > env var > auto-discovered (binarylane).
   * First source to claim a name wins.
   */
  loadConnections(sources: SSHConnection[][]): void {
    this.connections.clear();

    for (const connectionList of sources) {
      for (const conn of connectionList) {
        if (!conn.name || !conn.host || !conn.username) continue;
        if (this.connections.has(conn.name)) continue;

        if (conn.privateKeyPath) {
          conn.privateKeyPath = conn.privateKeyPath.replace(/^~/, homedir());
        }
        conn.port = conn.port || 22;
        this.connections.set(conn.name, conn);
      }
    }

    console.error(`Loaded ${this.connections.size} SSH connections`);
  }

  /**
   * Initialize connections from all sources (config file, env, BinaryLane auto-discovery).
   */
  async initialize(apiToken?: string): Promise<void> {
    const config = loadConfig();
    const configConns = loadConnectionsFromConfig(config);
    const envConns = loadConnectionsFromEnv();

    let blConns: SSHConnection[] = [];
    if (config.binarylane.enabled) {
      const token = apiToken || config.binarylane.apiToken || process.env.BINARYLANE_API_TOKEN;
      if (token) {
        try {
          blConns = await discoverBinaryLaneServers(
            token,
            config.binarylane.defaultUsername,
            config.binarylane.defaultPrivateKeyPath,
          );
        } catch (error) {
          console.error(`BinaryLane auto-discovery failed: ${error}`);
        }
      }
    }

    // Store defaults for ephemeral connections
    this.defaultPrivateKeyPath = config.binarylane.defaultPrivateKeyPath?.replace(/^~/, homedir());
    this.defaultUsername = config.binarylane.defaultUsername || 'root';

    this.loadConnections([configConns, envConns, blConns]);
  }

  getConnection(name: string): SSHConnection | undefined {
    return this.connections.get(name);
  }

  listConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values()).map(conn => ({
      name: conn.name,
      host: conn.host,
      port: conn.port,
      username: conn.username,
      ...(conn.proxyJump && { proxyJump: conn.proxyJump }),
      source: conn.source,
    }));
  }

  private getConnectConfig(conn: SSHConnection): ConnectConfig {
    const config: ConnectConfig = {
      host: conn.host,
      port: conn.port,
      username: conn.username,
    };

    if (conn.privateKeyPath) {
      if (!existsSync(conn.privateKeyPath)) {
        throw new Error(`Private key not found: ${conn.privateKeyPath}`);
      }
      config.privateKey = readFileSync(conn.privateKeyPath);
    } else if (conn.password) {
      config.password = conn.password;
    } else {
      const defaultKeys = [
        join(homedir(), '.ssh', 'id_ed25519'),
        join(homedir(), '.ssh', 'id_rsa'),
      ];
      for (const keyPath of defaultKeys) {
        if (existsSync(keyPath)) {
          config.privateKey = readFileSync(keyPath);
          break;
        }
      }
      if (!config.privateKey) {
        throw new Error('No authentication method available. Provide privateKeyPath or password.');
      }
    }

    return config;
  }

  private connectClient(conn: SSHConnection): Promise<{ client: Client; jumpClient?: Client }> {
    return new Promise((resolve, reject) => {
      const config = this.getConnectConfig(conn);

      if (!conn.proxyJump) {
        const client = new Client();
        client.on('ready', () => resolve({ client }));
        client.on('error', reject);
        client.connect(config);
        return;
      }

      const jumpConn = this.getConnection(conn.proxyJump);
      if (!jumpConn) {
        reject(new Error(`ProxyJump connection not found: ${conn.proxyJump}`));
        return;
      }

      const jumpClient = new Client();
      const jumpConfig = this.getConnectConfig(jumpConn);

      jumpClient.on('ready', () => {
        jumpClient.forwardOut('127.0.0.1', 0, conn.host, conn.port, (err, stream) => {
          if (err) {
            jumpClient.end();
            reject(new Error(`ProxyJump tunnel failed: ${err.message}`));
            return;
          }
          const client = new Client();
          client.on('ready', () => resolve({ client, jumpClient }));
          client.on('error', (err) => { jumpClient.end(); reject(err); });
          client.connect({ ...config, sock: stream });
        });
      });

      jumpClient.on('error', (err) => {
        reject(new Error(`ProxyJump connection to ${conn.proxyJump} failed: ${err.message}`));
      });

      jumpClient.connect(jumpConfig);
    });
  }

  /**
   * Resolve a target to a connection. Accepts a connection name or IP address.
   * If an IP is given and no connection matches, creates an ephemeral connection.
   */
  private resolveTarget(target: string): SSHConnection {
    const conn = this.connections.get(target);
    if (conn) return conn;

    // Check if target looks like an IP address
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(target)) {
      // Find a connection by IP
      for (const c of this.connections.values()) {
        if (c.host === target) return c;
      }
      // Create ephemeral connection for direct IP, using BinaryLane defaults
      return {
        name: target,
        host: target,
        port: 22,
        username: this.defaultUsername,
        privateKeyPath: this.defaultPrivateKeyPath,
      };
    }

    throw new Error(`Unknown connection: ${target}. Use ssh.connections() to see available connections.`);
  }

  async run(target: string, command: string, options?: { timeout?: number }): Promise<CommandResult> {
    const conn = this.resolveTarget(target);
    const timeout = options?.timeout ?? 30000;
    const { client, jumpClient } = await this.connectClient(conn);
    const cleanup = () => { client.end(); jumpClient?.end(); };

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      client.exec(command, (err, stream) => {
        if (err) { clearTimeout(timeoutId); cleanup(); reject(err); return; }

        stream.on('close', (code: number) => {
          clearTimeout(timeoutId);
          cleanup();
          resolve({ stdout, stderr, code: code || 0 });
        });
        stream.on('data', (data: Buffer) => { stdout += data.toString(); });
        stream.stderr.on('data', (data: Buffer) => { stderr += data.toString(); });
      });
    });
  }

  async readFile(target: string, remotePath: string): Promise<string> {
    const conn = this.resolveTarget(target);
    const { client, jumpClient } = await this.connectClient(conn);
    const cleanup = () => { client.end(); jumpClient?.end(); };

    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) { cleanup(); reject(err); return; }

        let content = '';
        const readStream = sftp.createReadStream(remotePath);
        readStream.on('data', (chunk: Buffer) => { content += chunk.toString(); });
        readStream.on('end', () => { cleanup(); resolve(content); });
        readStream.on('error', (err: Error) => { cleanup(); reject(err); });
      });
    });
  }

  async writeFile(target: string, remotePath: string, content: string): Promise<void> {
    const conn = this.resolveTarget(target);
    const { client, jumpClient } = await this.connectClient(conn);
    const cleanup = () => { client.end(); jumpClient?.end(); };

    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) { cleanup(); reject(err); return; }

        const writeStream = sftp.createWriteStream(remotePath);
        writeStream.on('close', () => { cleanup(); resolve(); });
        writeStream.on('error', (err: Error) => { cleanup(); reject(err); });
        writeStream.end(content);
      });
    });
  }

  async listDir(target: string, remotePath: string): Promise<FileEntry[]> {
    const conn = this.resolveTarget(target);
    const { client, jumpClient } = await this.connectClient(conn);
    const cleanup = () => { client.end(); jumpClient?.end(); };

    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) { cleanup(); reject(err); return; }

        sftp.readdir(remotePath, (err, list) => {
          cleanup();
          if (err) { reject(err); return; }
          resolve(list.map(item => ({
            name: item.filename,
            type: item.attrs.isDirectory() ? 'directory' : item.attrs.isFile() ? 'file' : 'other',
            size: item.attrs.size,
            modifyTime: new Date(item.attrs.mtime * 1000),
          })));
        });
      });
    });
  }

  async upload(target: string, localPath: string, remotePath: string): Promise<void> {
    const conn = this.resolveTarget(target);
    if (!existsSync(localPath)) throw new Error(`Local file not found: ${localPath}`);

    const { client, jumpClient } = await this.connectClient(conn);
    const cleanup = () => { client.end(); jumpClient?.end(); };

    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) { cleanup(); reject(err); return; }
        sftp.fastPut(localPath, remotePath, (err) => {
          cleanup();
          if (err) reject(err); else resolve();
        });
      });
    });
  }

  async download(target: string, remotePath: string, localPath: string): Promise<void> {
    const conn = this.resolveTarget(target);
    const { client, jumpClient } = await this.connectClient(conn);
    const cleanup = () => { client.end(); jumpClient?.end(); };

    return new Promise((resolve, reject) => {
      client.sftp((err, sftp) => {
        if (err) { cleanup(); reject(err); return; }
        sftp.fastGet(remotePath, localPath, (err) => {
          cleanup();
          if (err) reject(err); else resolve();
        });
      });
    });
  }

  async testConnection(target: string): Promise<{ success: boolean; message: string; latencyMs?: number }> {
    const conn = this.resolveTarget(target);
    const startTime = Date.now();

    try {
      const { client, jumpClient } = await Promise.race([
        this.connectClient(conn),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Connection timed out')), 10000)
        ),
      ]);

      const latencyMs = Date.now() - startTime;
      client.end();
      jumpClient?.end();
      const via = conn.proxyJump ? ` (via ${conn.proxyJump})` : '';
      return { success: true, message: `Connected to ${conn.host}:${conn.port}${via}`, latencyMs };
    } catch (error) {
      return { success: false, message: `Connection failed: ${(error as Error).message}` };
    }
  }
}
