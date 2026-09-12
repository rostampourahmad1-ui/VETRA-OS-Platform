import { useQuery } from "@tanstack/react-query";
import { BarChart3, TrendingUp, Clock, CheckCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface FormAnalytics {
  totalSubmissions: number;
  approvalRate: number;
  avgCycleTimeHours: number;
  submissionsByTemplate: Array<{ templateId: number; templateName: string; count: number }>;
  bottlenecks: Array<{ stepName: string; avgWaitHours: number; count: number }>;
}

export function FormsAnalyticsPage() {
  const { data: analytics, isLoading } = useQuery<FormAnalytics>({
    queryKey: ["forms-analytics"],
    queryFn: async () => {
      const res = await fetch("/api/forms/analytics", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">تحلیل فرم‌ها و گردش کار</h1>
        <p className="text-muted-foreground mt-1">عملکرد و تنگناهای فرآیند</p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">کل ارسال‌ها</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  <span className="text-2xl font-bold">{analytics?.totalSubmissions ?? 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">نرخ تأیید</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-2xl font-bold">{analytics?.approvalRate.toFixed(1) ?? 0}%</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">میانگین زمان چرخه</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  <span className="text-2xl font-bold">{analytics?.avgCycleTimeHours.toFixed(1) ?? 0}h</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-muted-foreground">تعداد قالب‌ها</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-purple-500" />
                  <span className="text-2xl font-bold">{analytics?.submissionsByTemplate.length ?? 0}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Volume by Template */}
          <Card>
            <CardHeader>
              <CardTitle>حجم ارسال به تفکیک قالب</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(analytics?.submissionsByTemplate ?? []).map((item) => (
                  <div key={item.templateId} className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{item.templateName}</p>
                      <p className="text-xs text-muted-foreground">قالب #{item.templateId}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary"
                          style={{
                            width: `${((item.count / (analytics?.totalSubmissions || 1)) * 100).toFixed(0)}%`,
                          }}
                        />
                      </div>
                      <span className="font-mono font-semibold w-12 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Bottlenecks */}
          <Card>
            <CardHeader>
              <CardTitle>تنگناهای گردش کار</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">مراحلی که بیشترین زمان انتظار را دارند</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(analytics?.bottlenecks ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">داده‌ای برای نمایش وجود ندارد</p>
                ) : (
                  analytics?.bottlenecks.map((item, index) => (
                    <div key={index} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                      <div>
                        <p className="font-medium">{item.stepName}</p>
                        <p className="text-xs text-muted-foreground">{item.count} درخواست</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-amber-500" />
                        <span className="font-mono font-semibold">{item.avgWaitHours.toFixed(1)}h</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>نمودارها</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                نمودارهای تعاملی برای تحلیل روند زمانی، توزیع وضعیت، و مقایسه قالب‌ها در نسخه‌های آینده اضافه خواهند شد.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
