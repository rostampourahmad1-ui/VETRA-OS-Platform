import React from "react";
import { useGetProject, useGetProjectStats } from "@workspace/api-client-react";
import { useParams, Link } from "wouter";
import { t } from "@/lib/i18n";
import {
  Building2,
  MapPin,
  Calendar,
  Users,
  ArrowLeft,
  CheckSquare,
  Settings,
  ChevronLeft,
  CalendarRange,
  FolderTree,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatJalali, persianNumber } from "@/lib/jalali";

export default function ProjectDetail() {
  const params = useParams();
  const id = parseInt(params.id || "0", 10);

  const { data: project, isLoading: isProjectLoading } = useGetProject(id, {
    query: { enabled: !!id, queryKey: ["/api/projects", id] },
  });
  const { data: stats, isLoading: isStatsLoading } = useGetProjectStats(id, {
    query: { enabled: !!id, queryKey: ["/api/projects", id, "stats"] },
  });

  const statusLabel = (status: string) =>
    status === "active"
      ? t("projects.status.active")
      : status === "completed"
        ? t("projects.status.completed")
        : status === "on_hold"
          ? t("projects.status.onHold")
          : status === "cancelled"
            ? t("projects.status.cancelled")
            : status;

  if (isProjectLoading)
    return <div className="p-20 text-center">{t("projects.loading")}</div>;
  if (!project)
    return (
      <div className="p-20 text-center text-destructive">
        {t("projects.notFound")}
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link
          href="/projects"
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="h-4 w-4" /> {t("projects.backToList")}
        </Link>
        <ChevronLeft className="h-4 w-4" />
        <span className="font-medium text-foreground">{project.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-lg border shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">
              {project.name}
            </h1>
            <Badge
              variant={project.status === "active" ? "default" : "secondary"}
              className="font-sans h-6"
            >
              {statusLabel(project.status)}
            </Badge>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            {project.description}
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-2 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {project.location}
            </div>
            <div className="flex items-center gap-1.5">
              <Building2 className="h-4 w-4" /> {t("projects.clientLabel")}:{" "}
              <span className="font-medium text-foreground">
                {project.client}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> {t("projects.managerLabel")}:{" "}
              <span className="font-medium text-foreground">
                {project.managerName}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 min-w-[200px]">
          <div className="flex justify-between items-end">
            <span className="text-sm font-medium">
              {t("projects.overallProgress")}
            </span>
            <span className="font-sans text-xl font-bold">
              {project.progress}%
            </span>
          </div>
          <Progress value={project.progress} className="h-2" />
        </div>
      </div>

      {/* Quick links */}
      <div className="flex justify-end gap-2">
        <Link href={`/projects/${id}/wbs`}>
          <Button variant="outline" className="gap-2">
            <FolderTree className="h-4 w-4" /> {t("projects.wbs")}
          </Button>
        </Link>
        <Link href={`/projects/${id}/timeline`}>
          <Button variant="outline" className="gap-2">
            <CalendarRange className="h-4 w-4" /> {t("projects.timelineBtn")}
          </Button>
        </Link>
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start border-b rounded-none h-auto p-0 bg-transparent overflow-x-auto flex-nowrap">
          <TabsTrigger
            value="overview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
          >
            {t("projects.tab.overview")}
          </TabsTrigger>
          <TabsTrigger
            value="tasks"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
          >
            {t("projects.tab.tasks")}
          </TabsTrigger>
          <TabsTrigger
            value="team"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent px-4 py-3"
          >
            {t("projects.tab.team")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center text-primary">
                  <CheckSquare className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {t("projects.tab.tasks")}
                  </div>
                  <div className="text-2xl font-bold font-sans">
                    {stats?.openTasks}{" "}
                    <span className="text-sm font-sans font-normal text-muted-foreground">
                      {t("projects.open")}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-sm">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="h-10 w-10 rounded bg-emerald-500/10 flex items-center justify-center text-emerald-600">
                  <Calendar className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {t("projects.timelineBtn")}
                  </div>
                  <div className="text-2xl font-bold font-sans">
                    {persianNumber(
                      Math.max(
                        0,
                        Math.ceil(
                          (new Date(project.endDate).getTime() -
                            new Date().getTime()) /
                            (1000 * 60 * 60 * 24),
                        ),
                      ),
                    )}{" "}
                    <span className="text-sm font-sans font-normal text-muted-foreground">
                      {t("projects.daysLeft")}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>{t("projects.details")}</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-4 text-sm">
                  <div className="grid grid-cols-3 gap-4 border-b pb-3">
                    <dt className="text-muted-foreground font-medium">
                      {t("projects.phase")}
                    </dt>
                    <dd className="col-span-2 font-medium">
                      {project.phase || t("projects.notSpecified")}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 border-b pb-3">
                    <dt className="text-muted-foreground font-medium">
                      {t("projects.priority")}
                    </dt>
                    <dd className="col-span-2 font-medium">
                      {project.priority === "low"
                        ? t("projects.priority.low")
                        : project.priority === "high"
                          ? t("projects.priority.high")
                          : project.priority === "critical"
                            ? t("projects.priority.critical")
                            : t("projects.priority.medium")}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 border-b pb-3">
                    <dt className="text-muted-foreground font-medium">
                      {t("projects.startDate")}
                    </dt>
                    <dd className="col-span-2 font-sans">
                      {formatJalali(project.startDate)}
                    </dd>
                  </div>
                  <div className="grid grid-cols-3 gap-4 border-b pb-3">
                    <dt className="text-muted-foreground font-medium">
                      {t("projects.endDate")}
                    </dt>
                    <dd className="col-span-2 font-sans">
                      {formatJalali(project.endDate)}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="pt-6">
          <div className="flex items-center justify-center h-[300px] border border-dashed rounded-lg bg-card text-muted-foreground">
            {t("projects.placeholderTasks")}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
