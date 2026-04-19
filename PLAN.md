# BinaryLane MCP v2 — Code Mode Architecture

## Overview

Inspired by Sunil Pai's "Code Mode" talk at Cloudflare, this is a ground-up rebuild of the BinaryLane MCP server. Instead of exposing 86 individual tools (73 BinaryLane API + 13 SSH), we expose **3 tools** that let the model generate and execute JavaScript against a sandboxed runtime with the BinaryLane API client and SSH client exposed as capabilities.

**Core idea:** The model writes code. The code runs in a sandbox. The sandbox has access to the BinaryLane API and SSH connections. One execution replaces multiple tool-call round trips.

**Token reduction:** ~86 tool definitions (~15-20K tokens) down to 3 tool definitions + a compact API summary (~1-2K tokens).

---

## The 3 Tools

### 1. `search`

**Purpose:** Find available API methods and SSH capabilities by natural language query.

**Input:**
```json
{
  "query": "string — natural language description of what you want to do"
}
```

**Output:** Matching methods with their signatures, parameters, and brief descriptions. Returns enough information for the model to write code against them.

**How it works:**
- Maintains a structured catalog of all `bl.*` and `ssh.*` methods
- Each entry has: method name, description, parameters (with types), return type, and tags (e.g. "destructive", "read-only")
- Search is keyword + fuzzy match against method names, descriptions, parameter names, and tags
- Returns top matches ranked by relevance

**Example:**
```
Query: "firewall rules for a server"
Result:
  bl.getServerFirewallRules(serverId: number) → FirewallRule[]
    Get current firewall rules for a server. Read-only.

  bl.performServerAction(serverId: number, action: ServerAction) → Action
    Perform an action on a server. For firewall rules, use:
    action.type = "change_advanced_firewall_rules"
    action.firewall_rules = FirewallRule[]
    DESTRUCTIVE — replaces all existing rules.
```

### 2. `execute`

**Purpose:** Run JavaScript code in a sandboxed environment with `bl` and `ssh` exposed as globals.

**Input:**
```json
{
  "code": "string — JavaScript code to execute"
}
```

**Output:** The return value of the code (serialized as JSON), plus any console.log output captured during execution.

**How it works:**
- Code runs in a Node.js `vm.Context` with a restricted global scope
- Only `bl`, `ssh`, `console`, and basic JS built-ins are available
- No `require`, no `import`, no `fetch`, no `process`, no `fs`
- All network access goes through `bl` and `ssh` only
- Async/await is supported (code is wrapped in an async IIFE)
- Execution timeout enforced (default 60 seconds, configurable)
- Return value is the last expression or explicit `return`

**Available globals in the sandbox:**

```
bl.*          — BinaryLane API client (all methods from api-client.ts)
ssh.*         — SSH client (run commands, read/write files, manage connections)
console.log() — Captured and returned alongside the result
JSON          — JSON.parse/stringify
Promise       — For parallel operations
setTimeout    — Capped at execution timeout
```

**Safety controls:**
- Destructive `bl` operations (delete_*, remove_*) log to audit trail before execution
- Code that calls destructive methods gets flagged in the response metadata
- Execution timeout prevents runaway code
- No filesystem access, no outbound network except through bl/ssh

### 3. `describe`

**Purpose:** Get detailed documentation for a specific API method, including full parameter schemas, return types, examples, and gotchas.

**Input:**
```json
{
  "method": "string — method name like 'bl.createServer' or 'ssh.run'"
}
```

**Output:** Full documentation including:
- Complete parameter schema with types, defaults, constraints
- Return type with field descriptions
- Usage examples
- Platform-specific gotchas (e.g. LB anycast, firewall statelessness)
- Whether the operation is destructive/idempotent

**Why this is separate from search:** Search returns compact summaries for discovery. Describe returns everything the model needs to write correct code for a specific method. Keeps search results lean.

---

## Project Structure

```
bl-mcpv2/
├── PLAN.md                    # This file
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts               # MCP server entry point — registers 3 tools
│   ├── tools.ts               # Tool definitions (search, execute, describe)
│   ├── handlers.ts            # Tool handlers — dispatch to search/execute/describe
│   │
│   ├── runtime/
│   │   ├── sandbox.ts         # vm.Context setup, code execution, timeout, output capture
│   │   ├── globals.ts         # Defines what's available inside the sandbox (bl, ssh, console)
│   │   └── safety.ts          # Destructive operation interception, audit logging
│   │
│   ├── api/
│   │   ├── client.ts          # BinaryLane API HTTP client (carried from v1, cleaned up)
│   │   └── types.ts           # API response types (carried from v1)
│   │
│   ├── ssh/
│   │   ├── client.ts          # SSH/SFTP client (carried from v1 ssh-mcp)
│   │   ├── connections.ts     # Connection config loading, BinaryLane auto-discovery
│   │   └── types.ts           # SSH connection types
│   │
│   └── catalog/
│       ├── index.ts           # Search engine — indexes all methods, handles queries
│       ├── methods.ts         # Complete method catalog with signatures + descriptions
│       └── docs.ts            # Detailed per-method documentation for describe tool
```

---

## Component Details

### 1. MCP Server (`src/index.ts`)

Minimal entry point:
- Validates `BINARYLANE_API_TOKEN` from env or config file
- Initializes BinaryLane API client
- Initializes SSH client with connection auto-discovery
- Registers 3 tools with the MCP SDK
- Routes tool calls to handlers

### 2. Tool Definitions (`src/tools.ts`)

Three tool definitions with annotations:
- `search` — readOnlyHint: true, destructiveHint: false
- `execute` — readOnlyHint: false, destructiveHint: false (individual operations within may be destructive)
- `describe` — readOnlyHint: true, destructiveHint: false

Each tool has a concise description optimized for token efficiency. The descriptions include a brief summary of what's available (method categories, not individual methods).

### 3. Sandbox Runtime (`src/runtime/`)

**sandbox.ts:**
- Creates a `vm.Context` with controlled globals
- Wraps user code in `(async () => { ... })()` for async support
- Captures console output to a buffer
- Enforces execution timeout via `vm.runInContext` timeout option
- Returns `{ result: any, logs: string[], destructiveOps: string[] }`

**globals.ts:**
- Builds the global object exposed inside the sandbox
- `bl` — proxy around BinaryLaneClient that intercepts destructive calls
- `ssh` — proxy around SSHClient with connection resolution
- `console` — custom console that captures to buffer
- Standard built-ins: `JSON`, `Promise`, `Array`, `Object`, `Map`, `Set`, `Date`, `Math`, `RegExp`, `Error`, `setTimeout`, `parseInt`, `parseFloat`, `isNaN`, `encodeURIComponent`, `decodeURIComponent`

**safety.ts:**
- Maintains a list of destructive method patterns (delete*, remove*, create*, update*)
- Create/update are flagged but not blocked — delete/remove get audit logged
- Intercepts calls via Proxy, logs to stderr with timestamp
- Returns metadata about what destructive operations were performed
- Future: could add confirmation flow for destructive ops

### 4. BinaryLane API Client (`src/api/`)

**client.ts:**
Carried from v1 with improvements:
- Same HTTP layer with retry logic, rate limiting, exponential backoff
- Same 56 API methods
- Methods are organized into clear namespaces for the sandbox:
  - `bl.servers.*` or flat `bl.listServers()` — TBD which feels better in generated code
  - Flat is simpler and matches v1. Keep flat.
- Remove Zod validation from the client layer — the model writes code with correct types, and the API returns errors for bad input anyway. Validation was needed when Claude was filling out tool schemas; with code mode, the model controls the types directly.

**types.ts:**
All TypeScript interfaces/types for API responses. Carried from v1.

### 5. SSH Client (`src/ssh/`)

**client.ts:**
Merged from ssh-mcp with the following interface exposed in sandbox:

```typescript
ssh.run(target: string, command: string, options?: { timeout?: number }) → Promise<{ stdout: string, stderr: string, exitCode: number }>
ssh.readFile(target: string, remotePath: string) → Promise<string>
ssh.writeFile(target: string, remotePath: string, content: string) → Promise<void>
ssh.listDir(target: string, remotePath: string) → Promise<FileEntry[]>
ssh.upload(target: string, localPath: string, remotePath: string) → Promise<void>
ssh.download(target: string, remotePath: string, localPath: string) → Promise<void>
ssh.connections() → ConnectionInfo[]
```

`target` is a connection name (e.g. "wp-web-1-syd") or an IP address. The client resolves it against the connection config, handling ProxyJump transparently.

**connections.ts:**
Three-layer connection resolution (same as v1 ssh-mcp):
1. Config file: `~/.config/binarylane/ssh-connections.json`
2. Environment variable: `SSH_CONNECTIONS`
3. BinaryLane auto-discovery: Fetches active servers from the API, extracts public IPs

Auto-discovery means the model can `ssh.run("my-server-name", "uptime")` using just the server name from BinaryLane — no manual IP mapping needed.

### 6. Method Catalog (`src/catalog/`)

**methods.ts:**
A structured array of all available methods:

```typescript
interface CatalogEntry {
  name: string;           // e.g. "bl.listServers"
  description: string;    // One-line description
  parameters: ParamInfo[];
  returnType: string;     // Brief return type description
  tags: string[];         // ["servers", "read-only", "list"]
  destructive: boolean;
  idempotent: boolean;
}
```

This is the search index. ~73 entries for bl.*, ~6 entries for ssh.*. Each entry is compact — just enough for search results.

**docs.ts:**
Detailed documentation keyed by method name. Includes:
- Full parameter schemas with types, constraints, defaults
- Complete return type with field descriptions
- Code examples
- Platform gotchas (carried from v1 tool descriptions)
- Related methods

This is what `describe` returns. Verbose by design — only loaded when the model needs it.

**index.ts:**
Search engine:
- Indexes method names, descriptions, parameters, and tags
- Supports keyword matching and basic fuzzy matching
- Ranks results by relevance (name match > description match > tag match)
- Returns top N results (default 10)

---

## Configuration

### Environment Variables
- `BINARYLANE_API_TOKEN` — Required. 64-char alphanumeric token.
- `SSH_CONNECTIONS` — Optional. JSON array of additional SSH connections.

### Config Files
- `~/.config/binarylane/config` — API token (fallback if env var not set)
- `~/.config/binarylane/ssh-connections.json` — Persistent SSH connections (replaces `~/.config/ssh-mcp/connections.json`)

### MCP Registration
```json
{
  "mcpServers": {
    "binarylane": {
      "command": "node",
      "args": ["/Users/adam/bl-mcpv2/dist/index.js"],
      "env": {
        "BINARYLANE_API_TOKEN": "..."
      }
    }
  }
}
```

One MCP server. Three tools. Replaces both `binarylane-mcp` and `ssh-mcp`.

---

## Safety Model

### Execution Safety
- **No filesystem access** — sandbox has no `fs`, `require`, or `import`
- **No arbitrary network** — only `bl` and `ssh` provide network access
- **Timeout enforcement** — default 60s, prevents infinite loops
- **Memory limits** — vm context resource limits where supported

### Destructive Operation Safety
- All delete/remove operations are audit logged to stderr
- Response metadata flags which destructive operations were called
- The model sees this feedback and can inform the user

### SSH Safety
- SSH connections resolve through config — model can't SSH to arbitrary hosts
- Commands run with the privileges of the configured SSH user
- Command timeout enforced (default 30s)

### Audit Trail
All operations logged to stderr as JSON:
```json
{
  "timestamp": "2026-04-20T10:00:00Z",
  "audit": true,
  "type": "execute",
  "destructiveOps": ["bl.deleteServer(12345)"],
  "code": "...",
  "result": "..."
}
```

---

## Migration Path

### What carries over from v1:
- `api-client.ts` — HTTP layer, retry logic, rate limiting, all 56 API methods
- API types — all TypeScript interfaces
- SSH client core — ssh2 library usage, SFTP, ProxyJump
- Connection config format and auto-discovery logic
- Audit logging pattern
- Error message formatting by HTTP status code

### What changes:
- 73 tool definitions → search catalog entries
- 13 SSH tool definitions → search catalog entries
- Zod input schemas → removed (model writes code with correct types)
- Handler dispatch → replaced by sandbox execution
- Two MCP servers → one unified server

### What's new:
- vm sandbox runtime
- Method catalog + search engine
- Detailed docs system (describe tool)
- Safety proxy layer for destructive operations
- Merged SSH capability

---

## Build Order

### Phase 1: Foundation
1. Initialize project (package.json, tsconfig.json)
2. Port API client (`src/api/client.ts`, `src/api/types.ts`)
3. Port SSH client (`src/ssh/client.ts`, `src/ssh/connections.ts`, `src/ssh/types.ts`)

### Phase 2: Catalog
4. Build method catalog (`src/catalog/methods.ts`)
5. Build detailed docs (`src/catalog/docs.ts`)
6. Build search engine (`src/catalog/index.ts`)

### Phase 3: Runtime
7. Build sandbox (`src/runtime/sandbox.ts`)
8. Build globals/capabilities (`src/runtime/globals.ts`)
9. Build safety layer (`src/runtime/safety.ts`)

### Phase 4: MCP Server
10. Define 3 tools (`src/tools.ts`)
11. Build handlers (`src/handlers.ts`)
12. Wire up entry point (`src/index.ts`)

### Phase 5: Polish
13. Test with real API token against live BinaryLane account
14. Compare token usage: v1 (86 tools) vs v2 (3 tools)
15. Validate complex multi-step operations work in single execute
16. Update Claude Code MCP config to point to v2
