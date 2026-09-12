import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Barcode as BarcodeIcon, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Material {
  id: number;
  code: string;
  name: string;
  unit: string;
  barcode: string | null;
}

interface Warehouse {
  id: number;
  name: string;
}

export function ReceivePage() {
  const queryClient = useQueryClient();
  const [materialId, setMaterialId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [barcode, setBarcode] = useState("");
  const [notes, setNotes] = useState("");

  const { data: materials } = useQuery<Material[]>({
    queryKey: ["materials"],
    queryFn: async () => {
      const res = await fetch("/api/materials", { credentials: "include" });
      if (!res.ok) return [];
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

  const receiveMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/stock/receive", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: Number(materialId),
          warehouseId: Number(warehouseId),
          quantity: Number(quantity),
          barcode: barcode || null,
          refType: "manual",
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to receive");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["materials"] });
      queryClient.invalidateQueries({ queryKey: ["stock-ledger"] });
      setMaterialId("");
      setWarehouseId("");
      setQuantity("");
      setBarcode("");
      setNotes("");
    },
  });

  const selectedMaterial = materials?.find(m => m.id === Number(materialId));

  return (
    <div className="container mx-auto p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">دریافت موجودی</h1>
        <p className="text-muted-foreground mt-1">ثبت ورود مواد به انبار</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            اطلاعات دریافت
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div>
            <Label>ماده *</Label>
            <Select value={materialId} onValueChange={setMaterialId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب ماده" />
              </SelectTrigger>
              <SelectContent>
                {(materials ?? []).map(m => (
                  <SelectItem key={m.id} value={m.id.toString()}>
                    {m.name} ({m.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>انبار *</Label>
            <Select value={warehouseId} onValueChange={setWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder="انتخاب انبار" />
              </SelectTrigger>
              <SelectContent>
                {(warehouses ?? []).map(w => (
                  <SelectItem key={w.id} value={w.id.toString()}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>مقدار *</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="0"
                className="flex-1"
              />
              {selectedMaterial && (
                <div className="flex items-center px-3 bg-muted rounded-md text-sm text-muted-foreground">
                  {selectedMaterial.unit}
                </div>
              )}
            </div>
          </div>

          <div>
            <Label>بارکد</Label>
            <div className="relative">
              <BarcodeIcon className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="اسکن یا وارد کنید"
                className="pr-10"
              />
            </div>
          </div>

          <div>
            <Label>یادداشت</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="توضیحات اختیاری"
            />
          </div>

          <Button
            onClick={() => receiveMutation.mutate()}
            disabled={!materialId || !warehouseId || !quantity || receiveMutation.isPending}
            className="w-full"
          >
            {receiveMutation.isPending ? (
              "در حال ثبت..."
            ) : (
              <>
                <Check className="h-4 w-4 ml-2" />
                ثبت دریافت
              </>
            )}
          </Button>

          {receiveMutation.isError && (
            <p className="text-sm text-destructive">
              {(receiveMutation.error as Error)?.message || "خطا در ثبت"}
            </p>
          )}

          {receiveMutation.isSuccess && (
            <p className="text-sm text-emerald-600">
              دریافت با موفقیت ثبت شد
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
