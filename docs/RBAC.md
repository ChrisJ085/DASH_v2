# DASH V2 - Role-Based Access Control & Scope Architecture

## Document Control
- **Phase:** Phase 0.1 (Architecture Corrections & Decisions)
- **Status:** Approved Specification (Supersedes Phase 0 Baseline)
- **Core Paradigm:** Strict Decoupling of Functional Capability (**WHAT**) from Operational Boundary (**WHERE**)

---

## 1. Architectural Philosophy: WHAT vs. WHERE

Traditional enterprise RBAC systems frequently conflate capability with operational scope (e.g., hard-coding roles like "Chorley Depot MHE Observer"). This creates role explosion, brittle access management, and security loopholes when facilities or contracts change.

DASH V2 implements a clean, decoupled two-dimensional authorization architecture:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   TENANT BOUNDARY                                      │
│               (Hard database siloing via tenant_id - physically non-negotiable)        │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                    ┌───────────────────────┴───────────────────────┐
                    ▼                                               ▼
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│            WHAT YOU CAN DO           │       │          WHERE YOU CAN DO IT         │
│         (Functional Permission)      │       │          (Operational Scope)         │
│                                      │       │                                      │
│  "What action is the user allowed   │   x   │  "In which commercial contracts and  │
│   to execute?"                       │       │   physical sites is the user allowed │
│                                      │       │   to execute it?"                    │
│  • roles                             │       │                                      │
│  • permissions                       │       │  • Tenant-wide (Admin wildcard)      │
│  • role_permissions                  │       │  • user_contracts (Commercial stream)│
│  • user_roles                        │       │  • user_sites (Geographic facility)  │
└──────────────────────────────────────┘       └──────────────────────────────────────┘
```

An authenticated user is granted **Permissions** via their assigned **Roles**, but those permissions can only be executed within the **Scopes** (Contracts and Sites) explicitly assigned to that user.

### 1.1 Fundamental Definitions
- **Permission ("WHAT"):** An atomic system entitlement granting the right to perform a specific action (e.g., `observations.create`, `tools.publish`, `users.invite`, `reports.view`). Permissions are domain-wide and agnostic of location.
- **Scope ("WHERE"):** The operational boundary restricting where an authorized action may take place. Scope is composed of a Tenant outer silo, combined with explicit Contract and Site assignments.

These two concepts must remain completely separate:
- A user may have the **permission** `observations.create`.
- But unless they have **scope** covering Contract $C$ and Site $S$, they are denied from creating an observation at $(C, S)$.

---

## 2. Conceptual Roles & Standard Entitlements

While the database model is fully configurable, DASH V2 establishes six canonical conceptual roles:

| Conceptual Role | Primary Purpose | Scope Breadth | Default Permissions |
|---|---|---|---|
| **Platform Administrator** | Global maintenance & support across tenants | System-wide (cross-tenant bypass) | `*` (All permissions across all tenants) |
| **Tenant Administrator** | Complete governance of a single tenant organisation | Tenant-wide wildcard (all contracts/sites) | Full tenant management, user invites, RBAC, tool publishing, templates, audit |
| **Contract Manager** | Oversees operations across designated commercial contracts | Multi-contract or specific assigned contracts | `observations.read_scoped`, `observations.flag`, `reports.view`, `contract_sites.view` |
| **Site Manager** | Oversees operations at designated physical sites | Multi-site or specific assigned sites | `observations.read_scoped`, `observations.flag`, `reports.view`, `users.assign_site_observers` |
| **Observer** | Completes and submits observations on the shopfloor | Strictly assigned contracts and sites | `observations.create`, `observations.read_own`, `tools.read` |
| **Viewer / Auditor** | Read-only compliance, audit, and reporting access | Scoped to designated contracts/sites | `observations.read_scoped`, `reports.view`, `reports.export` |

---

## 3. Atomic Permissions Catalog

Permissions in DASH V2 are expressed in dot-notation (`<domain>.<action>`):

### 3.1 Tenancy & Organisation
- `tenant.manage_settings` - Configure tenant name, branding, and global settings.
- `tenant.manage_contracts` - Create, edit, and archive commercial contracts.
- `tenant.manage_sites` - Create, edit, and decommission physical sites.
- `tenant.map_contract_sites` - Bind or unbind sites to contracts.

### 3.2 User & Scope Governance
- `users.invite` - Invite new users into the tenant organisation.
- `users.manage_status` - Activate, suspend, or disable user profiles.
- `users.assign_roles` - Grant or revoke functional roles to users.
- `users.assign_scopes` - Grant or revoke contract and site scopes to users.

### 3.3 Data-Gathering Tools & Versioning
- `tools.create` - Create draft data-gathering instruments.
- `tools.edit_draft` - Modify sections, questions, and conditional rules of drafts.
- `tools.publish` - Lock and publish an immutable tool version.
- `tools.archive` - Archive an existing tool or version.
- `templates.export` - Mark a tool version as an organisation or platform template.
- `templates.adopt` - Instantiate a new independent tenant tool from a template.

### 3.4 Observations & Evidence Capture
- `observations.create` - Initiate and submit an observation within assigned scope.
- `observations.read_own` - View observations submitted by oneself.
- `observations.read_scoped` - View observations submitted by any user within assigned contracts/sites.
- `observations.read_all` - View all observations across the entire tenant.
- `observations.edit_in_progress` - Edit an unfinalized observation draft.
- `observations.flag` - Flag an observation for safety review or escalation.
- `observations.delete` - Soft delete an observation record (restricted to tenant admins).

### 3.5 Analytics & Audit
- `reports.view` - View aggregate metric dashboards.
- `reports.export` - Export raw observation data (CSV, PDF, Excel).
- `audit.read` - Inspect immutable audit logs.

---

## 4. Operational Scope Semantics (V1 Specification)

DASH has this operational hierarchy:
```
Tenant
  ├── Contracts
  └── Sites
```
A Site frequently belongs to multiple Contracts via `contract_sites`. For example:
- **Contract A:** Chorley Hub, Manchester Depot
- **Contract B:** Chorley Hub, Warrington DC
- **Contract C:** Manchester Depot

### 4.1 The Five Scope Rules

#### Rule 1: Tenant-Wide Access (Tenant Admin Wildcard)
A Tenant Admin (`roles.code = 'tenant_admin'`) has tenant-wide access to all contracts and sites belonging to their tenant, subject to their permissions. They do not require entries in `user_contracts` or `user_sites`.

#### Rule 2: Contract Scope Alone
A user assigned to one or more contracts via `user_contracts` (and possessing **NO** entries in `user_sites`) has access to **all sites associated with that contract** through `contract_sites`.
- *Example:* User has `Contract A`. Contract A is mapped to Chorley Hub and Manchester Depot. The user can access both Chorley Hub and Manchester Depot under Contract A.

#### Rule 3: Site Scope Alone
A user assigned directly to one or more sites via `user_sites` (and possessing **NO** entries in `user_contracts`) has access to **those assigned sites under any contract validly associated with those sites**.
- *Example:* User has `Site = Chorley Hub`. Chorley Hub is mapped to Contract A and Contract B. The user can access Chorley Hub under Contract A and under Contract B.

#### Rule 4: Combined Contract + Site Scope (Strict Intersection)
**CRITICAL ARCHITECTURAL RULE:** Where a user has **BOTH** contract assignments (`user_contracts`) **AND** site assignments (`user_sites`), their access is evaluated as an **INTERSECTION (RESTRICTION)**, not a union.
- A user with both assignments can **ONLY** access the designated Site when acting under the designated Contract.
- They do **NOT** receive access to all sites under the contract.
- They do **NOT** receive access to that site under other contracts.

#### Rule 5: Default Restricted (No Scope Assigned)
If a non-admin user has zero entries in `user_contracts` and zero entries in `user_sites`, they have access to **NO contracts and NO sites**. They cannot view or create any observations until an administrator explicitly assigns scopes.

---

## 5. Concrete Scope Scenarios & Examples

To prevent any ambiguity during implementation, consider the following enterprise setup:

- **Tenant:** Example Logistics UK
- **Contracts:**
  - `Contract A` (Retail Stream)
  - `Contract B` (Industrial Stream)
- **Sites:**
  - `Chorley Hub` (Mapped to Contract A and Contract B via `contract_sites`)
  - `Manchester Depot` (Mapped to Contract A only via `contract_sites`)
  - `Warrington DC` (Mapped to Contract B only via `contract_sites`)

### Comparison Matrix

| User Profile | Assigned Scopes | Can Access: (Contract A, Chorley)? | Can Access: (Contract A, Manchester)? | Can Access: (Contract B, Chorley)? | Can Access: (Contract B, Warrington)? | Detailed Architectural Explanation |
|---|---|---|---|---|---|---|
| **User 1 (Combined Scope)** | `Contract A` + `Site Chorley` | **YES** | **NO** | **NO** | **NO** | **Strict Intersection:** Must satisfy BOTH Contract A AND Site Chorley. Cannot access Manchester (out of site scope) or Contract B Chorley (out of contract scope). |
| **User 2 (Contract Only)** | `Contract A` | **YES** | **YES** | **NO** | **NO** | **Contract Scope:** Can access all sites mapped to Contract A (Chorley and Manchester). Cannot access Contract B. |
| **User 3 (Site Only)** | `Site Chorley` | **YES** | **NO** | **YES** | **NO** | **Site Scope:** Can access Chorley under any valid contract (Contract A and Contract B). Cannot access Manchester or Warrington. |
| **User 4 (Multi-Combined)** | `Contract A` + `Sites Chorley, Manchester` | **YES** | **YES** | **NO** | **NO** | Intersects Contract A with both sites; permitted for both under Contract A only. |
| **User 5 (Unassigned)** | None | **NO** | **NO** | **NO** | **NO** | **Default Restricted:** Zero access until explicitly provisioned by an administrator. |
| **Tenant Admin** | None needed (Admin role) | **YES** | **YES** | **YES** | **YES** | **Tenant Wildcard:** Tenant Admin role bypasses specific contract/site filters across the tenant. |

---

## 6. Scope Resolution Algorithm & RLS Implementation

When a user executes an operation on target `(contract_id, site_id)` within `tenant_id`:

```
                           USER ATTEMPTS ACTION ON (Contract C, Site S)
                                                │
                                                ▼
                               Is user a Platform Administrator?
                                     ├── YES ──► [ALLOW (Cross-Tenant Maintenance)]
                                     └── NO
                                        │
                                        ▼
                        Does user's tenant_id match target tenant?
                                     ├── NO ───► [DENY (Tenant Isolation)]
                                     └── YES
                                        │
                                        ▼
                   Does user have the required Permission (via user_roles)?
                                     ├── NO ───► [DENY (Permission Missing)]
                                     └── YES
                                        │
                                        ▼
                 Is (Contract C, Site S) a valid pair in contract_sites?
                                     ├── NO ───► [DENY (Invalid Contract-Site Binding)]
                                     └── YES
                                        │
                                        ▼
                      Is user a Tenant Admin (Tenant-Wide Scope)?
                                     ├── YES ──► [ALLOW (Admin Wildcard)]
                                     └── NO
                                        │
                                        ▼
                          Evaluate User Scopes (C, S):
                                        │
               ┌────────────────────────┼────────────────────────┐
               │                        │                        │
       Has user_contracts?      Has user_sites?          Has BOTH?
       (user_sites is EMPTY)    (user_contracts EMPTY)   (Both non-empty)
               │                        │                        │
               ▼                        ▼                        ▼
       Is C in user_contracts?  Is S in user_sites?      Is C in user_contracts
          ├── YES ──► [ALLOW]      ├── YES ──► [ALLOW]   AND S in user_sites?
          └── NO ───► [DENY]       └── NO ───► [DENY]       ├── YES ──► [ALLOW (Intersection)]
                                                            └── NO ───► [DENY]
```

### 6.1 PostgreSQL Helper Function Specification for RLS

Phase 1 will implement this helper function in PostgreSQL:

```sql
CREATE OR REPLACE FUNCTION auth.has_operational_scope(target_contract_id UUID, target_site_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_platform_admin BOOLEAN;
  v_is_tenant_admin BOOLEAN;
  v_has_any_contract_assignment BOOLEAN;
  v_has_any_site_assignment BOOLEAN;
  v_contract_matched BOOLEAN;
  v_site_matched BOOLEAN;
BEGIN
  -- 1. Platform Admin bypass
  SELECT is_platform_admin INTO v_is_platform_admin 
  FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
  IF v_is_platform_admin IS TRUE THEN
    RETURN TRUE;
  END IF;

  -- 2. Tenant Admin bypass
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.code = 'tenant_admin'
  ) INTO v_is_tenant_admin;
  IF v_is_tenant_admin IS TRUE THEN
    RETURN TRUE;
  END IF;

  -- 3. Verify valid contract-site relationship exists in tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.contract_sites cs
    WHERE cs.contract_id = target_contract_id 
      AND cs.site_id = target_site_id
      AND cs.deleted_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  -- 4. Check user assignments
  SELECT EXISTS (SELECT 1 FROM public.user_contracts WHERE user_id = auth.uid()) INTO v_has_any_contract_assignment;
  SELECT EXISTS (SELECT 1 FROM public.user_sites WHERE user_id = auth.uid()) INTO v_has_any_site_assignment;

  -- If user has no scope assignments whatsoever -> DEFAULT RESTRICTED
  IF NOT v_has_any_contract_assignment AND NOT v_has_any_site_assignment THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_contracts WHERE user_id = auth.uid() AND contract_id = target_contract_id) INTO v_contract_matched;
  SELECT EXISTS (SELECT 1 FROM public.user_sites WHERE user_id = auth.uid() AND site_id = target_site_id) INTO v_site_matched;

  -- Case A: User has BOTH Contract and Site restrictions -> INTERSECTION
  IF v_has_any_contract_assignment AND v_has_any_site_assignment THEN
    RETURN (v_contract_matched AND v_site_matched);
  END IF;

  -- Case B: User has Contract restrictions ONLY
  IF v_has_any_contract_assignment AND NOT v_has_any_site_assignment THEN
    RETURN v_contract_matched;
  END IF;

  -- Case C: User has Site restrictions ONLY
  IF NOT v_has_any_contract_assignment AND v_has_any_site_assignment THEN
    RETURN v_site_matched;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
```

---

## 7. Phase 0.1 Decisions: Access Scope & RBAC

### Decision 1: WHAT vs. WHERE Strict Separation
- **Decision:** Roles and permissions exclusively define functional capability. Contract and site assignments exclusively define operational scope.
- **Reason:** Eliminates combinatorial role explosion and keeps role assignments intact when users transfer between sites or contracts.
- **Deferred:** Custom field-level attribute-based access control (ABAC) is deferred to future enterprise extensions.
- **Implementation Implication (Phase 1):** Create `roles`, `permissions`, `role_permissions`, `user_roles`, `user_contracts`, and `user_sites` with composite foreign keys.

### Decision 2: Combined Scope Treated as Strict Intersection
- **Decision:** When a user is assigned both contracts and sites, access requires satisfying BOTH conditions.
- **Reason:** Prevents accidental broad access. An auditor or observer assigned to a national contract for a single local depot must not gain access to all depots nationally.
- **Deferred:** Flexible user-configurable toggle between Union and Intersection per user is deferred as unnecessary complexity for V1.
- **Implementation Implication (Phase 1):** Embed the intersection logic in `auth.has_operational_scope()` and all RLS policies on `observations`.

### Decision 3: Default Restricted Access
- **Decision:** Non-admin users without scope assignments have access to 0 contracts and 0 sites.
- **Reason:** Adheres to enterprise zero-trust security.
- **Deferred:** None.
- **Implementation Implication (Phase 1):** Automated tests must assert that a user with roles but no scope assignments receives empty result sets.

---

## 8. Phase 3 Achievements: Strict Real-Time RBAC & Scope Enforcement

Phase 3 transitions the decoupled RBAC and Scope architecture into an active, database-enforced, and real-time manageable system.

### 8.1 Database-Level Security Triggers (`018_phase3_rbac_enforcement.sql`)
Instead of relying purely on frontend or client-side checks, DASH V2 enforces strict RBAC and Scope transitions directly within the Postgres transaction lifecycle:
- **Tenant Isolation Enforcement:** Triggers prevent any cross-tenant role mapping, role assignments, or scope mappings.
- **Self-Elevation Block:** Users are strictly forbidden from assigning roles or scopes to themselves (blocking self-elevation vectors), even if they hold administrative rights.
- **System-Role Protection:** Global seeded system roles (e.g., `tenant_admin`, `observer`) are fully protected. Their permissions cannot be altered, and the roles cannot be deleted by tenant administrators.
- **Status Restrictions:** Profile status changes (active/suspended) are locked behind permission validation (`users.manage_status`). Suspended users are completely blocked from executing any database queries via RLS policies.
- **Automated Audit Logging:** Every role creation, deletion, scope assignment, and permission modification triggers an immediate, immutable insert into `public.audit_logs`.

### 8.2 Performant Unified State API (`public.get_user_authorization_state`)
To eliminate multiple high-latency joins during the frontend session lifecycle, a secure RPC endpoint compiles the complete authorization matrix for the current user into a single structured JSONB payload:
```json
{
  "is_platform_admin": false,
  "roles": [
    { "id": "uuid", "name": "Observer", "code": "observer" }
  ],
  "permissions": [
    "observations.create",
    "observations.read_own",
    "tools.read"
  ],
  "contracts": [
    { "id": "uuid", "name": "DHL Retail", "code": "dhl_retail" }
  ],
  "sites": [
    { "id": "uuid", "name": "Milton Keynes Depot", "code": "mk_depot" }
  ]
}
```
This is bound directly into the React `useAuth` context, providing high-performance client-side authorization lookups (`hasPermission('observations.create')` and `hasOperationalScope(contractId, siteId)`).

### 8.3 Interactive RBAC Workspace
The **Roles & Permissions** tab in the admin portal provides a beautiful, zero-trust workspace for managing these constraints:
- **Custom Role Engine:** Enables on-the-fly custom role creation, custom code formatting, and deletion.
- **Dynamic Permission Checkbox Matrix:** Organizes all system entitlements by category, allowing easy, real-time custom permission toggles.
- **Membership & Boundary Assignments:** Enables managing user profiles in the **Team & Invitations** tab to assign/revoke functional roles, commercial contracts, and physical site scopes seamlessly.

