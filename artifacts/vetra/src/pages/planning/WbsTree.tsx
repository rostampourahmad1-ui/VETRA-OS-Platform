import { useCallback, useMemo, useState } from "react";
import { useRoute } from "wouter";
import {
  useListWbs,
  useCreateWbs,
  useUpdateWbs,
  useDeleteWbs,
  getListWbsQueryKey,
} from "@workspace/api-client-react";
import type {
  WorkBreakdownStructure,
  WbsInput,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  FolderTree,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useToast } from "@/hooks/use-toast";
import { persianNumber } from "@/lib/jalali";

type WbsNode = WorkBreakdownStructure & { children: WbsNode[]; level: number };

function buildTree(items: WorkBreakdownStructure[]): WbsNode[] {
  const map = new Map<number, WbsNode>();
  const roots: WbsNode[] = [];
  for (const item of items) {
    map.set(item.id, { ...item, children: [], level: 0 });
  }
  for (const node of map.values()) {
    if (node.parentId != null && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  function assignLevel(nodes: WbsNode[], level: number) {
    for (const node of nodes) {
      node.level = level;
      assignLevel(node.children, level + 1);
    }
  }
  assignLevel(roots, 0);
  function sortNodes(nodes: WbsNode[]) {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
    for (const node of nodes) sortNodes(node.children);
  }
  sortNodes(roots);
  return roots;
}

function WbsFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initial,
  parentOptions,
  title,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: WbsInput) => Promise<void>;
  initial?: Partial<WbsInput>;
  parentOptions: WorkBreakdownStructure[];
  title: string;
  submitLabel: string;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [parentId, setParentId] = useState<number | null>(initial?.parentId ?? null);
  const [sortOrder, setSortOrder] = useState(initial?.sortOrder ?? 0);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim()) return;
    setLoading(true);
    try {
      await onSubmit({ code: code.trim(), name: name.trim(), description: description.trim() || null, parentId, sortOrder });
      onOpenChange(false);
    } catch {
      toast({ title: "خطا", description: "عملیات با خطا مواجه شد.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="wbs-code">کد</Label>
            <Input id="wbs-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: ۱.۲.۳" required dir="ltr" className="text-left" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wbs-name">نام</Label>
            <Input id="wbs-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="نام آیتم WBS" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wbs-desc">توضیحات</Label>
            <Input id="wbs-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="توضیحات اختیاری" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="wbs-parent">والد</Label>
            <select
              id="wbs-parent"
              value={parentId ?? ""}
              onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="">بدون والد (ریشه)</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="wbs-sort">ترتیب</Label>
            <Input id="wbs-sort" type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} min={0} dir="ltr" className="text-left" />
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <DialogClose asChild>
              <Button type="button" variant="outline">انصراف</Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>{loading ? <Spinner className="h-4 w-4" /> : null}{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function WbsTreeNode({
  node,
  onEdit,
  onDelete,
}: {
  node: WbsNode;
  onEdit: (item: WorkBreakdownStructure) => void;
  onDelete: (item: WorkBreakdownStructure) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;

  return (
    <div className="select-none">
      <div
        className="group flex items-center gap-2 rounded-md px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
        style={{ paddingRight: `${node.level * 24 + 12}px` }}
        onClick={() => hasChildren && setExpanded(!expanded)}
      >
        <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center text-muted-foreground">
          {hasChildren ? (
            expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
          ) : (
            <GripVertical className="h-3 w-3 opacity-30" />
          )}
        </span>
        <Badge variant="outline" className="font-mono text-xs flex-shrink-0" dir="ltr">
          {node.code}
        </Badge>
        <span className="flex-1 text-sm font-medium truncate">{node.name}</span>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onEdit(node); }}
            title="ویرایش"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={(e) => { e.stopPropagation(); onDelete(node); }}
            title="حذف"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <WbsTreeNode
              key={child.id}
              node={child}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WbsTree() {
  const [, params] = useRoute("/projects/:id/wbs");
  const projectId = params?.id ? parseInt(params.id, 10) : 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useListWbs(projectId, {
    query: { enabled: !!projectId, queryKey: getListWbsQueryKey(projectId) },
  });

  const createWbs = useCreateWbs();
  const updateWbs = useUpdateWbs();
  const deleteWbs = useDeleteWbs();

  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<WorkBreakdownStructure | null>(null);
  const [deleteItem, setDeleteItem] = useState<WorkBreakdownStructure | null>(null);

  const wbsItems = data?.wbs ?? [];
  const tree = useMemo(() => buildTree(wbsItems), [wbsItems]);

  const handleCreate = useCallback(async (input: WbsInput) => {
    await createWbs.mutateAsync({ id: projectId, data: input });
    queryClient.invalidateQueries({ queryKey: getListWbsQueryKey(projectId) });
    toast({ title: "ایجاد شد", description: `آیتم ${input.code} با موفقیت ایجاد شد.` });
  }, [projectId, createWbs, queryClient, toast]);

  const handleUpdate = useCallback(async (input: WbsInput) => {
    if (!editItem) return;
    await updateWbs.mutateAsync({ id: projectId, wbsId: editItem.id, data: input });
    queryClient.invalidateQueries({ queryKey: getListWbsQueryKey(projectId) });
    setEditItem(null);
    toast({ title: "بروزرسانی شد", description: `آیتم ${input.code} با موفقیت بروزرسانی شد.` });
  }, [projectId, editItem, updateWbs, queryClient, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteItem) return;
    await deleteWbs.mutateAsync({ id: projectId, wbsId: deleteItem.id });
    queryClient.invalidateQueries({ queryKey: getListWbsQueryKey(projectId) });
    setDeleteItem(null);
    toast({ title: "حذف شد", description: `آیتم ${deleteItem.code} با موفقیت حذف شد.` });
  }, [projectId, deleteItem, deleteWbs, queryClient, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive">
        خطا در دریافت ساختار شکست کار
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FolderTree className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">ساختار شکست کار (WBS)</h2>
            <p className="text-sm text-muted-foreground">
              {persianNumber(wbsItems.length)} آیتم
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          آیتم جدید
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardContent className="p-0">
          {tree.length === 0 ? (
            <div className="py-16">
              <Empty>
                <EmptyMedia variant="icon">
                  <FolderTree className="h-12 w-12 text-muted-foreground/40" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>بدون ساختار شکست کار</EmptyTitle>
                  <EmptyDescription>هنوز هیچ آیتم WBS برای این پروژه تعریف نشده است. برای شروع یک آیتم جدید ایجاد کنید.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setCreateOpen(true)} className="gap-2">
                    <Plus className="h-4 w-4" />
                    ایجاد اولین آیتم WBS
                  </Button>
                </EmptyContent>
              </Empty>
            </div>
          ) : (
            <div className="py-2">
              {tree.map((node) => (
                <WbsTreeNode
                  key={node.id}
                  node={node}
                  onEdit={setEditItem}
                  onDelete={setDeleteItem}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <WbsFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        parentOptions={wbsItems}
        title="ایجاد آیتم WBS جدید"
        submitLabel="ایجاد"
      />

      {editItem && (
        <WbsFormDialog
          open={!!editItem}
          onOpenChange={(open) => { if (!open) setEditItem(null); }}
          onSubmit={handleUpdate}
          initial={{ code: editItem.code, name: editItem.name, description: editItem.description, parentId: editItem.parentId, sortOrder: editItem.sortOrder }}
          parentOptions={wbsItems.filter((i) => i.id !== editItem.id)}
          title="ویرایش آیتم WBS"
          submitLabel="ذخیره"
        />
      )}

      <Dialog open={!!deleteItem} onOpenChange={(open) => { if (!open) setDeleteItem(null); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">حذف آیتم WBS</DialogTitle>
          </DialogHeader>
          <p className="text-right text-muted-foreground">
            آیا از حذف آیتم <strong>{deleteItem?.code} - {deleteItem?.name}</strong> اطمینان دارید؟
            این عملیات قابل بازگشت نیست.
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">انصراف</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteWbs.isPending}>
              {deleteWbs.isPending ? <Spinner className="h-4 w-4" /> : null}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
