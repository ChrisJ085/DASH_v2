# DASH V2 - Build Status & Roadmap Control

## Current Phase Status
- **Phase 0 (Architecture Baseline):** Complete / Superseded by Phase 0.1 corrections
- **Phase 0.1 (Architecture Corrections & Decisions):** **COMPLETE**
- **Phase 1 (Database & Supabase Foundation):** **NOT STARTED (Pending Phase 1 Kickoff)**

---

## 1. Phase 0.1 Accomplishments & Architectural Resolutions

Phase 0.1 conducted a rigorous review of the Phase 0 architecture, closing critical ambiguities and establishing strict database constraints before any application code or migrations are executed:

| Review Area | Core Architectural Resolution | Primary Documentation | Status |
|---|---|---|---|
| **RBAC & Access Scope** | Decoupled Permission (WHAT) from Scope (WHERE). Defined strict intersection semantics for combined Contract + Site scopes, default restricted behavior, and explicit comparison matrix. | `/docs/RBAC.md` | **Resolved** |
| **Tenant Data Integrity** | Added mandatory composite unique keys `(tenant_id, id)` and composite foreign keys across all 7 clusters to physically forbid cross-tenant relationships at the PostgreSQL engine level. | `/docs/DATABASE.md` | **Resolved** |
| **Conditional Rule Engine** | Formatted declarative target types (`question`, `section`), actions (`show`, `hide`, `require`), answer-type operator mapping, HIDE-overrides-SHOW precedence, and automatic clearing of hidden dependent data. | `/docs/TOOL_ENGINE.md` | **Resolved** |
| **Template Architecture** | Established first-class `tool_templates` catalog. Defined template adoption as an atomic deep-clone/materialization operation with zero live shared reference, guaranteeing complete tenant sovereignty. | `/docs/TOOL_ENGINE.md`, `/docs/DATABASE.md` | **Resolved** |
| **Tool Version Immutability** | Specified strict `draft -> published -> archived` lifecycle, `Clone -> Edit Draft -> Validate -> Publish` update workflow, and PostgreSQL triggers protecting published versions from in-place edits. | `/docs/TOOL_ENGINE.md`, `/docs/DATABASE.md` | **Resolved** |
| **Observation Response Model** | Enforced one response per question (`UNIQUE (observation_id, question_id)`), omitted un-displayed conditional questions from database rows, and bound observations directly to immutable tool versions without prompt duplication. | `/docs/DATABASE.md`, `/docs/TOOL_ENGINE.md` | **Resolved** |
| **Security & RLS Strategy** | Updated the 10 core RLS question specifications with composite key isolation, `auth.has_operational_scope` helper logic, and template visibility rules. | `/docs/SECURITY.md` | **Resolved** |

---

## 2. Phase 0.1 Decisions Log

Every core specification file now maintains an explicit "Phase 0.1 Decisions" section containing the decision, architectural rationale, deferred features, and implementation implications for Phase 1:

1. **Scope Intersection in RLS (`/docs/RBAC.md`, `/docs/SECURITY.md`):**
   - *Decision:* Users with both contract and site assignments are evaluated with strict intersection (restriction).
   - *Reason:* Prevents accidental multi-depot exposure for users assigned to regional contracts.
2. **Composite Foreign Keys as Core Silo (`/docs/DATABASE.md`, `/docs/SECURITY.md`):**
   - *Decision:* All multi-tenant foreign keys include `tenant_id`.
   - *Reason:* Structural database-level impossibility of cross-tenant data corruption.
3. **First-Class Templates with Deep-Clone Adoption (`/docs/DATABASE.md`, `/docs/TOOL_ENGINE.md`):**
   - *Decision:* Dedicated `tool_templates` entity; adoption creates independent private tenant instruments.
   - *Reason:* Zero shared state or side-effects between adopting tenants and platform templates.
4. **Tool Version Immutability Triggers (`/docs/DATABASE.md`, `/docs/TOOL_ENGINE.md`):**
   - *Decision:* Database triggers block update or deletion of published/archived versions and their child questions/sections.
   - *Reason:* Guarantees audit compliance and historical record integrity.
5. **Immediate Clearing of Hidden Dependent Responses (`/docs/TOOL_ENGINE.md`):**
   - *Decision:* When a controlling answer changes causing dependent questions to become hidden, answers are purged and omitted from database responses.
   - *Reason:* Eliminates ghost data and ambiguous compliance records.
6. **Omission of Un-displayed Questions (`/docs/DATABASE.md`):**
   - *Decision:* No row in `observation_responses` for questions omitted by conditional logic.
   - *Reason:* Clean differentiation between missing answers and legitimately hidden questions.

---

## 3. Phase 1 Implementation Prerequisites Checklist

The architecture and data specifications are now locked and consistent. When authorized to proceed to **Phase 1 (Database & Supabase Foundation)**, implementation will execute against the following prerequisites:

- [ ] Write PostgreSQL migration `001_initial_schema.sql` implementing all 23 tables with composite unique constraints and composite foreign keys.
- [ ] Write PostgreSQL trigger `trg_enforce_tool_version_immutability` to lock published/archived versions.
- [ ] Write PostgreSQL security helper functions (`auth.current_tenant_id()`, `auth.has_permission()`, `auth.has_operational_scope()`).
- [ ] Write RLS migration `002_row_level_security.sql` implementing granular policies across all tables.
- [ ] Write database stored procedure `tools_adopt_template` to perform atomic deep-clone tool materialization.
- [ ] Write seed migration `003_seed_canonical_data.sql` with the 6 canonical roles, atomic permissions catalog, and 2 initial platform templates (MHE Behavioural Observation & Near-Miss Tour).

---

## 4. Master Project Roadmap

```
Phase 0: Architecture Definition
├── Phase 0 (Baseline Specs): Complete
└── Phase 0.1 (Architecture Corrections & Decisions): COMPLETE (Current)
      │
      ▼
Phase 1: Database & Supabase Foundation (Planned - Ready for Kickoff)
      │
      ▼
Phase 2: Auth & Tenancy Core (Planned)
      │
      ▼
Phase 3: RBAC & Scope Enforcement (Planned)
      │
      ▼
Phase 4: Tool Builder & Versioning (Planned)
      │
      ▼
Phase 5: Mobile Observation & Capture Engine (Planned)
      │
      ▼
Phase 6: Analytics, Reporting & Templates (Planned)
```
