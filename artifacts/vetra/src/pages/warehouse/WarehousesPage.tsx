import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Warehouse, MapPin, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

interface WarehouseItem {
  id: number;
  name: string;
  location: string | null;
  manager: string | null;
  status: string;
  notes: string | null;
  projectId: number | null;
}

export function WarehousesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", location: "", manager: "", notes: "" });

  const { data: warehouses, isLoading } = useQuery<WarehouseItem[]>({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const res = await fetch("/api/warehouse", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await fetch("/api/warehouse", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      setOpen(false);
      setForm({ name: "", location: "", manager: "", notes: "" });
    },
  });

  const filtered = (warehouses ?? []).filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    (w.location ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">انبارها</h1>
          <p className="text-muted-foreground mt-1">مدیریت انبارها و موقعیت‌های ذخیره‌سازی</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 ml-2" />
              ایجاد انبار
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>انبار جدید</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div>
                <Label>نام انبار *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <Label>موقعیت</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <Label>مدیر انبار</Label>
                <Input value={form.manager} onChange={(e) => setForm({ ...form, manager: e.target.value })} />
              </div>
              <div>
                <Label>یادداشت</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
              <Button onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending} className="w-full">
                {createMutation.isPending ? "در حال ایجاد..." : "ذخیره"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجو در انبارها..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((warehouse) => (
            <Card key={warehouse.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <Warehouse className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{warehouse.name}</h3>
                    <Badge variant="outline" className="mt-1">
                      {warehouse.status === "active" ? "فعال" : "غیرفعال"}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {warehouse.location && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                      <span className="truncate">{warehouse.location}</span>
                    </div>
                  )}
                  {warehouse.manager && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="h-4 w-4" />
                      <span className="truncate">{warehouse.manager}</span>
                    </div>
                  )}
                  {warehouse.notes && (
                    <p className="text-xs text-muted-foreground line-clamp-2 pt-2 border-t">{warehouse.notes}</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
