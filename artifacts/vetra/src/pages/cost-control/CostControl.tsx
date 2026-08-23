import { useGetCostControlSummary } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { formatCurrency } from '@/lib/jalali';

export default function CostControl() {
  const { data, isLoading, error } = useGetCostControlSummary();

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
          <CardHeader><CardTitle>Budgets</CardTitle></CardHeader>
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
                  <div>
                    <p className="font-medium">{item.description}</p>
                    <p className="text-xs text-muted-foreground">{item.expenseDate}</p>
                  </div>
                  <Badge variant="outline">{formatCurrency(Number(item.amount))}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
