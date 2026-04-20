#!/usr/bin/env tsx
/**
 * Generate docs.ts from the BinaryLane OpenAPI spec.
 *
 * Maps bl.* method names to OpenAPI paths and extracts full documentation
 * including parameters, response schemas, descriptions, and examples.
 *
 * Usage: npx tsx scripts/generate-docs.ts
 */

import { readFileSync, writeFileSync } from 'fs';
import { parse } from 'yaml';
import { join } from 'path';

const SPEC_PATH = join(import.meta.dirname, '..', 'openapi.yaml');
const OUTPUT_PATH = join(import.meta.dirname, '..', 'src', 'catalog', 'docs.ts');

// Map bl.* method names to OpenAPI path + method
const METHOD_MAP: Record<string, { path: string; method: string }> = {
  'bl.getAccount': { path: '/v2/account', method: 'get' },
  'bl.getBalance': { path: '/v2/customers/my/balance', method: 'get' },
  'bl.getInvoices': { path: '/v2/customers/my/invoices', method: 'get' },
  'bl.getInvoice': { path: '/v2/customers/my/invoices/{invoice_id}', method: 'get' },
  'bl.getUnpaidFailedInvoices': { path: '/v2/customers/my/unpaid-payment-failed-invoices', method: 'get' },
  'bl.proceedAction': { path: '/v2/actions/{action_id}/proceed', method: 'post' },
  'bl.listServers': { path: '/v2/servers', method: 'get' },
  'bl.getServer': { path: '/v2/servers/{server_id}', method: 'get' },
  'bl.createServer': { path: '/v2/servers', method: 'post' },
  'bl.deleteServer': { path: '/v2/servers/{server_id}', method: 'delete' },
  'bl.performServerAction': { path: '/v2/servers/{server_id}/actions', method: 'post' },
  'bl.listServerActions': { path: '/v2/servers/{server_id}/actions', method: 'get' },
  'bl.getServerAction': { path: '/v2/servers/{server_id}/actions/{action_id}', method: 'get' },
  'bl.getServerBackups': { path: '/v2/servers/{server_id}/backups', method: 'get' },
  'bl.getServerFirewallRules': { path: '/v2/servers/{server_id}/advanced_firewall_rules', method: 'get' },
  'bl.getServerConsole': { path: '/v2/servers/{server_id}/console', method: 'get' },
  'bl.getCurrentDataUsage': { path: '/v2/data_usages/{server_id}/current', method: 'get' },
  'bl.listAllDataUsage': { path: '/v2/data_usages/current', method: 'get' },
  'bl.getServerKernels': { path: '/v2/servers/{server_id}/kernels', method: 'get' },
  'bl.getServerAvailableFeatures': { path: '/v2/servers/{server_id}/available_advanced_features', method: 'get' },
  'bl.getServerThresholdAlerts': { path: '/v2/servers/{server_id}/threshold_alerts', method: 'get' },
  'bl.listExceededThresholdAlerts': { path: '/v2/servers/threshold_alerts', method: 'get' },
  'bl.getServerSoftware': { path: '/v2/servers/{server_id}/software', method: 'get' },
  'bl.getServerUserData': { path: '/v2/servers/{server_id}/user_data', method: 'get' },
  'bl.uploadBackup': { path: '/v2/servers/{server_id}/backups', method: 'post' },
  'bl.getServerSnapshots': { path: '/v2/servers/{server_id}/snapshots', method: 'get' },
  'bl.updateIpv6Reverse': { path: '/v2/reverse_names/ipv6', method: 'put' },
  'bl.getServerMetrics': { path: '/v2/samplesets/{server_id}', method: 'get' },
  'bl.getServerLatestMetrics': { path: '/v2/samplesets/{server_id}/latest', method: 'get' },
  'bl.listImages': { path: '/v2/images', method: 'get' },
  'bl.getImage': { path: '/v2/images/{image_id_or_slug}', method: 'get' },
  'bl.deleteImage': { path: '/v2/images/{image_id}', method: 'delete' },
  'bl.updateImage': { path: '/v2/images/{image_id}', method: 'put' },
  'bl.getImageDownload': { path: '/v2/images/{image_id}/download', method: 'get' },
  'bl.listSshKeys': { path: '/v2/account/keys', method: 'get' },
  'bl.getSshKey': { path: '/v2/account/keys/{key_id}', method: 'get' },
  'bl.createSshKey': { path: '/v2/account/keys', method: 'post' },
  'bl.updateSshKey': { path: '/v2/account/keys/{key_id}', method: 'put' },
  'bl.deleteSshKey': { path: '/v2/account/keys/{key_id}', method: 'delete' },
  'bl.listDomains': { path: '/v2/domains', method: 'get' },
  'bl.getDomain': { path: '/v2/domains/{domain_name}', method: 'get' },
  'bl.createDomain': { path: '/v2/domains', method: 'post' },
  'bl.deleteDomain': { path: '/v2/domains/{domain_name}', method: 'delete' },
  'bl.listDomainRecords': { path: '/v2/domains/{domain_name}/records', method: 'get' },
  'bl.getDomainRecord': { path: '/v2/domains/{domain_name}/records/{record_id}', method: 'get' },
  'bl.createDomainRecord': { path: '/v2/domains/{domain_name}/records', method: 'post' },
  'bl.updateDomainRecord': { path: '/v2/domains/{domain_name}/records/{record_id}', method: 'put' },
  'bl.deleteDomainRecord': { path: '/v2/domains/{domain_name}/records/{record_id}', method: 'delete' },
  'bl.listNameservers': { path: '/v2/domains/nameservers', method: 'get' },
  'bl.refreshNameserverCache': { path: '/v2/domains/refresh_nameserver_cache', method: 'post' },
  'bl.listIpv6ReverseName': { path: '/v2/reverse_names/ipv6', method: 'get' },
  'bl.listVpcs': { path: '/v2/vpcs', method: 'get' },
  'bl.getVpc': { path: '/v2/vpcs/{vpc_id}', method: 'get' },
  'bl.createVpc': { path: '/v2/vpcs', method: 'post' },
  'bl.updateVpc': { path: '/v2/vpcs/{vpc_id}', method: 'patch' },
  'bl.deleteVpc': { path: '/v2/vpcs/{vpc_id}', method: 'delete' },
  'bl.getVpcMembers': { path: '/v2/vpcs/{vpc_id}/members', method: 'get' },
  'bl.listLoadBalancers': { path: '/v2/load_balancers', method: 'get' },
  'bl.getLoadBalancer': { path: '/v2/load_balancers/{load_balancer_id}', method: 'get' },
  'bl.createLoadBalancer': { path: '/v2/load_balancers', method: 'post' },
  'bl.updateLoadBalancer': { path: '/v2/load_balancers/{load_balancer_id}', method: 'put' },
  'bl.deleteLoadBalancer': { path: '/v2/load_balancers/{load_balancer_id}', method: 'delete' },
  'bl.getLoadBalancerAvailability': { path: '/v2/load_balancers/availability', method: 'get' },
  'bl.addServersToLoadBalancer': { path: '/v2/load_balancers/{load_balancer_id}/servers', method: 'post' },
  'bl.removeServersFromLoadBalancer': { path: '/v2/load_balancers/{load_balancer_id}/servers', method: 'delete' },
  'bl.addForwardingRulesToLoadBalancer': { path: '/v2/load_balancers/{load_balancer_id}/forwarding_rules', method: 'post' },
  'bl.removeForwardingRulesFromLoadBalancer': { path: '/v2/load_balancers/{load_balancer_id}/forwarding_rules', method: 'delete' },
  'bl.listRegions': { path: '/v2/regions', method: 'get' },
  'bl.listSizes': { path: '/v2/sizes', method: 'get' },
  'bl.listActions': { path: '/v2/actions', method: 'get' },
  'bl.getAction': { path: '/v2/actions/{action_id}', method: 'get' },
  'bl.listSoftware': { path: '/v2/software', method: 'get' },
  'bl.getSoftware': { path: '/v2/software/{software_id}', method: 'get' },
  'bl.listSoftwareForOS': { path: '/v2/software/operating_system/{operating_system_id_or_slug}', method: 'get' },
};

// Platform-specific gotchas to inject (these can't come from the spec)
const GOTCHAS: Record<string, string[]> = {
  'bl.performServerAction': [
    'Firewall rules are STATELESS — no implicit deny. You must include explicit drop rules.',
    'Always include UDP 53 (DNS) ACCEPT before any UDP DROP rule, or DNS breaks.',
    'Firewall rules REPLACE all existing rules — not additive. Include the complete ruleset.',
    'Replacement strategies for backups: "none" errors if no free slot, "oldest"/"newest" auto-replace.',
  ],
  'bl.createServer': [
    'Server name must be alphanumeric with hyphens only, no leading/trailing hyphens.',
    'Use bl.listSizes({ image: "ubuntu-24.04" }) to find valid size slugs for an image.',
    'Regions: syd (Sydney), mel (Melbourne), bne (Brisbane), per (Perth), adl (Adelaide), sin (Singapore).',
  ],
  'bl.createLoadBalancer': [
    'DO NOT pass a region parameter — it causes an IP allocation error. Location is determined by assigned servers.',
    'After creation, each backend server must add the LB anycast IP to its loopback interface: ip addr add <LB_IP>/32 dev lo',
    'Persist loopback config via netplan: /etc/netplan/60-lb-loopback.yaml',
    'Health check hostname defaults to the LB name if not specified.',
  ],
  'bl.deleteServer': [
    'This is IRREVERSIBLE. All data is destroyed.',
    'Take a backup first if you might need the data later.',
  ],
  'bl.getServerMetrics': [
    'Finer intervals (five-minute) have shorter retention than coarser ones (day, week).',
    'memory_usage_bytes may be 0 for some server types.',
    'Actual field names: cpu_usage_percent, network_incoming_kbps, storage_usage_megabytes, etc.',
  ],
};

// ---- Helpers ----

function resolveRef(spec: any, ref: string): any {
  const parts = ref.replace('#/', '').split('/');
  let obj = spec;
  for (const part of parts) obj = obj?.[part];
  return obj;
}

function resolveSchema(spec: any, schema: any): any {
  if (!schema) return schema;
  if (schema.$ref) return resolveRef(spec, schema.$ref);
  if (schema.allOf) {
    const merged: any = {};
    for (const s of schema.allOf) {
      const resolved = resolveSchema(spec, s);
      if (resolved?.properties) Object.assign(merged, resolved.properties);
    }
    return { type: 'object', properties: merged };
  }
  return schema;
}

function formatSchemaProperties(spec: any, schema: any, indent: string = '  '): string {
  const resolved = resolveSchema(spec, schema);
  if (!resolved?.properties) return `${indent}(no properties defined)`;

  const lines: string[] = [];
  const required = new Set(resolved.required || []);

  for (const [name, prop] of Object.entries(resolved.properties) as [string, any][]) {
    const p = resolveSchema(spec, prop);
    const type = p?.type || (p?.enum ? 'enum' : 'object');
    const req = required.has(name) ? '' : ' (optional)';
    const desc = p?.description ? ` — ${p.description}` : '';
    const enumVals = p?.enum ? ` [${p.enum.join(', ')}]` : '';

    lines.push(`${indent}${name}: ${type}${enumVals}${req}${desc}`);

    // Show nested object properties one level deep
    if (p?.properties && Object.keys(p.properties).length <= 8) {
      for (const [subName, subProp] of Object.entries(p.properties) as [string, any][]) {
        const sp = resolveSchema(spec, subProp);
        const subType = sp?.type || 'object';
        const subDesc = sp?.description ? ` — ${sp.description}` : '';
        lines.push(`${indent}  ${subName}: ${subType}${subDesc}`);
      }
    }
  }

  return lines.join('\n');
}

function getResponseSchema(spec: any, operation: any): string {
  const success = operation.responses?.['200'] || operation.responses?.['204'];
  if (!success?.content?.['application/json']?.schema) return 'void';

  const schema = resolveSchema(spec, success.content['application/json'].schema);
  if (!schema?.properties) return JSON.stringify(schema?.type || 'unknown');

  const keys = Object.keys(schema.properties);
  const parts = keys.map(k => {
    const p = resolveSchema(spec, schema.properties[k]);
    const type = p?.type === 'array' ? `${resolveSchema(spec, p.items)?.title || 'object'}[]` : (p?.title || p?.type || 'object');
    return `${k}: ${type}`;
  });

  return `{ ${parts.join(', ')} }`;
}

// ---- Main ----

const specRaw = readFileSync(SPEC_PATH, 'utf-8');
const spec = parse(specRaw);

const docs: Record<string, any> = {};
let matched = 0;
let missed = 0;

for (const [methodName, { path, method }] of Object.entries(METHOD_MAP)) {
  const pathObj = spec.paths?.[path];
  if (!pathObj) {
    console.warn(`MISS: ${methodName} → ${path} (path not found)`);
    missed++;
    continue;
  }

  const operation = pathObj[method];
  if (!operation) {
    console.warn(`MISS: ${methodName} → ${method.toUpperCase()} ${path} (method not found)`);
    missed++;
    continue;
  }

  // Build parameter details
  let paramDetails = '';

  // Path + query parameters
  const params = operation.parameters || [];
  if (params.length > 0) {
    const paramLines = params.map((p: any) => {
      const resolved = resolveSchema(spec, p.schema);
      const type = resolved?.type || 'string';
      const req = p.required ? '' : ' (optional)';
      const desc = p.description ? ` — ${p.description}` : '';
      return `  ${p.name}: ${type}${req}${desc}`;
    });
    paramDetails += paramLines.join('\n');
  }

  // Request body
  if (operation.requestBody) {
    const bodySchema = operation.requestBody.content?.['application/json']?.schema;
    if (bodySchema) {
      if (paramDetails) paramDetails += '\n\n';
      paramDetails += 'Request body:\n' + formatSchemaProperties(spec, bodySchema);
    }
  }

  if (!paramDetails) paramDetails = '  None';

  // Build response details
  const returnDetails = getResponseSchema(spec, operation);

  // Build the doc entry
  docs[methodName] = {
    name: methodName,
    fullDescription: operation.summary || operation.description || methodName,
    parameterDetails: paramDetails,
    returnDetails,
    examples: [],
    ...(GOTCHAS[methodName] ? { gotchas: GOTCHAS[methodName] } : {}),
  };

  matched++;
}

// Add SSH method docs (not in OpenAPI spec)
const sshDocs: Record<string, any> = {
  'ssh.run': {
    name: 'ssh.run',
    fullDescription: 'Execute a shell command on a remote server via SSH. Supports connection names from config, BinaryLane auto-discovery names, or direct IP addresses.',
    parameterDetails: `  target: string — Connection name (e.g. 'wp-web-1-syd') or IP address
  command: string — Shell command to execute
  options?: { timeout?: number } — Command timeout in ms (default: 30000)`,
    returnDetails: '{ stdout: string, stderr: string, code: number }',
    examples: [
      `await ssh.run('my-server', 'uptime')`,
      `await ssh.run('web-1', 'df -h /', { timeout: 5000 })`,
      `// Parallel across multiple servers\nconst results = await Promise.all(servers.map(s => ssh.run(s, 'uptime')));`,
    ],
    gotchas: [
      'Servers behind a VPC are reached via ProxyJump — you just use the name.',
      'Default timeout is 30 seconds. Long-running commands need a higher timeout.',
      'Config-file connections take priority over BinaryLane auto-discovery.',
    ],
  },
  'ssh.readFile': {
    name: 'ssh.readFile',
    fullDescription: 'Read a file from a remote server via SFTP. Returns the file contents as a string.',
    parameterDetails: `  target: string — Connection name or IP address
  remotePath: string — Absolute path to the file`,
    returnDetails: 'string',
    examples: [`await ssh.readFile('my-server', '/etc/nginx/nginx.conf')`],
    gotchas: ['Large files consume memory. For very large files, use ssh.run() with head/tail.', 'Text files only — binary files will be mangled.'],
  },
  'ssh.writeFile': {
    name: 'ssh.writeFile',
    fullDescription: 'Write content to a file on a remote server via SFTP. Creates or overwrites the file.',
    parameterDetails: `  target: string — Connection name or IP address
  remotePath: string — Absolute path to write to
  content: string — File content`,
    returnDetails: 'void',
    examples: [`await ssh.writeFile('my-server', '/tmp/test.txt', 'Hello world')`],
    gotchas: ['Overwrites existing files.', 'SSH user must have write permission. For system files, write to /tmp then sudo mv.'],
  },
  'ssh.listDir': {
    name: 'ssh.listDir',
    fullDescription: 'List directory contents on a remote server via SFTP.',
    parameterDetails: `  target: string — Connection name or IP address
  remotePath: string — Absolute path to directory`,
    returnDetails: 'FileEntry[] — { name, type, size, modifyTime }',
    examples: [`await ssh.listDir('my-server', '/var/www/html')`],
  },
  'ssh.connections': {
    name: 'ssh.connections',
    fullDescription: 'List all available SSH connections from config file, environment variable, and BinaryLane auto-discovery.',
    parameterDetails: '  None',
    returnDetails: 'ConnectionInfo[] — { name, host, port, username, proxyJump?, source? }',
    examples: [`const conns = ssh.connections();\nconns.forEach(c => console.log(c.name, c.host));`],
  },
  'ssh.testConnection': {
    name: 'ssh.testConnection',
    fullDescription: 'Test SSH connectivity to a server with latency measurement.',
    parameterDetails: `  target: string — Connection name or IP address`,
    returnDetails: '{ success: boolean, message: string, latencyMs?: number }',
    examples: [`await ssh.testConnection('my-server')`],
  },
  'ssh.upload': {
    name: 'ssh.upload',
    fullDescription: 'Upload a local file to a remote server via SFTP.',
    parameterDetails: `  target: string — Connection name or IP address
  localPath: string — Local file path
  remotePath: string — Remote destination path`,
    returnDetails: 'void',
    examples: [`await ssh.upload('my-server', '/tmp/local.tar.gz', '/opt/deploy.tar.gz')`],
  },
  'ssh.download': {
    name: 'ssh.download',
    fullDescription: 'Download a file from a remote server to local machine via SFTP.',
    parameterDetails: `  target: string — Connection name or IP address
  remotePath: string — Remote file path
  localPath: string — Local destination path`,
    returnDetails: 'void',
    examples: [`await ssh.download('my-server', '/var/log/nginx/access.log', '/tmp/access.log')`],
  },
};

Object.assign(docs, sshDocs);

// Generate the output file
const output = `/**
 * Auto-generated from BinaryLane OpenAPI spec (v${spec.info?.version || 'unknown'}).
 * SSH method docs added manually.
 *
 * Generated by: npx tsx scripts/generate-docs.ts
 * Source: openapi.yaml
 * Do not edit manually — re-run the generator instead.
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

export const methodDocs: Record<string, MethodDoc> = ${JSON.stringify(docs, null, 2)};

/**
 * Get documentation for a method. Returns undefined if not found.
 */
export function getMethodDoc(methodName: string): MethodDoc | undefined {
  return methodDocs[methodName];
}
`;

writeFileSync(OUTPUT_PATH, output);

console.log(`\nGenerated ${Object.keys(docs).length} method docs (${matched} from OpenAPI, ${Object.keys(sshDocs).length} SSH, ${missed} missed)`);
console.log(`Output: ${OUTPUT_PATH}`);
