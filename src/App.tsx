/**
 * DASH V2 - Phase 0 Architecture & Engineering Specification Portal
 */

import React, { useState } from 'react';
import {
  Layers,
  Database,
  ShieldCheck,
  Sliders,
  FileText,
  Building2,
  Lock,
  GitBranch,
  Smartphone,
  Laptop,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Workflow,
  Sparkles,
  ExternalLink,
  ChevronRight,
  Boxes,
  Compass,
  MapPin,
} from 'lucide-react';
import { SCHEMA_TABLES, SchemaTable } from './data/architecture-specs';

type ActiveTab =
  | 'overview'
  | 'schema'
  | 'rbac'
  | 'tool-engine'
  | 'security'
  | 'governance'
  | 'docs';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedCluster, setSelectedCluster] = useState<string>('All');
  const [selectedTable, setSelectedTable] = useState<SchemaTable>(SCHEMA_TABLES[0]);

  const clusters = ['All', 'Tenancy & Structure', 'Identity & Auth', 'RBAC & Scope', 'Tool Engine', 'Conditional Logic', 'Observations & Evidence', 'Audit & Governance'];

  const filteredTables = selectedCluster === 'All'
    ? SCHEMA_TABLES
    : SCHEMA_TABLES.filter(t => t.cluster === selectedCluster);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Top Enterprise Banner */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-white font-bold text-lg tracking-wider shadow-sm">
                D2
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg font-bold tracking-tight text-slate-900">DASH V2</h1>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                    Phase 0 : Architecture Definition
                  </span>
                </div>
                <p className="text-xs text-slate-500">
                  Multi-Tenant Behavioural Observation & Configurable Data-Gathering Platform
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <span className="hidden md:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                <Database className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                Backend: Supabase (PostgreSQL 15+)
              </span>
              <span className="hidden sm:inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                Zero-Trust RLS
              </span>
            </div>
          </div>

          {/* Navigation Bar */}
          <nav className="flex space-x-1 overflow-x-auto py-2 border-t border-slate-100 scrollbar-none" aria-label="Architecture Modules">
            {[
              { id: 'overview', label: '1. System Overview', icon: Layers },
              { id: 'schema', label: '2. Database Schema (22 Tables)', icon: Database },
              { id: 'rbac', label: '3. RBAC & Scopes', icon: ShieldCheck },
              { id: 'tool-engine', label: '4. Tool Engine & Logic', icon: Sliders },
              { id: 'security', label: '5. Security & RLS (10 Answers)', icon: Lock },
              { id: 'governance', label: '6. Pre-Phase 1 Decisions', icon: GitBranch },
              { id: 'docs', label: '7. Docs & Specifications', icon: FileText },
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`flex items-center px-3 py-2 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 mr-2 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Phase 0 Scope Guard Warning Notice */}
        <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200 flex items-start space-x-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <p className="font-semibold">Architectural Boundary Enforced (Phase 0 Only)</p>
            <p className="text-amber-800 leading-relaxed">
              Per Phase 0 mandates, full operational dashboards, the visual Tool Builder UI, and live observation engines are intentionally deferred to subsequent phases. This portal serves as the authoritative blueprint, technical schema contracts, and governance sign-off console for subsequent implementation phases.
            </p>
          </div>
        </div>

        {/* TAB 1: SYSTEM OVERVIEW */}
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* Mission Statement */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <div className="max-w-3xl">
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Core Mission</span>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 mt-1">
                  Agnostic, Multi-Tenant Observation Infrastructure
                </h2>
                <p className="mt-3 text-sm text-slate-600 leading-relaxed">
                  DASH V2 enables enterprise organisations (tenants) to configure, publish, and complete structured data-gathering instruments. The platform is strictly domain-agnostic: MHE (Material Handling Equipment) is merely one configurable tool among many, alongside manual handling observations, DSE ergonomics, safety audits, quality checks, and environmental inspections.
                </p>
              </div>

              {/* Central Flow Diagram */}
              <div className="mt-6 p-5 bg-slate-50 rounded-lg border border-slate-200">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-4">
                  Foundational Linear Execution Hierarchy
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                  {[
                    { title: 'DASH Platform', sub: 'Global Infrastructure' },
                    { title: 'Tenant', sub: 'Isolated Organisation' },
                    { title: 'Data Tools', sub: 'Abstract Definitions' },
                    { title: 'Tool Versions', sub: 'Immutable Snapshots' },
                    { title: 'Observations', sub: 'Field Executions' },
                    { title: 'Responses', sub: 'Relational Answers' },
                  ].map((step, idx) => (
                    <div key={idx} className="relative p-3 bg-white rounded-md border border-slate-200 shadow-xs flex flex-col justify-center">
                      <div className="text-xs font-bold text-slate-900">{step.title}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{step.sub}</div>
                      {idx < 5 && (
                        <ArrowRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tenancy & Contract-Site Model */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <Building2 className="w-5 h-5" />
                    <span className="text-xs font-bold uppercase tracking-wider">Multi-Tenant Boundary</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-2">
                    Contract & Site Many-to-Many Architecture
                  </h3>
                  <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                    A physical facility (Site) frequently serves multiple commercial agreements (Contracts). 
                    DASH V2 strictly rejects <code>site → single contract</code>. Both Contracts and Sites belong directly to a Tenant, and share an explicit M:N junction:
                  </p>
                  <div className="mt-4 p-3 bg-slate-50 rounded-md border border-slate-200 font-mono text-xs text-slate-700 space-y-1">
                    <div className="font-semibold text-slate-900">Example: Example Logistics UK</div>
                    <div className="text-slate-600">• Contract A (Retail): Chorley Hub, Warrington Depot</div>
                    <div className="text-slate-600">• Contract B (Industrial): Chorley Hub, Northfleet DC</div>
                    <div className="text-emerald-700 text-[11px] pt-1 font-sans">
                      ✓ Chorley Hub exists once, safely mapped to both Contract A & B.
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>Enforced by: <code>contract_sites</code> table</span>
                  <span className="text-emerald-600 font-medium">Isolated via Tenant RLS</span>
                </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center space-x-2 text-indigo-600">
                    <Boxes className="w-5 h-5" />
                    <span className="text-xs font-bold uppercase tracking-wider">Form Factor Philosophy</span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900 mt-2">
                    Desktop Governance vs. Mobile Field Touch
                  </h3>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-900 mb-1">
                        <Laptop className="w-4 h-4 text-slate-700" />
                        <span>Desktop / Laptop</span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        Governance, RBAC, Contract-Site setup, Tool Builder, Template Library, Analytics & deep reporting.
                      </p>
                    </div>
                    <div className="p-3 bg-slate-50 rounded-md border border-slate-200">
                      <div className="flex items-center space-x-1.5 font-bold text-slate-900 mb-1">
                        <Smartphone className="w-4 h-4 text-slate-700" />
                        <span>Mobile Touch</span>
                      </div>
                      <p className="text-slate-600 text-[11px] leading-relaxed">
                        Rapid single-handed observation runs, 48px+ tap targets, photo capture, signature canvas, offline resilience.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-slate-100 text-xs text-slate-500">
                  <span>Targeted for high observation throughput (100,000+ records)</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DATABASE SCHEMA BROWSER */}
        {activeTab === 'schema' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Relational Database Model</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  22 normalized PostgreSQL tables adhering to strict 3NF with denormalized tenant IDs for high-throughput RLS.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {clusters.map(cluster => (
                  <button
                    key={cluster}
                    onClick={() => setSelectedCluster(cluster)}
                    className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                      selectedCluster === cluster
                        ? 'bg-slate-900 text-white font-medium'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {cluster}
                  </button>
                ))}
              </div>
            </div>

            {/* Schema Split Viewer */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Table List */}
              <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 shadow-xs divide-y divide-slate-100 overflow-hidden">
                <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600">
                  <span>Entities ({filteredTables.length})</span>
                  <span>Cluster</span>
                </div>
                <div className="max-h-[600px] overflow-y-auto divide-y divide-slate-100">
                  {filteredTables.map(t => {
                    const isSelected = selectedTable.name === t.name;
                    return (
                      <button
                        key={t.name}
                        onClick={() => setSelectedTable(t)}
                        className={`w-full text-left p-3 flex items-center justify-between transition-colors ${
                          isSelected ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div>
                          <div className="font-mono text-xs font-bold text-slate-900">{t.name}</div>
                          <div className="text-[11px] text-slate-500 line-clamp-1">{t.description}</div>
                        </div>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 whitespace-nowrap ml-2">
                          {t.columnsCount} cols
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Table Inspector */}
              <div className="lg:col-span-8 bg-white rounded-xl border border-slate-200 shadow-xs p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-200 gap-2">
                  <div>
                    <div className="flex items-center space-x-2">
                      <h3 className="font-mono text-lg font-bold text-slate-900">{selectedTable.name}</h3>
                      <span className="px-2 py-0.5 text-xs rounded bg-slate-100 text-slate-700 font-medium">
                        {selectedTable.cluster}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{selectedTable.description}</p>
                  </div>
                  <div className="flex items-center space-x-2 text-xs">
                    {selectedTable.tenantOwned && (
                      <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium">
                        Tenant-Scoped
                      </span>
                    )}
                    {selectedTable.softDelete && (
                      <span className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 font-medium">
                        Soft Deletion
                      </span>
                    )}
                  </div>
                </div>

                {/* Column Table */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 bg-slate-50/50">
                        <th className="py-2 px-3 font-semibold">Column</th>
                        <th className="py-2 px-3 font-semibold">Type</th>
                        <th className="py-2 px-3 font-semibold">Constraints</th>
                        <th className="py-2 px-3 font-semibold">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono">
                      {selectedTable.columns.map((c, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="py-2 px-3 font-bold text-slate-900">{c.name}</td>
                          <td className="py-2 px-3 text-indigo-700">{c.type}</td>
                          <td className="py-2 px-3 text-slate-600 text-[11px] font-sans">{c.constraints}</td>
                          <td className="py-2 px-3 text-slate-600 font-sans text-[11px]">{c.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Indexes Section */}
                <div className="mt-6 pt-4 border-t border-slate-200">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Key Performance & Security Indexes
                  </h4>
                  <div className="space-y-1.5 font-mono text-[11px] text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-200">
                    {selectedTable.indexes.map((idx, i) => (
                      <div key={i} className="flex items-center space-x-1.5">
                        <span className="text-slate-400">•</span>
                        <span>{idx}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: RBAC & SCOPE MODEL */}
        {activeTab === 'rbac' && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Authorization Framework</span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">Decoupled WHAT vs. WHERE Model</h2>
              <p className="mt-2 text-xs text-slate-600 max-w-3xl leading-relaxed">
                Rather than hard-coding rigid roles like &quot;Warrington Depot MHE Observer&quot;, DASH V2 separates functional capabilities (Roles & Permissions) from operational boundaries (Contracts & Sites).
              </p>

              {/* WHAT vs WHERE Matrix visual */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    1. WHAT You Can Do (Capability)
                  </div>
                  <p className="text-xs text-slate-600 mb-3">
                    Assigned via <code>roles</code>, <code>permissions</code>, and <code>user_roles</code>:
                  </p>
                  <ul className="text-xs text-slate-700 space-y-1.5">
                    <li className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span><strong>Observer:</strong> <code>observations.create</code>, <code>observations.read_own</code></span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span><strong>Site Manager:</strong> <code>observations.read_scoped</code>, <code>reports.view</code></span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span><strong>Tenant Admin:</strong> Full tenant management & tool publication</span>
                    </li>
                  </ul>
                </div>

                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    2. WHERE You Can Do It (Scope)
                  </div>
                  <p className="text-xs text-slate-600 mb-3">
                    Assigned via <code>user_contracts</code> and <code>user_sites</code>:
                  </p>
                  <ul className="text-xs text-slate-700 space-y-1.5">
                    <li className="flex items-center space-x-2">
                      <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span><strong>Site Scope:</strong> Chorley Hub, Warrington Depot</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span><strong>Contract Scope:</strong> Retail Logistics Contract</span>
                    </li>
                    <li className="flex items-center space-x-2">
                      <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span><strong>Tenant Boundary:</strong> Hard database siloing via <code>tenant_id</code></span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Scope Resolution Algorithm Flow */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
                Operational Scope Resolution Algorithm
              </h3>
              <div className="p-4 bg-slate-900 text-slate-100 rounded-lg font-mono text-xs overflow-x-auto space-y-1 leading-relaxed">
                <div className="text-slate-400">// Execution validation for user attempting (Contract C, Site S):</div>
                <div>1. IF user.is_platform_admin == true THEN ALLOW (Platform Bypass)</div>
                <div>2. IF user.tenant_id != target.tenant_id THEN DENY (Tenant Isolation)</div>
                <div>3. IF NOT has_permission(user, &apos;observations.create&apos;) THEN DENY (Missing Permission)</div>
                <div>4. IF user holds role &apos;tenant_admin&apos; THEN ALLOW (Tenant-Wide Scope)</div>
                <div>5. IF user_sites(user, S) OR user_contracts(user, C) THEN ALLOW (Scope Satisfied)</div>
                <div className="text-rose-400">6. ELSE DENY (&apos;User is not authorized for this site/contract&apos;)</div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: TOOL ENGINE & CONDITIONAL LOGIC */}
        {activeTab === 'tool-engine' && (
          <div className="space-y-8">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Instrument Engine</span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">Configurable Tools & Immutable Versions</h2>
              <p className="mt-2 text-xs text-slate-600 max-w-3xl leading-relaxed">
                DASH V2 implements a strict separation between tool configuration and historical observations. Published tool versions are read-only snapshots. If Version 1 has 20 questions and Version 2 adds 2 questions, existing Version 1 observations permanently reflect the 20 questions.
              </p>

              {/* Supported Answer Primitives */}
              <div className="mt-6">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  Ten Core Question Answer Primitives
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs">
                  {[
                    { type: 'single_choice', label: 'Single Choice (Radio/Pill)', desc: 'Mutually exclusive options' },
                    { type: 'multiple_choice', label: 'Multiple Choice', desc: 'Multi-factor checklists' },
                    { type: 'boolean', label: 'Boolean (Yes/No)', desc: 'High-contrast safety gates' },
                    { type: 'text', label: 'Text Field', desc: 'Notes & asset IDs' },
                    { type: 'number', label: 'Numeric Input', desc: 'Weights, speeds, metrics' },
                    { type: 'photo', label: 'Photo Upload', desc: 'Evidence in Supabase Storage' },
                    { type: 'signature', label: 'Signature Canvas', desc: 'Driver/operator sign-off' },
                    { type: 'rating', label: 'Rating Scale', desc: '1-5 compliance scoring' },
                    { type: 'date', label: 'Date Picker', desc: 'Calibration / audit dates' },
                    { type: 'time', label: 'Time Picker', desc: 'Shift / occurrence timing' },
                  ].map((prim, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="font-mono text-xs font-bold text-indigo-700">{prim.type}</div>
                      <div className="font-semibold text-slate-900 mt-0.5">{prim.label}</div>
                      <div className="text-[11px] text-slate-500 mt-1">{prim.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Concrete Conditional Logic Examples */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-4">
                Declarative Conditional Logic Architecture (Examples)
              </h3>
              <p className="text-xs text-slate-600 mb-4">
                Rules must <strong>never</strong> be hard-coded into the frontend. They are stored as structured records in <code>conditional_rules</code> and <code>rule_conditions</code>:
              </p>

              <div className="space-y-4">
                {/* Example 1 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1">
                    <span>Example 1: MHE / Transport Dynamic Question</span>
                    <span className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px]">Action: SHOW question</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">
                    Show question <strong>&quot;Were the LGV keys removed from the driver?&quot;</strong> only when <strong>Operation Type = Live Load</strong>.
                  </p>
                  <div className="font-mono text-[11px] bg-white p-2.5 rounded border border-slate-200 text-slate-800">
                    conditional_rule: &#123; target_type: &apos;question&apos;, target_id: &apos;lgv_keys_q_id&apos;, action: &apos;show&apos; &#125;<br />
                    rule_condition: &#123; source_question_id: &apos;operation_type_q_id&apos;, comparison_operator: &apos;equals&apos;, expected_value: &apos;&quot;live_load&quot;&apos; &#125;
                  </div>
                </div>

                {/* Example 2 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1">
                    <span>Example 2: Safety Violation Escalation</span>
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px]">Action: SHOW question</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">
                    Show question <strong>&quot;Detail PPE Non-Compliance & Corrective Action Taken&quot;</strong> only when <strong>PPE Compliant = No</strong>.
                  </p>
                  <div className="font-mono text-[11px] bg-white p-2.5 rounded border border-slate-200 text-slate-800">
                    conditional_rule: &#123; target_type: &apos;question&apos;, target_id: &apos;ppe_details_q_id&apos;, action: &apos;show&apos; &#125;<br />
                    rule_condition: &#123; source_question_id: &apos;ppe_compliant_q_id&apos;, comparison_operator: &apos;equals&apos;, expected_value: &apos;false&apos; &#125;
                  </div>
                </div>

                {/* Example 3 */}
                <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900 mb-1">
                    <span>Example 3: Compound Multi-Condition Section (AND Logic)</span>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px]">Action: SHOW section</span>
                  </div>
                  <p className="text-xs text-slate-600 mb-2">
                    Show section <strong>&quot;Inbound Goods Inspection&quot;</strong> only when <strong>Area = Goods In</strong> AND <strong>Operation Type = Live Load</strong>.
                  </p>
                  <div className="font-mono text-[11px] bg-white p-2.5 rounded border border-slate-200 text-slate-800">
                    conditional_rule: &#123; target_type: &apos;section&apos;, target_id: &apos;inbound_sec_id&apos;, action: &apos;show&apos;, logical_operator: &apos;AND&apos; &#125;<br />
                    condition_1: &#123; source_question_id: &apos;area_q_id&apos;, operator: &apos;equals&apos;, expected: &apos;&quot;goods_in&quot;&apos; &#125;<br />
                    condition_2: &#123; source_question_id: &apos;operation_q_id&apos;, operator: &apos;equals&apos;, expected: &apos;&quot;live_load&quot;&apos; &#125;
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: SECURITY & RLS (10 ANSWERS) */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Zero-Trust Boundary</span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">Supabase Auth & RLS Architectural Decisions</h2>
              <p className="mt-2 text-xs text-slate-600 max-w-3xl leading-relaxed">
                DASH V2 treats PostgreSQL Row Level Security (RLS) as an uncompromising security boundary. Plaintext passwords are never stored in DASH application tables. Below are the definitive answers to the 10 core RLS design questions.
              </p>
            </div>

            {/* The 10 Answers Accordion Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  q: '1. How does Supabase identify the authenticated user?',
                  a: 'Via JWT bearer token verification. Supabase injects the cryptographically validated user UUID into PostgreSQL session context, queryable through auth.uid().',
                },
                {
                  q: "2. How is the user's profile identified?",
                  a: '1:1 primary key identity mapping where public.profiles.id = auth.users.id. Profiles are loaded instantly with SELECT * FROM profiles WHERE id = auth.uid().',
                },
                {
                  q: '3. How is tenant membership established?',
                  a: 'Through public.profiles.tenant_id. High-speed security helper function auth.current_tenant_id() provides cached, indexed tenant resolution inside policies.',
                },
                {
                  q: '4. How is tenant access enforced?',
                  a: "Every operational table carries a non-nullable tenant_id. Strict RLS policies enforce USING (tenant_id = auth.current_tenant_id()). Cross-tenant leakage is physically impossible.",
                },
                {
                  q: '5. How is contract access enforced?',
                  a: 'Non-admin users must possess a matching record in public.user_contracts linking user_id to contract_id, unless holding tenant-wide admin privileges.',
                },
                {
                  q: '6. How is site access enforced?',
                  a: 'Users must possess a matching record in public.user_sites linking user_id to site_id, or belong to an authorized contract mapped via contract_sites.',
                },
                {
                  q: '7. How do tenant administrators gain broader access?',
                  a: 'Tenant administrators hold the tenant_admin system role, which bypasses specific user_contracts/user_sites filters across all assets within their own tenant_id.',
                },
                {
                  q: '8. How are platform administrators handled?',
                  a: 'Profiles flag is_platform_admin = true. Security helper functions immediately return true, permitting cross-tenant maintenance without hardcoded credentials.',
                },
                {
                  q: '9. How will observation access be restricted?',
                  a: 'Enforced via compound policy: Tenant match + (observations.read_all OR (observations.read_scoped AND within user_sites/user_contracts) OR (observations.read_own AND observer_id = auth.uid())).',
                },
                {
                  q: '10. How will tool access be restricted?',
                  a: "Published tools (status = 'published') are readable by all active tenant users. Draft tools require tools.create or tools.edit_draft permissions. Templates are shareable.",
                },
              ].map((item, idx) => (
                <div key={idx} className="p-4 rounded-lg bg-white border border-slate-200 shadow-xs">
                  <div className="text-xs font-bold text-slate-900 mb-1.5 flex items-start space-x-2">
                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <span>{item.q}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed pl-7">{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: PRE-PHASE 1 DECISION GATES */}
        {activeTab === 'governance' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Architectural Governance</span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">Pre-Phase 1 Confirmation Gates</h2>
              <p className="mt-2 text-xs text-slate-600 max-w-3xl leading-relaxed">
                Before advancing to Phase 1 (Database Migrations & RLS Policy Implementation), the lead architect highlights four core technical decisions for stakeholder approval:
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {[
                {
                  title: '1. User Scope Default Behavior (Restricted vs. Open)',
                  issue: 'What happens when an observer is created without explicit entries in user_contracts or user_sites?',
                  options: [
                    'Option A (Recommended): Default Restricted. User sees 0 sites/contracts until an admin assigns scopes.',
                    'Option B: Default Open. User sees all tenant sites until explicit restrictions are applied.',
                  ],
                  recommendation: 'Adopt Option A to satisfy enterprise zero-trust principles and avoid accidental data capture cross-contamination.',
                },
                {
                  title: '2. Denormalization of tenant_id on Child Entities',
                  issue: 'Should leaf tables like contract_sites, tool_questions, and observation_responses contain tenant_id?',
                  options: [
                    'Option A (Recommended): Denormalize tenant_id. Eliminates 2-hop joins in RLS policies, speeding up high-frequency mobile writes.',
                    'Option B: Pure 3NF normalization without tenant_id. Requires recursive parent joins for RLS checks.',
                  ],
                  recommendation: 'Adopt Option A for sub-10ms response latency on 100,000+ observation datasets.',
                },
                {
                  title: '3. Soft Deletion Scope & Retention Policies',
                  issue: 'Which tables require soft deletion (deleted_at) versus immediate cascading hard deletion?',
                  options: [
                    'Operational tables (contracts, sites, tools, observations, profiles): Soft delete with partial indexes.',
                    'Draft configuration leaves (question_options, rule_conditions): Cascading hard delete upon parent version deletion.',
                  ],
                  recommendation: 'Approved for legal compliance, regulatory safety audits, and tamper-evident history.',
                },
                {
                  title: '4. Offline Mobile Observation Synchronization',
                  issue: 'How should observations captured in subterranean or disconnected warehouse areas sync?',
                  options: [
                    'Strategy: Buffer drafts in browser IndexedDB; perform atomic batch commits upon network reconnection.',
                    'Validation: Re-verify immutable tool version ID before final database commit.',
                  ],
                  recommendation: 'Build local response buffer into Phase 5 Mobile Observation Runner.',
                },
              ].map((gate, idx) => (
                <div key={idx} className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">{gate.title}</h3>
                    <p className="text-xs text-slate-600 mt-2">{gate.issue}</p>
                    <div className="mt-3 space-y-1 text-xs">
                      {gate.options.map((opt, i) => (
                        <div key={i} className="p-2 bg-slate-50 rounded border border-slate-200 text-slate-700">
                          {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 text-xs">
                    <span className="font-semibold text-emerald-700">Architect Recommendation: </span>
                    <span className="text-slate-600">{gate.recommendation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: DOCS BROWSER */}
        {activeTab === 'docs' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Documentation Repository</span>
              <h2 className="text-2xl font-bold text-slate-900 mt-1">Project Documentation Files</h2>
              <p className="mt-2 text-xs text-slate-600 max-w-3xl leading-relaxed">
                The full specifications have been committed to the <code>/docs/</code> directory as the single source of truth for all subsequent engineering phases:
              </p>

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { file: '/docs/ARCHITECTURE.md', title: 'System Architecture', desc: 'Component layering, multi-tenant hierarchy, desktop vs mobile, and 100k+ scaling.' },
                  { file: '/docs/DATABASE.md', title: 'Database & Schema', desc: 'Full 22-table PostgreSQL schema, columns, foreign keys, indexes, and soft deletion.' },
                  { file: '/docs/RBAC.md', title: 'RBAC & Scope Model', desc: 'Separation of WHAT vs WHERE, role catalog, atomic permissions, and scope algorithms.' },
                  { file: '/docs/SECURITY.md', title: 'Security & RLS Strategy', desc: '10 enterprise principles, user invite lifecycle, 10 RLS design answers, and Storage.' },
                  { file: '/docs/TOOL_ENGINE.md', title: 'Tool Engine & Logic', desc: 'Immutable versioning, 10 question types, declarative conditional rules, and templates.' },
                  { file: '/docs/BUILD_STATUS.md', title: 'Build Status & Roadmap', desc: 'Phase 0 completion log, pre-Phase 1 decision gates, and Phases 1-6 roadmap.' },
                ].map((doc, idx) => (
                  <div key={idx} className="p-4 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center space-x-2 text-slate-900 font-bold text-xs">
                        <FileText className="w-4 h-4 text-indigo-600" />
                        <span>{doc.title}</span>
                      </div>
                      <div className="font-mono text-[11px] text-slate-500 mt-1">{doc.file}</div>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">{doc.desc}</p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between text-[11px] text-emerald-700 font-medium">
                      <span>Status: Complete & Committed</span>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        DASH V2 Architecture Specification Portal &bull; Phase 0 Baseline &bull; Supabase PostgreSQL
      </footer>
    </div>
  );
}
