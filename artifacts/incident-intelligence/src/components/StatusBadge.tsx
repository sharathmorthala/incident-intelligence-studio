import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  label: string;
  type?: "confidence" | "severity" | "level";
  className?: string;
}

export function StatusBadge({ label, type, className }: StatusBadgeProps) {
  const l = label.toLowerCase();
  
  let colorClass = "bg-muted text-muted-foreground";

  if (type === "confidence") {
    if (l === "high") colorClass = "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20";
    else if (l === "medium") colorClass = "bg-amber-500/15 text-amber-500 border border-amber-500/20";
    else if (l === "low") colorClass = "bg-red-500/15 text-red-500 border border-red-500/20";
  } else if (type === "severity") {
    if (l === "critical" || l === "high") colorClass = "bg-red-500/15 text-red-500 border border-red-500/20";
    else if (l === "medium") colorClass = "bg-amber-500/15 text-amber-500 border border-amber-500/20";
    else if (l === "low") colorClass = "bg-emerald-500/15 text-emerald-500 border border-emerald-500/20";
  } else if (type === "level") {
    if (l === "fatal" || l === "error") colorClass = "bg-red-500/15 text-red-500 border border-red-500/20";
    else if (l === "warn") colorClass = "bg-amber-500/15 text-amber-500 border border-amber-500/20";
    else if (l === "info") colorClass = "bg-blue-500/15 text-blue-500 border border-blue-500/20";
  } else {
    // Default fallback colors
    if (l === "high" || l === "critical" || l === "error" || l === "fatal") colorClass = "bg-red-500/15 text-red-500 border border-red-500/20";
    else if (l === "medium" || l === "warn") colorClass = "bg-amber-500/15 text-amber-500 border border-amber-500/20";
    else if (l === "low" || l === "info") colorClass = "bg-blue-500/15 text-blue-500 border border-blue-500/20";
  }

  return (
    <span
      className={cn(
        "px-2 py-0.5 text-xs font-medium rounded-sm uppercase tracking-wider",
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
