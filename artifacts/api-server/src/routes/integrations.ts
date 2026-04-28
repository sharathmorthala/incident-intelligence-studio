import { Router, type IRouter } from "express";
import { db, integrationConfigsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { encryptConfig, decryptConfig, maskSecrets } from "../lib/crypto";
import { testOpenSearchConnection } from "../lib/connectors/opensearch-connector";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function validateIntegrationBody(body: unknown): { name: string; fields: Record<string, string>; boolFields: Record<string, boolean> } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b["name"] !== "string" || !b["name"]) return null;
  if (!b["fields"] || typeof b["fields"] !== "object") return null;
  const fields = b["fields"] as Record<string, string>;
  const boolFields = (b["boolFields"] && typeof b["boolFields"] === "object") ? b["boolFields"] as Record<string, boolean> : {};
  return { name: b["name"] as string, fields, boolFields };
}

async function testConnection(
  name: string,
  fields: Record<string, string>
): Promise<{ ok: boolean; message: string; latencyMs?: number }> {
  const lower = name.toLowerCase();

  if (lower.includes("opensearch") || lower.includes("elasticsearch")) {
    const endpointUrl = fields["endpointUrl"] ?? fields["endpoint_url"] ?? "";
    if (!endpointUrl) {
      return { ok: false, message: "Endpoint URL is required" };
    }
    return testOpenSearchConnection({
      endpointUrl,
      indexPattern: fields["indexPattern"] ?? "logs-*",
      username: fields["username"] || undefined,
      apiKey: fields["apiKey"] || undefined,
    });
  }

  if (lower === "openai") {
    const apiKey = fields["apiKey"] ?? "";
    if (!apiKey) return { ok: false, message: "API Key is required" };
    const start = Date.now();
    try {
      const resp = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - start;
      if (resp.ok) return { ok: true, message: `Connected to OpenAI (${latencyMs}ms)`, latencyMs };
      return { ok: false, message: `OpenAI returned HTTP ${resp.status}`, latencyMs };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`, latencyMs: Date.now() - start };
    }
  }

  if (lower.includes("azure")) {
    const endpointUrl = fields["endpointUrl"] ?? "";
    const apiKey = fields["apiKey"] ?? "";
    if (!endpointUrl || !apiKey) return { ok: false, message: "Endpoint URL and API Key are required" };
    const start = Date.now();
    try {
      const resp = await fetch(`${endpointUrl.replace(/\/$/, "")}/openai/models?api-version=2024-02-01`, {
        headers: { "api-key": apiKey },
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - start;
      if (resp.ok) return { ok: true, message: `Connected to Azure OpenAI (${latencyMs}ms)`, latencyMs };
      return { ok: false, message: `Azure OpenAI returned HTTP ${resp.status}`, latencyMs };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`, latencyMs: Date.now() - start };
    }
  }

  if (lower.includes("bedrock")) {
    return { ok: false, message: "AWS Bedrock test requires AWS SDK — use AWS CLI to validate credentials outside this demo" };
  }

  if (lower.includes("splunk")) {
    const splunkHost = fields["splunkHost"] ?? "";
    if (!splunkHost) return { ok: false, message: "Splunk Host URL is required" };
    const start = Date.now();
    try {
      const resp = await fetch(`${splunkHost.replace(/\/$/, "")}/services/server/info`, {
        headers: { Authorization: `Splunk ${fields["hecToken"] ?? ""}` },
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - start;
      if (resp.ok || resp.status === 401) {
        return resp.ok
          ? { ok: true, message: `Connected to Splunk (${latencyMs}ms)`, latencyMs }
          : { ok: false, message: "Splunk reachable but authentication failed — check HEC token", latencyMs };
      }
      return { ok: false, message: `Splunk returned HTTP ${resp.status}`, latencyMs };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`, latencyMs: Date.now() - start };
    }
  }

  if (lower.includes("loki")) {
    const lokiEndpoint = fields["lokiEndpoint"] ?? "";
    if (!lokiEndpoint) return { ok: false, message: "Loki Endpoint URL is required" };
    const start = Date.now();
    try {
      const resp = await fetch(`${lokiEndpoint.replace(/\/$/, "")}/ready`, {
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - start;
      if (resp.ok) return { ok: true, message: `Connected to Grafana Loki (${latencyMs}ms)`, latencyMs };
      return { ok: false, message: `Loki returned HTTP ${resp.status}`, latencyMs };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`, latencyMs: Date.now() - start };
    }
  }

  if (lower.includes("ollama")) {
    const baseUrl = fields["baseUrl"] ?? "http://localhost:11434";
    const start = Date.now();
    try {
      const resp = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`, {
        signal: AbortSignal.timeout(8000),
      });
      const latencyMs = Date.now() - start;
      if (resp.ok) return { ok: true, message: `Connected to Ollama (${latencyMs}ms)`, latencyMs };
      return { ok: false, message: `Ollama returned HTTP ${resp.status}`, latencyMs };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`, latencyMs: Date.now() - start };
    }
  }

  return { ok: false, message: `No test implementation for "${name}"` };
}

router.get("/integrations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(integrationConfigsTable);

  const configs = rows.map((row) => {
    let fields: Record<string, string> = {};
    let boolFields: Record<string, boolean> = {};
    try {
      const decrypted = decryptConfig(row.encryptedConfig);
      fields = maskSecrets((decrypted["fields"] as Record<string, string>) ?? {});
      boolFields = (decrypted["boolFields"] as Record<string, boolean>) ?? {};
    } catch {
      logger.warn({ name: row.name }, "Failed to decrypt integration config");
    }
    return {
      name: row.name,
      status: row.status,
      fields,
      boolFields,
      testedAt: row.testedAt?.toISOString() ?? null,
      savedAt: row.savedAt.toISOString(),
    };
  });

  res.json(configs);
});

router.post("/integrations/save", async (req, res): Promise<void> => {
  const validated = validateIntegrationBody(req.body);
  if (!validated) {
    res.status(400).json({ error: "Invalid request body: name, fields required" });
    return;
  }

  const { name, fields, boolFields } = validated;

  let existingEncrypted: string | null = null;
  const [existing] = await db
    .select()
    .from(integrationConfigsTable)
    .where(eq(integrationConfigsTable.name, name));

  if (existing) {
    try {
      const dec = decryptConfig(existing.encryptedConfig);
      existingEncrypted = existing.encryptedConfig;
      const existingFields = (dec["fields"] as Record<string, string>) ?? {};
      for (const [key, val] of Object.entries(fields)) {
        if (val.startsWith("••••") && existingFields[key]) {
          fields[key] = existingFields[key];
        }
      }
    } catch {
      logger.warn({ name }, "Could not decrypt existing config during save — overwriting");
    }
  }

  void existingEncrypted;

  const encrypted = encryptConfig({ fields, boolFields });
  const status = existing?.status ?? "demo";

  if (existing) {
    await db
      .update(integrationConfigsTable)
      .set({ encryptedConfig: encrypted, updatedAt: new Date() })
      .where(eq(integrationConfigsTable.name, name));
  } else {
    await db.insert(integrationConfigsTable).values({
      name,
      encryptedConfig: encrypted,
      status,
    });
  }

  res.json({ ok: true, name, status });
});

router.post("/integrations/test", async (req, res): Promise<void> => {
  const validated = validateIntegrationBody(req.body);
  if (!validated) {
    res.status(400).json({ error: "Invalid request body: name, fields required" });
    return;
  }

  const { name, fields } = validated;

  let resolvedFields = { ...fields };

  const [existing] = await db
    .select()
    .from(integrationConfigsTable)
    .where(eq(integrationConfigsTable.name, name));

  if (existing) {
    try {
      const dec = decryptConfig(existing.encryptedConfig);
      const existingFields = (dec["fields"] as Record<string, string>) ?? {};
      for (const [key, val] of Object.entries(resolvedFields)) {
        if (val.startsWith("••••") && existingFields[key]) {
          resolvedFields[key] = existingFields[key];
        }
      }
    } catch {
      logger.warn({ name }, "Could not decrypt existing config during test");
    }
  }

  const result = await testConnection(name, resolvedFields);

  const newStatus = result.ok ? "connected" : "failed";
  const now = new Date();

  if (existing) {
    await db
      .update(integrationConfigsTable)
      .set({ status: newStatus, testedAt: now, updatedAt: now })
      .where(eq(integrationConfigsTable.name, name));
  } else {
    const encrypted = encryptConfig({ fields: resolvedFields, boolFields: {} });
    await db.insert(integrationConfigsTable).values({
      name,
      encryptedConfig: encrypted,
      status: newStatus,
      testedAt: now,
    });
  }

  res.json({ ok: result.ok, message: result.message, latencyMs: result.latencyMs ?? null, status: newStatus });
});

router.post("/integrations/status", async (req, res): Promise<void> => {
  const { name, status } = req.body as { name: string; status: string };
  if (!name || !status) {
    res.status(400).json({ error: "name and status required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(integrationConfigsTable)
    .where(eq(integrationConfigsTable.name, name));

  if (existing) {
    await db
      .update(integrationConfigsTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(integrationConfigsTable.name, name));
  }

  res.json({ ok: true });
});

export default router;
