# BinaryLane MCP v2 — Code Mode

3-tool MCP server replacing 86 tools (73 BinaryLane API + 13 SSH) with `search`, `execute`, and `describe`.

## Architecture

The model generates JavaScript that runs in a Node.js `vm` sandbox with two capabilities:
- `bl` — BinaryLane API client (56 methods covering servers, domains, VPCs, LBs, images, SSH keys, billing, metrics, software)
- `ssh` — SSH client (run commands, file ops, connection management with BinaryLane auto-discovery and ProxyJump)

## Project structure

```
src/
├── index.ts               # MCP server entry point
├── tools.ts               # 3 tool definitions
├── handlers.ts            # Tool dispatch
├── api/
│   ├── client.ts          # BinaryLane HTTP client with retry/rate limiting
│   └── types.ts           # All API types
├── ssh/
│   ├── client.ts          # SSH/SFTP client with ProxyJump
│   ├── connections.ts     # 3-layer connection config + BL auto-discovery
│   └── types.ts           # SSH types
├── runtime/
│   ├── sandbox.ts         # vm.Context execution with async timeout
│   ├── globals.ts         # Sandbox global object builder
│   └── safety.ts          # Destructive operation interception + audit logging
└── catalog/
    ├── methods.ts         # 79-entry method catalog (search index)
    ├── docs.ts            # Detailed per-method docs with gotchas
    └── index.ts           # Search engine
```

## Build & run

```bash
npm run build              # Compile TypeScript
npm run dev                # Dev mode with tsx
BINARYLANE_API_TOKEN=xxx node dist/index.js  # Run
```

## Key platform gotchas (BinaryLane-specific)

- Load balancers are anycast — NO region parameter on create (causes IP allocation error)
- Firewall rules are stateless — must include explicit drop rules, DNS (UDP 53) before UDP drop
- LB backends must add LB anycast IP to loopback: `ip addr add <IP>/32 dev lo`
- Regions: syd, mel, bne, per

## Origin

Ported from v1 at /Users/adam/bl-mcp/ (BinaryLane MCP) and /Users/adam/bl-mcp/ssh-mcp/ (SSH MCP).
Inspired by Sunil Pai's "Code Mode" talk — reduce MCP tool sprawl by having the model generate code instead of calling individual tools.
