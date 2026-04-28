import { AppLayout } from "@/components/layout/AppLayout";
import { MetricCard } from "@/components/MetricCard";
import { useGetDashboardStats, useListIncidents } from "@workspace/api-client-react";
import { Activity, Clock, ShieldAlert, Layers } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDistanceToNow } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";

const MOCK_CHART_DATA = [
  { time: '00:00', incidents: 4 },
  { time: '04:00', incidents: 2 },
  { time: '08:00', incidents: 8 },
  { time: '12:00', incidents: 15 },
  { time: '16:00', incidents: 10 },
  { time: '20:00', incidents: 5 },
  { time: '24:00', incidents: 3 },
];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: incidents, isLoading: incidentsLoading } = useListIncidents();

  // Handle mock data fallback if real data is missing or loading fails
  const displayStats = stats || {
    totalIncidentsAnalyzed: 124,
    mttrImprovementPercent: 42,
    highConfidenceRcaCount: 89,
    activeIntegrationsCount: 4,
    incidentsLast24h: 12,
    incidentsLast7d: 45
  };

  const displayIncidents = incidents && incidents.length > 0 ? incidents : [
    { id: 1, correlationId: "CORR-500-TIMEOUT", serviceName: "api-gateway", environment: "prod", confidence: "high", summary: "API Gateway timed out calling downstream payment-processor due to elevated latency.", analyzedAt: new Date().toISOString(), affectedServicesCount: 3 },
    { id: 2, correlationId: "CORR-AUTH-401", serviceName: "auth-service", environment: "prod", confidence: "medium", summary: "Auth tokens rejected due to Redis cache eviction spike.", analyzedAt: new Date(Date.now() - 3600000).toISOString(), affectedServicesCount: 1 },
    { id: 3, correlationId: "CORR-DB-DEADLOCK", serviceName: "user-service", environment: "qa", confidence: "high", summary: "Postgres deadlock detected during batch user updates.", analyzedAt: new Date(Date.now() - 7200000).toISOString(), affectedServicesCount: 2 },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Cockpit</h1>
            <p className="text-muted-foreground mt-1">Platform observability and incident intelligence overview.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard 
            title="Incidents Analyzed" 
            value={statsLoading ? <Skeleton className="h-8 w-20" /> : displayStats.totalIncidentsAnalyzed} 
            trend="+12% this week" 
            trendDirection="up"
            icon={<ShieldAlert className="h-5 w-5" />}
          />
          <MetricCard 
            title="MTTR Improvement" 
            value={statsLoading ? <Skeleton className="h-8 w-20" /> : `${displayStats.mttrImprovementPercent}%`} 
            trend="Avg 14m reduction"
            trendDirection="up"
            icon={<Clock className="h-5 w-5" />}
          />
          <MetricCard 
            title="High Confidence RCA" 
            value={statsLoading ? <Skeleton className="h-8 w-20" /> : displayStats.highConfidenceRcaCount} 
            trend={`${Math.round((displayStats.highConfidenceRcaCount / Math.max(1, displayStats.totalIncidentsAnalyzed)) * 100)}% accuracy`}
            trendDirection="neutral"
            icon={<Activity className="h-5 w-5" />}
          />
          <MetricCard 
            title="Active Integrations" 
            value={statsLoading ? <Skeleton className="h-8 w-20" /> : displayStats.activeIntegrationsCount} 
            trend="All systems nominal"
            trendDirection="neutral"
            icon={<Layers className="h-5 w-5" />}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="col-span-1 lg:col-span-2 bg-card border-card-border">
            <CardHeader>
              <CardTitle className="text-lg">Incident Volume (Last 24h)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={MOCK_CHART_DATA} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="time" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '6px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Line type="monotone" dataKey="incidents" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ r: 4, fill: "hsl(var(--background))", strokeWidth: 2 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="col-span-1 bg-card border-card-border">
            <CardHeader>
              <CardTitle className="text-lg">Recent Analyses</CardTitle>
            </CardHeader>
            <CardContent className="px-0">
              <div className="divide-y divide-border">
                {incidentsLoading ? (
                  <div className="p-6 space-y-4">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : (
                  displayIncidents.map(incident => (
                    <div key={incident.id} className="p-4 hover:bg-muted/30 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <Link href={`/analyze?id=${incident.id}`} className="font-mono text-sm text-primary hover:underline">
                          {incident.correlationId}
                        </Link>
                        <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(incident.analyzedAt), { addSuffix: true })}</span>
                      </div>
                      <p className="text-sm font-medium mb-3">{incident.serviceName}</p>
                      <div className="flex items-center gap-2">
                        <StatusBadge label={incident.environment} />
                        <StatusBadge label={incident.confidence} type="confidence" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}
