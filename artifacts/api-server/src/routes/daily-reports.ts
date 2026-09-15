// ─── State Machine Validation ─────────────────────────────────────────

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

