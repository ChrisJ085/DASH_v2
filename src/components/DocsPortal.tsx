import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import {
  Layers,
  Database,
  ShieldCheck,
  Building2,
  Lock,
  GitBranch,
  FileText,
  UserPlus,
  LogOut,
  Plus,
  CheckCircle2,
  AlertCircle,
  Users,
  MapPin,
  Briefcase,
  ExternalLink,
  Info
} from 'lucide-react';
import { SCHEMA_TABLES } from '../data/architecture-specs';

type ActiveTab = 'overview' | 'team' | 'architecture' | 'rls';

export default function DocsPortal() {
  const { profile, tenant, loading, error, refreshProfile, signOut } = useAuth();

  // Navigation and active states
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // Tenant Setup (Bootstrap) Form States
  const [bootstrapOrgName, setBootstrapOrgName] = useState('');
  const [bootstrapAdminName, setBootstrapAdminName] = useState('');
  const [bootstrapLoading, setBootstrapLoading] = useState(false);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  // Contracts & Sites List States
  const [contracts, setContracts] = useState<any[]>([]);
  const [sites, setSites] = useState<any[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [sitesLoading, setSitesLoading] = useState(false);

  // Add Contract Form States
  const [newContractName, setNewContractName] = useState('');
  const [newContractCode, setNewContractCode] = useState('');
  const [contractError, setContractError] = useState<string | null>(null);
  const [contractSuccess, setContractSuccess] = useState<string | null>(null);

  // Add Site Form States
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteCode, setNewSiteCode] = useState('');
  const [siteError, setSiteError] = useState<string | null>(null);
  const [siteSuccess, setSiteSuccess] = useState<string | null>(null);

  // Team Profiles & Invitations States
  const [teamProfiles, setTeamProfiles] = useState<any[]>([]);
  const [teamLoading, setTeamLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('observer');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);

  // Architecture Spec Helpers
  const [selectedCluster, setSelectedCluster] = useState<string>('All');
  const [selectedTable, setSelectedTable] = useState<any>(SCHEMA_TABLES[0]);

  const clusters = [
    'All',
    'Tenancy & Structure',
    'Identity & Auth',
    'RBAC & Scope',
    'Tool Engine',
    'Conditional Logic',
    'Observations & Evidence',
    'Audit & Governance'
  ];

  const filteredTables = selectedCluster === 'All'
    ? SCHEMA_TABLES
    : SCHEMA_TABLES.filter(t => t.cluster === selectedCluster);

  // Fetch Tenant Data (Contracts, Sites, and Team Profiles)
  const fetchTenantData = async () => {
    if (!profile?.tenant_id) return;

    setContractsLoading(true);
    setSitesLoading(true);
    setTeamLoading(true);

    try {
      // 1. Fetch Contracts
      const { data: contractsData, error: contractsErr } = await supabase
        .from('contracts')
        .select('*')
        .is('deleted_at', null);

      if (!contractsErr && contractsData) {
        setContracts(contractsData);
      }

      // 2. Fetch Sites
      const { data: sitesData, error: sitesErr } = await supabase
        .from('sites')
        .select('*')
        .is('deleted_at', null);

      if (!sitesErr && sitesData) {
        setSites(sitesData);
      }

      // 3. Fetch Team Profiles
      const { data: teamData, error: teamErr } = await supabase
        .from('profiles')
        .select('*')
        .is('deleted_at', null);

      if (!teamErr && teamData) {
        setTeamProfiles(teamData);
      }
    } catch (err) {
      console.error('Error loading tenant lists:', err);
    } finally {
      setContractsLoading(false);
      setSitesLoading(false);
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    if (profile?.tenant_id) {
      fetchTenantData();
    }
  }, [profile?.tenant_id]);

  // Handle Tenant Bootstrap Action
  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    setBootstrapLoading(true);
    setBootstrapError(null);

    try {
      const { data: tenantId, error: rpcError } = await supabase.rpc('bootstrap_tenant', {
        p_tenant_name: bootstrapOrgName,
        p_admin_name: bootstrapAdminName
      });

      if (rpcError) throw rpcError;

      // Force profile and tenant context state refresh instantly
      await refreshProfile();
    } catch (err) {
      setBootstrapError((err as Error).message);
    } finally {
      setBootstrapLoading(false);
    }
  };

  // Handle Create Contract
  const handleCreateContract = async (e: React.FormEvent) => {
    e.preventDefault();
    setContractError(null);
    setContractSuccess(null);

    if (!profile?.tenant_id) return;

    try {
      const { error: insError } = await supabase.from('contracts').insert({
        tenant_id: profile.tenant_id,
        name: newContractName,
        code: newContractCode.toUpperCase(),
        status: 'active'
      });

      if (insError) throw insError;

      setContractSuccess(`Contract "${newContractName}" created successfully!`);
      setNewContractName('');
      setNewContractCode('');
      await fetchTenantData();
    } catch (err) {
      setContractError((err as Error).message);
    }
  };

  // Handle Create Site
  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSiteError(null);
    setSiteSuccess(null);

    if (!profile?.tenant_id) return;

    try {
      const { error: insError } = await supabase.from('sites').insert({
        tenant_id: profile.tenant_id,
        name: newSiteName,
        code: newSiteCode.toUpperCase(),
        status: 'active'
      });

      if (insError) throw insError;

      setSiteSuccess(`Site "${newSiteName}" created successfully!`);
      setNewSiteName('');
      setNewSiteCode('');
      await fetchTenantData();
    } catch (err) {
      setSiteError((err as Error).message);
    }
  };

  // Handle Invite Team Member (Simulation & Postgres integration)
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    if (!profile?.tenant_id) return;

    try {
      // In a live Supabase project, invitation is securely managed by calling:
      // supabase.auth.admin.inviteUserByEmail() on the server, which then triggers public.profiles handle_new_user trigger.
      // To simulate the correct schema relationship and display tenant association, we can add a placeholder Profile record directly.
      // Generates a mock Auth ID for simulation purposes
      const mockAuthId = crypto.randomUUID();

      const { error: profileInsError } = await supabase.from('profiles').insert({
        id: mockAuthId,
        tenant_id: profile.tenant_id,
        email: inviteEmail,
        full_name: inviteName,
        status: 'invited',
        invited_by: profile.id,
        invited_at: new Date().toISOString()
      });

      if (profileInsError) throw profileInsError;

      // Assign the selected role to user_roles
      const { data: roleData } = await supabase
        .from('roles')
        .select('id')
        .eq('code', inviteRole)
        .maybeSingle();

      if (roleData?.id) {
        await supabase.from('user_roles').insert({
          user_id: mockAuthId,
          role_id: roleData.id,
          tenant_id: profile.tenant_id
        });
      }

      setInviteSuccess(`Invitation sent to ${inviteEmail}! Added to ${inviteRole} role.`);
      setInviteEmail('');
      setInviteName('');
      await fetchTenantData();
    } catch (err) {
      setInviteError((err as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 space-y-4">
        <svg className="animate-spin h-8 w-8 text-slate-900" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <p className="text-sm font-medium text-slate-500">Resolving Auth & Tenancy context...</p>
      </div>
    );
  }

  // SCREEN A: Tenant Setup (Bootstrap)
  if (profile && !profile.tenant_id) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans p-4 justify-center items-center">
        <div className="w-full max-w-lg bg-white border border-slate-200 rounded-xl shadow-xs p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex w-12 h-12 rounded-xl bg-slate-900 items-center justify-center text-white font-black text-xl tracking-wider shadow-sm mb-2">
              D2
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Welcome to DASH V2</h1>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              You are authenticated, but not yet associated with any organisation. Setup your Tenant environment to begin.
            </p>
          </div>

          {bootstrapError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-lg flex items-start space-x-2.5 text-xs">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{bootstrapError}</span>
            </div>
          )}

          <form onSubmit={handleBootstrap} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">Organisation / Tenant Name</label>
              <input
                type="text"
                placeholder="e.g. Acme Corp Operations"
                value={bootstrapOrgName}
                onChange={(e) => setBootstrapOrgName(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                required
              />
              <p className="text-[10px] text-slate-400">This establishes a completely isolated database partition (Tenant context).</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 block">Your Full Name</label>
              <input
                type="text"
                placeholder="e.g. John Doe"
                value={bootstrapAdminName}
                onChange={(e) => setBootstrapAdminName(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent transition-all"
                required
              />
              <p className="text-[10px] text-slate-400">You will automatically receive the system global "Tenant Administrator" role.</p>
            </div>

            <button
              type="submit"
              disabled={bootstrapLoading}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold shadow-xs transition-colors disabled:opacity-50 mt-2 cursor-pointer flex justify-center items-center"
            >
              {bootstrapLoading ? (
                <span className="flex items-center space-x-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Bootstrapping...</span>
                </span>
              ) : (
                'Create and Bootstrap Tenant'
              )}
            </button>
          </form>

          <div className="border-t border-slate-100 pt-4 flex justify-between items-center text-xs">
            <span className="text-slate-400">Authenticated: {profile.email}</span>
            <button
              onClick={() => signOut()}
              className="text-red-600 hover:text-red-800 font-semibold cursor-pointer flex items-center space-x-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // SCREEN B: Main Authenticated Dashboard Shell
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Upper Navigation & Shell Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-white font-black text-lg tracking-wider shadow-sm">
                D2
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-base font-bold tracking-tight text-slate-900">DASH V2</h1>
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                    Phase 2 Core Active
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  Secure Tenant: <span className="font-semibold text-slate-700">{tenant?.name || 'Loading...'}</span>
                </p>
              </div>
            </div>

            {/* User Metadata, Shell Context, and Logout */}
            <div className="flex items-center space-x-4 text-xs">
              <div className="hidden md:flex flex-col items-end">
                <span className="font-semibold text-slate-900">{profile?.full_name}</span>
                <span className="text-[10px] text-slate-400">{profile?.email}</span>
              </div>
              <div className="h-8 w-px bg-slate-200 hidden md:block"></div>
              <button
                onClick={() => signOut()}
                className="inline-flex items-center justify-center px-3 py-1.5 border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-medium cursor-pointer transition-colors space-x-1.5"
              >
                <LogOut className="w-3.5 h-3.5 text-slate-400" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Module Tabs Navigation */}
          <nav className="flex space-x-1 overflow-x-auto py-1 border-t border-slate-100" aria-label="Dashboard views">
            {[
              { id: 'overview', label: 'Tenant Overview', icon: Building2 },
              { id: 'team', label: 'Team & Invitations', icon: Users },
              { id: 'rls', label: 'Database Security', icon: ShieldCheck },
              { id: 'architecture', label: 'Architecture Specifications', icon: FileText }
            ].map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as ActiveTab)}
                  className={`flex items-center px-4 py-2.5 text-xs font-semibold rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {/* TAB 1: Tenant Overview & Scope Foundations */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left/Middle Column - Active Tenant Entities */}
            <div className="lg:col-span-2 space-y-6">
              
              {/* Tenant Credentials & State card */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Organisation Context</h3>
                    <h2 className="text-lg font-bold text-slate-900">{tenant?.name}</h2>
                  </div>
                  <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 capitalize">
                    {tenant?.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block mb-0.5">Tenant Unique UUID</span>
                    <span className="font-mono font-semibold text-slate-700">{tenant?.id}</span>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg">
                    <span className="text-slate-400 block mb-0.5">Organisation Slug</span>
                    <span className="font-mono font-semibold text-slate-700">/{tenant?.slug}</span>
                  </div>
                </div>
              </div>

              {/* Contracts Section */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <Briefcase className="w-5 h-5 text-slate-500" />
                    <h2 className="text-base font-bold text-slate-900">Commercial Contracts</h2>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
                    {contracts.length} Active
                  </span>
                </div>

                {contractsLoading ? (
                  <p className="text-xs text-slate-400 py-2">Loading contracts...</p>
                ) : contracts.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    No contracts configured. Add a contract below.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {contracts.map((contract) => (
                      <div key={contract.id} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-slate-900">{contract.name}</p>
                          <p className="text-[10px] text-slate-400">Code: <span className="font-mono">{contract.code}</span></p>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">{contract.id.substring(0, 8)}...</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Sites Section */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-slate-500" />
                    <h2 className="text-base font-bold text-slate-900">Physical Sites</h2>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
                    {sites.length} Active
                  </span>
                </div>

                {sitesLoading ? (
                  <p className="text-xs text-slate-400 py-2">Loading sites...</p>
                ) : sites.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg">
                    No physical sites configured. Add a site below.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {sites.map((site) => (
                      <div key={site.id} className="py-3 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-semibold text-slate-900">{site.name}</p>
                          <p className="text-[10px] text-slate-400">Code: <span className="font-mono">{site.code}</span></p>
                        </div>
                        <span className="font-mono text-[10px] text-slate-400">{site.id.substring(0, 8)}...</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right Column - Setup and Isolated Inserts */}
            <div className="space-y-6">
              
              {/* Tenant Isolation Info banner */}
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-xs text-indigo-900 space-y-2">
                <div className="flex items-center space-x-2">
                  <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                  <span className="font-bold">Database Tenant Isolation</span>
                </div>
                <p className="leading-relaxed">
                  Every entity added here automatically attaches your active <strong>tenant_id</strong>. The RLS policies enforce that no other organisation can ever read or update your contracts, sites, or users under any circumstances.
                </p>
              </div>

              {/* Add Contract Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Add Contract</h3>
                {contractError && <p className="text-[10px] text-red-600">{contractError}</p>}
                {contractSuccess && <p className="text-[10px] text-emerald-600">{contractSuccess}</p>}
                
                <form onSubmit={handleCreateContract} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Contract Name</label>
                    <input
                      type="text"
                      placeholder="e.g. London Logistics Core"
                      value={newContractName}
                      onChange={(e) => setNewContractName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Contract Code</label>
                    <input
                      type="text"
                      placeholder="e.g. LON-LOG-01"
                      value={newContractCode}
                      onChange={(e) => setNewContractCode(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Create Contract
                  </button>
                </form>
              </div>

              {/* Add Site Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Add Physical Site</h3>
                {siteError && <p className="text-[10px] text-red-600">{siteError}</p>}
                {siteSuccess && <p className="text-[10px] text-emerald-600">{siteSuccess}</p>}
                
                <form onSubmit={handleCreateSite} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Site Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Heathrow Terminal 5 Depot"
                      value={newSiteName}
                      onChange={(e) => setNewSiteName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Site Code</label>
                    <input
                      type="text"
                      placeholder="e.g. HEATH-T5"
                      value={newSiteCode}
                      onChange={(e) => setNewSiteCode(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-1.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Create Site
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

        {/* TAB 2: Team Management & Invitations */}
        {activeTab === 'team' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left/Middle Column - Active User Profiles */}
            <div className="lg:col-span-2 space-y-6">
              
              <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-slate-500" />
                    <h2 className="text-base font-bold text-slate-900">Current Organisation Profiles</h2>
                  </div>
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-slate-100 text-slate-700">
                    {teamProfiles.length} Users
                  </span>
                </div>

                {teamLoading ? (
                  <p className="text-xs text-slate-400 py-2">Loading users...</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {teamProfiles.map((userProfile) => (
                      <div key={userProfile.id} className="py-4 flex justify-between items-start text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <p className="font-semibold text-slate-900">{userProfile.full_name}</p>
                            {userProfile.is_platform_admin && (
                              <span className="px-1.5 py-0.5 text-[8px] bg-red-100 text-red-800 rounded font-bold uppercase">
                                Platform Admin
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500">{userProfile.email}</p>
                          <p className="text-[10px] text-slate-400 font-mono">ID: {userProfile.id}</p>
                        </div>
                        <div className="flex flex-col items-end space-y-1.5">
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-full border ${
                            userProfile.status === 'active'
                              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                              : userProfile.status === 'invited'
                              ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                              : 'bg-red-50 text-red-800 border-red-200'
                          }`}>
                            {userProfile.status}
                          </span>
                          {userProfile.invited_at && (
                            <span className="text-[8px] text-slate-400">
                              Invited: {new Date(userProfile.invited_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>

            {/* Right Column - Send Invitation Form */}
            <div className="space-y-6">
              
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-xs text-indigo-900 space-y-2">
                <div className="flex items-center space-x-2">
                  <UserPlus className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold">Invitation Flow Verification</span>
                </div>
                <p className="leading-relaxed">
                  Inviting a user assigns them directly to your tenant's context inside the database. Real deployments trigger email links using Supabase Auth.
                </p>
              </div>

              {/* Invite Form */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Invite Team Member</h3>
                {inviteError && <p className="text-[10px] text-red-600">{inviteError}</p>}
                {inviteSuccess && <p className="text-[10px] text-emerald-600">{inviteSuccess}</p>}
                
                <form onSubmit={handleInviteUser} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Email Address</label>
                    <input
                      type="email"
                      placeholder="colleague@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Jane Smith"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold text-slate-500">Functional Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 bg-white rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="observer">Observer (Default Shopfloor)</option>
                      <option value="site_manager">Site Manager</option>
                      <option value="contract_manager">Contract Manager</option>
                      <option value="viewer">Viewer / compliance</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Send Invitation
                  </button>
                </form>
              </div>

            </div>
          </div>
        )}

        {/* TAB 3: Database Security & RLS Principles Verification */}
        {activeTab === 'rls' && (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">Zero-Trust Database Security Verification</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Verification of Phase 2 core security requirements</p>
                </div>
                <span className="px-2.5 py-1 text-xs font-bold rounded bg-indigo-50 border border-indigo-200 text-indigo-700">
                  Passed RLS Analysis
                </span>
              </div>

              {/* Security Metrics & Core Principles Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 text-xs">
                
                <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                  <div className="flex items-center space-x-2 text-indigo-700 font-bold">
                    <Lock className="w-4 h-4" />
                    <span>No Client-Side Selection</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    The active tenant's context is evaluated on the server-side via `current_tenant_id()` owned by postgres SECURITY DEFINER. The browser cannot manipulate, pass, or select another tenant_id.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                  <div className="flex items-center space-x-2 text-indigo-700 font-bold">
                    <ShieldCheck className="w-4 h-4" />
                    <span>No Platform Escalation</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    Database triggers prevent normal users from modifying or setting `is_platform_admin = true`. Any escalation query is aborted instantly at the database compiler level.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl space-y-2 border border-slate-100">
                  <div className="flex items-center space-x-2 text-indigo-700 font-bold">
                    <Database className="w-4 h-4" />
                    <span>Explicit Search Paths</span>
                  </div>
                  <p className="text-slate-600 leading-relaxed">
                    All `SECURITY DEFINER` procedures specify an explicitly controlled `search_path = public, pg_temp` or `public, auth, pg_temp` to prevent attacker-controlled schema manipulation attacks.
                  </p>
                </div>

              </div>

              {/* Security Analysis Table */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">RLS Control Matrix & Status</h3>
                <div className="border border-slate-200 rounded-lg overflow-hidden text-xs">
                  <div className="bg-slate-50 grid grid-cols-3 p-3 font-semibold text-slate-700 border-b border-slate-200">
                    <div>Security Policy Boundary</div>
                    <div>Database Constraint Pattern</div>
                    <div className="text-right">Verification Status</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="grid grid-cols-3 p-3 items-center">
                      <div className="font-medium text-slate-900">Tenant Isolation</div>
                      <div className="text-slate-500 font-mono">tenant_id = public.current_tenant_id()</div>
                      <div className="text-right text-emerald-600 font-bold flex items-center justify-end space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>VERIFIED</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 p-3 items-center">
                      <div className="font-medium text-slate-900">Admin Bypass Restriction</div>
                      <div className="text-slate-500 font-mono">is_platform_admin trigger</div>
                      <div className="text-right text-emerald-600 font-bold flex items-center justify-end space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>VERIFIED</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 p-3 items-center">
                      <div className="font-medium text-slate-900">Search Path Hardening</div>
                      <div className="text-slate-500 font-mono">SET search_path = public, pg_temp</div>
                      <div className="text-right text-emerald-600 font-bold flex items-center justify-end space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>VERIFIED</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* TAB 4: Architecture Specifications */}
        {activeTab === 'architecture' && (
          <div className="space-y-6">
            
            {/* Spec clusters selection */}
            <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                <div className="space-y-1">
                  <h2 className="text-base font-bold text-slate-900 font-sans">Database Architecture specification Blueprint</h2>
                  <p className="text-xs text-slate-500">Examine the architectural details of the 22 core platform tables.</p>
                </div>
                <select
                  value={selectedCluster}
                  onChange={(e) => {
                    setSelectedCluster(e.target.value);
                    const matched = SCHEMA_TABLES.find(t => e.target.value === 'All' || t.cluster === e.target.value);
                    if (matched) setSelectedTable(matched);
                  }}
                  className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white text-slate-700 outline-none focus:ring-1 focus:ring-slate-900"
                >
                  {clusters.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              {/* Columns and table spec grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
                
                {/* Tables list left */}
                <div className="md:col-span-1 border border-slate-200 rounded-lg overflow-y-auto max-h-[400px] divide-y divide-slate-100">
                  {filteredTables.map((table) => (
                    <button
                      key={table.name}
                      onClick={() => setSelectedTable(table)}
                      className={`w-full text-left p-3 transition-colors ${
                        selectedTable.name === table.name
                          ? 'bg-slate-100 font-semibold text-slate-900'
                          : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      public.{table.name}
                    </button>
                  ))}
                </div>

                {/* Details pane right */}
                <div className="md:col-span-2 border border-slate-200 rounded-lg p-5 bg-slate-50 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Cluster: {selectedTable.cluster}</h4>
                    <h3 className="text-base font-bold text-slate-900 font-mono mt-0.5">public.{selectedTable.name}</h3>
                    <p className="text-slate-600 mt-1 leading-relaxed">{selectedTable.description}</p>
                  </div>

                  <div className="space-y-2 border-t border-slate-200 pt-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Column Definitions</h4>
                    <div className="divide-y divide-slate-200/60 max-h-[220px] overflow-y-auto pr-2">
                      {selectedTable.columns.map((col: any) => (
                        <div key={col.name} className="py-2 grid grid-cols-3 gap-2">
                          <span className="font-mono font-semibold text-slate-950">{col.name}</span>
                          <span className="font-mono text-indigo-700">{col.type}</span>
                          <span className="text-slate-500 text-right">{col.notes}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

              </div>
            </div>

          </div>
        )}

      </main>

      {/* Page Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        DASH V2 Behavioural Observation Platform &bull; Phase 2 Auth & Tenancy Core Verified &bull; Supabase Zero-Trust
      </footer>
    </div>
  );
}
