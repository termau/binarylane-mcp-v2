import { describe, it, expect } from 'vitest';
import {
  searchCatalog,
  formatCatalogEntry,
  formatMethodDoc,
  methodCatalog,
} from '../src/catalog/index.js';

describe('Method Catalog', () => {
  it('should have entries for all expected namespaces', () => {
    const blMethods = methodCatalog.filter(m => m.name.startsWith('bl.'));
    const sshMethods = methodCatalog.filter(m => m.name.startsWith('ssh.'));

    expect(blMethods.length).toBeGreaterThanOrEqual(70);
    expect(sshMethods.length).toBeGreaterThanOrEqual(6);
  });

  it('should have unique method names', () => {
    const names = methodCatalog.map(m => m.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it('should have required fields on every entry', () => {
    for (const entry of methodCatalog) {
      expect(entry.name).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(Array.isArray(entry.tags)).toBe(true);
      expect(entry.tags.length).toBeGreaterThan(0);
      expect(typeof entry.destructive).toBe('boolean');
      expect(typeof entry.idempotent).toBe('boolean');
      expect(entry.returnType).toBeTruthy();
    }
  });

  it('should mark destructive operations correctly', () => {
    const destructive = methodCatalog.filter(m => m.destructive);
    const destructiveNames = destructive.map(m => m.name);

    // These should definitely be destructive
    expect(destructiveNames).toContain('bl.deleteServer');
    expect(destructiveNames).toContain('bl.deleteImage');
    expect(destructiveNames).toContain('bl.deleteSshKey');
    expect(destructiveNames).toContain('bl.deleteDomain');
    expect(destructiveNames).toContain('bl.deleteDomainRecord');
    expect(destructiveNames).toContain('bl.deleteVpc');
    expect(destructiveNames).toContain('bl.deleteLoadBalancer');

    // These should NOT be destructive
    expect(destructiveNames).not.toContain('bl.listServers');
    expect(destructiveNames).not.toContain('bl.getServer');
    expect(destructiveNames).not.toContain('bl.getAccount');
    expect(destructiveNames).not.toContain('ssh.run');
  });
});

describe('Search Engine', () => {
  it('should find methods by exact name', () => {
    const results = searchCatalog('bl.listServers');
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].name).toBe('bl.listServers');
  });

  it('should find methods by short name', () => {
    const results = searchCatalog('listServers');
    expect(results[0].name).toBe('bl.listServers');
  });

  it('should find methods by description keywords', () => {
    const results = searchCatalog('firewall');
    const names = results.map(r => r.name);
    expect(names).toContain('bl.getServerFirewallRules');
    expect(names).toContain('bl.performServerAction');
  });

  it('should find methods by tag', () => {
    const results = searchCatalog('destructive');
    expect(results.every(r => r.destructive)).toBe(true);
  });

  it('should find SSH methods', () => {
    const results = searchCatalog('ssh run command');
    expect(results[0].name).toBe('ssh.run');
  });

  it('should rank exact matches above partial matches', () => {
    const results = searchCatalog('bl.getServer');
    expect(results[0].name).toBe('bl.getServer');
  });

  it('should return empty for nonsense queries', () => {
    const results = searchCatalog('xyzzyplugh');
    expect(results.length).toBe(0);
  });

  it('should respect maxResults', () => {
    const results = searchCatalog('server', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('should return all methods for empty query', () => {
    const results = searchCatalog('', 100);
    expect(results.length).toBeGreaterThan(0);
  });

  it('should handle multi-word queries', () => {
    const results = searchCatalog('load balancer create');
    const names = results.map(r => r.name);
    expect(names).toContain('bl.createLoadBalancer');
  });

  it('should find domain record methods', () => {
    const results = searchCatalog('dns record');
    const names = results.map(r => r.name);
    expect(names).toContain('bl.createDomainRecord');
    expect(names).toContain('bl.listDomainRecords');
  });

  it('should find metrics methods', () => {
    const results = searchCatalog('cpu memory metrics');
    const names = results.map(r => r.name);
    expect(names).toContain('bl.getServerMetrics');
    expect(names).toContain('bl.getServerLatestMetrics');
  });
});

describe('formatCatalogEntry', () => {
  it('should format a read-only method', () => {
    const entry = methodCatalog.find(m => m.name === 'bl.listServers')!;
    const formatted = formatCatalogEntry(entry);
    expect(formatted).toContain('bl.listServers');
    expect(formatted).toContain('List all servers');
    expect(formatted).not.toContain('DESTRUCTIVE');
  });

  it('should flag destructive methods', () => {
    const entry = methodCatalog.find(m => m.name === 'bl.deleteServer')!;
    const formatted = formatCatalogEntry(entry);
    expect(formatted).toContain('DESTRUCTIVE');
  });

  it('should show parameters with optionality', () => {
    const entry = methodCatalog.find(m => m.name === 'bl.listServers')!;
    const formatted = formatCatalogEntry(entry);
    expect(formatted).toContain('params?');
  });

  it('should show required parameters without ?', () => {
    const entry = methodCatalog.find(m => m.name === 'bl.getServer')!;
    const formatted = formatCatalogEntry(entry);
    expect(formatted).toContain('serverId:');
    expect(formatted).not.toContain('serverId?');
  });
});

describe('formatMethodDoc', () => {
  it('should return detailed docs for documented methods', () => {
    const doc = formatMethodDoc('bl.performServerAction');
    expect(doc).not.toBeNull();
    expect(doc).toContain('## Parameters');
    expect(doc).toContain('## Examples');
    expect(doc).toContain('## Gotchas');
    expect(doc).toContain('firewall_rules');
  });

  it('should return detailed docs for ssh.run', () => {
    const doc = formatMethodDoc('ssh.run');
    expect(doc).not.toBeNull();
    expect(doc).toContain('ProxyJump');
    expect(doc).toContain('timeout');
  });

  it('should fall back to catalog-based docs for undocumented methods', () => {
    const doc = formatMethodDoc('bl.listSoftware');
    expect(doc).not.toBeNull();
    expect(doc).toContain('bl.listSoftware');
    expect(doc).toContain('## Returns');
  });

  it('should return null for unknown methods', () => {
    const doc = formatMethodDoc('bl.nonExistent');
    expect(doc).toBeNull();
  });

  it('should include related methods when available', () => {
    const doc = formatMethodDoc('bl.createLoadBalancer');
    expect(doc).toContain('## Related');
    expect(doc).toContain('bl.addServersToLoadBalancer');
  });

  it('should include gotchas for load balancer creation', () => {
    const doc = formatMethodDoc('bl.createLoadBalancer');
    expect(doc).toContain('DO NOT pass a region parameter');
    expect(doc).toContain('anycast');
    expect(doc).toContain('loopback');
  });
});
