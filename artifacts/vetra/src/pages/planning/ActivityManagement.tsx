import { useCallback, useState } from "react";
import { useRoute } from "wouter";
import {
  useListWbs,
  useCreatePlanningActivity,
  useUpdatePlanningActivity,
  useDeletePlanningActivity,
  getListWbsQueryKey,
} from "@workspace/api-client-react";
import type {
  PlanningActivity,
  PlanningActivityInput,
  PlanningActivityUpdate,
  WorkBreakdownStructure,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Pencil,
  Trash2,
  ListTodo,
  Calendar,
  Clock,
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { useToast } from "@/hooks/use-toast";
import { formatJalali, persianNumber } from "@/lib/jalali";

const STATUS_LABELS: Record<string, string> = {
  not_started: "شروع نشده",
  in_progress: "در حال انجام",
  completed: "تکمیل شده",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  not_started: "secondary",
  in_progress: "default",
  completed: "outline",
};

const TYPE_LABELS: Record<string, string> = {
  task: "فعالیت",
  milestone: "نقطه عطف",
};

function ActivityFormDialog({
  open,
  onOpenChange,
  onSubmit,
  initial,
  wbsOptions,
  title,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: PlanningActivityInput | PlanningActivityUpdate) => Promise<void>;
  initial?: Partial<PlanningActivity>;
  wbsOptions: WorkBreakdownStructure[];
  title: string;
  submitLabel: string;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [wbsId, setWbsId] = useState<number>(initial?.wbsId ?? (wbsOptions[0]?.id ?? 0));
  const [activityType, setActivityType] = useState<string>(initial?.activityType ?? "task");
  const [plannedStart, setPlannedStart] = useState(initial?.plannedStart?.slice(0, 10) ?? "");
  const [plannedFinish, setPlannedFinish] = useState(initial?.plannedFinish?.slice(0, 10) ?? "");
  const [durationDays, setDurationDays] = useState(initial?.durationDays?.toString() ?? "0");
  const [status, setStatus] = useState<string>(initial?.status ?? "not_started");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !plannedStart || !plannedFinish || !wbsId) return;
    setLoading(true);
    try {
      const data: PlanningActivityInput = {
        wbsId,
        code: code.trim(),
        name: name.trim(),
        activityType: activityType as PlanningActivityInput["activityType"],
        plannedStart,
        plannedFinish,
        durationDays: activityType === "milestone" ? 0 : Number(durationDays),
        status: status as PlanningActivityInput["status"],
      };
      await onSubmit(data);
      onOpenChange(false);
    } catch {
      toast({ title: "خطا", description: "عملیات با خطا مواجه شد.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-right">{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="act-code">کد</Label>
              <Input id="act-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="مثال: A-101" required dir="ltr" className="text-left" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="act-type">نوع</Label>
              <select
                id="act-type"
                value={activityType}
                onChange={(e) => {
                  setActivityType(e.target.value);
                  if (e.target.value === "milestone") setDurationDays("0");
                }}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="task">فعالیت</option>
                <option value="milestone">نقطه عطف</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="act-name">نام</Label>
            <Input id="act-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="نام فعالیت" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="act-wbs">WBS</Label>
            <select
              id="act-wbs"
              value={wbsId}
              onChange={(e) => setWbsId(Number(e.target.value))}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            >
              {wbsOptions.length === 0 && <option value="">—</option>}
              {wbsOptions.map((w) => (
                <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="act-start">تاریخ شروع</Label>
              <Input id="act-start" type="date" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="act-finish">تاریخ پایان</Label>
              <Input id="act-finish" type="date" value={plannedFinish} onChange={(e) => setPlannedFinish(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="act-duration">مدت (روز)</Label>
              <Input
                id="act-duration"
                type="number"
                min={0}
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                disabled={activityType === "milestone"}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="act-status">وضعیت</Label>
              <select
                id="act-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="not_started">شروع نشده</option>
                <option value="in_progress">در حال انجام</option>
                <option value="completed">تکمیل شده</option>
              </select>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline" type="button">انصراف</Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? <Spinner className="h-4 w-4" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ActivityManagement() {
  const [, params] = useRoute("/projects/:id/activities");
  const projectId = params?.id ? Number(params.id) : 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading, isError } = useListWbs(projectId, {
    query: { queryKey: getListWbsQueryKey(projectId), enabled: projectId > 0 },
  });

  const createActivity = useCreatePlanningActivity();
  const updateActivity = useUpdatePlanningActivity();
  const deleteActivity = useDeletePlanningActivity();

  const [createOpen, setCreateOpen] = useState(false);
  const [editItem, setEditItem] = useState<PlanningActivity | null>(null);
  const [deleteItem, setDeleteItem] = useState<PlanningActivity | null>(null);

  const wbsItems = data?.wbs ?? [];
  const activities = data?.activities ?? [];

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListWbsQueryKey(projectId) });
  }, [projectId, queryClient]);

  const handleCreate = useCallback(async (input: PlanningActivityInput) => {
    await createActivity.mutateAsync({ projectId, data: input });
    invalidate();
    toast({ title: "ایجاد شد", description: `\u0641\u0639\u0627\u0644\u06CC\u062A ${input.code} \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0627\u06CC\u062C\u0627\u062F \u0634\u062F.` });
  }, [projectId, createActivity, invalidate, toast]);

  const handleUpdate = useCallback(async (input: PlanningActivityInput | PlanningActivityUpdate) => {
    if (!editItem) return;
    await updateActivity.mutateAsync({ projectId, activityId: editItem.id, data: input as PlanningActivityUpdate });
    setEditItem(null);
    invalidate();
    toast({ title: "\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F", description: `\u0641\u0639\u0627\u0644\u06CC\u062A ${editItem.code} \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u0634\u062F.` });
  }, [projectId, editItem, updateActivity, invalidate, toast]);

  const handleDelete = useCallback(async () => {
    if (!deleteItem) return;
    await deleteActivity.mutateAsync({ projectId, activityId: deleteItem.id });
    setDeleteItem(null);
    invalidate();
    toast({ title: "\u062D\u0630\u0641 \u0634\u062F", description: `\u0641\u0639\u0627\u0644\u06CC\u062A ${deleteItem.code} \u0628\u0627 \u0645\u0648\u0641\u0642\u06CC\u062A \u062D\u0630\u0641 \u0634\u062F.` });
  }, [projectId, deleteItem, deleteActivity, invalidate, toast]);

  const getWbsLabel = (wbsId: number) => {
    const wbs = wbsItems.find((w) => w.id === wbsId);
    return wbs ? `${wbs.code} - ${wbs.name}` : `WBS #${wbsId}`;
  };

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
        خطا در دریافت اطلاعات فعالیت‌ها
      </div>
    );
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ListTodo className="h-6 w-6 text-primary" />
          <div>
            <h2 className="text-xl font-bold">مدیریت فعالیت‌ها</h2>
            <p className="text-sm text-muted-foreground">
              {persianNumber(activities.length)} فعالیت
            </p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2" disabled={wbsItems.length === 0}>
          <Plus className="h-4 w-4" />
          فعالیت جدید
        </Button>
      </div>

      {wbsItems.length === 0 && activities.length === 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="py-16">
              <Empty>
                <EmptyMedia variant="icon">
                  <ListTodo className="h-12 w-12 text-muted-foreground/40" />
                </EmptyMedia>
                <EmptyHeader>
                  <EmptyTitle>بدون فعالیت</EmptyTitle>
                  <EmptyDescription>
                    ابتدا باید یک آیتم WBS برای این پروژه تعریف کنید، سپس می‌توانید فعالیت ایجاد کنید.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            </div>
          </CardContent>
        </Card>
      )}

      {activities.length > 0 && (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40">
                    <th className="px-4 py-3 text-right font-medium">کد</th>
                    <th className="px-4 py-3 text-right font-medium">نام</th>
                    <th className="px-4 py-3 text-right font-medium">نوع</th>
                    <th className="px-4 py-3 text-right font-medium">WBS</th>
                    <th className="px-4 py-3 text-right font-medium">وضعیت</th>
                    <th className="px-4 py-3 text-right font-medium">شروع</th>
                    <th className="px-4 py-3 text-right font-medium">پایان</th>
                    <th className="px-4 py-3 text-right font-medium">مدت</th>
                    <th className="px-4 py-3 text-center font-medium">عملیات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {activities.map((activity) => (
                    <tr key={activity.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs" dir="ltr">{activity.code}</td>
                      <td className="px-4 py-3 font-medium max-w-[200px] truncate">{activity.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant={activity.activityType === "milestone" ? "outline" : "default"}>
                          {TYPE_LABELS[activity.activityType] ?? activity.activityType}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{getWbsLabel(activity.wbsId)}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANTS[activity.status] ?? "secondary"}>
                          {STATUS_LABELS[activity.status] ?? activity.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatJalali(activity.plannedStart)}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-muted-foreground" />
                          {formatJalali(activity.plannedFinish)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3 text-muted-foreground" />
                          {persianNumber(activity.durationDays)} روز
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEditItem(activity)}
                            title="ویرایش"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteItem(activity)}
                            title="حذف"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <ActivityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        wbsOptions={wbsItems}
        title="ایجاد فعالیت جدید"
        submitLabel="ایجاد"
      />

      {editItem && (
        <ActivityFormDialog
          open={!!editItem}
          onOpenChange={(open) => { if (!open) setEditItem(null); }}
          onSubmit={handleUpdate}
          initial={editItem}
          wbsOptions={wbsItems}
          title="ویرایش فعالیت"
          submitLabel="ذخیره"
        />
      )}

      <Dialog open={!!deleteItem} onOpenChange={(open) => { if (!open) setDeleteItem(null); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">حذف فعالیت</DialogTitle>
          </DialogHeader>
          <p className="text-right text-muted-foreground">
            آیا از حذف فعالیت <strong>{deleteItem?.code} - {deleteItem?.name}</strong> اطمینان دارید؟
            این عملیات قابل بازگشت نیست.
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <DialogClose asChild>
              <Button variant="outline">انصراف</Button>
            </DialogClose>
            <Button variant="destructive" onClick={handleDelete} disabled={deleteActivity.isPending}>
              {deleteActivity.isPending ? <Spinner className="h-4 w-4" /> : null}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
