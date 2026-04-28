import { Router, type IRouter } from "express";
import { db, incidentsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  AnalyzeIncidentBody,
  AnalyzeIncidentResponse,
  ListIncidentsResponse,
  GetIncidentParams,
  GetIncidentResponse,
} from "@workspace/api-zod";
import { analyzeIncident } from "../lib/incident-analyzer";

const router: IRouter = Router();

router.post("/analyze-incident", async (req, res): Promise<void> => {
  const parsed = AnalyzeIncidentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { correlationId, serviceName, environment, timeRange, logSource, rawLogs } = parsed.data;

  const analysis = analyzeIncident({
    correlationId,
    serviceName,
    environment,
    timeRange,
    logSource,
    rawLogs: rawLogs ?? null,
  });

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
