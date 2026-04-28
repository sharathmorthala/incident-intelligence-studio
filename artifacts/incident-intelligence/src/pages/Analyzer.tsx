import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { IncidentForm } from "@/components/IncidentForm";
import { IncidentReport } from "@/components/IncidentReport";
import { useAnalyzeIncident, AnalyzeIncidentBody, IncidentReport as IncidentReportType, TimelineEventLevel, IncidentReportConfidence, ErrorPatternSeverity, DownstreamFailureImpactLevel } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { SearchX } from "lucide-react";

export default function Analyzer() {
  const { toast } = useToast();
  const analyzeMutation = useAnalyzeIncident();
  const [report, setReport] = useState<IncidentReportType | null>(null);

  const handleSubmit = (data: AnalyzeIncidentBody) => {
    analyzeMutation.mutate({ data }, {
      onSuccess: (result) => {
        setReport(result);
        toast({
          title: "Analysis Complete",
          description: `Successfully generated RCA for ${data.correlationId}`,
        });
      },
      onError: (error) => {
        // Fallback to mock data on error for demo purposes
        console.error(error);
        toast({
          title: "API Error - Using Mock Data",
          description: "Could not reach the server. Generating a mock report instead.",
          variant: "destructive",
        });
        
        // Mock data fallback
        setTimeout(() => {
          setReport({
            id: 999,
            correlationId: data.correlationId,
            serviceName: data.serviceName,
            environment: data.environment,
            analyzedAt: new Date().toISOString(),
            summary: `Analysis of ${data.correlationId} in ${data.serviceName} indicates a systemic failure originating from a downstream dependency timeout, cascading into thread pool exhaustion.`,
            probableRootCause: `The primary cause appears to be a sudden latency spike in the payment-processor service, which caused ${data.serviceName} to consume all available worker threads waiting for responses, ultimately leading to 500 errors across the API gateway.`,
            confidence: "high" as IncidentReportConfidence,
            mttr: "18 mins",
            affectedServices: [data.serviceName, "api-gateway", "payment-processor"],
            errorPatterns: [
              { pattern: "java.net.SocketTimeoutException: Read timed out", count: 452, severity: "critical" as ErrorPatternSeverity, firstSeen: new Date(Date.now()-600000).toISOString(), lastSeen: new Date().toISOString() },
              { pattern: "java.lang.OutOfMemoryError: unable to create new native thread", count: 89, severity: "high" as ErrorPatternSeverity, firstSeen: new Date(Date.now()-300000).toISOString(), lastSeen: new Date().toISOString() }
            ],
            downstreamFailures: [
              { service: "payment-processor", errorType: "TIMEOUT", impactLevel: "critical" as DownstreamFailureImpactLevel, details: "Service SLA breached. P99 latency exceeded 5000ms." }
            ],
            suggestedFixes: [
              "Implement circuit breaker pattern (e.g., Resilience4j) around calls to payment-processor.",
              "Increase connection pool timeout granularity.",
              "Enable autoscaling for payment-processor based on queue depth."
            ],
            suggestedRollback: "If a recent deployment occurred in payment-processor within the last hour, rollback immediately. Otherwise, consider failing over to the secondary region if available.",
            timeline: [
              { timestamp: new Date(Date.now()-600000).toISOString(), service: "payment-processor", level: "WARN" as TimelineEventLevel, message: "High latency detected on upstream DB queries" },
              { timestamp: new Date(Date.now()-500000).toISOString(), service: data.serviceName, level: "ERROR" as TimelineEventLevel, message: "SocketTimeoutException reading from payment-processor" },
              { timestamp: new Date(Date.now()-300000).toISOString(), service: data.serviceName, level: "FATAL" as TimelineEventLevel, message: "OutOfMemoryError: unable to create new native thread" },
              { timestamp: new Date(Date.now()-100000).toISOString(), service: "api-gateway", level: "ERROR" as TimelineEventLevel, message: `500 Internal Server Error returned from ${data.serviceName}` }
            ]
          });
        }, 1500);
      }
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Incident Analyzer</h1>
          <p className="text-muted-foreground mt-1">Cross-system log correlation and AI root-cause analysis.</p>
        </div>

        <IncidentForm onSubmit={handleSubmit} isPending={analyzeMutation.isPending} />

        {report && (
          <div className="mt-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <IncidentReport report={report} />
          </div>
        )}

        {!report && !analyzeMutation.isPending && (
          <div className="mt-12 text-center flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-lg bg-muted/10">
            <SearchX className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">Ready for Analysis</h3>
            <p className="text-muted-foreground max-w-md mt-2 text-sm">Enter a correlation ID and service name above to scan logs across all connected observability platforms.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
