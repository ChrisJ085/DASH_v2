# DASH V2 - Data-Gathering Tool Engine, Conditional Logic & Template Specification

## Document Control
- **Phase:** Phase 0.1 (Architecture Corrections & Decisions)
- **Status:** Approved Specification (Supersedes Phase 0 Baseline)
- **Core Paradigm:** Fully Declarative, Version-Isolated, Immutable Instruments with Materialized Templates

---

## 1. Engine Architecture & Version Immutability Model

DASH V2 strictly decouples instrument authoring from instrument execution.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   AUTHORING DOMAIN                                     │
│                                                                                        │
│   Tool (Container & Metadata)                                                          │
│     │                                                                                  │
│     ├── Version 1 (Status: published - STRICTLY IMMUTABLE)                             │
│     │     ├── Sections & Questions (Frozen relational rows)                            │
│     │     ├── Options & Score Weights                                                  │
│     │     └── Declarative Conditional Rules (Locked)                                   │
│     │                                                                                  │
│     │   Clone Operation (creates independent deep copy)                                │
│     │   ───────────────────────────────────────────────►                               │
│     │                                                                                  │
│     └── Version 2 (Status: draft - EDITABLE)                                           │
│           ├── Added 2 new questions, updated scoring                                   │
│           └── Validated & Published (becomes immutable Version 2)                      │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │ Executed by Observers
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                   EXECUTION DOMAIN                                     │
│                                                                                        │
│   Observation Run (100,000+ records)                                                   │
│     • Foreign Key binds to exact `tool_version_id` executed                            │
│     • Observations conducted under Version 1 permanently reflect Version 1 schema      │
│     • Observations conducted under Version 2 reflect Version 2 schema                  │
│     • Zero historical drift or retrospective distortion                                │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Tool Version Lifecycle States

A tool version moves through three discrete states:

```
┌───────────┐         Publish Validation         ┌─────────────┐         Archive Action         ┌────────────┐
│   draft   ├───────────────────────────────────►│  published  ├───────────────────────────────►│  archived  │
└───────────┘                                    └─────────────┘                                └────────────┘
  Editable                                         Immutable                                      Immutable
  Not runnable in prod                             Runnable by observers                          Historical only
```

1. **`draft`:**
   - Fully editable. Sections, questions, options, and rules can be added, reordered, modified, and deleted.
   - Cannot be executed by observers in production workflows.
   - Can be deleted outright if discarded before publishing.
2. **`published`:**
   - **Strictly immutable.** Read-only snapshot.
   - Available for observation execution by observers within authorized scopes.
   - The database prevents in-place edits, column updates, or deletion of the version and all child records (`tool_sections`, `tool_questions`, `question_options`, `conditional_rules`, `rule_conditions`).
   - The only valid state transition is to `archived`.
3. **`archived`:**
   - Retired from active use.
   - No *new* observations can be initiated against an archived version.
   - All historical observations reference it permanently.
   - Cannot be edited or reopened to draft.

### 1.2 The "Clone -> Edit Draft -> Validate -> Publish" Workflow
To update an existing published tool:
1. The author initiates a clone: `tools.create_version_from(source_version_id)`.
2. The database creates a new `tool_versions` row with:
   - `version_number = MAX(version_number) + 1`
   - `status = 'draft'`
   - A deep-copy of all sections, questions, options, and rules with newly generated UUIDs.
3. The author modifies the draft version in the Tool Builder.
4. The author triggers validation (verifying required questions, unique codes, valid conditional logic).
5. Upon successful validation, the version transitions to `'published'`.

---

## 2. Supported Question & Answer Types

DASH V2 supports ten foundational answer primitives, with strict validation mapping to storage columns in `observation_responses`:

| Type Code | Input UI Component | Storage Field in `observation_responses` | Type Description & Validation |
|---|---|---|---|
| `single_choice` | Segmented pill / Radio group | `selected_option_id`, `answer_text` | Mutually exclusive options defined in `question_options`. |
| `multiple_choice` | Multi-select checkboxes | `answer_json` | Array of selected option UUIDs / values (`["opt-1", "opt-2"]`). |
| `boolean` | High-contrast Yes/No toggle | `answer_boolean` | Binary boolean value (`true` or `false`). |
| `text` | Multi-line or single-line input | `answer_text` | Arbitrary string data (notes, names, vehicle plates). |
| `number` | Numeric keypad / Stepper | `answer_numeric` | Decimal or integer value (weights, speeds, counts). |
| `date` | Native ISO date picker | `answer_text` | ISO 8601 date string (`YYYY-MM-DD`). |
| `time` | Native time picker | `answer_text` | 24-hour time string (`HH:MM`). |
| `rating` | 1-to-5 star or compliance scale | `answer_numeric` | Discrete integer scale value (e.g., 1, 2, 3, 4, 5). |
| `photo` | Camera capture / file picker | Foreign key in `observation_photos` | Photographic evidence stored in Supabase Storage. |
| `signature` | Touch / Stylus canvas | Foreign key in `observation_signatures` | PNG stroke signature stored in Supabase Storage. |

---

## 3. Declarative Conditional Logic Architecture

Conditional logic in DASH V2 is stored relationally in `conditional_rules` and `rule_conditions`. It must **never** be hard-coded into frontend application code.

### 3.1 Relational Architecture & Target Types
- **Target Types (`target_type`):**
  - `'question'`: Controls an individual question prompt (`target_id` points to `tool_questions.id`).
  - `'section'`: Controls an entire section and all questions within it (`target_id` points to `tool_sections.id`).
- **Actions (`action`):**
  - `'show'`: Target is visible only if the condition evaluates to TRUE (default state is hidden).
  - `'hide'`: Target is hidden if the condition evaluates to TRUE (default state is visible).
  - `'require'`: Target becomes mandatory only if the condition evaluates to TRUE (dynamically overrides `tool_questions.is_required`).
- **Logical Operators (`logical_operator`):**
  - `'AND'`: All conditions attached to the rule must evaluate to TRUE.
  - `'OR'`: At least one condition attached to the rule must evaluate to TRUE.

### 3.2 Comparison Operators Mapped to Answer Types

| Operator Code | Supported Answer Types | Evaluation Semantics |
|---|---|---|
| `equals` | `single_choice`, `boolean`, `text`, `number`, `rating`, `date`, `time` | Exact equality: `current_answer == expected_value` |
| `not_equals` | `single_choice`, `boolean`, `text`, `number`, `rating`, `date`, `time` | Inequality: `current_answer != expected_value` |
| `in` | `single_choice`, `multiple_choice`, `text`, `number` | Membership test: `expected_value.includes(current_answer)` |
| `not_in` | `single_choice`, `multiple_choice`, `text`, `number` | Negated membership: `!expected_value.includes(current_answer)` |
| `greater_than` | `number`, `rating`, `date`, `time` | Numeric/chronological ordering: `current_answer > expected_value` |
| `less_than` | `number`, `rating`, `date`, `time` | Numeric/chronological ordering: `current_answer < expected_value` |
| `is_empty` | All answer types | Checks if answer is null, empty string, or unselected |
| `is_not_empty` | All answer types | Checks if answer is populated with a non-null, non-empty value |

### 3.3 Conflict Resolution & Precedence Rules
When multiple rules target the same question or section:
1. **HIDE Overrides SHOW (Pessimistic Safety Default):** If any active rule evaluates to `'hide'`, the target is hidden regardless of any `'show'` rules that evaluate to TRUE.
2. **SHOW Union:** If an element has multiple `'show'` rules (and no active `'hide'` rules), satisfying *any* of the `'show'` rules renders the element visible.
3. **Dynamic Requirement Context:** A `'require'` rule is active **only if the target question is currently visible**. If a question is hidden (or located in a hidden section), it is completely exempt from validation during observation submission.

### 3.4 Behavior When Controlling Answers Change
**CRITICAL OPERATIONAL RULE:** If an observer answers Question A, which reveals dependent Question B, and subsequently changes the answer to Question A such that Question B is hidden again:
- **Immediate Data Deactivation:** Any previously entered response for Question B (and its child photos/signatures) is **immediately cleared and deactivated**.
- **Zero Orphan Responses:** When the observation is submitted, **no response record** will be generated in `observation_responses` for Question B. This prevents orphan answers or stale compliance records from contaminating reporting.

### 3.5 Version Integrity Constraint
A conditional rule and all its child conditions must **ONLY reference questions and sections belonging to the SAME `tool_version_id`**.
- Cross-version dependencies are structurally impossible and strictly prohibited.
- Enforced at the database level by composite foreign keys:
  ```sql
  CONSTRAINT fk_rc_source_question FOREIGN KEY (tool_version_id, source_question_id) 
    REFERENCES tool_questions(tool_version_id, id) ON DELETE CASCADE
  ```

---

## 4. Concrete Domain Logic Examples

### Example 1: Operation Type Dependent Section (Live Load Security)
- **Scenario:** At an ambient logistics facility, if the observer selects "Live Load" as the operation type, an entire safety checklist regarding LGV driver security and keys must appear.
- **Source Question:** `Operation Type` (Code: `OP_TYPE`, Type: `single_choice`)
  - Options: `stand_trailer`, `live_load`, `bulk_delivery`, `outfeed`
- **Target:** Section `LGV Driver & Key Security` (Target Type: `'section'`)
- **Rule Specification:**
  - `target_type`: `'section'`
  - `target_id`: `<UUID of LGV Security Section>`
  - `action`: `'show'`
  - `logical_operator`: `'AND'`
  - `rule_conditions`:
    - `source_question_id`: `<UUID of OP_TYPE Question>`
    - `comparison_operator`: `'equals'`
    - `expected_value`: `"live_load"`
- **Execution Outcome:**
  - If user selects `Stand Trailer`, the `LGV Driver & Key Security` section is hidden.
  - If user selects `Live Load`, the section and all its nested questions appear.
  - If user changes selection from `Live Load` back to `Stand Trailer`, any answers entered in that section are discarded.

### Example 2: Negative Safety Violation Escalation
- **Scenario:** If PPE compliance is marked "No", a mandatory corrective action notes field must be displayed and required.
- **Source Question:** `All Mandatory PPE Worn?` (Code: `PPE_COMPLIANT`, Type: `boolean`)
- **Target:** Question `Detail PPE Non-Compliance & Immediate Action Taken` (Type: `'text'`)
- **Rule Specification:**
  - `target_type`: `'question'`
  - `action`: `'show'`
  - `logical_operator`: `'AND'`
  - `rule_conditions`:
    - `source_question_id`: `<UUID of PPE_COMPLIANT Question>`
    - `comparison_operator`: `'equals'`
    - `expected_value`: `false`

---

## 5. First-Class Platform Template Architecture

Templates allow proven behavioral observation instruments to be shared across tenants without architectural entanglement.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        PLATFORM TEMPLATE CATALOG (tool_templates)                      │
│                                                                                        │
│   Template: "UK Standard MHE Behavioural Observation"                                  │
│     • tenant_id: NULL (Platform global)                                                │
│     • source_tool_version_id: <Frozen Snapshot Version UUID>                           │
│     • visibility: 'platform_public'                                                    │
└───────────────────────────────────────────┬────────────────────────────────────────────┘
                                            │
                     Adoption / Materialization Action (Deep Clone)
                                            │
                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        TENANT A PRIVATE NAMESPACE (Tenant Tools)                       │
│                                                                                        │
│   Tool: "MHE Observation - Northern Hubs"                                              │
│     • tenant_id: 'tenant-a-uuid'                                                       │
│     • Version 1 (Cloned relational copy with independent UUIDs)                        │
│     • Complete local sovereignty: Tenant A can edit, add questions, or modify rules   │
│     • Changes to Tenant A NEVER affect the source template or any other tenant         │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 5.1 Materialization Isolation Rules
1. **Adoption as Deep Clone:** Template adoption is an atomic database operation (`tools_adopt_template`). It creates:
   - A new row in `tools` owned by the adopting tenant.
   - A new row in `tool_versions` (Version 1, status `'draft'`).
   - Cloned copies of all `tool_sections`, `tool_questions`, `question_options`, `conditional_rules`, and `rule_conditions` with freshly minted UUIDs and the adopting `tenant_id`.
2. **Zero Shared Reference:** Once adopted, the new tool operates with complete independence. There is **no live reference, inheritance pointer, or shared state**.
3. **Template Immutability:** Future modifications or archival of the source template do not alter previously adopted tenant tools.
4. **Tenant-to-Tenant Protection:** Tenant A cannot inspect or modify tools adopted or customized by Tenant B.

---

## 6. Concrete Version Lifecycle Scenario

To illustrate how versioning protects audit integrity:

```
Month 1: Tool Version 1 Published
  ├── Contains 15 questions
  └── 100 observations conducted & finalized against Version 1

Month 3: Safety Director requires adding 2 new MHE battery check questions
  ├── Tenant Admin initiates "Create New Version" from Version 1
  ├── Database clones Version 1 into Version 2 (draft)
  ├── Admin adds:
  │     - Question 16: "Battery connector pins inspected?" (boolean)
  │     - Question 17: "Electrolyte levels verified?" (boolean)
  └── Admin validates and publishes Version 2

Month 4: Active Observation Execution
  ├── Observers in the field now execute Version 2 (answering all 17 questions)
  └── Historical observations conducted in Month 1:
        - Permanently link to Version 1 (`tool_version_id = v1`)
        - Exactly 15 questions in historical view
        - Zero missing-data errors or historical distortion
```

---

## 7. Phase 0.1 Decisions: Tool Engine, Versioning & Templates

### Decision 1: First-Class `tool_templates` Entity
- **Decision:** Dedicated `tool_templates` table referencing an immutable source version.
- **Reason:** Separates catalog templates from tenant operational instruments and enables platform and tenant-shared templates.
- **Deferred:** Version-to-version schema merge/migration tool is deferred from V1.
- **Implementation Implication (Phase 1):** Create `tool_templates` table and `tools_adopt_template` deep-clone function.

### Decision 2: Strictly Immutable Published Tool Versions
- **Decision:** Published tool versions cannot be modified in place. Any change requires cloning to a new draft version.
- **Reason:** Essential for compliance audits and historical observation integrity.
- **Deferred:** Automated visual schema diff between versions is deferred to Phase 4.
- **Implementation Implication (Phase 1):** Database triggers prevent UPDATE/DELETE on published versions and their child tables.

### Decision 3: Clear Dependent Data on Condition Invalidation
- **Decision:** Changing a controlling answer clears all responses for dependent questions that become hidden.
- **Reason:** Prevents orphan or ghost data from being submitted in final observation payloads.
- **Deferred:** "Soft stash" of answers for un-hidden questions is deferred.
- **Implementation Implication (Phase 5):** The client observation runner and submission validator will prune hidden questions before generating `observation_responses`.

### Decision 4: Omission of Un-displayed Questions from Database
- **Decision:** No rows are written to `observation_responses` for questions that were not displayed.
- **Reason:** Eliminates ambiguity between "question not answered" and "question not applicable due to conditional rule".
- **Deferred:** None.
- **Implementation Implication (Phase 1/5):** Observation submission schema permits omitted question IDs; validation verifies that omitted questions were legitimately hidden by active rules.
