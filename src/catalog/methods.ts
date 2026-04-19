/**
 * Method catalog — the search index for all bl.* and ssh.* methods.
 *
 * Each entry is compact: just enough for search results.
 * Detailed docs live in docs.ts and are returned by the `describe` tool.
 */

export interface ParamInfo {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface CatalogEntry {
  name: string;
  description: string;
  parameters: ParamInfo[];
  returnType: string;
  tags: string[];
  destructive: boolean;
  idempotent: boolean;
}

export const methodCatalog: CatalogEntry[] = [
  // ==================== bl.* — Account ====================
  {
    name: 'bl.getAccount',
    description: 'Get account info (email, verification status, server limits)',
    parameters: [],
    returnType: '{ account: Account }',
    tags: ['account', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getBalance',
    description: 'Get account balance and month-to-date usage',
    parameters: [],
    returnType: '{ balance: Balance }',
    tags: ['account', 'billing', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getInvoices',
    description: 'List invoices (paginated)',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false, description: 'page, per_page' },
    ],
    returnType: '{ invoices: Invoice[], links?, meta? }',
    tags: ['account', 'billing', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getInvoice',
    description: 'Get a specific invoice by ID',
    parameters: [
      { name: 'invoiceId', type: 'number', required: true },
    ],
    returnType: '{ invoice: Invoice }',
    tags: ['account', 'billing', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getUnpaidFailedInvoices',
    description: 'Get invoices with failed payments',
    parameters: [],
    returnType: '{ unpaid_failed_invoices: Invoice[] }',
    tags: ['account', 'billing', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.proceedAction',
    description: 'Confirm or cancel an action that requires user interaction',
    parameters: [
      { name: 'actionId', type: 'number', required: true },
      { name: 'proceed', type: 'boolean', required: true, description: 'true to confirm, false to cancel' },
    ],
    returnType: 'void',
    tags: ['account', 'action', 'confirm'],
    destructive: true,
    idempotent: false,
  },

  // ==================== bl.* — Servers ====================
  {
    name: 'bl.listServers',
    description: 'List all servers (paginated, optional hostname filter)',
    parameters: [
      { name: 'params', type: 'PaginationParams & { hostname?: string }', required: false },
    ],
    returnType: '{ servers: Server[], links?, meta? }',
    tags: ['servers', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServer',
    description: 'Get detailed info about a server by ID',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
    ],
    returnType: '{ server: Server }',
    tags: ['servers', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.createServer',
    description: 'Create a new server',
    parameters: [
      { name: 'request', type: 'CreateServerRequest', required: true, description: 'size, image, region, name, ssh_keys, etc.' },
    ],
    returnType: '{ server: Server, links? }',
    tags: ['servers', 'create'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'bl.deleteServer',
    description: 'Delete a server permanently',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'reason', type: 'string', required: false },
    ],
    returnType: 'void',
    tags: ['servers', 'delete', 'destructive'],
    destructive: true,
    idempotent: false,
  },
  {
    name: 'bl.performServerAction',
    description: 'Perform an action on a server (power_on, reboot, resize, rename, take_backup, change_firewall_rules, etc.)',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'action', type: 'ServerAction', required: true, description: '{ type: string, ...params }' },
    ],
    returnType: '{ action: Action }',
    tags: ['servers', 'action', 'power', 'backup', 'firewall', 'resize', 'rename'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'bl.listServerActions',
    description: 'List actions performed on a server (paginated)',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ actions: Action[], links?, meta? }',
    tags: ['servers', 'actions', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerAction',
    description: 'Get details of a specific action on a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'actionId', type: 'number', required: true },
    ],
    returnType: '{ action: Action }',
    tags: ['servers', 'actions', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerBackups',
    description: 'List backups for a server (paginated)',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ backups: Backup[], links?, meta? }',
    tags: ['servers', 'backups', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerFirewallRules',
    description: 'Get advanced firewall rules for a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
    ],
    returnType: '{ firewall_rules: AdvancedFirewallRule[] }',
    tags: ['servers', 'firewall', 'security', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerConsole',
    description: 'Get VNC console access URLs for a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
    ],
    returnType: '{ console: ConsoleInfo }',
    tags: ['servers', 'console', 'vnc', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getCurrentDataUsage',
    description: 'Get current data transfer usage for a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
    ],
    returnType: '{ data_usage: DataUsage }',
    tags: ['servers', 'data', 'transfer', 'bandwidth', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.listAllDataUsage',
    description: 'Get current data usage for all servers (paginated)',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ data_usages: DataUsage[], links?, meta? }',
    tags: ['servers', 'data', 'transfer', 'bandwidth', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerKernels',
    description: 'List available kernels for a server (paginated)',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ kernels: Kernel[], links?, meta? }',
    tags: ['servers', 'kernels', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerAvailableFeatures',
    description: 'List available advanced features for a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
    ],
    returnType: '{ available_advanced_server_features: AdvancedServerFeature[] }',
    tags: ['servers', 'features', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerThresholdAlerts',
    description: 'Get threshold alert config for a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
    ],
    returnType: '{ threshold_alerts: ThresholdAlert[] }',
    tags: ['servers', 'alerts', 'monitoring', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.listExceededThresholdAlerts',
    description: 'List all servers that have exceeded their threshold alerts',
    parameters: [],
    returnType: '{ current_server_alerts: CurrentServerAlert[] }',
    tags: ['servers', 'alerts', 'monitoring', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerSoftware',
    description: 'List licensed software on a server (paginated)',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ software: LicensedSoftware[], links?, meta? }',
    tags: ['servers', 'software', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerUserData',
    description: 'Get cloud-init user data for a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
    ],
    returnType: '{ user_data: string }',
    tags: ['servers', 'cloud-init', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.uploadBackup',
    description: 'Upload a backup image from a URL to a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'request', type: 'UploadImageRequest', required: true, description: '{ url, label?, backup_type? }' },
    ],
    returnType: '{ action: Action }',
    tags: ['servers', 'backups', 'upload'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'bl.getServerSnapshots',
    description: 'List snapshots for a server (paginated)',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ snapshots: Backup[], links?, meta? }',
    tags: ['servers', 'snapshots', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.updateIpv6Reverse',
    description: 'Update reverse DNS for an IPv6 address on a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'ipAddress', type: 'string', required: true },
      { name: 'reverseName', type: 'string', required: true },
    ],
    returnType: 'void',
    tags: ['servers', 'dns', 'reverse', 'ipv6'],
    destructive: false,
    idempotent: true,
  },

  // ==================== bl.* — Metrics ====================
  {
    name: 'bl.getServerMetrics',
    description: 'Get historical performance metrics for a server (CPU, network, disk, memory)',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
      { name: 'params', type: '{ data_interval?, start?, end?, page?, per_page? }', required: false },
    ],
    returnType: '{ sample_sets: SampleSet[], links?, meta? }',
    tags: ['servers', 'metrics', 'monitoring', 'cpu', 'network', 'disk', 'memory', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getServerLatestMetrics',
    description: 'Get the most recent performance metrics for a server',
    parameters: [
      { name: 'serverId', type: 'number', required: true },
    ],
    returnType: '{ sample_set: SampleSet }',
    tags: ['servers', 'metrics', 'monitoring', 'cpu', 'network', 'disk', 'memory', 'read-only'],
    destructive: false,
    idempotent: true,
  },

  // ==================== bl.* — Images ====================
  {
    name: 'bl.listImages',
    description: 'List images (distributions, backups, snapshots), filterable by type',
    parameters: [
      { name: 'params', type: 'PaginationParams & { type?: string }', required: false, description: 'type: distribution|backup|custom' },
    ],
    returnType: '{ images: Image[], links?, meta? }',
    tags: ['images', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getImage',
    description: 'Get image details by ID or slug',
    parameters: [
      { name: 'imageIdOrSlug', type: 'number | string', required: true },
    ],
    returnType: '{ image: Image }',
    tags: ['images', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.deleteImage',
    description: 'Delete a custom image (backup or snapshot)',
    parameters: [
      { name: 'imageId', type: 'number', required: true },
    ],
    returnType: 'void',
    tags: ['images', 'delete', 'destructive'],
    destructive: true,
    idempotent: false,
  },
  {
    name: 'bl.updateImage',
    description: 'Update image name or description',
    parameters: [
      { name: 'imageId', type: 'number', required: true },
      { name: 'request', type: 'UpdateImageRequest', required: true, description: '{ name?, description? }' },
    ],
    returnType: '{ image: Image }',
    tags: ['images', 'update'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getImageDownload',
    description: 'Get a temporary download URL for a custom image',
    parameters: [
      { name: 'imageId', type: 'number', required: true },
    ],
    returnType: '{ links: { download: string } }',
    tags: ['images', 'download', 'read-only'],
    destructive: false,
    idempotent: true,
  },

  // ==================== bl.* — SSH Keys ====================
  {
    name: 'bl.listSshKeys',
    description: 'List SSH keys registered to the account',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ ssh_keys: SshKey[], links?, meta? }',
    tags: ['ssh-keys', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getSshKey',
    description: 'Get SSH key details by ID',
    parameters: [
      { name: 'keyId', type: 'number', required: true },
    ],
    returnType: '{ ssh_key: SshKey }',
    tags: ['ssh-keys', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.createSshKey',
    description: 'Register a new SSH public key',
    parameters: [
      { name: 'request', type: 'CreateSshKeyRequest', required: true, description: '{ public_key, name, default? }' },
    ],
    returnType: '{ ssh_key: SshKey }',
    tags: ['ssh-keys', 'create'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'bl.updateSshKey',
    description: 'Update SSH key name or default status',
    parameters: [
      { name: 'keyId', type: 'number', required: true },
      { name: 'request', type: 'UpdateSshKeyRequest', required: true, description: '{ name?, default? }' },
    ],
    returnType: '{ ssh_key: SshKey }',
    tags: ['ssh-keys', 'update'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.deleteSshKey',
    description: 'Delete an SSH key from the account',
    parameters: [
      { name: 'keyId', type: 'number', required: true },
    ],
    returnType: 'void',
    tags: ['ssh-keys', 'delete', 'destructive'],
    destructive: true,
    idempotent: false,
  },

  // ==================== bl.* — Domains ====================
  {
    name: 'bl.listDomains',
    description: 'List domains managed in the account (paginated)',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ domains: Domain[], links?, meta? }',
    tags: ['domains', 'dns', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getDomain',
    description: 'Get domain details by name or ID',
    parameters: [
      { name: 'domainName', type: 'string | number', required: true },
    ],
    returnType: '{ domain: Domain }',
    tags: ['domains', 'dns', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.createDomain',
    description: 'Register a domain for BinaryLane DNS management',
    parameters: [
      { name: 'request', type: 'CreateDomainRequest', required: true, description: '{ name, ip_address? }' },
    ],
    returnType: '{ domain: Domain }',
    tags: ['domains', 'dns', 'create'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'bl.deleteDomain',
    description: 'Delete a domain from DNS management',
    parameters: [
      { name: 'domainName', type: 'string | number', required: true },
    ],
    returnType: 'void',
    tags: ['domains', 'dns', 'delete', 'destructive'],
    destructive: true,
    idempotent: false,
  },
  {
    name: 'bl.listDomainRecords',
    description: 'List DNS records for a domain (paginated)',
    parameters: [
      { name: 'domainName', type: 'string | number', required: true },
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ domain_records: DomainRecord[], links?, meta? }',
    tags: ['domains', 'dns', 'records', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getDomainRecord',
    description: 'Get a specific DNS record',
    parameters: [
      { name: 'domainName', type: 'string | number', required: true },
      { name: 'recordId', type: 'number', required: true },
    ],
    returnType: '{ domain_record: DomainRecord }',
    tags: ['domains', 'dns', 'records', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.createDomainRecord',
    description: 'Create a DNS record (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA)',
    parameters: [
      { name: 'domainName', type: 'string | number', required: true },
      { name: 'request', type: 'CreateDomainRecordRequest', required: true, description: '{ type, name, data, ttl?, priority?, ... }' },
    ],
    returnType: '{ domain_record: DomainRecord }',
    tags: ['domains', 'dns', 'records', 'create'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'bl.updateDomainRecord',
    description: 'Update a DNS record',
    parameters: [
      { name: 'domainName', type: 'string | number', required: true },
      { name: 'recordId', type: 'number', required: true },
      { name: 'request', type: 'UpdateDomainRecordRequest', required: true },
    ],
    returnType: '{ domain_record: DomainRecord }',
    tags: ['domains', 'dns', 'records', 'update'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.deleteDomainRecord',
    description: 'Delete a DNS record',
    parameters: [
      { name: 'domainName', type: 'string | number', required: true },
      { name: 'recordId', type: 'number', required: true },
    ],
    returnType: 'void',
    tags: ['domains', 'dns', 'records', 'delete', 'destructive'],
    destructive: true,
    idempotent: false,
  },
  {
    name: 'bl.listNameservers',
    description: 'List BinaryLane nameservers',
    parameters: [],
    returnType: '{ nameservers: Nameserver[] }',
    tags: ['domains', 'dns', 'nameservers', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.refreshNameserverCache',
    description: 'Refresh nameserver cache for a domain',
    parameters: [
      { name: 'domainName', type: 'string', required: true },
    ],
    returnType: 'void',
    tags: ['domains', 'dns', 'nameservers', 'cache'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.listIpv6ReverseName',
    description: 'List IPv6 reverse DNS entries (paginated)',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ reverse_names: ReverseName[], links?, meta? }',
    tags: ['dns', 'reverse', 'ipv6', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },

  // ==================== bl.* — VPCs ====================
  {
    name: 'bl.listVpcs',
    description: 'List Virtual Private Clouds (paginated)',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ vpcs: Vpc[], links?, meta? }',
    tags: ['vpcs', 'network', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getVpc',
    description: 'Get VPC details by ID',
    parameters: [
      { name: 'vpcId', type: 'number', required: true },
    ],
    returnType: '{ vpc: Vpc }',
    tags: ['vpcs', 'network', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.createVpc',
    description: 'Create a new VPC (IP range auto-assigned if not specified)',
    parameters: [
      { name: 'request', type: 'CreateVpcRequest', required: true, description: '{ name, ip_range? }' },
    ],
    returnType: '{ vpc: Vpc }',
    tags: ['vpcs', 'network', 'create'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'bl.updateVpc',
    description: 'Update VPC name or route entries',
    parameters: [
      { name: 'vpcId', type: 'number', required: true },
      { name: 'request', type: 'UpdateVpcRequest', required: true, description: '{ name?, route_entries? }' },
    ],
    returnType: '{ vpc: Vpc }',
    tags: ['vpcs', 'network', 'update'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.deleteVpc',
    description: 'Delete a VPC (must be empty — no servers)',
    parameters: [
      { name: 'vpcId', type: 'number', required: true },
    ],
    returnType: 'void',
    tags: ['vpcs', 'network', 'delete', 'destructive'],
    destructive: true,
    idempotent: false,
  },
  {
    name: 'bl.getVpcMembers',
    description: 'List resources in a VPC (servers, load balancers)',
    parameters: [
      { name: 'vpcId', type: 'number', required: true },
      { name: 'params', type: 'PaginationParams & { resource_type?: string }', required: false },
    ],
    returnType: '{ members: VpcMember[], links?, meta? }',
    tags: ['vpcs', 'network', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },

  // ==================== bl.* — Load Balancers ====================
  {
    name: 'bl.listLoadBalancers',
    description: 'List load balancers (paginated)',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ load_balancers: LoadBalancer[], links?, meta? }',
    tags: ['load-balancers', 'network', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getLoadBalancer',
    description: 'Get load balancer details by ID',
    parameters: [
      { name: 'loadBalancerId', type: 'number', required: true },
    ],
    returnType: '{ load_balancer: LoadBalancer }',
    tags: ['load-balancers', 'network', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.createLoadBalancer',
    description: 'Create a load balancer (anycast — no region param, location determined by servers)',
    parameters: [
      { name: 'request', type: 'CreateLoadBalancerRequest', required: true, description: '{ name, forwarding_rules, health_check?, server_ids?, ... }' },
    ],
    returnType: '{ load_balancer: LoadBalancer }',
    tags: ['load-balancers', 'network', 'create'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'bl.updateLoadBalancer',
    description: 'Update load balancer configuration',
    parameters: [
      { name: 'loadBalancerId', type: 'number', required: true },
      { name: 'request', type: 'UpdateLoadBalancerRequest', required: true },
    ],
    returnType: '{ load_balancer: LoadBalancer }',
    tags: ['load-balancers', 'network', 'update'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.deleteLoadBalancer',
    description: 'Delete a load balancer',
    parameters: [
      { name: 'loadBalancerId', type: 'number', required: true },
    ],
    returnType: 'void',
    tags: ['load-balancers', 'network', 'delete', 'destructive'],
    destructive: true,
    idempotent: false,
  },
  {
    name: 'bl.getLoadBalancerAvailability',
    description: 'Get load balancer pricing and availability for a region',
    parameters: [
      { name: 'region', type: 'string', required: true },
    ],
    returnType: '{ load_balancer_availability: LoadBalancerAvailability[] }',
    tags: ['load-balancers', 'pricing', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.addServersToLoadBalancer',
    description: 'Add servers to a load balancer pool',
    parameters: [
      { name: 'loadBalancerId', type: 'number', required: true },
      { name: 'serverIds', type: 'number[]', required: true },
    ],
    returnType: 'void',
    tags: ['load-balancers', 'servers', 'update'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.removeServersFromLoadBalancer',
    description: 'Remove servers from a load balancer pool',
    parameters: [
      { name: 'loadBalancerId', type: 'number', required: true },
      { name: 'serverIds', type: 'number[]', required: true },
    ],
    returnType: 'void',
    tags: ['load-balancers', 'servers', 'remove', 'destructive'],
    destructive: true,
    idempotent: true,
  },
  {
    name: 'bl.addForwardingRulesToLoadBalancer',
    description: 'Add forwarding rules to a load balancer',
    parameters: [
      { name: 'loadBalancerId', type: 'number', required: true },
      { name: 'forwardingRules', type: 'ForwardingRule[]', required: true },
    ],
    returnType: 'void',
    tags: ['load-balancers', 'forwarding', 'update'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.removeForwardingRulesFromLoadBalancer',
    description: 'Remove forwarding rules from a load balancer',
    parameters: [
      { name: 'loadBalancerId', type: 'number', required: true },
      { name: 'forwardingRules', type: 'ForwardingRule[]', required: true },
    ],
    returnType: 'void',
    tags: ['load-balancers', 'forwarding', 'remove', 'destructive'],
    destructive: true,
    idempotent: true,
  },

  // ==================== bl.* — Regions & Sizes ====================
  {
    name: 'bl.listRegions',
    description: 'List available data center regions (syd, mel, bne, per)',
    parameters: [],
    returnType: '{ regions: Region[] }',
    tags: ['regions', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.listSizes',
    description: 'List available server plans with pricing, filterable by server_id (for resize) or image',
    parameters: [
      { name: 'params', type: '{ server_id?: number, image?: string | number }', required: false },
    ],
    returnType: '{ sizes: Size[] }',
    tags: ['sizes', 'pricing', 'plans', 'read-only'],
    destructive: false,
    idempotent: true,
  },

  // ==================== bl.* — Actions ====================
  {
    name: 'bl.listActions',
    description: 'List all actions across the account (paginated)',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ actions: Action[], links?, meta? }',
    tags: ['actions', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getAction',
    description: 'Get action details including status and progress',
    parameters: [
      { name: 'actionId', type: 'number', required: true },
    ],
    returnType: '{ action: Action }',
    tags: ['actions', 'read-only'],
    destructive: false,
    idempotent: true,
  },

  // ==================== bl.* — Software ====================
  {
    name: 'bl.listSoftware',
    description: 'List all available licensed software with pricing',
    parameters: [
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ software: Software[], links?, meta? }',
    tags: ['software', 'licensing', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.getSoftware',
    description: 'Get software details by ID',
    parameters: [
      { name: 'softwareId', type: 'number', required: true },
    ],
    returnType: '{ software: Software }',
    tags: ['software', 'licensing', 'read-only'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'bl.listSoftwareForOS',
    description: 'List software available for a specific operating system',
    parameters: [
      { name: 'operatingSystemId', type: 'string | number', required: true },
      { name: 'params', type: 'PaginationParams', required: false },
    ],
    returnType: '{ software: Software[], links?, meta? }',
    tags: ['software', 'licensing', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },

  // ==================== ssh.* ====================
  {
    name: 'ssh.run',
    description: 'Execute a shell command on a remote server',
    parameters: [
      { name: 'target', type: 'string', required: true, description: 'Connection name or IP address' },
      { name: 'command', type: 'string', required: true },
      { name: 'options', type: '{ timeout?: number }', required: false, description: 'Default timeout: 30000ms' },
    ],
    returnType: '{ stdout: string, stderr: string, code: number }',
    tags: ['ssh', 'command', 'remote'],
    destructive: false,
    idempotent: false,
  },
  {
    name: 'ssh.readFile',
    description: 'Read a file from a remote server via SFTP',
    parameters: [
      { name: 'target', type: 'string', required: true, description: 'Connection name or IP address' },
      { name: 'remotePath', type: 'string', required: true },
    ],
    returnType: 'string',
    tags: ['ssh', 'file', 'read', 'sftp', 'remote'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'ssh.writeFile',
    description: 'Write content to a file on a remote server via SFTP',
    parameters: [
      { name: 'target', type: 'string', required: true, description: 'Connection name or IP address' },
      { name: 'remotePath', type: 'string', required: true },
      { name: 'content', type: 'string', required: true },
    ],
    returnType: 'void',
    tags: ['ssh', 'file', 'write', 'sftp', 'remote'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'ssh.listDir',
    description: 'List directory contents on a remote server',
    parameters: [
      { name: 'target', type: 'string', required: true, description: 'Connection name or IP address' },
      { name: 'remotePath', type: 'string', required: true },
    ],
    returnType: 'FileEntry[] — { name, type, size, modifyTime }',
    tags: ['ssh', 'file', 'directory', 'sftp', 'remote', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'ssh.upload',
    description: 'Upload a local file to a remote server',
    parameters: [
      { name: 'target', type: 'string', required: true },
      { name: 'localPath', type: 'string', required: true },
      { name: 'remotePath', type: 'string', required: true },
    ],
    returnType: 'void',
    tags: ['ssh', 'file', 'upload', 'sftp', 'remote'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'ssh.download',
    description: 'Download a file from a remote server to local machine',
    parameters: [
      { name: 'target', type: 'string', required: true },
      { name: 'remotePath', type: 'string', required: true },
      { name: 'localPath', type: 'string', required: true },
    ],
    returnType: 'void',
    tags: ['ssh', 'file', 'download', 'sftp', 'remote'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'ssh.connections',
    description: 'List all available SSH connections (from config, env, and BinaryLane auto-discovery)',
    parameters: [],
    returnType: 'ConnectionInfo[] — { name, host, port, username, proxyJump?, source? }',
    tags: ['ssh', 'connections', 'read-only', 'list'],
    destructive: false,
    idempotent: true,
  },
  {
    name: 'ssh.testConnection',
    description: 'Test SSH connectivity to a server with latency measurement',
    parameters: [
      { name: 'target', type: 'string', required: true, description: 'Connection name or IP address' },
    ],
    returnType: '{ success: boolean, message: string, latencyMs?: number }',
    tags: ['ssh', 'connections', 'test', 'read-only'],
    destructive: false,
    idempotent: true,
  },
];
