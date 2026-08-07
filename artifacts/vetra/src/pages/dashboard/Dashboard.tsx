import React from 'react';
import { 
  useGetDashboardSummary, 
  useGetDashboardProjectHealth, 
  useGetDashboardRecentActivity, 
  useGetDashboardCashFlow 
} from '@workspace/api-client-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';
import { 
  Building2, Users, Activity, CheckCircle2, Clock, AlertTriangle, ArrowRight, Wallet
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Link } from 'wouter';

export default function Dashboard() {
  const { data: summary, isLoading: isSummaryLoading } = useGetDashboardSummary();
  const { data: health, isLoading: isHealthLoading } = useGetDashboardProjectHealth();
  const { data: activity, isLoading: isActivityLoading } = useGetDashboardRecentActivity();
  const { data: cashflow, isLoading: isCashFlowLoading } = useGetDashboardCashFlow();

  if (isSummaryLoading || isHealthLoading || isActivityLoading || isCashFlowLoading) {
    return <div className="h-[60vh] flex items-center justify-center font-mono text-muted-foreground">LOADING DATA...</div>;
  }

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-muted-foreground">Overview of portfolio health, financials, and operations.</p>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline" className="h-8 font-mono bg-background">LIVE SYNC</Badge>
        </div>
      </div>

      {/* KPI Row 1 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-sm border-t-4 border-t-primary">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Projects</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{summary?.activeProjects}</div>
            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
              <span className="text-emerald-500 font-medium">On track</span>
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-t-4 border-t-accent">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Budget Utilization</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{summary && formatCurrency(summary.spentBudget)}</div>
            <div className="w-full flex items-center gap-2 mt-2">
              <Progress value={summary ? (summary.spentBudget / summary.totalBudget) * 100 : 0} className="h-1.5" />
              <span className="text-xs font-mono text-muted-foreground">
                {summary && Math.round((summary.spentBudget / summary.totalBudget) * 100)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Overall Progress</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{summary?.overallProgress}%</div>
            <p className="text-xs text-muted-foreground mt-1">Portfolio completion</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Workforce</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">{summary?.totalWorkforce}</div>
            <p className="text-xs text-muted-foreground mt-1">Active on sites today</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Project Health Table */}
        <Card className="md:col-span-4 shadow-sm flex flex-col">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>Project Health Status</CardTitle>
                <CardDescription>Real-time status of critical portfolio projects</CardDescription>
              </div>
              <Link href="/projects" className="text-sm text-primary font-medium flex items-center gap-1 hover:underline">
                View All <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Project</th>
                    <th className="pb-3 font-medium">Health</th>
                    <th className="pb-3 font-medium">Progress</th>
                    <th className="pb-3 font-medium text-right">Budget</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {health?.map((proj) => (
                    <tr key={proj.projectId} className="group hover:bg-muted/50 transition-colors">
                      <td className="py-3 font-medium"><Link href={`/projects/${proj.projectId}`} className="hover:underline">{proj.projectName}</Link></td>
                      <td className="py-3">
                        <Badge variant="outline" className={`
                          ${proj.health === 'good' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : ''}
                          ${proj.health === 'warning' ? 'bg-amber-500/10 text-amber-600 border-amber-500/20' : ''}
                          ${proj.health === 'critical' ? 'bg-red-500/10 text-red-600 border-red-500/20' : ''}
                        `}>
                          {proj.health.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <Progress value={proj.progress} className="w-16 h-1.5" />
                          <span className="font-mono text-xs">{proj.progress}%</span>
                        </div>
                      </td>
                      <td className="py-3 text-right font-mono text-xs text-muted-foreground">
                        {Math.round((proj.budgetUsed / proj.budgetTotal) * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Cash Flow Chart */}
        <Card className="md:col-span-3 shadow-sm flex flex-col">
          <CardHeader>
            <CardTitle>Cash Flow</CardTitle>
            <CardDescription>YTD Income vs Expenses</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflow || []} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `$${value/1000}k`} />
                <RechartsTooltip 
                  cursor={{ fill: 'hsl(var(--muted))' }}
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))', fontSize: '12px', fontFamily: 'var(--font-mono)' }}
                  formatter={(value: number) => formatCurrency(value)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="income" name="Income" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="Expense" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Activity */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest updates across your portfolio</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activity?.map((item) => (
                <div key={item.id} className="flex items-start gap-3">
                  <Avatar className="h-8 w-8 rounded bg-muted">
                    <AvatarFallback className="text-xs bg-secondary text-secondary-foreground">
                      {item.user.split(' ').map(n => n[0]).join('').substring(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5">
                    <p className="text-sm">
                      <span className="font-medium text-foreground">{item.user}</span>{' '}
                      <span className="text-muted-foreground">{item.description}</span>
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      {item.projectName && (
                        <>
                          <span>•</span>
                          <span className="font-medium text-primary">{item.projectName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Operational Issues & Tasks */}
        <div className="space-y-4">
          <Card className="shadow-sm border-l-4 border-l-amber-500">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-500/10 rounded-full text-amber-600">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">Delayed Activities</div>
                  <div className="text-sm text-muted-foreground">Tasks past their due date</div>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono">{summary?.delayedActivities}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-full text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">Pending Approvals</div>
                  <div className="text-sm text-muted-foreground">Documents & orders waiting</div>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono">{summary?.pendingApprovals}</div>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-full text-blue-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">Open Tasks</div>
                  <div className="text-sm text-muted-foreground">Across all projects</div>
                </div>
              </div>
              <div className="text-2xl font-bold font-mono">{summary?.openTasks}</div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}