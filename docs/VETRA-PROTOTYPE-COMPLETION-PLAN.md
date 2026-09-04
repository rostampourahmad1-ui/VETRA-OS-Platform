VETRA OS — Prototype Completion Plan

Status: Mandatory Development Governance
Version: 1.0
Applies to: All AI Agents, Coding Assistants, Developers and Contributors
Repository: rostampourahmad1-ui/VETRA-OS-Platform

⸻

1. Purpose

This document defines the canonical plan, engineering rules, priorities, and Definition of Done for completing the VETRA OS Prototype.

Every AI agent, coding assistant, autonomous development agent, and human contributor working on Prototype completion MUST follow this document.

This document exists to prevent:

* UI-only implementation
* disconnected modules
* mock business logic
* duplicated domain logic
* insecure APIs
* missing tenant isolation
* incomplete database integration
* undocumented architectural deviations
* declaring features complete before they work end-to-end

⸻

2. Mandatory Rule for AI Agents

Before starting any Prototype task, the agent MUST:

1. Read AGENTS.md.
2. Read this document.
3. Inspect the actual repository.
4. Inspect the existing implementation of the affected domain.
5. Identify existing database schemas and migrations.
6. Identify existing API contracts and routes.
7. Identify existing authorization and tenant-isolation mechanisms.
8. Preserve existing architecture unless a justified change is required.
9. Implement the feature end-to-end.
10. Run appropriate validation before declaring completion.

Mandatory principle

No Mock Completion.

A feature is NOT considered complete merely because its UI exists or because a demo can display static data.

⸻

3. Definition of Prototype Complete

The VETRA Prototype is considered functionally complete when the following business journey works using real application infrastructure:

Create Organization
        ↓
Create User
        ↓
Assign Role / Permissions
        ↓
Create Project
        ↓
Create WBS
        ↓
Create Activities
        ↓
Create Schedule
        ↓
Record Daily Site Report
        ↓
Record Workforce
        ↓
Record Materials
        ↓
Record Equipment
        ↓
Record Physical Progress
        ↓
Upload Photos / Evidence
        ↓
Submit Report
        ↓
Manager Review / Approval
        ↓
Update Project Status
        ↓
Update Project Dashboard
        ↓
Cost / Progress Analysis

Every major step must use real persistence and authorization.

⸻

4. Mandatory Engineering Chain

Every real business capability MUST follow this architecture:

UI
 ↓
Type / Contract
 ↓
API
 ↓
Validation
 ↓
Authorization
 ↓
Tenant Isolation
 ↓
Domain / Service Logic
 ↓
Database
 ↓
Audit
 ↓
Tests

A feature is incomplete when one of these layers is missing without a documented architectural reason.

⸻

5. UI Prototype Rule

A UI that has not been connected to the real backend must be explicitly identified as:

UI Prototype Only

Such a module MUST NOT be represented as a completed VETRA capability.

Static arrays, fake API responses, hard-coded dashboard numbers, mock CRUD operations, and simulated workflow states MUST NOT silently become part of the real business path.

⸻

6. Architecture Priorities

Implementation must follow this priority order.

P0 — Architecture Audit

Before adding major features:

* inspect repository structure
* inspect package boundaries
* inspect API architecture
* inspect database schemas
* inspect migrations
* inspect authentication
* inspect RBAC
* inspect tenant isolation
* inspect audit infrastructure
* inspect existing tests
* identify duplicate implementations
* identify UI-only modules
* identify incomplete domain services

Deliverable

A clear understanding of what already exists must be established before rebuilding existing functionality.

⸻

P1 — Identity, Organization and Access

Implement and stabilize:

* Authentication
* Users
* Organizations
* Multi-tenancy
* Roles
* Permissions
* Project membership
* Access control

Security boundary:

Authenticated User
        ↓
Organization / Tenant
        ↓
Project
        ↓
Resource

Client-supplied tenant or organization identifiers MUST NOT determine authorization.

⸻

P2 — Project Core

Implement the fundamental project model:

* Projects
* Project metadata
* Project status
* Project members
* Project roles
* Project lifecycle
* Project permissions

All construction modules must ultimately connect to the Project entity.

⸻

P3 — Forms Engine

The Forms Engine is a platform-level capability.

It should support:

* Form templates
* Form versions
* Field definitions
* Field types
* Required fields
* Validation
* Sections
* Conditional visibility where appropriate
* Form submissions
* Submission status
* Draft
* Submit
* Review
* Approval
* Rejection
* Attachments
* Audit history

Specialized forms should use the shared Forms Engine rather than implementing independent form systems.

⸻

P4 — Daily Site Report

The Base Daily Report is the common foundation for site reporting.

It should support at minimum:

* Project
* Report date
* Shift
* Weather
* Site status
* General activities
* Workforce summary
* Material summary
* Equipment summary
* Progress summary
* Issues
* Delays
* Safety observations
* Photos / evidence
* Attachments
* Reporter
* Review status
* Approval status

The system must support extension for specialized disciplines such as:

* Concrete
* Steel / Metal
* Architecture
* Mechanical
* Electrical
* Excavation
* Finishing

Specialized reports must not duplicate the core reporting infrastructure.

⸻

P5 — WBS and Project Control

Implement real project-control functionality:

* WBS
* WBS hierarchy
* Activities
* Activity codes
* Activity dependencies
* Duration
* Start / finish
* Baseline
* Planned progress
* Actual progress
* Physical progress
* Milestones
* Calendars
* Gantt representation
* Schedule status

Scheduling logic must live in testable domain/service code.

The UI must not become the only location where schedule calculations exist.

⸻

P6 — Workforce

Implement:

* Employees
* Workforce assignment
* Project assignment
* Daily attendance
* Worker timecards
* Kardex
* Work duration
* Overtime where applicable
* Daily workforce reporting
* Workforce aggregation

The workforce model must connect to Projects and Daily Reports.

⸻

P7 — Materials and Inventory

Implement:

* Materials
* Material categories
* Units
* Warehouses
* Stock
* Material receipt
* Material issue
* Transfers
* Consumption
* Project allocation
* Daily consumption
* Inventory balance
* Material history

Construction-specific material tracking must support future integration with Vision.

Example:

Material
   ↓
Receipt
   ↓
Warehouse
   ↓
Project
   ↓
Daily Issue
   ↓
Consumption
   ↓
Progress / Cost Analysis

⸻

P8 — Cost Control

Implement the foundation for project cost control:

* Cost categories
* Project costs
* BOQ
* QTO
* Budget
* Actual cost
* Commitments where applicable
* Cost allocation
* Cost history
* Cost vs budget
* Cost vs progress

Financial calculations MUST use appropriate numeric/decimal representations and must not rely on unsafe floating-point arithmetic.

⸻

P9 — Contracts and Documents

Implement:

Contracts

* Contract registration
* Parties
* Contract type
* Contract value
* Dates
* Scope
* Attachments
* Amendments
* Status
* Payment references

Documents

* Document registration
* Version
* Category
* Project association
* Access control
* Upload
* Download
* Metadata
* Audit history

Private project documents MUST NOT be publicly exposed.

⸻

P10 — Quality and HSE

Quality and HSE should use the Forms Engine.

Examples:

Quality

* Inspection request
* Inspection checklist
* NCR
* Corrective action
* Approval
* Evidence

HSE

* Safety observation
* Incident
* Near miss
* PPE observation
* Hazard
* Corrective action
* Safety checklist

Do not create separate disconnected form architectures for Quality and HSE.

⸻

P11 — Persian, RTL and Jalali

VETRA is Persian-first and RTL-first.

Requirements:

* Persian UI
* RTL layout
* Persian labels
* Correct RTL tables
* Correct RTL forms
* Shamsi/Jalali presentation
* Gregorian-safe database storage
* Centralized date conversion
* Persian number handling where required
* Consistent date formatting

Calendar conversion logic must not be duplicated throughout individual UI components.

⸻

P12 — Project Dashboard

Dashboard data must come from real domain data.

The dashboard should eventually connect:

Project
├── Schedule
├── WBS
├── Progress
├── Workforce
├── Materials
├── Equipment
├── Costs
├── Daily Reports
├── Quality
├── HSE
├── Documents
└── Risks / Issues

No hard-coded business KPIs.

⸻

P13 — Workflow and Notifications

Implement reusable workflow foundations:

* Draft
* Submitted
* Under Review
* Approved
* Rejected
* Returned

Notifications should support relevant events such as:

* Task assignment
* Form submission
* Approval request
* Rejection
* Deadline
* Document update
* Project alerts

⸻

P14 — Audit and Security

Every important business mutation must be auditable.

Audit records should capture where appropriate:

* Actor
* Organization
* Project
* Entity
* Entity ID
* Action
* Timestamp
* Relevant change information

Security tests must cover:

* Tenant isolation
* Unauthorized access
* RBAC bypass attempts
* Resource ownership
* File access
* Invalid input
* Cross-project access

⸻

P15 — Automated Testing

Tests must be added progressively.

Minimum important coverage:

Authentication

* authenticated request
* unauthenticated request

Tenant Isolation

Tenant A → own data = allowed
Tenant A → Tenant B data = denied

RBAC

Authorized role → allowed
Unauthorized role → denied

Domain Logic

Test:

* progress calculations
* schedule logic
* material balances
* workforce totals
* cost calculations
* workflow transitions

API

Test:

* validation
* authorization
* persistence
* error handling

⸻

P16 — Integration Validation

The Prototype must be validated through real end-to-end scenarios.

At minimum:

Scenario A — Project Creation

User
 → Organization
 → Project
 → Project membership

Scenario B — Project Control

Project
 → WBS
 → Activities
 → Schedule
 → Progress

Scenario C — Daily Report

Project
 → Daily Report
 → Workforce
 → Materials
 → Equipment
 → Progress
 → Photos
 → Submit
 → Approve

Scenario D — Dashboard

Real database data
 → Domain services
 → API
 → Dashboard

⸻

P17 — Deployment Validation

Before considering the Prototype stable:

* TypeScript passes
* Lint passes
* Tests pass
* Build passes
* Database migrations succeed
* Environment configuration is documented
* No secrets are committed
* Production configuration is separated from development
* Error handling is reviewed
* Authorization is reviewed
* Tenant isolation is reviewed
* File security is reviewed

⸻

7. Mandatory Dependency Order

Do NOT implement advanced modules before their foundations.

Preferred dependency chain:

Identity
   ↓
Organization / Tenant
   ↓
Users / RBAC
   ↓
Projects
   ↓
Forms Engine
   ↓
WBS / Activities
   ↓
Daily Reports
   ↓
Workforce
   ↓
Materials
   ↓
Progress
   ↓
Cost Control
   ↓
Contracts / Documents
   ↓
Quality / HSE
   ↓
Dashboard
   ↓
AI / Vision / Advanced Intelligence

⸻

8. AI / Vision Development Rule

AI, computer vision, BIM, IoT and advanced intelligence are future differentiators, but they MUST NOT be used to compensate for missing ERP foundations.

The correct sequence is:

Reliable Data
      ↓
Reliable Domain Model
      ↓
Reliable APIs
      ↓
Reliable Audit Trail
      ↓
AI

VETRA Vision should eventually connect to VETRA through documented APIs/events rather than bypassing the core platform.

Potential future integrations include:

* Workforce detection
* Attendance
* Material detection
* Rebar tracking
* Progress detection
* PPE detection
* Equipment detection
* Construction evidence

⸻

9. No Duplicate Domain Logic

Before creating a new implementation, search the repository for existing:

* schemas
* services
* API routes
* hooks
* utilities
* types
* components
* migrations

Do not create a second implementation of an existing capability without a clear architectural reason.

⸻

10. Database Change Rules

Before modifying the database:

1. Inspect the current schema.
2. Inspect existing migrations.
3. Check relationships.
4. Check tenant ownership.
5. Check indexes.
6. Check constraints.
7. Create a migration.
8. Update types/contracts.
9. Update affected services.
10. Add tests.

Never silently modify production schema outside the migration system.

⸻

11. API Rules

APIs must:

* validate input
* authenticate requests
* enforce tenant isolation
* enforce authorization
* verify resource ownership
* return predictable errors
* avoid leaking sensitive information
* use shared contracts/types where available

Business logic should not be duplicated between multiple API routes.

⸻

12. File Security

All uploaded files are untrusted.

Enforce:

* MIME validation
* Extension validation
* File-size limits
* Safe generated filenames
* Tenant ownership
* Project ownership where applicable
* Authorization before download
* No uncontrolled public URLs

⸻

13. Git and Change Management

Each implementation task should be focused and reviewable.

Before changing code:

git status

After implementation:

git diff

Then run relevant validation.

Commit messages should describe the actual change.

Examples:

feat(forms): implement real form submission persistence
feat(projects): add project membership authorization
feat(progress): implement physical progress service
fix(auth): enforce tenant isolation on project queries
test(forms): add submission workflow coverage

Never commit:

* passwords
* API keys
* PATs
* .env
* private credentials
* temporary secrets

⸻

14. Agent Completion Report

Every AI agent completing a task MUST report:

What Changed

List the files and functionality changed.

Why

Explain the architectural/business reason.

Data / Database

Describe:

* schema changes
* migrations
* persistence impact

or explicitly state:

No database changes.

Security

Describe:

* authentication
* authorization
* tenant isolation
* file security

impact.

Tests

Report the commands actually executed.

Never claim a test passed if it was not executed.

Limitations

Clearly identify unfinished work.

Next Task

Recommend the next bounded implementation task.

⸻

15. Exception / ADR Rule

If an agent believes it must violate this completion plan, it MUST NOT silently do so.

The deviation must be documented through an Architecture Decision Record containing:

* Decision
* Context
* Alternatives considered
* Reason
* Impact
* Risks
* Migration / rollback considerations

⸻

16. What “Done” Means

The following are NOT sufficient:

* UI exists
* Page loads
* Button exists
* Modal opens
* Fake data appears
* Local state works
* Mock API works
* Demo workflow works only in browser
* Dashboard contains hard-coded numbers

A feature is DONE only when the real business path works.

The minimum standard is:

Real UI
 ↓
Real Contract
 ↓
Real API
 ↓
Real Validation
 ↓
Real Authorization
 ↓
Real Domain Logic
 ↓
Real Database
 ↓
Real Audit
 ↓
Real Tests

⸻

17. Prototype Completion Philosophy

VETRA should be built as a coherent construction operating system, not as a collection of unrelated screens.

The objective is:

One Organization
        ↓
Multiple Projects
        ↓
Shared Core Data
        ↓
Connected Construction Domains
        ↓
Real Project-Control Intelligence

Every module must answer:

1. Which organization owns this data?
2. Which project does it belong to?
3. Who can access it?
4. What domain entity does it represent?
5. Where is the business logic?
6. Where is it persisted?
7. How is it audited?
8. How is it tested?
9. Which other VETRA modules depend on it?

⸻

18. Final Mandatory Statement

All AI agents and coding assistants working on VETRA OS MUST follow this document.

Before beginning Prototype completion work:

READ:
AGENTS.md
↓
READ:
docs/VETRA-PROTOTYPE-COMPLETION-PLAN.md
↓
INSPECT:
Actual Repository
↓
IMPLEMENT:
Real End-to-End Capability
↓
VALIDATE:
Tests + Typecheck + Lint + Build
↓
REPORT:
Changes + Validation + Security + Limitations

Core VETRA Development Rule

No Mock Completion.

No UI-only completion.

No silent architectural exceptions.

No bypassing security or tenant isolation.

No feature is complete until its real business path works end-to-end.
