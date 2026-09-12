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
      if (!res.ok) throw new Error('Failed to create budget');
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
      if (!res.ok) throw new Error('Failed to approve expense');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/cost-control/summary'] });
    },
  });

  if (isLoading) {
    return (
      <div className="py-20 text-center font-mono text-muted-foreground">
        LOADING COST CONTROL...
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-20 text-center">
        <p className="text-destructive font-medium">Failed to load cost control data</p>
        <p className="text-sm text-muted-foreground mt-1">{(error as Error)?.message || 'An unexpected error occurred.'}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground font-medium">No cost control data available</p>
        <p className="text-sm text-muted-foreground mt-1">Budgets and expenses will appear here once recorded.</p>
      </div>
    );
  }

  const budget = Number(data.budgetTotal ?? 0), spent = Number(data.spentTotal ?? 0);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-mono tracking-widest text-primary">FINANCIAL CONTROL</p>
        <h1 className="text-3xl font-bold mt-2">Cost Control</h1>
        <p className="text-muted-foreground mt-2">Track commitments, approved spend and variance across the portfolio.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {([['Total budget', `${formatCurrency(budget)}`],
          ['Actual spend', `${formatCurrency(spent)}`],
          ['Remaining', `${formatCurrency(budget - spent)}`],
          ['Utilization', `${data.utilization ?? 0}%`]] as const).map(([label, value]) => (
          <Card key={label}>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-2xl font-semibold mt-2">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Budget utilization</CardTitle></CardHeader>
        <CardContent>
          <Progress value={Number(data.utilization ?? 0)} className="h-3" />
          <div className="flex justify-between mt-3 text-sm text-muted-foreground">
            <span>Actual spend</span>
            <span>{data.utilization ?? 0}% of budget</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Budgets</CardTitle>
            <Dialog open={budgetOpen} onOpenChange={setBudgetOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="h-4 w-4 ml-2" />
                  New Budget
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Budget</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div>
                    <Label>Budget Name *</Label>
                    <Input value={budgetForm.name} onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Period *</Label>
                    <Input placeholder="e.g. 2024-Q1" value={budgetForm.period} onChange={(e) => setBudgetForm({ ...budgetForm, period: e.target.value })} />
                  </div>
                  <div>
                    <Label>Amount (Rials) *</Label>
                    <Input type="number" value={budgetForm.amount} onChange={(e) => setBudgetForm({ ...budgetForm, amount: e.target.value })} />
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Input value={budgetForm.category} onChange={(e) => setBudgetForm({ ...budgetForm, category: e.target.value })} />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea value={budgetForm.notes} onChange={(e) => setBudgetForm({ ...budgetForm, notes: e.target.value })} rows={3} />
                  </div>
                  <Button
                    onClick={() => createBudgetMutation.mutate(budgetForm)}
                    disabled={!budgetForm.name || !budgetForm.period || !budgetForm.amount || createBudgetMutation.isPending}
                    className="w-full"
                  >
                    {createBudgetMutation.isPending ? 'Creating...' : 'Create Budget'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="space-y-3">
            {(data.budgets ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No budgets recorded yet.</p>
            ) : (
              data.budgets?.map((item) => (
                <div key={item.id} className="flex justify-between items-center border-b last:border-0 pb-3 last:pb-0">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.period}</p>
                  </div>
                  <span className="font-mono">{formatCurrency(Number(item.amount))}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent expenses</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {(data.expenses ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No expenses recorded yet.</p>
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
                        <CheckCircle className="h-4 w-4 ml-1" />
                        Approve
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
