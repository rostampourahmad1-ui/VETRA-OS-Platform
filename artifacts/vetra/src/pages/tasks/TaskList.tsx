import React, { useState } from 'react';
import { useListTasks, useGetTasksSummary } from '@workspace/api-client-react';
import { Link } from 'wouter';
import { Plus, Search, Filter, CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatJalali } from '@/lib/jalali';

export default function TaskList() {
  const [search, setSearch] = useState('');
  const { data: tasks, isLoading } = useListTasks();
  const { data: summary } = useGetTasksSummary();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'todo': return <Circle className="h-4 w-4 text-muted-foreground" />;
      case 'in-progress': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'review': return <AlertCircle className="h-4 w-4 text-amber-500" />;
      case 'done': return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      default: return <Circle className="h-4 w-4" />;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'low': return 'bg-muted text-muted-foreground';
      case 'medium': return 'bg-blue-500/10 text-blue-600';
      case 'high': return 'bg-amber-500/10 text-amber-600';
      case 'critical': return 'bg-destructive/10 text-destructive';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">Track and manage action items across all projects.</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> New Task
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center">
            <span className="text-2xl font-bold font-mono">{summary.total}</span>
            <span className="text-xs text-muted-foreground mt-1">Total Tasks</span>
          </div>
          <div className="bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center">
            <span className="text-2xl font-bold font-mono text-muted-foreground">{summary.todo}</span>
            <span className="text-xs text-muted-foreground mt-1">To Do</span>
          </div>
          <div className="bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center">
            <span className="text-2xl font-bold font-mono text-blue-500">{summary.inProgress}</span>
            <span className="text-xs text-muted-foreground mt-1">In Progress</span>
          </div>
          <div className="bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center">
            <span className="text-2xl font-bold font-mono text-emerald-500">{summary.done}</span>
            <span className="text-xs text-muted-foreground mt-1">Done</span>
          </div>
          <div className="bg-card border rounded-lg p-4 shadow-sm flex flex-col items-center justify-center border-destructive/20 bg-destructive/5">
            <span className="text-2xl font-bold font-mono text-destructive">{summary.overdue}</span>
            <span className="text-xs text-destructive mt-1 font-medium">Overdue</span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search tasks..." 
            className="pl-9 font-sans"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" /> Filter
          </Button>
        </div>
      </div>

      <div className="bg-card border rounded-lg shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="py-20 text-center font-mono text-muted-foreground">LOADING TASKS...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                  <th className="py-3 px-4 font-medium w-8"></th>
                  <th className="py-3 px-4 font-medium">Task</th>
                  <th className="py-3 px-4 font-medium">Project</th>
                  <th className="py-3 px-4 font-medium">Priority</th>
                  <th className="py-3 px-4 font-medium">Assignee</th>
                  <th className="py-3 px-4 font-medium text-right">Due Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tasks?.map((task) => (
                  <tr key={task.id} className="group hover:bg-muted/50 transition-colors">
                    <td className="py-3 px-4">
                      {getStatusIcon(task.status)}
                    </td>
                    <td className="py-3 px-4 font-medium">
                      <div className="flex flex-col">
                        <span>{task.title}</span>
                        {task.description && <span className="text-xs text-muted-foreground line-clamp-1">{task.description}</span>}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <Link href={`/projects/${task.projectId}`} className="text-primary hover:underline text-xs">
                        {task.projectName}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <Badge variant="outline" className={`border-0 uppercase font-mono text-[10px] ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-muted-foreground text-xs">
                      {task.assigneeName || 'Unassigned'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs">
                      {task.dueDate ? formatJalali(task.dueDate) : '-'}
                    </td>
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