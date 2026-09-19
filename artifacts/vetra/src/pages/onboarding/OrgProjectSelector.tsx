import { t } from '@/lib/i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth, useOrganizationList } from '@clerk/react';
import { useOrganizationProject, type Organization, type Project } from '@/contexts/OrganizationProjectContext';
import { Button } from '@/components/ui/button';
import { GlassContainer } from '@/components/ui/glass-container';
import { get } from '@/lib/phase2-api';

type LoadState = 'loading' | 'ready' | 'empty' | 'error';

/**
 * Maps an API failure to an actionable Persian message.
 *
 * The VETRA API is authoritative: a signed-in Clerk user without an active
 * Organization, or without a VETRA mapping, receives a 403 with a specific
 * error string. We translate those into user-facing guidance instead of
 * surfacing the raw status code.
 */
function describeLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (message.includes('not mapped to a VETRA organization')) return t('onboarding.noMapping');
  if (message.includes('no organization assigned')) return t('onboarding.noClerkOrg');
  if (message.includes('Forbidden')) return t('onboarding.forbidden');
  return t('onboarding.error');
}

export default function OrgProjectSelector() {
  const [, setLocation] = useLocation();
  const { organization, project, setOrganization, setProject } = useOrganizationProject();
  const { isLoaded: authLoaded, orgId } = useAuth();
  const { isLoaded: orgListLoaded, setActive, userMemberships } = useOrganizationList({
    userMemberships: { pageSize: 20 },
  });

  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const activationAttempted = useRef(false);

  const membershipOrganizationId = userMemberships?.data?.[0]?.organization?.id ?? null;

  // The VETRA API rejects sessions without an active Clerk Organization
  // (VETRA-SEC-03). Activate the first available membership before loading so a
  // valid, mapped user is not blocked by a 403. This only uses the caller's own
  // memberships; it never grants access the user did not already have.
  useEffect(() => {
    if (!authLoaded || !orgListLoaded || orgId) return;
    if (activationAttempted.current) return;
    if (!membershipOrganizationId) {
      setError(t('onboarding.noClerkOrg'));
      setState('error');
      return;
    }
    activationAttempted.current = true;
    void setActive?.({ organization: membershipOrganizationId });
  }, [authLoaded, orgListLoaded, orgId, membershipOrganizationId, setActive]);

  useEffect(() => {
    if (!authLoaded || !orgId) return;
    let active = true;
    setState('loading');
    setError(null);
    Promise.all([get<Organization[]>('/organizations'), get<Project[]>('/projects')])
      .then(([organizationList, projectList]) => {
        if (!active) return;
        const organizationRows = organizationList ?? [];
        setOrganizations(organizationRows);
        setProjects(projectList ?? []);
        setState(organizationRows.length === 0 ? 'empty' : 'ready');
      })
      .catch((loadError) => {
        if (!active) return;
        setError(describeLoadError(loadError));
        setState('error');
      });
    return () => { active = false; };
  }, [authLoaded, orgId, reloadKey]);

  const visibleProjects = useMemo(
    () => (organization
      ? projects.filter((item) => !item.organizationId || item.organizationId === organization.id)
      : []),
    [organization, projects],
  );

  const loading = state === 'loading';
  const canEnter = Boolean(organization && project);

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-6" dir="rtl">
      <GlassContainer className="w-full max-w-2xl space-y-8 p-8" intensity="strong">
        <div className="space-y-2 text-right">
          <p className="text-sm text-[var(--accent)]">{t('onboarding.greeting')}</p>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">{t('onboarding.title')}</h1>
          <p className="text-[var(--text-secondary)]">{t("onboarding.desc")}</p>
        </div>

        {loading ? (
          <p role="status" className="text-sm text-[var(--text-secondary)]">{t('onboarding.loading')}</p>
        ) : null}

        {state === 'error' ? (
          <div role="alert" className="space-y-3 rounded-lg border border-red-400/40 bg-red-500/10 p-3 text-sm text-red-200">
            <p>{error}</p>
            <Button variant="glass" onClick={() => setReloadKey((value) => value + 1)}>{t('onboarding.retry')}</Button>
          </div>
        ) : null}

        {state === 'empty' ? (
          <p role="status" className="rounded-lg border border-[var(--glass-border)] bg-[var(--surface)] p-3 text-sm text-[var(--text-secondary)]">
            {t('onboarding.empty')}
          </p>
        ) : null}

        {state === 'ready' ? (
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
        ) : null}

        <div className="flex justify-start">
          <Button variant="glass" disabled={loading || !canEnter} onClick={() => setLocation('/')}>{t('onboarding.enterDashboard')}</Button>
        </div>
      </GlassContainer>
    </div>
  );
}
