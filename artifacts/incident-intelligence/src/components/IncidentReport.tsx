import { useState } from "react";
import { IncidentReport as IncidentReportType, ObservabilitySignal, ServiceGroup } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { TimelineView } from "./TimelineView";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertCircle, ArrowRight, CheckCircle2, Copy, Download, Flame, GitPullRequest,
  Radio, Search, ShieldAlert, Zap, Activity, Network, AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface IncidentReportProps {
  report: IncidentReportType;
}

const SIGNAL_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  latency_spike: { label: "Latency Spike", color: "bg-amber-500/10 border-amber-500/20 text-amber-400", icon: <Activity className="h-4 w-4" /> },
  error_rate_burst: { label: "Error Rate Burst", color: "bg-red-500/10 border-red-500/20 text-red-400", icon: <AlertCircle className="h-4 w-4" /> },
  retry_storm: { label: "Retry Storm", color: "bg-orange-500/10 border-orange-500/20 text-orange-400", icon: <Radio className="h-4 w-4" /> },
  circuit_breaker_open: { label: "Circuit Breaker", color: "bg-violet-500/10 border-violet-500/20 text-violet-400", icon: <Zap className="h-4 w-4" /> },
  connection_pool_exhaustion: { label: "Pool Exhaustion", color: "bg-rose-500/10 border-rose-500/20 text-rose-400", icon: <AlertTriangle className="h-4 w-4" /> },
  memory_pressure: { label: "Memory Pressure", color: "bg-pink-500/10 border-pink-500/20 text-pink-400", icon: <AlertTriangle className="h-4 w-4" /> },
};

function ObservabilitySignalCard({ signal }: { signal: ObservabilitySignal }) {
  const cfg = SIGNAL_CONFIG[signal.type] ?? SIGNAL_CONFIG["error_rate_burst"];
  return (
    <div className={`flex flex-col gap-2 p-3 rounded-md border ${cfg.color}`}>
      <div className="flex items-center gap-2 flex-wrap">
        {cfg.icon}
        <span className="font-semibold text-sm">{cfg.label}</span>
        <Badge variant="outline" className="font-mono text-xs bg-background/50">{signal.service}</Badge>
        <StatusBadge label={signal.severity} type="severity" />
      </div>
      <p className="text-xs opacity-80 leading-relaxed">{signal.description}</p>
      <p className="text-[10px] opacity-50 font-mono">{signal.detectedAt.slice(11, 19)} UTC</p>
    </div>
  );
}

function PropagationChain({ path, firstFailureService }: { path: string[]; firstFailureService?: string | null }) {
  if (!path || path.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {path.map((svc, i) => {
        const isOrigin = svc === firstFailureService || i === 0;
        return (
          <div key={i} className="flex items-center gap-1.5">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${
              isOrigin
                ? "bg-red-500/10 border-red-500/30 text-red-400"
                : "bg-muted/40 border-border text-muted-foreground"
            }`}>
              {isOrigin && <Flame className="h-3 w-3 shrink-0" />}
              <span>{svc}</span>
              {isOrigin && <span className="opacity-60 text-[10px]">(origin)</span>}
            </div>
            {i < path.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function BlastRadiusWidget({ blastRadius, affectedServices, firstFailureService }: {
  blastRadius?: number | null;
  affectedServices: string[];
  firstFailureService?: string | null;
}) {
  const count = blastRadius ?? affectedServices.length;
  const severity = count >= 5 ? "critical" : count >= 3 ? "high" : count >= 2 ? "medium" : "low";
  const colorMap: Record<string, string> = {
    critical: "text-red-400 bg-red-500/10 border-red-500/30",
    high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
    medium: "text-amber-400 bg-amber-500/10 border-amber-500/30",
    low: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  };

  return (
    <div className={`flex flex-col gap-3 p-4 rounded-lg border ${colorMap[severity]}`}>
      <div className="flex items-center gap-3">
        <Network className="h-5 w-5 shrink-0" />
        <div>
          <div className="text-2xl font-bold tabular-nums">{count}</div>
          <div className="text-xs opacity-70 font-medium">services affected</div>
        </div>
        <div className="ml-auto">
          <StatusBadge label={severity} type="severity" />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {affectedServices.map((svc, i) => (
          <Badge
            key={i}
            variant="outline"
            className={`text-xs border-current/30 ${svc === firstFailureService ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-background/30"}`}
          >
            {svc === firstFailureService && <Flame className="h-2.5 w-2.5 mr-1 inline" />}
            {svc}
          </Badge>
        ))}
      </div>
    </div>
  );
}

function ServiceGroupTable({ serviceGroups }: { serviceGroups: ServiceGroup[] }) {
  if (!serviceGroups || serviceGroups.length === 0) return null;

  const roleColors: Record<string, string> = {
    origin: "text-red-400",
    upstream: "text-amber-400",
    downstream: "text-blue-400",
    inferred: "text-muted-foreground",
  };

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-muted/30">
          <tr className="border-b border-border">
            <th className="text-left font-medium p-2.5 text-xs text-muted-foreground uppercase tracking-wide">Service</th>
            <th className="text-left font-medium p-2.5 text-xs text-muted-foreground uppercase tracking-wide">Role</th>
            <th className="text-center font-medium p-2.5 text-xs text-muted-foreground uppercase tracking-wide">Logs</th>
            <th className="text-center font-medium p-2.5 text-xs text-muted-foreground uppercase tracking-wide">Errors</th>
            <th className="text-center font-medium p-2.5 text-xs text-muted-foreground uppercase tracking-wide">Warns</th>
            <th className="text-left font-medium p-2.5 text-xs text-muted-foreground uppercase tracking-wide">First Error</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {serviceGroups.map((g, i) => (
            <tr key={i} className="bg-background hover:bg-muted/20 transition-colors">
              <td className="p-2.5 font-medium font-mono text-xs">{g.service}</td>
              <td className={`p-2.5 text-xs font-semibold capitalize ${roleColors[g.role] ?? "text-muted-foreground"}`}>
                {g.role === "origin" && <Flame className="h-3 w-3 inline mr-1" />}
                {g.role}
              </td>
              <td className="p-2.5 text-center tabular-nums text-xs">{g.logCount}</td>
              <td className={`p-2.5 text-center tabular-nums text-xs font-semibold ${g.errorCount > 0 ? "text-red-400" : "text-muted-foreground"}`}>
                {g.errorCount > 0 ? g.errorCount : "—"}
              </td>
              <td className={`p-2.5 text-center tabular-nums text-xs ${g.warnCount > 0 ? "text-amber-400" : "text-muted-foreground"}`}>
                {g.warnCount > 0 ? g.warnCount : "—"}
              </td>
              <td className="p-2.5 font-mono text-[11px] text-muted-foreground">
                {g.firstErrorAt ? g.firstErrorAt.slice(11, 19) + " UTC" : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IncidentReport({ report }: IncidentReportProps) {
  const [copied, setCopied] = useState(false);

  const extReport = report as IncidentReportType & {
    propagationPath?: string[];
    firstFailureService?: string | null;
    blastRadius?: number | null;
    cascadeDescription?: string | null;
    observabilitySignals?: ObservabilitySignal[];
    serviceGroups?: ServiceGroup[];
  };

  const hasIntelligence =
    (extReport.propagationPath && extReport.propagationPath.length > 1) ||
    (extReport.observabilitySignals && extReport.observabilitySignals.length > 0) ||
    (extReport.serviceGroups && extReport.serviceGroups.length > 0);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const text = `
Incident Report: ${report.correlationId}
Analyzed At: ${report.analyzedAt}
Service: ${report.serviceName}
Environment: ${report.environment}
Confidence: ${report.confidence}
${extReport.firstFailureService ? `\nFIRST FAILURE: ${extReport.firstFailureService}` : ""}
${extReport.propagationPath?.length ? `\nPROPAGATION PATH:\n${extReport.propagationPath.join(" → ")}` : ""}
${extReport.blastRadius != null ? `\nBLAST RADIUS: ${extReport.blastRadius} services` : ""}
${extReport.cascadeDescription ? `\nCASCADE: ${extReport.cascadeDescription}` : ""}

SUMMARY:
${report.summary}

ROOT CAUSE:
${report.probableRootCause}

AFFECTED SERVICES:
${report.affectedServices.join(", ")}

FIXES:
${report.suggestedFixes.join("\n")}
    `.trim();

    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `incident-${report.correlationId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="bg-card border-card-border w-full shadow-lg">
      <CardHeader className="border-b border-border bg-muted/20 pb-4">
        <div className="flex flex-col md:flex-row justify-between md:items-start gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <ShieldAlert className="h-6 w-6 text-primary" />
              <CardTitle className="text-xl tracking-tight">Analysis Report</CardTitle>
              <Badge variant="outline" className="font-mono bg-background">{report.correlationId}</Badge>
              <StatusBadge label={report.confidence} type="confidence" />
            </div>
            <CardDescription className="text-sm">
              Analyzed {format(new Date(report.analyzedAt), "PPpp")} • {report.serviceName} ({report.environment})
              {report.mttr && ` • Est. MTTR: ${report.mttr}`}
            </CardDescription>

            {/* First failure banner */}
            {extReport.firstFailureService && (
              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded px-2 py-0.5 text-xs font-medium">
                  <Flame className="h-3.5 w-3.5" />
                  First failure: {extReport.firstFailureService}
                </span>
                {extReport.blastRadius != null && extReport.blastRadius > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded px-2 py-0.5 text-xs font-medium">
                    <Network className="h-3.5 w-3.5" />
                    Blast radius: {extReport.blastRadius} service{extReport.blastRadius !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleCopy} className="h-8 text-xs bg-background">
              {copied ? <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              {copied ? "Copied" : "Copy JSON"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 text-xs bg-background">
              <Download className="h-3.5 w-3.5 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <Tabs defaultValue="summary" className="w-full">
          <div className="border-b border-border bg-muted/10 px-4">
            <TabsList className="bg-transparent h-12 w-full justify-start gap-1">
              {["summary", "intelligence", "timeline", "impact", "resolution"].map((tab) => {
                const labels: Record<string, string> = {
                  summary: "Summary & RCA",
                  intelligence: "Intelligence",
                  timeline: "Timeline",
                  impact: "Impact Analysis",
                  resolution: "Resolution",
                };
                if (tab === "intelligence" && !hasIntelligence) return null;
                return (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    className="data-[state=active]:bg-background data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none text-sm"
                  >
                    {labels[tab]}
                    {tab === "intelligence" && hasIntelligence && (
                      <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-primary inline-block" />
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <div className="p-4 sm:p-6 space-y-6">
            {/* ─── Summary Tab ─── */}
            <TabsContent value="summary" className="m-0 space-y-6">
              <section className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Search className="h-5 w-5 text-primary" />
                  Executive Summary
                </h3>
                <div className="p-4 bg-muted/20 border border-border rounded-md leading-relaxed text-sm text-foreground">
                  {report.summary}
                </div>
              </section>

              {extReport.cascadeDescription && (
                <section className="space-y-2">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Cascade Summary</h3>
                  <div className="p-3 bg-orange-950/10 border border-orange-900/25 rounded-md text-sm text-orange-400/90 leading-relaxed">
                    {extReport.cascadeDescription}
                  </div>
                </section>
              )}

              <section className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-red-400">
                  <AlertCircle className="h-5 w-5" />
                  Probable Root Cause
                </h3>
                <div className="p-4 bg-red-950/10 border border-red-900/30 rounded-md leading-relaxed text-sm text-foreground">
                  {report.probableRootCause}
                </div>
              </section>

              {report.errorPatterns.length > 0 && (
                <section className="space-y-3 mt-6">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Identified Error Patterns</h3>
                  <div className="grid gap-3">
                    {report.errorPatterns.map((p, i) => (
                      <div key={i} className="flex flex-col sm:flex-row gap-4 justify-between bg-background border border-border p-3 rounded-md">
                        <div className="font-mono text-xs text-amber-500 break-all">{p.pattern}</div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Badge variant="outline" className="bg-muted/50">{p.count.toLocaleString()} occurrences</Badge>
                          <StatusBadge label={p.severity} type="severity" />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            {/* ─── Intelligence Tab ─── */}
            <TabsContent value="intelligence" className="m-0 space-y-6">
              {/* Blast Radius */}
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                  <Network className="h-4 w-4" /> Blast Radius
                </h3>
                <BlastRadiusWidget
                  blastRadius={extReport.blastRadius}
                  affectedServices={report.affectedServices}
                  firstFailureService={extReport.firstFailureService}
                />
              </section>

              {/* Propagation Path */}
              {extReport.propagationPath && extReport.propagationPath.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <ArrowRight className="h-4 w-4" /> Failure Propagation Path
                  </h3>
                  <div className="p-4 bg-muted/20 border border-border rounded-md">
                    <PropagationChain
                      path={extReport.propagationPath}
                      firstFailureService={extReport.firstFailureService}
                    />
                  </div>
                  {extReport.cascadeDescription && (
                    <p className="text-sm text-muted-foreground leading-relaxed">{extReport.cascadeDescription}</p>
                  )}
                </section>
              )}

              {/* Observability Signals */}
              {extReport.observabilitySignals && extReport.observabilitySignals.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Activity className="h-4 w-4" /> Observability Signals
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {extReport.observabilitySignals.map((sig, i) => (
                      <ObservabilitySignalCard key={i} signal={sig} />
                    ))}
                  </div>
                </section>
              )}

              {/* Service Group Table */}
              {extReport.serviceGroups && extReport.serviceGroups.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Service Correlation Detail</h3>
                  <ServiceGroupTable serviceGroups={extReport.serviceGroups} />
                </section>
              )}
            </TabsContent>

            {/* ─── Timeline Tab ─── */}
            <TabsContent value="timeline" className="m-0">
              <TimelineView
                events={report.timeline}
                firstFailureService={extReport.firstFailureService}
                serviceGroups={extReport.serviceGroups}
              />
            </TabsContent>

            {/* ─── Impact Analysis Tab ─── */}
            <TabsContent value="impact" className="m-0 space-y-6">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                  Affected Services ({report.affectedServices.length})
                </h3>
                <div className="flex flex-wrap gap-2">
                  {report.affectedServices.map((s, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className={`px-3 py-1 text-sm border ${s === extReport.firstFailureService ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-muted/50 border-border"}`}
                    >
                      {s === extReport.firstFailureService && <Flame className="h-3 w-3 mr-1.5 inline" />}
                      {s}
                    </Badge>
                  ))}
                </div>
              </section>

              {report.downstreamFailures.length > 0 && (
                <section className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Downstream Failures</h3>
                  <div className="border border-border rounded-md overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/30">
                        <tr className="border-b border-border">
                          <th className="text-left font-medium p-3">Service</th>
                          <th className="text-left font-medium p-3">Error Type</th>
                          <th className="text-left font-medium p-3">Impact</th>
                          <th className="text-left font-medium p-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {report.downstreamFailures.map((df, i) => (
                          <tr key={i} className="bg-background">
                            <td className="p-3 font-medium font-mono text-xs">{df.service}</td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{df.errorType}</td>
                            <td className="p-3"><StatusBadge label={df.impactLevel} type="severity" /></td>
                            <td className="p-3 text-muted-foreground text-sm">{df.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </TabsContent>

            {/* ─── Resolution Tab ─── */}
            <TabsContent value="resolution" className="m-0 space-y-6">
              <section className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-emerald-400">
                  <Zap className="h-5 w-5" />
                  Suggested Fixes
                </h3>
                <ul className="space-y-2">
                  {report.suggestedFixes.map((fix, i) => (
                    <li key={i} className="p-3 bg-emerald-950/10 border border-emerald-900/30 rounded-md text-sm text-emerald-500/90 flex gap-3">
                      <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
                      <span>{fix}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-amber-400">
                  <GitPullRequest className="h-5 w-5" />
                  Suggested Rollback / Mitigation
                </h3>
                <div className="p-4 bg-amber-950/10 border border-amber-900/30 rounded-md text-sm text-amber-500/90 leading-relaxed font-mono whitespace-pre-wrap break-words">
                  {report.suggestedRollback}
                </div>
              </section>
            </TabsContent>
          </div>
        </Tabs>
      </CardContent>
    </Card>
  );
}
