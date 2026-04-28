import { useState, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { IntegrationCard } from "@/components/IntegrationCard";
import { IntegrationModal, loadConfig, type IntegrationStatus } from "@/components/IntegrationModal";
import { Search, Database, Cloud, Activity, MessageSquare, TerminalSquare, Box, Cpu, Zap } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface IntegrationDef {
  name: string;
  description: string;
  icon: React.ReactNode;
  category: "log-source" | "ai-model";
}

const INTEGRATIONS: IntegrationDef[] = [
  {
    name: "Elasticsearch",
    description: "Connect to your ELK stack to analyze application logs and correlate errors across distributed services.",
    icon: <Database className="h-5 w-5 text-emerald-500" />,
    category: "log-source",
  },
  {
    name: "OpenSearch",
    description: "Connect to AWS OpenSearch for log aggregation, distributed tracing, and anomaly detection.",
    icon: <Search className="h-5 w-5 text-blue-400" />,
    category: "log-source",
  },
  {
    name: "AWS CloudWatch",
    description: "Analyze CloudWatch log groups for Lambda, ECS, EKS, and API Gateway failures.",
    icon: <Cloud className="h-5 w-5 text-orange-400" />,
    category: "log-source",
  },
  {
    name: "Splunk",
    description: "Query Splunk enterprise indexes directly for massive scale log correlation and compliance.",
    icon: <TerminalSquare className="h-5 w-5 text-pink-500" />,
    category: "log-source",
  },
  {
    name: "Grafana Loki",
    description: "Analyze Loki log streams and correlate with Prometheus metrics for full observability.",
    icon: <Activity className="h-5 w-5 text-orange-500" />,
    category: "log-source",
  },
  {
    name: "Azure OpenAI",
    description: "Use Azure-hosted GPT-4o for AI-powered root cause analysis with enterprise compliance.",
    icon: <MessageSquare className="h-5 w-5 text-cyan-500" />,
    category: "ai-model",
  },
  {
    name: "OpenAI",
    description: "Use OpenAI GPT models for intelligent incident analysis and natural language RCA reports.",
    icon: <Zap className="h-5 w-5 text-emerald-400" />,
    category: "ai-model",
  },
  {
    name: "AWS Bedrock",
    description: "Use Amazon Bedrock foundation models (Claude 3.5, Llama 3) for AI-powered RCA generation.",
    icon: <Box className="h-5 w-5 text-indigo-400" />,
    category: "ai-model",
  },
  {
    name: "Ollama",
    description: "Run models locally for strict air-gapped compliance and zero data egress requirements.",
    icon: <Cpu className="h-5 w-5 text-slate-300" />,
    category: "ai-model",
  },
];

function getInitialStatus(name: string): IntegrationStatus {
  const saved = loadConfig(name);
  if (saved) return saved.status;
  return "not-connected";
}

function getSavedAt(name: string): string | undefined {
  const saved = loadConfig(name);
  return saved?.savedAt;
}

export default function Settings() {
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>(() => {
    const init: Record<string, IntegrationStatus> = {};
    for (const i of INTEGRATIONS) init[i.name] = getInitialStatus(i.name);
    return init;
  });

  const [savedAts, setSavedAts] = useState<Record<string, string | undefined>>(() => {
    const init: Record<string, string | undefined> = {};
    for (const i of INTEGRATIONS) init[i.name] = getSavedAt(i.name);
    return init;
  });

  const [modalOpen, setModalOpen] = useState<string | null>(null);

  const handleConfigure = useCallback((name: string) => {
    setModalOpen(name);
  }, []);

  const handleSaved = useCallback((name: string, status: IntegrationStatus) => {
    setStatuses((prev) => ({ ...prev, [name]: status }));
    setSavedAts((prev) => ({ ...prev, [name]: new Date().toISOString() }));
  }, []);

  const handleClose = useCallback(() => {
    setModalOpen(null);
  }, []);

  const logSources = INTEGRATIONS.filter((i) => i.category === "log-source");
  const aiModels = INTEGRATIONS.filter((i) => i.category === "ai-model");

  const connectedCount = Object.values(statuses).filter((s) => s === "connected").length;
  const demoCount = Object.values(statuses).filter((s) => s === "demo").length;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Settings & Integrations</h1>
            <p className="text-muted-foreground mt-1">Manage data sources, AI providers, and workspace preferences.</p>
          </div>
          <div className="flex gap-3 text-sm">
            <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-md px-3 py-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              {connectedCount} Connected
            </div>
            {demoCount > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-md px-3 py-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                </span>
                {demoCount} Demo Mode
              </div>
            )}
          </div>
        </div>

        <Tabs defaultValue="integrations" className="w-full">
          <TabsList className="bg-muted/30">
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="general">General Settings</TabsTrigger>
            <TabsTrigger value="team">Team & Access</TabsTrigger>
          </TabsList>

          <TabsContent value="integrations" className="space-y-8 mt-6">
            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-tight">Log Sources</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Connect your log aggregation platform. Demo mode uses generated sample logs — Connected mode queries your actual log source.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {logSources.map((integration) => (
                  <IntegrationCard
                    key={integration.name}
                    name={integration.name}
                    description={integration.description}
                    icon={integration.icon}
                    status={statuses[integration.name] ?? "not-connected"}
                    savedAt={savedAts[integration.name]}
                    onConfigure={() => handleConfigure(integration.name)}
                  />
                ))}
              </div>
            </section>

            <section>
              <div className="mb-4">
                <h2 className="text-xl font-semibold tracking-tight">AI Models & Engines</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Connect an AI provider to power intelligent root cause analysis. Demo mode uses deterministic rule-based analysis.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {aiModels.map((integration) => (
                  <IntegrationCard
                    key={integration.name}
                    name={integration.name}
                    description={integration.description}
                    icon={integration.icon}
                    status={statuses[integration.name] ?? "not-connected"}
                    savedAt={savedAts[integration.name]}
                    onConfigure={() => handleConfigure(integration.name)}
                  />
                ))}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="general">
            <div className="p-8 border border-border border-dashed rounded-lg text-center mt-6">
              <p className="text-muted-foreground text-sm">General settings — coming soon.</p>
            </div>
          </TabsContent>

          <TabsContent value="team">
            <div className="p-8 border border-border border-dashed rounded-lg text-center mt-6">
              <p className="text-muted-foreground text-sm">Team management — coming soon.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {modalOpen && (
        <IntegrationModal
          name={modalOpen}
          open={!!modalOpen}
          onClose={handleClose}
          onSaved={(status) => handleSaved(modalOpen, status)}
        />
      )}
    </AppLayout>
  );
}
