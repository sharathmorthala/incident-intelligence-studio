import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { AnalyzeIncidentBody, AnalyzeIncidentBodyEnvironment, AnalyzeIncidentBodyLogSource } from "@workspace/api-client-react";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2 } from "lucide-react";

const formSchema = z.object({
  correlationId: z.string().min(1, "Correlation ID is required"),
  serviceName: z.string().min(1, "Service name is required"),
  environment: z.enum(["dev", "qa", "prod"] as const),
  timeRange: z.string().min(1, "Time range is required"),
  logSource: z.enum(["opensearch", "elasticsearch", "splunk", "loki", "cloudwatch", "paste"] as const),
  rawLogs: z.string().optional(),
});

interface IncidentFormProps {
  onSubmit: (data: AnalyzeIncidentBody) => void;
  isPending: boolean;
}

const DEMO_CORRELATIONS = [
  { id: "CORR-500-TIMEOUT", service: "api-gateway" },
  { id: "CORR-AUTH-401", service: "auth-service" },
  { id: "CORR-DOWNSTREAM-FAIL", service: "payment-processor" },
  { id: "CORR-VALIDATION-ERROR", service: "user-service" }
];

export function IncidentForm({ onSubmit, isPending }: IncidentFormProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      correlationId: "",
      serviceName: "",
      environment: "prod",
      timeRange: "Last 15 minutes",
      logSource: "opensearch",
      rawLogs: "",
    },
  });

  const logSource = form.watch("logSource");

  const handleDemoClick = (demo: typeof DEMO_CORRELATIONS[0]) => {
    form.setValue("correlationId", demo.id);
    form.setValue("serviceName", demo.service);
  };

  return (
    <Card className="bg-card border-card-border shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Analyze Incident</CardTitle>
        <CardDescription>Enter correlation details to generate an AI root-cause analysis report.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-6">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Demo Scenarios</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_CORRELATIONS.map((demo) => (
              <Badge 
                key={demo.id} 
                variant="outline" 
                className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors py-1.5 px-3"
                onClick={() => handleDemoClick(demo)}
              >
                {demo.id}
              </Badge>
            ))}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="correlationId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Correlation ID / Trace ID</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. req-abc-123" className="bg-background font-mono text-sm" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="serviceName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Origin Service</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. auth-service" className="bg-background" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <FormField
                control={form.control}
                name="environment"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Environment</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Select env" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="prod">Production</SelectItem>
                        <SelectItem value="qa">QA/Staging</SelectItem>
                        <SelectItem value="dev">Development</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="timeRange"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time Range</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Last 15 minutes">Last 15 minutes</SelectItem>
                        <SelectItem value="Last 1 hour">Last 1 hour</SelectItem>
                        <SelectItem value="Last 4 hours">Last 4 hours</SelectItem>
                        <SelectItem value="Last 24 hours">Last 24 hours</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="logSource"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Log Source</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="bg-background">
                          <SelectValue placeholder="Select source" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="opensearch">OpenSearch</SelectItem>
                        <SelectItem value="elasticsearch">Elasticsearch</SelectItem>
                        <SelectItem value="splunk">Splunk</SelectItem>
                        <SelectItem value="loki">Grafana Loki</SelectItem>
                        <SelectItem value="cloudwatch">CloudWatch</SelectItem>
                        <SelectItem value="paste">Paste Raw Logs</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {logSource === "paste" && (
              <FormField
                control={form.control}
                name="rawLogs"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Raw Logs (JSON or Text)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Paste log lines here..." 
                        className="bg-background font-mono text-xs min-h-[200px]" 
                        {...field} 
                        value={field.value || ""}
                      />
                    </FormControl>
                    <FormDescription>Max 1MB of logs.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button type="submit" disabled={isPending} className="w-full sm:w-auto mt-4 font-semibold tracking-wide">
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing Incident...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Analyze Logs & Generate RCA
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
