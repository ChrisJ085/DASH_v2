# DASH v2 — Observation & Capture Engine Specification (Phase 5)

## 1. Overview & Architecture Objectives

The **Mobile Observation & Capture Engine** provides the operational runtime for executing shopfloor data gathering against immutable published tool versions (`tool_version_id`).

### Key Architectural Principles
1. **Tool Definition vs. Observation Separation**: A tool definition dictates what questions can be asked; an observation records what actually occurred at a specific moment in time.
2. **Immutable Version Binding**: Every observation binds permanently to a specific `tool_version_id`. Publishing subsequent tool versions (v2, v3) never alters historical observations or changes their definition schema.
3. **Normalized Relational Data**: Observation responses are stored in normalized relational tables (`observations`, `observation_responses`, `observation_photos`, `observation_signatures`), never as monolithic unstructured JSON blobs.
4. **Strict Scope & Tenant Isolation**: An observer can only execute observations against contracts and sites within their assigned operational scope (`user_contracts` and `user_sites`).

---

## 2. Observation Lifecycle & States

Observations follow an explicit state transition machine:

```text
[ Start Draft ] 
      │
      ▼
 status = 'in_progress'  <─── (Draft Persistence: edit answers, upload photos, save signatures)
      │
      ▼
[ Validate & Submit ]
      │
      ▼
 status = 'completed'    <─── (Locked: RLS blocks any post-submission updates or edits)
```

- **`in_progress` (Draft)**: Created when an observer begins an execution. The observer can edit answers, capture photos/signatures, leave the runner, and resume without losing progress.
- **`completed` (Submitted)**: Finalized via the transactional `public.submit_observation` RPC. Once completed, RLS policies restrict any further `UPDATE` or `DELETE` operations on the observation and its child response records, guaranteeing historical immutability.

---

## 3. Relational Schema & Unique Constraints

### Tables
1. **`public.observations`**: Header table recording metadata (`tenant_id`, `observer_id`, `contract_id`, `site_id`, `tool_id`, `tool_version_id`, `status`, `observed_at`, `completed_at`).
2. **`public.observation_responses`**: Stores normalized question answers (`observation_id`, `question_id`, `selected_option_id`, `answer_text`, `answer_numeric`, `answer_boolean`, `answer_json`).
   - **`uq_obs_responses_obs_q`**: Enforces `UNIQUE (observation_id, question_id)`. Upsert operations safely update existing answer rows without creating duplicate rows.
3. **`public.observation_photos`**: Relational metadata for photo evidence (`observation_id`, `question_id`, `storage_path`, `file_name`, `file_size_bytes`, `mime_type`, `caption`).
4. **`public.observation_signatures`**: Relational metadata for captured signatures (`observation_id`, `question_id`, `signer_name`, `signer_role`, `storage_path`, `signed_at`).

---

## 4. Conditional Engine & Dynamic Requiredness

The runtime reuses the Phase 4 conditional engine (`evaluateToolVisibility` in `/src/lib/rule-evaluation.ts`) to calculate active questions in real time:

- **Instant Re-evaluation**: Changing an answer immediately triggers re-evaluation of all dependent target rules and clause conditions.
- **Hidden Questions Excluded**: Hidden questions are automatically marked as non-required and excluded from active submission payloads.
- **Conflict Resolution**: `HIDE` rules override `SHOW` rules. `SHOW` rules operate as a union. Questions in hidden sections are pruned automatically.

---

## 5. Storage Architecture & Security

Photos and signatures are stored in Supabase Storage with strict tenant isolation:

- **Storage Buckets**:
  - `observation-photos` (private)
  - `observation-signatures` (private)
- **Path Structure**: `{tenant_id}/{observation_id}/{filename}`
- **Storage RLS Policies**:
  - `SELECT`: Allowed only if the file's first folder path matches `public.current_tenant_id()` and the user has access to the parent observation.
  - `INSERT`: Allowed only if the first path segment matches `public.current_tenant_id()`, the user has `observations.create` or `observations.edit_in_progress` permissions, and the parent observation status is `'in_progress'`.

---

## 6. Transactional Submission & Idempotency

Observations are submitted using the hardened stored procedure:
```sql
public.submit_observation(p_observation_id UUID)
```
- Validates authentic session identity and tenant boundary.
- Verifies operational scope for contract and site.
- Updates `status = 'completed'` and `completed_at = now()`.
- Writes an immutable audit entry to `public.audit_logs`.
- Implements submission idempotency: attempting to submit an already finalized observation throws an explicit exception (`Observation is already finalized`).
