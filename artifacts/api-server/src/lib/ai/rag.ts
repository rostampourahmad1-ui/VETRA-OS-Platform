import { eq, and, like, or, sql } from "drizzle-orm";
import { db, dailyReportsTable, documentsTable, projectsTable } from "@workspace/db";
import type { RagContext } from "./types";

/**
 * Basic RAG service for VETRA OS.
 *
 * Retrieves relevant project context from the database when a projectId is
 * provided. The context is appended to the system prompt to ground the AI
 * response in real project data.
 *
 * Future improvements:
 * - Embedding-based semantic search (pgvector or external)
 * - Configurable chunk size and overlap
 * - Caching of frequent queries
 * - Multi-source scoring and ranking
 */
export class RagService {
  /**
   * Build context snippets scoped to an organization and optional project.
   *
   * @param organizationId - Tenant-scoped organisation id.
   * @param projectId - Optional project to narrow context.
   * @param _query - User query for future semantic ranking.
   */
  async buildContext(
    organizationId: number,
    projectId?: number,
    _query?: string,
  ): Promise<RagContext> {
    const snippets: string[] = [];
    const sources: string[] = [];

    // 1. Project info (always included when projectId is given)
    if (projectId) {
      const [project] = await db
        .select()
        .from(projectsTable)
        .where(
          and(
            eq(projectsTable.id, projectId),
            eq(projectsTable.organizationId, organizationId),
          ),
        );

      if (project) {
        snippets.push(
          `Project: ${project.name}\nStatus: ${project.status}\nProgress: ${project.progress}%\nBudget: ${project.budget}\nSpent: ${project.spent}\nClient: ${project.client}\nLocation: ${project.location}\nPhase: ${project.phase ?? "N/A"}`,
        );
        sources.push("project");
      }
    }

    // 2. Recent daily reports (last 5, any project in the org)
    const reports = await db
      .select({
        date: dailyReportsTable.date,
        weather: dailyReportsTable.weather,
        progress: dailyReportsTable.progress,
        workersOnSite: dailyReportsTable.workersOnSite,
        issues: dailyReportsTable.issues,
        notes: dailyReportsTable.notes,
      })
      .from(dailyReportsTable)
      .where(
        projectId
          ? and(
              eq(dailyReportsTable.projectId, projectId),
              eq(dailyReportsTable.organizationId, organizationId),
            )
          : eq(dailyReportsTable.organizationId, organizationId),
      )
      .orderBy(sql`${dailyReportsTable.date} DESC`)
      .limit(5);

    if (reports.length > 0) {
      const reportText = reports
        .map(
          (r) =>
            `[${r.date}] Weather: ${r.weather}, Progress: ${r.progress}%, Workers: ${r.workersOnSite}${r.issues ? `, Issues: ${r.issues}` : ""}${r.notes ? `, Notes: ${r.notes}` : ""}`,
        )
        .join("\n");
      snippets.push(`Recent daily reports:\n${reportText}`);
      sources.push("daily_reports");
    }

    // 3. Recent documents (last 5, title + type)
    const docs = await db
      .select({
        name: documentsTable.name,
        type: documentsTable.type,
      })
      .from(documentsTable)
      .where(
        projectId
          ? and(
              eq(documentsTable.projectId, projectId),
              eq(documentsTable.organizationId, organizationId),
            )
          : eq(documentsTable.organizationId, organizationId),
      )
      .orderBy(sql`${documentsTable.createdAt} DESC`)
      .limit(5);

    if (docs.length > 0) {
      const docText = docs
        .map((d) => `- ${d.name} (${d.type})`)
        .join("\n");
      snippets.push(`Recent documents:\n${docText}`);
      sources.push("documents");
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
