import React from 'react';
import { Link, useLocation } from 'wouter';
import { useEffect, useState, useRef, useCallback } from 'react';
import { get } from '@/lib/phase2-api';
import {
  Building2, LayoutDashboard, FolderKanban, ListTodo, FileText,
  Briefcase, Activity, Users, Package, Truck, ClipboardList, X,
  Settings, ChevronDown, Bell, Search, Menu,
  Calendar, Wrench, BarChart3, Bot, Calculator, ClipboardCheck,
  UserCircle, LogOut,
  CalendarClock, TrendingUp, Boxes,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUser, useClerk } from '@clerk/react';
import { useOrganizationProject } from '@/contexts/OrganizationProjectContext';
import { formatRelativeJalali } from '@/lib/jalali';

export function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Topbar />
        <main className="flex-1 overflow-auto bg-background p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

function Sidebar() {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');

  const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Projects', href: '/projects', icon: FolderKanban },
    { name: 'Tasks', href: '/tasks', icon: ListTodo },
    { name: 'Documents', href: '/documents', icon: FileText },
    { name: 'Forms', href: '/forms', icon: ClipboardList },
    { name: 'Quality', href: '/quality', icon: ClipboardCheck },
    { name: 'Contracts', href: '/contracts', icon: Briefcase },
    { name: 'Daily Reports', href: '/daily-reports', icon: Activity },
    { name: 'Meetings', href: '/meetings', icon: Calendar },
    { name: 'HR & Team', href: '/hr', icon: Users },
    { name: 'Equipment', href: '/equipment', icon: Wrench },
    { name: 'Inventory', href: '/inventory', icon: Package },
                { name: 'Procurement', href: '/procurement', icon: Truck },
           { name: 'Workspace', href: '/workspace', icon: LayoutDashboard },
    { name: 'Scheduling', href: '/scheduling', icon: CalendarClock },
    { name: 'Progress', href: '/progress', icon: TrendingUp },
    { name: 'Resources', href: '/resources', icon: Boxes },

  ];

  const initials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.firstName
    ? user.firstName[0]
    : user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? '?';

  const displayName = user?.fullName
    ?? user?.firstName
    ?? user?.emailAddresses?.[0]?.emailAddress
    ?? 'User';

  return (
    <div className="hidden md:flex flex-col w-64 bg-sidebar border-r border-sidebar-border h-full text-sidebar-foreground">
      <div className="h-16 flex items-center px-6 border-b border-sidebar-border bg-sidebar">
        <div className="flex items-center gap-3 w-full">
          <div className="h-8 w-8 rounded bg-sidebar-primary flex items-center justify-center text-sidebar-primary-foreground font-bold">
            V
          </div>
          <div className="flex-1 font-semibold text-lg tracking-tight text-white">
            VETRA
          </div>
          <ChevronDown className="h-4 w-4 text-sidebar-foreground opacity-50" />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-4">
        <div className="px-4 mb-2 text-xs font-mono tracking-wider text-sidebar-foreground opacity-50">
          CORE MODULES
        </div>
        <nav className="space-y-1 px-2">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
                }`}
              >
                <item.icon className={`h-4 w-4 ${isActive ? 'text-sidebar-primary' : 'opacity-70'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 mt-8 mb-2 text-xs font-mono tracking-wider text-sidebar-foreground opacity-50">
          MANAGEMENT
        </div>
        <nav className="space-y-1 px-2">
          {[
            { href: '/cost-control', icon: Building2, label: 'Cost Control' },
            { href: '/accounting', icon: Calculator, label: 'Accounting' },
            { href: '/crm', icon: UserCircle, label: 'CRM' },
            { href: '/reports', icon: BarChart3, label: 'Reports' },
            { href: '/ai-assistant', icon: Bot, label: 'AI Assistant' },
            { href: '/settings', icon: Settings, label: 'Settings' },
          ].map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                location === href
                  ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                  : 'hover:bg-sidebar-accent/50 text-sidebar-foreground'
              }`}
            >
              <Icon className="h-4 w-4 opacity-70" />
              {label}
            </Link>
          ))}
        </nav>
      </div>

      {/* User area */}
      <div className="p-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9 border border-sidebar-border">
            <AvatarFallback className="bg-sidebar-accent text-white text-xs font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-sm font-medium text-white truncate">{displayName}</span>
            <span className="text-xs opacity-60 truncate">
              {user?.emailAddresses?.[0]?.emailAddress ?? ''}
            </span>
          </div>
          <button
            onClick={() => signOut({ redirectUrl: basePath || '/' })}
            title="Sign out"
            className="p-1.5 rounded-md opacity-50 hover:opacity-100 hover:bg-sidebar-accent transition-all"
          >
            <LogOut className="h-4 w-4 text-sidebar-foreground" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Topbar() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLButtonElement>(null);
  const [results, setResults] = useState<any[]>([]);
  const { organization, project } = useOrganizationProject();

  const fetchNotifications = useCallback(async () => {
    try {
      const [list, count] = await Promise.all([
        get<any[]>('/notifications').catch(() => []),
        get<{ unread: number }>('/notifications/unread-count').catch(() => ({ unread: 0 })),
      ]);
      setNotifications(list ?? []);
      setUnreadCount(count?.unread ?? 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = window.setTimeout(() => get<any[]>('/search', { q: query }).then(setResults).catch(() => setResults([])), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const handleMarkRead = async (id: number) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH', credentials: 'include' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* ignore */ }
  };

  const formatTime = (iso: string) => formatRelativeJalali(iso);

  return (
    <header className="h-16 flex items-center justify-between px-6 border-b bg-card">
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="icon" className="md:hidden"><Menu className="h-5 w-5" /></Button>
        <div className="relative w-full max-w-md hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="جست‌وجوی پروژه، وظیفه و سند…" className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-sans" />
          {results.length > 0 && <div className="absolute z-20 top-11 left-0 right-0 rounded-md border bg-card shadow-lg p-2 space-y-1">{results.slice(0, 6).map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { setLocation(result.href); setQuery(''); }} className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"><span className="font-medium">{result.title}</span><span className="text-xs text-muted-foreground ml-2">{result.type}</span></button>)}</div>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Link href="/onboarding" className="hidden sm:flex max-w-[280px] items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-right text-xs hover:bg-muted" aria-label="تغییر سازمان و پروژه">
          <Building2 className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate">{organization?.name ?? 'سازمان انتخاب نشده'} / {project?.name ?? 'پروژه انتخاب نشده'}</span>
        </Link>
        <Button ref={bellRef} variant="ghost" size="icon" className="relative" onClick={() => setOpen(prev => !prev)}>
          <Bell className="h-5 w-5 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] rounded-full bg-accent text-[10px] font-bold text-accent-foreground px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
        {open && (
          <div
            ref={panelRef}
            className="absolute top-14 right-6 z-50 w-80 sm:w-96 rounded-lg border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">اعلان‌ها</h3>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setOpen(false)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">اعلانی وجود ندارد</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className={`flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/50 transition-colors ${!n.read ? 'bg-muted/30' : ''}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {!n.read && <span className="h-2 w-2 rounded-full bg-accent shrink-0" />}
                        <p className={`text-sm truncate ${!n.read ? 'font-semibold' : 'text-muted-foreground'}`}>{n.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">{formatTime(n.createdAt)}</span>
                        {n.type !== 'info' && (
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">{n.type}</Badge>
                        )}
                      </div>
                    </div>
                    {!n.read && (
                      <button
                        onClick={() => handleMarkRead(n.id)}
                        className="text-[10px] text-primary hover:underline shrink-0 mt-0.5"
                      >
                        خوانده شد
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
