import { TimelineEvent, ServiceGroup } from "@workspace/api-client-react";
import { StatusBadge } from "./StatusBadge";
import { format } from "date-fns";
import { AlertTriangle, Flame } from "lucide-react";

const SERVICE_COLORS = [
  "bg-blue-500 border-blue-500",
  "bg-violet-500 border-violet-500",
  "bg-emerald-500 border-emerald-500",
  "bg-amber-500 border-amber-500",
  "bg-rose-500 border-rose-500",
  "bg-cyan-500 border-cyan-500",
  "bg-fuchsia-500 border-fuchsia-500",
  "bg-orange-500 border-orange-500",
];

const SERVICE_TEXT_COLORS = [
  "text-blue-400",
  "text-violet-400",
  "text-emerald-400",
  "text-amber-400",
  "text-rose-400",
  "text-cyan-400",
  "text-fuchsia-400",
  "text-orange-400",
];

const SERVICE_BG_COLORS = [
  "bg-blue-500/10 border-blue-500/20",
  "bg-violet-500/10 border-violet-500/20",
  "bg-emerald-500/10 border-emerald-500/20",
  "bg-amber-500/10 border-amber-500/20",
  "bg-rose-500/10 border-rose-500/20",
  "bg-cyan-500/10 border-cyan-500/20",
  "bg-fuchsia-500/10 border-fuchsia-500/20",
  "bg-orange-500/10 border-orange-500/20",
];

function buildServiceColorMap(events: TimelineEvent[]): Map<string, number> {
  const map = new Map<string, number>();
  let idx = 0;
  for (const e of events) {
    if (!map.has(e.service)) {
      map.set(e.service, idx % SERVICE_COLORS.length);
      idx++;
    }
  }
  return map;
}

interface TimelineViewProps {
  events: TimelineEvent[];
  firstFailureService?: string | null;
  serviceGroups?: ServiceGroup[];
}

export function TimelineView({ events, firstFailureService, serviceGroups }: TimelineViewProps) {
  if (!events || events.length === 0)
    return <p className="text-muted-foreground text-sm">No timeline events available.</p>;

  const colorMap = buildServiceColorMap(events);
  const services = Array.from(colorMap.keys());

  // Find first error event index
  const firstErrorIdx = events.findIndex(
    (e) => e.level === "ERROR" || e.level === "FATAL"
  );

  return (
    <div className="space-y-4">
      {/* Service legend */}
      {services.length > 1 && (
        <div className="flex flex-wrap gap-2 pb-3 border-b border-border">
          <span className="text-xs text-muted-foreground font-medium mr-1 self-center">Services:</span>
          {services.map((svc) => {
            const idx = colorMap.get(svc)!;
            const role = serviceGroups?.find((g) => g.service === svc)?.role;
            const isOrigin = svc === firstFailureService;
            return (
              <span
                key={svc}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${SERVICE_BG_COLORS[idx]} ${SERVICE_TEXT_COLORS[idx]}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${SERVICE_COLORS[idx].split(" ")[0]}`} />
                {svc}
                {isOrigin && <Flame className="h-3 w-3 text-red-400" />}
                {role && !isOrigin && role !== "inferred" && (
                  <span className="opacity-60 text-[10px]">({role})</span>
                )}
              </span>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="relative border-l-2 border-border/50 ml-5 space-y-0 pb-4">
        {events.map((event, i) => {
          const colorIdx = colorMap.get(event.service) ?? 0;
          const isFirstError = i === firstErrorIdx;
          const isError = event.level === "ERROR" || event.level === "FATAL";
          const isFirstFailureSvc = event.service === firstFailureService;

          return (
            <div key={i} className={`relative pl-8 pb-0 group ${isFirstError ? "pb-1" : ""}`}>
              {/* Connector dot */}
              <span
                className={`absolute -left-[7px] top-3 h-3.5 w-3.5 rounded-full border-2 shadow-sm transition-transform group-hover:scale-125 ${
                  isFirstError
                    ? "bg-red-500 border-red-400 shadow-[0_0_10px_rgba(239,68,68,0.6)]"
                    : isError
                    ? "bg-red-900 border-red-600"
                    : SERVICE_COLORS[colorIdx]
                }`}
              />

              {/* First failure label */}
              {isFirstError && (
                <div className="flex items-center gap-1.5 mb-1 mt-0.5">
                  <span className="inline-flex items-center gap-1 bg-red-500/15 border border-red-500/30 text-red-400 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase">
                    <Flame className="h-3 w-3" />
                    First Failure Point
                  </span>
                </div>
              )}

              <div
                className={`flex flex-col gap-1.5 py-2.5 px-3 rounded-md border transition-colors ${
                  isFirstError
                    ? "bg-red-950/20 border-red-900/40"
                    : isError
                    ? "bg-red-950/10 border-red-900/20 hover:border-red-900/40"
                    : event.level === "WARN"
                    ? "bg-amber-950/10 border-amber-900/15 hover:border-amber-900/30"
                    : "bg-muted/20 border-border/30 hover:border-border/60"
                } mb-3`}
              >
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-mono text-muted-foreground tabular-nums">
                    {format(new Date(event.timestamp), "HH:mm:ss.SSS")}
                  </span>
                  <span className={`text-sm font-semibold ${SERVICE_TEXT_COLORS[colorIdx]}`}>
                    {event.service}
                    {isFirstFailureSvc && i === 0 && (
                      <span className="ml-1.5 text-[10px] font-normal opacity-60">(origin)</span>
                    )}
                  </span>
                  <StatusBadge label={event.level} type="level" />
                </div>
                <div className="font-mono text-xs text-muted-foreground break-words leading-relaxed">
                  {event.message}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
