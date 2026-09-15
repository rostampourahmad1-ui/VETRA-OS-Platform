  // ─── State Machine Validation ─────────────────────────────────────────

  function validateStateTransition(currentStatus: DailyReportStatus, nextStatus: DailyReportStatus, actorRole: string, reportData?: any): string | null {
    // VETRA-SEC-02: Never trust client-supplied actor or status.
    // The authenticated req.vetraUser.id is the authoritative actor.
    const actorId = req.vetraUser!.id;
    const reason = nextStatus !== currentStatus ? (req.body as any).reason || null : null;

    // Rule: Creator cannot approve/execute own report
    if (reportData?.createdBy === actorId && (nextStatus === "approved" || nextStatus === "rejected" || nextStatus === "in_review")) {
      return "Creators cannot move their own report to ${nextStatus}";
    }

    // Rule: A role may only move to statuses they are authorized for
    // Permissions mapping: MANAGER can approve, ENGINEER can submit, ADMIN can reject, etc.
    if (!canRolePerformAction(actorRole, nextStatus)) {
      return "Insufficient permission to transition to '${nextStatus}'";
function validateStateTransition(currentStatus: DailyReportStatus, nextStatus: DailyReportStatus, actorRole: string, reportData?: any): string | null {
  // VETRA-SEC-02: Never trust client-supplied actor or status.
  // The authenticated req.vetraUser.id is the authoritative actor.
  const actorId = req.vetraUser!.id;
  const reason = nextStatus !== currentStatus ? (req.body as any).reason || null : null;

  // Rule: Creator cannot approve/execute own report
  if (reportData?.createdBy === actorId && (nextStatus === "approved" || nextStatus === "rejected" || nextStatus === "in_review")) {
    return `Creators cannot move their own report to ${nextStatus}`;
  }

  // Rule: A role may only move to statuses they are authorized for
  // Permissions mapping: MANAGER can approve, ENGINEER can submit, ADMIN can reject, etc.
  if (!canRolePerformAction(actorRole, nextStatus)) {
    return `Insufficient permission to transition to '${nextStatus}'`;
  }

    // Rule: Final statuses must have justification
    if (["approved", "rejected"].includes(nextStatus) && !reason) {
      return "Final statuses require a justification reason";
  }

  // Rule: Transitions must follow the defined state machine
  if (!allowedTransition(currentStatus, nextStatus)) {
    return `Invalid state transition from '${currentStatus}' to '${nextStatus}'`;
  }

  // Rule: Only allow status changes, never trust arbitrary new status from client
  if (req.body && (req.body as any).status && (req.body as any).status !== nextStatus) {
    return "Status must be derived from allowed transitions, not client-supplied";
  }

  return null;
}

function allowedTransition(currentStatus: DailyReportStatus, nextStatus: DailyReportStatus): boolean {
  // VETRA-ERP-02: State transitions for daily reports
  const transitions: Record<DailyReportStatus, DailyReportStatus[]> = {
    draft: ["submitted", "revision_requested"],
    submitted: ["in_review"],
    in_review: ["approved", "rejected", "revision_requested"],
    approved: [],
    rejected: ["revision_requested"],
    revision_requested: ["draft"],
  };

  const allowed = transitions[currentStatus] || [];
  return allowed.includes(nextStatus);
}

function canRolePerformAction(role: string, status: DailyReportStatus): boolean {
  // VETRA-ERP-01: Role-based access control for daily reports
  const rolePermissions: Record<string, string[]> = {
    ADMIN: ["draft", "submitted", "in_review", "approved", "rejected", "revision_requested"],
    MANAGER: ["in_review", "approved", "rejected", "revision_requested"],
    ENGINEER: ["draft", "submitted", "revision_requested"],
    SUPERVISOR: ["in_review", "approved", "rejected", "revision_requested"],
    EMPLOYEE: ["draft", "submitted", "revision_requested"],
    VIEWER: ["draft", "submitted", "in_review"],
  };

  const permittedStatuses = rolePermissions[role] || [];
  return permittedStatuses.includes(status);
}
    }

    // Rule: Transitions must follow the defined state machine
    if (!allowedTransition(currentStatus, nextStatus)) {
      return "Invalid state transition from '${currentStatus}' to '${nextStatus}'";
    }

    // Rule: Only allow status changes, never trust arbitrary new status from client
    if (req.body && (req.body as any).status && (req.body as any).status !== nextStatus) {
      return "Status must be derived from allowed transitions, not client-supplied";
    }

    return null;
  }

  function canRolePerformAction(role: string, status: DailyReportStatus): boolean {
    // VETRA-ERP-01: Role-based access control for daily reports
    const rolePermissions: Record<string, string[]> = {
      ADMIN: ["draft", "submitted", "in_review", "approved", "rejected", "revision_requested"],
      MANAGER: ["in_review", "approved", "rejected", "revision_requested"],
      ENGINEER: ["draft", "submitted", "revision_requested"],
      SUPERVISOR: ["in_review", "approved", "rejected", "revision_requested"],
      EMPLOYEE: ["draft", "submitted", "revision_requested"],
      VIEWER: ["draft", "submitted", "in_review"],
    };

    const permittedStatuses = rolePermissions[role] || [];
    return permittedStatuses.includes(status);
  }

  // ─── Enhanced Daily Report Transition Handler ─────────────────────────

  router.post("/daily-reports/:id/decision", requirePermission("daily-reports.submit"), async (req, res): Promise<void> {
    const id = idFrom(req.params.id);
    const parsed = z.object({
      status: z.enum(dailyReportStatuses),
      workflowId: z.coerce.number().int().positive().optional(),
      reason: z.string().trim().min(1).max(2000).optional(),
    }).safeParse(req.body);

    if (!id || !parsed.success) {
      res.status(400).json({ error: "Invalid decision request" });
      return;
    }

    const organizationId = tenantId(req);
    const nextStatus = parsed.data.status as DailyReportStatus;

    // Get current report with audit
    const [report] = await db.select().from(dailyReportsTable).where(and(
      eq(dailyReportsTable.id, id),
      eq(dailyReportsTable.organizationId, organizationId),
    ));

    if (!report) {
      res.status(404).json({ error: "Daily report not found" });
      return;
    }

    // Determine actor role from authenticated user
    const actorId = req.vetraUser!.id;
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, actorId));
    const actorRole = user?.role || "EMPLOYEE";

    // Validate transition using secure state machine
    const transitionError = validateStateTransition(report.status as DailyReportStatus, nextStatus, actorRole, report);
    if (transitionError) {
      res.status(409).json({ error: transitionError });
      return;
    }

    // If workflow is provided, validate it exists and is active
    let workflowRun: any = null;
    if (parsed.data.workflowId) {
      [workflowRun] = await db.select().from(workflowRunsTable).where(and(
        eq(workflowRunsTable.id, parsed.data.workflowId),
        eq(workflowRunsTable.organizationId, organizationId),
        eq(workflowRunsTable.status, "pending"),
      ));

      if (!workflowRun) {
        res.status(404).json({ error: "Workflow run not found" });
        return;
      }

      // Check if the workflow is for this daily report
      if (workflowRun.entityType !== "daily_report" || workflowRun.entityId !== id) {
        res.status(409).json({ error: "Workflow run does not match this daily report" });
        return;
      }
    }

    // Update report status
    const now = new Date();
    const updates: Record<string, unknown> = {
      status: nextStatus,
      updatedBy: actorId,
      updatedAt: now,
    };

    // If transitioning to submitted, set workflow run ID
    if (nextStatus === "submitted" && parsed.data.workflowId) {
      updates.workflowRunId = parsed.data.workflowId;
      updates.submittedBy = actorId;
      updates.submittedAt = now;
    }

    const [updatedReport] = await db.update(dailyReportsTable).set(updates).where(and(
      eq(dailyReportsTable.id, id),
      eq(dailyReportsTable.organizationId, organizationId),
      eq(dailyReportsTable.status, report.status),
    )).returning();

    if (!updatedReport) {
      res.status(409).json({ error: "Report changed concurrently; retry" });
      return;
    }

    // Create workflow event
    if (parsed.data.workflowId) {
      await db.insert(workflowRunEventsTable).values({
        organizationId,
        workflowRunId: parsed.data.workflowId,
        workflowStepId: null, // Could be derived based on current step
        action: "decision",
        actorId,
        metadata: { status: nextStatus, reason: parsed.data.reason },
        createdAt: now,
      });

      // Update workflow run status if needed
      if (nextStatus === "approved") {
        await db.update(workflowRunsTable).set({
          status: "completed",
          completedAt: now,
          updatedBy: actorId,
          updatedAt: now,
        }).where(eq(workflowRunsTable.id, parsed.data.workflowId));
      } else if (nextStatus === "rejected") {
        await db.update(workflowRunsTable).set({
          status: "rejected",
          completedAt: now,
          updatedBy: actorId,
          updatedAt: now,
        }).where(eq(workflowRunsTable.id, parsed.data.workflowId));
      }
    }

    // Create audit trail
    audit(req, "dailyreport.decision", "daily_report", {
      resourceId: id,
      oldValues: { status: report.status, workflowRunId: report.workflowRunId },
      newValues: { status: nextStatus, workflowRunId: updatedReport.workflowRunId },
      metadata: { actorRole, reason: parsed.data.reason },
    });

    // Send notifications if needed
    if (nextStatus === "approved" || nextStatus === "rejected") {
      await notifyWorkflowDecision({
        reportId: id,
        status: nextStatus,
        actorId,
        reason: parsed.data.reason,
        organizationId,
      });
    }

    res.json({
      ...updatedReport,
      temperature: updatedReport.temperature ? parseFloat(updatedReport.temperature as string) : null,
      progress: parseFloat(updatedReport.progress as string),
      status: updatedReport.status,
    });
  });

  // ─── Additional Workflow Endpoints ────────────────────────────────────

  // Get current workflow status
  router.get("/daily-reports/:id/workflow-status", requirePermission("daily-reports.read"), async (req, res): Promise<void> => {
    const id = idFrom(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid daily report id" });
      return;
    }
    const organizationId = tenantId(req);

    const [report] = await db.select().from(dailyReportsTable).where(and(
      eq(dailyReportsTable.id, id),
      eq(dailyReportsTable.organizationId, organizationId),
    ));

    if (!report) {
      res.status(404).json({ error: "Daily report not found" });
      return;
    }

    let workflowStatus: any = null;
    if (report.workflowRunId) {
      [workflowStatus] = await db.select().from(workflowRunsTable).where(eq(workflowRunsTable.id, report.workflowRunId));
    }

    // Get current workflow events
    const events = await db.select().from(workflowRunEventsTable).where(and(
      eq(workflowRunEventsTable.entityId, id),
      eq(workflowRunEventsTable.organizationId, organizationId),
    )).orderBy(asc(workflowRunEventsTable.createdAt));

    res.json({
      reportStatus: report.status,
      workflowStatus,
      events,
    });
  });

  // ─── Batch Daily Report Operations ─────────────────────────────────────

  // Submit multiple daily reports at once (admin/manager function)
  router.post("/daily-reports/batch/submit", requirePermission("daily-reports.submit"), async (req, res): Promise<void> {
    const { reportIds, workflowId } = req.body as { reportIds: number[]; workflowId: number };

    if (!Array.isArray(reportIds) || reportIds.length === 0) {
      res.status(400).json({ error: "Report IDs array required" });
      return;
    }

    const organizationId = tenantId(req);
    const actorId = req.vetraUser!.id;

    // Verify all reports exist and are in correct state
    const reports = await db.select().from(dailyReportsTable).where(and(
      eq(dailyReportsTable.organizationId, organizationId),
      sql`${dailyReportsTable.id} = ANY(${reportIds})`,
    ));

    if (reports.length !== reportIds.length) {
      res.status(404).json({ error: "Some daily reports not found" });
      return;
    }

    // Validate all reports are in 'draft' status
    const notDraft = reports.filter(r => r.status !== "draft");
    if (notDraft.length > 0) {
      res.status(409).json({
        error: `Reports not in draft status: ${notDraft.map(r => r.id).join(", ")}`
      });
      return;
    }

    // Update all reports to 'submitted' status
    const now = new Date();
    const updatedReports = await db.update(dailyReportsTable).set({
      status: "submitted",
      workflowRunId: workflowId,
      submittedBy: actorId,
      submittedAt: now,
      updatedBy: actorId,
      updatedAt: now,
    }).where(and(
      eq(dailyReportsTable.organizationId, organizationId),
      sql`${dailyReportsTable.id} = ANY(${reportIds})`,
    )).returning();

    // Create workflow events for each report
    for (const report of reports) {
      await db.insert(workflowRunEventsTable).values({
        organizationId,
        workflowRunId: workflowId,
        workflowStepId: null,
        action: "submitted",
        actorId,
        entityType: "daily_report",
        entityId: report.id,
        metadata: { source: "batch_submit" },
        createdAt: now,
      });

      audit(req, "dailyreport.batch_submitted", "daily_report", {
        resourceId: report.id,
        oldValues: { status: "draft" },
        newValues: { status: "submitted", workflowRunId: workflowId },
        metadata: { batchOperation: true },
      });
    }

    res.json({
      message: `Submitted ${updatedReports.length} daily reports`,
      updatedCount: updatedReports.length,
    });
  });

  // ─── Daily Report Attachment Routes ────────────────────────────────────

  // Upload attachment for a daily report
  router.post("/daily-reports/:id/attachments", 
    requirePermission("daily-reports.attachment.upload"),
    attachmentUpload.single("file"),
    async (req, res): Promise<void> {
      const id = idFrom(req.params.id);
      if (!id) {
        res.status(400).json({ error: "Invalid daily report id" });
        return;
      }
      const organizationId = tenantId(req);

      // Verify daily report exists and user has access
      const [report] = await db.select().from(dailyReportsTable).where(and(
        eq(dailyReportsTable.id, id),
        eq(dailyReportsTable.organizationId, organizationId),
      ));

      if (!report) {
        res.status(404).json({ error: "Daily report not found" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const filename = generateStorageFilename(req.file.originalname);
      const safePath = resolveSafeStoragePath(filename);

      await fs.writeFile(safePath, req.file.buffer);

      const [attachment] = await db.insert(dailyReportAttachmentsTable).values({
        dailyReportId: id,
        filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        uploadedBy: req.vetraUser!.id,
        organizationId,
      }).returning();

      audit(req, "dailyreport.attachment.uploaded", "daily_report_attachment", {
        resourceId: attachment.id,
        newValues: { filename, originalName: attachment.originalName, size: attachment.size },
      });

      res.status(201).json({
        id: attachment.id,
        filename: attachment.filename,
        originalName: attachment.originalName,
        mimeType: attachment.mimeType,
        size: attachment.size,
        uploadedBy: attachment.uploadedBy,
        uploadedAt: attachment.createdAt.toISOString(),
      });
    }
  );

  // Get attachments for a daily report
  router.get("/daily-reports/:id/attachments", requirePermission("daily-reports.attachment.read"), async (req, res): Promise<void> {
    const id = idFrom(req.params.id);
    if (!id) {
      res.status(400).json({ error: "Invalid daily report id" });
      return;
    }
    const organizationId = tenantId(req);

    // Verify daily report exists and user has access
    const [report] = await db.select().from(dailyReportsTable).where(and(
      eq(dailyReportsTable.id, id),
      eq(dailyReportsTable.organizationId, organizationId),
    ));

    if (!report) {
      res.status(404).json({ error: "Daily report not found" });
      return;
    }

    const attachments = await db.select().from(dailyReportAttachmentsTable).where(and(
      eq(dailyReportAttachmentsTable.dailyReportId, id),
      eq(dailyReportAttachmentsTable.organizationId, organizationId),
    )).orderBy(asc(dailyReportAttachmentsTable.createdAt));

    res.json(attachments.map(a => ({
      id: a.id,
      filename: a.filename,
      originalName: a.originalName,
      mimeType: a.mimeType,
      size: a.size,
      uploadedBy: a.uploadedBy,
      uploaded

