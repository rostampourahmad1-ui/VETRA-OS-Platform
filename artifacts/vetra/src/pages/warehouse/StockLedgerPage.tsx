import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ArrowDownCircle, ArrowUpCircle, RefreshCw, GitMerge } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface Movement {
  id: number;
  materialId: number;
  materialName: string;
  materialUnit: string;
  warehouseId: number;
  warehouseName: string;
  type: string;
  quantity: number;
  refType: string | null;
  refId: number | null;
  barcode: string | null;
  notes: string | null;
  createdBy: number;
  createdAt: string;
}

export function StockLedgerPage() {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const { data, isLoading } = useQuery<{ data: Movement[]; pagination: any }>({
    queryKey: ["stock-ledger", { type: typeFilter }],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "100" });
      if (typeFilter !== "all") params.set("type", typeFilter);
      const res = await fetch(`/api/stock/ledger?${params}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "in": return <ArrowDownCircle className="h-4 w-4 text-emerald-600" />;
      case "out": return <ArrowUpCircle className="h-4 w-4 text-rose-600" />;
      case "adjust": return <RefreshCw className="h-4 w-4 text-amber-600" />;
      case "transfer": return <GitMerge className="h-4 w-4 text-blue-600" />;
      default: return null;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "in": return "ورود";
      case "out": return "خروج";
      case "adjust": return "تعدیل";
      case "transfer": return "انتقال";
      default: return type;
    }
  };

  const filtered = (data?.data ?? []).filter((m) =>
    (m.materialName ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (m.warehouseName ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">دفتر حرکات انبار</h1>
        <p className="text-muted-foreground mt-1">تاریخچه تمام ورود و خروج مواد</p>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجو در حرکات..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه حرکات</SelectItem>
            <SelectItem value="in">ورود</SelectItem>
            <SelectItem value="out">خروج</SelectItem>
            <SelectItem value="adjust">تعدیل</SelectItem>
            <SelectItem value="transfer">انتقال</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-right text-muted-foreground">
                  <th className="py-3 px-4 font-medium w-10"></th>
                  <th className="py-3 px-4 font-medium">نوع</th>
                  <th className="py-3 px-4 font-medium">ماده</th>
                  <th className="py-3 px-4 font-medium">انبار</th>
                  <th className="py-3 px-4 font-medium text-left">مقدار</th>
                  <th className="py-3 px-4 font-medium">تاریخ</th>
                  <th className="py-3 px-4 font-medium">یادداشت</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((movement) => {
                  const isPositive = movement.quantity > 0;
                  return (
                    <tr key={movement.id} className="group hover:bg-muted/50 transition-colors">
                      <td className="py-3 px-4">{getTypeIcon(movement.type)}</td>
                      <td className="py-3 px-4">
                        <Badge variant="outline" className="font-mono text-xs">
                          {getTypeLabel(movement.type)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 font-medium">
                        {movement.materialName}
                        {movement.barcode && (
                          <span className="block text-xs text-muted-foreground font-mono">{movement.barcode}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{movement.warehouseName}</td>
                      <td className={`py-3 px-4 text-left font-mono font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? '+' : ''}{movement.quantity} {movement.materialUnit}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground text-xs" dir="ltr">
                        {new Date(movement.createdAt).toLocaleString("fa-IR")}
                      </td>
                      <td className="py-3 px-4 text-xs text-muted-foreground truncate max-w-xs">
                        {movement.notes || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
