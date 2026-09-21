# DASH V2 - System Architecture Specification

## Document Control
- **Phase:** Phase 0 (Architecture Definition)
- **Status:** Approved for Baseline
- **Application:** DASH V2 (Behavioural Observation & Data-Gathering Platform)
- **Backend Target:** Supabase (PostgreSQL, Supabase Auth, Storage, Row Level Security)
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
DATA-GATHERING TOOLS (Abstract definitions)
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

DASH V2 implements **logical multi-tenancy** within a shared Supabase PostgreSQL database, fortified by PostgreSQL Row Level Security (RLS) policies. Every tenant-owned entity carries a foreign key to `tenants.id`.

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

### 2.2 Strict Tenant Isolation
- Under no circumstances may a user from Tenant A view, query, or mutate data belonging to Tenant B.
- Tenant isolation is not an application-layer "filter"; it is a database-enforced RLS boundary.
- Cross-tenant queries are structurally disallowed for tenant users.

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
│  │  ├─ Normalized Relational Schema (3NF)                            │ │
│  │  ├─ Deterministic Rule Evaluation Primitives                      │ │
│  │  └─ Immutable Versioning & Audit Trigger Pipelines                │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Component Architecture Principles
1. **Separation of Concerns:** Client code is responsible for UI rendering, input capture, and local state management. Business access boundaries and data validity are strictly verified in PostgreSQL / Supabase RLS.
2. **Deterministic State:** Observation runs must never mutate tool versions. A tool version is an immutable snapshot.
3. **No Service-Role Key on the Client:** The Supabase `service_role` key must **NEVER** be bundled into the React client or environment variables accessible to the browser. Only the public `anon` key is permitted.

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

## 5. Scale & High-Volume Strategy (100,000+ Observations)

DASH V2 is designed to scale effortlessly to hundreds of thousands of observations without degradation:

1. **Normalized vs. Unstructured Storage:**
   - Observations are stored relationally: `observations` -> `observation_responses`.
   - Avoids monolithic JSON blobs that cause locking contention, query bloat, and inability to perform indexed analytical aggregations.
2. **Composite Indexing:**
   - Multi-column indexes on `(tenant_id, site_id, observed_at DESC)` and `(tenant_id, contract_id, observed_at DESC)` ensure rapid filtering for dashboards.
   - Foreign key indexes on all join tables (`contract_sites`, `user_contracts`, `user_sites`, `role_permissions`).
3. **Partitioning Readiness:**
   - The `observations` and `observation_responses` tables are structured with deterministic `tenant_id` and timestamp columns, allowing declarative PostgreSQL table partitioning (by month or year) if data volumes exceed millions of rows.
4. **Binary & Asset Separation:**
   - Heavy binary assets (photos and signatures) are never stored in the database. Only their storage paths, MIME metadata, and dimensions reside in `observation_photos` and `observation_signatures`.
   - Actual files reside in Supabase Storage buckets secured by RLS.

---

## 6. Phase Roadmap & Boundaries

| Phase | Title | Scope & Objectives | Status |
|---|---|---|---|
| **Phase 0** | **Architecture & Foundations** | System Architecture, Data Model, RBAC, Security/RLS, Tool Engine Specs, /docs | **Active (This Phase)** |
| **Phase 1** | **Database & Migration Engine** | PostgreSQL DDL scripts, RLS policies, seeds, schema verification | Planned |
| **Phase 2** | **Auth & Tenancy Core** | Supabase Auth integration, user invitations, profiles, tenant routing | Planned |
| **Phase 3** | **RBAC & Scope Enforcement** | Role management, contract/site assignments, permission guards | Planned |
| **Phase 4** | **Tool Builder & Versioning** | Tool designer, section/question editor, conditional logic engine, publishing | Planned |
| **Phase 5** | **Observation Runner (Mobile & Web)** | Field capture UX, responsive runner, photo/signature upload, offline queue | Planned |
| **Phase 6** | **Analytics, Reporting & Templates** | Aggregation views, export engine, platform template distribution | Planned |
