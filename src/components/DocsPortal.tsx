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
  Laptop,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Boxes,
  MapPin,
} from 'lucide-react';
import { SCHEMA_TABLES, SchemaTable } from '../data/architecture-specs';

type ActiveTab =
  | 'overview'
  | 'schema'
  | 'rbac'
  | 'tool-engine'
  | 'security'
  | 'governance'
  | 'docs';

export default function DocsPortal() {
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

        {/* [REMAINDER OF CONTENT IS THE SAME AS ORIGINAL APP.TSX, TRUNCATED FOR BREVITY] */}
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
        DASH V2 Architecture Specification Portal &bull; Phase 0 Baseline &bull; Supabase PostgreSQL
      </footer>
    </div>
  );
}
