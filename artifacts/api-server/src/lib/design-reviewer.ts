export interface DesignFinding {
  category: "scalability" | "reliability" | "observability" | "security";
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  recommendation: string;
}

export interface DesignReview {
  findings: DesignFinding[];
  overallScore: number;
  summary: string;
  topRecommendations: string[];
}

const SCALABILITY_PATTERNS = [
  { keywords: ["single database", "one db", "single db", "single postgres"], finding: { title: "Single Database — Scalability Bottleneck", description: "Architecture relies on a single database instance. As write volume grows, this becomes a hard scaling ceiling and introduces a single point of failure for all read/write operations.", recommendation: "Introduce read replicas for read-heavy workloads. Evaluate database sharding or CQRS pattern for high-write scenarios. Consider connection pooling (PgBouncer) to maximize throughput.", severity: "high" as const } },
  { keywords: ["no cache", "without cache", "no redis", "no caching"], finding: { title: "Missing Caching Layer", description: "No caching strategy identified. All requests appear to hit primary data stores, creating unnecessary load and increased latency for frequently accessed data.", recommendation: "Implement Redis or Memcached for hot data. Cache API responses at the CDN level for public endpoints. Use cache-aside pattern with TTL-based invalidation.", severity: "medium" as const } },
  { keywords: ["synchronous", "sync call", "blocking call", "blocking request"], finding: { title: "Synchronous Coupling Between Services", description: "Services are tightly coupled via synchronous request-response calls. Long chains of synchronous calls increase tail latency and create cascading failure risk.", recommendation: "Introduce async messaging (Kafka, SQS, RabbitMQ) for non-critical paths. Reserve synchronous calls for operations requiring immediate consistency.", severity: "high" as const } },
  { keywords: ["no load balancer", "single instance", "single server", "one server"], finding: { title: "No Horizontal Scaling Path", description: "Architecture appears to rely on a single instance without a load balancing strategy. Cannot scale horizontally under load without a redesign.", recommendation: "Place services behind a load balancer (ALB, nginx, Envoy). Design stateless services to enable horizontal scaling. Use sticky sessions only when absolutely required.", severity: "critical" as const } },
  { keywords: ["monolith", "monolithic"], finding: { title: "Monolithic Architecture — Future Scalability Risk", description: "Monolithic architecture provides simplicity for early stages but creates risk as the system grows — deployments become risky, teams become bottlenecked, and scaling is all-or-nothing.", recommendation: "Consider a modular monolith approach as a first step: well-defined internal modules with clear boundaries. Extract high-traffic services first (auth, payments) when scaling pressure justifies it.", severity: "medium" as const } },
];

const RELIABILITY_PATTERNS = [
  { keywords: ["no circuit breaker", "without circuit breaker", "no retry", "no fallback"], finding: { title: "No Circuit Breaker / Retry Strategy", description: "No resilience patterns identified for inter-service communication. A single failing dependency can cascade and take down healthy services.", recommendation: "Implement circuit breaker pattern (Resilience4j, AWS Fault Injection Simulator) on all external calls. Add exponential backoff with jitter for retries. Set maximum retry counts.", severity: "high" as const } },
  { keywords: ["no backup", "no dr", "disaster recovery", "no failover"], finding: { title: "No Disaster Recovery Strategy", description: "No DR or backup strategy mentioned. A regional outage or data corruption event could result in significant data loss and extended downtime.", recommendation: "Define RTO and RPO targets. Implement automated database backups with tested restore procedures. Consider active-passive or active-active multi-region deployment for critical services.", severity: "critical" as const } },
  { keywords: ["spof", "single point of failure", "no redundancy", "no ha", "no high availability"], finding: { title: "Single Points of Failure Identified", description: "Architecture contains components without redundancy. Any failure in these components results in full service outage.", recommendation: "Eliminate SPOFs by deploying critical components with N+1 redundancy. Use managed services (RDS Multi-AZ, ElastiCache cluster mode) for infrastructure resilience.", severity: "critical" as const } },
  { keywords: ["no health check", "no heartbeat", "no readiness", "no liveness"], finding: { title: "Missing Health Check Strategy", description: "No health check endpoints or pod readiness/liveness probes defined. Degraded instances continue receiving traffic until manual intervention.", recommendation: "Implement /health (liveness) and /ready (readiness) endpoints on all services. Configure Kubernetes probes or load balancer health checks to auto-remove unhealthy instances.", severity: "high" as const } },
];

const OBSERVABILITY_PATTERNS = [
  { keywords: ["no logging", "console.log", "print statement", "no structured log"], finding: { title: "Insufficient Logging Strategy", description: "No structured logging strategy identified. Debugging production issues requires structured, correlated logs with consistent fields across all services.", recommendation: "Implement structured JSON logging (pino, winston, zerolog) with correlation IDs. Ship logs to a centralized aggregator (OpenSearch, Grafana Loki, CloudWatch). Define log levels and retention policies.", severity: "high" as const } },
  { keywords: ["no metrics", "no prometheus", "no monitoring", "no grafana", "no datadog"], finding: { title: "No Metrics Collection", description: "No metrics instrumentation identified. Cannot measure system performance, track SLOs, or detect anomalies without baseline metrics.", recommendation: "Instrument services with Prometheus metrics (RED: rate, errors, duration). Add business metrics for key user journeys. Set up Grafana dashboards and alert rules.", severity: "high" as const } },
  { keywords: ["no tracing", "no jaeger", "no zipkin", "no opentelemetry", "no distributed trace"], finding: { title: "No Distributed Tracing", description: "Without distributed tracing, identifying latency bottlenecks across service boundaries requires manual log correlation — extremely time-consuming during incidents.", recommendation: "Implement OpenTelemetry with auto-instrumentation. Ship traces to Jaeger, Zipkin, or AWS X-Ray. Add custom span attributes for business context.", severity: "medium" as const } },
  { keywords: ["no alert", "no pagerduty", "no on-call", "no sla", "no slo"], finding: { title: "No Alerting or On-Call Strategy", description: "No alerting rules or on-call process defined. Critical incidents may go undetected for extended periods, increasing customer impact.", recommendation: "Define SLOs for critical endpoints. Create alert rules for SLO violations, error rate spikes, and latency degradation. Integrate with PagerDuty or OpsGenie for on-call routing.", severity: "high" as const } },
];

const SECURITY_PATTERNS = [
  { keywords: ["no auth", "no authentication", "no authorization", "unauthenticated", "public api"], finding: { title: "Missing Authentication / Authorization", description: "No authentication or authorization strategy identified for API endpoints. Unrestricted access to data and operations poses significant security risk.", recommendation: "Implement OAuth 2.0 / OIDC for user authentication. Use JWT with short expiry and refresh token rotation. Apply RBAC or ABAC for fine-grained authorization.", severity: "critical" as const } },
  { keywords: ["no encryption", "http://", "plain http", "no https", "no tls"], finding: { title: "Unencrypted Communication", description: "Services communicating over HTTP without TLS. Data in transit is vulnerable to interception and man-in-the-middle attacks.", recommendation: "Enforce HTTPS for all external communication. Use mutual TLS (mTLS) for service-to-service communication within the cluster. Automate certificate rotation.", severity: "critical" as const } },
  { keywords: ["hardcoded secret", "hardcoded password", "hardcoded key", "secret in code", "password in config"], finding: { title: "Hardcoded Secrets Detected", description: "Credentials or secrets appear to be hardcoded in configuration or code. Exposed in version control, logs, or error messages these create severe security vulnerabilities.", recommendation: "Move all secrets to a secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager). Inject at runtime via environment variables. Audit git history for leaked credentials.", severity: "critical" as const } },
  { keywords: ["no rate limit", "no throttle", "no ddos", "unlimited request"], finding: { title: "No Rate Limiting / DDoS Protection", description: "No rate limiting identified on API endpoints. Services are vulnerable to abuse, DDoS attacks, and resource exhaustion from runaway clients.", recommendation: "Implement rate limiting at the API gateway layer (token bucket or sliding window). Add per-client quotas for authenticated endpoints. Use WAF for DDoS protection on public-facing endpoints.", severity: "high" as const } },
  { keywords: ["sql injection", "no input validation", "unvalidated input", "raw query"], finding: { title: "Input Validation Vulnerability", description: "No input validation strategy identified. Unvalidated inputs enable injection attacks (SQL, NoSQL, command injection) and can lead to data corruption or unauthorized access.", recommendation: "Validate all inputs with schema validation (Zod, Joi, class-validator). Use parameterized queries exclusively — never string-interpolated SQL. Apply Content Security Policy headers.", severity: "critical" as const } },
];

function scoreFromFindings(findings: DesignFinding[]): number {
  let deductions = 0;
  for (const f of findings) {
    if (f.severity === "critical") deductions += 20;
    else if (f.severity === "high") deductions += 12;
    else if (f.severity === "medium") deductions += 6;
    else deductions += 2;
  }
  return Math.max(0, 100 - deductions);
}

function matchKeywords(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function reviewDesign(params: {
  architectureNotes: string;
  systemName?: string | null;
}): DesignReview {
  const findings: DesignFinding[] = [];
  const notes = params.architectureNotes;
  const name = params.systemName ?? "Unnamed System";

  for (const { keywords, finding } of SCALABILITY_PATTERNS) {
    if (matchKeywords(notes, keywords)) {
      findings.push({ category: "scalability", ...finding });
    }
  }
  for (const { keywords, finding } of RELIABILITY_PATTERNS) {
    if (matchKeywords(notes, keywords)) {
      findings.push({ category: "reliability", ...finding });
    }
  }
  for (const { keywords, finding } of OBSERVABILITY_PATTERNS) {
    if (matchKeywords(notes, keywords)) {
      findings.push({ category: "observability", ...finding });
    }
  }
  for (const { keywords, finding } of SECURITY_PATTERNS) {
    if (matchKeywords(notes, keywords)) {
      findings.push({ category: "security", ...finding });
    }
  }

  if (findings.length === 0) {
    findings.push(
      { category: "observability", severity: "medium", title: "Observability Coverage Unknown", description: "The architecture description does not explicitly mention logging, metrics, or tracing strategy. Observability is critical for production reliability.", recommendation: "Add explicit sections for: structured logging strategy, metrics instrumentation (Prometheus/OpenTelemetry), distributed tracing, and alerting rules." },
      { category: "reliability", severity: "medium", title: "Resilience Patterns Not Specified", description: "No circuit breaker, retry, or timeout strategy mentioned. These patterns are essential for resilient microservice communication.", recommendation: "Document your resilience strategy: circuit breakers, retry policies with exponential backoff, timeout budgets, and graceful degradation modes." },
      { category: "scalability", severity: "low", title: "Scaling Strategy Not Documented", description: "Architecture notes do not specify horizontal/vertical scaling strategy, load balancing, or capacity planning.", recommendation: "Document expected load, scaling triggers (CPU/memory/RPS thresholds), and whether stateless services are deployed behind a load balancer." }
    );
  }

  const overallScore = scoreFromFindings(findings);

  const criticalCount = findings.filter((f) => f.severity === "critical").length;
  const highCount = findings.filter((f) => f.severity === "high").length;

  const summary =
    findings.length === 0
      ? `${name} architecture review found no critical issues. The design appears well-structured.`
      : `${name} architecture review identified ${findings.length} concern(s): ${criticalCount} critical, ${highCount} high severity. Overall design score: ${overallScore}/100. ${criticalCount > 0 ? "Critical issues must be addressed before production." : "Address high-severity items in the next sprint."}`;

  const topRecommendations = findings
    .filter((f) => f.severity === "critical" || f.severity === "high")
    .slice(0, 5)
    .map((f) => f.recommendation);

  if (topRecommendations.length === 0) {
    topRecommendations.push(
      "Add explicit SLO definitions for critical user journeys",
      "Document the data flow and trust boundaries between services",
      "Define runbook procedures for the top 3 failure modes"
    );
  }

  return { findings, overallScore, summary, topRecommendations };
}
