import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHandlers } from '../src/handlers.js';
import { Sandbox } from '../src/runtime/sandbox.js';
import { BinaryLaneClient } from '../src/api/client.js';
import { SSHClientManager } from '../src/ssh/client.js';

function createTestSandbox() {
  const blClient = {
    listServers: vi.fn().mockResolvedValue({
      servers: [{ id: 1, name: 'test' }],
    }),
    deleteServer: vi.fn().mockResolvedValue({}),
  } as unknown as BinaryLaneClient;

  const sshClient = {
    run: vi.fn().mockResolvedValue({ stdout: 'ok', stderr: '', code: 0 }),
    readFile: vi.fn().mockResolvedValue('data'),
    writeFile: vi.fn().mockResolvedValue(undefined),
    listDir: vi.fn().mockResolvedValue([]),
    upload: vi.fn().mockResolvedValue(undefined),
    download: vi.fn().mockResolvedValue(undefined),
    listConnections: vi.fn().mockReturnValue([]),
    testConnection: vi.fn().mockResolvedValue({ success: true }),
    initialize: vi.fn().mockResolvedValue(undefined),
  } as unknown as SSHClientManager;

  return new Sandbox(blClient, sshClient, { timeout: 5000 });
}

describe('Handlers', () => {
  let handlers: ReturnType<typeof createHandlers>;

  beforeEach(() => {
    const sandbox = createTestSandbox();
    handlers = createHandlers(sandbox);
  });

  describe('search handler', () => {
    it('should return matching methods', async () => {
      const result = await handlers.search({ query: 'list servers' });
      const text = result.content[0].text;
      expect(text).toContain('bl.listServers');
      expect(text).toContain('Found');
    });

    it('should return no-match message for bad queries', async () => {
      const result = await handlers.search({ query: 'xyzzyplugh' });
      const text = result.content[0].text;
      expect(text).toContain('No methods found');
    });

    it('should respect max_results', async () => {
      const result = await handlers.search({ query: 'server', max_results: 2 });
      const text = result.content[0].text;
      // Count method signatures (lines starting with bl. or ssh.)
      const methods = text.split('\n').filter(l => l.match(/^(bl|ssh)\./));
      expect(methods.length).toBeLessThanOrEqual(2);
    });
  });

  describe('execute handler', () => {
    it('should return execution result', async () => {
      const result = await handlers.execute({ code: 'return 42' });
      const text = result.content[0].text;
      expect(text).toContain('42');
      expect(text).toContain('ms total]');
    });

    it('should return error with isError flag', async () => {
      const result = await handlers.execute({ code: 'throw new Error("boom")' });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('boom');
    });

    it('should include console output', async () => {
      const result = await handlers.execute({ code: 'console.log("hello"); return 1' });
      const text = result.content[0].text;
      expect(text).toContain('Console output:');
      expect(text).toContain('hello');
    });

    it('should warn about destructive operations', async () => {
      const result = await handlers.execute({ code: 'await bl.deleteServer(1)' });
      const text = result.content[0].text;
      expect(text).toContain('Destructive operations');
      expect(text).toContain('deleteServer');
    });

    it('should handle no return value', async () => {
      const result = await handlers.execute({ code: 'const x = 1' });
      const text = result.content[0].text;
      expect(text).toContain('no return value');
    });

    it('should include call summary when API calls are made', async () => {
      const result = await handlers.execute({ code: 'return await bl.listServers()' });
      const text = result.content[0].text;
      expect(text).toContain('API calls');
      expect(text).toContain('bl.listServers');
    });

    it('should include call summary in error responses too', async () => {
      const result = await handlers.execute({ code: 'await bl.deleteServer(1); throw new Error("oops")' });
      const text = result.content[0].text;
      expect(text).toContain('API calls');
      expect(text).toContain('bl.deleteServer');
    });
  });

  describe('describe handler', () => {
    it('should return docs for known methods', async () => {
      const result = await handlers.describe({ method: 'bl.performServerAction' });
      const text = result.content[0].text;
      expect(text).toContain('performServerAction');
      expect(text).toContain('Parameters');
    });

    it('should suggest alternatives for unknown methods', async () => {
      const result = await handlers.describe({ method: 'bl.listServer' }); // missing 's'
      const text = result.content[0].text;
      expect(text).toContain('Did you mean');
      expect(text).toContain('bl.listServers');
    });

    it('should return not-found for completely unknown methods', async () => {
      const result = await handlers.describe({ method: 'bl.xyzzy' });
      const text = result.content[0].text;
      // Should either find suggestions or say not found
      expect(text).toMatch(/not found|Did you mean/);
    });
  });
});
