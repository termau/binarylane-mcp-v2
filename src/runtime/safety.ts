/**
 * Safety layer — intercepts destructive operations for audit logging.
 */

const DESTRUCTIVE_PATTERNS = [
  /^delete/i,
  /^remove/i,
];

const MUTATING_PATTERNS = [
  /^create/i,
  /^update/i,
  /^perform/i, // performServerAction
  /^proceed/i,
  /^upload/i,
  /^refresh/i,
];

export interface AuditEntry {
  timestamp: string;
  method: string;
  args: unknown[];
  destructive: boolean;
}

export class SafetyInterceptor {
  private auditLog: AuditEntry[] = [];

  /**
   * Wrap a client object with a Proxy that intercepts and logs method calls.
   */
  wrapClient<T extends object>(client: T, prefix: string): T {
    return new Proxy(client, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function' || typeof prop !== 'string') return value;

        const methodName = prop;

        return (...args: unknown[]) => {
          const isDestructive = DESTRUCTIVE_PATTERNS.some(p => p.test(methodName));
          const isMutating = MUTATING_PATTERNS.some(p => p.test(methodName));

          if (isDestructive || isMutating) {
            const entry: AuditEntry = {
              timestamp: new Date().toISOString(),
              method: `${prefix}.${methodName}`,
              args: this.sanitizeArgs(args),
              destructive: isDestructive,
            };

            this.auditLog.push(entry);

            // Log destructive operations to stderr
            if (isDestructive) {
              console.error(JSON.stringify({ audit: true, ...entry }));
            }
          }

          return (value as Function).apply(target, args);
        };
      },
    });
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  getDestructiveOps(): string[] {
    return this.auditLog
      .filter(e => e.destructive)
      .map(e => `${e.method}(${JSON.stringify(e.args).slice(1, -1)})`);
  }

  clearLog(): void {
    this.auditLog = [];
  }

  private sanitizeArgs(args: unknown[]): unknown[] {
    return args.map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        const sanitized: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(arg)) {
          if (/token|password|secret|key/i.test(key) && typeof value === 'string') {
            sanitized[key] = '***';
          } else {
            sanitized[key] = value;
          }
        }
        return sanitized;
      }
      return arg;
    });
  }
}
