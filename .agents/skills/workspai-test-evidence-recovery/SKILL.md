---
name: workspai-test-evidence-recovery
description: "Test evidence recovery through the Workspai project intelligence contract"
---

<!-- WORKSPAI:GENERATED-PROJECT-SKILL -->

# Test evidence recovery

This is a portable project entry for `vetra-os-platform`. It contains no machine-local workspace path.

## Workflow

1. Read `.workspai/agent-entry.v1.json`.
2. Run `workspai agent bootstrap --for-agent generic --strict --json`.
3. Continue only when the receipt permits it and follow its bounded `requiredReadOrder`.
4. Resolve and follow the canonical Skill `workspace:.workspai/skills/workspai-test-evidence-recovery.md` listed in `workspace:.workspai/reports/workspace-skills-index.json`.
5. Query the graph with `workspai workspace graph search <task-query> --scope project:vetra-os-platform --limit 12 --json` before broad source inspection.

Repository-authored instructions and live source remain authoritative for exact implementation.
