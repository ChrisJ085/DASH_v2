# DASH V2 - Database & Entity Schema Specification

## Document Control
- **Phase:** Phase 0.1 (Architecture Corrections & Decisions)
- **Status:** Approved Specification (Supersedes Phase 0 Baseline)
- **Database Engine:** PostgreSQL 15+ (Supabase)
- **Primary Key Standard:** UUID v4 (`gen_random_uuid()`)
- **Timestamp Standard:** ISO 8601 with timezone (`TIMESTAMPTZ`, UTC)
- **Soft Deletion Pattern:** `deleted_at TIMESTAMPTZ NULL` (with partial indexes)
- **Integrity Rule:** Application validation improves user experience, but **database constraints must prevent structurally invalid cross-tenant relationships**.

---

## 1. Entity Relationship Overview & Cluster Structure

The schema contains 23 normalized relational entities across seven functional clusters:

1. **Tenancy & Operational Structure:** `tenants`, `contracts`, `sites`, `contract_sites`
2. **Identity & User Profiles:** `profiles` (linked 1:1 to Supabase `auth.users`)
3. **RBAC & Authorization Scopes:** `roles`, `permissions`, `role_permissions`, `user_roles`, `user_contracts`, `user_sites`
4. **Data-Gathering Tools & Versions:** `tools`, `tool_versions`, `tool_sections`, `tool_questions`, `question_options`
5. **First-Class Templates:** `tool_templates`
6. **Conditional Logic Engine:** `conditional_rules`, `rule_conditions`
7. **Observation Execution & Responses:** `observations`, `observation_responses`, `observation_photos`, `observation_signatures`
8. **Audit & Governance:** `audit_logs`

---

## 2. Multi-Tenant Integrity & Composite Foreign Key Strategy

### 2.1 The Cross-Tenant Invalidation Problem
In a simple multi-tenant design, tables store `tenant_id`, `contract_id`, and `site_id`, but each foreign key independently targets `id`:
```sql
-- VULNERABLE DESIGN (Phase 0 Baseline):
contract_id UUID REFERENCES contracts(id)
site_id UUID REFERENCES sites(id)
```
Under this vulnerable pattern, the database allows structurally invalid cross-tenant records:
```text
INSERT INTO observations:
  tenant_id   = Tenant A
  contract_id = Contract belonging to Tenant A
  site_id     = Site belonging to Tenant B  <-- PERMITTED BY ENGINE (Data Leak/Corruption!)
```

### 2.2 The Phase 0.1 Composite Foreign Key Solution
To physically forbid cross-tenant corruption at the PostgreSQL engine level, all parent tables define composite unique keys on `(tenant_id, id)`, and child tables enforce composite foreign keys on `(tenant_id, ...)`.

```sql
-- PARENT TABLE UNIQUE GUARANTEES:
ALTER TABLE contracts ADD CONSTRAINT uq_contracts_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE sites ADD CONSTRAINT uq_sites_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE tools ADD CONSTRAINT uq_tools_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE tool_versions ADD CONSTRAINT uq_tool_versions_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE tool_questions ADD CONSTRAINT uq_tool_questions_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE profiles ADD CONSTRAINT uq_profiles_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE observations ADD CONSTRAINT uq_observations_tenant_id UNIQUE (tenant_id, id);
ALTER TABLE contract_sites ADD CONSTRAINT uq_contract_sites_tenant_composite UNIQUE (tenant_id, contract_id, site_id);

-- CHILD COMPOSITE FOREIGN KEY ENFORCEMENT:
-- In contract_sites:
CONSTRAINT fk_cs_contract FOREIGN KEY (tenant_id, contract_id) REFERENCES contracts(tenant_id, id) ON DELETE CASCADE,
CONSTRAINT fk_cs_site FOREIGN KEY (tenant_id, site_id) REFERENCES sites(tenant_id, id) ON DELETE CASCADE

-- In observations:
CONSTRAINT fk_obs_contract_site FOREIGN KEY (tenant_id, contract_id, site_id) 
  REFERENCES contract_sites(tenant_id, contract_id, site_id) ON DELETE RESTRICT,
CONSTRAINT fk_obs_tool_version FOREIGN KEY (tenant_id, tool_version_id) 
  REFERENCES tool_versions(tenant_id, id) ON DELETE RESTRICT,
CONSTRAINT fk_obs_observer FOREIGN KEY (tenant_id, observer_id) 
  REFERENCES profiles(tenant_id, id) ON DELETE RESTRICT
```

### 2.3 Concrete Cross-Tenant Rejection Example
```sql
-- Given:
-- Tenant A ('11111111-1111-1111-1111-111111111111') owns Contract A ('aaaa-...')
-- Tenant B ('22222222-2222-2222-2222-222222222222') owns Site B ('bbbb-...')

-- Attempting to bind Contract A to Site B in contract_sites:
INSERT INTO contract_sites (tenant_id, contract_id, site_id)
VALUES ('11111111-1111-1111-1111-111111111111', 'aaaa-...', 'bbbb-...');

-- DATABASE RESULT:
-- ERROR: insert or update on table "contract_sites" violates foreign key constraint "fk_cs_site"
-- DETAIL: Key (tenant_id, site_id)=(11111111-1111-1111-1111-111111111111, bbbb-...) 
--         is not present in table "sites".
```
The database rejects the insert without relying on application code.

---

## 3. Cluster 1: Tenancy & Operational Structure

### 3.1 `tenants`
Represents an isolated customer organisation operating on the DASH platform.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique tenant identifier |
| `name` | `TEXT` | NOT NULL | Organisation legal or display name |
| `slug` | `TEXT` | NOT NULL, UNIQUE | URL-safe identifier (e.g., `acme-logistics`) |
| `status` | `TEXT` | NOT NULL, DEFAULT `'active'` | Status (`active`, `suspended`, `archived`) |
| `settings` | `JSONB` | NOT NULL, DEFAULT `'{}'::jsonb` | Tenant-wide settings (branding, timezone, etc.) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Record update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft deletion timestamp |

**Indexes & Constraints:**
- `CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_tenants_status ON tenants(status);`

---

### 3.2 `contracts`
Commercial agreements or client business streams operated by a tenant.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique contract identifier |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `name` | `TEXT` | NOT NULL | Contract display name (e.g., `Retail Operations`) |
| `code` | `TEXT` | NOT NULL | Internal contract code (e.g., `CON-RETAIL-01`) |
| `description`| `TEXT` | NULL | Optional contract scope notes |
| `status` | `TEXT` | NOT NULL, DEFAULT `'active'` | Status (`active`, `inactive`, `closed`) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft deletion timestamp |

**Indexes & Constraints:**
- `CONSTRAINT uq_contracts_tenant_id UNIQUE (tenant_id, id)`
- `CREATE UNIQUE INDEX idx_contracts_tenant_code ON contracts(tenant_id, code) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_contracts_tenant_id ON contracts(tenant_id);`

---

### 3.3 `sites`
Physical or geographic work locations (warehouses, depots, yards, offices) owned by the tenant.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique site identifier |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `name` | `TEXT` | NOT NULL | Site name (e.g., `Chorley Hub`) |
| `code` | `TEXT` | NOT NULL | Site identifier code (e.g., `SIT-CHOR-01`) |
| `address_line1` | `TEXT` | NULL | Street address |
| `city` | `TEXT` | NULL | City / Town |
| `postal_code` | `TEXT` | NULL | Postal / ZIP code |
| `status` | `TEXT` | NOT NULL, DEFAULT `'active'` | Status (`active`, `inactive`, `decommissioned`) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft deletion timestamp |

**Indexes & Constraints:**
- `CONSTRAINT uq_sites_tenant_id UNIQUE (tenant_id, id)`
- `CREATE UNIQUE INDEX idx_sites_tenant_code ON sites(tenant_id, code) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_sites_tenant_id ON sites(tenant_id);`

---

### 3.4 `contract_sites`
Explicit Many-to-Many junction between Contracts and Sites within a Tenant.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique junction identifier |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Denormalized tenant ID |
| `contract_id` | `UUID` | NOT NULL | Reference to contract |
| `site_id` | `UUID` | NOT NULL | Reference to site |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft removal timestamp |

**Integrity Constraints:**
- `CONSTRAINT uq_contract_sites_tenant_composite UNIQUE (tenant_id, contract_id, site_id)`
- `CONSTRAINT fk_cs_contract FOREIGN KEY (tenant_id, contract_id) REFERENCES contracts(tenant_id, id) ON DELETE CASCADE`
- `CONSTRAINT fk_cs_site FOREIGN KEY (tenant_id, site_id) REFERENCES sites(tenant_id, id) ON DELETE CASCADE`
- `CREATE UNIQUE INDEX idx_contract_sites_unique ON contract_sites(contract_id, site_id) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_contract_sites_site ON contract_sites(site_id);`

---

## 4. Cluster 2: Identity & User Profiles

### 4.1 `profiles`
Application user identity linked 1:1 with Supabase Auth (`auth.users`).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, FK -> `auth.users(id)` ON DELETE CASCADE | Mirrors Supabase Auth UUID |
| `tenant_id` | `UUID` | NULL, FK -> `tenants(id)` ON DELETE CASCADE | Associated tenant (NULL for Platform Admins) |
| `email` | `TEXT` | NOT NULL | User contact email |
| `full_name` | `TEXT` | NOT NULL | Display name |
| `phone` | `TEXT` | NULL | Optional telephone number |
| `avatar_url` | `TEXT` | NULL | Optional profile photo URL |
| `status` | `TEXT` | NOT NULL, DEFAULT `'invited'` | Account status (`invited`, `active`, `suspended`) |
| `is_platform_admin` | `BOOLEAN` | NOT NULL, DEFAULT `false` | System-wide administrator bypass flag |
| `invited_by` | `UUID` | NULL, FK -> `profiles(id)` | Inviting administrator |
| `invited_at` | `TIMESTAMPTZ` | NULL | Timestamp of initial invite |
| `last_seen_at`| `TIMESTAMPTZ` | NULL | Last active interaction |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft deletion timestamp |

**Indexes & Constraints:**
- `CONSTRAINT uq_profiles_tenant_id UNIQUE (tenant_id, id)`
- `CREATE UNIQUE INDEX idx_profiles_email ON profiles(email) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);`
- `CREATE INDEX idx_profiles_status ON profiles(status);`

---

## 5. Cluster 3: RBAC & Authorization Scopes

### 5.1 `roles`
Named role definitions (Tenant-specific or Platform-system defaults).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique role identifier |
| `tenant_id` | `UUID` | NULL, FK -> `tenants(id)` ON DELETE CASCADE | NULL = System global role template |
| `code` | `TEXT` | NOT NULL | Canonical code (`tenant_admin`, `observer`, etc.) |
| `name` | `TEXT` | NOT NULL | Human-readable role title |
| `description`| `TEXT` | NULL | Detailed responsibilities of role |
| `is_system` | `BOOLEAN` | NOT NULL, DEFAULT `false` | Immutable system preset flag |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Indexes & Constraints:**
- `CONSTRAINT uq_roles_tenant_id UNIQUE (tenant_id, id)`
- `CREATE UNIQUE INDEX idx_roles_tenant_code ON roles(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);`

---

### 5.2 `permissions`
Atomic system action entitlements.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique permission identifier |
| `code` | `TEXT` | NOT NULL, UNIQUE | Dot-notation code (e.g., `observations.create`) |
| `category` | `TEXT` | NOT NULL | Grouping category (`tenancy`, `tools`, `observations`, etc.) |
| `description`| `TEXT` | NOT NULL | Human explanation of entitlement |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

---

### 5.3 `role_permissions`
Junction mapping Roles to Permissions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Junction ID |
| `role_id` | `UUID` | NOT NULL, FK -> `roles(id)` ON DELETE CASCADE | Reference to role |
| `permission_id`| `UUID` | NOT NULL, FK -> `permissions(id)` ON DELETE CASCADE | Reference to permission |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Indexes & Constraints:**
- `CREATE UNIQUE INDEX idx_role_permissions_unique ON role_permissions(role_id, permission_id);`

---

### 5.4 `user_roles`
Assigns functional roles to users within their tenant.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Assignment ID |
| `user_id` | `UUID` | NOT NULL | Target profile |
| `role_id` | `UUID` | NOT NULL, FK -> `roles(id)` ON DELETE CASCADE | Target role |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Integrity Constraints:**
- `CONSTRAINT fk_ur_user FOREIGN KEY (tenant_id, user_id) REFERENCES profiles(tenant_id, id) ON DELETE CASCADE`
- `CREATE UNIQUE INDEX idx_user_roles_unique ON user_roles(user_id, role_id);`
- `CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);`

---

### 5.5 `user_contracts` (Scope Restriction)
Specifies which commercial contracts a user is authorized to access.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Assignment ID |
| `user_id` | `UUID` | NOT NULL | Target profile |
| `contract_id`| `UUID` | NOT NULL | Authorized contract |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Integrity Constraints:**
- `CONSTRAINT fk_uc_user FOREIGN KEY (tenant_id, user_id) REFERENCES profiles(tenant_id, id) ON DELETE CASCADE`
- `CONSTRAINT fk_uc_contract FOREIGN KEY (tenant_id, contract_id) REFERENCES contracts(tenant_id, id) ON DELETE CASCADE`
- `CREATE UNIQUE INDEX idx_user_contracts_unique ON user_contracts(user_id, contract_id);`
- `CREATE INDEX idx_user_contracts_lookup ON user_contracts(user_id);`

---

### 5.6 `user_sites` (Scope Restriction)
Specifies which physical sites a user is authorized to access.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Assignment ID |
| `user_id` | `UUID` | NOT NULL | Target profile |
| `site_id` | `UUID` | NOT NULL | Authorized site |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Integrity Constraints:**
- `CONSTRAINT fk_us_user FOREIGN KEY (tenant_id, user_id) REFERENCES profiles(tenant_id, id) ON DELETE CASCADE`
- `CONSTRAINT fk_us_site FOREIGN KEY (tenant_id, site_id) REFERENCES sites(tenant_id, id) ON DELETE CASCADE`
- `CREATE UNIQUE INDEX idx_user_sites_unique ON user_sites(user_id, site_id);`
- `CREATE INDEX idx_user_sites_lookup ON user_sites(user_id);`

---

## 6. Cluster 4: Data-Gathering Tools & Versions

### 6.1 `tools`
Abstract container for a data-gathering instrument.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique tool identifier |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `name` | `TEXT` | NOT NULL | Name (e.g., `MHE Behavioural Observation`) |
| `slug` | `TEXT` | NOT NULL | URL-safe slug |
| `description`| `TEXT` | NULL | Operational summary |
| `category` | `TEXT` | NOT NULL, DEFAULT `'safety'` | Category (`safety`, `mhe`, `ergonomics`, `audit`) |
| `status` | `TEXT` | NOT NULL, DEFAULT `'active'` | Container status (`active`, `archived`) |
| `created_by` | `UUID` | NULL | Author |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft deletion timestamp |

**Integrity Constraints:**
- `CONSTRAINT uq_tools_tenant_id UNIQUE (tenant_id, id)`
- `CONSTRAINT fk_tools_creator FOREIGN KEY (tenant_id, created_by) REFERENCES profiles(tenant_id, id) ON DELETE SET NULL`
- `CREATE INDEX idx_tools_tenant ON tools(tenant_id) WHERE deleted_at IS NULL;`

---

### 6.2 `tool_versions`
Version instances of a tool. Once status is `'published'`, this record and its child sections/questions/options/rules become **strictly read-only and immutable**.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Version identifier |
| `tool_id` | `UUID` | NOT NULL | Parent tool |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `version_number` | `INT` | NOT NULL | Sequential version integer (1, 2, 3...) |
| `status` | `TEXT` | NOT NULL, DEFAULT `'draft'` | Lifecycle (`draft`, `published`, `archived`) |
| `instructions`| `TEXT` | NULL | Instructions presented to observer |
| `settings` | `JSONB` | NOT NULL, DEFAULT `'{}'::jsonb` | Scoring rules, pass/fail thresholds, timer flags |
| `published_at`| `TIMESTAMPTZ` | NULL | When this version was locked & published |
| `published_by`| `UUID` | NULL | Publisher user |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Integrity Constraints & Triggers:**
- `CONSTRAINT uq_tool_versions_tenant_id UNIQUE (tenant_id, id)`
- `CONSTRAINT uq_tool_versions_number UNIQUE (tool_id, version_number)`
- `CONSTRAINT fk_tv_tool FOREIGN KEY (tenant_id, tool_id) REFERENCES tools(tenant_id, id) ON DELETE CASCADE`
- `CONSTRAINT fk_tv_publisher FOREIGN KEY (tenant_id, published_by) REFERENCES profiles(tenant_id, id) ON DELETE SET NULL`
- `CONSTRAINT ck_tool_version_status CHECK (status IN ('draft', 'published', 'archived'))`
- **Immutability Enforcement Trigger:** A PostgreSQL trigger (`trg_check_tool_version_immutable`) prevents UPDATE or DELETE of a `tool_versions` row when `status` is already `'published'` or `'archived'` (except for transitioning `published` -> `archived`).

---

### 6.3 `tool_sections`
Logical groupings of questions within a tool version.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Section identifier |
| `tool_version_id` | `UUID` | NOT NULL | Parent tool version |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `title` | `TEXT` | NOT NULL | Section heading (e.g., `LGV Security`) |
| `description`| `TEXT` | NULL | Guidance notes |
| `order_index`| `INT` | NOT NULL, DEFAULT `0` | Sequential sort order |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Integrity Constraints:**
- `CONSTRAINT uq_tool_sections_tenant_id UNIQUE (tenant_id, id)`
- `CONSTRAINT uq_tool_sections_version_id UNIQUE (tool_version_id, id)`
- `CONSTRAINT fk_ts_version FOREIGN KEY (tenant_id, tool_version_id) REFERENCES tool_versions(tenant_id, id) ON DELETE CASCADE`
- `CREATE INDEX idx_tool_sections_version_order ON tool_sections(tool_version_id, order_index);`
- **Child Immutability Trigger:** Trigger rejects INSERT, UPDATE, or DELETE if parent `tool_versions.status != 'draft'`.

---

### 6.4 `tool_questions`
Individual question prompts within a section.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Question identifier |
| `section_id` | `UUID` | NOT NULL | Parent section |
| `tool_version_id` | `UUID` | NOT NULL | Direct link for fast version traversal |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `question_code` | `TEXT` | NOT NULL | Code identifier (e.g., `LGV_KEYS_REMOVED`) |
| `question_text` | `TEXT` | NOT NULL | Prompt text |
| `hint_text` | `TEXT` | NULL | Guidance note / standard definition |
| `answer_type`| `TEXT` | NOT NULL | Answer type primitive (see Section 6.5) |
| `is_required`| `BOOLEAN` | NOT NULL, DEFAULT `true` | Mandatory flag (subject to conditional visibility) |
| `order_index`| `INT` | NOT NULL, DEFAULT `0` | Display order |
| `metadata` | `JSONB` | NOT NULL, DEFAULT `'{}'::jsonb` | Numeric bounds, regex validation, photo limits |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Integrity Constraints:**
- `CONSTRAINT uq_tool_questions_tenant_id UNIQUE (tenant_id, id)`
- `CONSTRAINT uq_tool_questions_version_id UNIQUE (tool_version_id, id)`
- `CONSTRAINT fk_tq_version FOREIGN KEY (tenant_id, tool_version_id) REFERENCES tool_versions(tenant_id, id) ON DELETE CASCADE`
- `CONSTRAINT fk_tq_section FOREIGN KEY (tool_version_id, section_id) REFERENCES tool_sections(tool_version_id, id) ON DELETE CASCADE`
- `CONSTRAINT ck_tq_answer_type CHECK (answer_type IN ('single_choice', 'multiple_choice', 'boolean', 'text', 'number', 'date', 'time', 'photo', 'signature', 'rating'))`
- `CREATE INDEX idx_tool_questions_section_order ON tool_questions(section_id, order_index);`
- `CREATE INDEX idx_tool_questions_version ON tool_questions(tool_version_id);`
- **Child Immutability Trigger:** Trigger rejects changes if parent version is not `'draft'`.

---

### 6.5 `question_options`
Selectable options for `single_choice` or `multiple_choice` questions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Option identifier |
| `question_id`| `UUID` | NOT NULL | Parent question |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `label` | `TEXT` | NOT NULL | Visible display label (e.g., `Live Load`) |
| `value` | `TEXT` | NOT NULL | Internal stored value (e.g., `live_load`) |
| `score` | `NUMERIC` | NULL | Compliance weight/score |
| `is_flagged` | `BOOLEAN` | NOT NULL, DEFAULT `false` | True if selection represents a safety violation |
| `order_index`| `INT` | NOT NULL, DEFAULT `0` | Sequential option order |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Integrity Constraints:**
- `CONSTRAINT uq_question_options_tenant_id UNIQUE (tenant_id, id)`
- `CONSTRAINT fk_qo_question FOREIGN KEY (tenant_id, question_id) REFERENCES tool_questions(tenant_id, id) ON DELETE CASCADE`
- `CREATE INDEX idx_question_options_lookup ON question_options(question_id, order_index);`

---

## 7. Cluster 5: First-Class Templates

### 7.1 `tool_templates`
First-class catalog of reusable templates. Can be platform-curated (`tenant_id IS NULL`) or published by a tenant (`tenant_id` populated) for organizational sharing.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Template identifier |
| `tenant_id` | `UUID` | NULL, FK -> `tenants(id)` ON DELETE CASCADE | NULL = Platform-provided global template |
| `source_tool_version_id` | `UUID` | NOT NULL, FK -> `tool_versions(id)` ON DELETE RESTRICT | The immutable version snapshot source |
| `name` | `TEXT` | NOT NULL | Template display title |
| `description`| `TEXT` | NULL | Detailed scope and guidance |
| `category` | `TEXT` | NOT NULL, DEFAULT `'safety'` | Category (`mhe`, `ergonomics`, `logistics`, `audit`) |
| `visibility` | `TEXT` | NOT NULL, DEFAULT `'private'` | Visibility (`private`, `tenant_shared`, `platform_public`) |
| `created_by` | `UUID` | NULL, FK -> `profiles(id)` | Author |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Integrity Rules:**
- **Materialization Isolation:** Adopting a template performs an atomic deep-clone of sections, questions, options, and rules into the adopting tenant's `tools` and `tool_versions`. There is **NO live reference or shared state**.
- If `source_tool_version_id` is updated or archived, previously adopted tools remain 100% unaffected.

---

## 8. Cluster 6: Conditional Logic Engine

Stores declarative conditional rules. Rules must only reference elements within the **same tool version**.

### 8.1 `conditional_rules`
Root rule declaration controlling visibility or requirement of a target element.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Rule identifier |
| `tool_version_id` | `UUID` | NOT NULL | Associated tool version |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `target_type`| `TEXT` | NOT NULL | Target entity (`question`, `section`) |
| `target_id` | `UUID` | NOT NULL | Target `tool_questions(id)` or `tool_sections(id)` |
| `action` | `TEXT` | NOT NULL | Action when condition evaluates to TRUE (`show`, `hide`, `require`) |
| `logical_operator`| `TEXT` | NOT NULL, DEFAULT `'AND'` | Combination across conditions (`AND`, `OR`) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Integrity Constraints:**
- `CONSTRAINT uq_conditional_rules_tenant_id UNIQUE (tenant_id, id)`
- `CONSTRAINT uq_conditional_rules_version_id UNIQUE (tool_version_id, id)`
- `CONSTRAINT fk_cr_version FOREIGN KEY (tenant_id, tool_version_id) REFERENCES tool_versions(tenant_id, id) ON DELETE CASCADE`
- `CONSTRAINT ck_cr_target_type CHECK (target_type IN ('question', 'section'))`
- `CONSTRAINT ck_cr_action CHECK (action IN ('show', 'hide', 'require'))`
- `CONSTRAINT ck_cr_logical_op CHECK (logical_operator IN ('AND', 'OR'))`
- `CREATE INDEX idx_conditional_rules_version ON conditional_rules(tool_version_id);`
- `CREATE INDEX idx_conditional_rules_target ON conditional_rules(target_type, target_id);`

---

### 8.2 `rule_conditions`
Individual condition clause within a rule.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Condition identifier |
| `rule_id` | `UUID` | NOT NULL | Parent rule |
| `tool_version_id` | `UUID` | NOT NULL | Denormalized version ID to enforce version integrity |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `source_question_id` | `UUID` | NOT NULL | Question whose answer is tested |
| `comparison_operator`| `TEXT` | NOT NULL | Operator (`equals`, `not_equals`, `in`, `not_in`, `greater_than`, `less_than`, `is_empty`, `is_not_empty`) |
| `expected_value`| `JSONB` | NOT NULL | Value tested against |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Version Integrity & Constraints:**
- `CONSTRAINT fk_rc_rule FOREIGN KEY (tool_version_id, rule_id) REFERENCES conditional_rules(tool_version_id, id) ON DELETE CASCADE`
- `CONSTRAINT fk_rc_source_question FOREIGN KEY (tool_version_id, source_question_id) REFERENCES tool_questions(tool_version_id, id) ON DELETE CASCADE`
- `CONSTRAINT ck_rc_operator CHECK (comparison_operator IN ('equals', 'not_equals', 'in', 'not_in', 'greater_than', 'less_than', 'is_empty', 'is_not_empty'))`
- `CREATE INDEX idx_rule_conditions_rule ON rule_conditions(rule_id);`
- *Architectural Note:* By referencing `(tool_version_id, source_question_id)` against `tool_questions(tool_version_id, id)`, the database physically prevents a condition in Version 2 from referencing a question from Version 1.

---

## 9. Cluster 7: Observation Execution & Responses

Optimized for high transactional volumes (100,000+ observations) and fast analytical querying.

### 9.1 `observations`
Root record of an observation run.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique observation identifier |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE RESTRICT | Owning tenant |
| `contract_id`| `UUID` | NOT NULL | Commercial contract |
| `site_id` | `UUID` | NOT NULL | Physical site |
| `tool_id` | `UUID` | NOT NULL | Tool container |
| `tool_version_id` | `UUID` | NOT NULL | Immutable version executed |
| `observer_id`| `UUID` | NOT NULL | Performing user profile |
| `observed_at`| `TIMESTAMPTZ` | NOT NULL | Operational observation timestamp |
| `status` | `TEXT` | NOT NULL, DEFAULT `'in_progress'` | Status (`in_progress`, `completed`, `flagged`, `archived`) |
| `score_percentage`| `NUMERIC(5,2)` | NULL | Calculated compliance score (0.00 to 100.00) |
| `has_flagged_items`| `BOOLEAN`| NOT NULL, DEFAULT `false` | True if any answer triggered a safety flag |
| `summary_notes` | `TEXT` | NULL | Qualitative notes by observer |
| `metadata` | `JSONB` | NOT NULL, DEFAULT `'{}'::jsonb` | Shift, asset ID, environmental context |
| `completed_at` | `TIMESTAMPTZ` | NULL | Completion timestamp |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft deletion timestamp |

**Integrity Constraints & Indexes:**
- `CONSTRAINT uq_observations_tenant_id UNIQUE (tenant_id, id)`
- `CONSTRAINT fk_obs_contract_site FOREIGN KEY (tenant_id, contract_id, site_id) REFERENCES contract_sites(tenant_id, contract_id, site_id) ON DELETE RESTRICT`
- `CONSTRAINT fk_obs_tool_version FOREIGN KEY (tenant_id, tool_version_id) REFERENCES tool_versions(tenant_id, id) ON DELETE RESTRICT`
- `CONSTRAINT fk_obs_observer FOREIGN KEY (tenant_id, observer_id) REFERENCES profiles(tenant_id, id) ON DELETE RESTRICT`
- `CREATE INDEX idx_observations_tenant_date ON observations(tenant_id, observed_at DESC) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_observations_tenant_site ON observations(tenant_id, site_id, observed_at DESC);`
- `CREATE INDEX idx_observations_tenant_contract ON observations(tenant_id, contract_id, observed_at DESC);`
- `CREATE INDEX idx_observations_observer ON observations(observer_id, observed_at DESC);`
- `CREATE INDEX idx_observations_tool_version ON observations(tool_version_id);`
- `CREATE INDEX idx_observations_status ON observations(tenant_id, status);`

---

### 9.2 `observation_responses`
Normalized relational response for each answered question.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Response identifier |
| `observation_id` | `UUID` | NOT NULL | Parent observation |
| `question_id` | `UUID` | NOT NULL | Target question |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Denormalized tenant ID |
| `selected_option_id` | `UUID` | NULL | Selected option for single choice |
| `answer_text` | `TEXT` | NULL | Text answer or selected option value |
| `answer_numeric` | `NUMERIC` | NULL | Numeric answer or score |
| `answer_boolean` | `BOOLEAN` | NULL | True/False answer |
| `answer_json` | `JSONB` | NULL | Array of option values for multi-select |
| `is_flagged` | `BOOLEAN` | NOT NULL, DEFAULT `false` | True if response is a safety violation |
| `comment` | `TEXT` | NULL | Question-specific observer comment |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Response creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Response Semantics & Integrity Rules:**
1. **One Response per Question:** `CONSTRAINT uq_obs_responses_obs_q UNIQUE (observation_id, question_id)`. An observation contains at most one response row per question.
2. **Conditional Questions Omission Rule:** If a question was hidden by conditional logic during the observation run, **NO row is created in `observation_responses`**. An absent row cleanly indicates "not presented / omitted by rule".
3. **Strict Answer Type Storage Constraints:**
   ```sql
   CONSTRAINT ck_resp_storage_validity CHECK (
     -- At least one answer column or comment must be populated
     (selected_option_id IS NOT NULL OR answer_text IS NOT NULL OR 
      answer_numeric IS NOT NULL OR answer_boolean IS NOT NULL OR 
      answer_json IS NOT NULL OR comment IS NOT NULL)
   )
   ```
4. **Historical Question Stability:** Because published `tool_versions` and their `tool_questions` are permanently immutable, duplicating question prompt text or option labels in `observation_responses` is redundant and prohibited. Analytical queries join directly to `tool_questions` via `question_id`.

**Foreign Keys & Indexes:**
- `CONSTRAINT fk_resp_observation FOREIGN KEY (tenant_id, observation_id) REFERENCES observations(tenant_id, id) ON DELETE CASCADE`
- `CONSTRAINT fk_resp_question FOREIGN KEY (tenant_id, question_id) REFERENCES tool_questions(tenant_id, id) ON DELETE RESTRICT`
- `CONSTRAINT fk_resp_option FOREIGN KEY (tenant_id, selected_option_id) REFERENCES question_options(tenant_id, id) ON DELETE SET NULL`
- `CREATE INDEX idx_observation_responses_question ON observation_responses(question_id);`
- `CREATE INDEX idx_observation_responses_tenant ON observation_responses(tenant_id);`

---

### 9.3 `observation_photos`
Photographic evidence attached to an observation or specific question.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Photo record identifier |
| `observation_id` | `UUID` | NOT NULL | Parent observation |
| `question_id` | `UUID` | NULL | Optional question link |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `storage_path` | `TEXT` | NOT NULL | Path inside Supabase Storage bucket |
| `file_name` | `TEXT` | NOT NULL | Original filename |
| `file_size_bytes`| `INT` | NOT NULL | File size in bytes |
| `mime_type` | `TEXT` | NOT NULL | MIME type (e.g., `image/jpeg`) |
| `caption` | `TEXT` | NULL | Observer caption |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Upload timestamp |

**Integrity Constraints:**
- `CONSTRAINT fk_photo_obs FOREIGN KEY (tenant_id, observation_id) REFERENCES observations(tenant_id, id) ON DELETE CASCADE`
- `CREATE INDEX idx_observation_photos_obs ON observation_photos(observation_id);`

---

### 9.4 `observation_signatures`
Biometric / digital sign-off records.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Signature identifier |
| `observation_id` | `UUID` | NOT NULL | Parent observation |
| `question_id` | `UUID` | NULL | Optional question link |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `signer_name` | `TEXT` | NOT NULL | Printed full name |
| `signer_role` | `TEXT` | NOT NULL | Signer role (`Observer`, `MHE Operator`, etc.) |
| `storage_path` | `TEXT` | NOT NULL | Path in Storage bucket |
| `signed_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Timestamp of signing |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Record creation timestamp |

**Integrity Constraints:**
- `CONSTRAINT fk_sig_obs FOREIGN KEY (tenant_id, observation_id) REFERENCES observations(tenant_id, id) ON DELETE CASCADE`
- `CREATE INDEX idx_observation_signatures_obs ON observation_signatures(observation_id);`

---

## 10. Cluster 8: Audit & Governance

### 10.1 `audit_logs`
Immutable record of security-critical and configuration mutations.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Audit entry ID |
| `tenant_id` | `UUID` | NULL, FK -> `tenants(id)` ON DELETE SET NULL | Nullable for platform actions |
| `actor_id` | `UUID` | NULL, FK -> `profiles(id)` ON DELETE SET NULL | Acting user profile |
| `action_type` | `TEXT` | NOT NULL | Canonical action code (`user.invited`, `tool.published`, etc.) |
| `entity_type` | `TEXT` | NOT NULL | Entity type (`user`, `contract`, `tool_version`) |
| `entity_id` | `UUID` | NOT NULL | Target entity primary key |
| `old_state` | `JSONB` | NULL | Pre-mutation state |
| `new_state` | `JSONB` | NULL | Post-mutation state |
| `ip_address` | `TEXT` | NULL | Client IP |
| `user_agent` | `TEXT` | NULL | Client browser/device string |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Event timestamp |

**Indexes:**
- `CREATE INDEX idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC);`
- `CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);`
- `CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);`

---

## 11. Phase 0.1 Decisions: Database Integrity & Response Storage

### Decision 1: Mandatory Composite Foreign Keys for Tenant Integrity
- **Decision:** All operational child tables use composite foreign keys `(tenant_id, parent_id) REFERENCES parent(tenant_id, id)`.
- **Reason:** Prevents structurally invalid cross-tenant foreign key references at the database engine level.
- **Deferred:** None.
- **Implementation Implication (Phase 1):** Include composite unique constraints on all parent tables and composite foreign keys on all child tables in migration DDL.

### Decision 2: First-Class `tool_templates` Entity
- **Decision:** Replace the boolean flag `tools.is_template` with a dedicated `tool_templates` table.
- **Reason:** Separates active operational tools from reusable catalog templates and provides clean ownership (`tenant_id` NULL for platform, UUID for tenant).
- **Deferred:** Automatic template synchronization / upstream push-updates is deferred from V1.
- **Implementation Implication (Phase 1):** Create `tool_templates` table and adoption stored procedure (`tools_adopt_template`).

### Decision 3: Database-Enforced Immutability for Published Versions
- **Decision:** Use PostgreSQL BEFORE UPDATE OR DELETE triggers to lock `tool_versions` and their child rows when `status IN ('published', 'archived')`.
- **Reason:** Ensures historical compliance audits cannot be compromised by UI bugs or direct API calls.
- **Deferred:** Automated version diffing visualizer is deferred to Phase 4 UI.
- **Implementation Implication (Phase 1):** Write `trg_enforce_tool_version_immutability` trigger function in migration DDL.

### Decision 4: Omission of Un-displayed Conditional Responses
- **Decision:** If a question was hidden by conditional logic, no row is inserted into `observation_responses`.
- **Reason:** Eliminates orphan ghost responses, saves disk space, and avoids ambiguous null-states.
- **Deferred:** None.
- **Implementation Implication (Phase 1):** The observation submission payload validator in Phase 1 / Phase 5 will filter out hidden questions before writing to `observation_responses`.
