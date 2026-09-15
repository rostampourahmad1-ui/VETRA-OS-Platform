import React, { useState } from 'react';
import { useListProjects } from '@workspace/api-client-react';
import { Link, useLocation } from 'wouter';
import { t } from '@/lib/i18n';
import { Plus, Search, Filter, MoreHorizontal, Building2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatJalali } from '@/lib/jalali';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatCurrency } from '@/lib/jalali';

export default function ProjectList() {
  const [search, setSearch] = useState('');
  const [_, setLocation] = useLocation();
  const { data: projects, isLoading } = useListProjects({ search });

  const statusLabel = (status: string) =>
    status === 'active' ? t('projects.status.active')
    : status === 'completed' ? t('projects.status.completed')
    : status === 'on_hold' ? t('projects.status.onHold')
    : status === 'cancelled' ? t('projects.status.cancelled')
    : status;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t('projects.title')}</h1>
          <p className="text-muted-foreground">{t('projects.subtitle')}</p>
        </div>
        <Button className="shrink-0 gap-2">
          <Plus className="h-4 w-4" /> {t('projects.new')}
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-card p-4 rounded-lg border border-border shadow-sm">
        <div className="relative w-full sm:w-96">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('projects.search')}
            className="ps-9 font-sans"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="gap-2">
            <Filter className="h-4 w-4" /> {t('projects.filter')}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 text-center text-muted-foreground">{t('projects.loading')}</div>
      ) : projects?.length === 0 ? (
        <div className="py-20 text-center border border-dashed rounded-lg bg-card">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium">{t('projects.empty')}</h3>
          <p className="text-sm text-muted-foreground mt-1">{t('projects.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects?.map((project) => (
            <Card key={project.id} className="group hover:border-primary/50 transition-colors cursor-pointer" onClick={() => setLocation(`/projects/${project.id}`)}>
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col gap-1">
                    <Badge variant={project.status === 'active' ? 'default' : 'secondary'} className="w-fit font-sans text-[10px]">
                      {statusLabel(project.status)}
                    </Badge>
                    <Link href={`/projects/${project.id}`} className="font-semibold text-lg hover:underline decoration-primary underline-offset-4">
                      {project.name}
                    </Link>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {project.location}
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuLabel>{t('common.actions')}</DropdownMenuLabel>
                      <DropdownMenuItem>{t('projects.editDetails')}</DropdownMenuItem>
                      <DropdownMenuItem>{t('projects.updateStatus')}</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive">{t('projects.archive')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="text-muted-foreground font-medium">{t('projects.progress')}</span>
                      <span className="font-sans text-xs font-bold">{project.progress}%</span>
                    </div>
                    <Progress value={project.progress} className="h-2" />
                  </div>

                  <div className="grid grid-cols-2 gap-4 py-3 border-y border-border/50">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-sans tracking-wider text-muted-foreground">{t('projects.budget')}</span>
                      <span className="font-sans text-sm font-semibold">{formatCurrency(project.budget)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-sans tracking-wider text-muted-foreground">{t('projects.spent')}</span>
                      <span className="font-sans text-sm font-semibold text-destructive">{formatCurrency(project.spent)}</span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{project.client}</span>
                      <span>{t('projects.client')}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{formatJalali(project.endDate)}</span>
                      <span>{t('projects.deadline')}</span>
                    </div>
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
