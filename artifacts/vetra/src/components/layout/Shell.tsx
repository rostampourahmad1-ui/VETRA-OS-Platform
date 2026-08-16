import React from 'react';
import { Link, useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import { get } from '@/lib/phase2-api';
import {
  Building2, LayoutDashboard, FolderKanban, ListTodo, FileText,
  Briefcase, Activity, Users, Package, Truck, ClipboardList,
  Settings, ChevronDown, Bell, Search, Menu,
  Calendar, Wrench, BarChart3, Bot, Calculator, ClipboardCheck,
  UserCircle, LogOut,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useUser, useClerk } from '@clerk/react';

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
  const [results, setResults] = useState<any[]>([]);
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const timer = window.setTimeout(() => get<any[]>('/search', { q: query }).then(setResults).catch(() => setResults([])), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  return (
    <header className="h-16 flex items-center justify-between px-6 border-b bg-card">
      <div className="flex items-center gap-4 flex-1">
        <Button variant="ghost" size="icon" className="md:hidden"><Menu className="h-5 w-5" /></Button>
        <div className="relative w-full max-w-md hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, tasks, documents..." className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary font-sans" />
          {results.length > 0 && <div className="absolute z-20 top-11 left-0 right-0 rounded-md border bg-card shadow-lg p-2 space-y-1">{results.slice(0, 6).map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { setLocation(result.href); setQuery(''); }} className="w-full text-left px-3 py-2 rounded hover:bg-muted text-sm"><span className="font-medium">{result.title}</span><span className="text-xs text-muted-foreground ml-2">{result.type}</span></button>)}</div>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-accent" />
        </Button>
      </div>
    </header>
  );
}
