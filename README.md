# BinaryLane MCP v2 — Code Mode

An MCP server for [BinaryLane](https://www.binarylane.com.au) that uses **code mode** instead of individual tools. The model generates JavaScript that runs in a sandboxed environment with the BinaryLane API and SSH exposed as capabilities.

**3 tools replace 86.** Instead of registering a tool for every API endpoint, the model writes code that calls the methods it needs — with looping, parallelism, and composition built in.

Inspired by [Sunil Pai's "Code Mode" talk](https://www.youtube.com/watch?v=8txf05vVVl4) at Cloudflare.

## Quick Start

```bash
git clone https://github.com/termau/binarylane-mcp-v2.git
cd binarylane-mcp-v2
npm install
npm run build
```

Add to Claude Code:

```bash
claude mcp add binarylane -s user \
  -e BINARYLANE_API_TOKEN=your-token-here \
  -- node /path/to/binarylane-mcp-v2/dist/index.js
```

Get your API token at [home.binarylane.com.au/api-info](https://home.binarylane.com.au/api-info).

## How It Works

The server exposes three tools:

| Tool | Purpose |
|------|---------|
| `search` | Find available API methods by natural language query |
| `execute` | Run JavaScript in a sandbox with `bl` and `ssh` as globals |
| `describe` | Get detailed docs for a specific method |

The model searches for what it needs, optionally reads detailed docs, then writes and executes code:

```js
// "List all servers and check their CPU"
const { servers } = await bl.listServers({ per_page: 200 });

const results = await Promise.all(servers.map(async (s) => {
  const { sample_set } = await bl.getServerLatestMetrics(s.id);
  return {
    name: s.name,
    cpu: sample_set?.average?.cpu_usage_percent?.toFixed(1) + '%',
    region: s.region.slug,
  };
}));

return results;
```

One execution. All servers queried in parallel. No round trips.

## What's Available in the Sandbox

### `bl` — BinaryLane API (56 methods)

Servers, images, domains, DNS records, VPCs, load balancers, SSH keys, billing, metrics, software, actions.

```js
await bl.listServers()
await bl.createServer({ size: 'std-min', image: 'ubuntu-24.04', region: 'syd', name: 'my-server' })
await bl.performServerAction(id, { type: 'reboot' })
await bl.getServerLatestMetrics(id)
await bl.createDomainRecord('example.com', { type: 'A', name: 'www', data: '1.2.3.4' })
await bl.getServerFirewallRules(id)
```

### `ssh` — SSH Operations

Run commands, read/write files, list directories, upload/download. Supports connection names and ProxyJump.

```js
await ssh.run('my-server', 'uptime')
await ssh.readFile('my-server', '/etc/nginx/nginx.conf')
await ssh.writeFile('my-server', '/tmp/config.txt', content)
ssh.connections()  // list all available connections
```

### Not Available (by design)

`require`, `import`, `fetch`, `fs`, `process` — the sandbox has no filesystem access and no arbitrary network access. All I/O goes through `bl` and `ssh`.

## SSH Connections

SSH connections are loaded from three sources (highest priority first):

1. **Config file** — `~/.config/ssh-mcp/connections.json`
2. **Environment variable** — `SSH_CONNECTIONS` (JSON array)
3. **BinaryLane auto-discovery** — fetches active servers from the API

Example `~/.config/ssh-mcp/connections.json`:

```json
{
  "defaultPrivateKeyPath": "~/.ssh/id_ed25519",
  "binarylane": {
    "enabled": true,
    "defaultUsername": "root",
    "defaultPrivateKeyPath": "~/.ssh/my_key"
  },
  "connections": [
    {
      "name": "web-1",
      "host": "10.0.0.1",
      "port": 22,
      "username": "deploy",
      "privateKeyPath": "~/.ssh/deploy_key",
      "proxyJump": "jumpbox"
    },
    {
      "name": "jumpbox",
      "host": "203.0.113.10",
      "port": 22,
      "username": "root",
      "privateKeyPath": "~/.ssh/my_key"
    }
  ]
}
```

Auto-discovery means you can `ssh.run("my-server-name", "uptime")` using just the server name from BinaryLane — no manual IP mapping needed.

## Safety

- **Sandboxed execution** — code runs in a Node.js `vm` context with restricted globals
- **Destructive operations flagged** — delete/remove calls are audit logged and flagged in the response
- **All calls tracked** — every `bl.*` and `ssh.*` call is logged with method, duration, and status
- **Execution timeout** — sync and async timeouts prevent runaway code
- **Persistent log** — all executions logged to `~/.config/binarylane/mcp-v2.log`

## Observability

Every `execute` response includes a call summary showing what was called and how long it took:

```
API calls (3 calls, 1247ms total):
  bl.listServers (683ms)
  bl.getServerLatestMetrics (312ms)
  ssh.run (252ms)
[1250ms total]
```

### Persistent Log

By default, all executions are logged to `~/.config/binarylane/mcp-v2.log` as one JSON line per execution. This includes the code that was run, every API/SSH call with timing, and any errors:

```json
{"timestamp":"2026-04-20T02:34:18Z","durationMs":89,"calls":[{"method":"bl.listServers","durationMs":88,"status":"ok"}],"code":"..."}
```

**Security note:** The log file contains the generated code and may include server names, IPs, or other infrastructure details from API responses. If this is a concern, disable logging:

```bash
# Disable via environment variable
claude mcp add binarylane -s user \
  -e BINARYLANE_API_TOKEN=your-token \
  -e BINARYLANE_MCP_DISABLE_LOG=1 \
  -- node /path/to/dist/index.js
```

The call summary in responses is always shown regardless of this setting — only the persistent log file is affected.

## Development

```bash
npm run build        # compile TypeScript
npm run dev          # dev mode with tsx
npm test             # run 110 unit tests
npm run test:watch   # watch mode
```

## Why Code Mode

With traditional MCP, every tool definition (name, description, parameter schema) is loaded into the model's context window on every call. At 86 tools, that's ~15,000-20,000 tokens of overhead before the model even thinks about your question.

Code mode reduces that to ~1,000-2,000 tokens (3 tool definitions). The model writes JavaScript instead of picking from a menu — which gives you looping, parallelism, composition, and state that JSON tool calls can't express.

| | MCP v1 | MCP v2 |
|---|---|---|
| Tools | 86 | 3 |
| Token overhead | ~15-20K | ~1-2K |
| "List 22 servers + metrics" | 23+ round trips | 1 execution |
| API + SSH in one operation | 2 MCP servers | 1 unified |

## License

MIT
