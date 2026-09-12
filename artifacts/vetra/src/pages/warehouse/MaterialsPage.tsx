import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Package, AlertCircle, Barcode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Material {
  id: number;
  code: string;
  name: string;
  category: string;
  unit: string;
  unitPrice: number;
  currentStock: number;
  minStock: number | null;
  sku: string | null;
  barcode: string | null;
  warehouseId: number | null;
  supplierId: number | null;
  supplierName: string | null;
}

interface Warehouse {
  id: number;
  name: string;
}

interface Supplier {
  id: number;
  name: string;
}

export function MaterialsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "", name: "", category: "", unit: "", unitPrice: "", minStock: "",
    currentStock: "", sku: "", barcode: "", warehouseId: "", supplierId: "",
  });

  const { data: materials, isLoading } = useQuery<Material[]>({
    queryKey: ["materials"],
    queryFn: async () => {
      const res = await fetch("/api/materials", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: warehouses } = useQuery<Warehouse[]>({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await fetch("/api/warehouse", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ["suppliers"],
    queryFn: async () => {
      const res = await fetch("/api/suppliers", { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const payload = {
        ...data,
        unitPrice: data.unitPrice ? Number(data.unitPrice) : 0,
        minStock: data.minStock ? Number(data.minStock) : null,
        currentStock: data.currentStock ? Number(data.currentStock) : 0,
        warehouseId: data.warehouseId ? Number(data.warehouseId) : null,
        supplierId: data.supplierId ? Number(data.supplierId) : null,
      };
      const res = await fetch("/api/materials", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      setOpen(false);
      setForm({
        code: "", name: "", category: "", unit: "", unitPrice: "", minStock: "",
        currentStock: "", sku: "", barcode: "", warehouseId: "", supplierId: "",
      });
    },
  });

  const categories = [...new Set(materials?.map(m => m.category) ?? [])];
  const filtered = (materials ?? []).filter((m) => {
    if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
    if (search && !m.name.toLowerCase().includes(search.toLowerCase()) && !m.code.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">مواد و کالاها</h1>
          <p className="text-muted-foreground mt-1">مدیریت موجودی و قیمت مواد</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              ماده جدید
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>ماده جدید</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div>
                <Label>کد *</Label>
                <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
              </div>
              <div>
                <Label>نام *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>دسته‌بندی *</Label>
                <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="مثال: سیمان، آجر، میلگرد" />
              </div>
              <div>
                <Label>واحد *</Label>
                <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="مثال: کیلوگرم، متر، عدد" />
              </div>
              <div>
                <Label>قیمت واحد</Label>
                <Input type="number" value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} />
              </div>
              <div>
                <Label>حداقل موجودی</Label>
                <Input type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} />
              </div>
              <div>
                <Label>موجودی فعلی</Label>
                <Input type="number" value={form.currentStock} onChange={(e) => setForm({ ...form, currentStock: e.target.value })} />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </div>
              <div>
                <Label>بارکد</Label>
                <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </div>
              <div>
                <Label>انبار</Label>
                <Select value={form.warehouseId} onValueChange={(v) => setForm({ ...form, warehouseId: v })}>
                  <SelectTrigger><SelectValue placeholder="انتخاب انبار" /></SelectTrigger>
                  <SelectContent>
                    {(warehouses ?? []).map(w => <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>تأمین‌کننده</Label>
                <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
                  <SelectTrigger><SelectValue placeholder="انتخاب تأمین‌کننده" /></SelectTrigger>
                  <SelectContent>
                    {(suppliers ?? []).map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button onClick={() => createMutation.mutate(form)} disabled={!form.code || !form.name || !form.category || !form.unit || createMutation.isPending} className="w-full mt-4">
              {createMutation.isPending ? "در حال ایجاد..." : "ذخیره"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجو در مواد..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">همه دسته‌ها</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((material) => {
            const isLow = material.minStock && material.currentStock <= material.minStock;
            return (
              <Card key={material.id} className={`hover:border-primary/50 transition-colors ${isLow ? 'border-amber-500/50' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3 mb-4">
                    <div className={`p-2 rounded-lg ${isLow ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'}`}>
                      {isLow ? <AlertCircle className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{material.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{material.code}</p>
                    </div>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">موجودی</span>
                      <span className={`font-mono font-semibold ${isLow ? 'text-amber-600' : ''}`}>
                        {material.currentStock} {material.unit}
                      </span>
                    </div>
                    {material.minStock && (
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">حداقل</span>
                        <span className="font-mono text-xs">{material.minStock} {material.unit}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t">
                      <Badge variant="outline">{material.category}</Badge>
                      <span className="font-mono text-xs">{material.unitPrice.toLocaleString()} ریال</span>
                    </div>
                    {material.barcode && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground pt-1">
                        <Barcode className="h-3 w-3" />
                        <span className="font-mono">{material.barcode}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
