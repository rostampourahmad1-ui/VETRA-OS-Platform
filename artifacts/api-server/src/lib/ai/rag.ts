import { and, eq, inArray } from "drizzle-orm";
import { db, projectsTable, tasksTable, projectMembersTable } from "@workspace/db";
import type { RagContext } from "./types";

/**
 * Basic permission-aware RAG service for VETRA OS.
 *
 * Retrieval is scoped by the authenticated user's access level:
 *   - Every snippet is limited to the caller's organization (tenant).
 *   - Projects are limited to projects the user is a member of, unless the
 *     caller is explicitly authorized for the whole organization
 *     (`includeAllProjects`).
 *   - A client-supplied `projectId` is only honored when it is within the
 *     user's accessible scope; otherwise no context is returned.
 *
 * Authorization decisions (e.g. whether the user may read the whole
 * organization) are made at the route boundary; this service only narrows the
 * data it will surface.
 */
export interface RagScopeOptions {
  /** When true, the whole organization's projects are considered accessible. */
  includeAllProjects?: boolean;
}

export class RagService {
  /**
   * Build context snippets scoped to an organization, the user's access level,
   * and an optional project.
   *
   * @param organizationId - Tenant-scoped organisation id.
   * @param userId - Authenticated VETRA user id used for membership scoping.
   * @param projectId - Optional project to narrow context.
   * @param _query - User query for future semantic ranking.
   * @param options - Access-level flags resolved by the caller.
   */
  async buildContext(
    organizationId: number,
    userId: number,
    projectId?: number,
    _query?: string,
    options: RagScopeOptions = {},
  ): Promise<RagContext> {
    const snippets: string[] = [];
    const sources: string[] = [];

    // 1. Resolve the projects this user is allowed to see.
    let accessibleProjectIds: number[];
    if (options.includeAllProjects) {
      const orgProjects = await db
        .select({ id: projectsTable.id })
        .from(projectsTable)
        .where(eq(projectsTable.organizationId, organizationId));
      accessibleProjectIds = orgProjects.map((row) => row.id);
    } else {
      const memberships = await db
        .select({ projectId: projectMembersTable.projectId })
        .from(projectMembersTable)
        .where(
          and(
            eq(projectMembersTable.organizationId, organizationId),
            eq(projectMembersTable.userId, userId),
          ),
        );
      accessibleProjectIds = memberships.map((row) => row.projectId);
    }

    const targetIds = projectId
      ? accessibleProjectIds.filter((id) => id === projectId)
      : accessibleProjectIds.slice(0, 5);

    if (targetIds.length === 0) {
      return { snippets, sources };
    }

    // 2. Project info for the accessible projects only.
    const projects = await db
      .select()
      .from(projectsTable)
      .where(
        and(
          eq(projectsTable.organizationId, organizationId),
          inArray(projectsTable.id, targetIds),
        ),
      );

    if (projects.length > 0) {
      const projectText = projects
        .map(
          (p) =>
            `Project: ${p.name}\nStatus: ${p.status}\nProgress: ${p.progress}%\nClient: ${p.client}\nLocation: ${p.location}\nPhase: ${p.phase ?? "N/A"}`,
        )
        .join("\n\n");
      snippets.push(projectText);
      sources.push("project");
    }

    // 3. Open task summary for the accessible projects only.
    const tasks = await db
      .select()
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.organizationId, organizationId),
          inArray(tasksTable.projectId, targetIds),
        ),
      );

    if (tasks.length > 0) {
      const openTasks = tasks.filter((t) => t.status !== "done");
      const taskText = openTasks
        .slice(0, 10)
        .map((t) => `- [${t.status}] ${t.title}${t.dueDate ? ` (due ${t.dueDate})` : ""}`)
        .join("\n");
      if (taskText) {
        snippets.push(`Open tasks:\n${taskText}`);
        sources.push("tasks");
      }
    }

    return { snippets, sources };
  }

  /**
   * Format RAG context into a system prompt suffix.
   */
  formatContextPrompt(context: RagContext): string {
    if (context.snippets.length === 0) return "";
    return `\n\n--- Context from project data ---\n${context.snippets.join("\n\n")}\n--- End of context ---`;
  }
}
