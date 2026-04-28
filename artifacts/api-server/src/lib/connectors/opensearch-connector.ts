import { logger } from "../logger";

export interface NormalizedLogEntry {
  timestamp: string;
  service: string;
  level: string;
  message: string;
  correlationId?: string;
  traceId?: string;
  raw: Record<string, unknown>;
}

export interface OpenSearchConfig {
  endpointUrl: string;
  indexPattern: string;
  username?: string;
  apiKey?: string;
  tlsEnabled?: boolean;
}

export interface QueryOptions {
  correlationId: string;
  serviceName?: string;
  environment?: string;
  timeRange?: string;
  maxResults?: number;
}

export interface ConnectorResult {
  success: boolean;
  logs: NormalizedLogEntry[];
  total: number;
  error?: string;
}

function buildAuthHeaders(config: OpenSearchConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  if (config.apiKey) {
    headers["Authorization"] = `ApiKey ${config.apiKey}`;
  } else if (config.username) {
    const b64 = Buffer.from(`${config.username}:`).toString("base64");
    headers["Authorization"] = `Basic ${b64}`;
  }

  return headers;
}

function parseTimeRange(timeRange?: string): string {
  if (!timeRange) return "now-15m";
  const lower = timeRange.toLowerCase();
  if (lower.includes("1h") || lower.includes("1 hour")) return "now-1h";
  if (lower.includes("6h")) return "now-6h";
  if (lower.includes("24h") || lower.includes("1d") || lower.includes("1 day")) return "now-24h";
  if (lower.includes("7d")) return "now-7d";
  if (lower.includes("30m")) return "now-30m";
  if (lower.includes("5m")) return "now-5m";
  return "now-15m";
}

function normalizeHit(hit: Record<string, unknown>): NormalizedLogEntry {
  const src = (hit["_source"] as Record<string, unknown>) ?? {};

  const timestamp =
    (src["@timestamp"] as string) ??
    (src["timestamp"] as string) ??
    (src["time"] as string) ??
    new Date().toISOString();

  const service =
    (src["service"] as string) ??
    (src["service.name"] as string) ??
    (src["kubernetes.container.name"] as string) ??
    "unknown-service";

  const rawLevel =
    (src["level"] as string) ??
    (src["log.level"] as string) ??
    (src["severity"] as string) ??
    "INFO";

  const level = rawLevel.toUpperCase();

  const message =
    (src["message"] as string) ??
    (src["msg"] as string) ??
    (src["log"] as string) ??
    JSON.stringify(src).substring(0, 200);

  const correlationId =
    (src["correlationId"] as string) ??
    (src["correlation_id"] as string) ??
    (src["traceId"] as string) ??
    (src["trace.id"] as string) ??
    undefined;

  const traceId =
    (src["traceId"] as string) ??
    (src["trace.id"] as string) ??
    undefined;

  return {
    timestamp,
    service,
    level,
    message,
    correlationId,
    traceId,
    raw: src,
  };
}

export async function queryOpenSearch(
  config: OpenSearchConfig,
  options: QueryOptions
): Promise<ConnectorResult> {
  const { correlationId, serviceName, environment, timeRange, maxResults = 200 } = options;
  const gteTime = parseTimeRange(timeRange);

  const mustClauses: unknown[] = [
    {
      bool: {
        should: [
          { match: { correlationId } },
          { match: { correlation_id: correlationId } },
          { match: { "traceId": correlationId } },
          { match: { "trace.id": correlationId } },
        ],
        minimum_should_match: 1,
      },
    },
    {
      range: {
        "@timestamp": { gte: gteTime },
      },
    },
  ];

  if (serviceName) {
    mustClauses.push({
      bool: {
        should: [
          { match: { service: serviceName } },
          { match: { "service.name": serviceName } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  if (environment) {
    mustClauses.push({
      bool: {
        should: [
          { match: { environment } },
          { match: { env: environment } },
        ],
        minimum_should_match: 1,
      },
    });
  }

  const query = {
    query: { bool: { must: mustClauses } },
    size: maxResults,
    sort: [{ "@timestamp": { order: "asc" } }],
  };

  const baseUrl = config.endpointUrl.replace(/\/$/, "");
  const indexPattern = config.indexPattern || "logs-*";
  const searchUrl = `${baseUrl}/${indexPattern}/_search`;

  const headers = buildAuthHeaders(config);

  try {
    const response = await fetch(searchUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(query),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.warn({ status: response.status, url: searchUrl }, "OpenSearch query returned non-200");
      return {
        success: false,
        logs: [],
        total: 0,
        error: `OpenSearch returned ${response.status}: ${body.substring(0, 200)}`,
      };
    }

    const data = (await response.json()) as {
      hits: { total: { value: number } | number; hits: Record<string, unknown>[] };
    };

    const hits = data.hits?.hits ?? [];
    const total =
      typeof data.hits?.total === "number"
        ? data.hits.total
        : (data.hits?.total as { value: number })?.value ?? 0;

    const logs = hits.map(normalizeHit);

    logger.info({ correlationId, total, returned: logs.length }, "OpenSearch query succeeded");

    return { success: true, logs, total };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message, url: searchUrl }, "OpenSearch connector error");
    return {
      success: false,
      logs: [],
      total: 0,
      error: `Connection error: ${message}`,
    };
  }
}

export async function testOpenSearchConnection(config: OpenSearchConfig): Promise<{ ok: boolean; message: string; latencyMs: number }> {
  const baseUrl = config.endpointUrl.replace(/\/$/, "");
  const healthUrl = `${baseUrl}/_cluster/health`;
  const headers = buildAuthHeaders(config);
  const start = Date.now();

  try {
    const response = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(8000),
    });

    const latencyMs = Date.now() - start;

    if (!response.ok) {
      return { ok: false, message: `Cluster health returned HTTP ${response.status}`, latencyMs };
    }

    const data = (await response.json()) as { status?: string; cluster_name?: string };
    const status = data.status ?? "unknown";
    const clusterName = data.cluster_name ?? "unknown";

    if (status === "red") {
      return { ok: false, message: `Cluster status is RED — check cluster health (${clusterName})`, latencyMs };
    }

    return { ok: true, message: `Connected to cluster "${clusterName}" — status: ${status} (${latencyMs}ms)`, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Connection failed: ${message}`, latencyMs };
  }
}
