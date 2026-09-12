import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, FileText, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface Invoice {
  id: number;
  invoiceNumber: string;
  contractId: number | null;
  projectId: number | null;
  issueDate: string;
  dueDate: string | null;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  status: string;
  notes: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
  createdAt: string;
}

export function InvoicesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    invoiceNumber: "", issueDate: "", dueDate: "", notes: "",
    lines: [{ description: "", quantity: "", unitPrice: "" }],
  });

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: async () => {
      const res = await fetch("/api/invoices", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/invoices", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setOpen(false);
      setForm({
        invoiceNumber: "", issueDate: "", dueDate: "", notes: "",
        lines: [{ description: "", quantity: "", unitPrice: "" }],
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/invoices/${id}/approve`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "approved": return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20";
      case "sent": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "paid": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "overdue": return "bg-destructive/10 text-destructive border-destructive/20";
      default: return "bg-muted";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "draft": return "پیش‌نویس";
      case "approved": return "تأیید شده";
      case "sent": return "ارسال شده";
      case "paid": return "پرداخت شده";
      case "overdue": return "معوق";
      default: return status;
    }
  };

  const filtered = (invoices ?? []).filter((inv) =>
    inv.invoiceNumber.toLowerCase().includes(search.toLowerCase())
  );

  const addLine = () => {
    setForm({ ...form, lines: [...form.lines, { description: "", quantity: "", unitPrice: "" }] });
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">فاکتورها</h1>
          <p className="text-muted-foreground mt-1">مدیریت فاکتورها و صورتحساب‌ها</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              فاکتور جدید
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>فاکتور جدید</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>شماره فاکتور *</Label>
                  <Input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })} />
                </div>
                <div>
                  <Label>تاریخ صدور *</Label>
                  <Input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} />
                </div>
                <div>
                  <Label>تاریخ سررسید</Label>
                  <Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                </div>
                <div>
                  <Label>یادداشت</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>آیتم‌ها *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addLine}>
                    <Plus className="h-3 w-3 ml-1" /> افزودن آیتم
                  </Button>
                </div>
                {form.lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-3 gap-2 mb-2">
                    <Input placeholder="شرح" value={line.description} onChange={(e) => {
                      const newLines = [...form.lines];
                      newLines[i].description = e.target.value;
                      setForm({ ...form, lines: newLines });
                    }} />
                    <Input type="number" placeholder="مقدار" value={line.quantity} onChange={(e) => {
                      const newLines = [...form.lines];
                      newLines[i].quantity = e.target.value;
                      setForm({ ...form, lines: newLines });
                    }} />
                    <Input type="number" placeholder="قیمت واحد" value={line.unitPrice} onChange={(e) => {
                      const newLines = [...form.lines];
                      newLines[i].unitPrice = e.target.value;
                      setForm({ ...form, lines: newLines });
                    }} />
                  </div>
                ))}
              </div>
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.invoiceNumber || !form.issueDate || form.lines.every(l => !l.description) || createMutation.isPending} className="w-full">
                {createMutation.isPending ? "در حال ایجاد..." : "ذخیره"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجو در فاکتورها..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((invoice) => (
            <Card key={invoice.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{invoice.invoiceNumber}</h3>
                    <p className="text-xs text-muted-foreground">{new Date(invoice.issueDate).toLocaleDateString("fa-IR")}</p>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">مبلغ کل</span>
                    <span className="font-mono font-bold">{invoice.totalAmount.toLocaleString()} ریال</span>
                  </div>
                  {invoice.dueDate && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">سررسید</span>
                      <span>{new Date(invoice.dueDate).toLocaleDateString("fa-IR")}</span>
                    </div>
                  )}
                  <div className="pt-2 border-t flex items-center justify-between">
                    <Badge variant="outline" className={getStatusColor(invoice.status)}>
                      {getStatusLabel(invoice.status)}
                    </Badge>
                    {invoice.status === "draft" && (
                      <Button variant="ghost" size="sm" onClick={() => approveMutation.mutate(invoice.id)} disabled={approveMutation.isPending}>
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
