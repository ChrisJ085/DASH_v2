# DASH V2 - Database & Entity Schema Specification

## Document Control
- **Phase:** Phase 0 (Architecture Definition)
- **Database Engine:** PostgreSQL 15+ (Supabase)
- **Primary Key Standard:** UUID v4 (`gen_random_uuid()`)
- **Timestamp Standard:** ISO 8601 with timezone (`TIMESTAMPTZ`, UTC)
- **Soft Deletion Pattern:** `deleted_at TIMESTAMPTZ NULL` (with partial indexes)

---

## 1. Entity Relationship Overview

The DASH V2 schema is organized into six cohesive domain clusters:
1. **Tenancy & Operational Structure:** `tenants`, `contracts`, `sites`, `contract_sites`
2. **Identity & User Profiles:** `profiles` (linked to `auth.users`)
3. **RBAC & Authorization Scopes:** `roles`, `permissions`, `role_permissions`, `user_roles`, `user_contracts`, `user_sites`
4. **Data-Gathering Tools & Versions:** `tools`, `tool_versions`, `tool_sections`, `tool_questions`, `question_options`
5. **Conditional Logic Engine:** `conditional_rules`, `rule_conditions`
6. **Observation Execution & Responses:** `observations`, `observation_responses`, `observation_photos`, `observation_signatures`
7. **Audit & Governance:** `audit_logs`

---

## 2. Cluster 1: Tenancy & Operational Structure

### 2.1 `tenants`
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

**Indexes:**
- `CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_tenants_status ON tenants(status);`

---

### 2.2 `contracts`
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

**Indexes:**
- `CREATE UNIQUE INDEX idx_contracts_tenant_code ON contracts(tenant_id, code) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_contracts_tenant_id ON contracts(tenant_id);`

---

### 2.3 `sites`
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

**Indexes:**
- `CREATE UNIQUE INDEX idx_sites_tenant_code ON sites(tenant_id, code) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_sites_tenant_id ON sites(tenant_id);`

---

### 2.4 `contract_sites`
Explicit Many-to-Many junction between Contracts and Sites within a Tenant.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique junction identifier |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Denormalized tenant ID for ultra-fast RLS |
| `contract_id` | `UUID` | NOT NULL, FK -> `contracts(id)` ON DELETE CASCADE | Reference to contract |
| `site_id` | `UUID` | NOT NULL, FK -> `sites(id)` ON DELETE CASCADE | Reference to site |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft removal timestamp |

**Indexes & Constraints:**
- `CREATE UNIQUE INDEX idx_contract_sites_unique ON contract_sites(contract_id, site_id) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_contract_sites_site ON contract_sites(site_id);`
- `CREATE INDEX idx_contract_sites_tenant ON contract_sites(tenant_id);`

*Denormalization Justification:* `tenant_id` is included directly in `contract_sites` so that RLS security checks can verify tenant isolation in single-table lookups without performing double-hop joins to `contracts` or `sites`.

---

## 3. Cluster 2: Identity & User Profiles

### 3.1 `profiles`
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

**Indexes:**
- `CREATE UNIQUE INDEX idx_profiles_email ON profiles(email) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_profiles_tenant_id ON profiles(tenant_id);`
- `CREATE INDEX idx_profiles_status ON profiles(status);`

---

## 4. Cluster 3: RBAC & Authorization Scopes

Separates **WHAT** a user can do (Permissions & Roles) from **WHERE** they can do it (Contract & Site Scopes).

### 4.1 `roles`
Named role definitions (Tenant-specific or Platform-system defaults).

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique role identifier |
| `tenant_id` | `UUID` | NULL, FK -> `tenants(id)` ON DELETE CASCADE | NULL = System global template role |
| `code` | `TEXT` | NOT NULL | Canonical code (`tenant_admin`, `observer`, etc.) |
| `name` | `TEXT` | NOT NULL | Human-readable role title |
| `description`| `TEXT` | NULL | Detailed responsibilities of role |
| `is_system` | `BOOLEAN` | NOT NULL, DEFAULT `false` | Immutable system preset flag |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Indexes:**
- `CREATE UNIQUE INDEX idx_roles_tenant_code ON roles(COALESCE(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), code);`

---

### 4.2 `permissions`
Atomic system action entitlements.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique permission identifier |
| `code` | `TEXT` | NOT NULL, UNIQUE | Unique dot-notation code (e.g., `observations.create`) |
| `category` | `TEXT` | NOT NULL | Grouping category (`tenancy`, `tools`, `observations`, etc.) |
| `description`| `TEXT` | NOT NULL | Human explanation of entitlement |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

---

### 4.3 `role_permissions`
Junction mapping Roles to Permissions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Junction ID |
| `role_id` | `UUID` | NOT NULL, FK -> `roles(id)` ON DELETE CASCADE | Reference to role |
| `permission_id`| `UUID` | NOT NULL, FK -> `permissions(id)` ON DELETE CASCADE | Reference to permission |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Indexes:**
- `CREATE UNIQUE INDEX idx_role_permissions_unique ON role_permissions(role_id, permission_id);`

---

### 4.4 `user_roles`
Assigns functional roles to users within their tenant.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Assignment ID |
| `user_id` | `UUID` | NOT NULL, FK -> `profiles(id)` ON DELETE CASCADE | Reference to profile |
| `role_id` | `UUID` | NOT NULL, FK -> `roles(id)` ON DELETE CASCADE | Reference to role |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Indexes:**
- `CREATE UNIQUE INDEX idx_user_roles_unique ON user_roles(user_id, role_id);`
- `CREATE INDEX idx_user_roles_tenant ON user_roles(tenant_id);`

---

### 4.5 `user_contracts` (Scope Restriction)
Specifies which contracts a user is authorized to view or execute observations within. If a user has no records in `user_contracts`, and their role is not a tenant-wide admin role, they are restricted to their explicit contracts.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Assignment ID |
| `user_id` | `UUID` | NOT NULL, FK -> `profiles(id)` ON DELETE CASCADE | Target user |
| `contract_id`| `UUID` | NOT NULL, FK -> `contracts(id)` ON DELETE CASCADE | Authorized contract |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Tenant reference |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Indexes:**
- `CREATE UNIQUE INDEX idx_user_contracts_unique ON user_contracts(user_id, contract_id);`
- `CREATE INDEX idx_user_contracts_lookup ON user_contracts(user_id);`

---

### 4.6 `user_sites` (Scope Restriction)
Specifies which specific sites a user is authorized to access.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Assignment ID |
| `user_id` | `UUID` | NOT NULL, FK -> `profiles(id)` ON DELETE CASCADE | Target user |
| `site_id` | `UUID` | NOT NULL, FK -> `sites(id)` ON DELETE CASCADE | Authorized site |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Tenant reference |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Indexes:**
- `CREATE UNIQUE INDEX idx_user_sites_unique ON user_sites(user_id, site_id);`
- `CREATE INDEX idx_user_sites_lookup ON user_sites(user_id);`

---

## 5. Cluster 4: Data-Gathering Tools & Versions

### 5.1 `tools`
Abstract definition of an observational instrument or audit form.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique tool identifier |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `name` | `TEXT` | NOT NULL | Name (e.g., `MHE Behavioural Observation`) |
| `slug` | `TEXT` | NOT NULL | URL identifier |
| `description`| `TEXT` | NULL | Operational summary |
| `category` | `TEXT` | NOT NULL, DEFAULT `'safety'` | Category (`safety`, `mhe`, `ergonomics`, `audit`) |
| `status` | `TEXT` | NOT NULL, DEFAULT `'draft'` | Lifecycle (`draft`, `published`, `archived`) |
| `is_template`| `BOOLEAN` | NOT NULL, DEFAULT `false` | Marks if saved as an organisation/platform template |
| `origin_template_id` | `UUID` | NULL, FK -> `tools(id)` | Reference to originating template if cloned |
| `created_by` | `UUID` | NULL, FK -> `profiles(id)` | Author |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft deletion timestamp |

**Indexes:**
- `CREATE INDEX idx_tools_tenant ON tools(tenant_id) WHERE deleted_at IS NULL;`

---

### 5.2 `tool_versions`
Immutable version instances of a tool. Once status is `'published'`, this record and its child sections/questions/options/rules become **strictly read-only**.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Version identifier |
| `tool_id` | `UUID` | NOT NULL, FK -> `tools(id)` ON DELETE CASCADE | Parent tool |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `version_number` | `INT` | NOT NULL | Sequential version integer (1, 2, 3...) |
| `status` | `TEXT` | NOT NULL, DEFAULT `'draft'` | Lifecycle (`draft`, `published`, `archived`) |
| `instructions`| `TEXT` | NULL | General instructions shown to observer |
| `settings` | `JSONB` | NOT NULL, DEFAULT `'{}'::jsonb` | Scoring rules, pass/fail thresholds, timer requirements |
| `published_at`| `TIMESTAMPTZ` | NULL | When this version was locked & published |
| `published_by`| `UUID` | NULL, FK -> `profiles(id)` | Publisher user |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Indexes & Constraints:**
- `CREATE UNIQUE INDEX idx_tool_versions_unique ON tool_versions(tool_id, version_number);`
- `CREATE INDEX idx_tool_versions_lookup ON tool_versions(tool_id, status);`

---

### 5.3 `tool_sections`
Logical groupings of questions within a tool version.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Section identifier |
| `tool_version_id` | `UUID` | NOT NULL, FK -> `tool_versions(id)` ON DELETE CASCADE | Parent tool version |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `title` | `TEXT` | NOT NULL | Section heading (e.g., `LGV Security`) |
| `description`| `TEXT` | NULL | Guidance notes |
| `order_index`| `INT` | NOT NULL, DEFAULT `0` | Sequential sort order |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Indexes:**
- `CREATE INDEX idx_tool_sections_version_order ON tool_sections(tool_version_id, order_index);`

---

### 5.4 `tool_questions`
Individual question prompts within a section.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Question identifier |
| `section_id` | `UUID` | NOT NULL, FK -> `tool_sections(id)` ON DELETE CASCADE | Parent section |
| `tool_version_id` | `UUID` | NOT NULL, FK -> `tool_versions(id)` ON DELETE CASCADE | Direct link for fast version traversal |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `question_code` | `TEXT` | NOT NULL | Code identifier (e.g., `LGV_KEYS_REMOVED`) |
| `question_text` | `TEXT` | NOT NULL | Prompt (e.g., `Were the LGV keys removed from the driver?`) |
| `hint_text` | `TEXT` | NULL | Helper text / standard definition |
| `answer_type`| `TEXT` | NOT NULL | Data type (`single_choice`, `multiple_choice`, `text`, `number`, `boolean`, `date`, `time`, `photo`, `signature`, `rating`) |
| `is_required`| `BOOLEAN` | NOT NULL, DEFAULT `true` | Mandatory flag (subject to conditional visibility) |
| `order_index`| `INT` | NOT NULL, DEFAULT `0` | Sequential display order |
| `metadata` | `JSONB` | NOT NULL, DEFAULT `'{}'::jsonb` | Numeric bounds, regex validation, photo limits |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Indexes:**
- `CREATE INDEX idx_tool_questions_section_order ON tool_questions(section_id, order_index);`
- `CREATE INDEX idx_tool_questions_version ON tool_questions(tool_version_id);`

---

### 5.5 `question_options`
Selectable options for `single_choice` or `multiple_choice` questions.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Option identifier |
| `question_id`| `UUID` | NOT NULL, FK -> `tool_questions(id)` ON DELETE CASCADE | Parent question |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `label` | `TEXT` | NOT NULL | User-visible text (e.g., `Live Load`) |
| `value` | `TEXT` | NOT NULL | Value stored in responses (e.g., `live_load`) |
| `score` | `NUMERIC` | NULL | Optional compliance weight/score |
| `is_flagged` | `BOOLEAN` | NOT NULL, DEFAULT `false` | True if choosing this represents a safety violation |
| `order_index`| `INT` | NOT NULL, DEFAULT `0` | Sequential option order |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Indexes:**
- `CREATE INDEX idx_question_options_lookup ON question_options(question_id, order_index);`

---

## 6. Cluster 5: Conditional Logic Engine

Supports declarative rules to dynamically show, hide, or require sections or questions based on earlier responses.

### 6.1 `conditional_rules`
Root rule declaration controlling a target element.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Rule identifier |
| `tool_version_id` | `UUID` | NOT NULL, FK -> `tool_versions(id)` ON DELETE CASCADE | Associated tool version |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `target_type`| `TEXT` | NOT NULL | Target entity type (`question`, `section`) |
| `target_id` | `UUID` | NOT NULL | Target `tool_questions(id)` or `tool_sections(id)` |
| `action` | `TEXT` | NOT NULL | Action to take when condition evaluates to TRUE (`show`, `hide`, `require`) |
| `logical_operator`| `TEXT` | NOT NULL, DEFAULT `'AND'` | Logical combination across conditions (`AND`, `OR`) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Indexes:**
- `CREATE INDEX idx_conditional_rules_version ON conditional_rules(tool_version_id);`
- `CREATE INDEX idx_conditional_rules_target ON conditional_rules(target_type, target_id);`

---

### 6.2 `rule_conditions`
Individual condition clause within a rule.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Condition identifier |
| `rule_id` | `UUID` | NOT NULL, FK -> `conditional_rules(id)` ON DELETE CASCADE | Parent rule |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `source_question_id` | `UUID` | NOT NULL, FK -> `tool_questions(id)` ON DELETE CASCADE | Question whose answer is tested |
| `comparison_operator`| `TEXT` | NOT NULL | Operator (`equals`, `not_equals`, `in`, `not_in`, `greater_than`, `less_than`, `is_empty`, `is_not_empty`) |
| `expected_value`| `JSONB` | NOT NULL | Value tested against (string, array of strings, or number) |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |

**Indexes:**
- `CREATE INDEX idx_rule_conditions_rule ON rule_conditions(rule_id);`
- `CREATE INDEX idx_rule_conditions_source ON rule_conditions(source_question_id);`

---

## 7. Cluster 6: Observation Execution & Responses

Optimized for high transactional volumes (100,000+ observations) and fast analytical querying.

### 7.1 `observations`
The root instance of a completed or in-flight observation run.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Unique observation identifier |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE RESTRICT | Owning tenant |
| `contract_id`| `UUID` | NOT NULL, FK -> `contracts(id)` ON DELETE RESTRICT | Context contract |
| `site_id` | `UUID` | NOT NULL, FK -> `sites(id)` ON DELETE RESTRICT | Context site |
| `tool_id` | `UUID` | NOT NULL, FK -> `tools(id)` ON DELETE RESTRICT | Tool definition |
| `tool_version_id` | `UUID` | NOT NULL, FK -> `tool_versions(id)` ON DELETE RESTRICT | Exact immutable version executed |
| `observer_id`| `UUID` | NOT NULL, FK -> `profiles(id)` ON DELETE RESTRICT | User who performed observation |
| `observed_at`| `TIMESTAMPTZ` | NOT NULL | Operational time observation took place |
| `status` | `TEXT` | NOT NULL, DEFAULT `'in_progress'` | Status (`in_progress`, `completed`, `flagged`, `archived`) |
| `score_percentage`| `NUMERIC(5,2)` | NULL | Calculated compliance score (0.00 to 100.00) |
| `has_flagged_items`| `BOOLEAN`| NOT NULL, DEFAULT `false` | True if any answer triggered a safety flag |
| `summary_notes` | `TEXT` | NULL | General qualitative comments by observer |
| `metadata` | `JSONB` | NOT NULL, DEFAULT `'{}'::jsonb` | Shift, weather, MHE asset ID, device info |
| `completed_at` | `TIMESTAMPTZ` | NULL | Timestamp observation was finalized |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |
| `deleted_at` | `TIMESTAMPTZ` | NULL | Soft deletion timestamp |

**Indexes (Performance Critical):**
- `CREATE INDEX idx_observations_tenant_date ON observations(tenant_id, observed_at DESC) WHERE deleted_at IS NULL;`
- `CREATE INDEX idx_observations_tenant_site ON observations(tenant_id, site_id, observed_at DESC);`
- `CREATE INDEX idx_observations_tenant_contract ON observations(tenant_id, contract_id, observed_at DESC);`
- `CREATE INDEX idx_observations_observer ON observations(observer_id, observed_at DESC);`
- `CREATE INDEX idx_observations_tool_version ON observations(tool_version_id);`
- `CREATE INDEX idx_observations_status ON observations(tenant_id, status);`

---

### 7.2 `observation_responses`
Normalized relational response for each answered question.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Response identifier |
| `observation_id` | `UUID` | NOT NULL, FK -> `observations(id)` ON DELETE CASCADE | Parent observation |
| `question_id` | `UUID` | NOT NULL, FK -> `tool_questions(id)` ON DELETE RESTRICT | Target question |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Denormalized tenant ID for partition/RLS speed |
| `selected_option_id` | `UUID` | NULL, FK -> `question_options(id)` | Selected option for single choice |
| `answer_text` | `TEXT` | NULL | Free text, notes, or chosen option value |
| `answer_numeric` | `NUMERIC` | NULL | Numeric answer |
| `answer_boolean` | `BOOLEAN` | NULL | True/False answer |
| `answer_json` | `JSONB` | NULL | Multi-select values or structured records |
| `is_flagged` | `BOOLEAN` | NOT NULL, DEFAULT `false` | True if this response indicates a violation |
| `comment` | `TEXT` | NULL | Question-specific observer comment |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Response timestamp |
| `updated_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Update timestamp |

**Indexes & Constraints:**
- `CREATE UNIQUE INDEX idx_observation_responses_unique ON observation_responses(observation_id, question_id);`
- `CREATE INDEX idx_observation_responses_question ON observation_responses(question_id);`
- `CREATE INDEX idx_observation_responses_tenant ON observation_responses(tenant_id);`

---

### 7.3 `observation_photos`
Photographic evidence attached to an observation or specific question.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Photo record identifier |
| `observation_id` | `UUID` | NOT NULL, FK -> `observations(id)` ON DELETE CASCADE | Parent observation |
| `question_id` | `UUID` | NULL, FK -> `tool_questions(id)` ON DELETE SET NULL | Optional question association |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `storage_path` | `TEXT` | NOT NULL | Path inside Supabase Storage bucket |
| `file_name` | `TEXT` | NOT NULL | Original uploaded filename |
| `file_size_bytes`| `INT` | NOT NULL | File size in bytes |
| `mime_type` | `TEXT` | NOT NULL | File MIME type (e.g., `image/jpeg`) |
| `caption` | `TEXT` | NULL | Optional caption or note |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Upload timestamp |

**Indexes:**
- `CREATE INDEX idx_observation_photos_obs ON observation_photos(observation_id);`

---

### 7.4 `observation_signatures`
Biometric / digital sign-off records confirming observation accuracy or operator acknowledgment.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Signature record identifier |
| `observation_id` | `UUID` | NOT NULL, FK -> `observations(id)` ON DELETE CASCADE | Parent observation |
| `question_id` | `UUID` | NULL, FK -> `tool_questions(id)` ON DELETE SET NULL | Optional question link |
| `tenant_id` | `UUID` | NOT NULL, FK -> `tenants(id)` ON DELETE CASCADE | Owning tenant |
| `signer_name` | `TEXT` | NOT NULL | Printed full name of signer |
| `signer_role` | `TEXT` | NOT NULL | Role (e.g., `Observer`, `MHE Operator`, `Shift Supervisor`) |
| `storage_path` | `TEXT` | NOT NULL | Vector or PNG path in Storage |
| `signed_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Exact signing timestamp |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Record creation timestamp |

**Indexes:**
- `CREATE INDEX idx_observation_signatures_obs ON observation_signatures(observation_id);`

---

## 8. Cluster 7: Audit & Governance

### 8.1 `audit_logs`
Immutable record of security-critical and operational lifecycle mutations.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | `UUID` | PK, DEFAULT `gen_random_uuid()` | Audit entry ID |
| `tenant_id` | `UUID` | NULL, FK -> `tenants(id)` ON DELETE SET NULL | Nullable for platform admin actions |
| `actor_id` | `UUID` | NULL, FK -> `profiles(id)` ON DELETE SET NULL | User who initiated action |
| `action_type` | `TEXT` | NOT NULL | Canonical action code (`user.invited`, `tool.published`, etc.) |
| `entity_type` | `TEXT` | NOT NULL | Entity (`user`, `role`, `contract`, `tool_version`) |
| `entity_id` | `UUID` | NOT NULL | Targeted primary key |
| `old_state` | `JSONB` | NULL | Pre-mutation state snapshot |
| `new_state` | `JSONB` | NULL | Post-mutation state snapshot |
| `ip_address` | `TEXT` | NULL | Client IP address |
| `user_agent` | `TEXT` | NULL | Client browser / device string |
| `created_at` | `TIMESTAMPTZ` | NOT NULL, DEFAULT `now()` | Event timestamp |

**Indexes:**
- `CREATE INDEX idx_audit_logs_tenant_date ON audit_logs(tenant_id, created_at DESC);`
- `CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);`
- `CREATE INDEX idx_audit_logs_actor ON audit_logs(actor_id, created_at DESC);`
