/**
 * Detailed per-method documentation for the `describe` tool.
 *
 * This is verbose by design — only loaded when the model needs
 * full details before writing code for a specific method.
 */

export interface MethodDoc {
  name: string;
  fullDescription: string;
  parameterDetails: string;
  returnDetails: string;
  examples: string[];
  gotchas?: string[];
  relatedMethods?: string[];
}

export const methodDocs: Record<string, MethodDoc> = {
  // ==================== Key methods with platform-specific gotchas ====================

  'bl.performServerAction': {
    name: 'bl.performServerAction',
    fullDescription: 'Perform an action on a server. This is the master dispatch for all server operations including power management, backups, resize, firewall rules, and more.',
    parameterDetails: `
serverId: number — The server ID
action: ServerAction — An object with { type: string, ...params }

Action types and their parameters:
  Power: { type: 'power_on' | 'power_off' | 'reboot' | 'shutdown' | 'power_cycle' }
  Status: { type: 'ping' | 'uptime' | 'is_running' }
  Backup: { type: 'take_backup', backup_type?: 'daily'|'weekly'|'monthly'|'temporary', replacement_strategy?: 'none'|'specified'|'oldest'|'newest', backup_id_to_replace?: number, label?: string }
  Restore: { type: 'restore', image: number }
  Rebuild: { type: 'rebuild', image: string | number }
  Resize: { type: 'resize', size: string }
  Rename: { type: 'rename', name: string }
  Firewall: { type: 'change_advanced_firewall_rules', firewall_rules: AdvancedFirewallRule[] }
  Features: { type: 'change_advanced_features', features: Record<string, boolean> }
  VPC IP: { type: 'change_vpc_ipv4', ipv4_address: string }
  Reverse DNS: { type: 'change_reverse_name', reverse_name: string }
  Toggle: { type: 'change_ipv6'|'change_port_blocking', enabled: boolean }
  Disk: { type: 'add_disk', size_gigabytes: number } | { type: 'resize_disk', disk_id: number, size_gigabytes: number } | { type: 'delete_disk', disk_id: number }
  Kernel: { type: 'change_kernel', kernel: number }
  Region: { type: 'change_region', region: string }
  Alerts: { type: 'change_threshold_alerts', threshold_alerts: Array<{ alert_type: string, value: number, enabled: boolean }> }
  Clone: { type: 'clone_using_backup', image: number, target_server_id: number }
  Enable backups: { type: 'enable_backups' }
  Disable backups: { type: 'disable_backups' }
  Enable IPv6: { type: 'enable_ipv6' }`,
    returnDetails: '{ action: Action } — Action object with id, status, type, started_at, progress',
    examples: [
      `await bl.performServerAction(123, { type: 'reboot' })`,
      `await bl.performServerAction(123, { type: 'resize', size: 'std-2' })`,
      `await bl.performServerAction(123, { type: 'take_backup', backup_type: 'daily', replacement_strategy: 'oldest' })`,
      `await bl.performServerAction(123, { type: 'change_advanced_firewall_rules', firewall_rules: [
  { source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'], destination_ports: ['22'], protocol: 'tcp', action: 'accept', description: 'Allow SSH' },
  { source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'], destination_ports: ['80','443'], protocol: 'tcp', action: 'accept', description: 'Allow HTTP/S' },
  { source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'], destination_ports: ['53'], protocol: 'udp', action: 'accept', description: 'Allow DNS' },
  { source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'], protocol: 'udp', action: 'drop', description: 'Drop other UDP' },
  { source_addresses: ['0.0.0.0/0'], destination_addresses: ['0.0.0.0/0'], protocol: 'icmp', action: 'accept', description: 'Allow ICMP' },
] })`,
    ],
    gotchas: [
      'Firewall rules are STATELESS — no implicit deny. You must include explicit drop rules.',
      'Always include UDP 53 (DNS) ACCEPT before any UDP DROP rule, or DNS breaks.',
      'Firewall rules REPLACE all existing rules — not additive. Include the complete ruleset.',
      'Replacement strategies for backups: "none" errors if no free slot, "oldest"/"newest" auto-replace.',
    ],
    relatedMethods: ['bl.getServerFirewallRules', 'bl.getServerBackups', 'bl.listSizes'],
  },

  'bl.createServer': {
    name: 'bl.createServer',
    fullDescription: 'Create a new server with the specified configuration. Returns the server and an action link for tracking provisioning progress.',
    parameterDetails: `
request: CreateServerRequest
  size: string — Plan slug (e.g. 'std-min', 'std-2'). Use bl.listSizes() to find available plans.
  image: string | number — Image slug (e.g. 'ubuntu-22.04') or image ID
  region: string — Region slug: 'syd' (Sydney), 'mel' (Melbourne), 'bne' (Brisbane), 'per' (Perth)
  name?: string — Server hostname (alphanumeric + hyphens, no leading/trailing hyphens)
  backups?: boolean — Enable automatic backups
  ipv6?: boolean — Enable IPv6
  vpc_id?: number — Assign to a VPC
  ssh_keys?: (number | string)[] — SSH key IDs or fingerprints to install
  user_data?: string — Cloud-init user data
  options?: SizeOptions — Custom size options (ipv4_addresses, memory, disk, transfer)
  port_blocking?: boolean — Enable port blocking
  password?: string — Root password (not recommended, use SSH keys)`,
    returnDetails: '{ server: Server, links?: { action?: ActionLink } }',
    examples: [
      `await bl.createServer({ size: 'std-min', image: 'ubuntu-22.04', region: 'syd', name: 'my-server', ssh_keys: [12345] })`,
    ],
    gotchas: [
      'Server name must be alphanumeric with hyphens only, no leading/trailing hyphens.',
      'Use bl.listSizes({ image: "ubuntu-22.04" }) to find valid size slugs for an image.',
      'Regions: syd (Sydney), mel (Melbourne), bne (Brisbane), per (Perth).',
    ],
    relatedMethods: ['bl.listSizes', 'bl.listImages', 'bl.listRegions', 'bl.listSshKeys'],
  },

  'bl.createLoadBalancer': {
    name: 'bl.createLoadBalancer',
    fullDescription: 'Create a new load balancer. BinaryLane LBs are anycast — location is determined by assigned servers, NOT by a region parameter.',
    parameterDetails: `
request: CreateLoadBalancerRequest
  name: string — Load balancer name
  forwarding_rules: ForwardingRule[] — At least one rule required
    entry_protocol: 'http' | 'https' | 'tcp' | 'udp'
    entry_port: number
    target_protocol: 'http' | 'https' | 'tcp' | 'udp'
    target_port: number
    certificate_id?: string — For TLS termination
    tls_passthrough?: boolean — For TLS passthrough
  health_check?: HealthCheck
    protocol: string, port: number, path?: string, hostname?: string
    check_interval_seconds?: number, response_timeout_seconds?: number
    unhealthy_threshold?: number, healthy_threshold?: number
  sticky_sessions?: StickySession
  server_ids?: number[]
  algorithm?: string
  size_slug?: string`,
    returnDetails: '{ load_balancer: LoadBalancer }',
    examples: [
      `await bl.createLoadBalancer({
  name: 'web-lb',
  forwarding_rules: [
    { entry_protocol: 'http', entry_port: 80, target_protocol: 'http', target_port: 80 },
    { entry_protocol: 'https', entry_port: 443, target_protocol: 'http', target_port: 80 }
  ],
  server_ids: [1, 2, 3]
})`,
    ],
    gotchas: [
      'DO NOT pass a region parameter — it causes an IP allocation error. Location is determined by assigned servers.',
      'After creation, each backend server must add the LB anycast IP to its loopback interface: ip addr add <LB_IP>/32 dev lo',
      'Persist loopback config via netplan: /etc/netplan/60-lb-loopback.yaml',
      'Health check hostname defaults to the LB name if not specified.',
    ],
    relatedMethods: ['bl.addServersToLoadBalancer', 'bl.addForwardingRulesToLoadBalancer', 'bl.getLoadBalancerAvailability'],
  },

  'ssh.run': {
    name: 'ssh.run',
    fullDescription: 'Execute a shell command on a remote server via SSH. Supports connection names from config, BinaryLane auto-discovery names, or direct IP addresses.',
    parameterDetails: `
target: string — Connection name (e.g. 'wp-web-1-syd') or IP address. Use ssh.connections() to list available connections.
command: string — Shell command to execute
options?: { timeout?: number } — Command timeout in ms (default: 30000)`,
    returnDetails: '{ stdout: string, stderr: string, code: number } — Exit code 0 = success',
    examples: [
      `await ssh.run('my-server', 'uptime')`,
      `await ssh.run('wp-web-1-syd', 'df -h /')`,
      `await ssh.run('jumpbox', 'cat /etc/os-release', { timeout: 5000 })`,
      `// Run on multiple servers in parallel
const servers = ['wp-web-1', 'wp-web-2', 'wp-web-3'];
const results = await Promise.all(servers.map(s => ssh.run(s, 'systemctl status nginx')));`,
    ],
    gotchas: [
      'Servers behind a VPC are reached via ProxyJump (configured in connections.json) — you just use the name.',
      'If a server name from BinaryLane auto-discovery conflicts with a config entry, the config entry wins.',
      'Default timeout is 30 seconds. Long-running commands need a higher timeout.',
    ],
    relatedMethods: ['ssh.connections', 'ssh.readFile', 'ssh.writeFile'],
  },

  'ssh.connections': {
    name: 'ssh.connections',
    fullDescription: 'List all available SSH connections from all sources: manually configured (config file), environment variable, and BinaryLane auto-discovered servers.',
    parameterDetails: 'None',
    returnDetails: 'ConnectionInfo[] — Array of { name, host, port, username, proxyJump?, source? }. Source indicates where the connection came from: "config", "env", or "binarylane".',
    examples: [
      `const conns = ssh.connections();
conns.forEach(c => console.log(\`\${c.name}: \${c.host} (\${c.source})\`));`,
    ],
    relatedMethods: ['ssh.run', 'ssh.testConnection'],
  },

  // ==================== Server management ====================

  'bl.listServers': {
    name: 'bl.listServers',
    fullDescription: 'List all servers in the account. Supports pagination and hostname filtering. Returns server objects with full details including IPs, VPC, status, and specs.',
    parameterDetails: `
params?: PaginationParams & { hostname?: string }
  page?: number — Page number (starts at 1)
  per_page?: number — Results per page (1-200)
  hostname?: string — Filter by hostname`,
    returnDetails: `{ servers: Server[], links?: LinksResponse, meta?: MetaResponse }

Server object includes:
  id, name, status, memory, vcpus, disk, created_at
  region: { slug, name }
  image: { id, name, slug, distribution }
  size: { slug, price_monthly }
  networks: { v4: [{ ip_address, type: 'public'|'private' }], v6: [...] }
  vpc_id, backup_ids, features, disks`,
    examples: [
      `const { servers } = await bl.listServers()`,
      `const { servers } = await bl.listServers({ hostname: 'wp-web' })`,
      `// Get all servers with their public IPs
const { servers } = await bl.listServers();
const summary = servers.map(s => ({
  name: s.name,
  ip: s.networks.v4.find(n => n.type === 'public')?.ip_address,
  status: s.status,
  region: s.region.slug,
}));
return summary;`,
    ],
    gotchas: [
      'Default per_page is 20. Use per_page: 200 to get more at once.',
      'The hostname filter does partial matching.',
    ],
    relatedMethods: ['bl.getServer', 'bl.createServer', 'bl.getServerLatestMetrics'],
  },

  'bl.deleteServer': {
    name: 'bl.deleteServer',
    fullDescription: 'Permanently delete a server. This is irreversible. All data on the server is destroyed.',
    parameterDetails: `
serverId: number — The server ID to delete
reason?: string — Optional reason for audit purposes`,
    returnDetails: 'void',
    examples: [
      `await bl.deleteServer(12345, 'Decommissioned')`,
    ],
    gotchas: [
      'This is IRREVERSIBLE. All data is destroyed.',
      'Take a backup first if you might need the data later.',
      'The server must not be the last member of a load balancer pool.',
    ],
    relatedMethods: ['bl.getServer', 'bl.performServerAction'],
  },

  // ==================== DNS ====================

  'bl.createDomainRecord': {
    name: 'bl.createDomainRecord',
    fullDescription: 'Create a DNS record for a domain. Supports A, AAAA, CNAME, MX, TXT, NS, SRV, and CAA record types.',
    parameterDetails: `
domainName: string | number — The domain name or ID
request: CreateDomainRecordRequest
  type: string — 'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA'
  name: string — Record name (e.g. 'www', '@' for root)
  data: string — Record value (e.g. IP for A, hostname for CNAME)
  ttl?: number — TTL in seconds (3600-86400, default varies)
  priority?: number — For MX and SRV records
  port?: number — For SRV records
  weight?: number — For SRV records
  flags?: number — For CAA records (0 or 128)
  tag?: string — For CAA records ('issue', 'issuewild', 'iodef')`,
    returnDetails: '{ domain_record: DomainRecord }',
    examples: [
      `await bl.createDomainRecord('example.com', { type: 'A', name: 'www', data: '203.0.113.10', ttl: 3600 })`,
      `await bl.createDomainRecord('example.com', { type: 'CNAME', name: 'blog', data: 'example.com.', ttl: 3600 })`,
      `await bl.createDomainRecord('example.com', { type: 'MX', name: '@', data: 'mail.example.com.', priority: 10, ttl: 3600 })`,
      `await bl.createDomainRecord('example.com', { type: 'TXT', name: '@', data: 'v=spf1 include:_spf.google.com ~all', ttl: 3600 })`,
    ],
    gotchas: [
      'CNAME data must end with a trailing dot (e.g. "example.com.").',
      'TTL range: 3600 (1 hour) to 86400 (24 hours).',
      'Use "@" for the root domain name.',
      'MX records need a priority value.',
    ],
    relatedMethods: ['bl.listDomainRecords', 'bl.updateDomainRecord', 'bl.deleteDomainRecord'],
  },

  // ==================== VPCs ====================

  'bl.createVpc': {
    name: 'bl.createVpc',
    fullDescription: 'Create a new Virtual Private Cloud. IP range is auto-assigned from 10.240.0.0/16 if not specified.',
    parameterDetails: `
request: CreateVpcRequest
  name: string — VPC name
  ip_range?: string — CIDR notation (e.g. '10.240.0.0/16'). Auto-assigned if omitted.`,
    returnDetails: '{ vpc: Vpc }',
    examples: [
      `await bl.createVpc({ name: 'production-vpc' })`,
      `await bl.createVpc({ name: 'staging-vpc', ip_range: '10.241.0.0/16' })`,
    ],
    gotchas: [
      'VPC IP ranges cannot overlap with other VPCs in your account.',
      'Servers must be in the same region to be in the same VPC.',
      'VPC must be empty (no servers) before it can be deleted.',
    ],
    relatedMethods: ['bl.listVpcs', 'bl.getVpcMembers', 'bl.deleteVpc'],
  },

  // ==================== Metrics ====================

  'bl.getServerMetrics': {
    name: 'bl.getServerMetrics',
    fullDescription: 'Get historical performance metrics for a server including CPU, memory, network, and disk I/O. Data is available at various intervals.',
    parameterDetails: `
serverId: number — The server ID
params?: {
  data_interval?: string — 'five-minute', 'half-hour', 'four-hour', 'day', 'week', 'month'
  start?: string — ISO 8601 start time
  end?: string — ISO 8601 end time
  page?: number
  per_page?: number
}`,
    returnDetails: `{ sample_sets: SampleSet[], links?, meta? }

SampleSet includes:
  server_id: number
  period: { start, end, data_interval }
  average?: SampleData — Period averages
  maximum_memory_megabytes?: number
  maximum_storage_gigabytes?: number

SampleData fields:
  cpu_usage_percent: number (0-100)
  cpu_usage_detailed?: number[] (per-vCPU breakdown)
  memory_usage_bytes: number
  network_incoming_kbps: number
  network_outgoing_kbps: number
  storage_usage_megabytes: number
  storage_read_kbps: number
  storage_write_kbps: number
  storage_read_requests_per_second: number
  storage_write_requests_per_second: number`,
    examples: [
      `// Last hour of 5-minute metrics
const { sample_sets } = await bl.getServerMetrics(123, { data_interval: 'five-minute' })`,
      `// Daily metrics for a date range
const { sample_sets } = await bl.getServerMetrics(123, {
  data_interval: 'day',
  start: '2026-04-01T00:00:00Z',
  end: '2026-04-20T00:00:00Z'
})`,
    ],
    gotchas: [
      'Finer intervals (five-minute) have shorter retention than coarser ones (day, week).',
      'memory_used and memory_cached may not be available for all server types.',
    ],
    relatedMethods: ['bl.getServerLatestMetrics', 'bl.getCurrentDataUsage'],
  },

  // ==================== SSH file operations ====================

  'ssh.readFile': {
    name: 'ssh.readFile',
    fullDescription: 'Read a file from a remote server via SFTP. Returns the file contents as a string.',
    parameterDetails: `
target: string — Connection name or IP address
remotePath: string — Absolute path to the file on the remote server`,
    returnDetails: 'string — The file contents',
    examples: [
      `const content = await ssh.readFile('my-server', '/etc/nginx/nginx.conf')`,
      `const hosts = await ssh.readFile('jumpbox', '/etc/hosts')`,
    ],
    gotchas: [
      'Large files will consume memory. For very large files, use ssh.run() with head/tail instead.',
      'Binary files will be mangled — this is for text files only.',
    ],
    relatedMethods: ['ssh.writeFile', 'ssh.run', 'ssh.listDir'],
  },

  'ssh.writeFile': {
    name: 'ssh.writeFile',
    fullDescription: 'Write content to a file on a remote server via SFTP. Creates or overwrites the file.',
    parameterDetails: `
target: string — Connection name or IP address
remotePath: string — Absolute path to write to on the remote server
content: string — The file content to write`,
    returnDetails: 'void',
    examples: [
      `await ssh.writeFile('my-server', '/tmp/test.txt', 'Hello world')`,
      `// Write a netplan config for load balancer loopback
const config = \`network:
  version: 2
  ethernets:
    lo:
      addresses:
        - 10.0.0.1/32\`;
await ssh.writeFile('wp-web-1', '/etc/netplan/60-lb-loopback.yaml', config)`,
    ],
    gotchas: [
      'This OVERWRITES the file if it exists.',
      'The SSH user must have write permission to the target path.',
      'For system files, you may need to write to /tmp first then use ssh.run() to sudo mv.',
    ],
    relatedMethods: ['ssh.readFile', 'ssh.run', 'ssh.upload'],
  },
};

/**
 * Get documentation for a method. Returns undefined if not found.
 * Falls back to generating basic docs from the catalog entry.
 */
export function getMethodDoc(methodName: string): MethodDoc | undefined {
  return methodDocs[methodName];
}
