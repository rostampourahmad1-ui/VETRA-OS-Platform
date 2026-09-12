import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckSquare, Download, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

interface FormSubmission {
  id: number;
  templateId: number;
  submittedBy: number;
  answers: Record<string, any>;
  status: string;
  workflowRunId: number | null;
  approvedBy: number | null;
  approvedAt: string | null;
  submittedAt: string;
}

export function SubmissionsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const { data: submissions, isLoading } = useQuery<FormSubmission[]>({
    queryKey: ["form-submissions", statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      const res = await fetch(`/api/form-submissions?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      const res = await fetch("/api/form-submissions/bulk-decision", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, decision: "approve" }),
      });
      if (!res.ok) throw new Error("Failed to approve");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form-submissions"] });
      setSelected(new Set());
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (dateFrom) params.append("dateFrom", dateFrom);
      if (dateTo) params.append("dateTo", dateTo);
      params.append("format", "csv");
      const res = await fetch(`/api/form-submissions/export?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to export");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `submissions-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "submitted": return "bg-blue-500/10 text-blue-600 border-blue-500/20";
      case "approved": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "rejected": return "bg-red-500/10 text-red-600 border-red-500/20";
      default: return "bg-muted";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "draft": return "پیش‌نویس";
      case "submitted": return "ارسال شده";
      case "approved": return "تأیید شده";
      case "rejected": return "رد شده";
      default: return status;
    }
  };

  const filtered = (submissions ?? []).filter((sub) =>
    sub.id.toString().includes(search) || sub.templateId.toString().includes(search)
  );

  const toggleSelection = (id: number) => {
    const newSelected = new Set(selected);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelected(newSelected);
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map(s => s.id)));
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">ارسال‌های فرم</h1>
          <p className="text-muted-foreground mt-1">بررسی و تأیید ارسال‌ها</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending}
          >
            <Download className="h-4 w-4 ml-2" />
            خروجی CSV
          </Button>
          {selected.size > 0 && (
            <Button
              onClick={() => bulkApproveMutation.mutate(Array.from(selected))}
              disabled={bulkApproveMutation.isPending}
            >
              <CheckSquare className="h-4 w-4 ml-2" />
              تأیید گروهی ({selected.size})
            </Button>
          )}
        </div>
      </div>

      <div className="flex gap-4 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
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
          <option value="rejected">رد شده</option>
        </select>
        <Input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="w-auto"
          placeholder="از تاریخ"
        />
        <Input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="w-auto"
          placeholder="تا تاریخ"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="p-3 text-right">
                  <Checkbox
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onCheckedChange={toggleAll}
                  />
                </th>
                <th className="p-3 text-right font-medium">شناسه</th>
                <th className="p-3 text-right font-medium">قالب</th>
                <th className="p-3 text-right font-medium">تاریخ ارسال</th>
                <th className="p-3 text-right font-medium">تأیید شده توسط</th>
                <th className="p-3 text-right font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub) => (
                <tr key={sub.id} className="border-t hover:bg-muted/30">
                  <td className="p-3">
                    <Checkbox
                      checked={selected.has(sub.id)}
                      onCheckedChange={() => toggleSelection(sub.id)}
                    />
                  </td>
                  <td className="p-3 font-mono">#{sub.id}</td>
                  <td className="p-3">قالب #{sub.templateId}</td>
                  <td className="p-3 text-sm text-muted-foreground">
                    {new Date(sub.submittedAt).toLocaleDateString("fa-IR")}
                  </td>
                  <td className="p-3 text-sm">
                    {sub.approvedBy ? `کاربر #${sub.approvedBy}` : "-"}
                  </td>
                  <td className="p-3">
                    <Badge variant="outline" className={getStatusColor(sub.status)}>
                      {getStatusLabel(sub.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
