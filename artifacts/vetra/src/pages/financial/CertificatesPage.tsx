import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, FileCheck, CheckCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Certificate {
  id: number;
  contractId: number;
  certificateNumber: string;
  period: string;
  workCompleted: number;
  materialsOnSite: number;
  previousTotal: number;
  currentTotal: number;
  retentionPercent: number;
  retentionAmount: number;
  netPayable: number;
  status: string;
  approvedBy: number | null;
  approvedAt: string | null;
  createdAt: string;
}

export function CertificatesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");

  const { data: certificates, isLoading } = useQuery<Certificate[]>({
    queryKey: ["certificates"],
    queryFn: async () => {
      const res = await fetch("/api/progress-certificates", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/progress-certificates/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["certificates"] });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "submitted": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "approved": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "paid": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      default: return "bg-muted";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "draft": return "پیش‌نویس";
      case "submitted": return "ارسال شده";
      case "approved": return "تأیید شده";
      case "paid": return "پرداخت شده";
      default: return status;
    }
  };

  const filtered = (certificates ?? []).filter((cert) => {
    const matchSearch = cert.certificateNumber.toLowerCase().includes(search.toLowerCase()) ||
                        cert.period.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || cert.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">گواهی پیشرفت</h1>
          <p className="text-muted-foreground mt-1">مدیریت گواهی‌های پیشرفت کار</p>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجو..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">همه وضعیت‌ها</option>
          <option value="draft">پیش‌نویس</option>
          <option value="submitted">ارسال شده</option>
          <option value="approved">تأیید شده</option>
          <option value="paid">پرداخت شده</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((cert) => (
            <Card key={cert.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <FileCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{cert.certificateNumber}</h3>
                    <p className="text-xs text-muted-foreground">{cert.period}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">کار انجام شده</span>
                    <span className="font-mono">{cert.workCompleted.toLocaleString()} ریال</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">مصالح در محل</span>
                    <span className="font-mono">{cert.materialsOnSite.toLocaleString()} ریال</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">جمع جاری</span>
                    <span className="font-mono font-semibold">{cert.currentTotal.toLocaleString()} ریال</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">کسر ضمانت ({cert.retentionPercent}%)</span>
                    <span className="font-mono text-destructive">-{cert.retentionAmount.toLocaleString()} ریال</span>
                  </div>
                  <div className="pt-2 border-t flex items-center justify-between">
                    <span className="text-muted-foreground font-semibold">قابل پرداخت</span>
                    <span className="font-mono font-bold text-lg">{cert.netPayable.toLocaleString()} ریال</span>
                  </div>
                  <div className="pt-2 border-t flex items-center justify-between">
                    <Badge variant="outline" className={getStatusColor(cert.status)}>
                      {getStatusLabel(cert.status)}
                    </Badge>
                    {cert.status === "submitted" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => approveMutation.mutate(cert.id)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 ml-1" />
                        تأیید
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
