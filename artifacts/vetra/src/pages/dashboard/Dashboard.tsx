import { Building2, Wallet, Activity, Users, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { useGetDashboardSummary, useGetDashboardProjectHealth } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { GlassContainer } from '@/components/ui/glass-container';
import { formatCurrency } from '@/lib/jalali';

export default function Dashboard() {
  const { data: summary, isLoading } = useGetDashboardSummary();
  const { data: health } = useGetDashboardProjectHealth();
  if (isLoading) return <div className="flex min-h-[60vh] items-center justify-center text-[var(--text-secondary)]">در حال بارگذاری اطلاعات...</div>;
  const kpis = [
    { label: 'پروژه‌های فعال', value: summary?.activeProjects ?? 0, icon: Building2 },
    { label: 'بودجه مصرف‌شده', value: formatCurrency(summary?.spentBudget ?? 0), icon: Wallet },
    { label: 'پیشرفت کلی', value: `${summary?.overallProgress ?? 0}%`, icon: Activity },
    { label: 'نیروی فعال', value: summary?.totalWorkforce ?? 0, icon: Users },
  ];
  return (
    <div className="space-y-8 p-2 text-right">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div><p className="text-sm text-[var(--accent)]">سامانه مدیریت پروژه‌های ساختمانی</p><h1 className="text-3xl font-bold text-[var(--text-primary)]">داشبورد اجرایی</h1><p className="text-[var(--text-secondary)]">نمای کلی سلامت پروژه‌ها، مالی و عملیات سازمان.</p></div>
        <Link href="/onboarding" className="text-sm text-[var(--accent)] hover:underline">تغییر سازمان یا پروژه</Link>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map(({ label, value, icon: Icon }) => <Card key={label} glass><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-[var(--text-secondary)]">{label}</p><p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{value}</p></div><Icon className="h-7 w-7 text-[var(--accent)]" /></CardContent></Card>)}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <GlassContainer className="p-6"><div className="mb-5 flex items-center justify-between"><div><h2 className="text-xl font-semibold text-[var(--text-primary)]">سلامت پروژه‌ها</h2><p className="text-sm text-[var(--text-secondary)]">آخرین وضعیت پروژه‌های سازمان</p></div><Link href="/projects" className="text-sm text-[var(--accent)]">مشاهده همه</Link></div><div className="space-y-3">{(health ?? []).slice(0, 6).map((item) => <div key={item.projectId} className="flex items-center justify-between rounded-xl border border-[var(--glass-border)] p-4"><div><Link href={`/projects/${item.projectId}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">{item.projectName}</Link><p className="text-xs text-[var(--text-secondary)]">پیشرفت {item.progress}%</p></div><span className="rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs text-[var(--accent)]">{item.health === 'good' ? 'مطلوب' : item.health === 'warning' ? 'نیازمند توجه' : 'بحرانی'}</span></div>)}</div></GlassContainer>
        <div className="space-y-4"><GlassContainer className="flex items-center gap-4 p-5"><AlertTriangle className="text-amber-600" /><div><p className="font-medium text-[var(--text-primary)]">فعالیت‌های با تأخیر</p><p className="text-sm text-[var(--text-secondary)]">وظایف عبورکرده از موعد</p></div><strong className="mr-auto text-2xl text-[var(--text-primary)]">{summary?.delayedActivities ?? 0}</strong></GlassContainer><GlassContainer className="flex items-center gap-4 p-5"><CheckCircle2 className="text-emerald-600" /><div><p className="font-medium text-[var(--text-primary)]">تأییدهای در انتظار</p><p className="text-sm text-[var(--text-secondary)]">اسناد و سفارش‌ها</p></div><strong className="mr-auto text-2xl text-[var(--text-primary)]">{summary?.pendingApprovals ?? 0}</strong></GlassContainer><GlassContainer className="flex items-center gap-4 p-5"><Clock className="text-sky-600" /><div><p className="font-medium text-[var(--text-primary)]">وظایف باز</p><p className="text-sm text-[var(--text-secondary)]">در همه پروژه‌ها</p></div><strong className="mr-auto text-2xl text-[var(--text-primary)]">{summary?.openTasks ?? 0}</strong></GlassContainer></div>
      </div>
    </div>
  );
}
