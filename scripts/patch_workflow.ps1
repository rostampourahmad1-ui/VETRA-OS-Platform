$content = Get-Content "C:\Users\VETRA_AI\Documents\VETRA-OS-Platform\artifacts\api-server\src\routes\workflows.ts" -Raw

# Replace the decision logic section
$old = @'
  const steps = await db.select().from(workflowStepsTable).where(eq(workflowStepsTable.workflowId, run.workflowId)).orderBy(asc(workflowStepsTable.stepOrder));
  const isFinalApproval = decision === "approve" && run.currentStep >= steps.length;
  const nextStep = decision === "approve" && !isFinalApproval ? run.currentStep + 1 : run.currentStep;
  const nextStatus = decision === "approve" ? (isFinalApproval ? "approved" : "pending") : decision === "reject" ? "rejected" : "revision_requested";
  const [updated] = await db.update(workflowRunsTable).set({
    currentStep: nextStep,
    status: nextStatus,
    updatedBy: req.vetraUser!.id,
    updatedAt: new Date(),
    completedAt: isFinalApproval || decision === "reject" ? new Date() : null,
  }).where(and(
    eq(workflowRunsTable.id, run.id),
    eq(workflowRunsTable.organizationId, tenantId(req)),
    eq(workflowRunsTable.currentStep, run.currentStep),
    eq(workflowRunsTable.status, "pending"),
  )).returning();
  if (!updated) { res.status(409).json({ error: "Workflow run changed concurrently; retry the decision" }); return; }

  await db.insert(workflowRunEventsTable).values({
    organizationId: tenantId(req),
    workflowRunId: run.id,
    workflowStepId: step.id,
    action: decision,
    comment: comment ?? null,
    actorId: req.vetraUser!.id,
  });
'@

$new = @'
  // Approval gate: check if enough approvals have been collected
  let shouldAdvance = true;
  if (decision === "approve" && step.approvalType === "any" && step.requiredApprovals && step.requiredApprovals > 1) {
    const approveEvents = await db.select().from(workflowRunEventsTable).where(and(
      eq(workflowRunEventsTable.workflowRunId, run.id),
      eq(workflowRunEventsTable.workflowStepId, step.id),
      eq(workflowRunEventsTable.action, "approve"),
    ));
    shouldAdvance = approveEvents.length >= step.requiredApprovals;
  }

  const isFinalApproval = decision === "approve" && shouldAdvance && run.currentStep >= steps.length;

  let nextStepVal;
  let nextStatusVal;
  let completedAtVal;

  if (decision === "approve" && shouldAdvance) {
    nextStepVal = isFinalApproval ? run.currentStep : run.currentStep + 1;
    nextStatusVal = isFinalApproval ? "approved" : "pending";
    completedAtVal = isFinalApproval ? new Date() : null;
  } else if (decision === "reject") {
    nextStepVal = run.currentStep;
    nextStatusVal = "rejected";
    completedAtVal = new Date();
  } else if (decision === "request_revision") {
    nextStepVal = run.currentStep;
    nextStatusVal = "revision_requested";
    completedAtVal = new Date();
  } else {
    // Approval gate: not enough approvals yet, stay on same step
    nextStepVal = run.currentStep;
    nextStatusVal = "pending";
    completedAtVal = null;
  }

  const [updated] = await db.update(workflowRunsTable).set({
    currentStep: nextStepVal,
    status: nextStatusVal,
    updatedBy: req.vetraUser!.id,
    updatedAt: new Date(),
    completedAt: completedAtVal,
  }).where(and(
    eq(workflowRunsTable.id, run.id),
    eq(workflowRunsTable.organizationId, tenantId(req)),
    eq(workflowRunsTable.currentStep, run.currentStep),
    eq(workflowRunsTable.status, "pending"),
  )).returning();
  if (!updated) { res.status(409).json({ error: "Workflow run changed concurrently; retry the decision" }); return; }

  await db.insert(workflowRunEventsTable).values({
    organizationId: tenantId(req),
    workflowRunId: run.id,
    workflowStepId: step.id,
    action: decision,
    comment: comment ?? null,
    actorId: req.vetraUser!.id,
  });
'@

$content = $content.Replace($old, $new)

# Wrap entity updates in status check
$content = $content.Replace(
  '  if (run.entityType === "form_submission") {',
  '  // Only update the linked entity when the workflow actually transitions' + [Environment]::NewLine + '  if (updated.status !== "pending") {' + [Environment]::NewLine + '  if (run.entityType === "form_submission") {'
)

# Close the status check
$content = $content.Replace(
  '  audit(req, workflow_run., "workflow_run", {',
  '  } // end if (updated.status !== "pending")' + [Environment]::NewLine + [Environment]::NewLine + '  audit(req, workflow_run., "workflow_run", {'
)

Set-Content "C:\Users\VETRA_AI\Documents\VETRA-OS-Platform\artifacts\api-server\src\routes\workflows.ts" -Value $content
Write-Host "Done"
