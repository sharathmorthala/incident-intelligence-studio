import { type IncidentAnalysis, analyzeIncident } from "../incident-analyzer";
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
You will be given log data and incident context. Analyze the logs and return a structured JSON incident report.

Return ONLY valid JSON matching this exact structure:
{
  "summary": "string - 2-3 sentence incident summary",
  "probableRootCause": "string - detailed root cause explanation",
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
  "mttr": "string|null"
}

Rules:
- timeline should include the 10-15 most important events from the logs in chronological order
- errorPatterns should identify recurring error signatures
- suggestedFixes should be specific, actionable engineering recommendations (3-5 items)
- confidence should reflect how certain you are of the root cause
- mttr should estimate mean time to recover if determinable from logs, or null`;
}

function buildUserPrompt(context: LLMAnalysisContext): string {
  const logText = context.logs.length > 0
    ? context.logs.map((l) => `[${l.timestamp}] [${l.level}] [${l.service}] ${l.message}`).join("\n")
    : context.rawLogs ?? "No logs provided";

  return `Incident Context:
- Correlation ID: ${context.correlationId}
- Service: ${context.serviceName}
- Environment: ${context.environment}
- Time Range: ${context.timeRange ?? "Last 15 minutes"}
- Logs Retrieved: ${context.logs.length}

Log Data:
${logText.substring(0, 12000)}`;
}

async function callOpenAI(config: OpenAIConfig, context: LLMAnalysisContext): Promise<IncidentAnalysis> {
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
        { role: "user", content: buildUserPrompt(context) },
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

async function callAzureOpenAI(config: AzureOpenAIConfig, context: LLMAnalysisContext): Promise<IncidentAnalysis> {
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
        { role: "user", content: buildUserPrompt(context) },
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
    const logsText = context.logs.length > 0
      ? context.logs.map((l) => `[${l.timestamp}] [${l.level}] [${l.service}] ${l.message}`).join("\n")
      : context.rawLogs ?? null;

    return analyzeIncident({
      correlationId: context.correlationId,
      serviceName: context.serviceName,
      environment: context.environment,
      timeRange: context.timeRange,
      logSource: "opensearch",
      rawLogs: logsText,
    });
  }
}

export class OpenAIProviderImpl implements LLMProvider {
  name = "openai";
  constructor(private config: OpenAIConfig) {}

  async analyze(context: LLMAnalysisContext): Promise<IncidentAnalysis> {
    try {
      return await callOpenAI(this.config, context);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "OpenAI analysis failed, falling back to deterministic");
      return new DeterministicProvider().analyze(context);
    }
  }
}

export class AzureOpenAIProviderImpl implements LLMProvider {
  name = "azure_openai";
  constructor(private config: AzureOpenAIConfig) {}

  async analyze(context: LLMAnalysisContext): Promise<IncidentAnalysis> {
    try {
      return await callAzureOpenAI(this.config, context);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "Azure OpenAI analysis failed, falling back to deterministic");
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
