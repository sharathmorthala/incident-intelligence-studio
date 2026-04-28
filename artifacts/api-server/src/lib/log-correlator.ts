import type { NormalizedLogEntry } from "./connectors/opensearch-connector";

export type PatternCategory =
  | "timeout"
  | "auth_failure"
  | "dependency_failure"
  | "validation_error"
  | "infra_network_error"
  | "retry_storm"
  | "circuit_breaker"
  | "memory_pressure"
  | "connection_pool_exhaustion";

export type ObservabilitySignalType =
  | "latency_spike"
  | "error_rate_burst"
  | "retry_storm"
  | "circuit_breaker_open"
  | "connection_pool_exhaustion"
  | "memory_pressure";

export interface DetectedPattern {
  category: PatternCategory;
  pattern: string;
  count: number;
  severity: "low" | "medium" | "high" | "critical";
  firstSeen: string;
  lastSeen: string;
  affectedServices: string[];
}

export interface ObservabilitySignal {
  type: ObservabilitySignalType;
  service: string;
  description: string;
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: string;
}

export interface ServiceGroup {
  service: string;
  logCount: number;
  errorCount: number;
  warnCount: number;
  firstEventAt: string;
  lastEventAt: string;
  firstErrorAt: string | null;
  role: "origin" | "upstream" | "downstream" | "inferred";
}

export interface LogCorrelation {
  groupedByService: ServiceGroup[];
  detectedPatterns: DetectedPattern[];
  observabilitySignals: ObservabilitySignal[];
  propagationPath: string[];
  firstFailureService: string | null;
  blastRadius: number;
  cascadeDescription: string;
  sortedTimeline: NormalizedLogEntry[];
}

interface PatternRule {
  category: PatternCategory;
  keywords: string[];
  severity: "low" | "medium" | "high" | "critical";
  pattern: string;
}

const PATTERN_RULES: PatternRule[] = [
  {
    category: "timeout",
    keywords: ["timeout", "timed out", "read timeout", "request timeout", "deadline exceeded", "socket timeout", "connection timeout"],
    severity: "critical",
    pattern: "Request / Connection Timeout",
  },
  {
    category: "auth_failure",
    keywords: ["401", "403", "unauthorized", "forbidden", "authentication failed", "jwt", "invalid signature", "invalid token", "signature verification failed", "access denied"],
    severity: "high",
    pattern: "Authentication / Authorization Failure",
  },
  {
    category: "dependency_failure",
    keywords: ["503", "service unavailable", "econnrefused", "connection refused", "upstream unavailable", "downstream unavailable", "dependency unavailable", "upstream error"],
    severity: "critical",
    pattern: "Dependency / Service Unavailable",
  },
  {
    category: "validation_error",
    keywords: ["validation failed", "schema validation", "deserialization", "type mismatch", "null pointer", "nullpointerexception", "cannot deserialize", "invalid schema", "schema mismatch"],
    severity: "high",
    pattern: "Validation / Schema Error",
  },
  {
    category: "infra_network_error",
    keywords: ["network error", "dns resolution", "tls", "ssl", "certificate", "econnreset", "tcp", "socket error", "handshake failed", "certificate validation"],
    severity: "high",
    pattern: "Network / Infrastructure Error",
  },
  {
    category: "retry_storm",
    keywords: ["retry storm", "retry queue", "retrying", "backoff", "attempt #", "attempt 2", "attempt 3", "max retries exceeded"],
    severity: "medium",
    pattern: "Retry Storm / Backoff Loop",
  },
  {
    category: "circuit_breaker",
    keywords: ["circuit breaker", "circuit open", "circuit half-open", "failing fast", "open state", "half-open", "breaker tripped"],
    severity: "high",
    pattern: "Circuit Breaker Activation",
  },
  {
    category: "memory_pressure",
    keywords: ["out of memory", "heap space", "garbage collection", "oom", "memory pressure", "gc overhead", "outofmemory", "heap exhausted"],
    severity: "critical",
    pattern: "Memory Pressure / OOM",
  },
  {
    category: "connection_pool_exhaustion",
    keywords: ["connection pool exhausted", "pool exhausted", "acquire timeout", "max connections", "pool utilization", "connection pool", "pool full", "acquiretimeout"],
    severity: "critical",
    pattern: "Connection Pool Exhaustion",
  },
];

function matchesKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function detectPatterns(logs: NormalizedLogEntry[]): DetectedPattern[] {
  const accumulated: Map<PatternCategory, {
    count: number;
    firstSeen: string;
    lastSeen: string;
    servicesSet: Set<string>;
  }> = new Map();

  for (const log of logs) {
    const text = `${log.message} ${JSON.stringify(log.raw)}`;

    for (const rule of PATTERN_RULES) {
      if (matchesKeywords(text, rule.keywords)) {
        const existing = accumulated.get(rule.category);
        if (existing) {
          existing.count++;
          if (log.timestamp < existing.firstSeen) existing.firstSeen = log.timestamp;
          if (log.timestamp > existing.lastSeen) existing.lastSeen = log.timestamp;
          existing.servicesSet.add(log.service);
        } else {
          accumulated.set(rule.category, {
            count: 1,
            firstSeen: log.timestamp,
            lastSeen: log.timestamp,
            servicesSet: new Set([log.service]),
          });
        }
      }
    }
  }

  const results: DetectedPattern[] = [];
  for (const rule of PATTERN_RULES) {
    const acc = accumulated.get(rule.category);
    if (acc) {
      results.push({
        category: rule.category,
        pattern: rule.pattern,
        count: acc.count,
        severity: rule.severity,
        firstSeen: acc.firstSeen,
        lastSeen: acc.lastSeen,
        affectedServices: Array.from(acc.servicesSet),
      });
    }
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return results.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function detectObservabilitySignals(
  logs: NormalizedLogEntry[],
  groupedByService: ServiceGroup[]
): ObservabilitySignal[] {
  const signals: ObservabilitySignal[] = [];

  const latencyKeywords = ["latency elevated", "latency spike", "slow response", "p99", "p95", "response time", "high latency", "ms (threshold", "exceeds sla"];
  const retryKeywords = ["retry storm", "retry queue", "2400 retries", "queued retries", "backoff", "max retries"];
  const cbKeywords = ["circuit breaker", "circuit open", "circuit half-open", "breaker tripped", "failing fast"];
  const poolKeywords = ["pool exhausted", "connection pool", "pool utilization", "acquire timeout", "pool full"];
  const memKeywords = ["out of memory", "heap", "oom", "gc overhead", "memory pressure"];
  const burstKeywords = ["spike detected", "requests/min", "error rate", "error burst", "error spike"];

  for (const log of logs) {
    const msg = log.message.toLowerCase();

    if (latencyKeywords.some((k) => msg.includes(k))) {
      if (!signals.find((s) => s.type === "latency_spike" && s.service === log.service)) {
        signals.push({
          type: "latency_spike",
          service: log.service,
          description: `Latency spike detected in ${log.service}: "${log.message.substring(0, 120)}"`,
          severity: log.level === "ERROR" || log.level === "FATAL" ? "high" : "medium",
          detectedAt: log.timestamp,
        });
      }
    }

    if (retryKeywords.some((k) => msg.includes(k))) {
      if (!signals.find((s) => s.type === "retry_storm" && s.service === log.service)) {
        signals.push({
          type: "retry_storm",
          service: log.service,
          description: `Retry storm detected in ${log.service}: "${log.message.substring(0, 120)}"`,
          severity: "high",
          detectedAt: log.timestamp,
        });
      }
    }

    if (cbKeywords.some((k) => msg.includes(k))) {
      if (!signals.find((s) => s.type === "circuit_breaker_open" && s.service === log.service)) {
        signals.push({
          type: "circuit_breaker_open",
          service: log.service,
          description: `Circuit breaker activation in ${log.service}: "${log.message.substring(0, 120)}"`,
          severity: "high",
          detectedAt: log.timestamp,
        });
      }
    }

    if (poolKeywords.some((k) => msg.includes(k))) {
      if (!signals.find((s) => s.type === "connection_pool_exhaustion" && s.service === log.service)) {
        signals.push({
          type: "connection_pool_exhaustion",
          service: log.service,
          description: `Connection pool exhaustion in ${log.service}: "${log.message.substring(0, 120)}"`,
          severity: "critical",
          detectedAt: log.timestamp,
        });
      }
    }

    if (memKeywords.some((k) => msg.includes(k))) {
      if (!signals.find((s) => s.type === "memory_pressure" && s.service === log.service)) {
        signals.push({
          type: "memory_pressure",
          service: log.service,
          description: `Memory pressure in ${log.service}: "${log.message.substring(0, 120)}"`,
          severity: "critical",
          detectedAt: log.timestamp,
        });
      }
    }

    if (burstKeywords.some((k) => msg.includes(k))) {
      if (!signals.find((s) => s.type === "error_rate_burst" && s.service === log.service)) {
        signals.push({
          type: "error_rate_burst",
          service: log.service,
          description: `Error rate burst in ${log.service}: "${log.message.substring(0, 120)}"`,
          severity: "high",
          detectedAt: log.timestamp,
        });
      }
    }
  }

  // Detect burst via density: if 3+ ERROR/FATAL events from the same service within a 60s window
  const errorsByService = new Map<string, NormalizedLogEntry[]>();
  for (const log of logs) {
    if (log.level === "ERROR" || log.level === "FATAL") {
      const list = errorsByService.get(log.service) ?? [];
      list.push(log);
      errorsByService.set(log.service, list);
    }
  }

  for (const [service, errorLogs] of errorsByService) {
    if (errorLogs.length >= 5 && !signals.find((s) => s.type === "error_rate_burst" && s.service === service)) {
      const sorted = [...errorLogs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const first = new Date(sorted[0].timestamp).getTime();
      const last = new Date(sorted[sorted.length - 1].timestamp).getTime();
      const windowSec = (last - first) / 1000;
      if (windowSec > 0 && windowSec < 300) {
        signals.push({
          type: "error_rate_burst",
          service,
          description: `Error rate burst: ${errorLogs.length} errors in ${Math.round(windowSec)}s window from ${service}`,
          severity: errorLogs.length > 20 ? "critical" : "high",
          detectedAt: sorted[0].timestamp,
        });
      }
    }
  }

  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  return signals.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}

function groupByService(
  logs: NormalizedLogEntry[],
  originService: string
): ServiceGroup[] {
  const serviceMap = new Map<string, ServiceGroup>();

  for (const log of logs) {
    const svc = log.service;
    if (!serviceMap.has(svc)) {
      serviceMap.set(svc, {
        service: svc,
        logCount: 0,
        errorCount: 0,
        warnCount: 0,
        firstEventAt: log.timestamp,
        lastEventAt: log.timestamp,
        firstErrorAt: null,
        role: svc === originService ? "origin" : "inferred",
      });
    }

    const grp = serviceMap.get(svc)!;
    grp.logCount++;
    if (log.level === "ERROR" || log.level === "FATAL") {
      grp.errorCount++;
      if (!grp.firstErrorAt || log.timestamp < grp.firstErrorAt) {
        grp.firstErrorAt = log.timestamp;
      }
    }
    if (log.level === "WARN") grp.warnCount++;
    if (log.timestamp < grp.firstEventAt) grp.firstEventAt = log.timestamp;
    if (log.timestamp > grp.lastEventAt) grp.lastEventAt = log.timestamp;
  }

  return Array.from(serviceMap.values()).sort((a, b) =>
    a.firstEventAt.localeCompare(b.firstEventAt)
  );
}

function buildPropagationPath(
  groupedByService: ServiceGroup[],
  firstFailureService: string | null
): string[] {
  const withErrors = groupedByService
    .filter((g) => g.firstErrorAt !== null)
    .sort((a, b) => (a.firstErrorAt ?? "").localeCompare(b.firstErrorAt ?? ""));

  const path = withErrors.map((g) => g.service);

  if (firstFailureService && path.length > 0 && path[0] !== firstFailureService) {
    const idx = path.indexOf(firstFailureService);
    if (idx > 0) {
      path.splice(idx, 1);
      path.unshift(firstFailureService);
    }
  }

  return path.slice(0, 8);
}

function assignRoles(groups: ServiceGroup[], firstFailureService: string | null): ServiceGroup[] {
  if (!firstFailureService) return groups;

  const firstFailureTs = groups.find((g) => g.service === firstFailureService)?.firstErrorAt;
  if (!firstFailureTs) return groups;

  return groups.map((g) => {
    if (g.service === firstFailureService) return { ...g, role: "origin" as const };
    if (g.firstErrorAt && g.firstErrorAt < firstFailureTs) return { ...g, role: "upstream" as const };
    if (g.firstErrorAt && g.firstErrorAt >= firstFailureTs) return { ...g, role: "downstream" as const };
    return g;
  });
}

export function correlateLogs(
  logs: NormalizedLogEntry[],
  originService: string
): LogCorrelation {
  if (logs.length === 0) {
    return {
      groupedByService: [],
      detectedPatterns: [],
      observabilitySignals: [],
      propagationPath: [],
      firstFailureService: null,
      blastRadius: 0,
      cascadeDescription: "No logs available for correlation analysis.",
      sortedTimeline: [],
    };
  }

  const sortedTimeline = [...logs].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  let groups = groupByService(sortedTimeline, originService);

  const firstFailureService =
    groups
      .filter((g) => g.firstErrorAt !== null)
      .sort((a, b) => (a.firstErrorAt ?? "").localeCompare(b.firstErrorAt ?? ""))[0]?.service ?? null;

  groups = assignRoles(groups, firstFailureService);

  const propagationPath = buildPropagationPath(groups, firstFailureService);
  const blastRadius = groups.filter((g) => g.errorCount > 0).length;

  const detectedPatterns = detectPatterns(sortedTimeline);
  const observabilitySignals = detectObservabilitySignals(sortedTimeline, groups);

  const cascadeDescription = buildCascadeDescription(propagationPath, blastRadius, firstFailureService);

  return {
    groupedByService: groups,
    detectedPatterns,
    observabilitySignals,
    propagationPath,
    firstFailureService,
    blastRadius,
    cascadeDescription,
    sortedTimeline,
  };
}

function buildCascadeDescription(
  propagationPath: string[],
  blastRadius: number,
  firstFailureService: string | null
): string {
  if (propagationPath.length === 0) return "No failure cascade detected.";
  if (propagationPath.length === 1) {
    return `Failure isolated to ${propagationPath[0]} — no cascading downstream impact detected.`;
  }
  const chain = propagationPath.join(" → ");
  return `Failure originated in ${firstFailureService ?? propagationPath[0]} and cascaded through ${blastRadius} service${blastRadius !== 1 ? "s" : ""}: ${chain}.`;
}

export function correlateRawLogs(
  rawLogs: string,
  originService: string
): LogCorrelation {
  const lines = rawLogs.split("\n").filter((l) => l.trim());
  const timestampRegex = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)/;
  const levelRegex = /\b(INFO|WARN|WARNING|ERROR|FATAL|DEBUG|CRITICAL)\b/i;
  const serviceRegex = /\[([a-zA-Z][\w-]{2,})\]|\b([\w-]+-service|[\w-]+-api|[\w-]+-gateway|[\w-]+-worker|[\w-]+-proxy)\b/i;

  const entries: NormalizedLogEntry[] = [];

  for (const line of lines.slice(0, 500)) {
    const tsMatch = line.match(timestampRegex);
    const levelMatch = line.match(levelRegex);
    const svcMatch = line.match(serviceRegex);

    let timestamp = tsMatch ? tsMatch[1].replace(" ", "T") : new Date().toISOString();
    if (!timestamp.includes("T")) timestamp += "T00:00:00Z";
    if (!timestamp.endsWith("Z") && !timestamp.includes("+")) timestamp += "Z";

    let level = levelMatch ? levelMatch[1].toUpperCase() : "INFO";
    if (level === "WARNING" || level === "DEBUG") level = "WARN";
    if (level === "CRITICAL") level = "FATAL";

    const service = svcMatch?.[1] ?? svcMatch?.[2] ?? originService;

    const message = line
      .replace(timestampRegex, "")
      .replace(levelRegex, "")
      .replace(/\s+/g, " ")
      .trim() || line.trim();

    entries.push({
      timestamp,
      service,
      level,
      message: message.substring(0, 300),
      raw: { originalLine: line },
    });
  }

  return correlateLogs(entries, originService);
}
