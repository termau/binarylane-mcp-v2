/**
 * Safety layer — tracks all method calls, intercepts destructive operations,
 * and provides call logs for observability.
 */

const DESTRUCTIVE_PATTERNS = [
  /^delete/i,
  /^remove/i,
];

const MUTATING_PATTERNS = [
  /^create/i,
  /^update/i,
  /^perform/i,
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

export interface CallRecord {
  method: string;
  startTime: number;
  endTime?: number;
  durationMs?: number;
  status: 'pending' | 'ok' | 'error';
  error?: string;
  destructive: boolean;
}

export class SafetyInterceptor {
  private auditLog: AuditEntry[] = [];
  private callLog: CallRecord[] = [];

  /**
   * Track a method call. Returns a CallRecord that should be completed
   * via completeCall() when the call finishes.
   */
  trackCall(method: string, args: unknown[]): CallRecord {
    const methodName = method.split('.').pop() || method;
    const isDestructive = DESTRUCTIVE_PATTERNS.some(p => p.test(methodName));
    const isMutating = MUTATING_PATTERNS.some(p => p.test(methodName));

    const record: CallRecord = {
      method,
      startTime: Date.now(),
      status: 'pending',
      destructive: isDestructive,
    };

    this.callLog.push(record);

    // Audit log for destructive/mutating operations
    if (isDestructive || isMutating) {
      const entry: AuditEntry = {
        timestamp: new Date().toISOString(),
        method,
        args: this.sanitizeArgs(args),
        destructive: isDestructive,
      };

      this.auditLog.push(entry);

      if (isDestructive) {
        console.error(JSON.stringify({ audit: true, ...entry }));
      }
    }

    return record;
  }

  /**
   * Mark a call as completed successfully.
   */
  completeCall(record: CallRecord): void {
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.status = 'ok';
  }

  /**
   * Mark a call as failed.
   */
  failCall(record: CallRecord, error: string): void {
    record.endTime = Date.now();
    record.durationMs = record.endTime - record.startTime;
    record.status = 'error';
    record.error = error;
  }

  /**
   * Wrap a client object with a Proxy that intercepts and logs method calls.
   * Kept for backwards compatibility with tests.
   */
  wrapClient<T extends object>(client: T, prefix: string): T {
    return new Proxy(client, {
      get: (target, prop, receiver) => {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value !== 'function' || typeof prop !== 'string') return value;

        const methodName = prop;

        return (...args: unknown[]) => {
          this.trackCall(`${prefix}.${methodName}`, args);
          return (value as Function).apply(target, args);
        };
      },
    });
  }

  getAuditLog(): AuditEntry[] {
    return [...this.auditLog];
  }

  getCallLog(): CallRecord[] {
    return [...this.callLog];
  }

  /**
   * Get a compact summary of all calls made during execution.
   */
  getCallSummary(): string {
    if (this.callLog.length === 0) return '';

    const lines: string[] = [];
    for (const call of this.callLog) {
      const duration = call.durationMs !== undefined ? `${call.durationMs}ms` : 'pending';
      const status = call.status === 'error' ? ` ERR: ${call.error}` : '';
      const flag = call.destructive ? ' [DESTRUCTIVE]' : '';
      lines.push(`  ${call.method} (${duration})${flag}${status}`);
    }

    const totalCalls = this.callLog.length;
    const totalTime = this.callLog.reduce((sum, c) => sum + (c.durationMs || 0), 0);
    const errors = this.callLog.filter(c => c.status === 'error').length;

    let summary = `API calls (${totalCalls} calls, ${totalTime}ms total`;
    if (errors > 0) summary += `, ${errors} errors`;
    summary += '):\n' + lines.join('\n');

    return summary;
  }

  getDestructiveOps(): string[] {
    return this.auditLog
      .filter(e => e.destructive)
      .map(e => `${e.method}(${JSON.stringify(e.args).slice(1, -1)})`);
  }

  clearLog(): void {
    this.auditLog = [];
    this.callLog = [];
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
