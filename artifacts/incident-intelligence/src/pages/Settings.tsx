import { AppLayout } from "@/components/layout/AppLayout";
import { IntegrationCard } from "@/components/IntegrationCard";
import { Search, Database, Cloud, Activity, MessageSquare, TerminalSquare, Box, Cpu } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function Settings() {
  const integrations = [
    {
      name: "Elasticsearch",
      description: "Connect to your ELK stack to analyze application logs and correlate errors.",
      status: "connected" as const,
      icon: <Database className="h-5 w-5 text-emerald-500" />
    },
    {
      name: "OpenSearch",
      description: "Connect to AWS OpenSearch for log aggregation and distributed tracing.",
      status: "connected" as const,
      icon: <Search className="h-5 w-5 text-blue-400" />
    },
    {
      name: "AWS CloudWatch",
      description: "Analyze CloudWatch log groups for Lambda, ECS, and API Gateway failures.",
      status: "disconnected" as const,
      icon: <Cloud className="h-5 w-5 text-orange-400" />
    },
    {
      name: "Splunk",
      description: "Query Splunk enterprise indexes directly for massive scale log correlation.",
      status: "disconnected" as const,
      icon: <TerminalSquare className="h-5 w-5 text-pink-500" />
    },
    {
      name: "Grafana Loki",
      description: "Analyze Loki streams and correlate logs with Prometheus metrics.",
      status: "disconnected" as const,
      icon: <Activity className="h-5 w-5 text-orange-500" />
    },
    {
      name: "Azure OpenAI",
      description: "Use Azure-hosted LLMs for root cause analysis (Enterprise compliance).",
      status: "connected" as const,
      icon: <MessageSquare className="h-5 w-5 text-cyan-500" />
    },
    {
      name: "AWS Bedrock",
      description: "Use Amazon Bedrock foundation models (Claude 3, Llama 3) for RCA generation.",
      status: "demo" as const,
      icon: <Box className="h-5 w-5 text-indigo-400" />
    },
    {
      name: "Ollama (Local)",
      description: "Run models locally for strict air-gapped compliance and zero data egress.",
      status: "disconnected" as const,
      icon: <Cpu className="h-5 w-5 text-white" />
    }
  ];

  const logSources = integrations.filter(i => !["Azure OpenAI", "AWS Bedrock", "Ollama (Local)"].includes(i.name));
  const aiModels = integrations.filter(i => ["Azure OpenAI", "AWS Bedrock", "Ollama (Local)"].includes(i.name));

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings & Integrations</h1>
          <p className="text-muted-foreground mt-1">Manage data sources, API keys, and workspace preferences.</p>
        </div>

        <Tabs defaultValue="integrations" className="w-full">
          <TabsList className="bg-muted/30">
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="general">General Settings</TabsTrigger>
            <TabsTrigger value="team">Team & Access</TabsTrigger>
          </TabsList>
          
          <TabsContent value="integrations" className="space-y-8 mt-6">
            <section>
              <h2 className="text-xl font-semibold mb-4 tracking-tight">Log Sources</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {logSources.map((integration, i) => (
                  <IntegrationCard key={i} {...integration} />
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-xl font-semibold mb-4 tracking-tight">AI Models & Engines</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aiModels.map((integration, i) => (
                  <IntegrationCard key={i} {...integration} />
                ))}
              </div>
            </section>
          </TabsContent>
          
          <TabsContent value="general">
            <div className="p-8 border border-border border-dashed rounded-lg text-center mt-6">
              <p className="text-muted-foreground">General settings placeholder.</p>
            </div>
          </TabsContent>

          <TabsContent value="team">
            <div className="p-8 border border-border border-dashed rounded-lg text-center mt-6">
              <p className="text-muted-foreground">Team management placeholder.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
