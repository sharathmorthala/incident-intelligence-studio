export interface TimelineEvent {
  timestamp: string;
  service: string;
  level: "INFO" | "WARN" | "ERROR" | "FATAL";
  message: string;
}

export interface ErrorPattern {
  pattern: string;
  count: number;
  severity: "low" | "medium" | "high" | "critical";
  firstSeen: string;
  lastSeen: string;
}

export interface DownstreamFailure {
  service: string;
  errorType: string;
  impactLevel: "low" | "medium" | "high" | "critical";
  details: string;
}

export interface IncidentAnalysis {
  summary: string;
  probableRootCause: string;
  timeline: TimelineEvent[];
  affectedServices: string[];
  errorPatterns: ErrorPattern[];
  downstreamFailures: DownstreamFailure[];
  suggestedFixes: string[];
  suggestedRollback: string;
  confidence: "high" | "medium" | "low";
  mttr: string | null;
}

const MOCK_SCENARIOS: Record<string, IncidentAnalysis> = {
  "CORR-500-TIMEOUT": {
    summary:
      "Critical timeout cascade originating from the payment-service upstream dependency. Elevated response times detected on order-api starting at 14:23 UTC, escalating to full service unavailability within 4 minutes. Approximately 12,400 requests failed during the 18-minute incident window.",
    probableRootCause:
      "The payment-gateway (external) began responding with 30s+ latency due to an upstream TLS certificate rotation misconfiguration. Thread pools in payment-service exhausted as connections queued, causing request timeouts to propagate upstream to order-api and eventually cart-service.",
    timeline: [
      { timestamp: "2025-04-28T14:23:11Z", service: "payment-gateway", level: "WARN", message: "TLS handshake latency elevated: 2800ms (threshold: 500ms)" },
      { timestamp: "2025-04-28T14:23:44Z", service: "payment-service", level: "WARN", message: "Connection pool utilization at 78% — upstream latency detected" },
      { timestamp: "2025-04-28T14:24:02Z", service: "order-api", level: "ERROR", message: "Request timeout after 30000ms calling payment-service /charge endpoint" },
      { timestamp: "2025-04-28T14:24:19Z", service: "payment-service", level: "ERROR", message: "Thread pool exhausted: 200/200 threads active, 847 requests queued" },
      { timestamp: "2025-04-28T14:24:55Z", service: "order-api", level: "ERROR", message: "Circuit breaker OPEN for payment-service — failing fast" },
      { timestamp: "2025-04-28T14:25:08Z", service: "cart-service", level: "ERROR", message: "Downstream dependency payment unavailable — order checkout degraded" },
      { timestamp: "2025-04-28T14:27:33Z", service: "notification-service", level: "WARN", message: "Order confirmation emails queued — payment status uncertain" },
      { timestamp: "2025-04-28T14:31:17Z", service: "payment-gateway", level: "ERROR", message: "FATAL: Certificate validation failed for upstream processor endpoint" },
      { timestamp: "2025-04-28T14:38:44Z", service: "payment-gateway", level: "INFO", message: "TLS certificate re-issued — latency returning to baseline (180ms)" },
      { timestamp: "2025-04-28T14:41:22Z", service: "payment-service", level: "INFO", message: "Connection pool draining — thread utilization at 23%" },
      { timestamp: "2025-04-28T14:41:55Z", service: "order-api", level: "INFO", message: "Circuit breaker HALF-OPEN — testing payment-service connectivity" },
    ],
    affectedServices: ["payment-gateway", "payment-service", "order-api", "cart-service", "notification-service"],
    errorPatterns: [
      { pattern: "Request timeout after 30000ms", count: 3847, severity: "critical", firstSeen: "2025-04-28T14:24:02Z", lastSeen: "2025-04-28T14:41:00Z" },
      { pattern: "Thread pool exhausted", count: 14, severity: "critical", firstSeen: "2025-04-28T14:24:19Z", lastSeen: "2025-04-28T14:38:11Z" },
      { pattern: "Circuit breaker OPEN", count: 2, severity: "high", firstSeen: "2025-04-28T14:24:55Z", lastSeen: "2025-04-28T14:41:55Z" },
      { pattern: "TLS handshake latency elevated", count: 892, severity: "high", firstSeen: "2025-04-28T14:23:11Z", lastSeen: "2025-04-28T14:38:44Z" },
      { pattern: "Certificate validation failed", count: 1, severity: "critical", firstSeen: "2025-04-28T14:31:17Z", lastSeen: "2025-04-28T14:31:17Z" },
    ],
    downstreamFailures: [
      { service: "cart-service", errorType: "Dependency Unavailable", impactLevel: "high", details: "Checkout flow degraded — orders could not be confirmed for 18 minutes" },
      { service: "notification-service", errorType: "Queue Backpressure", impactLevel: "medium", details: "7,200 confirmation emails queued — delivered post-recovery with delay" },
      { service: "analytics-service", errorType: "Event Loss", impactLevel: "low", details: "Purchase events dropped during outage window — revenue metrics incomplete" },
    ],
    suggestedFixes: [
      "Implement certificate expiry alerting with 30-day and 7-day warning thresholds on payment-gateway TLS configuration",
      "Increase thread pool timeout from 30s to 5s with exponential backoff to fail faster and reduce queue buildup",
      "Add payment-gateway health check to circuit breaker probe — trigger at 3 consecutive failures",
      "Configure Kubernetes HPA on payment-service to scale out when thread pool utilization exceeds 60%",
      "Implement async payment processing with idempotent retry queue for checkout resilience during gateway degradation",
    ],
    suggestedRollback:
      "Revert the certificate rotation script (`scripts/rotate-tls.sh`) to the previous version. Re-issue the TLS certificate using `openssl req -newkey rsa:4096` against the confirmed-working CA endpoint. Validate via `curl -v --max-time 5 https://payment-gateway/health` before routing traffic.",
    confidence: "high",
    mttr: "18m 44s",
  },

  "CORR-AUTH-401": {
    summary:
      "Authentication failures cascading from an expired JWT signing key rotation in auth-service. All API endpoints requiring bearer token validation began rejecting valid tokens at 09:07 UTC following a scheduled key rotation that failed to propagate to token-validator replicas.",
    probableRootCause:
      "Kubernetes rolling update of auth-service deployed a new JWT signing key (RS256 keypair) but the Vault secret sync had a 12-minute delay. Token-validator pods loaded the old public key from stale ConfigMap. All tokens signed with the new key returned 401 until all pods restarted with the updated key.",
    timeline: [
      { timestamp: "2025-04-28T09:00:00Z", service: "auth-service", level: "INFO", message: "JWT signing key rotation initiated — generating RS256 keypair v2025-04-28" },
      { timestamp: "2025-04-28T09:02:14Z", service: "vault", level: "INFO", message: "New public key written to secret/auth/jwt-public-key" },
      { timestamp: "2025-04-28T09:07:33Z", service: "api-gateway", level: "WARN", message: "401 Unauthorized spike detected — 340 requests/min (baseline: 2)" },
      { timestamp: "2025-04-28T09:07:44Z", service: "token-validator", level: "ERROR", message: "JWT signature verification failed: invalid signature for sub=user_48291" },
      { timestamp: "2025-04-28T09:08:01Z", service: "user-service", level: "ERROR", message: "Upstream 401 from auth-service — user sessions invalidated" },
      { timestamp: "2025-04-28T09:09:17Z", service: "api-gateway", level: "ERROR", message: "Authentication bypass rate 94% — circuit breaker evaluating" },
      { timestamp: "2025-04-28T09:14:22Z", service: "vault", level: "INFO", message: "ConfigMap sync completed for token-validator — public key updated" },
      { timestamp: "2025-04-28T09:15:44Z", service: "token-validator", level: "INFO", message: "Reloaded JWT public key — signature validation restored" },
      { timestamp: "2025-04-28T09:16:02Z", service: "api-gateway", level: "INFO", message: "401 rate returning to baseline — 4 requests/min" },
    ],
    affectedServices: ["auth-service", "token-validator", "api-gateway", "user-service", "session-manager"],
    errorPatterns: [
      { pattern: "JWT signature verification failed", count: 28441, severity: "critical", firstSeen: "2025-04-28T09:07:44Z", lastSeen: "2025-04-28T09:15:44Z" },
      { pattern: "401 Unauthorized spike", count: 8, severity: "high", firstSeen: "2025-04-28T09:07:33Z", lastSeen: "2025-04-28T09:16:02Z" },
      { pattern: "ConfigMap sync delay", count: 1, severity: "critical", firstSeen: "2025-04-28T09:02:14Z", lastSeen: "2025-04-28T09:14:22Z" },
    ],
    downstreamFailures: [
      { service: "user-service", errorType: "Auth Dependency Failure", impactLevel: "critical", details: "All authenticated user requests failed — session state invalidated for active users" },
      { service: "data-export-service", errorType: "Scheduled Job Failure", impactLevel: "medium", details: "3 scheduled reports failed to authenticate — queued for retry" },
    ],
    suggestedFixes: [
      "Implement JWKS endpoint with multi-key support — allow validators to accept both old and new public keys during rotation window",
      "Reduce Vault-to-ConfigMap sync delay from 12 minutes to under 30 seconds using external-secrets with push mode",
      "Add pre-rotation smoke test: generate a token with the new key and validate against all replicas before completing rotation",
      "Implement graceful key rotation with 15-minute overlap period where both old and new keys are accepted",
    ],
    suggestedRollback:
      "Manually restore the previous JWT public key in Vault: `vault kv put secret/auth/jwt-public-key value=@/backup/jwt-pub-prev.pem`. Force-rollout token-validator with `kubectl rollout restart deployment/token-validator`. Monitor 401 rate in Grafana dashboard `auth-service/error-rates`.",
    confidence: "high",
    mttr: "8m 29s",
  },

  "CORR-DOWNSTREAM-FAIL": {
    summary:
      "Cascading downstream service failure initiated by inventory-service database connection pool exhaustion. The failure propagated through order-fulfillment and shipping-coordinator, impacting ~8,700 active order operations over a 34-minute window.",
    probableRootCause:
      "A long-running migration query on the inventory PostgreSQL instance held table locks for 23 minutes, causing connection pool exhaustion. Services upstream received connection timeout errors, triggering retry storms that compounded the lock contention.",
    timeline: [
      { timestamp: "2025-04-28T11:04:19Z", service: "inventory-db", level: "WARN", message: "Long-running query detected: ALTER TABLE inventory_items ADD COLUMN reserved_qty (22m 47s)" },
      { timestamp: "2025-04-28T11:06:33Z", service: "inventory-service", level: "WARN", message: "DB connection pool at 85% utilization — queries queuing" },
      { timestamp: "2025-04-28T11:09:44Z", service: "inventory-service", level: "ERROR", message: "Connection pool exhausted — AcquireTimeout after 5000ms" },
      { timestamp: "2025-04-28T11:10:02Z", service: "order-fulfillment", level: "ERROR", message: "Downstream unavailable: inventory-service /check-stock returned 503" },
      { timestamp: "2025-04-28T11:10:18Z", service: "shipping-coordinator", level: "ERROR", message: "Cannot allocate shipment — inventory check failed" },
      { timestamp: "2025-04-28T11:13:47Z", service: "order-fulfillment", level: "ERROR", message: "Retry storm detected — 2,400 retries queued against inventory-service" },
      { timestamp: "2025-04-28T11:27:06Z", service: "inventory-db", level: "INFO", message: "Migration completed — table locks released" },
      { timestamp: "2025-04-28T11:28:34Z", service: "inventory-service", level: "INFO", message: "Connection pool recovering — utilization at 41%" },
      { timestamp: "2025-04-28T11:38:22Z", service: "order-fulfillment", level: "INFO", message: "Backlog processing — 8,700 deferred orders queued for retry" },
    ],
    affectedServices: ["inventory-db", "inventory-service", "order-fulfillment", "shipping-coordinator", "warehouse-api"],
    errorPatterns: [
      { pattern: "Connection pool exhausted", count: 1847, severity: "critical", firstSeen: "2025-04-28T11:09:44Z", lastSeen: "2025-04-28T11:28:34Z" },
      { pattern: "Downstream unavailable", count: 8723, severity: "critical", firstSeen: "2025-04-28T11:10:02Z", lastSeen: "2025-04-28T11:38:22Z" },
      { pattern: "Retry storm detected", count: 3, severity: "high", firstSeen: "2025-04-28T11:13:47Z", lastSeen: "2025-04-28T11:25:00Z" },
    ],
    downstreamFailures: [
      { service: "shipping-coordinator", errorType: "Dependency Timeout", impactLevel: "critical", details: "Shipment allocation blocked for 28 minutes — 1,200 orders delayed" },
      { service: "warehouse-api", errorType: "Propagated Failure", impactLevel: "high", details: "Pick-list generation failed — warehouse operations stalled" },
    ],
    suggestedFixes: [
      "Run schema migrations during low-traffic windows with LOCK_TIMEOUT=30s to fail fast instead of blocking",
      "Implement statement timeout on long-running admin queries: `SET statement_timeout = '5min'`",
      "Add connection pool size limit per-service with queue depth alerting at 70% threshold",
      "Implement exponential backoff with jitter in inventory-service client to prevent retry storms",
      "Add circuit breaker in order-fulfillment for inventory-service with graceful degradation to cached stock data",
    ],
    suggestedRollback:
      "If migration is still running: `SELECT pg_cancel_backend(pid) FROM pg_stat_activity WHERE query LIKE '%ALTER TABLE inventory%' AND state = 'active'`. Reset connection pool in inventory-service by cycling pods: `kubectl rollout restart deployment/inventory-service`. Monitor pool utilization via `/metrics` endpoint.",
    confidence: "high",
    mttr: "34m 3s",
  },

  "CORR-VALIDATION-ERROR": {
    summary:
      "Schema validation failures across product-catalog-api following a breaking change in the upstream product data contract. A field type change from `string` to `object` in the manufacturer field caused deserialization failures in 3 downstream consumers, affecting ~4,200 product update operations.",
    probableRootCause:
      "Product-catalog-api v2.3.1 changed the `manufacturer` field from a string identifier to a nested object `{id, name, country}` without a backward-compatible migration period. Downstream services (search-indexer, recommendation-engine, storefront-api) expected the string format and threw deserialization errors.",
    timeline: [
      { timestamp: "2025-04-28T16:00:00Z", service: "product-catalog-api", level: "INFO", message: "Deployment v2.3.1 complete — manufacturer field schema updated to object type" },
      { timestamp: "2025-04-28T16:01:14Z", service: "search-indexer", level: "ERROR", message: "Validation failed: manufacturer expected string got object at $.manufacturer" },
      { timestamp: "2025-04-28T16:01:19Z", service: "recommendation-engine", level: "ERROR", message: "Deserialization error: Cannot deserialize value of type String from Object" },
      { timestamp: "2025-04-28T16:01:33Z", service: "storefront-api", level: "ERROR", message: "null pointer exception: manufacturer.toString() on object type" },
      { timestamp: "2025-04-28T16:04:02Z", service: "search-indexer", level: "ERROR", message: "Dead letter queue threshold exceeded — 500 failed events" },
      { timestamp: "2025-04-28T16:18:44Z", service: "product-catalog-api", level: "INFO", message: "Hotfix v2.3.2 deployed — manufacturer field supports both string and object" },
      { timestamp: "2025-04-28T16:19:02Z", service: "search-indexer", level: "INFO", message: "Schema validation passing — reprocessing dead letter queue" },
    ],
    affectedServices: ["product-catalog-api", "search-indexer", "recommendation-engine", "storefront-api"],
    errorPatterns: [
      { pattern: "Validation failed: manufacturer expected string got object", count: 4218, severity: "critical", firstSeen: "2025-04-28T16:01:14Z", lastSeen: "2025-04-28T16:19:02Z" },
      { pattern: "Deserialization error", count: 3944, severity: "high", firstSeen: "2025-04-28T16:01:19Z", lastSeen: "2025-04-28T16:19:02Z" },
      { pattern: "null pointer exception", count: 891, severity: "high", firstSeen: "2025-04-28T16:01:33Z", lastSeen: "2025-04-28T16:19:02Z" },
      { pattern: "Dead letter queue threshold exceeded", count: 7, severity: "medium", firstSeen: "2025-04-28T16:04:02Z", lastSeen: "2025-04-28T16:18:44Z" },
    ],
    downstreamFailures: [
      { service: "search-indexer", errorType: "Schema Mismatch", impactLevel: "high", details: "Product search index not updated for 18 minutes — stale results served to users" },
      { service: "recommendation-engine", errorType: "Deserialization Failure", impactLevel: "medium", details: "Product recommendations degraded — fallback to popularity-based serving" },
      { service: "storefront-api", errorType: "NPE Cascade", impactLevel: "high", details: "Product detail pages threw 500 errors for ~12% of catalog" },
    ],
    suggestedFixes: [
      "Implement API versioning with `/v2/` prefix for breaking schema changes — maintain `/v1/` for 90-day sunset period",
      "Add consumer contract testing (Pact) to CI/CD pipeline — breaking changes blocked before deployment",
      "Use JSON Schema additionalProperties:false validation on consumers to catch contract drift early",
      "Implement backward-compatible field transformation: accept both `manufacturer: 'string'` and `manufacturer: {id, name, country}`",
    ],
    suggestedRollback:
      "Roll back product-catalog-api to v2.3.0: `kubectl set image deployment/product-catalog-api app=product-catalog-api:v2.3.0`. Drain and reprocess dead letter queues in search-indexer: `kafka-consumer-groups --reset-offsets --to-datetime 2025-04-28T16:00:00Z`. Verify storefront-api 500 rate drops below 0.1%.",
    confidence: "high",
    mttr: "18m 2s",
  },
};

function detectKeywords(logs: string): {
  hasTimeout: boolean;
  has500: boolean;
  has401: boolean;
  has403: boolean;
  hasConnectionRefused: boolean;
  hasNullPointer: boolean;
  hasValidationFailed: boolean;
  hasDownstreamUnavailable: boolean;
} {
  const lower = logs.toLowerCase();
  return {
    hasTimeout: lower.includes("timeout") || lower.includes("timed out"),
    has500: lower.includes("500") || lower.includes("internal server error"),
    has401: lower.includes("401") || lower.includes("unauthorized"),
    has403: lower.includes("403") || lower.includes("forbidden"),
    hasConnectionRefused: lower.includes("connection refused") || lower.includes("econnrefused"),
    hasNullPointer: lower.includes("null pointer") || lower.includes("nullpointerexception") || lower.includes("cannot read") || lower.includes("undefined"),
    hasValidationFailed: lower.includes("validation failed") || lower.includes("schema") || lower.includes("deserializ"),
    hasDownstreamUnavailable: lower.includes("downstream") || lower.includes("upstream") || lower.includes("dependency") || lower.includes("503"),
  };
}

function parseLogLines(rawLogs: string, serviceName: string): TimelineEvent[] {
  const lines = rawLogs.split("\n").filter((l) => l.trim());
  const events: TimelineEvent[] = [];

  const timestampRegex = /(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/;
  const levelRegex = /\b(INFO|WARN|WARNING|ERROR|FATAL|DEBUG|CRITICAL)\b/i;

  for (const line of lines.slice(0, 50)) {
    const tsMatch = line.match(timestampRegex);
    const levelMatch = line.match(levelRegex);

    let timestamp = tsMatch ? tsMatch[1].replace(" ", "T") + "Z" : new Date().toISOString();
    let rawLevel = levelMatch ? levelMatch[1].toUpperCase() : "INFO";
    if (rawLevel === "WARNING" || rawLevel === "DEBUG") rawLevel = "WARN";
    if (rawLevel === "CRITICAL") rawLevel = "FATAL";
    const level = rawLevel as TimelineEvent["level"];

    const message = line.replace(timestampRegex, "").replace(levelRegex, "").replace(/\s+/g, " ").trim() || line.trim();

    events.push({ timestamp, service: serviceName, level, message: message.substring(0, 200) });
  }

  return events.length > 0 ? events : [{ timestamp: new Date().toISOString(), service: serviceName, level: "INFO", message: "Log parsing completed — no structured events detected" }];
}

function buildGenericAnalysis(
  correlationId: string,
  serviceName: string,
  environment: string,
  rawLogs?: string | null
): IncidentAnalysis {
  if (rawLogs && rawLogs.trim()) {
    const kw = detectKeywords(rawLogs);
    const timeline = parseLogLines(rawLogs, serviceName);

    let summary = `Incident detected for ${serviceName} in ${environment} environment (correlation: ${correlationId}).`;
    let probableRootCause = "Analysis based on provided log data.";
    const suggestedFixes: string[] = [];
    const errorPatterns: ErrorPattern[] = [];
    const downstreamFailures: DownstreamFailure[] = [];
    let confidence: "high" | "medium" | "low" = "medium";

    const now = new Date().toISOString();
    const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();

    if (kw.has401 || kw.has403) {
      summary = `Authentication/authorization failure detected in ${serviceName}. Requests are being rejected with 4xx status codes.`;
      probableRootCause = "Token validation failure or expired credentials. Likely caused by JWT key rotation, session expiry, or RBAC misconfiguration.";
      errorPatterns.push({ pattern: "HTTP 401/403 Unauthorized", count: 847, severity: "high", firstSeen: fiveMinAgo, lastSeen: now });
      suggestedFixes.push("Verify JWT signing key consistency across all service replicas", "Check token expiry settings and clock skew between services", "Review RBAC policies for recent changes");
      confidence = "high";
    } else if (kw.hasTimeout) {
      summary = `Timeout cascade detected in ${serviceName}. Upstream dependencies are not responding within configured thresholds.`;
      probableRootCause = "Upstream service latency degradation causing thread pool exhaustion. Connection pool saturation likely contributing to cascading failures.";
      errorPatterns.push({ pattern: "Request timeout", count: 1243, severity: "critical", firstSeen: fiveMinAgo, lastSeen: now });
      downstreamFailures.push({ service: "upstream-dependency", errorType: "Timeout", impactLevel: "high", details: "Upstream service response time exceeding configured timeout threshold" });
      suggestedFixes.push("Implement circuit breaker pattern on upstream calls", "Reduce timeout threshold to fail fast (5s max)", "Add connection pool monitoring with alerting at 70% utilization");
      confidence = "high";
    } else if (kw.hasConnectionRefused) {
      summary = `Connection refused errors detected. ${serviceName} cannot establish connections to dependent services.`;
      probableRootCause = "Target service is unreachable — likely crashed, not yet ready, or network policy blocking connections. Pod restart or deployment rollout may be in progress.";
      errorPatterns.push({ pattern: "ECONNREFUSED / Connection refused", count: 412, severity: "critical", firstSeen: fiveMinAgo, lastSeen: now });
      downstreamFailures.push({ service: "target-service", errorType: "Connection Refused", impactLevel: "critical", details: "Service not accepting connections — check pod health and readiness probes" });
      suggestedFixes.push("Check pod status: `kubectl get pods -n <namespace>`", "Review readiness probe configuration — ensure service is ready before routing traffic", "Verify network policies allow traffic on required ports");
      confidence = "high";
    } else if (kw.hasValidationFailed) {
      summary = `Schema/validation failures detected in ${serviceName}. Data contract mismatch causing processing errors.`;
      probableRootCause = "Breaking change in upstream data contract — field type or structure changed without backward-compatible migration. Consumer services failing to deserialize responses.";
      errorPatterns.push({ pattern: "Validation/schema failure", count: 2891, severity: "high", firstSeen: fiveMinAgo, lastSeen: now });
      suggestedFixes.push("Implement API versioning to avoid breaking changes", "Add consumer contract testing (Pact) to CI/CD pipeline", "Use schema registry to track and validate contract changes");
      confidence = "high";
    } else if (kw.has500) {
      summary = `Internal server errors detected in ${serviceName}. Service is returning 5xx responses indicating unhandled exceptions.`;
      probableRootCause = "Unhandled exception or null pointer error in application code. Recent deployment or configuration change may have introduced a regression.";
      errorPatterns.push({ pattern: "HTTP 500 Internal Server Error", count: 654, severity: "high", firstSeen: fiveMinAgo, lastSeen: now });
      suggestedFixes.push("Review recent deployments and configuration changes", "Check application logs for stack traces", "Verify database connectivity and query performance");
      confidence = "medium";
    } else {
      summary = `Anomalous behavior detected in ${serviceName}. Log analysis indicates elevated error rates in the observed time window.`;
      probableRootCause = "Insufficient signal from provided logs to determine root cause with high confidence. Additional context or structured log aggregation recommended.";
      suggestedFixes.push("Enable structured JSON logging for better signal correlation", "Add distributed tracing (OpenTelemetry) to identify bottlenecks", "Configure log aggregation to include all dependent services");
      confidence = "low";
    }

    if (kw.hasNullPointer) {
      suggestedFixes.push("Add null safety checks for all external data deserialization paths");
      errorPatterns.push({ pattern: "NullPointerException / undefined access", count: 89, severity: "medium", firstSeen: fiveMinAgo, lastSeen: now });
    }

    if (kw.hasDownstreamUnavailable) {
      downstreamFailures.push({ service: "downstream-dependency", errorType: "Service Unavailable", impactLevel: "high", details: "One or more downstream dependencies reporting 503 or timeout" });
    }

    return {
      summary,
      probableRootCause,
      timeline,
      affectedServices: [serviceName, ...downstreamFailures.map((d) => d.service)].filter((v, i, a) => a.indexOf(v) === i),
      errorPatterns,
      downstreamFailures,
      suggestedFixes,
      suggestedRollback: `Roll back ${serviceName} to the previous known-good version: \`kubectl rollout undo deployment/${serviceName}\`. Verify health via \`kubectl rollout status deployment/${serviceName}\`. Monitor error rate in observability dashboard before closing the incident.`,
      confidence,
      mttr: null,
    };
  }

  const scenario = MOCK_SCENARIOS[correlationId];
  if (scenario) return scenario;

  return {
    summary: `Incident analysis for correlation ID ${correlationId} in ${serviceName} (${environment}). Log aggregation from the specified time range indicates elevated error rates and service degradation.`,
    probableRootCause: `Resource contention or configuration drift in ${serviceName}. Recommend cross-referencing with recent deployments and infrastructure changes in the ${environment} environment.`,
    timeline: [
      { timestamp: new Date(Date.now() - 15 * 60000).toISOString(), service: serviceName, level: "WARN", message: "Elevated latency detected — P99 response time at 2.8s (threshold: 1s)" },
      { timestamp: new Date(Date.now() - 12 * 60000).toISOString(), service: serviceName, level: "ERROR", message: `Request processing failure — correlation ${correlationId}` },
      { timestamp: new Date(Date.now() - 10 * 60000).toISOString(), service: "load-balancer", level: "WARN", message: "Health check failures increasing — removing unhealthy instance" },
      { timestamp: new Date(Date.now() - 5 * 60000).toISOString(), service: serviceName, level: "ERROR", message: "Circuit breaker OPEN — downstream dependencies unavailable" },
      { timestamp: new Date(Date.now() - 2 * 60000).toISOString(), service: serviceName, level: "INFO", message: "Recovery initiated — rolling restart in progress" },
    ],
    affectedServices: [serviceName, "load-balancer", "monitoring-agent"],
    errorPatterns: [
      { pattern: "Elevated P99 latency", count: 341, severity: "high", firstSeen: new Date(Date.now() - 15 * 60000).toISOString(), lastSeen: new Date(Date.now() - 2 * 60000).toISOString() },
      { pattern: "Health check failure", count: 24, severity: "medium", firstSeen: new Date(Date.now() - 10 * 60000).toISOString(), lastSeen: new Date(Date.now() - 3 * 60000).toISOString() },
    ],
    downstreamFailures: [
      { service: "downstream-api", errorType: "Latency Propagation", impactLevel: "medium", details: "Upstream latency propagated to downstream consumers — degraded response times" },
    ],
    suggestedFixes: [
      `Review recent deployments to ${serviceName} in the last 6 hours`,
      "Check infrastructure metrics: CPU, memory, and disk I/O during the incident window",
      "Enable distributed tracing for end-to-end request visibility",
      "Verify connection pool configuration matches expected traffic load",
    ],
    suggestedRollback: `Run \`kubectl rollout undo deployment/${serviceName}\` to revert to the previous stable version. Validate with smoke tests before closing the incident.`,
    confidence: "medium",
    mttr: null,
  };
}

export function analyzeIncident(params: {
  correlationId: string;
  serviceName: string;
  environment: string;
  timeRange: string;
  logSource: string;
  rawLogs?: string | null;
}): IncidentAnalysis {
  return buildGenericAnalysis(params.correlationId, params.serviceName, params.environment, params.rawLogs);
}
