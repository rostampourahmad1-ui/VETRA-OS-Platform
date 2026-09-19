import { useState } from 'react';
import { useGetCostControlSummary } from '@workspace/api-client-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, CheckCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/jalali';
import { t } from '@/lib/i18n';

export default function CostControl() {
  const { data, isLoading, error } = useGetCostControlSummary();
  const queryClient = useQueryClient();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetForm, setBudgetForm] = useState({
    name: '', period: '', amount: '', category: '', notes: '',
  });

  const createBudgetMutation = useMutation({
    mutationFn: async (data: typeof budgetForm) => {
      const res = await fetch('/api/cost-control/budgets', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          period: data.period,
          amount: Number(data.amount),
          category: data.category || null,
          notes: data.notes || null,
        }),
      });
      if (!res.ok) throw new Error(t('costControl.createBudgetFailed'));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/cost-control/summary'] });
      setBudgetOpen(false);
      setBudgetForm({ name: '', period: '', amount: '', category: '', notes: '' });
    },
  });

  const approveExpenseMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/cost-control/expenses/${id}/approve`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!res.ok) throw new Error(t('costControl.approveFailed'));
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/cost-control/summary'] });
    },
  });

  if (isLoading) {
    return (
      <div className="py-20 text-center font-mono text-muted-foreground">
        {t('costControl.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-destructive font-medium">{t('costControl.loadFailed')}</p>
        <p className="text-sm text-muted-foreground mt-1">{(error as Error)?.message || t('costControl.unexpectedError')}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground font-medium">{t('costControl.noData')}</p>
        <p className="text-sm text-muted-foreground mt-1">{t('costControl.noDataHint')}</p>
      </div>
    );
  }

  const budget = Number(data.budgetTotal ?? 0), spent = Number(data.spentTotal ?? 0);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono tracking-widest text-primary">{t('costControl.breadcrumb')}</p>
        <h1 className="text-3xl font-bold mt-2">{t('costControl.title')}</h1>
        <p className="text-muted-foreground mt-2">{t('costControl.subtitle')}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {([[t('costControl.totalBudget'), `${formatCurrency(budget)}`],
          [t('costControl.actualSpend'), `${formatCurrency(spent)}`],
          [t('costControl.remaining'), `${formatCurrency(budget - spent)}`],
          [t('costControl.utilization'), `${data.utilization ?? 0}%`]] as const).map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold mt-2">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>{t('costControl.budgetUtilization')}</CardTitle></CardHeader>
        <CardContent>
          <Progress value={Number(data.utilization ?? 0)} className="h-3" />
          <div className="flex justify-between mt-3 text-sm text-muted-foreground">
            <span>{t('costControl.actualSpend')}</span>
            <span>{t('costControl.percentOfBudget', { percent: data.utilization ?? 0 })}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{t('costControl.budgets')}</CardTitle>
            <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 ms-2" />
                  {t('costControl.newBudget')}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('costControl.createBudget')}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label>{t('costControl.budgetName')}</Label>
                    <Input value={budgetForm.name} onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t('costControl.period')}</Label>
                    <Input dir="ltr" placeholder={t('costControl.periodPlaceholder')} value={budgetForm.period} onChange={(e) => setBudgetForm({ ...budgetForm, period: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t('costControl.amountRials')}</Label>
                    <Input type="number" value={budgetForm.amount} onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t('costControl.category')}</Label>
                    <Input value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })} />
                  </div>
                  <div>
                    <Label>{t('costControl.notes')}</Label>
                    <Textarea value={budgetForm.notes} onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })} rows={3} />
                  </div>
                  <Button
                    onClick={() => createBudgetMutation.mutate(budgetForm)}
                    disabled={!budgetForm.name || !budgetForm.period || !budgetForm.amount || createBudgetMutation.isPending}
                    className="w-full"
                  >
                    {createBudgetMutation.isPending ? t('costControl.creating') : t('costControl.createBudget')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data.budgets ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('costControl.noBudgets')}</p>
            ) : (
              data.budgets?.map((item) => (
                <div key={item.id} className="flex justify-between items-center border-b last:border-0 pb-3 last:pb-0">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p dir="ltr" className="text-xs text-muted-foreground">{item.period}</p>
                  </div>
                  <span className="font-mono">{formatCurrency(Number(item.amount))}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{t('costControl.recentExpenses')}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(data.expenses ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('costControl.noExpenses')}</p>
            ) : (
              data.expenses?.map((item) => (
                <div key={item.id} className="flex justify-between items-center border-b last:border-0 pb-3 last:pb-0">
                  <div className="flex-1">
                    <p className="font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground">{item.expenseDate}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{formatCurrency(Number(item.amount))}</Badge>
                    {item.id != null && !(item as any).approvedBy && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => approveExpenseMutation.mutate(item.id as number)}
                        disabled={approveExpenseMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 ms-1" />
                        {t('costControl.approve')}
                      </Button>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
