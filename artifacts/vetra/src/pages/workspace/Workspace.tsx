import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { BriefcaseBusiness, HardHat, Users, Crown, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { get } from '@/lib/phase2-api';

const iconByRole = { CEO: Crown, 'Project Manager': BriefcaseBusiness, 'Site Engineer': HardHat, HR: Users };
export default function WorkspaceSelector() {
  const [, setLocation] = useLocation();
  const [workspaces, setWorkspaces] = useState<Array<{ role: keyof typeof iconByRole; label: string; description: string; available: boolean }>>([]);
  useEffect(() => { get<typeof workspaces>('/workspaces').then(setWorkspaces).catch(() => setWorkspaces([])); }, []);
  return <div className="space-y-8 max-w-5xl mx-auto"><div><p className="text-xs font-mono tracking-widest text-primary">WORKSPACE CONTROL</p><h1 className="text-3xl font-bold mt-2">Choose your workspace</h1><p className="text-muted-foreground mt-2">Open the operating view that matches your current responsibility.</p></div><div className="grid gap-4 md:grid-cols-2">{workspaces.map((workspace) => { const Icon = iconByRole[workspace.role] ?? BriefcaseBusiness; return <Card key={workspace.role} className="group hover:border-primary/60 transition-colors"><CardHeader><div className="flex justify-between items-start"><div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center"><Icon className="h-5 w-5 text-primary" /></div><Badge variant={workspace.available ? 'default' : 'secondary'}>{workspace.available ? 'Available' : 'Preview'}</Badge></div><CardTitle className="mt-4">{workspace.label}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground mb-5">{workspace.description}</p><Button className="gap-2" onClick={() => setLocation(`/workspace/${encodeURIComponent(workspace.role)}`)}>Open workspace <ArrowRight className="h-4 w-4" /></Button></CardContent></Card>; })}</div></div>;
}

export function WorkspaceDashboard({ role }: { role: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { get(`/workspaces/${encodeURIComponent(role)}`).then(setData).catch(() => setData(null)); }, [role]);
  const metrics = data?.metrics ?? {};
  return <div className="space-y-6"><div><p className="text-xs font-mono tracking-widest text-primary">{role.toUpperCase()} WORKSPACE</p><h1 className="text-3xl font-bold mt-2">{role} dashboard</h1><p className="text-muted-foreground mt-2">Role-specific operating signals for VETRA.</p></div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[['Projects', metrics.projects], ['Active projects', metrics.activeProjects], ['Open tasks', metrics.openTasks], ['Spent', `$${Number(metrics.spent ?? 0).toLocaleString()}`]].map(([label, value]) => <Card key={String(label)}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-2xl font-semibold mt-2">{value}</p></CardContent></Card>)}</div><Card><CardHeader><CardTitle>Recent project activity</CardTitle></CardHeader><CardContent><div className="space-y-3">{(data?.projects ?? []).map((project: any) => <div key={project.id} className="flex justify-between border-b last:border-0 pb-3 last:pb-0"><span className="font-medium">{project.name}</span><Badge variant="outline">{project.status}</Badge></div>)}</div></CardContent></Card></div>;
}
