import { pgTable, text, serial, timestamp, integer, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const incidentsTable = pgTable("incidents", {
  id: serial("id").primaryKey(),
  correlationId: text("correlation_id").notNull(),
  serviceName: text("service_name").notNull(),
  environment: text("environment").notNull(),
  logSource: text("log_source").notNull(),
  analyzedAt: timestamp("analyzed_at", { withTimezone: true }).notNull().defaultNow(),
  summary: text("summary").notNull(),
  probableRootCause: text("probable_root_cause").notNull(),
  timeline: jsonb("timeline").notNull().default([]),
  affectedServices: jsonb("affected_services").notNull().default([]),
  errorPatterns: jsonb("error_patterns").notNull().default([]),
  downstreamFailures: jsonb("downstream_failures").notNull().default([]),
  suggestedFixes: jsonb("suggested_fixes").notNull().default([]),
  suggestedRollback: text("suggested_rollback").notNull().default(""),
  confidence: text("confidence").notNull(),
  mttr: text("mttr"),
});

export const insertIncidentSchema = createInsertSchema(incidentsTable).omit({
  id: true,
  analyzedAt: true,
});

export type InsertIncident = z.infer<typeof insertIncidentSchema>;
export type Incident = typeof incidentsTable.$inferSelect;
