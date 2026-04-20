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
bl.*               — BinaryLane API client (56 methods)
ssh.*              — SSH client (run, readFile, writeFile, listDir, upload, download, connections, testConnection)
console.log/error/warn/info — Captured and returned alongside the result
JSON, Promise, Array, Object, Map, Set, Date, Math, RegExp
Error, TypeError, RangeError, SyntaxError, Number, String, Boolean, Symbol
parseInt, parseFloat, isNaN, isFinite
encodeURIComponent, decodeURIComponent, encodeURI, decodeURI
atob, btoa, structuredClone
setTimeout (capped at execution timeout), clearTimeout
```

**Safety controls:**
- Destructive `bl` operations (delete_*, remove_*) log to audit trail before execution
- All mutating operations (create, update, perform, proceed, upload) are tracked
- Code that calls destructive methods gets flagged in the response metadata
- Execution timeout prevents runaway code (sync via vm timeout, async via Promise.race)
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
├── CLAUDE.md                  # Project context for Claude Code
├── package.json
├── tsconfig.json
├── .gitignore
├── src/
│   ├── index.ts               # MCP server entry point — registers 3 tools
│   ├── tools.ts               # Tool definitions (search, execute, describe)
│   ├── handlers.ts            # Tool handlers — dispatch to search/execute/describe
│   │
│   ├── runtime/
│   │   ├── sandbox.ts         # vm.Context setup, async timeout, output capture
│   │   ├── globals.ts         # Sandbox global object builder (bl, ssh, console, builtins)
│   │   └── safety.ts          # Destructive operation interception, audit logging via Proxy
│   │
│   ├── api/
│   │   ├── client.ts          # BinaryLane API HTTP client (56 methods, retry, rate limiting)
│   │   └── types.ts           # All API response/request types
│   │
│   ├── ssh/
│   │   ├── client.ts          # SSH/SFTP client with ProxyJump, target resolution by name/IP
│   │   ├── connections.ts     # 3-layer connection config + BinaryLane auto-discovery
│   │   └── types.ts           # SSH connection/result types
│   │
│   └── catalog/
│       ├── index.ts           # Search engine — keyword matching, relevance ranking
│       ├── methods.ts         # 79-entry method catalog (73 bl + 6 ssh) with signatures
│       └── docs.ts            # Detailed per-method docs with gotchas and examples
```

---

## Component Details

### 1. MCP Server (`src/index.ts`)

Minimal entry point:
- Validates `BINARYLANE_API_TOKEN` from env or config file (~/.config/binarylane/config)
- Initializes BinaryLane API client
- Initializes SSH client with connection auto-discovery
- Registers 3 tools with the MCP SDK
- Routes tool calls to handlers
- Actionable error messages by HTTP status code (401, 403, 404, 429, 5xx)

### 2. Tool Definitions (`src/tools.ts`)

Three tool definitions with annotations:
- `search` — readOnlyHint: true, destructiveHint: false
- `execute` — readOnlyHint: false, destructiveHint: false (individual operations within may be destructive)
- `describe` — readOnlyHint: true, destructiveHint: false

Each tool has a concise description optimized for token efficiency. The descriptions include a brief summary of what's available (method categories, not individual methods).

### 3. Sandbox Runtime (`src/runtime/`)

**sandbox.ts:**
- Creates a `vm.Context` with controlled globals via `globals.ts`
- Wraps user code in `(async () => { ... })()` for top-level await
- Dual timeout: sync via `vm.runInContext` timeout + async via `Promise.race`
- Captures console output to a buffer
- Returns `{ result, logs, destructiveOps, callSummary, error?, durationMs }`
- Includes sandbox line numbers in error stack traces for debugging
- Cross-realm bridging via `bridgeAllMethods()` (see below)
- Persistent execution log at `~/.config/binarylane/mcp-v2.log` — one JSON line per execution with timestamp, code, call details, timings, and errors

**Cross-realm Promise and Object handling (critical implementation detail):**

`vm.createContext` creates a completely separate JavaScript realm. This caused two problems that took significant debugging to solve:

1. **Cross-realm Promises:** `bl` and `ssh` methods return host-realm Promises. The sandbox's `await` uses its own realm's Promise constructor and can't properly unwrap host-realm Promises — they appear as plain objects. **Fix:** After creating the context, we extract the sandbox's `Promise` constructor via `vm.runInContext('Promise', context)` and wrap every bl/ssh method to return `new SandboxPromise((resolve, reject) => hostPromise.then(resolve, reject))`.

2. **Cross-realm Objects:** Even after fixing Promises, resolved values were still empty `{}` inside the sandbox. Objects created in the host realm (by `JSON.parse` or API responses) have properties that are invisible to the sandbox's `Object.keys()` — the sandbox uses its own realm's `Object` intrinsics. **Fix:** Extract the sandbox's `JSON` via `vm.runInContext('JSON', context)`, then serialize with the host's `JSON.stringify` and deserialize with the sandbox's `JSON.parse` — `TargetJSON.parse(JSON.stringify(v))`. This creates plain objects that live in the sandbox realm.

Both fixes live in `bridgeAllMethods()` which wraps every function property on bl/ssh objects. The pattern is:
```
Host realm (bl.listServers) → host Promise → host JSON.stringify → sandbox JSON.parse → sandbox Promise.resolve → sandbox await
```

**globals.ts:**
- Builds the global object exposed inside the sandbox
- `bl` — created via `createBlInterface()` which iterates the BinaryLaneClient's methods (prototype + own properties for mock compatibility), binds each to the real client instance, and wraps with safety tracking. No Proxy used — explicit bound functions avoid cross-realm `this` issues.
- `ssh` — explicit bound wrapper functions for each SSH method (run, readFile, writeFile, listDir, upload, download, connections, testConnection) with call tracking on all operations via `trackedSsh()` helper
- `console` — custom console (log, error, warn, info) that captures to buffer
- Full set of JS builtins including atob/btoa/structuredClone

**safety.ts:**
- SafetyInterceptor class with `trackCall()`, `completeCall()`, `failCall()` for full call lifecycle tracking
- Every bl.* and ssh.* call is recorded with method name, start time, duration, and status (ok/error)
- `getCallSummary()` returns a formatted summary included in every execute response for observability
- `getCallLog()` returns structured records used by the persistent log
- `wrapClient()` Proxy method kept for backwards compatibility with unit tests
- Destructive patterns (delete*, remove*) get audit logged to stderr as JSON
- Mutating patterns (create*, update*, perform*, proceed*, upload*) are tracked
- Sensitive args (token, password, secret, key) are sanitized in audit logs

### 4. BinaryLane API Client (`src/api/`)

**client.ts:**
Ported from v1, Zod validation removed:
- HTTP layer with retry logic (exponential backoff + jitter)
- Rate limiting (max 5 concurrent, FIFO queue)
- Retryable status codes: 429, 502, 503, 504
- Retry-After header support
- 56 API methods covering: account/billing, servers (CRUD + 23 action types), images, SSH keys, domains/DNS records, VPCs, load balancers, regions/sizes, actions, software

**types.ts:**
All TypeScript interfaces/types for API requests and responses. 550+ lines of type definitions including the ServerAction discriminated union (20 action subtypes). Types validated against live BinaryLane API responses (April 2026) — includes fields not in the original v1 types (e.g. `advanced_features`, `backup_settings`, `tax_code`, `excess_transfer_cost_per_gigabyte`). Metrics types (`SampleSet`, `SampleData`) completely rewritten to match actual API field names (`cpu_usage_percent`, `network_incoming_kbps`, etc.).

### 5. SSH Client (`src/ssh/`)

**client.ts:**
Merged from ssh-mcp into unified MCP:
- `resolveTarget()` — accepts connection name OR IP address. Looks up config, falls back to ephemeral connection for bare IPs
- ProxyJump support — transparently tunnels through jump hosts
- SSH key auth with fallback to password, then default key paths
- Methods: run, readFile, writeFile, listDir, upload, download, testConnection, listConnections

**connections.ts:**
Three-layer connection resolution (highest priority wins):
1. Config file: `~/.config/ssh-mcp/connections.json`
2. Environment variable: `SSH_CONNECTIONS`
3. BinaryLane auto-discovery: Fetches active servers from API, extracts public IPs

**types.ts:**
SSH connection, command result, file entry, and config types.

### 6. Method Catalog (`src/catalog/`)

**methods.ts:**
79 catalog entries (73 bl.* + 6 ssh.*), each with:
- name, description, parameters (name/type/required/description), returnType
- tags for search (e.g. "servers", "firewall", "read-only", "destructive")
- destructive and idempotent flags

**docs.ts:**
Detailed documentation for key methods with platform gotchas:
- `bl.performServerAction` — all 23 action types, firewall rule gotchas
- `bl.createServer` — size/image/region discovery, naming rules
- `bl.createLoadBalancer` — anycast gotcha (no region param), loopback config
- `bl.listServers` — pagination, hostname filter, IP extraction pattern
- `bl.deleteServer` — irreversibility warning
- `bl.createDomainRecord` — all record types, TTL ranges, CNAME trailing dot
- `bl.createVpc` — IP range auto-assignment, overlap rules
- `bl.getServerMetrics` — intervals, retention, SampleData fields
- `ssh.run` — parallel execution pattern, ProxyJump transparency, timeouts
- `ssh.connections` — source priority explanation
- `ssh.readFile` / `ssh.writeFile` — gotchas for large/binary files, permissions

Methods without detailed docs fall back to auto-generated docs from catalog entries.

**index.ts:**
Search engine with relevance scoring:
- Exact name match: 100 points
- Name contains term: 20 points
- Tag exact match: 15 points
- Tag partial match: 8 points
- Description match: 10 points
- Parameter match: 5 points

---

## Configuration

### Environment Variables
- `BINARYLANE_API_TOKEN` — Required. 64-char alphanumeric token.
- `SSH_CONNECTIONS` — Optional. JSON array of additional SSH connections.

### Config Files
- `~/.config/binarylane/config` — API token (fallback if env var not set)
- `~/.config/ssh-mcp/connections.json` — Persistent SSH connections

### MCP Registration
```bash
claude mcp add binarylane-v2 node /Users/adam/bl-mcpv2/dist/index.js
```

Or in settings:
```json
{
  "mcpServers": {
    "binarylane-v2": {
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
- **No arbitrary network** — only `bl` and `ssh` provide network access — `fetch` is not available inside the sandbox
- **Dual timeout** — sync (vm timeout for infinite loops) + async (Promise.race for hanging awaits)
- **Restricted globals** — only whitelisted JS builtins available
- **Realm isolation** — sandbox runs in a separate JS realm (vm.createContext). Objects crossing the boundary are serialized/deserialized so no host-realm references leak into the sandbox

### Destructive Operation Safety
- All delete/remove operations are audit logged to stderr as JSON
- All mutating operations (create/update/perform) are tracked
- Response metadata flags which destructive operations were called
- Sensitive args (tokens, passwords) sanitized in audit logs
- The model sees this feedback and can inform the user

### SSH Safety
- SSH connections resolve through config — model can't SSH to arbitrary hosts (except bare IPs which create ephemeral root@IP connections)
- Commands run with the privileges of the configured SSH user
- Command timeout enforced (default 30s)

### Audit Trail
All destructive operations logged to stderr:
```json
{
  "audit": true,
  "timestamp": "2026-04-20T10:00:00Z",
  "method": "bl.deleteServer",
  "args": [12345],
  "destructive": true
}
```

---

## Migration from v1

### What carries over:
- `api-client.ts` — HTTP layer, retry logic, rate limiting, all 56 API methods
- API types — all TypeScript interfaces (~500 lines)
- SSH client core — ssh2 library, SFTP, ProxyJump, connection resolution
- Connection config format and BinaryLane auto-discovery logic
- Audit logging pattern

### What changes:
- 73 BinaryLane tool definitions → 79-entry search catalog
- 13 SSH tool definitions → merged into same catalog
- Zod input schemas → removed (model writes code with correct types)
- Handler dispatch (one handler per tool) → sandbox execution
- Two MCP servers → one unified server

### What's new:
- vm sandbox runtime with dual timeout
- Globals builder with safety proxy
- Method catalog + search engine
- Detailed docs system with platform gotchas
- Safety interceptor for destructive operations

---

## Build Progress

### Phase 1: Foundation — DONE
1. ~~Initialize project (package.json, tsconfig.json)~~
2. ~~Port API client (`src/api/client.ts`, `src/api/types.ts`)~~
3. ~~Port SSH client (`src/ssh/client.ts`, `src/ssh/connections.ts`, `src/ssh/types.ts`)~~

### Phase 2: Catalog — DONE
4. ~~Build method catalog (`src/catalog/methods.ts`) — 79 entries~~
5. ~~Build detailed docs (`src/catalog/docs.ts`) — 11 key methods documented~~
6. ~~Build search engine (`src/catalog/index.ts`) — keyword search with relevance scoring~~

### Phase 3: Runtime — DONE
7. ~~Build sandbox (`src/runtime/sandbox.ts`) — vm.Context with dual async/sync timeout~~
8. ~~Build globals (`src/runtime/globals.ts`) — separated from sandbox, full builtin set~~
9. ~~Build safety layer (`src/runtime/safety.ts`) — Proxy-based interception + audit logging~~

### Phase 4: MCP Server — DONE
10. ~~Define 3 tools (`src/tools.ts`)~~
11. ~~Build handlers (`src/handlers.ts`)~~
12. ~~Wire up entry point (`src/index.ts`) — token validation, SSH init, MCP registration~~

### Phase 5: Testing & Polish — IN PROGRESS
13. ~~Test with real API token against live BinaryLane account~~ — DONE
14. ~~Debug cross-realm Promise/Object issues in vm sandbox~~ — DONE (see sandbox.ts notes)
15. ~~Fix API token loading (config file uses `api-token` with hyphen)~~ — DONE
16. ~~Update Claude Code MCP config to point to v2~~ — DONE (`claude mcp add binarylane-v2 -e BINARYLANE_API_TOKEN=...`)
17. ~~Add unit tests (93 tests across 4 files)~~ — DONE
18. ~~Add custom skills (/bl-test, /bl-build, /bl-search, /bl-status)~~ — DONE
19. ~~Fix API types to match live BinaryLane API responses~~ — DONE (SampleSet/SampleData, Balance, Account, Server, Image, Size, Networks)
20. ~~Fix error handling: 401 with empty body now throws instead of returning {}~~ — DONE
21. ~~Add call observability: call summary in responses + persistent log file~~ — DONE
22. ~~Validate complex multi-step operations via MCP (server health, SSH, blog publish)~~ — DONE
23. Compare token usage: v1 (86 tools) vs v2 (3 tools) — TODO
24. Consider adding `refresh` tool for mid-session SSH connection re-discovery
25. Add more detailed docs entries for remaining methods (auto-generated fallback works but isn't as rich)
26. Remove old `ssh` MCP server once v2 SSH is validated

### Key Bugs Found & Fixed During Testing
1. **Token regex** — config file uses `api-token` (hyphen) but regex only matched `api_token` (underscore). Fixed with `api[-_]token`.
2. **Cross-realm Promises** — `vm.createContext` creates a new JS realm. The sandbox's `await` couldn't unwrap host-realm Promises from bl/ssh methods. Fixed by wrapping methods to return `new SandboxPromise(...)`.
3. **Cross-realm Objects** — Resolved values appeared as empty `{}` because host-realm objects' properties are invisible to the sandbox's `Object.keys()`. Fixed by using `SandboxJSON.parse(JSON.stringify(v))` to create objects in the sandbox realm.
4. **Proxy `this` binding** — Double-Proxy chains (safety + bridgePromises) caused `this` context loss. Fixed by replacing Proxy-based wrapping with explicit bound functions in globals.ts.
5. **API types wrong** — v1 types were based on documentation, not live API. SampleData had `cpu` instead of `cpu_usage_percent`, Balance had `account_balance` instead of `unbilled_total`, etc. Fixed by querying live API and rewriting types.
6. **401 swallowed silently** — API client's `if (!text) return {} as T` ran before `if (!response.ok)`, so 401 responses with empty body returned `{}` instead of throwing. Fixed by checking `response.ok` first.
7. **MCP env var** — Token loaded from config file in direct tests but MCP process didn't inherit HOME properly. Fixed by passing token as env var in MCP registration: `claude mcp add -e BINARYLANE_API_TOKEN=...`.

### Project Stats
- **17 source files** (13 src + 4 test), ~6,000 lines TypeScript
- **93 unit tests** across 4 test files (catalog, safety, sandbox, handlers)
- **Compiles clean** with strict mode
- **2 git commits** (initial build + fixes)
- **Dependencies:** MCP SDK, ssh2, vitest (dev)
- **Custom skills:** /bl-test, /bl-build, /bl-search, /bl-status
- **Persistent log:** ~/.config/binarylane/mcp-v2.log
- **Blog post:** Published as post #29 on wp.adamhomenet.com
