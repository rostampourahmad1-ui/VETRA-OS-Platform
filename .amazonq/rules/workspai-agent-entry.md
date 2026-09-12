<!-- WORKSPAI:AGENT-ENTRY:START -->
# Workspai entry for amazon-q

Before broad repository discovery, architecture claims, planning, or mutation:

1. Read `.workspai/agent-entry.v1.json`.
2. Run `workspai agent bootstrap --for-agent amazon-q --strict --json`.
3. Follow `requiredReadOrder`, any active Goal handoff, bounded Graph queries, and returned proof paths.

Receipt policy: `ready` may proceed; `degraded` must disclose limitations; `blocked` must execute `nextActions` and rerun bootstrap before governed claims.

The workspace name is a logical identity, not a path. Resolve `workspace:` URIs at runtime with `workspai project workspace status --json`; its absolute paths are machine-local and must never be copied into shared output or portable artifacts. Live source owns exact implementation; Workspai evidence owns identity, topology, goals, readiness, and verification. Repository-authored rules remain authoritative for source changes after this entry gate.
<!-- WORKSPAI:AGENT-ENTRY:END -->
