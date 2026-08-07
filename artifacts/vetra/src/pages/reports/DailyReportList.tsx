import React from 'react';
import { useListDailyReports } from '@workspace/api-client-react';
import { Plus, Search, Filter, Thermometer, Users, CloudRain, Sun, Activity } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';

export default function DailyReportList() {
  const { data: reports, isLoading } = useListDailyReports();

  const getWeatherIcon = (weather: string) => {
    const w = weather.toLowerCase();
    if (w.includes('rain')) return <CloudRain className="h-4 w-4 text-blue-400" />;
    if (w.includes('sun') || w.includes('clear')) return <Sun className="h-4 w-4 text-amber-500" />;
    return <CloudRain className="h-4 w-4 text-muted-foreground" />; // Default generic
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Daily Site Reports</h1>
          <p className="text-muted-foreground">Track daily site progress, weather, and issues.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> Log Report
        </Button>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center font-mono text-muted-foreground">LOADING REPORTS...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="py-3 px-4 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Project</th>
                  <th className="py-3 px-4 font-medium">Weather</th>
                  <th className="py-3 px-4 font-medium">Workforce</th>
                  <th className="py-3 px-4 font-medium">Progress</th>
                  <th className="py-3 px-4 font-medium">Reported By</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {reports?.map((report) => (
                  <tr key={report.id} className="group hover:bg-muted/50 transition-colors cursor-pointer">
                    <td className="py-3 px-4 font-medium font-mono text-xs">
                      {new Date(report.date).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/projects/${report.projectId}`} className="text-primary hover:underline font-medium">
                        {report.projectName}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {getWeatherIcon(report.weather)}
                        <span className="capitalize">{report.weather}</span>
                        {report.temperature && <span>({report.temperature}°C)</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Users className="h-3 w-3 text-muted-foreground" />
                        <span className="font-mono">{report.workersOnSite || 0}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${report.progress}%` }} />
                        </div>
                        <span className="font-mono text-xs">{report.progress}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">
                      {report.createdBy}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}