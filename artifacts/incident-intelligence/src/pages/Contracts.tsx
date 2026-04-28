import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useReviewContract, ReviewContractBody, ContractReview } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileJson, Loader2, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";

const formSchema = z.object({
  serviceName: z.string().optional(),
  version: z.string().optional(),
  requestJson: z.string().min(1, "Request JSON is required"),
  responseJson: z.string().min(1, "Response JSON is required"),
});

export default function Contracts() {
  const { toast } = useToast();
  const reviewMutation = useReviewContract();
  const [review, setReview] = useState<ContractReview | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      serviceName: "",
      version: "v1",
      requestJson: "{\n  \"userId\": \"123\"\n}",
      responseJson: "{\n  \"id\": \"123\",\n  \"name\": \"John\",\n  \"email\": null\n}",
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    reviewMutation.mutate({ data }, {
      onSuccess: (result) => {
        setReview(result);
        toast({ title: "Contract Review Complete" });
      },
      onError: () => {
        toast({ title: "API Error - Using Mock Data", variant: "destructive" });
        // Fallback to mock data
        setTimeout(() => {
          setReview({
            overallRisk: "medium",
            summary: "The provided JSON samples show potential schema drift. Several fields are missing strict typing or exhibit backward compatibility risks.",
            findings: [
              { type: "type_mismatch" as any, field: "email", severity: "high" as any, description: "Email field allows null which may cause NPEs in downstream clients expecting a string.", suggestion: "Enforce non-null string or make the field entirely optional rather than nullable." },
              { type: "missing_field" as any, field: "createdAt", severity: "medium" as any, description: "Standard audit fields are missing from the response.", suggestion: "Include createdAt and updatedAt ISO-8601 timestamps." }
            ],
            suggestedSchema: "type User = {\n  id: string;\n  name: string;\n  email?: string;\n  createdAt: string;\n}"
          });
        }, 1000);
      }
    });
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">API Contract Reviewer</h1>
          <p className="text-muted-foreground mt-1">Detect schema drift and compatibility risks before they cause incidents.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-card border-card-border shadow-lg h-fit">
            <CardHeader>
              <CardTitle className="text-xl flex items-center gap-2">
                <FileJson className="h-5 w-5 text-primary" />
                Contract Definition
              </CardTitle>
              <CardDescription>Paste sample payloads to validate schema robustness.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="serviceName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Name (Optional)</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. user-service" className="bg-background" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="version"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>API Version</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. v2" className="bg-background" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="requestJson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sample Request JSON</FormLabel>
                        <FormControl>
                          <Textarea className="bg-background font-mono text-xs h-32" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="responseJson"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sample Response JSON</FormLabel>
                        <FormControl>
                          <Textarea className="bg-background font-mono text-xs h-32" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={reviewMutation.isPending} className="w-full">
                    {reviewMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing...</> : "Review Contract"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {review ? (
              <div className="animate-in fade-in slide-in-from-right-4 duration-500 space-y-6">
                <Card className="bg-card border-card-border border-l-4 border-l-primary">
                  <CardHeader className="pb-4">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-xl">Analysis Summary</CardTitle>
                      <StatusBadge label={review.overallRisk} type="severity" />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{review.summary}</p>
                  </CardContent>
                </Card>

                <h3 className="text-lg font-semibold tracking-tight">Identified Findings</h3>
                <div className="space-y-4">
                  {review.findings.map((finding, i) => (
                    <Card key={i} className="bg-card border-card-border">
                      <CardContent className="p-4 flex gap-4 items-start">
                        {finding.severity === "high" ? 
                          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" /> : 
                          finding.severity === "medium" ?
                          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" /> :
                          <Info className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
                        }
                        <div className="space-y-2 w-full">
                          <div className="flex justify-between">
                            <span className="font-mono text-sm text-primary">{finding.field}</span>
                            <StatusBadge label={finding.severity} type="severity" />
                          </div>
                          <p className="text-sm text-foreground">{finding.description}</p>
                          <div className="bg-emerald-950/20 border border-emerald-900/30 p-3 rounded text-sm text-emerald-500/90 flex gap-2 mt-2">
                            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            {finding.suggestion}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {review.suggestedSchema && (
                  <Card className="bg-card border-card-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Suggested TypeScript Interface</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <pre className="p-4 bg-background border border-border rounded-md text-xs font-mono overflow-x-auto text-cyan-400">
                        {review.suggestedSchema}
                      </pre>
                    </CardContent>
                  </Card>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-lg bg-muted/10 text-center">
                <FileJson className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">No Review Yet</h3>
                <p className="text-muted-foreground max-w-sm mt-2 text-sm">Submit your JSON payloads to generate an automated architecture and schema review.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
