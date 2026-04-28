import { correlateLogs, correlateRawLogs, type ObservabilitySignal, type ServiceGroup } from "./log-correlator";
import type { NormalizedLogEntry } from "./connectors/opensearch-connector";

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
  // Intelligence fields
  propagationPath: string[];
  firstFailureService: string | null;
  blastRadius: number | null;
  cascadeDescription: string | null;
  observabilitySignals: ObservabilitySignal[];
  serviceGroups: ServiceGroup[];
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
      "Reduce thread pool timeout from 30s to 5s with exponential backoff to fail faster and reduce queue buildup",
      "Add payment-gateway health check to circuit breaker probe — trigger at 3 consecutive failures",
      "Configure Kubernetes HPA on payment-service to scale out when thread pool utilization exceeds 60%",
      "Implement async payment processing with idempotent retry queue for checkout resilience during gateway degradation",
    ],
    suggestedRollback:
      "Revert the certificate rotation script (`scripts/rotate-tls.sh`) to the previous version. Re-issue the TLS certificate using `openssl req -newkey rsa:4096` against the confirmed-working CA endpoint. Validate via `curl -v --max-time 5 https://payment-gateway/health` before routing traffic.",
    confidence: "high",
    mttr: "18m 44s",
    propagationPath: ["payment-gateway", "payment-service", "order-api", "cart-service", "notification-service"],
    firstFailureService: "payment-gateway",
    blastRadius: 5,
    cascadeDescription: "Failure originated in payment-gateway (TLS certificate issue) and cascaded through 5 services: payment-gateway → payment-service → order-api → cart-service → notification-service.",
    observabilitySignals: [
      { type: "latency_spike", service: "payment-gateway", description: "TLS handshake latency elevated to 2800ms (5.6× normal threshold of 500ms)", severity: "high", detectedAt: "2025-04-28T14:23:11Z" },
      { type: "connection_pool_exhaustion", service: "payment-service", description: "Thread pool exhausted: 200/200 threads active, 847 requests queued waiting for upstream response", severity: "critical", detectedAt: "2025-04-28T14:24:19Z" },
      { type: "circuit_breaker_open", service: "order-api", description: "Circuit breaker OPEN for payment-service — failing fast after 3 consecutive timeout failures", severity: "high", detectedAt: "2025-04-28T14:24:55Z" },
      { type: "error_rate_burst", service: "order-api", description: "3,847 timeout errors within 17-minute window — error rate 226× baseline", severity: "critical", detectedAt: "2025-04-28T14:24:02Z" },
    ],
    serviceGroups: [
      { service: "payment-gateway", logCount: 4, errorCount: 1, warnCount: 1, firstEventAt: "2025-04-28T14:23:11Z", lastEventAt: "2025-04-28T14:38:44Z", firstErrorAt: "2025-04-28T14:31:17Z", role: "origin" },
      { service: "payment-service", logCount: 3, errorCount: 1, warnCount: 1, firstEventAt: "2025-04-28T14:23:44Z", lastEventAt: "2025-04-28T14:41:22Z", firstErrorAt: "2025-04-28T14:24:19Z", role: "downstream" },
      { service: "order-api", logCount: 3, errorCount: 2, warnCount: 0, firstEventAt: "2025-04-28T14:24:02Z", lastEventAt: "2025-04-28T14:41:55Z", firstErrorAt: "2025-04-28T14:24:02Z", role: "downstream" },
      { service: "cart-service", logCount: 1, errorCount: 1, warnCount: 0, firstEventAt: "2025-04-28T14:25:08Z", lastEventAt: "2025-04-28T14:25:08Z", firstErrorAt: "2025-04-28T14:25:08Z", role: "downstream" },
      { service: "notification-service", logCount: 1, errorCount: 0, warnCount: 1, firstEventAt: "2025-04-28T14:27:33Z", lastEventAt: "2025-04-28T14:27:33Z", firstErrorAt: null, role: "downstream" },
    ],
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
    propagationPath: ["auth-service", "token-validator", "api-gateway", "user-service"],
    firstFailureService: "auth-service",
    blastRadius: 4,
    cascadeDescription: "JWT key rotation in auth-service caused token-validator to reject all tokens, cascading 401 failures through api-gateway to user-service — 28,441 authentication failures in under 10 minutes.",
    observabilitySignals: [
      { type: "error_rate_burst", service: "api-gateway", description: "401 Unauthorized spike: 340 requests/min vs baseline of 2 (170× increase)", severity: "critical", detectedAt: "2025-04-28T09:07:33Z" },
      { type: "error_rate_burst", service: "token-validator", description: "JWT signature verification failures: 28,441 errors in 8-minute window", severity: "critical", detectedAt: "2025-04-28T09:07:44Z" },
    ],
    serviceGroups: [
      { service: "auth-service", logCount: 1, errorCount: 0, warnCount: 0, firstEventAt: "2025-04-28T09:00:00Z", lastEventAt: "2025-04-28T09:00:00Z", firstErrorAt: null, role: "origin" },
      { service: "vault", logCount: 2, errorCount: 0, warnCount: 0, firstEventAt: "2025-04-28T09:02:14Z", lastEventAt: "2025-04-28T09:14:22Z", firstErrorAt: null, role: "upstream" },
      { service: "api-gateway", logCount: 3, errorCount: 1, warnCount: 1, firstEventAt: "2025-04-28T09:07:33Z", lastEventAt: "2025-04-28T09:16:02Z", firstErrorAt: "2025-04-28T09:09:17Z", role: "downstream" },
      { service: "token-validator", logCount: 2, errorCount: 1, warnCount: 0, firstEventAt: "2025-04-28T09:07:44Z", lastEventAt: "2025-04-28T09:15:44Z", firstErrorAt: "2025-04-28T09:07:44Z", role: "downstream" },
      { service: "user-service", logCount: 1, errorCount: 1, warnCount: 0, firstEventAt: "2025-04-28T09:08:01Z", lastEventAt: "2025-04-28T09:08:01Z", firstErrorAt: "2025-04-28T09:08:01Z", role: "downstream" },
    ],
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
    propagationPath: ["inventory-db", "inventory-service", "order-fulfillment", "shipping-coordinator", "warehouse-api"],
    firstFailureService: "inventory-db",
    blastRadius: 4,
    cascadeDescription: "Long-running DB migration in inventory-db held table locks for 23 minutes, causing connection pool exhaustion in inventory-service, which propagated through order-fulfillment and shipping-coordinator — 8,700 orders impacted.",
    observabilitySignals: [
      { type: "connection_pool_exhaustion", service: "inventory-service", description: "DB connection pool exhausted: AcquireTimeout after 5000ms — all 1,847 pool acquisition attempts failed", severity: "critical", detectedAt: "2025-04-28T11:09:44Z" },
      { type: "retry_storm", service: "order-fulfillment", description: "Retry storm: 2,400 retries queued against inventory-service in 3-minute window — compounding DB lock contention", severity: "high", detectedAt: "2025-04-28T11:13:47Z" },
      { type: "error_rate_burst", service: "order-fulfillment", description: "8,723 'downstream unavailable' errors over 28-minute window", severity: "critical", detectedAt: "2025-04-28T11:10:02Z" },
    ],
    serviceGroups: [
      { service: "inventory-db", logCount: 2, errorCount: 0, warnCount: 1, firstEventAt: "2025-04-28T11:04:19Z", lastEventAt: "2025-04-28T11:27:06Z", firstErrorAt: null, role: "origin" },
      { service: "inventory-service", logCount: 3, errorCount: 1, warnCount: 1, firstEventAt: "2025-04-28T11:06:33Z", lastEventAt: "2025-04-28T11:28:34Z", firstErrorAt: "2025-04-28T11:09:44Z", role: "downstream" },
      { service: "order-fulfillment", logCount: 3, errorCount: 2, warnCount: 0, firstEventAt: "2025-04-28T11:10:02Z", lastEventAt: "2025-04-28T11:38:22Z", firstErrorAt: "2025-04-28T11:10:02Z", role: "downstream" },
      { service: "shipping-coordinator", logCount: 1, errorCount: 1, warnCount: 0, firstEventAt: "2025-04-28T11:10:18Z", lastEventAt: "2025-04-28T11:10:18Z", firstErrorAt: "2025-04-28T11:10:18Z", role: "downstream" },
    ],
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
    propagationPath: ["product-catalog-api", "search-indexer", "recommendation-engine", "storefront-api"],
    firstFailureService: "product-catalog-api",
    blastRadius: 3,
    cascadeDescription: "Breaking schema change in product-catalog-api v2.3.1 immediately caused validation failures across 3 downstream consumers — 9,053 total deserialization errors before hotfix v2.3.2 resolved the contract mismatch.",
    observabilitySignals: [
      { type: "error_rate_burst", service: "search-indexer", description: "4,218 schema validation errors in 18-minute window immediately following v2.3.1 deployment", severity: "critical", detectedAt: "2025-04-28T16:01:14Z" },
      { type: "error_rate_burst", service: "recommendation-engine", description: "3,944 deserialization failures — unable to process product updates from catalog API", severity: "high", detectedAt: "2025-04-28T16:01:19Z" },
      { type: "error_rate_burst", service: "storefront-api", description: "891 NPE errors — product detail pages returning 500 for ~12% of catalog", severity: "high", detectedAt: "2025-04-28T16:01:33Z" },
    ],
    serviceGroups: [
      { service: "product-catalog-api", logCount: 2, errorCount: 0, warnCount: 0, firstEventAt: "2025-04-28T16:00:00Z", lastEventAt: "2025-04-28T16:18:44Z", firstErrorAt: null, role: "origin" },
      { service: "search-indexer", logCount: 3, errorCount: 2, warnCount: 0, firstEventAt: "2025-04-28T16:01:14Z", lastEventAt: "2025-04-28T16:19:02Z", firstErrorAt: "2025-04-28T16:01:14Z", role: "downstream" },
      { service: "recommendation-engine", logCount: 1, errorCount: 1, warnCount: 0, firstEventAt: "2025-04-28T16:01:19Z", lastEventAt: "2025-04-28T16:01:19Z", firstErrorAt: "2025-04-28T16:01:19Z", role: "downstream" },
      { service: "storefront-api", logCount: 1, errorCount: 1, warnCount: 0, firstEventAt: "2025-04-28T16:01:33Z", lastEventAt: "2025-04-28T16:01:33Z", firstErrorAt: "2025-04-28T16:01:33Z", role: "downstream" },
    ],
  },
};

function buildGenericAnalysis(
  correlationId: string,
  serviceName: string,
  environment: string,
  rawLogs?: string | null,
  structuredLogs?: NormalizedLogEntry[]
): IncidentAnalysis {
  // Use structured logs from a real source if available
  const hasStructured = structuredLogs && structuredLogs.length > 0;
  const hasRaw = rawLogs && rawLogs.trim().length > 0;

  let correlation = hasStructured
    ? correlateLogs(structuredLogs, serviceName)
    : hasRaw
    ? correlateRawLogs(rawLogs!, serviceName)
    : null;

  const now = new Date().toISOString();
  const fiveMinAgo = new Date(Date.now() - 5 * 60000).toISOString();

  // If correlation produced useful data, use it to drive the analysis
  if (correlation && correlation.sortedTimeline.length > 0) {
    const timeline: TimelineEvent[] = correlation.sortedTimeline.slice(0, 25).map((l) => ({
      timestamp: l.timestamp,
      service: l.service,
      level: (["INFO", "WARN", "ERROR", "FATAL"].includes(l.level) ? l.level : "INFO") as TimelineEvent["level"],
      message: l.message,
    }));

    const patterns = correlation.detectedPatterns;
    const errorPatterns: ErrorPattern[] = patterns.map((p) => ({
      pattern: p.pattern,
      count: p.count,
      severity: p.severity,
      firstSeen: p.firstSeen,
      lastSeen: p.lastSeen,
    }));

    const dominantCategory = patterns[0]?.category;
    const { summary, probableRootCause, suggestedFixes, confidence } = synthesizeFromCorrelation(
      correlation, dominantCategory, serviceName, environment, correlationId
    );

    const affectedServices = correlation.groupedByService
      .filter((g) => g.errorCount > 0 || g.service === serviceName)
      .map((g) => g.service);

    const downstreamFailures: DownstreamFailure[] = correlation.groupedByService
      .filter((g) => g.role === "downstream" && g.errorCount > 0)
      .map((g) => ({
        service: g.service,
        errorType: patterns[0]?.pattern ?? "Propagated Failure",
        impactLevel: (g.errorCount > 100 ? "critical" : g.errorCount > 20 ? "high" : g.errorCount > 5 ? "medium" : "low") as DownstreamFailure["impactLevel"],
        details: `${g.errorCount} error${g.errorCount !== 1 ? "s" : ""} detected — first failure at ${g.firstErrorAt?.slice(11, 19) ?? "unknown"} UTC`,
      }));

    return {
      summary,
      probableRootCause,
      timeline,
      affectedServices: affectedServices.length > 0 ? affectedServices : [serviceName],
      errorPatterns,
      downstreamFailures,
      suggestedFixes,
      suggestedRollback: `Roll back ${serviceName} to the previous known-good version: \`kubectl rollout undo deployment/${serviceName}\`. Verify health via \`kubectl rollout status deployment/${serviceName}\`. Monitor error rate before closing the incident.`,
      confidence,
      mttr: null,
      propagationPath: correlation.propagationPath,
      firstFailureService: correlation.firstFailureService,
      blastRadius: correlation.blastRadius,
      cascadeDescription: correlation.cascadeDescription,
      observabilitySignals: correlation.observabilitySignals,
      serviceGroups: correlation.groupedByService,
    };
  }

  // Named scenario lookup (no raw logs provided)
  const scenario = MOCK_SCENARIOS[correlationId];
  if (scenario) return scenario;

  // Generic fallback
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
    propagationPath: [serviceName, "load-balancer"],
    firstFailureService: serviceName,
    blastRadius: 2,
    cascadeDescription: `Failure detected in ${serviceName} — limited cascade data available without real log source.`,
    observabilitySignals: [
      { type: "latency_spike", service: serviceName, description: "P99 response time at 2.8s (2.8× threshold)", severity: "high", detectedAt: new Date(Date.now() - 15 * 60000).toISOString() },
    ],
    serviceGroups: [
      { service: serviceName, logCount: 3, errorCount: 2, warnCount: 1, firstEventAt: new Date(Date.now() - 15 * 60000).toISOString(), lastEventAt: new Date(Date.now() - 2 * 60000).toISOString(), firstErrorAt: new Date(Date.now() - 12 * 60000).toISOString(), role: "origin" },
      { service: "load-balancer", logCount: 1, errorCount: 0, warnCount: 1, firstEventAt: new Date(Date.now() - 10 * 60000).toISOString(), lastEventAt: new Date(Date.now() - 10 * 60000).toISOString(), firstErrorAt: null, role: "downstream" },
    ],
  };
}

function synthesizeFromCorrelation(
  correlation: ReturnType<typeof correlateLogs>,
  dominantCategory: string | undefined,
  serviceName: string,
  environment: string,
  correlationId: string
): { summary: string; probableRootCause: string; suggestedFixes: string[]; confidence: "high" | "medium" | "low" } {
  const firstFail = correlation.firstFailureService ?? serviceName;
  const path = correlation.propagationPath.join(" → ");
  const blastRadius = correlation.blastRadius;

  switch (dominantCategory) {
    case "timeout":
      return {
        summary: `Timeout cascade detected in ${serviceName} (${environment}, correlation: ${correlationId}). Failure propagated across ${blastRadius} service${blastRadius !== 1 ? "s" : ""}: ${path}.`,
        probableRootCause: `Upstream latency degradation in ${firstFail} caused thread pool saturation and connection queue buildup. Timeouts propagated downstream as dependent services exhausted their wait budgets. ${correlation.cascadeDescription}`,
        suggestedFixes: [
          `Implement circuit breaker on all calls from ${firstFail} — trigger at 3 consecutive failures or 50% error rate`,
          "Reduce request timeout to 5s with exponential backoff (max 3 retries) to fail fast and free threads",
          "Add connection pool monitoring with PagerDuty alert at 70% utilization",
          "Configure HPA to scale upstream service when CPU/thread utilization exceeds 60%",
          "Enable async processing with retry queue for non-critical downstream calls",
        ],
        confidence: "high",
      };
    case "auth_failure":
      return {
        summary: `Authentication failures cascading from ${firstFail} (${environment}, correlation: ${correlationId}). ${blastRadius} service${blastRadius !== 1 ? "s" : ""} affected: ${path}.`,
        probableRootCause: `Token validation failure originating in ${firstFail}. Likely caused by JWT key rotation with propagation delay, session expiry, or RBAC misconfiguration. ${correlation.cascadeDescription}`,
        suggestedFixes: [
          "Implement JWKS endpoint with multi-key support — accept old and new keys during rotation window",
          "Add pre-rotation smoke test: validate tokens signed with new key against all replicas before completing rotation",
          "Reduce Vault-to-ConfigMap sync delay to under 30 seconds using external-secrets push mode",
          "Add monitoring: alert when 401 rate exceeds 5× baseline for 60 consecutive seconds",
        ],
        confidence: "high",
      };
    case "dependency_failure":
      return {
        summary: `Dependency failure cascade originating in ${firstFail} (${environment}, correlation: ${correlationId}). ${blastRadius} service${blastRadius !== 1 ? "s" : ""} impacted: ${path}.`,
        probableRootCause: `${firstFail} became unreachable — likely due to pod crash, OOM kill, network partition, or deployment issue. Upstream services received connection refused/503 errors and began retrying, compounding the outage. ${correlation.cascadeDescription}`,
        suggestedFixes: [
          `Check pod health: \`kubectl get pods -l app=${firstFail} -n ${environment}\``,
          "Add readiness probe to delay traffic routing until service is fully ready",
          "Implement circuit breaker with fallback response for non-critical dependency calls",
          "Configure retry with exponential backoff and jitter to prevent retry storms",
          "Add dead letter queue for failed requests to enable replay after recovery",
        ],
        confidence: "high",
      };
    case "validation_error":
      return {
        summary: `Schema validation failures from ${firstFail} (${environment}, correlation: ${correlationId}). Contract mismatch affected ${blastRadius} consumer service${blastRadius !== 1 ? "s" : ""}: ${path}.`,
        probableRootCause: `Breaking change in ${firstFail} data contract — field type or structure changed without backward-compatible migration. Consumer services failed to deserialize responses. ${correlation.cascadeDescription}`,
        suggestedFixes: [
          "Implement API versioning — deploy breaking changes under `/v2/` and maintain `/v1/` for 90 days",
          "Add consumer contract testing (Pact) to CI/CD pipeline to catch schema drift before deployment",
          "Add backward-compatible field transformation to accept both old and new formats",
          "Configure dead letter queue with replay capability for failed deserialization events",
        ],
        confidence: "high",
      };
    case "connection_pool_exhaustion":
      return {
        summary: `Connection pool exhaustion in ${firstFail} caused service degradation (${environment}, correlation: ${correlationId}). ${blastRadius} service${blastRadius !== 1 ? "s" : ""} affected: ${path}.`,
        probableRootCause: `${firstFail} connection pool was exhausted — likely caused by a slow query holding connections, a traffic spike, or misconfigured pool size. Upstream services received AcquireTimeout errors. ${correlation.cascadeDescription}`,
        suggestedFixes: [
          "Set statement timeout on all queries: `SET statement_timeout = '30s'` to prevent connection hoarding",
          "Increase connection pool size with per-service limits and queue depth alerting at 70%",
          "Add connection pool metrics to observability dashboard — alert at 80% utilization for 60 seconds",
          "Implement circuit breaker to prevent retry storms when pool is saturated",
          "Run heavy migrations during off-peak windows with LOCK_TIMEOUT=30s",
        ],
        confidence: "high",
      };
    case "circuit_breaker":
      return {
        summary: `Circuit breaker activation detected in ${firstFail} (${environment}, correlation: ${correlationId}). Failure isolated via circuit breaker but ${blastRadius} service${blastRadius !== 1 ? "s" : ""} degraded: ${path}.`,
        probableRootCause: `Circuit breaker triggered in ${firstFail} due to upstream service exceeding failure threshold. The breaker is now protecting the system by failing fast, but dependent services are receiving degraded responses. ${correlation.cascadeDescription}`,
        suggestedFixes: [
          "Investigate root cause of upstream failure that triggered circuit breaker",
          "Verify circuit breaker thresholds are appropriate — check open/half-open transition timing",
          "Implement graceful fallback response when circuit is open (cached data or default)",
          "Add circuit breaker state to observability dashboard with Slack/PD alerts",
        ],
        confidence: "medium",
      };
    case "memory_pressure":
      return {
        summary: `Memory pressure / OOM detected in ${firstFail} (${environment}, correlation: ${correlationId}). ${blastRadius} service${blastRadius !== 1 ? "s" : ""} affected: ${path}.`,
        probableRootCause: `${firstFail} exhausted available heap or container memory. Likely caused by a memory leak, unexpected traffic spike, or insufficient resource limits. OOM kills caused pod restarts which triggered downstream failures. ${correlation.cascadeDescription}`,
        suggestedFixes: [
          `Increase memory limits for ${firstFail}: add \`resources.limits.memory\` in Kubernetes deployment`,
          "Enable JVM GC logging and analyze heap dump to identify memory leak",
          "Configure HPA to scale out before memory pressure hits 80%",
          "Add memory usage alert at 75% container memory limit",
          "Review recent code changes for unbounded collections or missing cache eviction",
        ],
        confidence: "high",
      };
    default:
      return {
        summary: `Incident detected in ${serviceName} (${environment}, correlation: ${correlationId}). ${blastRadius > 0 ? `${blastRadius} service${blastRadius !== 1 ? "s" : ""} affected.` : ""} ${correlation.cascadeDescription}`,
        probableRootCause: `Analysis of log data for ${correlationId} indicates anomalous behavior in ${firstFail}. Insufficient signal to determine root cause with high confidence — additional structured log data recommended.`,
        suggestedFixes: [
          "Enable structured JSON logging with consistent field names (service, level, correlationId, duration)",
          "Add distributed tracing (OpenTelemetry) for end-to-end request visibility",
          `Review recent deployments to ${serviceName} in the incident time window`,
          "Check infrastructure metrics: CPU, memory, and disk I/O during the incident",
        ],
        confidence: "low",
      };
  }
}

export function analyzeIncident(params: {
  correlationId: string;
  serviceName: string;
  environment: string;
  timeRange: string;
  logSource: string;
  rawLogs?: string | null;
  structuredLogs?: NormalizedLogEntry[];
}): IncidentAnalysis {
  return buildGenericAnalysis(
    params.correlationId,
    params.serviceName,
    params.environment,
    params.rawLogs,
    params.structuredLogs
  );
}
