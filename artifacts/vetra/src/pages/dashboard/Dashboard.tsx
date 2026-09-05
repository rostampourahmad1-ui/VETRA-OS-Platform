import { t } from '@/lib/i18n';
import { Building2, Wallet, Activity, Users, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useGetDashboardSummary, useGetDashboardProjectHealth } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { GlassContainer } from '@/components/ui/glass-container';
import { formatCurrency } from '@/lib/jalali';

import { get } from '@/lib/phase2-api';
import { useEffect, useState } from 'react';

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: health } = useGetDashboardProjectHealth();
  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center text-[var(--text-secondary)]">{t('app.loading')}</div>;
  const kpis = [
    { label: t('dashboard.activeProjects'), value: summary?.activeProjects ?? 0, icon: Building2 },
    { label: t('dashboard.spentBudget'), value: formatCurrency(summary?.spentBudget ?? 0), icon: Wallet },
    { label: t('dashboard.overallProgress'), value: `${summary?.overallProgress ?? 0}%`, icon: Activity },
    { label: t('dashboard.activeWorkforce'), value: summary?.totalWorkforce ?? 0, icon: Users },
  ];
  return (
    <div className="space-y-8 p-2 text-right">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm text-[var(--accent)]">{t('app.tagline')}</p><h1 className="text-3xl font-bold text-[var(--text-primary)]">{t('dashboard.title')}</h1><p className="text-[var(--text-secondary)]">{t('dashboard.subtitle')}</p></div>
        <Link href="/onboarding" className="text-sm text-[var(--accent)] hover:underline">{t('shell.changeOrgProject')}</Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon }) => <Card key={label} glass><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-[var(--text-secondary)]">{label}</p><p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p></div><Icon className="h-7 w-7 text-[var(--accent)]" /></CardContent></Card>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <GlassContainer className="p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[var(--text-primary)]">{t('dashboard.projectHealth')}</h2><p className="text-sm text-[var(--text-secondary)]">{t('dashboard.projectHealthDesc')}</p></div><Link href="/projects" className="text-sm text-[var(--accent)]">{t('common.viewAll')}</Link></div><div className="space-y-3">{(health ?? []).slice(0, 6).map((item) => <div key={item.projectId} className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] p-4"><div><Link href={`/projects/${item.projectId}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">{item.projectName}</Link><p className="text-xs text-[var(--text-secondary)]">{t('dashboard.progressLabel')} {item.progress}%</p></div><span className="rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs text-[var(--accent)]">{item.health === 'good' ? t('dashboard.healthGood') : item.health === 'warning' ? t('dashboard.healthWarning') : t('dashboard.healthCritical')}</span></div>)}</div></GlassContainer>
        <div className="space-y-4"><GlassContainer className="flex items-center gap-4 p-5"><AlertTriangle className="text-amber-600" /><div><p className="font-medium text-[var(--text-primary)]">{t('dashboard.delayedActivities')}</p><p className="text-sm text-[var(--text-secondary)]">{t('dashboard.delayedDesc')}</p></div><strong className="mr-auto text-2xl text-[var(--text-primary)]">{summary?.delayedActivities ?? 0}</strong></GlassContainer><GlassContainer className="flex items-center gap-4 p-5"><CheckCircle2 className="text-emerald-600" /><div><p className="font-medium text-[var(--text-primary)]">{t('dashboard.pendingApprovals')}</p><p className="text-sm text-[var(--text-secondary)]">{t('dashboard.pendingApprovalsDesc')}</p></div><strong className="mr-auto text-2xl text-[var(--text-primary)]">{summary?.pendingApprovals ?? 0}</strong></GlassContainer><GlassContainer className="flex items-center gap-4 p-5"><Clock className="text-sky-600" /><div><p className="font-medium text-[var(--text-primary)]">{t('dashboard.openTasks')}</p><p className="text-sm text-[var(--text-secondary)]">{t('dashboard.openTasksDesc')}</p></div><strong className="mr-auto text-2xl text-[var(--text-primary)]">{summary?.openTasks ?? 0}</strong></GlassContainer></div>
      </div>
    </div>
  );
}
