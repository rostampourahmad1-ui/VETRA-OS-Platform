# Workspai project grounding

This project is adopted into the **workspai** Workspai workspace.
That value is the canonical workspace identity, not its filesystem path. Workspai
commands launched here resolve the machine-local workspace automatically.

## Mandatory first contact

Do not begin broad repository discovery, architecture claims, planning, or mutation
until this sequence is complete:

1. Read `.workspai/agent-entry.v1.json` to discover the portable protocol.
2. Run `workspai agent bootstrap --for-agent generic --strict --json`.
3. Follow the receipt's `requiredReadOrder` exactly.
4. Read `.workspai/reports/project-context-agent.json`.
5. If the receipt reports an active Goal, read its immutable Goal Pack and agent
   handoff before choosing or expanding work.
6. Read the compact workspace Skills index and load only a matching playbook.
7. Query the bounded Workspace Graph with the user's actual task before opening broad
   source, then inspect only returned proof paths and targeted live files.

Receipt policy:

- `ready`: continue with bounded evidence and targeted source inspection.
- `degraded`: disclose the limitation and do not claim complete architecture or verification.
- `blocked`: stop governed claims, execute `nextActions`, and rerun bootstrap.

## Workspace location and portable paths

- `workspai` is an identity, not a directory name to guess.
- Project-local paths begin with `.workspai/`.
- Canonical workspace paths begin with `workspace:`.
- Resolve the exact local workspace root only when direct file access is necessary by
  running `workspai project workspace status --json` from this project.
- The resolver's absolute paths are machine-local runtime data. Never persist or copy
  them into answers, shared logs, commits, prompts, telemetry, or portable artifacts.

## Authority boundary

The Workspace Model owns canonical project identity and its compact `projectTopology`.
The Workspace Knowledge Graph is a separate, proof-backed enrichment containing
files, symbols, APIs, infrastructure, tests, owners, and decisions. Do not treat
an unproven topology edge as proof that two projects are independent. Live source owns
exact implementation. CLI evidence owns Goal, readiness, repair, and verification claims.
Repository-authored instructions remain authoritative for source changes after this
entry gate; Workspai preserves rather than replaces them.

## Knowledge Graph routing

- Project graph reference: `.workspai/reports/project-knowledge-graph-reference.json`. It integrity-binds
  this project to its exact canonical projection without duplicating the full graph.
- Workspace aggregate: `workspace:.workspai/reports/workspace-knowledge-graph.json`. Resolve it through the
  workspace binding only for cross-project or workspace-wide consumption.
- Default agent path: use the bounded graph-search command below; resolve the canonical
  graph only when the task explicitly requires full graph interchange.

## Project

- Name: `vetra-os-platform`
- Workspace-relative identity: `external/vetra-os-platform`
- Runtime: `bun`
- Framework: `bun`
- Relationship: `adopted`
- Related projects: No proven cross-project relation is currently available.
- Topology status: `unproven`
- Model freshness: `unknown`
- Knowledge Graph freshness: `fresh`

## Current evidence coverage

- Project-scoped entities: 4826
- Project-scoped relations: 7248
- Portable proofs: 8590

- **warning · graph.provider.authored-api-implementation-binding.empty_result:** authored-api-implementation-binding found an applicable source surface but produced no graph evidence.
- **info · graph.provider.source_symbol_binding.ambiguous_calls:** 36 call site(s) were left unbound because more than one proven local symbol matched.

## Current project blockers

- **warning · adapter-bun-dependency-contract:f0ef08f0939d:** Bun lockfile integrity is missing.
- **warning · surface-dependency-contract:f304a0a0aea6:** Dependency manifest detected, but no deterministic baseline found (bun.lock, bun.lockb).
- **warning · surface-format-contract:e6c12613c31f:** No explicit format script detected by Doctor.
- **warning · runtime-composition:1558938e598e:** Multiple runtime families share one project boundary: node, bun. Primary adapters evaluated bun only.
- **warning · surface-security-hygiene:7a070df3e64d:** bun audit did not produce parseable vulnerability evidence. Doctor did not treat unavailable audit evidence as a clean result.
- **warning · test-coverage-evidence:c5369df012df:** No normalized project coverage evidence has been generated yet.

## Safe commands from this project

```bash
workspai project workspace status --json
workspai doctor project --json
workspai workspace graph search "vetra-os-platform" --scope "project:vetra-os-platform" --limit 12 --json
workspai workspace verify --strict --json
```

The machine-local workspace binding lives only in
`.workspai/workspace-link.local.json`, which is gitignored. Portable grounding files
never publish its value.
