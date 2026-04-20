import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Sandbox } from '../src/runtime/sandbox.js';
import { BinaryLaneClient } from '../src/api/client.js';
import { SSHClientManager } from '../src/ssh/client.js';

// Create mock clients for sandbox testing
function createMockClients() {
  // Mock BinaryLaneClient with a few test methods
  const blClient = {
    listServers: vi.fn().mockResolvedValue({
      servers: [
        { id: 1, name: 'web-1', status: 'active' },
        { id: 2, name: 'web-2', status: 'active' },
      ],
    }),
    getServer: vi.fn().mockResolvedValue({
      server: { id: 1, name: 'web-1', status: 'active' },
    }),
    deleteServer: vi.fn().mockResolvedValue({}),
    createServer: vi.fn().mockResolvedValue({
      server: { id: 3, name: 'new-server' },
    }),
    getBalance: vi.fn().mockResolvedValue({
      balance: { account_balance: '50.00' },
    }),
  } as unknown as BinaryLaneClient;

  // Mock SSHClientManager
  const sshClient = {
    run: vi.fn().mockResolvedValue({ stdout: 'uptime output', stderr: '', code: 0 }),
    readFile: vi.fn().mockResolvedValue('file contents'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listDir: vi.fn().mockResolvedValue([]),
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(undefined),
    listConnections: vi.fn().mockReturnValue([
      { name: 'web-1', host: '1.2.3.4', port: 22, username: 'root' },
    ]),
    testConnection: vi.fn().mockResolvedValue({ success: true, message: 'ok', latencyMs: 42 }),
  } as unknown as SSHClientManager;

  return { blClient, sshClient };
}

describe('Sandbox', () => {
  let sandbox: Sandbox;
  let blClient: BinaryLaneClient;
  let sshClient: SSHClientManager;

  beforeEach(() => {
    const mocks = createMockClients();
    blClient = mocks.blClient;
    sshClient = mocks.sshClient;
    sandbox = new Sandbox(blClient, sshClient, { timeout: 5000 });
  });

  describe('basic execution', () => {
    it('should execute simple expressions', async () => {
      const result = await sandbox.execute('return 1 + 2');
      expect(result.result).toBe(3);
      expect(result.error).toBeUndefined();
    });

    it('should capture console.log output', async () => {
      const result = await sandbox.execute('console.log("hello"); console.log("world"); return "done"');
      expect(result.logs).toEqual(['hello', 'world']);
      expect(result.result).toBe('done');
    });

    it('should capture console.error and console.warn', async () => {
      const result = await sandbox.execute('console.error("bad"); console.warn("careful")');
      expect(result.logs).toEqual(['[ERROR] bad', '[WARN] careful']);
    });

    it('should handle object return values', async () => {
      const result = await sandbox.execute('return { a: 1, b: "two" }');
      expect(result.result).toEqual({ a: 1, b: 'two' });
    });

    it('should handle array return values', async () => {
      const result = await sandbox.execute('return [1, 2, 3].map(x => x * 2)');
      expect(result.result).toEqual([2, 4, 6]);
    });

    it('should track duration', async () => {
      const result = await sandbox.execute('return 42');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('bl client access', () => {
    it('should call bl methods and return results', async () => {
      const result = await sandbox.execute('return await bl.listServers()');
      expect(result.result).toEqual({
        servers: [
          { id: 1, name: 'web-1', status: 'active' },
          { id: 2, name: 'web-2', status: 'active' },
        ],
      });
      expect((blClient.listServers as any)).toHaveBeenCalled();
    });

    it('should pass arguments to bl methods', async () => {
      const result = await sandbox.execute('return await bl.getServer(1)');
      expect((blClient.getServer as any)).toHaveBeenCalledWith(1);
    });

    it('should track destructive bl operations', async () => {
      const result = await sandbox.execute('await bl.deleteServer(123); return "done"');
      expect(result.destructiveOps).toHaveLength(1);
      expect(result.destructiveOps[0]).toContain('deleteServer');
      expect(result.destructiveOps[0]).toContain('123');
    });

    it('should track multiple operations in one execution', async () => {
      const result = await sandbox.execute(`
        const { servers } = await bl.listServers();
        const { balance } = await bl.getBalance();
        return { serverCount: servers.length, balance: balance.account_balance };
      `);
      expect(result.result).toEqual({ serverCount: 2, balance: '50.00' });
      expect(result.destructiveOps).toHaveLength(0);
    });
  });

  describe('ssh client access', () => {
    it('should call ssh.run', async () => {
      const result = await sandbox.execute('return await ssh.run("web-1", "uptime")');
      expect(result.result).toEqual({ stdout: 'uptime output', stderr: '', code: 0 });
      expect((sshClient.run as any)).toHaveBeenCalledWith('web-1', 'uptime');
    });

    it('should call ssh.readFile', async () => {
      const result = await sandbox.execute('return await ssh.readFile("web-1", "/etc/hostname")');
      expect(result.result).toBe('file contents');
    });

    it('should list connections', async () => {
      const result = await sandbox.execute('return ssh.connections()');
      expect(result.result).toEqual([
        { name: 'web-1', host: '1.2.3.4', port: 22, username: 'root' },
      ]);
    });
  });

  describe('error handling', () => {
    it('should catch syntax errors', async () => {
      const result = await sandbox.execute('return {{{');
      expect(result.error).toBeTruthy();
      expect(result.result).toBeUndefined();
    });

    it('should catch runtime errors', async () => {
      const result = await sandbox.execute('throw new Error("boom")');
      expect(result.error).toContain('boom');
    });

    it('should catch errors from bl methods', async () => {
      (blClient.getServer as any).mockRejectedValueOnce(new Error('API error: 404'));
      const result = await sandbox.execute('return await bl.getServer(99999)');
      expect(result.error).toContain('404');
    });

    it('should still capture logs on error', async () => {
      const result = await sandbox.execute('console.log("before"); throw new Error("after")');
      expect(result.logs).toEqual(['before']);
      expect(result.error).toContain('after');
    });

    it('should still report destructive ops on error', async () => {
      (blClient.deleteServer as any).mockResolvedValueOnce({});
      const result = await sandbox.execute(`
        await bl.deleteServer(1);
        throw new Error("oops");
      `);
      expect(result.destructiveOps).toHaveLength(1);
      expect(result.error).toContain('oops');
    });
  });

  describe('sandbox restrictions', () => {
    it('should not have access to require', async () => {
      const result = await sandbox.execute('return typeof require');
      expect(result.result).toBe('undefined');
    });

    it('should not have access to process', async () => {
      const result = await sandbox.execute('return typeof process');
      expect(result.result).toBe('undefined');
    });

    it('should not have access to global fetch', async () => {
      const result = await sandbox.execute('return typeof fetch');
      expect(result.result).toBe('undefined');
    });

    it('should have access to JSON', async () => {
      const result = await sandbox.execute('return JSON.parse(\'{"a":1}\')');
      expect(result.result).toEqual({ a: 1 });
    });

    it('should have access to Promise.all for parallel operations', async () => {
      const result = await sandbox.execute(`
        const results = await Promise.all([
          bl.listServers(),
          bl.getBalance(),
        ]);
        return results.length;
      `);
      expect(result.result).toBe(2);
    });

    it('should have access to Array methods', async () => {
      const result = await sandbox.execute('return [1,2,3].filter(x => x > 1).map(x => x * 10)');
      expect(result.result).toEqual([20, 30]);
    });

    it('should have access to Date', async () => {
      const result = await sandbox.execute('return typeof new Date().toISOString()');
      expect(result.result).toBe('string');
    });

    it('should have access to Math', async () => {
      const result = await sandbox.execute('return Math.max(1, 2, 3)');
      expect(result.result).toBe(3);
    });
  });

  describe('sandbox escape prevention', () => {
    it('should not leak host Function constructor via bl methods', async () => {
      const result = await sandbox.execute(`
        try {
          const ctor = bl.listServers.constructor;
          const fn = ctor('return process');
          return fn();
        } catch(e) {
          return 'blocked: ' + e.message;
        }
      `);
      // Should either be undefined (no constructor) or throw, never return process
      expect(result.result).not.toHaveProperty('env');
      expect(result.result).not.toHaveProperty('exit');
    });

    it('should not allow access to process via Function constructor', async () => {
      const result = await sandbox.execute(`
        try {
          const F = (function(){}).constructor;
          return typeof F('return process')();
        } catch(e) {
          return 'blocked';
        }
      `);
      // Sandbox Function constructor creates sandbox-realm functions
      // which don't have access to host process
      expect(result.result).not.toBe('object');
    });

    it('should not allow require via constructor escape', async () => {
      const result = await sandbox.execute(`
        try {
          const F = (function(){}).constructor;
          const r = F('return require')();
          return typeof r;
        } catch(e) {
          return 'blocked';
        }
      `);
      expect(result.result).toBe('blocked');
    });

    it('should not allow __proto__ traversal to host objects', async () => {
      const result = await sandbox.execute(`
        try {
          const proto = bl.__proto__;
          return typeof proto;
        } catch(e) {
          return 'blocked';
        }
      `);
      // bl is Object.freeze'd, proto should be sandbox Object.prototype
      // which is harmless
      expect(result.result).not.toBe('function');
    });

    it('should have frozen bl and ssh objects', async () => {
      const result = await sandbox.execute(`
        try {
          bl.evil = function() { return 'hacked'; };
          return bl.evil ? 'mutable' : 'frozen';
        } catch(e) {
          return 'frozen';
        }
      `);
      expect(result.result).toBe('frozen');
    });

    it('should not expose __hostCall__ directly', async () => {
      const result = await sandbox.execute('return typeof __hostCall__');
      expect(result.result).toBe('undefined');
    });
  });

  describe('timeout handling', () => {
    it('should timeout on sync infinite loops', async () => {
      const result = await sandbox.execute('while(true) {}', 100);
      expect(result.error).toContain('timed out');
    });

    it('should cap setTimeout inside sandbox to execution timeout', async () => {
      // setTimeout inside the sandbox is capped, so a 10s delay
      // resolves within the timeout rather than hanging
      const start = Date.now();
      const result = await sandbox.execute(
        'await new Promise(resolve => setTimeout(resolve, 10000)); return "done"',
        500,
      );
      const elapsed = Date.now() - start;
      // Should complete well under 10 seconds because setTimeout was capped
      expect(elapsed).toBeLessThan(2000);
      expect(result.result).toBe('done');
    });
  });

  describe('complex code patterns', () => {
    it('should handle async iteration over servers', async () => {
      const result = await sandbox.execute(`
        const { servers } = await bl.listServers();
        const results = [];
        for (const server of servers) {
          const uptime = await ssh.run(server.name, 'uptime');
          results.push({ name: server.name, uptime: uptime.stdout });
        }
        return results;
      `);
      expect(result.result).toEqual([
        { name: 'web-1', uptime: 'uptime output' },
        { name: 'web-2', uptime: 'uptime output' },
      ]);
    });

    it('should handle parallel operations with Promise.all', async () => {
      const result = await sandbox.execute(`
        const { servers } = await bl.listServers();
        const uptimes = await Promise.all(
          servers.map(s => ssh.run(s.name, 'uptime'))
        );
        return uptimes.map(u => u.stdout);
      `);
      expect(result.result).toEqual(['uptime output', 'uptime output']);
    });

    it('should handle filtering and mapping', async () => {
      const result = await sandbox.execute(`
        const { servers } = await bl.listServers();
        return servers
          .filter(s => s.status === 'active')
          .map(s => s.name);
      `);
      expect(result.result).toEqual(['web-1', 'web-2']);
    });

    it('should handle try/catch within sandbox code', async () => {
      (blClient.getServer as any).mockRejectedValueOnce(new Error('not found'));
      const result = await sandbox.execute(`
        try {
          return await bl.getServer(99999);
        } catch (e) {
          return { error: e.message };
        }
      `);
      expect(result.result).toEqual({ error: 'not found' });
      expect(result.error).toBeUndefined();
    });

    it('should handle console.log of objects', async () => {
      const result = await sandbox.execute('console.log({ a: 1, b: [2, 3] })');
      expect(result.logs[0]).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}');
    });
  });

  describe('cross-realm Promise bridging', () => {
    it('should properly resolve host-realm Promises from bl methods', async () => {
      const result = await sandbox.execute(`
        const data = await bl.listServers();
        return Object.keys(data);
      `);
      expect(result.error).toBeUndefined();
      expect(result.result).toContain('servers');
    });

    it('should destructure resolved host-realm objects', async () => {
      const result = await sandbox.execute(`
        const { servers } = await bl.listServers();
        return servers.length;
      `);
      expect(result.error).toBeUndefined();
      expect(result.result).toBe(2);
    });

    it('should chain multiple awaits of host-realm Promises', async () => {
      const result = await sandbox.execute(`
        const { servers } = await bl.listServers();
        const { server } = await bl.getServer(servers[0].id);
        return server.name;
      `);
      expect(result.error).toBeUndefined();
      expect(result.result).toBe('web-1');
    });

    it('should resolve host-realm Promises inside Promise.all', async () => {
      const result = await sandbox.execute(`
        const [account, servers] = await Promise.all([
          bl.getBalance(),
          bl.listServers(),
        ]);
        return { balance: account.balance.account_balance, count: servers.servers.length };
      `);
      expect(result.error).toBeUndefined();
      expect(result.result).toEqual({ balance: '50.00', count: 2 });
    });

    it('should resolve ssh host-realm Promises', async () => {
      const result = await sandbox.execute(`
        const r = await ssh.run('web-1', 'uptime');
        return r.stdout;
      `);
      expect(result.error).toBeUndefined();
      expect(result.result).toBe('uptime output');
    });
  });

  describe('call summary', () => {
    it('should include call summary when API methods are called', async () => {
      const result = await sandbox.execute('return await bl.listServers()');
      expect(result.callSummary).toContain('bl.listServers');
      expect(result.callSummary).toContain('1 calls');
    });

    it('should include multiple calls in summary', async () => {
      const result = await sandbox.execute(`
        await bl.listServers();
        await bl.getBalance();
        return 'done';
      `);
      expect(result.callSummary).toContain('2 calls');
      expect(result.callSummary).toContain('bl.listServers');
      expect(result.callSummary).toContain('bl.getBalance');
    });

    it('should include SSH calls in summary', async () => {
      const result = await sandbox.execute('return await ssh.run("web-1", "uptime")');
      expect(result.callSummary).toContain('ssh.run');
    });

    it('should flag destructive calls in summary', async () => {
      const result = await sandbox.execute('await bl.deleteServer(1); return "done"');
      expect(result.callSummary).toContain('[DESTRUCTIVE]');
    });

    it('should return empty summary when no API calls made', async () => {
      const result = await sandbox.execute('return 1 + 2');
      expect(result.callSummary).toBe('');
    });

    it('should include summary even on error', async () => {
      (blClient.getServer as any).mockRejectedValueOnce(new Error('not found'));
      const result = await sandbox.execute('return await bl.getServer(999)');
      expect(result.error).toBeTruthy();
      expect(result.callSummary).toContain('bl.getServer');
    });
  });

  describe('audit log isolation', () => {
    it('should clear audit log between executions', async () => {
      await sandbox.execute('await bl.deleteServer(1)');
      const result2 = await sandbox.execute('return await bl.listServers()');
      expect(result2.destructiveOps).toHaveLength(0);
    });

    it('should clear call summary between executions', async () => {
      const r1 = await sandbox.execute('await bl.listServers(); await bl.getBalance(); return "done"');
      expect(r1.callSummary).toContain('2 calls');

      const r2 = await sandbox.execute('return await bl.listServers()');
      expect(r2.callSummary).toContain('1 calls');
    });
  });
});
