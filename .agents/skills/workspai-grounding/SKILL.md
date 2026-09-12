---
name: workspai-grounding
description: "Workspai project grounding through the Workspai project intelligence contract"
---

<!-- WORKSPAI:GENERATED-PROJECT-SKILL -->

# Workspai project grounding

This is a portable project entry for `vetra-os-platform`. It contains no machine-local workspace path.

## Workflow

1. Read `.workspai/agent-entry.v1.json`.
2. Run `workspai agent bootstrap --for-agent generic --strict --json`.
3. Continue only when the receipt permits it and follow its bounded `requiredReadOrder`.
4. Load only the matching canonical Skill from `workspace:.workspai/reports/workspace-skills-index.json`.
5. Query the graph with `workspai workspace graph search <task-query> --scope project:vetra-os-platform --limit 12 --json` before broad source inspection.

Repository-authored instructions and live source remain authoritative for exact implementation.
