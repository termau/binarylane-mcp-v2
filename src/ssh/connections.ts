/**
 * SSH connection configuration and BinaryLane auto-discovery.
 *
 * Three-layer config resolution:
 * 1. Config file (~/.config/ssh-mcp/connections.json) — highest priority
 * 2. SSH_CONNECTIONS environment variable
 * 3. BinaryLane auto-discovery — lowest priority
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import type { SSHConnection, SSHMCPConfig } from './types.js';

const DEFAULT_CONFIG: SSHMCPConfig = {
  defaultPrivateKeyPath: '~/.ssh/id_ed25519',
  binarylane: {
    enabled: true,
    defaultUsername: 'root',
    defaultPrivateKeyPath: '~/.ssh/id_ed25519',
  },
  connections: [],
};

export function getConfigPath(): string {
  return join(homedir(), '.config', 'ssh-mcp', 'connections.json');
}

export function loadConfig(): SSHMCPConfig {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    saveConfig(DEFAULT_CONFIG);
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<SSHMCPConfig>;
    return {
      defaultPrivateKeyPath: parsed.defaultPrivateKeyPath ?? DEFAULT_CONFIG.defaultPrivateKeyPath,
      binarylane: { ...DEFAULT_CONFIG.binarylane, ...parsed.binarylane },
      connections: parsed.connections ?? [],
    };
  } catch (error) {
    console.error(`Failed to load SSH config from ${configPath}: ${error}`);
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: SSHMCPConfig): void {
  const configPath = getConfigPath();
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function loadConnectionsFromConfig(config: SSHMCPConfig): SSHConnection[] {
  return config.connections.map(c => ({
    name: c.name,
    host: c.host,
    port: c.port ?? 22,
    username: c.username,
    privateKeyPath: c.privateKeyPath,
    password: c.password,
    proxyJump: c.proxyJump,
    source: 'config' as const,
  }));
}

export function loadConnectionsFromEnv(): SSHConnection[] {
  const connectionsJson = process.env.SSH_CONNECTIONS;
  if (!connectionsJson) return [];

  try {
    const connections: SSHConnection[] = JSON.parse(connectionsJson);
    return connections.map(c => ({ ...c, source: 'env' as const }));
  } catch (error) {
    console.error(`Failed to parse SSH_CONNECTIONS: ${error}`);
    return [];
  }
}

interface BLServer {
  id: number;
  name: string;
  status: string;
  networks: { v4: Array<{ ip_address: string; type: string }> };
}

interface BLResponse {
  servers: BLServer[];
  links?: { pages?: { next?: string } };
}

export async function discoverBinaryLaneServers(
  apiToken: string,
  defaultUsername: string,
  defaultPrivateKeyPath?: string,
): Promise<SSHConnection[]> {
  const connections: SSHConnection[] = [];
  let url: string | null = 'https://api.binarylane.com.au/v2/servers?per_page=100';

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`BinaryLane API error (${response.status}): ${text}`);
    }

    const data: BLResponse = await response.json();

    for (const server of data.servers) {
      if (server.status !== 'active') continue;
      const publicIp = server.networks.v4.find(n => n.type === 'public');
      if (!publicIp) continue;

      connections.push({
        name: server.name,
        host: publicIp.ip_address,
        port: 22,
        username: defaultUsername,
        privateKeyPath: defaultPrivateKeyPath,
        source: 'binarylane',
      });
    }

    url = data.links?.pages?.next ?? null;
  }

  return connections;
}
