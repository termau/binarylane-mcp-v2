#!/usr/bin/env node
/**
 * Launcher used by the Claude Code plugin (.mcp.json).
 *
 * A plugin install is a plain git clone — no npm install runs, and `dist/` is
 * gitignored. This ensures dependencies are installed and the TypeScript is
 * compiled on first launch, then hands off to the real server.
 *
 * Everything here writes to stderr only. stdout is the MCP stdio channel and
 * any stray byte on it corrupts the protocol.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const entry = join(root, 'dist', 'index.js');

const log = (msg) => process.stderr.write(`[binarylane-mcp] ${msg}\n`);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: root,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    // Never let build output reach stdout.
    child.stdout.on('data', (d) => process.stderr.write(d));
    child.stderr.on('data', (d) => process.stderr.write(d));
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`)),
    );
  });
}

if (!existsSync(entry)) {
  log('first launch: installing dependencies and building (this runs once)...');
  try {
    // `npm install` runs the `prepare` script, which builds.
    await run('npm', ['install', '--no-audit', '--no-fund']);
    if (!existsSync(entry)) await run('npm', ['run', 'build']);
    log('build complete.');
  } catch (err) {
    log(`bootstrap failed: ${err.message}`);
    log(`build manually with: cd "${root}" && npm install && npm run build`);
    process.exit(1);
  }
}

await import(pathToFileURL(entry).href);
