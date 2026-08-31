import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useOrganizationProject, type Organization, type Project } from '@/contexts/OrganizationProjectContext';
import { Button } from '@/components/ui/button';
import { GlassContainer } from '@/components/ui/glass-container';
import { get } from '@/lib/phase2-api';

export default function OrgProjectSelector() {
  const [, setLocation] = useLocation();
  const { organization, project, setOrganization, setProject } = useOrganizationProject();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([get<Organization[]>('/organizations'), get<Project[]>('/projects')])
      .then(([organizationList, projectList]) => {
        if (!active) return;
        setOrganizations(organizationList ?? []);
        setProjects(projectList ?? []);
      })
      .catch(() => {
        if (active) setError('دریافت فهرست سازمان‌ها و پروژه‌ها انجام نشد. دوباره تلاش کنید.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const visibleProjects = organization
    ? projects.filter((item) => !item.organizationId || item.organizationId === organization.id)
    : [];

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6" dir="rtl">
      <GlassContainer className="w-full max-w-2xl space-y-8 p-8" intensity="strong">
        <div className="space-y-2 text-right">
          <p className="text-sm text-[var(--accent)]">شروع کار با وترا</p>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">سازمان و پروژهٔ فعال را انتخاب کنید</h1>
          <p className="text-[var(--text-secondary)]">برای مشاهدهٔ اطلاعات صحیح، ابتدا محدودهٔ کاری خود را مشخص کنید.</p>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        {loading ? (
          <p role="status" className="text-sm text-[var(--text-secondary)]">در حال دریافت محدوده‌های کاری…</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-[var(--text-primary)]">
              سازمان
              <select
                aria-label="سازمان"
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-3"
                value={organization?.id ?? ''}
                onChange={(event) => {
                  const next = organizations.find((item) => item.id === Number(event.target.value)) ?? null;
                  setOrganization(next);
                }}
              >
                <option value="">انتخاب سازمان</option>
                {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-[var(--text-primary)]">
              پروژه
              <select
                aria-label="پروژه"
                disabled={!organization}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-3 disabled:cursor-not-allowed disabled:opacity-50"
                value={project?.id ?? ''}
                onChange={(event) => setProject(visibleProjects.find((item) => item.id === Number(event.target.value)) ?? null)}
              >
                <option value="">انتخاب پروژه</option>
                {visibleProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="flex justify-start">
          <Button variant="glass" disabled={loading || !organization || !project} onClick={() => setLocation('/')}>ورود به داشبورد</Button>
        </div>
      </GlassContainer>
    </div>
  );
}
