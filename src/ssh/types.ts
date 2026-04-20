/**
 * SSH type definitions
 */

export interface SSHConnection {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKeyPath?: string;
  password?: string;
  proxyJump?: string;
  source?: 'config' | 'env' | 'binarylane';
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  code: number | null; // null if process was killed/signalled without exit code
}

export interface FileEntry {
  name: string;
  type: string;
  size: number;
  modifyTime: Date;
}

export interface ConnectionInfo {
  name: string;
  host: string;
  port: number;
  username: string;
  proxyJump?: string;
  source?: string;
}

export interface BinaryLaneSSHConfig {
  enabled: boolean;
  apiToken?: string;
  defaultUsername: string;
  defaultPrivateKeyPath?: string;
}

export interface SSHMCPConfig {
  defaultPrivateKeyPath?: string;
  binarylane: BinaryLaneSSHConfig;
  connections: Array<{
    name: string;
    host: string;
    port?: number;
    username: string;
    privateKeyPath?: string;
    password?: string;
    proxyJump?: string;
  }>;
}
