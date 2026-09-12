import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Calendar, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface PaymentSchedule {
  id: number;
  contractId: number;
  description: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  status: string;
  notes: string | null;
  isOverdue?: boolean;
  createdAt: string;
}

export function PaymentSchedulePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    contractId: "", description: "", amount: "", dueDate: "", notes: "",
  });

  const { data: schedules, isLoading } = useQuery<PaymentSchedule[]>({
    queryKey: ["payment-schedules"],
    queryFn: async () => {
      const res = await fetch("/api/payment-schedules", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/payment-schedules", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contractId: Number(data.contractId),
          description: data.description,
          amount: Number(data.amount),
          dueDate: data.dueDate,
          notes: data.notes || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-schedules"] });
      setOpen(false);
      setForm({ contractId: "", description: "", amount: "", dueDate: "", notes: "" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, paidAmount, status }: { id: number; paidAmount: number; status: string }) => {
      const res = await fetch(`/api/payment-schedules/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paidAmount, status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-schedules"] });
    },
  });

  const getStatusColor = (schedule: PaymentSchedule) => {
    if (schedule.isOverdue) return "bg-destructive/10 text-destructive border-destructive/20";
    switch (schedule.status) {
      case "pending": return "bg-yellow-500/10 text-yellow-600 border-yellow-500/20";
      case "partial": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "paid": return "bg-green-500/10 text-green-600 border-green-500/20";
      default: return "bg-muted";
    }
  };

  const getStatusLabel = (schedule: PaymentSchedule) => {
    if (schedule.isOverdue) return "معوق";
    switch (schedule.status) {
      case "pending": return "در انتظار";
      case "partial": return "پرداخت جزئی";
      case "paid": return "پرداخت شده";
      default: return schedule.status;
    }
  };

  const filtered = (schedules ?? []).filter((s) => {
    const matchSearch = s.description.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleMarkPaid = (schedule: PaymentSchedule) => {
    updateMutation.mutate({
      id: schedule.id,
      paidAmount: schedule.amount,
      status: "paid"
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">برنامه پرداخت</h1>
          <p className="text-muted-foreground mt-1">مدیریت زمان‌بندی پرداخت‌ها</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              برنامه جدید
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>برنامه پرداخت جدید</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>شناسه قرارداد *</Label>
                <Input type="number" value={form.contractId} onChange={(e) => setForm({ ...form, contractId: e.target.value })} />
              </div>
              <div>
                <Label>شرح *</Label>
                <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <Label>مبلغ (ریال) *</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>تاریخ سررسید *</Label>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
              </div>
              <div>
                <Label>یادداشت</Label>
                <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} />
              </div>
              <Button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.contractId || !form.description || !form.amount || !form.dueDate || createMutation.isPending}
                className="w-full"
              >
                {createMutation.isPending ? "در حال ایجاد..." : "ذخیره"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
          <option value="pending">در انتظار</option>
          <option value="partial">پرداخت جزئی</option>
          <option value="paid">پرداخت شده</option>
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((schedule) => (
            <Card key={schedule.id} className={`hover:border-primary/50 transition-colors ${schedule.isOverdue ? 'border-destructive' : ''}`}>
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className={`p-2 rounded-lg ${schedule.isOverdue ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
                    {schedule.isOverdue ? <AlertCircle className="h-5 w-5" /> : <Calendar className="h-5 w-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{schedule.description}</h3>
                    <p className="text-xs text-muted-foreground">قرارداد #{schedule.contractId}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">مبلغ کل</span>
                    <span className="font-mono font-bold">{schedule.amount.toLocaleString()} ریال</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">پرداخت شده</span>
                    <span className="font-mono">{schedule.paidAmount.toLocaleString()} ریال</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">سررسید</span>
                    <span>{new Date(schedule.dueDate).toLocaleDateString("fa-IR")}</span>
                  </div>
                  <div className="pt-2 border-t flex items-center justify-between">
                    <Badge variant="outline" className={getStatusColor(schedule)}>
                      {getStatusLabel(schedule)}
                    </Badge>
                    {schedule.status !== "paid" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkPaid(schedule)}
                        disabled={updateMutation.isPending}
                      >
                        <CheckCircle className="h-4 w-4 ml-1" />
                        پرداخت شد
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
