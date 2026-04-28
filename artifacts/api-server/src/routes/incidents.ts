import { Router, type IRouter } from "express";
import { db, incidentsTable, integrationConfigsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  AnalyzeIncidentBody,
  AnalyzeIncidentResponse,
  ListIncidentsResponse,
  GetIncidentParams,
  GetIncidentResponse,
} from "@workspace/api-zod";
import { decryptConfig } from "../lib/crypto";
import { queryOpenSearch } from "../lib/connectors/opensearch-connector";
import { getLLMProvider, type LLMAnalysisContext } from "../lib/llm/llm-provider";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const LOG_SOURCE_INTEGRATION_MAP: Record<string, string> = {
  opensearch: "OpenSearch",
  elasticsearch: "Elasticsearch",
  splunk: "Splunk",
  loki: "Grafana Loki",
  cloudwatch: "AWS CloudWatch",
};

async function getConnectedIntegration(name: string) {
  const [row] = await db
    .select()
    .from(integrationConfigsTable)
    .where(eq(integrationConfigsTable.name, name));
  if (!row || row.status !== "connected") return null;
  try {
    const dec = decryptConfig(row.encryptedConfig);
    return (dec["fields"] as Record<string, string>) ?? null;
  } catch {
    logger.warn({ name }, "Failed to decrypt integration config");
    return null;
  }
}

async function getConnectedLLMProvider() {
  const azureRow = await getConnectedIntegration("Azure OpenAI");
  if (azureRow) {
    return {
      type: "azure_openai" as const,
      config: {
        endpointUrl: azureRow["endpointUrl"] ?? "",
        deploymentName: azureRow["deploymentName"] ?? "gpt-4o",
        apiVersion: azureRow["apiVersion"] ?? "2024-02-01",
        apiKey: azureRow["apiKey"] ?? "",
      },
    };
  }

  const openaiRow = await getConnectedIntegration("OpenAI");
  if (openaiRow) {
    return {
      type: "openai" as const,
      config: {
        apiKey: openaiRow["apiKey"] ?? "",
        modelName: openaiRow["modelName"] ?? "gpt-4o",
      },
    };
  }

  return null;
}

router.post("/analyze-incident", async (req, res): Promise<void> => {
  const parsed = AnalyzeIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const {
    correlationId,
    serviceName,
    environment,
    timeRange,
    logSource,
    rawLogs,
    allowDemoFallback,
  } = parsed.data;

  const warnings: string[] = [];
  let logsRetrieved: number | null = null;
  let logSourceUsed = "demo";

  let retrievedLogs: import("../lib/connectors/opensearch-connector").NormalizedLogEntry[] = [];

  if (logSource !== "paste") {
    const integrationName = LOG_SOURCE_INTEGRATION_MAP[logSource];
    if (integrationName) {
      const fields = await getConnectedIntegration(integrationName);
      if (fields) {
        const config = {
          endpointUrl: fields["endpointUrl"] ?? fields["lokiEndpoint"] ?? fields["splunkHost"] ?? "",
          indexPattern: fields["indexPattern"] ?? "logs-*",
          username: fields["username"] || undefined,
          apiKey: fields["apiKey"] ?? fields["hecToken"] ?? undefined,
        };

        if (config.endpointUrl) {
          logger.info({ correlationId, integrationName }, "Querying log source");
          const result = await queryOpenSearch(config, {
            correlationId,
            serviceName,
            environment,
            timeRange,
          });

          if (result.success && result.logs.length > 0) {
            retrievedLogs = result.logs;
            logsRetrieved = result.logs.length;
            logSourceUsed = logSource;
            logger.info({ correlationId, logsRetrieved }, "Real logs retrieved");
          } else if (!result.success) {
            warnings.push(`Could not query ${integrationName}: ${result.error ?? "unknown error"}`);
            if (allowDemoFallback === false) {
              res.status(502).json({
                error: `Failed to retrieve logs from ${integrationName}: ${result.error}`,
                warnings,
              });
              return;
            }
          } else {
            warnings.push(`No logs found in ${integrationName} for correlationId "${correlationId}" in the selected time range.`);
          }
        }
      } else {
        warnings.push(`${integrationName} is not connected. Configure it in Settings to query real logs.`);
      }
    }
  }

  if (logSource === "paste" && rawLogs?.trim()) {
    logSourceUsed = "raw_paste";
  }

  const llmConfig = await getConnectedLLMProvider();
  const provider = getLLMProvider(
    llmConfig?.type === "openai" ? llmConfig.config : null,
    llmConfig?.type === "azure_openai" ? llmConfig.config : null
  );

  const context: LLMAnalysisContext = {
    correlationId,
    serviceName,
    environment,
    timeRange,
    logs: retrievedLogs,
    rawLogs: rawLogs ?? null,
  };

  logger.info(
    { correlationId, engine: provider.name, logsRetrieved, logSourceUsed },
    "Running incident analysis"
  );

  const analysis = await provider.analyze(context);

  const [saved] = await db
    .insert(incidentsTable)
    .values({
      correlationId,
      serviceName,
      environment,
      logSource,
      summary: analysis.summary,
      probableRootCause: analysis.probableRootCause,
      timeline: analysis.timeline,
      affectedServices: analysis.affectedServices,
      errorPatterns: analysis.errorPatterns,
      downstreamFailures: analysis.downstreamFailures,
      suggestedFixes: analysis.suggestedFixes,
      suggestedRollback: analysis.suggestedRollback,
      confidence: analysis.confidence,
      mttr: analysis.mttr ?? null,
    })
    .returning();

  const report = {
    id: saved.id,
    correlationId: saved.correlationId,
    serviceName: saved.serviceName,
    environment: saved.environment,
    analyzedAt: saved.analyzedAt.toISOString(),
    summary: analysis.summary,
    probableRootCause: analysis.probableRootCause,
    timeline: analysis.timeline,
    affectedServices: analysis.affectedServices,
    errorPatterns: analysis.errorPatterns,
    downstreamFailures: analysis.downstreamFailures,
    suggestedFixes: analysis.suggestedFixes,
    suggestedRollback: analysis.suggestedRollback,
    confidence: analysis.confidence,
    mttr: analysis.mttr ?? null,
    logsRetrieved,
    logSourceUsed,
    analysisEngine: provider.name,
    warnings: warnings.length > 0 ? warnings : undefined,
    propagationPath: analysis.propagationPath ?? [],
    firstFailureService: analysis.firstFailureService ?? null,
    blastRadius: analysis.blastRadius ?? null,
    cascadeDescription: analysis.cascadeDescription ?? null,
    observabilitySignals: analysis.observabilitySignals ?? [],
    serviceGroups: analysis.serviceGroups ?? [],
  };

  res.json(AnalyzeIncidentResponse.parse(report));
});

router.get("/incidents", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(incidentsTable)
    .orderBy(desc(incidentsTable.analyzedAt))
    .limit(50);

  const summaries = rows.map((r) => ({
    id: r.id,
    correlationId: r.correlationId,
    serviceName: r.serviceName,
    environment: r.environment,
    confidence: r.confidence as "high" | "medium" | "low",
    summary: r.summary,
    analyzedAt: r.analyzedAt.toISOString(),
    affectedServicesCount: Array.isArray(r.affectedServices)
      ? (r.affectedServices as string[]).length
      : 0,
  }));

  res.json(ListIncidentsResponse.parse(summaries));
});

router.get("/incidents/:id", async (req, res): Promise<void> => {
  const params = GetIncidentParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [row] = await db
    .select()
    .from(incidentsTable)
    .where(eq(incidentsTable.id, params.data.id));

  if (!row) {
    res.status(404).json({ error: "Incident not found" });
    return;
  }

  const report = {
    id: row.id,
    correlationId: row.correlationId,
    serviceName: row.serviceName,
    environment: row.environment,
    analyzedAt: row.analyzedAt.toISOString(),
    summary: row.summary,
    probableRootCause: row.probableRootCause,
    timeline: row.timeline,
    affectedServices: row.affectedServices,
    errorPatterns: row.errorPatterns,
    downstreamFailures: row.downstreamFailures,
    suggestedFixes: row.suggestedFixes,
    suggestedRollback: row.suggestedRollback,
    confidence: row.confidence as "high" | "medium" | "low",
    mttr: row.mttr ?? null,
  };

  res.json(GetIncidentResponse.parse(report));
});

export default router;
