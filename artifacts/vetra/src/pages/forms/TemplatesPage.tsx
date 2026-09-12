import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, FileText, Search, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface FormTemplate {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  status: string;
  definition: { fields: any[] };
  usageCount?: number;
  createdAt: string;
}

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");

  const { data: templates, isLoading } = useQuery<FormTemplate[]>({
    queryKey: ["form-templates"],
    queryFn: async () => {
      const res = await fetch("/api/forms/templates", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/forms/templates/${id}/duplicate`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to duplicate");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["form-templates"] });
    },
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case "draft": return "bg-muted text-muted-foreground";
      case "published": return "bg-green-500/10 text-green-600 border-green-500/20";
      case "archived": return "bg-gray-500/10 text-gray-600 border-gray-500/20";
      default: return "bg-muted";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "draft": return "پیش‌نویس";
      case "published": return "منتشر شده";
      case "archived": return "بایگانی شده";
      default: return status;
    }
  };

  const categories = Array.from(new Set(templates?.map(t => t.category).filter(Boolean)));

  const filtered = (templates ?? []).filter((template) => {
    const matchSearch = template.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !categoryFilter || template.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">قالب‌های فرم</h1>
          <p className="text-muted-foreground mt-1">مدیریت قالب‌های فرم و آمار استفاده</p>
        </div>
      </div>

      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="جستجو در قالب‌ها..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-10" />
        </div>
        {categories.length > 0 && (
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">همه دسته‌ها</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">در حال بارگذاری...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((template) => (
            <Card key={template.id} className="hover:border-primary/50 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-primary/10 rounded-lg text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-lg truncate">{template.name}</h3>
                    {template.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{template.description}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  {template.category && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">دسته</span>
                      <Badge variant="outline">{template.category}</Badge>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">تعداد فیلدها</span>
                    <span className="font-mono">{template.definition.fields.length}</span>
                  </div>
                  {template.usageCount !== undefined && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">استفاده</span>
                      <span className="flex items-center gap-1 font-mono">
                        <TrendingUp className="h-3 w-3" />
                        {template.usageCount}
                      </span>
                    </div>
                  )}
                  <div className="pt-2 border-t flex items-center justify-between">
                    <Badge variant="outline" className={getStatusColor(template.status)}>
                      {getStatusLabel(template.status)}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => duplicateMutation.mutate(template.id)}
                      disabled={duplicateMutation.isPending}
                    >
                      <Copy className="h-4 w-4 ml-1" />
                      کپی
                    </Button>
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
