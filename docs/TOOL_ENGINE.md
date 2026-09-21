# DASH V2 - Data-Gathering Tool Engine & Conditional Logic Specification

## Document Control
- **Phase:** Phase 0 (Architecture Definition)
- **Status:** Approved Specification
- **Core Paradigm:** Fully Configurable, Dynamically Evaluated, Immutable Versioned Instruments

---

## 1. Engine Architecture & Immutability Model

DASH V2 decouples instrument authoring from instrument execution:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AUTHORING DOMAIN                                │
│                                                                        │
│   Tool (Container & Metadata)                                          │
│     │                                                                  │
│     ├── Version 1 (Draft -> Published -> Archived)                     │
│     │     ├── Sections & Questions (Ordered hierarchy)                 │
│     │     ├── Selectable Options & Score Weights                       │
│     │     └── Declarative Conditional Rules                            │
│     │                                                                  │
│     └── Version 2 (Draft -> Published -> Archived)                     │
│           └── Cloned from Version 1, modified, and published           │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Executed by Observer
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        EXECUTION DOMAIN                                │
│                                                                        │
│   Observation Run                                                      │
│     • Binds to: Tenant, Contract, Site, Observer, Observed At          │
│     • Strict Foreign Key to exact immutable Tool Version               │
│     • Normalized Answers stored in `observation_responses`             │
│     • Digital Evidence stored in `observation_photos` & `signatures`   │
└────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Strict Immutability of Published Tool Versions
- Once a tool version transitions from `'draft'` to `'published'`, the database prohibits in-place edits to that version, its sections, questions, options, or conditional rules.
- Historical observations reference the exact `tool_version_id` used when the observation was conducted.
- If Version 1 contains 20 questions and Version 2 adds 2 questions, existing Version 1 observations permanently reflect the 20-question structure.
- Any modification initiates a new draft version (e.g., Version 2), preserving historical audit integrity.

---

## 2. Supported Question & Answer Types

The tool engine supports ten foundational answer primitives:

| Type Code | Input Mechanism | Storage Field in `observation_responses` | Primary Use Case |
|---|---|---|---|
| `single_choice` | Radio buttons / Segmented tabs | `selected_option_id`, `answer_text` | Mutually exclusive choices (e.g., Operation Type) |
| `multiple_choice` | Multi-select checkboxes | `answer_json` (array of option UUIDs) | Multi-factor checklists (e.g., PPE Items Checked) |
| `boolean` | Large high-contrast Yes/No toggle | `answer_boolean` | Binary safety compliance questions |
| `text` | Multi-line text field | `answer_text` | Qualitative descriptions, vehicle registration, notes |
| `number` | Numeric keypad / Stepper | `answer_numeric` | Pallet weights, travel speeds, ambient temperature |
| `date` | Native date picker | `answer_text` (ISO date string) | Expiry dates, equipment calibration dates |
| `time` | Native time picker | `answer_text` (HH:MM string) | Shift start times, incident occurrence times |
| `photo` | Camera capture / file picker | Foreign key link in `observation_photos` | Photographic defect or compliance evidence |
| `signature` | Touch / Stylus canvas | Foreign key link in `observation_signatures` | Driver, operator, or supervisor sign-off |
| `rating` | 1-to-5 star or compliance scale | `answer_numeric` | Subjective standard grading |

---

## 3. Declarative Conditional Logic Architecture

Conditional visibility rules must **never** be hard-coded into frontend code. All dependencies, rules, and branching behaviors are stored as structured relational records in `conditional_rules` and `rule_conditions`.

### 3.1 Relational Representation

```
┌───────────────────────────────────────────────────────────────────┐
│                       conditional_rules                           │
│  - target_type: 'question' | 'section'                            │
│  - target_id: UUID (points to tool_questions or tool_sections)    │
│  - action: 'show' | 'hide' | 'require'                            │
│  - logical_operator: 'AND' | 'OR'                                 │
└─────────────────────────────────┬─────────────────────────────────┘
                                  │ 1 : N
                                  ▼
┌───────────────────────────────────────────────────────────────────┐
│                        rule_conditions                            │
│  - source_question_id: UUID (the question providing the input)    │
│  - comparison_operator: 'equals' | 'not_equals' | 'in' |          │
│                         'not_in' | 'greater_than' | 'less_than' |  │
│                         'is_empty' | 'is_not_empty'               │
│  - expected_value: JSONB ('"live_load"', '["stand","bulk"]', etc.)│
└───────────────────────────────────────────────────────────────────┘
```

### 3.2 Evaluation Algorithm
The client-side observation runner executes a deterministic evaluation pass whenever a response value changes:

```typescript
interface EvaluationContext {
  responses: Record<string, ResponseValue>; // question_id -> current answer
}

function evaluateCondition(condition: RuleCondition, ctx: EvaluationContext): boolean {
  const currentAnswer = ctx.responses[condition.source_question_id];
  if (currentAnswer === undefined || currentAnswer === null) {
    return condition.comparison_operator === 'is_empty';
  }

  switch (condition.comparison_operator) {
    case 'equals':
      return currentAnswer.value === condition.expected_value;
    case 'not_equals':
      return currentAnswer.value !== condition.expected_value;
    case 'in':
      return Array.isArray(condition.expected_value) && 
             condition.expected_value.includes(currentAnswer.value);
    case 'not_in':
      return Array.isArray(condition.expected_value) && 
             !condition.expected_value.includes(currentAnswer.value);
    case 'greater_than':
      return Number(currentAnswer.value) > Number(condition.expected_value);
    case 'less_than':
      return Number(currentAnswer.value) < Number(condition.expected_value);
    case 'is_empty':
      return currentAnswer.value === '' || currentAnswer.value === null;
    case 'is_not_empty':
      return currentAnswer.value !== '' && currentAnswer.value !== null;
    default:
      return false;
  }
}

function evaluateRule(rule: ConditionalRule, ctx: EvaluationContext): boolean {
  if (rule.conditions.length === 0) return true;

  if (rule.logical_operator === 'AND') {
    return rule.conditions.every(c => evaluateCondition(c, ctx));
  } else {
    return rule.conditions.some(c => evaluateCondition(c, ctx));
  }
}
```

### 3.3 Concrete Domain Examples

#### Example 1: Single Question Dependency (MHE / Transport)
- **Source Question:** `Operation Type` (Options: `Stand Trailer`, `Live Load`, `Bulk`, `Outfeed`)
- **Target Question:** `Were the LGV keys removed from the driver?`
- **Rule Specification:**
  - `target_type`: `'question'`
  - `target_id`: `<UUID of LGV Keys Question>`
  - `action`: `'show'`
  - `logical_operator`: `'AND'`
  - `rule_conditions`:
    - `source_question_id`: `<UUID of Operation Type Question>`
    - `comparison_operator`: `'equals'`
    - `expected_value`: `"live_load"`

#### Example 2: Negative Violation Escalation
- **Source Question:** `PPE Compliant?` (Boolean Yes/No)
- **Target Question:** `Detail PPE Non-Compliance & Corrective Action Taken`
- **Rule Specification:**
  - `target_type`: `'question'`
  - `action`: `'show'`
  - `rule_conditions`:
    - `source_question_id`: `<UUID of PPE Question>`
    - `comparison_operator`: `'equals'`
    - `expected_value`: `false`

#### Example 3: Multi-Factor Section Dependency (AND Logic)
- **Source Questions:**
  1. `Operational Area` (e.g., `Goods In`, `Marshalling`, `Picking`)
  2. `Operation Type` (e.g., `Live Load`)
- **Target Section:** `Inbound Live LGV Inspection Section`
- **Rule Specification:**
  - `target_type`: `'section'`
  - `target_id`: `<UUID of Inbound Live LGV Section>`
  - `action`: `'show'`
  - `logical_operator`: `'AND'`
  - `rule_conditions`:
    - Condition 1: `Area` equals `"goods_in"`
    - Condition 2: `Operation Type` equals `"live_load"`

---

## 4. Platform Template Architecture

Templates allow proven observation instruments to be shared across tenants without architectural entanglement.

```
┌────────────────────────────────────────────────────────┐
│                   PLATFORM TEMPLATE                    │
│  - tenant_id: NULL (System Global)                     │
│  - is_template: TRUE                                   │
│  - name: "UK Standard MHE Behavioural Observation"     │
└───────────────────────────┬────────────────────────────┘
                            │ Adopted by Tenant A
                            ▼
┌────────────────────────────────────────────────────────┐
│                      TENANT TOOL                       │
│  - tenant_id: 'tenant-a-uuid'                          │
│  - is_template: FALSE                                  │
│  - origin_template_id: <Platform Template UUID>        │
│  - Version 1 (Independent lifecycle)                   │
└────────────────────────────────────────────────────────┘
```

### 4.1 Independent Versioning & Forking Rules
- When Tenant A adopts a platform template, the system performs a **deep clone** into Tenant A's private namespace.
- Tenant A can modify questions, reorder sections, and adjust conditional logic without modifying the parent template or impacting any other tenant.
- There is no synchronous inheritance or leaky coupling; each tenant owns their tool versions completely.
