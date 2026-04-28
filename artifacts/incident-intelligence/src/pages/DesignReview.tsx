import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useReviewDesign, DesignReview } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Layers, Loader2, ShieldCheck, Zap, Server, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/StatusBadge";

const formSchema = z.object({
  systemName: z.string().optional(),
  architectureNotes: z.string().min(10, "Please provide more detailed architecture notes"),
});

export default function DesignReviewPage() {
  const { toast } = useToast();
  const reviewMutation = useReviewDesign();
  const [review, setReview] = useState<DesignReview | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      systemName: "",
      architectureNotes: "A microservice that processes user uploads. It accepts a file via HTTP POST, saves it to S3, and then pushes a message to Kafka. A separate worker reads from Kafka, downloads the file, processes it, and writes the result to a Postgres database.",
    },
  });

  const onSubmit = (data: z.infer<typeof formSchema>) => {
    reviewMutation.mutate({ data }, {
      onSuccess: (result) => {
        setReview(result);
        toast({ title: "Design Review Complete" });
      },
      onError: () => {
        toast({ title: "API Error - Using Mock Data", variant: "destructive" });
        setTimeout(() => {
          setReview({
            overallScore: 78,
            summary: "The design handles asynchronous processing well by decoupling the API from the worker via Kafka. However, there are notable edge cases around transactionality and S3 failure modes that could cause data inconsistency.",
            topRecommendations: [
              "Implement the Outbox Pattern or 2PC for the S3 upload + Kafka publish step.",
              "Ensure Kafka consumers are idempotent as at-least-once delivery may cause duplicate processing.",
              "Add a dead-letter queue (DLQ) for failed processing attempts."
            ],
            findings: [
              { category: "reliability" as any, severity: "high" as any, title: "Dual Write Problem", description: "Writing to S3 and then publishing to Kafka is a distributed transaction. If Kafka is down after the S3 write succeeds, the system is left in an inconsistent state.", recommendation: "Save the intent to a database table in the same transaction as the request, then use a CDC tool (like Debezium) to publish to Kafka." },
              { category: "scalability" as any, severity: "medium" as any, title: "Large File Handling", description: "Passing large files through the API gateway might consume excessive memory and block threads.", recommendation: "Consider generating an S3 pre-signed URL for direct client uploads, entirely bypassing the API container." },
              { category: "observability" as any, severity: "low" as any, title: "Trace Continuity", description: "Trace IDs need to propagate through Kafka headers to link API requests with worker processing logs.", recommendation: "Ensure OpenTelemetry headers are injected into Kafka message headers." }
            ]
          });
        }, 1500);
      }
    });
  };

  const getCategoryIcon = (cat: string) => {
    switch(cat) {
      case "security": return <ShieldCheck className="h-4 w-4" />;
      case "scalability": return <Zap className="h-4 w-4" />;
      case "reliability": return <Server className="h-4 w-4" />;
      case "observability": return <Eye className="h-4 w-4" />;
      default: return <Layers className="h-4 w-4" />;
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">System Design Reviewer</h1>
          <p className="text-muted-foreground mt-1">AI-assisted architecture critique for reliability and scalability.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card className="col-span-1 lg:col-span-5 bg-card border-card-border h-fit">
            <CardHeader>
              <CardTitle className="text-xl">Architecture Details</CardTitle>
              <CardDescription>Describe your components, data flows, and constraints.</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="systemName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>System Name (Optional)</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Media Processing Pipeline" className="bg-background" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="architectureNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Design Description</FormLabel>
                        <FormControl>
                          <Textarea className="bg-background min-h-[300px] leading-relaxed" placeholder="Describe the architecture..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" disabled={reviewMutation.isPending} className="w-full">
                    {reviewMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reviewing Architecture...</> : "Submit for Review"}
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>

          <div className="col-span-1 lg:col-span-7 space-y-6">
            {review ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Card className="col-span-1 sm:col-span-1 bg-card border-card-border flex flex-col items-center justify-center p-6">
                    <div className="relative w-24 h-24 flex items-center justify-center rounded-full border-4 border-primary">
                      <span className="text-3xl font-bold text-foreground">{review.overallScore}</span>
                    </div>
                    <p className="mt-4 text-sm font-medium uppercase tracking-wider text-muted-foreground">Score</p>
                  </Card>
                  
                  <Card className="col-span-1 sm:col-span-2 bg-card border-card-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Executive Summary</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground leading-relaxed">{review.summary}</p>
                    </CardContent>
                  </Card>
                </div>

                <Card className="bg-card border-card-border border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">Top Recommendations</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-3">
                      {review.topRecommendations.map((rec, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary text-xs font-bold">{i+1}</span>
                          <span className="text-foreground">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <h3 className="text-lg font-semibold tracking-tight">Detailed Findings</h3>
                <div className="space-y-4">
                  {review.findings.map((finding, i) => (
                    <Card key={i} className="bg-card border-card-border">
                      <CardContent className="p-5 space-y-4">
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-primary font-medium text-sm">
                              {getCategoryIcon(finding.category)}
                              <span className="uppercase tracking-wider">{finding.category}</span>
                            </div>
                            <h4 className="font-semibold text-foreground text-lg">{finding.title}</h4>
                          </div>
                          <StatusBadge label={finding.severity} type="severity" />
                        </div>
                        
                        <p className="text-sm text-muted-foreground">{finding.description}</p>
                        
                        <div className="bg-muted/30 p-3 rounded-md border border-border text-sm">
                          <span className="font-semibold text-foreground block mb-1">Recommendation:</span>
                          <span className="text-muted-foreground">{finding.recommendation}</span>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center p-12 border border-dashed border-border rounded-lg bg-muted/10 text-center min-h-[400px]">
                <Layers className="h-12 w-12 text-muted-foreground/50 mb-4" />
                <h3 className="text-lg font-medium">Awaiting Architecture</h3>
                <p className="text-muted-foreground max-w-sm mt-2 text-sm">Describe your system components and data flows to receive a comprehensive review covering scalability, reliability, and security.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
