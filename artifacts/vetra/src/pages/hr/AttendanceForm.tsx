import React, { useState, useEffect } from 'react';
import { t } from '@/lib/i18n';
import { Plus, Search, Clock, Calendar, User, Filter, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { formatJalali, persianNumber } from '@/lib/jalali';
import { get, post } from '@/lib/phase2-api';

const STATUS_OPTIONS = [
  { value: 'present', label: t('hr.attendance.statusPresent'), icon: CheckCircle2, color: 'text-emerald-500' },
  { value: 'absent', label: t('hr.attendance.statusAbsent'), icon: XCircle, color: 'text-destructive' },
  { value: 'late', label: t('hr.attendance.statusLate'), icon: AlertCircle, color: 'text-amber-500' },
  { value: 'leave', label: t('hr.attendance.statusLeave'), icon: Clock, color: 'text-sky-500' },
] as const;

interface AttendanceRecord {
  id: number;
  employeeId: number;
  organizationId: number;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  hoursWorked: number | null;
  overtimeHours: number | null;
  notes: string | null;
  recordedBy: number;
  createdAt: string;
  employeeName?: string;
}

interface Employee {
  id: number;
  code: string;
  firstName: string;
  lastName: string;
  position: string;
}

export default function AttendanceForm() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    date: new Date().toISOString().split('T')[0],
    checkIn: '',
    checkOut: '',
    status: 'present',
    hoursWorked: '',
    overtimeHours: '',
    notes: '',
  });

  const fetchData = async () => {
    try {
      const q = statusFilter ? { status: statusFilter } : {};
      const [attRecords, emps] = await Promise.all([
        get<AttendanceRecord[]>('/attendance', q),
        get<Employee[]>('/employees'),
      ]);
      const empMap = new Map(emps.map(e => [e.id, `${e.firstName} ${e.lastName}`]));
      setRecords(attRecords.map(r => ({ ...r, employeeName: empMap.get(r.employeeId) ?? '—' })));
      setEmployees(emps);
    } catch {
      // silently handle
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.employeeId || !form.date) return;
    try {
      await post('/attendance', {
        employeeId: Number(form.employeeId),
        date: form.date,
        checkIn: form.checkIn || null,
        checkOut: form.checkOut || null,
        status: form.status,
        hoursWorked: form.hoursWorked ? Number(form.hoursWorked) : undefined,
        overtimeHours: form.overtimeHours ? Number(form.overtimeHours) : undefined,
        notes: form.notes || null,
      });
      setDialogOpen(false);
      setForm({ employeeId: '', date: new Date().toISOString().split('T')[0], checkIn: '', checkOut: '', status: 'present', hoursWorked: '', overtimeHours: '', notes: '' });
      fetchData();
    } catch {
      // silently handle
    }
  };

  const statusBadge = (status: string) => {
    const opt = STATUS_OPTIONS.find(s => s.value === status);
    if (!opt) return <Badge variant="outline">{status}</Badge>;
    const Icon = opt.icon;
    return (
      <Badge variant="outline" className="gap-1.5 font-sans">
        <Icon className={`h-3.5 w-3.5 ${opt.color}`} />
        {opt.label}
      </Badge>
    );
  };

  const filteredRecords = search
    ? records.filter(r => r.employeeName?.toLowerCase().includes(search.toLowerCase()))
    : records;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('hr.attendance.title')}</h1>
          <p className="text-muted-foreground">{t('hr.attendance.subtitle')}</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="shrink-0 gap-2">
              <Plus className="h-4 w-4" /> {t('hr.attendance.register')}
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              {t('hr.attendance.registerDialog')}
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4" dir="rtl">
              <div className="space-y-2">
                <Label htmlFor="employee">{t("hr.attendance.employee")}</Label>
                <Select value={form.employeeId} onValueChange={(v) => setForm(f => ({ ...f, employeeId: v }))}>
                  <SelectTrigger id="employee" className="font-sans">
                    <SelectValue placeholder="{t('hr.attendance.selectEmployee')}" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map(emp => (
                      <SelectItem key={emp.id} value={String(emp.id)} className="font-sans">
                        {emp.firstName} {emp.lastName} ({emp.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">{t("common.date")}</Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm(f => ({ ...f, date: e.target.value }))}
                  required
                  className="font-sans"
                />
                <p className="text-xs text-muted-foreground">
                  {formatJalali(form.date, 'yyyy/MM/dd')} 
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="checkIn">{t("hr.attendance.colCheckIn")}</Label>
                  <Input
                    id="checkIn"
                    type="time"
                    value={form.checkIn}
                    onChange={(e) => setForm(f => ({ ...f, checkIn: e.target.value }))}
                    className="font-sans"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="checkOut">{t("hr.attendance.colCheckOut")}</Label>
                  <Input
                    id="checkOut"
                    type="time"
                    value={form.checkOut}
                    onChange={(e) => setForm(f => ({ ...f, checkOut: e.target.value }))}
                    className="font-sans"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">{t("hr.attendance.colStatus")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger id="status" className="font-sans">
                    <SelectValue placeholder={t("hr.attendance.colStatus")} />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value} className="font-sans">
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hoursWorked">{t("hr.attendance.hoursWorked")}</Label>
                  <Input
                    id="hoursWorked"
                    type="number"
                    step="0.5"
                    placeholder={t('hr.attendance.overtimePlaceholder')}
                    value={form.hoursWorked}
                    onChange={(e) => setForm(f => ({ ...f, hoursWorked: e.target.value }))}
                    className="font-sans"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overtimeHours">{t("hr.attendance.overtime")}</Label>
                  <Input
                    id="overtimeHours"
                    type="number"
                    step="0.5"
                    placeholder={t('hr.attendance.notesPlaceholder')}
                    value={form.overtimeHours}
                    onChange={(e) => setForm(f => ({ ...f, overtimeHours: e.target.value }))}
                    className="font-sans"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">{t("hr.attendance.colNotes")}</Label>
                <Input
                  id="notes"
                  placeholder="{t('hr.attendance.notesPlaceholder')}"
                  value={form.notes}
                  onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="font-sans"
                />
              </div>
              <Button type="submit" className="w-full gap-2">
                <Clock className="h-4 w-4" /> {t('hr.attendance.registerDialog')}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border shadow-sm">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="{t('hr.attendance.searchPlaceholder')}"
            className="pl-9 font-sans text-right"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 font-sans">
              <SelectValue placeholder="{t('hr.attendance.allStatuses')}" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" " className="font-sans">{t('hr.attendance.all')}</SelectItem>
              {STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value} className="font-sans">{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="py-20 text-center font-mono text-muted-foreground">{t('hr.attendance.loading')}</div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-20 text-center">
            <Clock className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">{t('hr.attendance.noData')}</p>
            <p className="text-sm text-muted-foreground/60 mt-1">{t('hr.attendance.noDataHint')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-right text-muted-foreground">
                  <th className="py-3 px-4 font-medium">{t("hr.attendance.employee")}</th>
                  <th className="py-3 px-4 font-medium">{t("common.date")} ()</th>
                  <th className="py-3 px-4 font-medium">{t("hr.attendance.colCheckIn")}</th>
                  <th className="py-3 px-4 font-medium">{t("hr.attendance.colCheckOut")}</th>
                  <th className="py-3 px-4 font-medium">{t("hr.attendance.hoursWorked")}</th>
                  <th className="py-3 px-4 font-medium">{t("hr.attendance.overtime")}</th>
                  <th className="py-3 px-4 font-medium">{t("hr.attendance.colStatus")}</th>
                  <th className="py-3 px-4 font-medium">{t("hr.attendance.colNotes")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRecords.map((rec) => (
                  <tr key={rec.id} className="group hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{rec.employeeName}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-sans">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                        {formatJalali(rec.date, 'yyyy/MM/dd')}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-sans">{rec.checkIn || '—'}</td>
                    <td className="py-3 px-4 font-sans">{rec.checkOut || '—'}</td>
                    <td className="py-3 px-4 font-sans">{rec.hoursWorked != null ? persianNumber(String(rec.hoursWorked)) : '—'}</td>
                    <td className="py-3 px-4 font-sans">{rec.overtimeHours != null ? persianNumber(String(rec.overtimeHours)) : '—'}</td>
                    <td className="py-3 px-4">{statusBadge(rec.status)}</td>
                    <td className="py-3 px-4 text-muted-foreground max-w-[200px] truncate">{rec.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
