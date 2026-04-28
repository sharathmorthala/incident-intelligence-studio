import { TimelineEvent } from "@workspace/api-client-react";
import { StatusBadge } from "./StatusBadge";
import { format } from "date-fns";

export function TimelineView({ events }: { events: TimelineEvent[] }) {
  if (!events || events.length === 0) return <p className="text-muted-foreground text-sm">No timeline events available.</p>;

  return (
    <div className="relative border-l border-border ml-4 space-y-6 pb-4">
      {events.map((event, i) => (
        <div key={i} className="relative pl-6">
          <span className="absolute -left-1.5 top-1.5 h-3 w-3 rounded-full bg-background border border-primary shadow-[0_0_8px_rgba(var(--primary),0.5)]"></span>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-mono text-muted-foreground">{format(new Date(event.timestamp), "HH:mm:ss.SSS")}</span>
              <span className="text-sm font-medium">{event.service}</span>
              <StatusBadge label={event.level} type="level" />
            </div>
            <div className="bg-muted/30 p-3 rounded-md border border-border/50 text-sm font-mono text-muted-foreground break-words overflow-x-auto">
              {event.message}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
