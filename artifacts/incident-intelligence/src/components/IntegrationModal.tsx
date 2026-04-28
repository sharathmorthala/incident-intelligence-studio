import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, XCircle, Info } from "lucide-react";
import { fetchIntegrations, saveIntegration, testIntegration, type BackendIntegration } from "@/lib/backend-api";

export type IntegrationStatus = "not-connected" | "demo" | "connected" | "failed";

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "password" | "url";
  optional?: boolean;
  isSecret?: boolean;
}

interface BoolFieldDef {
  key: string;
  label: string;
  defaultValue?: boolean;
}

interface IntegrationSpec {
  description: string;
  category: "log-source" | "ai-model";
  fields: FieldDef[];
  boolFields?: BoolFieldDef[];
}

const INTEGRATION_SPECS: Record<string, IntegrationSpec> = {
  "OpenSearch": {
    description: "Connect to AWS OpenSearch for log aggregation and distributed tracing.",
    category: "log-source",
    fields: [
      { key: "endpointUrl", label: "Endpoint URL", placeholder: "https://my-cluster.us-east-1.es.amazonaws.com", type: "url" },
      { key: "indexPattern", label: "Index Pattern", placeholder: "logs-*" },
      { key: "username", label: "Username", placeholder: "admin", optional: true },
      { key: "apiKey", label: "API Key or Password", placeholder: "Enter API key or password", isSecret: true, optional: true },
    ],
    boolFields: [{ key: "tlsEnabled", label: "TLS / HTTPS Enabled", defaultValue: true }],
  },
  "Elasticsearch": {
    description: "Connect to your ELK stack to analyze application logs and correlate errors.",
    category: "log-source",
    fields: [
      { key: "endpointUrl", label: "Endpoint URL", placeholder: "https://elasticsearch.internal:9200", type: "url" },
      { key: "indexPattern", label: "Index Pattern", placeholder: "app-logs-*" },
      { key: "username", label: "Username", placeholder: "elastic", optional: true },
      { key: "apiKey", label: "API Key or Password", placeholder: "Enter API key or password", isSecret: true, optional: true },
    ],
    boolFields: [{ key: "tlsEnabled", label: "TLS / HTTPS Enabled", defaultValue: true }],
  },
  "Splunk": {
    description: "Query Splunk enterprise indexes directly for massive scale log correlation.",
    category: "log-source",
    fields: [
      { key: "splunkHost", label: "Splunk Host URL", placeholder: "https://splunk.company.com:8089", type: "url" },
      { key: "hecToken", label: "HEC Token or API Token", placeholder: "Enter HEC or REST API token", isSecret: true },
      { key: "index", label: "Index", placeholder: "main" },
      { key: "sourceType", label: "Source Type", placeholder: "_json", optional: true },
    ],
  },
  "Grafana Loki": {
    description: "Analyze Loki streams and correlate logs with Prometheus metrics.",
    category: "log-source",
    fields: [
      { key: "lokiEndpoint", label: "Loki Endpoint URL", placeholder: "http://loki.monitoring.svc:3100", type: "url" },
      { key: "tenantId", label: "Tenant ID", placeholder: "tenant-1", optional: true },
      { key: "username", label: "Basic Auth Username", placeholder: "admin", optional: true },
      { key: "password", label: "Basic Auth Password", placeholder: "••••••••", isSecret: true, optional: true },
      { key: "labelSelector", label: "Default Label Selector", placeholder: '{app="my-service"}', optional: true },
    ],
  },
  "AWS CloudWatch": {
    description: "Analyze CloudWatch log groups for Lambda, ECS, and API Gateway failures.",
    category: "log-source",
    fields: [
      { key: "awsRegion", label: "AWS Region", placeholder: "us-east-1" },
      { key: "logGroupName", label: "Log Group Name", placeholder: "/aws/lambda/my-function" },
      { key: "accessKeyId", label: "Access Key ID", placeholder: "AKIAIOSFODNN7EXAMPLE" },
      { key: "secretAccessKey", label: "Secret Access Key", placeholder: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", isSecret: true },
    ],
  },
  "Azure OpenAI": {
    description: "Use Azure-hosted LLMs for root cause analysis (Enterprise compliance).",
    category: "ai-model",
    fields: [
      { key: "endpointUrl", label: "Endpoint", placeholder: "https://my-resource.openai.azure.com/", type: "url" },
      { key: "deploymentName", label: "Deployment Name", placeholder: "gpt-4o" },
      { key: "apiVersion", label: "API Version", placeholder: "2024-02-01" },
      { key: "apiKey", label: "API Key", placeholder: "Enter Azure OpenAI API key", isSecret: true },
    ],
  },
  "OpenAI": {
    description: "Use OpenAI GPT models for intelligent root cause analysis.",
    category: "ai-model",
    fields: [
      { key: "apiKey", label: "API Key", placeholder: "sk-••••••••••••••••••••••••", isSecret: true },
      { key: "modelName", label: "Model Name", placeholder: "gpt-4o" },
    ],
  },
  "AWS Bedrock": {
    description: "Use Amazon Bedrock foundation models (Claude 3, Llama 3) for RCA generation.",
    category: "ai-model",
    fields: [
      { key: "awsRegion", label: "AWS Region", placeholder: "us-east-1" },
      { key: "modelId", label: "Model ID", placeholder: "anthropic.claude-3-5-sonnet-20241022-v2:0" },
      { key: "accessKeyId", label: "Access Key ID", placeholder: "AKIAIOSFODNN7EXAMPLE" },
      { key: "secretAccessKey", label: "Secret Access Key", placeholder: "••••••••••••", isSecret: true },
    ],
  },
  "Ollama": {
    description: "Run models locally for strict air-gapped compliance and zero data egress.",
    category: "ai-model",
    fields: [
      { key: "baseUrl", label: "Base URL", placeholder: "http://localhost:11434", type: "url" },
      { key: "modelName", label: "Model Name", placeholder: "llama3.2" },
    ],
  },
};

interface IntegrationModalProps {
  name: string;
  open: boolean;
  onClose: () => void;
  onSaved: (status: IntegrationStatus) => void;
}

export function IntegrationModal({ name, open, onClose, onSaved }: IntegrationModalProps) {
  const spec = INTEGRATION_SPECS[name];
  const { toast } = useToast();

  const [fields, setFields] = useState<Record<string, string>>({});
  const [boolFields, setBoolFields] = useState<Record<string, boolean>>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latencyMs?: number | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [savedConfig, setSavedConfig] = useState<BackendIntegration | null>(null);

  useEffect(() => {
    if (!open || !spec) return;

    setTestResult(null);
    setLoadingExisting(true);

    fetchIntegrations()
      .then((all) => {
        const existing = all.find((i) => i.name === name) ?? null;
        setSavedConfig(existing);

        if (existing) {
          const displayFields: Record<string, string> = {};
          for (const fd of spec.fields) {
            displayFields[fd.key] = existing.fields[fd.key] ?? "";
          }
          setFields(displayFields);
          setBoolFields(existing.boolFields ?? {});
        } else {
          const defaultFields: Record<string, string> = {};
          const defaultBools: Record<string, boolean> = {};
          for (const fd of spec.fields) defaultFields[fd.key] = "";
          for (const bd of spec.boolFields ?? []) defaultBools[bd.key] = bd.defaultValue ?? false;
          setFields(defaultFields);
          setBoolFields(defaultBools);
        }
      })
      .catch(() => {
        const defaultFields: Record<string, string> = {};
        for (const fd of spec.fields) defaultFields[fd.key] = "";
        setFields(defaultFields);
        setBoolFields({});
        setSavedConfig(null);
      })
      .finally(() => setLoadingExisting(false));
  }, [open, name]);

  if (!spec) return null;

  function updateField(key: string, value: string) {
    setFields((prev) => ({ ...prev, [key]: value }));
    if (testResult) setTestResult(null);
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await testIntegration({ name, fields, boolFields });
      setTestResult({ ok: result.ok, message: result.message, latencyMs: result.latencyMs });
      toast({
        title: result.ok ? "Connection successful" : "Connection failed",
        description: result.message,
        variant: result.ok ? "default" : "destructive",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setTestResult({ ok: false, message: msg });
      toast({
        title: "Test failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveIntegration({ name, fields, boolFields });
      onSaved(result.status as IntegrationStatus);
      toast({
        title: "Configuration saved",
        description: `${name} configuration saved to server. ${testResult?.ok ? "Status: Connected." : "Status: Demo Mode — test connection to verify credentials."}`,
      });
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      toast({ title: "Save failed", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const missingRequired = spec.fields.some((fd) => {
    if (fd.optional) return false;
    const val = fields[fd.key] ?? "";
    const isMasked = val.startsWith("••••") && !!savedConfig?.fields[fd.key];
    return !val.trim() && !isMasked;
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg bg-card border-card-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{name} — Configuration</DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm">
            {spec.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-start gap-2 rounded-md bg-primary/10 border border-primary/20 px-3 py-2 text-xs text-primary mt-1">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <strong>Demo mode</strong> uses generated sample logs.{" "}
            <strong>Connected mode</strong> queries your actual {spec.category === "ai-model" ? "AI provider" : "log source"}.
            Credentials are stored server-side encrypted and never returned to the browser.
          </span>
        </div>

        {loadingExisting ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading saved configuration...</span>
          </div>
        ) : (
          <div className="space-y-4 mt-2">
            {spec.fields.map((fd) => {
              const isSecret = fd.isSecret;
              const val = fields[fd.key] ?? "";
              const isMasked = isSecret && val.startsWith("••••") && !!savedConfig?.fields[fd.key];

              return (
                <div key={fd.key} className="space-y-1.5">
                  <Label htmlFor={fd.key} className="text-sm font-medium flex items-center gap-1.5">
                    {fd.label}
                    {fd.optional && (
                      <span className="text-muted-foreground font-normal text-xs">(optional)</span>
                    )}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id={fd.key}
                      type={isSecret ? "password" : "text"}
                      placeholder={isMasked ? "" : fd.placeholder}
                      value={val}
                      onChange={(e) => updateField(fd.key, e.target.value)}
                      disabled={isMasked}
                      className="bg-muted/30 border-muted text-foreground placeholder:text-muted-foreground/50 text-sm font-mono disabled:opacity-60 disabled:cursor-default"
                    />
                    {isSecret && savedConfig && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 text-xs"
                        onClick={() => {
                          if (isMasked) {
                            updateField(fd.key, "");
                          } else {
                            updateField(fd.key, savedConfig.fields[fd.key] ?? "••••••••");
                          }
                        }}
                      >
                        {isMasked ? "Change" : "Keep Saved"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}

            {(spec.boolFields ?? []).map((bd) => (
              <div key={bd.key} className="flex items-center gap-2">
                <Checkbox
                  id={bd.key}
                  checked={boolFields[bd.key] ?? bd.defaultValue ?? false}
                  onCheckedChange={(v) =>
                    setBoolFields((prev) => ({ ...prev, [bd.key]: !!v }))
                  }
                />
                <Label htmlFor={bd.key} className="text-sm cursor-pointer select-none">
                  {bd.label}
                </Label>
              </div>
            ))}

            {testResult && (
              <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                testResult.ok
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-red-500/10 border border-red-500/20 text-red-400"
              }`}>
                {testResult.ok
                  ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                  : <XCircle className="h-4 w-4 shrink-0" />}
                <span className="text-xs">{testResult.message}{testResult.latencyMs != null ? ` (${testResult.latencyMs}ms)` : ""}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={testing || missingRequired || loadingExisting}
            className="w-full"
          >
            {testing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {testing ? "Testing connection..." : "Test Connection"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || missingRequired || loadingExisting}
            className="w-full"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? "Saving..." : "Save Configuration"}
          </Button>
          <Button variant="ghost" onClick={onClose} className="w-full text-muted-foreground">
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
