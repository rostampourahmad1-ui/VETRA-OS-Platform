import { t } from '@/lib/i18n';
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
        if (active) setError(t('onboarding.error'));
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
          <p className="text-sm text-[var(--accent)]">{t('onboarding.greeting')}</p>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t('onboarding.title')}</h1>
          <p className="text-[var(--text-secondary)]">{t("onboarding.desc")}</p>
        </div>

        {error && <p role="alert" className="rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</p>}
        {loading ? (
          <p role="status" className="text-sm text-[var(--text-secondary)]">{t('onboarding.loading')}</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-[var(--text-primary)]">
              {t("onboarding.selectOrg")}
              <select
                aria-label={t("onboarding.selectOrg")}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-3"
                value={organization?.id ?? ''}
                onChange={(event) => {
                  const next = organizations.find((item) => item.id === Number(event.target.value)) ?? null;
                  setOrganization(next);
                }}
              >
                <option value="">{t('onboarding.selectOrg')}</option>
                {organizations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-[var(--text-primary)]">
              {t("onboarding.selectProject")}
              <select
                aria-label={t("onboarding.selectProject")}
                disabled={!organization}
                className="w-full rounded-xl border border-[var(--glass-border)] bg-[var(--surface)] p-3 disabled:cursor-not-allowed disabled:opacity-50"
                value={project?.id ?? ''}
                onChange={(event) => setProject(visibleProjects.find((item) => item.id === Number(event.target.value)) ?? null)}
              >
                <option value="">{t('onboarding.selectProject')}</option>
                {visibleProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          </div>
        )}
        <div className="flex justify-start">
          <Button variant="glass" disabled={loading || !organization || !project} onClick={() => setLocation('/')}>{t('onboarding.enterDashboard')}</Button>
        </div>
      </GlassContainer>
    </div>
  );
}
