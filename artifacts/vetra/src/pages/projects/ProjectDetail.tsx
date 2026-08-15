import React from 'react';
import { useGetProject, useGetProjectStats } from '@workspace/api-client-react';
import { useParams, Link } from 'wouter';
import { 
  Building2, MapPin, Calendar, Users, DollarSign, Activity, 
  ArrowLeft, FileText, CheckSquare, Settings, ChevronRight, CalendarRange
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function ProjectDetail() {
  const params = useParams();
  const id = parseInt(params.id || '0', 10);
  
  const { data: project, isLoading: isProjectLoading } = useGetProject(id, { query: { enabled: !!id, queryKey: ['/api/projects', id] }});
  const { data: stats, isLoading: isStatsLoading } = useGetProjectStats(id, { query: { enabled: !!id, queryKey: ['/api/projects', id, 'stats'] }});

  if (isProjectLoading) return <div className="p-20 text-center font-mono">LOADING PROJECT...</div>;
  if (!project) return <div className="p-20 text-center text-destructive">PROJECT NOT FOUND</div>;

  const formatCurrency = (val: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Projects
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="font-medium text-foreground">{project.name}</span>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-lg border shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
            <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="font-mono h-6">
              {project.status.toUpperCase()}
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl">{project.description}</p>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {project.location}
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> Client: <span className="font-medium text-foreground">{project.client}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> PM: <span className="font-medium text-foreground">{project.managerName}</span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col gap-3 min-w-[200px]">
          <div className="flex justify-between items-end">
            <span className="text-sm font-medium">Overall Progress</span>
            <span className="font-mono text-xl font-bold">{project.progress}%</span>
          </div>
          <Progress value={project.progress} className="h-2" />
        </div>
      </div>

      <div className="flex justify-end"><Link href={`/projects/${id}/timeline`}><Button variant="outline" className="gap-2"><CalendarRange className="h-4 w-4" /> Project Timeline</Button></Link></div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent overflow-x-auto flex-nowrap">
          <TabsTrigger value="overview" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">Overview</TabsTrigger>
          <TabsTrigger value="tasks" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">Tasks</TabsTrigger>
          <TabsTrigger value="documents" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">Documents</TabsTrigger>
          <TabsTrigger value="financials" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">Financials</TabsTrigger>
          <TabsTrigger value="team" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3">Team</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <CheckSquare className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Tasks</div>
                  <div className="text-2xl font-bold font-mono">{stats?.openTasks} <span className="text-sm font-sans font-normal text-muted-foreground">open</span></div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-blue-500/10 flex items-center justify-center text-blue-600">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Documents</div>
                  <div className="text-2xl font-bold font-mono">{stats?.documentCount} <span className="text-sm font-sans font-normal text-muted-foreground">files</span></div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-amber-500/10 flex items-center justify-center text-amber-600">
                  <DollarSign className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Budget Used</div>
                  <div className="text-2xl font-bold font-mono">{Math.round((project.spent / project.budget) * 100)}%</div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Timeline</div>
                  <div className="text-2xl font-bold font-mono">
                    {Math.max(0, Math.ceil((new Date(project.endDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))} <span className="text-sm font-sans font-normal text-muted-foreground">days left</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Project Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-4 border-b pb-3">
                    <dt className="text-muted-foreground font-medium">Phase</dt>
                    <dd className="col-span-2 font-medium">{project.phase || 'Not specified'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 border-b pb-3">
                    <dt className="text-muted-foreground font-medium">Priority</dt>
                    <dd className="col-span-2 font-medium capitalize">{project.priority || 'Medium'}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 border-b pb-3">
                    <dt className="text-muted-foreground font-medium">Start Date</dt>
                    <dd className="col-span-2 font-mono">{new Date(project.startDate).toLocaleDateString()}</dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 border-b pb-3">
                    <dt className="text-muted-foreground font-medium">End Date</dt>
                    <dd className="col-span-2 font-mono">{new Date(project.endDate).toLocaleDateString()}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Financial Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Total Budget</span>
                      <span className="font-mono font-bold text-lg">{formatCurrency(project.budget)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Spent to Date</span>
                      <span className="font-mono font-bold text-lg text-destructive">{formatCurrency(project.spent)}</span>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="font-medium text-foreground">Remaining</span>
                      <span className="font-mono font-bold text-lg text-emerald-600">{formatCurrency(project.budget - project.spent)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
        
        <TabsContent value="tasks" className="pt-6">
          <div className="flex items-center justify-center h-[300px] border border-dashed rounded-lg bg-card text-muted-foreground">
            Tasks module will load here (Refer to /tasks)
          </div>
        </TabsContent>
        
        <TabsContent value="documents" className="pt-6">
          <div className="flex items-center justify-center h-[300px] border border-dashed rounded-lg bg-card text-muted-foreground">
            Documents module will load here
          </div>
        </TabsContent>
        
        <TabsContent value="financials" className="pt-6">
          <div className="flex items-center justify-center h-[300px] border border-dashed rounded-lg bg-card text-muted-foreground">
            Detailed Financials module will load here
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}