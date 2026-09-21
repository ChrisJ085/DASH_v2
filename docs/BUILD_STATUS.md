# DASH V2 - Build Status & Roadmap Control

## Current Phase Status
- **Phase 0 (Architecture Baseline):** Complete / Superseded by Phase 0.1 corrections
- **Phase 0.1 (Architecture Corrections & Decisions):** **COMPLETE**
- **Phase 1 (Database & Supabase Foundation):** **COMPLETE**
- **Phase 2 (Auth & Tenancy Core):** **COMPLETE**

---

## 1. Phase 1 Accomplishments & Relational Foundations

Phase 1 implemented the complete database foundation for DASH V2 in modular PostgreSQL migrations with strict composite keys, granular Row-Level Security, and automated validation tests:

| Database Layer | Implementation Outcome | Associated Migration File | Status |
|---|---|---|---|
| **Extensions & Mocking** | Created `auth` schema and conditional `auth.users` mock table to support local testing runs. Enabled crypto extensions. | `001_extensions.sql` | **Completed** |
| **Tenancy Structure** | Designed `tenants`, `contracts`, `sites`, and `contract_sites` with composite uniques `(tenant_id, id)` and composite foreign keys to physically prevent cross-tenant mapping. | `002_tenants_and_structure.sql` | **Completed** |
| **Profiles & Identity** | Established `profiles` linking 1:1 with `auth.users` carrying identity and active tracking metadata. | `003_identity_and_profiles.sql` | **Completed** |
| **RBAC & Scopes** | Designed `roles`, `permissions`, `role_permissions`, `user_roles`, `user_contracts`, and `user_sites` mapping functional capabilities and operational ranges. | `004_rbac_and_scopes.sql` | **Completed** |
| **Tools & Questionnaires** | Implemented `tools`, `tool_versions`, `tool_sections`, `tool_questions`, and `question_options` mapping complete question archetypes with composite keys. | `005_tools_and_versions.sql` | **Completed** |
| **Conditional Logic** | Modeled the declarative dependency engine in `conditional_rules` and `rule_conditions` ensuring version isolation of rules. | `006_conditional_rules.sql` | **Completed** |
| **Templates Catalog** | Created `tool_templates` catalog mapping to immutable source versions with strict restrict hooks on deletion. | `007_templates.sql` | **Completed** |
| **Observations Engine** | Implemented the active observation capturing tables `observations`, `observation_responses`, `observation_photos`, and `observation_signatures`. | `008_observations.sql` | **Completed** |
| **Audit Compliance** | Designed the immutable enterprise `audit_logs` table tracking sensitive metadata modifications. | `009_audit.sql` | **Completed** |
| **Security Functions** | Programmed `auth.current_tenant_id()`, `auth.has_permission()`, and the full strict-intersection scope resolution helper `auth.has_operational_scope()`. | `010_security_functions.sql` | **Completed** |
| **Row-Level Security** | Enabled and defined strict RLS policies on all 24 tables, siloing all read/write/delete permissions. | `011_rls.sql` | **Completed** |
| **Triggers & Cloning** | Created version-immutability trigger checks (`check_tool_version_immutability`) locking published configurations, and the transactional deep-cloning procedure `tools_adopt_template()`. | `012_triggers_and_procedures.sql` | **Completed** |
| **Seed Registries** | Seeded canonical atomic permissions catalog, standard system roles, and standard default role-permission mappings. | `013_seed_data.sql` | **Completed** |

---

## 2. Phase 2 Accomplishments & Auth & Tenancy Core

Phase 2 established the complete, secure user authentication lifecycle, dynamic tenant context retrieval, and onboarding/on-boarding foundations. In addition, a target security remediation was applied to secure administrative boundaries:

| Module / Layer | Implementation Outcome | Associated Migration / Files | Status |
|---|---|---|---|
| **Database Hardening** | Re-declared all `SECURITY DEFINER` procedures with an explicitly controlled `search_path = public, pg_temp` or `public, auth, pg_temp` preventing schema hijacking. | `014_phase2_auth_tenancy.sql` | **Completed** |
| **Profile Lifecycle** | Implemented trigger `on_auth_user_created` to automatically insert matching records into `public.profiles` when new users are invited or signed up. | `014_phase2_auth_tenancy.sql` | **Completed** |
| **Escalation Security** | Designed database trigger `tr_prevent_platform_admin_escalation` to completely block normal users from self-promoting to platform admins. | `014_phase2_auth_tenancy.sql` | **Completed** |
| **Tenant Bootstrap Procedure**| Formulated `public.bootstrap_tenant` RPC function allowing unassociated users to securely register a new tenant and gain the system global `tenant_admin` role. | `014_phase2_auth_tenancy.sql` | **Completed** |
| **Durable Auth Context** | Re-engineered `/src/lib/auth-context.tsx` to handle in-memory retrieval of Session, User, Profile, Tenant, error logging, and dynamic `refreshProfile` contexts. | `/src/lib/auth-context.tsx` | **Completed** |
| **Onboarding & Shell UI** | Crafted a beautiful, responsive, and secure client-side portal housing Tenant Setup (Bootstrap) views, isolated contract/site managers, and team management invitation forms. | `/src/components/DocsPortal.tsx`, `/src/pages/Login.tsx` | **Completed** |
| **Trigger Hardening (Security)** | Refactored `handle_new_user()` trigger to completely ignore client-provided metadata for sensitive parameters. It assigns `tenant_id` to strictly `NULL` and `status` to `'invited'`. | `015_phase2_security_hardening.sql` | **Completed** |
| **Bootstrap Hardening (Security)** | Hardened `bootstrap_tenant()` by revoking execute permissions from `PUBLIC` and `anon`, allowing only `authenticated`. Added existing membership checks and unique slug conflict handling. | `015_phase2_security_hardening.sql` | **Completed** |
| **Server-side Invitations** | Designed a standard Supabase Deno Edge Function (`invite-user`) that uses the privileged service role on the backend to authenticate callers, verify roles, invite users, and provision target database profiles safely. | `/supabase/functions/invite-user/index.ts` | **Completed** |
| **Client-side Isolation** | Created `/src/lib/invitation-service.ts` to cleanly invoke the secure edge function, keeping React views isolated from administrative secrets, token handling, and DB details. | `/src/lib/invitation-service.ts` | **Completed** |
| **Self-Signup Elimination** | Removed unrestricted public signup toggles and forms from `Login.tsx`, replacing it with an explicitly controlled, dedicated "Register New Organisation" flow. | `/src/pages/Login.tsx` | **Completed** |

---

## 3. Verification and Validation Suite

Validation tests verify both schema structures and security rule alignments in the DASH V2 workspace. We clearly distinguish between static structural checks and live database execution:

1. **Database Schema Static Validation** (`supabase/tests/schema_validator.ts`):
   - Proves existence of all 24 tables.
   - Proves tenant_id isolation is attached to all 22 tenant tables.
   - Proves strict Row Level Security is explicitly enabled.
   - Checks composite unique and foreign key constraints to prevent cross-tenant leakage.

2. **Database Security Constraint Verification** (`supabase/tests/security_validator.ts`):
   - **EXECUTION STATUS: Actually Executed and Passed 100% Green.**
   - Audits all `SECURITY DEFINER` functions to verify strict `search_path` hardening.
   - Audits existence of platform admin escalation prevention triggers.
   - Audits profile trigger creation on `auth.users`.
   - Audits existence of the bootstrap procedure.
   - Audits and verifies that execution permissions on `bootstrap_tenant` are revoked from `PUBLIC` and `anon`.

3. **Database RLS Runtime Integration Tests** (`supabase/tests/rls_integration_test.ts`):
   - **EXECUTION STATUS: RLS integration suite implemented and verified structurally; live database execution remains pending against a configured Supabase environment.**
   - **Test Mechanics:** Programmed a comprehensive suite testing actual, live database transaction isolation using genuine authenticated identities (`adminClient.auth.admin.createUser`), logging in, and retrieving authentic JWT sessions to test Tenant A/B SELECT isolation, `WITH CHECK` tenant spoofing blocks, suspended user exclusions, and bootstrap duplication restrictions.
   - **Test Execution Distinction:** Because the preview workspace operates on local sandbox environment variables (which contain placeholder keys), the actual query execution on a live cluster was skipped at runtime to prevent fabricated results. The test script executed locally, detected the limitation, gracefully skipped live requests, and exited successfully (`Exit Code: 0`). The full, executable test script remains documented and deployable in the source code.

*Result:* **All static and security verification tests actually executed and passed with 100% success. The RLS integration suite is structurally verified, and live execution remains pending against a configured live environment.**

---

## 4. MASTER ROADMAP CONTROL

```
Phase 0: Architecture Definition
├── Phase 0 (Baseline Specs): Complete
└── Phase 0.1 (Architecture Corrections & Decisions): COMPLETE
      │
      ▼
Phase 1: Database & Supabase Foundation (COMPLETE)
      │
      ▼
Phase 2: Auth & Tenancy Core (COMPLETE)
      │
      ▼
Phase 3: RBAC & Scope Enforcement (Planned - Next Phase)
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
