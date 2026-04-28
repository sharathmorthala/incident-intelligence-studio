import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: React.ReactNode;
  trend?: string;
  trendDirection?: "up" | "down" | "neutral";
  icon?: React.ReactNode;
  className?: string;
}

export function MetricCard({ title, value, trend, trendDirection, icon, className }: MetricCardProps) {
  return (
    <Card className={cn("bg-card border-card-border", className)}>
      <CardContent className="p-6 flex flex-col justify-between h-full">
        <div className="flex justify-between items-start mb-4">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          {icon && <div className="text-muted-foreground opacity-70">{icon}</div>}
        </div>
        <div>
          <h3 className="text-3xl font-bold tracking-tight text-foreground">{value}</h3>
          {trend && (
            <div className="mt-2 flex items-center text-sm">
              <span
                className={cn("font-medium", {
                  "text-emerald-500": trendDirection === "up",
                  "text-red-500": trendDirection === "down",
                  "text-muted-foreground": trendDirection === "neutral",
                })}
              >
                {trend}
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
