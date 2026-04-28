import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { IntegrationStatus } from "@/components/IntegrationModal";

interface IntegrationCardProps {
  name: string;
  description: string;
  status: IntegrationStatus;
  icon: React.ReactNode;
  savedAt?: string;
  onConfigure: () => void;
}

const STATUS_CONFIG: Record<IntegrationStatus, {
  dot: string;
  ping: string;
  label: string;
  buttonLabel: string;
  buttonVariant: "default" | "outline" | "secondary";
}> = {
  connected: {
    dot: "bg-emerald-500",
    ping: "bg-emerald-400 animate-ping",
    label: "Connected",
    buttonLabel: "Configure",
    buttonVariant: "outline",
  },
  demo: {
    dot: "bg-amber-500",
    ping: "bg-amber-400",
    label: "Demo Mode",
    buttonLabel: "Configure Provider",
    buttonVariant: "outline",
  },
  "not-connected": {
    dot: "bg-muted-foreground",
    ping: "bg-muted-foreground",
    label: "Not Connected",
    buttonLabel: "Connect",
    buttonVariant: "default",
  },
  failed: {
    dot: "bg-red-500",
    ping: "bg-red-400 animate-ping",
    label: "Connection Failed",
    buttonLabel: "Reconfigure",
    buttonVariant: "default",
  },
};

export function IntegrationCard({ name, description, status, icon, savedAt, onConfigure }: IntegrationCardProps) {
  const cfg = STATUS_CONFIG[status];

  return (
    <Card className="flex flex-col h-full bg-card border-card-border hover:border-primary/50 transition-colors">
      <CardHeader className="flex flex-row items-center gap-4 pb-4">
        <div className="h-10 w-10 rounded bg-muted/50 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <CardTitle className="text-base">{name}</CardTitle>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg.ping}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${cfg.dot}`} />
            </span>
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider truncate">
              {cfg.label}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-2">
        <p className="text-sm text-muted-foreground">{description}</p>
        {savedAt && (
          <p className="text-xs text-muted-foreground/60">
            Last configured {new Date(savedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
        {status === "demo" && (
          <p className="text-xs text-amber-500/80 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-1">
            Demo mode — uses generated sample logs
          </p>
        )}
      </CardContent>

      <CardFooter>
        <Button
          variant={cfg.buttonVariant}
          className="w-full"
          onClick={onConfigure}
        >
          {cfg.buttonLabel}
        </Button>
      </CardFooter>
    </Card>
  );
}
