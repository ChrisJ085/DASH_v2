# DASH V2 - Security, Authentication & Row Level Security (RLS) Strategy

## Document Control
- **Phase:** Phase 0 (Architecture Definition)
- **Status:** Approved Security Specification
- **Security Boundary:** PostgreSQL Row Level Security (RLS) + Supabase Auth
- **Zero-Trust Rule:** Never trust client-side input or client-side route guards for data access enforcement.

---

## 1. Ten Core Enterprise Security Principles

1. **RLS as the Absolute Security Boundary:** Supabase Row Level Security is the primary enforcement mechanism. If an unauthorized client issues a direct API query or bypasses UI controls, the database rejects the query with zero rows returned or a permission violation error.
2. **No Client-Side Authorization Assumptions:** UI visibility logic (hiding buttons or tabs) is purely a convenience mechanism; backend database policies independently evaluate every transaction.
3. **Strict Database-Level Tenant Isolation:** Every multi-tenant table contains an indexed `tenant_id`. Every SELECT, INSERT, UPDATE, and DELETE query must verify tenant membership.
4. **Guaranteed Multi-Tenant Siloing:** A user can never read, update, or reference entities from another tenant. Cross-tenant queries are blocked at the engine level.
5. **Enforceable Operational Scopes:** Contract and site access boundaries are checked within PostgreSQL policies using relational joins or indexed helper functions.
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

To ensure clarity and architectural consistency across future development phases, here are the explicit answers to the ten fundamental RLS design questions:

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
  Users without a matching `tenant_id` are completely blind to the rows.

### 3.5 Question 5: How is contract access enforced?
- **Answer:** For non-admin roles, access to contract-specific records requires either:
  1. A record in `user_contracts` linking the user's ID to the contract ID, OR
  2. The user holds a role with tenant-wide contract scope (`tenant_admin`).
  ```sql
  EXISTS (
    SELECT 1 FROM public.user_contracts uc 
    WHERE uc.user_id = auth.uid() AND uc.contract_id = contracts.id
  )
  ```

### 3.6 Question 6: How is site access enforced?
- **Answer:** Similar to contracts, site access requires an explicit link in `user_sites` or tenant-wide exemption:
  ```sql
  EXISTS (
    SELECT 1 FROM public.user_sites us 
    WHERE us.user_id = auth.uid() AND us.site_id = sites.id
  )
  ```

### 3.7 Question 7: How do tenant administrators gain broader access?
- **Answer:** Tenant Administrators have an assignment in `user_roles` linking them to the system role `tenant_admin`. Security functions (`auth.is_tenant_admin()`) verify this role and grant tenant-wide scope bypass across all contracts, sites, tools, and observations within their own `tenant_id`.

### 3.8 Question 8: How are platform administrators handled?
- **Answer:** Platform Administrators have `profiles.is_platform_admin = true`. The security helper functions immediately return `TRUE` for platform administrators, enabling cross-tenant support and global maintenance.

### 3.9 Question 9: How will observation access be restricted?
- **Answer:** Observations are protected by a compound policy:
  1. `tenant_id = auth.current_tenant_id()` (Tenant isolation)
  2. The user has `observations.read_all` (Tenant Admin / Director), OR
  3. The user has `observations.read_scoped` AND is assigned to the observation's `contract_id` or `site_id`, OR
  4. The user has `observations.read_own` AND `observer_id = auth.uid()`.

### 3.10 Question 10: How will tool access be restricted?
- **Answer:**
  - Published tools (`status = 'published'`) are readable by all active users belonging to the tenant.
  - Draft tools (`status = 'draft'`) are readable and editable only by users holding the `tools.create` or `tools.edit_draft` permission.
  - Platform templates (`is_template = true` and `tenant_id IS NULL`) are readable across tenants for cloning purposes.

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
