import { Router, type IRouter } from "express";
import { db, integrationConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { decryptConfig } from "../lib/crypto";
import { queryOpenSearch } from "../lib/connectors/opensearch-connector";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_SOURCES = new Set(["opensearch", "elasticsearch", "splunk", "loki", "cloudwatch"]);

router.post("/logs/query", async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown>;
  const correlationId = typeof body["correlationId"] === "string" ? body["correlationId"] : null;
  if (!correlationId) {
    res.status(400).json({ error: "correlationId is required" });
    return;
  }

  const source = typeof body["source"] === "string" && VALID_SOURCES.has(body["source"]) ? body["source"] : "opensearch";
  const serviceName = typeof body["serviceName"] === "string" ? body["serviceName"] : undefined;
  const environment = typeof body["environment"] === "string" ? body["environment"] : undefined;
  const timeRange = typeof body["timeRange"] === "string" ? body["timeRange"] : undefined;
  const maxResults = typeof body["maxResults"] === "number" ? Math.min(Math.max(body["maxResults"], 1), 1000) : 200;

  const integrationName = source === "elasticsearch" ? "Elasticsearch" : "OpenSearch";

  const [row] = await db
    .select()
    .from(integrationConfigsTable)
    .where(eq(integrationConfigsTable.name, integrationName));

  if (!row || row.status !== "connected") {
    res.status(422).json({
      error: `${integrationName} is not connected. Configure and test the connection in Settings first.`,
      source: integrationName,
      status: row?.status ?? "not-configured",
    });
    return;
  }

  let fields: Record<string, string> = {};
  try {
    const dec = decryptConfig(row.encryptedConfig);
    fields = (dec["fields"] as Record<string, string>) ?? {};
  } catch {
    logger.warn({ name: integrationName }, "Failed to decrypt config for log query");
    res.status(500).json({ error: "Failed to read integration credentials" });
    return;
  }

  const config = {
    endpointUrl: fields["endpointUrl"] ?? "",
    indexPattern: fields["indexPattern"] ?? "logs-*",
    username: fields["username"] || undefined,
    apiKey: fields["apiKey"] || undefined,
  };

  if (!config.endpointUrl) {
    res.status(422).json({ error: "Integration endpoint URL not configured" });
    return;
  }

  const result = await queryOpenSearch(config, {
    correlationId,
    serviceName,
    environment,
    timeRange,
    maxResults,
  });

  if (!result.success) {
    res.status(502).json({
      error: result.error ?? "Log query failed",
      source: integrationName,
    });
    return;
  }

  res.json({
    source: integrationName,
    correlationId,
    total: result.total,
    returned: result.logs.length,
    logs: result.logs,
  });
});

export default router;
