import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useOrganizationProject } from '@/contexts/OrganizationProjectContext';
import { Button } from '@/components/ui/button';
import { GlassContainer } from '@/components/ui/glass-container';

type Organization = { id: number; name: string };
type Project = { id: number; name: string; organizationId?: number };

export default function OrgProjectSelector() {
  const [, setLocation] = useLocation();
  const { organization, project, setOrganization, setProject } = useOrganizationProject();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  useEffect(() => {
    fetch('/api/organizations').then((response) => response.ok ? response.json() : []).then(setOrganizations).catch(() => setOrganizations([]));
    fetch('/api/projects').then((response) => response.ok ? response.json() : []).then(setProjects).catch(() => setProjects([]));
  }, []);
  const visibleProjects = organization ? projects.filter((item) => !item.organizationId || item.organizationId === organization.id) : projects;
  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6">
      <GlassContainer className="w-full max-w-2xl space-y-8 p-8" intensity="strong">
        <div className="space-y-2 text-right">
          <p className="text-sm text-[var(--accent)]">شروع کار با وترا</p>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">سازمان و پروژه فعال را انتخاب کنید</h1>
          <p className="text-[var(--text-secondary)]">برای مشاهده اطلاعات صحیح، ابتدا محدوده کاری خود را مشخص کنید.</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-[var(--text-primary)]">سازمان
            <select className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-3" value={organization?.id ?? ''} onChange={(event) => { const next = organizations.find((item) => item.id === Number(event.target.value)) || null; setOrganization(next); setProject(null); }}>
              <option value="">انتخاب سازمان</option>{organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="space-y-2 text-sm font-medium text-[var(--text-primary)]">پروژه
            <select className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-3" value={project?.id ?? ''} onChange={(event) => setProject(visibleProjects.find((item) => item.id === Number(event.target.value)) || null)}>
              <option value="">انتخاب پروژه</option>{visibleProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
        </div>
        <div className="flex justify-start"><Button variant="glass" disabled={!organization || !project} onClick={() => setLocation('/')}>ورود به داشبورد</Button></div>
      </GlassContainer>
    </div>
  );
}
