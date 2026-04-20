import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SafetyInterceptor } from '../src/runtime/safety.js';

describe('SafetyInterceptor', () => {
  let safety: SafetyInterceptor;

  beforeEach(() => {
    safety = new SafetyInterceptor();
  });

  describe('wrapClient', () => {
    it('should pass through read-only method calls unchanged', () => {
      const client = {
        listServers: vi.fn().mockReturnValue('servers'),
        getServer: vi.fn().mockReturnValue('server'),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      const result = wrapped.listServers();

      expect(result).toBe('servers');
      expect(client.listServers).toHaveBeenCalled();
      expect(safety.getAuditLog()).toHaveLength(0);
    });

    it('should log destructive operations', () => {
      const client = {
        deleteServer: vi.fn().mockReturnValue('deleted'),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.deleteServer(12345);

      const log = safety.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].method).toBe('bl.deleteServer');
      expect(log[0].destructive).toBe(true);
      expect(log[0].args).toEqual([12345]);
    });

    it('should log mutating operations as non-destructive', () => {
      const client = {
        createServer: vi.fn().mockReturnValue('created'),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.createServer({ size: 'std-min' });

      const log = safety.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].method).toBe('bl.createServer');
      expect(log[0].destructive).toBe(false);
    });

    it('should not log read-only operations', () => {
      const client = {
        listServers: vi.fn(),
        getServer: vi.fn(),
        getBalance: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.listServers();
      wrapped.getServer(1);
      wrapped.getBalance();

      expect(safety.getAuditLog()).toHaveLength(0);
    });

    it('should log remove operations as destructive', () => {
      const client = {
        removeServersFromLoadBalancer: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.removeServersFromLoadBalancer(1, [2, 3]);

      const log = safety.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].destructive).toBe(true);
    });

    it('should log performServerAction as mutating', () => {
      const client = {
        performServerAction: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.performServerAction(123, { type: 'reboot' });

      const log = safety.getAuditLog();
      expect(log).toHaveLength(1);
      expect(log[0].method).toBe('bl.performServerAction');
      expect(log[0].destructive).toBe(false);
    });

    it('should preserve non-function properties', () => {
      const client = {
        name: 'test-client',
        listServers: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      expect(wrapped.name).toBe('test-client');
    });
  });

  describe('sanitizeArgs', () => {
    it('should redact sensitive fields', () => {
      const client = {
        createSshKey: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.createSshKey({ public_key: 'ssh-rsa AAAA...', name: 'my-key', api_token: 'secret123' });

      const log = safety.getAuditLog();
      expect(log[0].args[0]).toEqual({
        public_key: '***',
        name: 'my-key',
        api_token: '***',
      });
    });

    it('should not redact non-sensitive fields', () => {
      const client = {
        createServer: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.createServer({ size: 'std-min', region: 'syd', name: 'my-server' });

      const log = safety.getAuditLog();
      expect(log[0].args[0]).toEqual({
        size: 'std-min',
        region: 'syd',
        name: 'my-server',
      });
    });

    it('should handle primitive args without sanitization', () => {
      const client = {
        deleteServer: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.deleteServer(12345, 'no longer needed');

      const log = safety.getAuditLog();
      expect(log[0].args).toEqual([12345, 'no longer needed']);
    });
  });

  describe('getDestructiveOps', () => {
    it('should return formatted destructive operations', () => {
      const client = {
        deleteServer: vi.fn(),
        deleteImage: vi.fn(),
        createServer: vi.fn(), // not destructive
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.deleteServer(111);
      wrapped.createServer({ size: 'std-min' });
      wrapped.deleteImage(222);

      const ops = safety.getDestructiveOps();
      expect(ops).toHaveLength(2);
      expect(ops[0]).toBe('bl.deleteServer(111)');
      expect(ops[1]).toBe('bl.deleteImage(222)');
    });

    it('should return empty array when no destructive ops', () => {
      const client = {
        listServers: vi.fn(),
        createServer: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.listServers();
      wrapped.createServer({});

      // createServer is mutating but not destructive
      const ops = safety.getDestructiveOps();
      expect(ops).toHaveLength(0);
    });
  });

  describe('Promise bridging', () => {
    it('should bridge async method results with Promise.resolve', async () => {
      const client = {
        listServers: vi.fn().mockResolvedValue({ servers: [{ id: 1 }] }),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      const result = await wrapped.listServers();

      expect(result).toEqual({ servers: [{ id: 1 }] });
    });

    it('should bridge async destructive method results', async () => {
      const client = {
        deleteServer: vi.fn().mockResolvedValue({ success: true }),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      const result = await wrapped.deleteServer(123);

      expect(result).toEqual({ success: true });
      expect(safety.getDestructiveOps()).toHaveLength(1);
    });

    it('should pass through sync return values unchanged', () => {
      const client = {
        listConnections: vi.fn().mockReturnValue([{ name: 'web-1' }]),
      };

      const wrapped = safety.wrapClient(client, 'ssh');
      const result = wrapped.listConnections();

      expect(result).toEqual([{ name: 'web-1' }]);
    });

    it('should bridge rejected promises', async () => {
      const client = {
        getServer: vi.fn().mockRejectedValue(new Error('not found')),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      await expect(wrapped.getServer(999)).rejects.toThrow('not found');
    });
  });

  describe('clearLog', () => {
    it('should clear all audit entries', () => {
      const client = {
        deleteServer: vi.fn(),
        createServer: vi.fn(),
      };

      const wrapped = safety.wrapClient(client, 'bl');
      wrapped.deleteServer(1);
      wrapped.createServer({});

      expect(safety.getAuditLog()).toHaveLength(2);

      safety.clearLog();

      expect(safety.getAuditLog()).toHaveLength(0);
      expect(safety.getDestructiveOps()).toHaveLength(0);
    });
  });
});
