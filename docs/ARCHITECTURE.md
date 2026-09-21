# DASH V2 - System Architecture Specification

## Document Control
- **Phase:** Phase 0.1 (Architecture Corrections & Decisions)
- **Status:** Approved Specification (Supersedes Phase 0 Baseline)
- **Application:** DASH V2 (Behavioural Observation & Data-Gathering Platform)
- **Backend Target:** Supabase (PostgreSQL 15+, Supabase Auth, Storage, Row Level Security)
- **Frontend Target:** React 19, TypeScript, Tailwind CSS, Vite

---

## 1. Product Purpose & Architectural Philosophy

DASH V2 is a **multi-tenant behavioural observation and structured data-gathering platform**. 

The platform allows organisations (tenants) to configure, publish, and execute structured data-gathering instruments to capture behavioural observations, workplace safety audits, compliance assessments, quality inspections, and environmental verifications.

### 1.1 Non-Hardcoded Instrument Agnosticism
A foundational architectural mandate is that **the platform is strictly domain-agnostic**:
- The application is **NOT** an "MHE app" or hard-coded around Material Handling Equipment.
- MHE observation is merely one configuration of a tool instrument.
- The same underlying engine equally powers:
  - MHE behavioural observations
  - Manual handling assessments
  - DSE (Display Screen Equipment) ergonomic audits
  - Safety hazard and near-miss tours
  - Quality assurance and pallet integrity checks
  - Environmental compliance and waste segregation inspections
  - Bespoke tenant-defined operational audits

### 1.2 Core Conceptual Hierarchy
The platform's data and execution flow follows a strict linear hierarchy:

```
DASH PLATFORM
      │
      ▼
   TENANT (Organisation)
      │
      ▼
DATA-GATHERING TOOLS (Abstract definitions & containers)
      │
      ▼
TOOL VERSIONS (Immutable published instruments)
      │
      ▼
 OBSERVATIONS (Execution instances tied to Tenant, Contract, Site, Observer)
      │
      ▼
  RESPONSES (Normalized relational answers, photos, signatures)
```

---

## 2. Multi-Tenant & Organizational Structure

DASH V2 implements **logical multi-tenancy** within a shared Supabase PostgreSQL database, fortified by PostgreSQL Row Level Security (RLS) policies and composite foreign keys. Every tenant-owned entity carries a foreign key to `tenants.id`.

### 2.1 The Contract-Site Relationship Model
In real-world logistics and enterprise operations, a single geographic facility (Site) frequently serves multiple commercial agreements (Contracts), or a single Contract encompasses multiple Sites.

**Crucial Domain Rule:**
- A Site **CANNOT** belong to a single Contract.
- Instead, Contracts and Sites both belong directly to a Tenant, and share an explicit **Many-to-Many** relationship within that Tenant via `contract_sites`.

```
                  TENANT
                ┌───┴───┐
                ▼       ▼
            CONTRACT   SITE
                ▲       ▲
                └───┬───┘
                    │
              CONTRACT_SITES
               (Many-to-Many)
```

#### Real-World Example
Tenant: *Example Logistics UK*
- **Contract A (Retail Logistics):** Chorley Hub, Warrington Depot
- **Contract B (Industrial Logistics):** Chorley Hub, Northfleet Distribution Centre

Here, the *Chorley Hub* site exists once under the Tenant, but participates concurrently in both Contract A and Contract B.

### 2.2 Database-Level Tenant Isolation & Composite Keys
- Application validation improves user experience, but **database constraints must prevent structurally invalid cross-tenant relationships**.
- Parent tables enforce `UNIQUE (tenant_id, id)`.
- Child tables enforce composite foreign keys: `FOREIGN KEY (tenant_id, parent_id) REFERENCES parent(tenant_id, id)`.
- The database physically rejects any attempt to link a Contract from Tenant A to a Site from Tenant B, or an Observation from Tenant A to a Tool from Tenant B.

---

## 3. Technology Stack & Architectural Boundaries

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PRESENTATION TIER                               │
│  React 19 + TypeScript (SPA) + Tailwind CSS + Vite                     │
│  ┌──────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │ Desktop Management Portal    │  │ Mobile Touch Observation Runner │ │
│  │ (Admin, RBAC, Tool Builder,  │  │ (High-contrast, large tap       │ │
│  │  Templates, Analytics)       │  │  targets, photo/sig capture)    │ │
│  └──────────────────────────────┘  └─────────────────────────────────┘ │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / WSS
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA & SECURITY TIER                            │
│  Supabase Platform                                                     │
│  ┌──────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │ Supabase Auth (GoTrue)       │  │ Supabase Storage (S3 API)       │ │
│  │ - Email/Password & Invites   │  │ - Observation Photos            │ │
│  │ - JWT Claims (tenant_id)     │  │ - Signatures                    │ │
│  └──────────────┬───────────────┘  └────────────────┬────────────────┘ │
│                 │                                   │                  │
│                 ▼                                   ▼                  │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ PostgreSQL 15+ Relational Database Engine                         │ │
│  │  ├─ Row Level Security (RLS) Enforcement Layer                    │ │
│  │  ├─ Composite Foreign Key Tenant Isolation                        │ │
│  │  ├─ Normalized Relational Schema (3NF)                            │ │
│  │  ├─ Deterministic Rule Evaluation Primitives                      │ │
│  │  └─ Immutable Versioning & Audit Trigger Pipelines                │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Component Architecture Principles
1. **Separation of Concerns:** Client code handles UI rendering, local state, and touch response. Business access boundaries, tenant isolation, and relational integrity are strictly enforced in PostgreSQL / Supabase RLS.
2. **Deterministic Immutability:** Observation runs bind to frozen, immutable tool versions. An existing version can never be edited in place once published.
3. **No Service-Role Key on the Client:** The Supabase `service_role` key must **NEVER** be bundled into client bundles. Only the public `anon` key is permitted.

---

## 4. Desktop vs. Mobile Paradigms

DASH V2 features a responsive architecture tailored to distinct user roles and operational contexts:

### 4.1 Desktop Experience (Administration & Governance)
- **Target Audience:** Tenant Administrators, Contract Managers, Safety Directors, Auditors.
- **Key Modules:**
  - Tenant Configuration & Branding
  - Contract & Site Many-to-Many Mapping
  - User Invitation & Role/Scope Assignment
  - Configurable Tool Builder & Dependency Engine
  - Template Library & Publishing Pipeline
  - Executive Dashboards & Trend Reporting
- **Design Philosophy:** Dense, efficient information hierarchy, multi-column data tables, bulk operations, deep modal inspectors, keyboard navigation.

### 4.2 Mobile Experience (Field Observation & Capture)
- **Target Audience:** Observers, Team Leaders, Shopfloor Inspectors.
- **Key Modules:**
  - Fast context selector (Contract -> Site -> Tool)
  - Distraction-free, single-question or single-section observation runner
  - Touch-optimized answer selectors (minimum 48px tap targets)
  - Integrated camera & gallery upload for photographic evidence
  - Canvas-based biometric signature capture
  - Offline-tolerant response queueing before database commit
- **Design Philosophy:** Minimalist, high contrast, zero unnecessary chrome, high-speed touch feedback, large typography suitable for warehouse or outdoor industrial lighting.

---

## 5. First-Class Template Architecture

Templates in DASH V2 are managed via a dedicated, first-class entity (`tool_templates`):
- **Catalog Distinction:** Platform templates have `tenant_id IS NULL`; tenant-shared templates carry the owning `tenant_id`.
- **Materialization (Deep Copy) Rule:** Adopting a template performs an atomic deep-clone of all sections, questions, options, and rules into the adopting tenant's private namespace with new UUIDs.
- **Zero Shared Reference:** After adoption, there is no live coupling. Modifications by the adopting tenant do not impact the source template or any other tenant.

---

## 6. Scale & High-Volume Strategy (100,000+ Observations)

1. **Normalized Storage:** Observations and responses use structured 3NF tables (`observations`, `observation_responses`), avoiding monolithic JSON blobs that hinder indexing.
2. **Composite Indexing:** Targeted indexes on `(tenant_id, site_id, observed_at DESC)` and `(tenant_id, contract_id, observed_at DESC)` accelerate filtering.
3. **Omission of Un-displayed Questions:** Questions hidden by conditional rules do not generate empty rows in `observation_responses`, optimizing disk usage and preventing ambiguous states.
4. **Binary Separation:** Photographs and signatures are stored in Supabase Storage with relational metadata pointers in `observation_photos` and `observation_signatures`.

---

## 7. Phase 0.1 Architecture Review Summary

During Phase 0.1, the lead architect and engineering team reviewed the Phase 0 baseline and instituted six core corrections:

1. **RBAC & Scope Model Clarification:** Decoupled Permission (WHAT) from Scope (WHERE). Specified that combining Contract and Site scopes operates as a **strict intersection (restriction)**, preventing unauthorized cross-depot access.
2. **Database-Level Cross-Tenant Integrity:** Replaced simple foreign keys with composite foreign keys `(tenant_id, parent_id)` on all relational child tables.
3. **First-Class Templates:** Replaced the `is_template` boolean flag with a dedicated `tool_templates` entity and defined adoption as an atomic deep-clone operation.
4. **Tool Version Immutability:** Enforced the `draft -> published -> archived` lifecycle with database triggers preventing updates to published versions.
5. **Declarative Rule Engine Hardening:** Specified actions (`show`, `hide`, `require`), operator mapping, HIDE-overrides-SHOW precedence, and automatic clearing of dependent data when controlling answers change.
6. **Observation Response Model:** Enforced one response per question, omitted un-displayed questions, and eliminated redundant question text snapshots by binding directly to immutable tool versions.
