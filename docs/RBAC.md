# DASH V2 - Role-Based Access Control & Scope Architecture

## Document Control
- **Phase:** Phase 0 (Architecture Definition)
- **Status:** Approved Specification
- **Core Paradigm:** Separation of Capability (**WHAT**) from Operational Boundary (**WHERE**)

---

## 1. Architectural Philosophy: WHAT vs. WHERE

Traditional RBAC systems suffer from rigidity because they conflate capability with scope (e.g., creating rigid roles like "Chorley Depot MHE Observer"). 

DASH V2 implements a clean, decoupled two-dimensional authorization architecture:

```
┌──────────────────────────────────────┐       ┌──────────────────────────────────────┐
│            WHAT YOU CAN DO           │       │          WHERE YOU CAN DO IT         │
│          Functional Entitlements     │       │         Operational Boundaries       │
│                                      │       │                                      │
│  • roles                             │   x   │  • tenant_id (Mandatory outer silo)  │
│  • permissions                       │       │  • user_contracts (Commercial scope) │
│  • role_permissions                  │       │  • user_sites (Geographic scope)     │
│  • user_roles                        │       │                                      │
└──────────────────────────────────────┘       └──────────────────────────────────────┘
```

An authenticated user is granted **Permissions** via their assigned **Roles**, but those permissions can only be executed within the **Scopes** (Contracts and Sites) explicitly assigned to that user.

---

## 2. Conceptual Roles & Standard Entitlements

While the database model is fully configurable, DASH V2 establishes six canonical conceptual roles to bootstrap the system:

| Conceptual Role | Primary Purpose | Scope Breadth | Default Permissions |
|---|---|---|---|
| **Platform Administrator** | Global maintenance & support across tenants | System-wide (cross-tenant) | `*` (All permissions across all tenants) |
| **Tenant Administrator** | Complete governance of a single tenant organisation | Tenant-wide (all contracts/sites) | Full tenant management, user invites, RBAC, tool publishing, templates |
| **Contract Manager** | Oversees operations across designated commercial contracts | Multi-contract or specific contracts | View/edit observations, assign contract sites, view contract analytics |
| **Site Manager** | Oversees operations at designated physical sites | Multi-site or specific sites | View observations at their site, manage site observers, view site dashboards |
| **Observer** | Completes and submits observations on the shopfloor | Specific assigned sites/contracts | `observations.create`, `observations.read_own`, `tools.read` |
| **Viewer / Auditor** | Read-only compliance and reporting access | Scoped to designated contracts/sites | `observations.read`, `reports.view`, `reports.export` |

---

## 3. Atomic Permissions Catalog

Permissions in DASH V2 are expressed in clear dot-notation (`<domain>.<action>`). 

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
- `templates.export` - Mark a tenant tool as an organisation/platform template.
- `templates.adopt` - Instantiate a new tool from a platform template.

### 3.4 Observations & Evidence Capture
- `observations.create` - Initiate and submit an observation within an assigned scope.
- `observations.read_own` - View observations submitted by oneself.
- `observations.read_scoped` - View observations submitted by any user within assigned contracts/sites.
- `observations.read_all` - View all observations across the entire tenant.
- `observations.edit_in_progress` - Edit an unfinalized observation.
- `observations.flag` - Flag an observation for safety review or escalate.
- `observations.delete` - Soft delete an observation record (restricted).

### 3.5 Analytics & Audit
- `reports.view` - View aggregate metric dashboards.
- `reports.export` - Export raw observation data (CSV, PDF, Excel).
- `audit.read` - Inspect immutable audit logs.

---

## 4. Operational Scope Resolution Algorithm

When a user attempts an action (for example: `observations.create` at Site $S$ under Contract $C$), the system evaluates access using the following deterministic algorithm:

```
                          USER ATTEMPTS ACTION ON (Contract C, Site S)
                                               │
                                               ▼
                              Is user a Platform Administrator?
                                    ├── YES ──► [ALLOW]
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
                     Is user a Tenant Admin (Tenant-Wide Scope)?
                                    ├── YES ──► [ALLOW]
                                    └── NO
                                       │
                                       ▼
             Does user have Scope Access to (Contract C) AND/OR (Site S)?
                                       │
             ┌─────────────────────────┴─────────────────────────┐
             ▼                                                   ▼
     Contract Check:                                     Site Check:
     User has user_contracts(C)                          User has user_sites(S)
             │                                                   │
             └─────────────────────────┬─────────────────────────┘
                                       │
                      Does effective scope satisfy rule?
                                 ├── YES ──► [ALLOW]
                                 └── NO ───► [DENY (Out of Scope)]
```

### 4.1 Scope Evaluation Modes
1. **Strict Intersection (Contract AND Site):** Used when an observation must be certified by a user authorized for both the specific commercial contract and the local facility.
2. **Flexible Union (Contract OR Site):** Used for site-based observers who work at a facility that serves multiple contracts; assigning the user to Site $S$ authorizes them to complete observations for any contract validly mapped to Site $S$ via `contract_sites`.
3. **Tenant-Wide Exemption:** Tenant Administrators and Safety Directors hold wildcard scope across all contracts and sites within their tenant.

---

## 5. PostgreSQL & RLS Security Helper Functions

To enforce RBAC without code duplication and without round-tripping to the client, the following PostgreSQL helper functions are defined in the schema:

### 5.1 `auth.current_tenant_id()`
Returns the `tenant_id` of the current authenticated user session from `profiles`:
```sql
CREATE OR REPLACE FUNCTION auth.current_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### 5.2 `auth.has_permission(required_permission TEXT)`
Verifies if the current user possesses an active permission through any assigned role:
```sql
CREATE OR REPLACE FUNCTION auth.has_permission(required_permission TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 
    FROM public.user_roles ur
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = auth.uid()
      AND p.code = required_permission
  ) OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### 5.3 `auth.has_site_scope(target_site_id UUID)`
Verifies if the user is authorized to act upon a specific site:
```sql
CREATE OR REPLACE FUNCTION auth.has_site_scope(target_site_id UUID)
RETURNS BOOLEAN AS $$
  SELECT (
    -- Platform Admin bypass
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_platform_admin = true)
    -- Tenant Admin bypass
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur 
      JOIN public.roles r ON r.id = ur.role_id 
      WHERE ur.user_id = auth.uid() AND r.code = 'tenant_admin'
    )
    -- Explicit user_sites assignment
    OR EXISTS (
      SELECT 1 FROM public.user_sites WHERE user_id = auth.uid() AND site_id = target_site_id
    )
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```
