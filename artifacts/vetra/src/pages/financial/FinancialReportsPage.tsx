import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, TrendingUp, TrendingDown, DollarSign, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netIncome: number;
  accountsReceivable: number;
  accountsPayable: number;
  cashflow: number;
}

export function FinancialReportsPage() {
  const [dateRange, setDateRange] = useState({ from: "", to: "" });

  const { data: summary } = useQuery<FinancialSummary>({
    queryKey: ["financial-summary", dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange.from) params.append("from", dateRange.from);
      if (dateRange.to) params.append("to", dateRange.to);
      const res = await fetch(`/api/reports/financial-summary?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const handleExport = (reportType: string) => {
    const params = new URLSearchParams();
    if (dateRange.from) params.append("from", dateRange.from);
    if (dateRange.to) params.append("to", dateRange.to);
    params.append("format", "csv");
    window.open(`/api/reports/${reportType}?${params}`, "_blank");
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">گزارشات مالی</h1>
          <p className="text-muted-foreground mt-1">تحلیل عملکرد مالی</p>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="flex gap-2">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
          <span className="flex items-center text-muted-foreground">تا</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">درآمد کل</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{summary?.totalRevenue.toLocaleString() ?? 0} ریال</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">هزینه کل</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{summary?.totalExpenses.toLocaleString() ?? 0} ریال</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">درآمد خالص</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-primary" />
              <span className={`text-2xl font-bold ${(summary?.netIncome ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {summary?.netIncome.toLocaleString() ?? 0} ریال
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pl" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pl">سود و زیان</TabsTrigger>
          <TabsTrigger value="cashflow">جریان نقدی</TabsTrigger>
          <TabsTrigger value="ar-ap">حساب‌های دریافتنی/پرداختنی</TabsTrigger>
          <TabsTrigger value="contractor">صورت حساب پیمانکار</TabsTrigger>
        </TabsList>

        <TabsContent value="pl" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>گزارش سود و زیان</CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleExport("profit-loss")}>
                <Download className="h-4 w-4 ml-2" />
                خروجی CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="font-medium">درآمدها</span>
                  <span className="font-mono">{summary?.totalRevenue.toLocaleString() ?? 0} ریال</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="font-medium">هزینه‌ها</span>
                  <span className="font-mono text-red-600">({summary?.totalExpenses.toLocaleString() ?? 0}) ریال</span>
                </div>
                <div className="flex items-center justify-between py-3 border-t-2 border-primary">
                  <span className="font-bold text-lg">درآمد خالص</span>
                  <span className={`font-mono font-bold text-lg ${(summary?.netIncome ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {summary?.netIncome.toLocaleString() ?? 0} ریال
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cashflow" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>گزارش جریان نقدی</CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleExport("cashflow")}>
                <Download className="h-4 w-4 ml-2" />
                خروجی CSV
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2">
                  <span>جریان نقدی عملیاتی</span>
                  <span className="font-mono">{summary?.cashflow.toLocaleString() ?? 0} ریال</span>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  نمودار جریان نقدی ماهانه در نسخه‌های بعدی اضافه خواهد شد.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ar-ap" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>حساب‌های دریافتنی</CardTitle>
                <Button variant="outline" size="sm" onClick={() => handleExport("accounts-receivable")}>
                  <Download className="h-4 w-4 ml-2" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-primary">
                  {summary?.accountsReceivable.toLocaleString() ?? 0} ریال
                </div>
                <p className="text-sm text-muted-foreground mt-2">مانده طلب از مشتریان</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>حساب‌های پرداختنی</CardTitle>
                <Button variant="outline" size="sm" onClick={() => handleExport("accounts-payable")}>
                  <Download className="h-4 w-4 ml-2" />
                  CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-destructive">
                  {summary?.accountsPayable.toLocaleString() ?? 0} ریال
                </div>
                <p className="text-sm text-muted-foreground mt-2">مانده بدهی به تأمین‌کنندگان</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="contractor" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>صورت حساب پیمانکار</CardTitle>
              <Button variant="outline" size="sm" onClick={() => handleExport("contractor-statement")}>
                <Download className="h-4 w-4 ml-2" />
                خروجی PDF
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  صورت حساب جامع پیمانکار شامل گواهی‌های پیشرفت، پرداخت‌ها، و کسورات.
                </p>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span className="text-sm">فرمت خروجی: PDF</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
