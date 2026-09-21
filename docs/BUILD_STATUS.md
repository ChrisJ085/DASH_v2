# DASH V2 - Build Status & Roadmap Control

## Current Phase
**Phase 0**  
**Status: Architecture definition**

---

## 1. Phase 0 Deliverables Summary

| Deliverable | Description | Location | Status |
|---|---|---|---|
| **System Architecture** | Multi-tenant hierarchy, layering, scale strategy, desktop vs. mobile paradigms | `/docs/ARCHITECTURE.md` | Complete |
| **Database & Entity Schema** | 22 relational entities, columns, FKs, indexes, soft deletion patterns | `/docs/DATABASE.md` | Complete |
| **RBAC & Scope Model** | Decoupling WHAT (permissions) from WHERE (contracts/sites), RLS helpers | `/docs/RBAC.md` | Complete |
| **Security & RLS Strategy** | Zero-trust boundaries, user lifecycle, answers to 10 core RLS questions | `/docs/SECURITY.md` | Complete |
| **Tool Engine & Logic** | Immutability, question types, declarative conditional rules, templates | `/docs/TOOL_ENGINE.md` | Complete |
| **Project Tracking** | Build status tracker and governance boundaries | `/docs/BUILD_STATUS.md` | Complete |

---

## 2. Architectural Decisions Requiring Confirmation Before Phase 1

Before proceeding to **Phase 1: Database Setup & Migration Scripts**, the lead architect highlights the following technical decisions for stakeholder confirmation:

1. **User Scope Default Behavior (Open vs. Restricted):**
   - *Option A (Default Restricted):* If an observer has zero records in `user_contracts` or `user_sites`, they have access to *no* contracts/sites until explicitly assigned by an administrator.
   - *Option B (Default Open):* An observer with zero scope assignments can complete observations across all sites in their tenant until restricted.
   - *Recommendation:* Option A (Default Restricted) aligns with enterprise security and prevents accidental data contamination.

2. **Denormalization of `tenant_id` on Child Tables:**
   - *Context:* We have included `tenant_id` on leaf tables (`contract_sites`, `tool_questions`, `observation_responses`, `rule_conditions`).
   - *Trade-off:* Requires an extra foreign key validation on insert, but reduces RLS query overhead by up to 80% because the database avoids multi-table recursive joins to verify tenant boundaries.
   - *Recommendation:* Keep `tenant_id` denormalized on operational tables.

3. **Soft Deletion vs. Hard Deletion:**
   - *Design:* Core operational entities (`contracts`, `sites`, `tools`, `observations`, `profiles`) use `deleted_at TIMESTAMPTZ NULL` with partial indexes. Configuration leaf tables (`rule_conditions`, `question_options`) use cascading hard deletion on parent draft deletion.
   - *Recommendation:* Confirm soft-deletion policy for regulatory compliance.

4. **Offline Observation Sync Granularity:**
   - *Context:* When mobile observers work in cold-store or subterranean depot areas with intermittent connectivity.
   - *Strategy:* The observation runner will buffer local draft responses in IndexedDB and perform an atomic batch commit when reconnected.

---

## 3. Project Phase Roadmap

### Phase 0: Architecture Definition
- **Status:** Complete (Ready for Review & Sign-Off)
- **Scope:** Define data model, RBAC, conditional logic, security strategy, and project documentation.

### Phase 1: Database & Migration Engine
- **Status:** Planned (Pending Sign-Off)
- **Scope:** PostgreSQL DDL migration scripts, RLS policies, security helper functions, seed data for canonical roles and initial platform templates.

### Phase 2: Authentication & Tenancy Core
- **Status:** Planned (Pending Sign-Off)
- **Scope:** Supabase Auth integration, user invitation pipeline, profile creation, tenant routing, and session state.

### Phase 3: RBAC & Scope Enforcement
- **Status:** Planned (Pending Sign-Off)
- **Scope:** Tenant user management UI, role assignments, contract & site mapping, and authorization middleware.

### Phase 4: Tool Builder & Versioning
- **Status:** Planned (Pending Sign-Off)
- **Scope:** Desktop Tool Builder UI, drag-and-drop section/question editor, conditional rule builder, version publishing and locking.

### Phase 5: Mobile Observation & Capture Engine
- **Status:** Planned (Pending Sign-Off)
- **Scope:** Mobile-first touch runner, single-question/stepper modes, real-time conditional evaluation, photo upload, and signature canvas.

### Phase 6: Analytics, Reporting & Templates
- **Status:** Planned (Pending Sign-Off)
- **Scope:** Executive dashboards, observation filtering, compliance scorecards, PDF/CSV export, and platform template library.
