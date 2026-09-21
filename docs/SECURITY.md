# DASH V2 - Security, Authentication & Row Level Security (RLS) Strategy

## Document Control
- **Phase:** Phase 0.1 (Architecture Corrections & Decisions)
- **Status:** Approved Security Specification (Supersedes Phase 0 Baseline)
- **Security Boundary:** PostgreSQL Row Level Security (RLS) + Composite Foreign Keys + Supabase Auth
- **Zero-Trust Rule:** Never trust client-side input or client-side route guards for data access enforcement.

---

## 1. Ten Core Enterprise Security Principles

1. **RLS as the Absolute Security Boundary:** Supabase Row Level Security is the primary enforcement mechanism. If an unauthorized client issues a direct API query or bypasses UI controls, the database rejects the query with zero rows returned or a permission violation error.
2. **No Client-Side Authorization Assumptions:** UI visibility logic (hiding buttons or tabs) is purely a convenience mechanism; backend database policies independently evaluate every transaction.
3. **Strict Database-Level Tenant Isolation:** Every multi-tenant table contains an indexed `tenant_id`. Every SELECT, INSERT, UPDATE, and DELETE query must verify tenant membership.
4. **Guaranteed Multi-Tenant Siloing via Composite FKs:** Parent tables enforce `UNIQUE (tenant_id, id)` and child tables enforce `FOREIGN KEY (tenant_id, ...)`. A user can never read, update, or reference entities from another tenant.
5. **Enforceable Operational Scopes with Strict Intersection:** Contract and site access boundaries are checked within PostgreSQL policies using relational joins and `auth.has_operational_scope(contract_id, site_id)`. When both contract and site assignments exist, access requires satisfying BOTH conditions.
6. **Zero Exposure of `service_role` Secrets:** The Supabase `service_role` key confers superuser privileges and is never exposed in client code, public environment variables, or client-side bundles.
7. **Public Key Minimization:** Only the public Supabase `anon` key is bundled with the frontend, running under the strict constraints of authenticated user JWTs and RLS.
8. **Zero Plaintext Password Storage:** Passwords are never handled, hashed, or stored within application tables. Supabase Auth (utilizing robust, salted bcrypt/argon2 hashing in `auth.users`) exclusively manages authentication credentials.
9. **Ban on Broad Policies:** Generic policies such as `CREATE POLICY "Allow all authenticated users" ON ... TO authenticated USING (true);` are strictly prohibited on operational tables.
10. **Explicit Privilege Escalation:** Any administrative action (such as tenant creation, user suspension, or system configuration) requires verified membership in specific administrative roles.

---

## 2. Authentication & User Lifecycle Architecture

DASH V2 integrates natively with **Supabase Auth** for identity management while maintaining domain profile metadata in `public.profiles`.

### 2.1 User Onboarding & Password Lifecycle Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        TENANT ADMIN INVITE FLOW                        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
 1. Tenant Admin enters user email & assigns initial Role + Scopes in DASH.
                                   │
                                   ▼
 2. Edge Function or Server Action calls Supabase Admin Auth API:
    `supabase.auth.admin.inviteUserByEmail(email, { data: { tenant_id } })`
                                   │
                                   ▼
 3. Supabase Auth creates an unconfirmed user record in `auth.users`
    and fires an automated secure invitation email containing a single-use token.
                                   │
                                   ▼
 4. Database Trigger or Webhook instantiates a corresponding record in
    `public.profiles` with status = 'invited', linked via `profiles.id = auth.users.id`.
                                   │
                                   ▼
 5. Initial role assignments and contract/site scopes are inserted into
    `public.user_roles`, `public.user_contracts`, and `public.user_sites`.
                                   │
                                   ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      USER ONBOARDING & PASSWORD                        │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
                                   ▼
 6. User clicks secure email link -> Lands on DASH Password Setup view.
                                   │
                                   ▼
 7. User establishes their permanent password via `supabase.auth.updateUser()`.
                                   │
                                   ▼
 8. Supabase Auth upgrades user to confirmed; session JWT is minted.
                                   │
                                   ▼
 9. Profile status transitions to 'active'; `last_seen_at` updated.
                                   │
                                   ▼
10. User accesses DASH within their designated Tenant and Scope.
```

### 2.2 Security Guarantees of the Lifecycle
- **Zero Plaintext Passwords:** No temporary password is sent in cleartext or held in the application database.
- **Single-Use Tokens:** The invitation token is managed and invalidated automatically by Supabase Auth upon password establishment.
- **Tenant Affinity Guard:** The invitation token binds the session directly to the pre-provisioned tenant ID.

---

## 3. Row Level Security (RLS) Strategy & Decision Matrix

Here are the explicit architectural specifications for the ten fundamental RLS design questions:

### 3.1 Question 1: How does Supabase identify the authenticated user?
- **Answer:** Supabase validates the cryptographic signature of the incoming JWT bearer token and injects the user's UUID into the PostgreSQL session context, accessible via `auth.uid()`.

### 3.2 Question 2: How is the user's profile identified?
- **Answer:** The primary key of `public.profiles` directly equals `auth.uid()`. A 1:1 foreign key relationship (`profiles.id REFERENCES auth.users(id) ON DELETE CASCADE`) ensures instant profile lookup:
  ```sql
  SELECT * FROM public.profiles WHERE id = auth.uid();
  ```

### 3.3 Question 3: How is tenant membership established?
- **Answer:** Tenant membership is stored in `public.profiles.tenant_id`. For performance in RLS policies, it is retrieved via the `auth.current_tenant_id()` security definer function or extracted from custom claims in the Supabase JWT.

### 3.4 Question 4: How is tenant access enforced?
- **Answer:** Every tenant-owned table (`contracts`, `sites`, `tools`, `observations`, etc.) includes a non-nullable `tenant_id`. RLS policies enforce:
  ```sql
  USING (tenant_id = auth.current_tenant_id())
  ```
  In addition, composite foreign keys `FOREIGN KEY (tenant_id, parent_id) REFERENCES parent(tenant_id, id)` prevent any cross-tenant relationship insertion at the engine level.

### 3.5 Question 5: How is contract access enforced?
- **Answer:** For non-admin roles, access to contract-specific records requires either:
  1. A record in `user_contracts` linking the user's ID to the contract ID, OR
  2. The user holds a role with tenant-wide contract scope (`tenant_admin`).

### 3.6 Question 6: How is site access enforced?
- **Answer:** Similar to contracts, site access requires an explicit link in `user_sites` or tenant-wide exemption.

### 3.7 Question 7: How is combined contract + site access evaluated?
- **Answer:** When a user is assigned **BOTH** contracts and sites, access is evaluated as a **strict intersection**:
  ```sql
  -- Evaluated via auth.has_operational_scope(contract_id, site_id)
  -- User must have contract_id in user_contracts AND site_id in user_sites.
  ```
  Users with contract scope alone get all sites mapped to that contract. Users with site scope alone get that site under any valid contract. Users with zero scopes get access to nothing (default restricted).

### 3.8 Question 8: How are platform administrators handled?
- **Answer:** Platform Administrators have `profiles.is_platform_admin = true`. The security helper functions immediately return `TRUE` for platform administrators, enabling cross-tenant support and global maintenance.

### 3.9 Question 9: How will observation access be restricted?
- **Answer:** Observations are protected by a compound policy:
  1. `tenant_id = auth.current_tenant_id()` (Tenant isolation)
  2. AND (
       `auth.has_permission('observations.read_all')` -- Tenant Admin / Director
       OR (
         `auth.has_permission('observations.read_scoped')` 
         AND `auth.has_operational_scope(observations.contract_id, observations.site_id)`
       )
       OR (
         `auth.has_permission('observations.read_own')` 
         AND `observer_id = auth.uid()`
       )
     )

### 3.10 Question 10: How will tool & template access be restricted?
- **Answer:**
  - Published tool versions (`status = 'published'`) are readable by all active users in the tenant.
  - Draft tool versions (`status = 'draft'`) are readable and editable only by users holding `tools.create` or `tools.edit_draft`.
  - First-class templates in `tool_templates`:
    - Platform public templates (`tenant_id IS NULL` and `visibility = 'platform_public'`) are readable across all authenticated tenants for adoption.
    - Tenant templates (`tenant_id` populated) are readable only within the owning tenant.

---

## 4. Supabase Storage Security (Photos & Signatures)

Photographic evidence and digital signatures represent sensitive compliance and personal data. They are stored in isolated Supabase Storage buckets under strict RLS policies.

### 4.1 Storage Hierarchy
Storage paths follow a deterministic multi-tenant convention:
- **Observation Photos:**
  `tenants/{tenant_id}/observations/{observation_id}/photos/{photo_id}.jpg`
- **Observation Signatures:**
  `tenants/{tenant_id}/observations/{observation_id}/signatures/{signature_id}.png`

### 4.2 Storage RLS Policies
Supabase Storage policies on `storage.objects` mirror database RLS:
```sql
-- Read Policy for Observation Photos
CREATE POLICY "Tenant users can view observation photos within scope"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'observation-assets'
  AND (storage.foldername(name))[1] = 'tenants'
  AND (storage.foldername(name))[2] = (auth.current_tenant_id())::text
);

-- Write Policy: Observers can only upload to their tenant's folder
CREATE POLICY "Observers can upload observation photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'observation-assets'
  AND (storage.foldername(name))[1] = 'tenants'
  AND (storage.foldername(name))[2] = (auth.current_tenant_id())::text
  AND auth.has_permission('observations.create')
);
```

---

## 5. Phase 0.1 Decisions: Security & RLS

### Decision 1: Scope Intersection in RLS
- **Decision:** When evaluating observation access for users with both contract and site assignments, RLS enforces an intersection via `auth.has_operational_scope(contract_id, site_id)`.
- **Reason:** Prevents accidental broad multi-site data exposure.
- **Deferred:** None.
- **Implementation Implication (Phase 1):** Implement `auth.has_operational_scope` in PostgreSQL DDL and invoke in the `observations` SELECT and INSERT policies.

### Decision 2: Composite FKs as Second-Line Defense Behind RLS
- **Decision:** Every relational link between tenant entities uses composite `(tenant_id, id)`.
- **Reason:** Even if an RLS policy or admin bypass misbehaves, the relational database engine physically prevents cross-tenant record creation.
- **Deferred:** None.
- **Implementation Implication (Phase 1):** Write composite foreign key constraints in migration script `001_initial_schema.sql`.
