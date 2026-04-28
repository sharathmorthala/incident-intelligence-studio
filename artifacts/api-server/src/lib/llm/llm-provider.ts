import { type IncidentAnalysis, analyzeIncident } from "../incident-analyzer";
import { correlateLogs, correlateRawLogs, type LogCorrelation } from "../log-correlator";
import { logger } from "../logger";
import type { NormalizedLogEntry } from "../connectors/opensearch-connector";

export interface LLMAnalysisContext {
  correlationId: string;
  serviceName: string;
  environment: string;
  timeRange?: string;
  logs: NormalizedLogEntry[];
  rawLogs?: string | null;
}

export interface LLMProvider {
  name: string;
  analyze(context: LLMAnalysisContext): Promise<IncidentAnalysis>;
}

export interface OpenAIConfig {
  apiKey: string;
  modelName?: string;
}

export interface AzureOpenAIConfig {
  endpointUrl: string;
  deploymentName: string;
  apiVersion: string;
  apiKey: string;
}

function buildSystemPrompt(): string {
  return `You are an expert SRE (Site Reliability Engineer) analyzing production incidents.

You receive pre-analyzed log correlation data plus raw log lines. Your job is to synthesize the analysis into a comprehensive incident report.

Return ONLY valid JSON matching this exact structure — no markdown, no prose, just the JSON object:
{
  "summary": "string — 2-3 sentence executive summary of the incident",
  "probableRootCause": "string — detailed technical root cause with evidence from logs",
  "timeline": [
    { "timestamp": "ISO8601", "service": "string", "level": "INFO|WARN|ERROR|FATAL", "message": "string" }
  ],
  "affectedServices": ["string"],
  "errorPatterns": [
    { "pattern": "string", "count": number, "severity": "low|medium|high|critical", "firstSeen": "ISO8601", "lastSeen": "ISO8601" }
  ],
  "downstreamFailures": [
    { "service": "string", "errorType": "string", "impactLevel": "low|medium|high|critical", "details": "string" }
  ],
  "suggestedFixes": ["string"],
  "suggestedRollback": "string",
  "confidence": "high|medium|low",
  "mttr": "string|null",
  "propagationPath": ["string"],
  "firstFailureService": "string|null",
  "blastRadius": number,
  "cascadeDescription": "string",
  "observabilitySignals": [
    { "type": "latency_spike|error_rate_burst|retry_storm|circuit_breaker_open|connection_pool_exhaustion|memory_pressure", "service": "string", "description": "string", "severity": "low|medium|high|critical", "detectedAt": "ISO8601" }
  ],
  "serviceGroups": [
    { "service": "string", "logCount": number, "errorCount": number, "warnCount": number, "firstEventAt": "ISO8601", "lastEventAt": "ISO8601", "firstErrorAt": "ISO8601|null", "role": "origin|upstream|downstream|inferred" }
  ]
}

Rules:
- timeline: 10-20 most important events in chronological order
- propagationPath: ordered list of services in the failure cascade (origin first)
- firstFailureService: the first service that showed failure symptoms
- blastRadius: count of unique services with ERROR or FATAL events
- cascadeDescription: 1-2 sentence narrative of how the failure spread
- observabilitySignals: detected patterns like latency spikes, error bursts, circuit breakers
- serviceGroups: group log stats by service with upstream/downstream roles
- suggestedFixes: 3-5 specific, actionable engineering recommendations
- confidence: reflect certainty of root cause (high if clear evidence, low if ambiguous)
- mttr: estimate recovery time if determinable, otherwise null`;
}

function buildCorrelationContext(correlation: LogCorrelation): string {
  const parts: string[] = [];

  if (correlation.firstFailureService) {
    parts.push(`## Failure Origin\nFirst failure detected in: ${correlation.firstFailureService}`);
  }

  if (correlation.propagationPath.length > 1) {
    parts.push(`## Propagation Path\n${correlation.propagationPath.join(" → ")}`);
  }

  if (correlation.blastRadius > 0) {
    parts.push(`## Blast Radius\n${correlation.blastRadius} service${correlation.blastRadius !== 1 ? "s" : ""} affected`);
  }

  if (correlation.cascadeDescription) {
    parts.push(`## Cascade Summary\n${correlation.cascadeDescription}`);
  }

  if (correlation.groupedByService.length > 0) {
    const svcTable = correlation.groupedByService
      .map((g) => `  - ${g.service} [${g.role}]: ${g.logCount} logs, ${g.errorCount} errors, ${g.warnCount} warnings. First error: ${g.firstErrorAt ?? "none"}`)
      .join("\n");
    parts.push(`## Service Groups\n${svcTable}`);
  }

  if (correlation.detectedPatterns.length > 0) {
    const patterns = correlation.detectedPatterns
      .map((p) => `  - [${p.severity.toUpperCase()}] ${p.pattern}: ${p.count} occurrences in ${p.affectedServices.join(", ")}`)
      .join("\n");
    parts.push(`## Detected Patterns\n${patterns}`);
  }

  if (correlation.observabilitySignals.length > 0) {
    const signals = correlation.observabilitySignals
      .map((s) => `  - [${s.severity.toUpperCase()}] ${s.type} in ${s.service}: ${s.description}`)
      .join("\n");
    parts.push(`## Observability Signals\n${signals}`);
  }

  return parts.join("\n\n");
}

function buildUserPrompt(context: LLMAnalysisContext, correlation: LogCorrelation): string {
  const logText = correlation.sortedTimeline.length > 0
    ? correlation.sortedTimeline
        .map((l) => `[${l.timestamp}] [${l.level}] [${l.service}] ${l.message}`)
        .join("\n")
    : context.rawLogs ?? "No logs provided";

  const correlationContext = buildCorrelationContext(correlation);

  return `## Incident Context
- Correlation ID: ${context.correlationId}
- Origin Service: ${context.serviceName}
- Environment: ${context.environment}
- Time Range: ${context.timeRange ?? "Last 15 minutes"}
- Total Logs Analyzed: ${correlation.sortedTimeline.length || "unknown"}

${correlationContext}

## Raw Log Timeline (chronological)
${logText.substring(0, 14000)}`;
}

function buildCorrelation(context: LLMAnalysisContext): LogCorrelation {
  if (context.logs.length > 0) {
    return correlateLogs(context.logs, context.serviceName);
  }
  if (context.rawLogs?.trim()) {
    return correlateRawLogs(context.rawLogs, context.serviceName);
  }
  return correlateLogs([], context.serviceName);
}

async function callOpenAI(config: OpenAIConfig, context: LLMAnalysisContext, correlation: LogCorrelation): Promise<IncidentAnalysis> {
  const model = config.modelName ?? "gpt-4o";
  const url = "https://api.openai.com/v1/chat/completions";

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(context, correlation) },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned empty response");

  return JSON.parse(content) as IncidentAnalysis;
}

async function callAzureOpenAI(config: AzureOpenAIConfig, context: LLMAnalysisContext, correlation: LogCorrelation): Promise<IncidentAnalysis> {
  const baseUrl = config.endpointUrl.replace(/\/$/, "");
  const url = `${baseUrl}/openai/deployments/${config.deploymentName}/chat/completions?api-version=${config.apiVersion}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": config.apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(context, correlation) },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Azure OpenAI error ${response.status}: ${err.substring(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Azure OpenAI returned empty response");

  return JSON.parse(content) as IncidentAnalysis;
}

export class DeterministicProvider implements LLMProvider {
  name = "deterministic";

  async analyze(context: LLMAnalysisContext): Promise<IncidentAnalysis> {
    return analyzeIncident({
      correlationId: context.correlationId,
      serviceName: context.serviceName,
      environment: context.environment,
      timeRange: context.timeRange,
      logSource: "opensearch",
      rawLogs: context.rawLogs ?? null,
      structuredLogs: context.logs,
    });
  }
}

export class OpenAIProviderImpl implements LLMProvider {
  name = "openai";
  constructor(private config: OpenAIConfig) {}

  async analyze(context: LLMAnalysisContext): Promise<IncidentAnalysis> {
    const correlation = buildCorrelation(context);
    try {
      return await callOpenAI(this.config, context, correlation);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "OpenAI analysis failed, falling back to deterministic"
      );
      return new DeterministicProvider().analyze(context);
    }
  }
}

export class AzureOpenAIProviderImpl implements LLMProvider {
  name = "azure_openai";
  constructor(private config: AzureOpenAIConfig) {}

  async analyze(context: LLMAnalysisContext): Promise<IncidentAnalysis> {
    const correlation = buildCorrelation(context);
    try {
      return await callAzureOpenAI(this.config, context, correlation);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : String(err) },
        "Azure OpenAI analysis failed, falling back to deterministic"
      );
      return new DeterministicProvider().analyze(context);
    }
  }
}

export function getLLMProvider(
  openaiConfig?: OpenAIConfig | null,
  azureConfig?: AzureOpenAIConfig | null
): LLMProvider {
  if (azureConfig?.endpointUrl && azureConfig?.apiKey && azureConfig?.deploymentName) {
    logger.info("Using Azure OpenAI provider for analysis");
    return new AzureOpenAIProviderImpl(azureConfig);
  }
  if (openaiConfig?.apiKey) {
    logger.info("Using OpenAI provider for analysis");
    return new OpenAIProviderImpl(openaiConfig);
  }
  return new DeterministicProvider();
}
