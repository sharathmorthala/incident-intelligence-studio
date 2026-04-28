import { useState } from "react";
import { IncidentReport as IncidentReportType } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { StatusBadge } from "./StatusBadge";
import { TimelineView } from "./TimelineView";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, ArrowDownCircle, CheckCircle2, Copy, Download, GitPullRequest, Search, ShieldAlert, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface IncidentReportProps {
  report: IncidentReportType;
}

export function IncidentReport({ report }: IncidentReportProps) {
  const [copied, setCopied] = useState(false);

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
            <TabsList className="bg-transparent h-12 w-full justify-start">
              <TabsTrigger value="summary" className="data-[state=active]:bg-background data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none">Summary & RCA</TabsTrigger>
              <TabsTrigger value="timeline" className="data-[state=active]:bg-background data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none">Timeline</TabsTrigger>
              <TabsTrigger value="impact" className="data-[state=active]:bg-background data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none">Impact Analysis</TabsTrigger>
              <TabsTrigger value="resolution" className="data-[state=active]:bg-background data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary rounded-none">Resolution</TabsTrigger>
            </TabsList>
          </div>

          <div className="p-4 sm:p-6 space-y-6">
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
                          <Badge variant="outline" className="bg-muted/50">{p.count} occurrences</Badge>
                          <StatusBadge label={p.severity} type="severity" />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="m-0">
              <TimelineView events={report.timeline} />
            </TabsContent>

            <TabsContent value="impact" className="m-0 space-y-6">
              <section className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Affected Services ({report.affectedServices.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {report.affectedServices.map((s, i) => (
                    <Badge key={i} variant="secondary" className="bg-muted/50 hover:bg-muted border border-border px-3 py-1 text-sm">{s}</Badge>
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
                            <td className="p-3 font-medium">{df.service}</td>
                            <td className="p-3 font-mono text-xs text-muted-foreground">{df.errorType}</td>
                            <td className="p-3"><StatusBadge label={df.impactLevel} type="severity" /></td>
                            <td className="p-3 text-muted-foreground">{df.details}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </TabsContent>

            <TabsContent value="resolution" className="m-0 space-y-6">
              <section className="space-y-3">
                <h3 className="text-lg font-semibold flex items-center gap-2 text-emerald-400">
                  <Zap className="h-5 w-5" />
                  Suggested Fixes
                </h3>
                <ul className="space-y-2">
                  {report.suggestedFixes.map((fix, i) => (
                    <li key={i} className="p-3 bg-emerald-950/10 border border-emerald-900/30 rounded-md text-sm text-emerald-500/90 flex gap-3">
                      <CheckCircle2 className="h-5 w-5 shrink-0" />
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
                <div className="p-4 bg-amber-950/10 border border-amber-900/30 rounded-md text-sm text-amber-500/90 leading-relaxed">
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
