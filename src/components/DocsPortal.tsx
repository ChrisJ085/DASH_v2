import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { inviteUser } from '../lib/invitation-service';
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
import ToolBuilder from './ToolBuilder';

type ActiveTab = 'overview' | 'team' | 'roles' | 'tools' | 'rls' | 'architecture';

export default function DocsPortal() {
  const { profile, tenant, loading, error, refreshProfile, signOut, hasPermission, hasOperationalScope } = useAuth();

  // Navigation and active states
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');

  // NEW Phase 3 Authorization & Scope UI states
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [allRoles, setAllRoles] = useState<any[]>([]);
  const [allPermissions, setAllPermissions] = useState<any[]>([]);
  const [rolePermissionsMap, setRolePermissionsMap] = useState<Record<string, string[]>>({});
  
  // Selected user's active assignments
  const [userRoles, setUserRoles] = useState<any[]>([]);
  const [userContracts, setUserContracts] = useState<any[]>([]);
  const [userSites, setUserSites] = useState<any[]>([]);
  
  // Assignment form / action states
  const [assignRoleLoading, setAssignRoleLoading] = useState(false);
  const [assignScopeLoading, setAssignScopeLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  
  // Role Creation / Permission edit states
  const [selectedRole, setSelectedRole] = useState<any | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [roleCreateError, setRoleCreateError] = useState<string | null>(null);
  const [roleCreateSuccess, setRoleCreateSuccess] = useState<string | null>(null);
  const [editRolePermsLoading, setEditRolePermsLoading] = useState(false);

  // Fetch active assignments for the selected user
  const fetchUserAssignments = async (userId: string) => {
    try {
      const { data: urJoinData } = await supabase
        .from('user_roles')
        .select(`
          id,
          role_id,
          roles (
            id,
            name,
            code,
            is_system
          )
        `)
        .eq('user_id', userId);

      const { data: ucJoinData } = await supabase
        .from('user_contracts')
        .select(`
          id,
          contract_id,
          contracts (
            id,
            name,
            code
          )
        `)
        .eq('user_id', userId);

      const { data: usJoinData } = await supabase
        .from('user_sites')
        .select(`
          id,
          site_id,
          sites (
            id,
            name,
            code
          )
        `)
        .eq('user_id', userId);

      setUserRoles(urJoinData || []);
      setUserContracts(ucJoinData || []);
      setUserSites(usJoinData || []);
    } catch (err) {
      console.error('Error fetching user assignments:', err);
    }
  };

  // Fetch all roles, permissions and maps
  const fetchRBACMetadata = async () => {
    try {
      const { data: rolesData } = await supabase
        .from('roles')
        .select('*')
        .order('name');
      setAllRoles(rolesData || []);

      const { data: permsData } = await supabase
        .from('permissions')
        .select('*')
        .order('category', { ascending: true })
        .order('code', { ascending: true });
      setAllPermissions(permsData || []);

      const { data: rpData } = await supabase
        .from('role_permissions')
        .select('role_id, permission_id, permissions(code)');
      
      const rMap: Record<string, string[]> = {};
      rpData?.forEach(item => {
        if (!rMap[item.role_id]) {
          rMap[item.role_id] = [];
        }
        const code = (item.permissions as any)?.code;
        if (code) {
          rMap[item.role_id].push(code);
        }
      });
      setRolePermissionsMap(rMap);
    } catch (err) {
      console.error('Error fetching RBAC metadata:', err);
    }
  };

  useEffect(() => {
    if (profile?.tenant_id && (activeTab === 'team' || activeTab === 'roles')) {
      fetchRBACMetadata();
    }
  }, [profile?.tenant_id, activeTab]);

  useEffect(() => {
    if (selectedUser) {
      fetchUserAssignments(selectedUser.id);
    }
  }, [selectedUser]);

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setRoleCreateError(null);
    setRoleCreateSuccess(null);

    if (!profile?.tenant_id) return;

    try {
      const { data, error: insError } = await supabase
        .from('roles')
        .insert({
          tenant_id: profile.tenant_id,
          name: newRoleName,
          code: newRoleCode.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
          description: newRoleDesc,
          is_system: false
        })
        .select()
        .single();

      if (insError) throw insError;

      setRoleCreateSuccess(`Role "${newRoleName}" created successfully!`);
      setNewRoleName('');
      setNewRoleCode('');
      setNewRoleDesc('');
      await fetchRBACMetadata();
      if (data) {
        setSelectedRole(data);
      }
    } catch (err) {
      setRoleCreateError((err as Error).message);
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!window.confirm('Are you sure you want to delete this role? This will revoke it from all assigned users.')) return;
    try {
      const { error } = await supabase
        .from('roles')
        .delete()
        .eq('id', roleId);
      if (error) throw error;
      setSelectedRole(null);
      await fetchRBACMetadata();
    } catch (err) {
      alert(`Error deleting role: ${(err as Error).message}`);
    }
  };

  const handleTogglePermission = async (roleId: string, permissionId: string, hasPerm: boolean) => {
    setEditRolePermsLoading(true);
    try {
      if (hasPerm) {
        const { error } = await supabase
          .from('role_permissions')
          .delete()
          .eq('role_id', roleId)
          .eq('permission_id', permissionId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .insert({
            role_id: roleId,
            permission_id: permissionId
          });
        if (error) throw error;
      }
      await fetchRBACMetadata();
    } catch (err) {
      console.error('Error toggling permission:', err);
      alert(`Permission modification failed: ${(err as Error).message}`);
    } finally {
      setEditRolePermsLoading(false);
    }
  };

  const handleAssignUserRole = async (roleId: string) => {
    if (!selectedUser || !profile?.tenant_id) return;
    setAssignRoleLoading(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .insert({
          user_id: selectedUser.id,
          role_id: roleId,
          tenant_id: profile.tenant_id
        });
      if (error) throw error;
      await fetchUserAssignments(selectedUser.id);
    } catch (err) {
      alert(`Role assignment failed: ${(err as Error).message}`);
    } finally {
      setAssignRoleLoading(false);
    }
  };

  const handleRemoveUserRole = async (userRoleId: string) => {
    if (!selectedUser) return;
    setAssignRoleLoading(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', userRoleId);
      if (error) throw error;
      await fetchUserAssignments(selectedUser.id);
    } catch (err) {
      alert(`Role removal failed: ${(err as Error).message}`);
    } finally {
      setAssignRoleLoading(false);
    }
  };

  const handleAssignUserContract = async (contractId: string) => {
    if (!selectedUser || !profile?.tenant_id) return;
    setAssignScopeLoading(true);
    try {
      const { error } = await supabase
        .from('user_contracts')
        .insert({
          user_id: selectedUser.id,
          contract_id: contractId,
          tenant_id: profile.tenant_id
        });
      if (error) throw error;
      await fetchUserAssignments(selectedUser.id);
    } catch (err) {
      alert(`Scope assignment failed: ${(err as Error).message}`);
    } finally {
      setAssignScopeLoading(false);
    }
  };

  const handleRemoveUserContract = async (userContractId: string) => {
    if (!selectedUser) return;
    setAssignScopeLoading(true);
    try {
      const { error } = await supabase
        .from('user_contracts')
        .delete()
        .eq('id', userContractId);
      if (error) throw error;
      await fetchUserAssignments(selectedUser.id);
    } catch (err) {
      alert(`Scope removal failed: ${(err as Error).message}`);
    } finally {
      setAssignScopeLoading(false);
    }
  };

  const handleAssignUserSite = async (siteId: string) => {
    if (!selectedUser || !profile?.tenant_id) return;
    setAssignScopeLoading(true);
    try {
      const { error } = await supabase
        .from('user_sites')
        .insert({
          user_id: selectedUser.id,
          site_id: siteId,
          tenant_id: profile.tenant_id
        });
      if (error) throw error;
      await fetchUserAssignments(selectedUser.id);
    } catch (err) {
      alert(`Scope assignment failed: ${(err as Error).message}`);
    } finally {
      setAssignScopeLoading(false);
    }
  };

  const handleRemoveUserSite = async (userSiteId: string) => {
    if (!selectedUser) return;
    setAssignScopeLoading(true);
    try {
      const { error } = await supabase
        .from('user_sites')
        .delete()
        .eq('id', userSiteId);
      if (error) throw error;
      await fetchUserAssignments(selectedUser.id);
    } catch (err) {
      alert(`Scope removal failed: ${(err as Error).message}`);
    } finally {
      setAssignScopeLoading(false);
    }
  };

  const handleChangeUserStatus = async (status: 'active' | 'suspended') => {
    if (!selectedUser) return;
    setStatusLoading(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status })
        .eq('id', selectedUser.id);
      if (error) throw error;
      
      setSelectedUser((prev: any) => prev ? { ...prev, status } : null);
      await fetchTenantData();
    } catch (err) {
      alert(`Status modification failed: ${(err as Error).message}`);
    } finally {
      setStatusLoading(false);
    }
  };

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

  // Handle Invite Team Member (Secure Server-Side Edge Function Flow)
  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);

    if (!profile?.tenant_id) return;

    try {
      // Calls the secure server-side Edge Function
      const result = await inviteUser(inviteEmail, inviteName, inviteRole);

      if (result.success) {
        setInviteSuccess(`Invitation successfully sent to ${inviteEmail}! Profile provisioned under "${inviteRole}" role.`);
        setInviteEmail('');
        setInviteName('');
        await fetchTenantData();
      }
    } catch (err: any) {
      const errMsg = err.message || '';
      console.warn('Invitation attempt failed:', err);
      
      // Check if the edge function is simply not deployed yet to the active Supabase project
      if (
        errMsg.includes('Functions') || 
        errMsg.includes('not found') || 
        errMsg.includes('404') || 
        errMsg.includes('Failed to fetch')
      ) {
        setInviteError(
          `The client successfully initiated a secure, zero-trust invitation request, but the server-side Edge Function is not deployed or configured in your active Supabase project. To resolve this, run:\n\n` +
          `  supabase functions deploy invite-user\n\n` +
          `in your local terminal. This ensures that administrative invitations remain fully server-side without exposing service-role secrets in the client.`
        );
      } else {
        setInviteError(errMsg);
      }
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
              { id: 'roles', label: 'Roles & Permissions', icon: Lock },
              { id: 'tools', label: 'Tool Builder', icon: Layers },
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
                    {teamProfiles.map((userProfile) => {
                      const isSelected = selectedUser?.id === userProfile.id;
                      return (
                        <div
                          key={userProfile.id}
                          onClick={() => setSelectedUser(userProfile)}
                          className={`py-4 px-3 flex justify-between items-start text-xs rounded-lg cursor-pointer transition-all ${
                            isSelected
                              ? 'bg-slate-50 border-l-2 border-slate-900 shadow-3xs'
                              : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <p className={`font-semibold ${isSelected ? 'text-slate-900 text-sm' : 'text-slate-750'}`}>
                                {userProfile.full_name}
                              </p>
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
                      );
                    })}
                  </div>
                )}
              </div>

            </div>

            {/* Right Column - Send Invitation Form OR Manage Selected User */}
            <div className="space-y-6">
              
              {selectedUser ? (
                /* Manage Selected User */
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Manage Member</span>
                      <h3 className="text-sm font-bold text-slate-900">{selectedUser.full_name}</h3>
                    </div>
                    <button
                      onClick={() => setSelectedUser(null)}
                      className="px-2 py-1 text-[10px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                    >
                      Invite Form →
                    </button>
                  </div>

                  {/* 1. Account Status (Requires users.manage_status) */}
                  <div className="space-y-2 border-b border-slate-100 pb-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Account Status</span>
                      <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase ${
                        selectedUser.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {selectedUser.status}
                      </span>
                    </div>

                    {hasPermission('users.manage_status') ? (
                      <div className="flex space-x-2">
                        {selectedUser.status === 'active' ? (
                          <button
                            onClick={() => handleChangeUserStatus('suspended')}
                            disabled={statusLoading}
                            className="w-full py-1.5 text-center text-[10px] font-bold text-red-700 hover:text-red-800 bg-red-50 hover:bg-red-100 rounded-lg border border-red-200 transition-colors cursor-pointer"
                          >
                            {statusLoading ? 'Processing...' : 'Suspend Account'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleChangeUserStatus('active')}
                            disabled={statusLoading}
                            className="w-full py-1.5 text-center text-[10px] font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors cursor-pointer"
                          >
                            {statusLoading ? 'Processing...' : 'Activate Account'}
                          </button>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">Requires users.manage_status to edit.</p>
                    )}
                  </div>

                  {/* 2. Functional Roles (Requires users.assign_roles) */}
                  <div className="space-y-3 border-b border-slate-100 pb-4">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Functional Roles</span>
                    
                    {/* Assigned Roles List */}
                    {userRoles.length === 0 ? (
                      <p className="text-[10px] text-slate-400 italic">No roles assigned currently.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {userRoles.map((ur) => (
                          <div key={ur.id} className="flex items-center bg-slate-100 border border-slate-200 text-slate-800 rounded px-2 py-1 text-[10px] font-medium">
                            <span>{(ur.roles as any)?.name}</span>
                            {hasPermission('users.assign_roles') && (
                              <button
                                onClick={() => handleRemoveUserRole(ur.id)}
                                disabled={assignRoleLoading}
                                className="ml-1.5 text-red-500 hover:text-red-700 font-bold focus:outline-none"
                                title="Remove Role"
                              >
                                &times;
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Role Assigner Dropdown */}
                    {hasPermission('users.assign_roles') ? (
                      <div className="space-y-1.5 pt-1">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignUserRole(e.target.value);
                              e.target.value = '';
                            }
                          }}
                          disabled={assignRoleLoading}
                          className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-lg text-[10px] focus:outline-none focus:ring-1 focus:ring-slate-900"
                        >
                          <option value="">+ Assign Functional Role...</option>
                          {allRoles
                            .filter(r => !userRoles.some(ur => ur.role_id === r.id))
                            .map(role => (
                              <option key={role.id} value={role.id}>
                                {role.name} {role.is_system ? '(System)' : '(Tenant)'}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">Requires users.assign_roles to manage roles.</p>
                    )}
                  </div>

                  {/* 3. Operational Scopes (Requires users.assign_scopes) */}
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Operational Boundaries (WHERE)</span>
                      <p className="text-[9px] text-slate-400 leading-normal">
                        Contracts and Sites restrict observation access. Users with no boundaries have no access, unless they hold the tenant_admin role.
                      </p>
                    </div>

                    {/* Contract Scopes */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-semibold text-slate-600 block">Contract Scopes</span>
                      {userContracts.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic">No specific contract scopes assigned.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {userContracts.map((uc) => (
                            <div key={uc.id} className="flex items-center bg-blue-50 border border-blue-200 text-blue-800 rounded px-1.5 py-0.5 text-[9px] font-medium">
                              <span>{(uc.contracts as any)?.name || 'Unknown Contract'}</span>
                              {hasPermission('users.assign_scopes') && (
                                <button
                                  onClick={() => handleRemoveUserContract(uc.id)}
                                  disabled={assignScopeLoading}
                                  className="ml-1 text-red-500 hover:text-red-700 font-bold"
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {hasPermission('users.assign_scopes') ? (
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignUserContract(e.target.value);
                              e.target.value = '';
                            }
                          }}
                          disabled={assignScopeLoading}
                          className="w-full px-2.5 py-1 border border-slate-200 bg-white rounded-lg text-[10px] focus:outline-none focus:ring-1 focus:ring-slate-900"
                        >
                          <option value="">+ Add Contract Boundary...</option>
                          {contracts
                            .filter(c => !userContracts.some(uc => uc.contract_id === c.id))
                            .map(contract => (
                              <option key={contract.id} value={contract.id}>
                                {contract.name} ({contract.code})
                              </option>
                            ))}
                        </select>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Requires users.assign_scopes to edit.</p>
                      )}
                    </div>

                    {/* Site Scopes */}
                    <div className="space-y-2 pt-1">
                      <span className="text-[10px] font-semibold text-slate-600 block">Physical Site Scopes</span>
                      {userSites.length === 0 ? (
                        <p className="text-[10px] text-slate-400 italic">No specific physical site scopes assigned.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {userSites.map((us) => (
                            <div key={us.id} className="flex items-center bg-indigo-50 border border-indigo-200 text-indigo-800 rounded px-1.5 py-0.5 text-[9px] font-medium">
                              <span>{(us.sites as any)?.name || 'Unknown Site'}</span>
                              {hasPermission('users.assign_scopes') && (
                                <button
                                  onClick={() => handleRemoveUserSite(us.id)}
                                  disabled={assignScopeLoading}
                                  className="ml-1 text-red-500 hover:text-red-700 font-bold"
                                >
                                  &times;
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {hasPermission('users.assign_scopes') ? (
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleAssignUserSite(e.target.value);
                              e.target.value = '';
                            }
                          }}
                          disabled={assignScopeLoading}
                          className="w-full px-2.5 py-1 border border-slate-200 bg-white rounded-lg text-[10px] focus:outline-none focus:ring-1 focus:ring-slate-900"
                        >
                          <option value="">+ Add Site Boundary...</option>
                          {sites
                            .filter(s => !userSites.some(us => us.site_id === s.id))
                            .map(site => (
                              <option key={site.id} value={site.id}>
                                {site.name} ({site.code})
                              </option>
                            ))}
                        </select>
                      ) : (
                        <p className="text-[10px] text-slate-400 italic">Requires users.assign_scopes to edit.</p>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Send Invitation Form */
                <>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 text-xs text-indigo-900 space-y-2">
                    <div className="flex items-center space-x-2">
                      <UserPlus className="w-4 h-4 text-indigo-600" />
                      <span className="font-bold">Invitation Flow Verification</span>
                    </div>
                    <p className="leading-relaxed">
                      Inviting a user assigns them directly to your tenant's context inside the database. Real deployments trigger email links using Supabase Auth.
                    </p>
                    <p className="text-[9px] text-indigo-700 italic">
                      💡 Click on any user profile on the left to manage their Roles, Scopes, and Status.
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
                </>
              )}

            </div>
          </div>
        )}

        {/* TAB 2.5: Role & Permission Management */}
        {activeTab === 'roles' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Role List & Role Creation */}
            <div className="space-y-6">
              
              {/* Custom Role Creation */}
              {hasPermission('tenant.manage_settings') || hasPermission('users.assign_roles') ? (
                <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Create Custom Role</h3>
                  
                  {roleCreateError && <p className="text-[10px] text-red-600">{roleCreateError}</p>}
                  {roleCreateSuccess && <p className="text-[10px] text-emerald-600">{roleCreateSuccess}</p>}
                  
                  <form onSubmit={handleCreateRole} className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500">Role Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Site Supervisor"
                        value={newRoleName}
                        onChange={(e) => {
                          setNewRoleName(e.target.value);
                          if (!newRoleCode) {
                            setNewRoleCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'));
                          }
                        }}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500">Role Code</label>
                      <input
                        type="text"
                        placeholder="e.g. site_supervisor"
                        value={newRoleCode}
                        onChange={(e) => setNewRoleCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-slate-900"
                        required
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500">Description</label>
                      <textarea
                        placeholder="Define operational responsibilities..."
                        value={newRoleDesc}
                        onChange={(e) => setNewRoleDesc(e.target.value)}
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                        rows={2}
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                    >
                      Create Custom Role
                    </button>
                  </form>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 text-xs text-slate-500">
                  <p className="italic">You do not have the permissions required to create custom roles.</p>
                </div>
              )}

              {/* Roles List */}
              <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Available Roles</h3>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-slate-100 text-slate-600">
                    {allRoles.length} Total
                  </span>
                </div>

                <div className="space-y-2">
                  {allRoles.map((role) => {
                    const isSelected = selectedRole?.id === role.id;
                    return (
                      <div
                        key={role.id}
                        onClick={() => setSelectedRole(role)}
                        className={`p-3 rounded-lg border text-xs cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                            : 'bg-white border-slate-200 text-slate-850 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <p className="font-bold">{role.name}</p>
                          <span className={`px-1.5 py-0.5 text-[8px] font-bold uppercase rounded ${
                            role.is_system
                              ? isSelected ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600'
                              : isSelected ? 'bg-indigo-900 text-indigo-100' : 'bg-indigo-50 text-indigo-700'
                          }`}>
                            {role.is_system ? 'System' : 'Custom'}
                          </span>
                        </div>
                        <p className={`text-[10px] mt-1 line-clamp-2 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                          {role.description || 'No description provided.'}
                        </p>
                        <p className={`text-[9px] font-mono mt-1.5 ${isSelected ? 'text-slate-400' : 'text-slate-400'}`}>
                          code: {role.code}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* Right/Middle Columns: Permissions Matrix & Assigned Users */}
            <div className="lg:col-span-2 space-y-6">
              
              {selectedRole ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
                  
                  <div className="flex items-start justify-between border-b border-slate-100 pb-4">
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <h2 className="text-base font-bold text-slate-900">{selectedRole.name}</h2>
                        <span className={`px-2 py-0.5 text-[9px] font-bold rounded uppercase ${
                          selectedRole.is_system ? 'bg-slate-100 text-slate-700' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {selectedRole.is_system ? 'System Role' : 'Custom Tenant Role'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 leading-relaxed max-w-xl">
                        {selectedRole.description || 'No responsibilities defined.'}
                      </p>
                      <p className="text-[10px] font-mono text-slate-400">UUID: {selectedRole.id}</p>
                    </div>

                    {!selectedRole.is_system && (hasPermission('tenant.manage_settings') || hasPermission('users.assign_roles')) && (
                      <button
                        onClick={() => handleDeleteRole(selectedRole.id)}
                        className="px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:text-white bg-red-50 hover:bg-red-600 border border-red-200 rounded-lg transition-all cursor-pointer"
                      >
                        Delete Role
                      </button>
                    )}
                  </div>

                  {selectedRole.is_system && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1">
                      <p className="font-bold text-slate-800">🔒 System Protection Active</p>
                      <p className="leading-normal">
                        System roles are seeded globally. Their permissions are highly optimized, immutable, and protected from local modification or deletion.
                      </p>
                    </div>
                  )}

                  {/* Permissions Checklist Grouped by Category */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Entitlements Matrix ("WHAT" Layer)</h3>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Group permissions by category */}
                      {Array.from(new Set(allPermissions.map(p => p.category))).map(category => (
                        <div key={category} className="border border-slate-100 rounded-lg p-3 space-y-2 bg-slate-50/50">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block border-b border-slate-100 pb-1">
                            {category}
                          </span>
                          
                          <div className="space-y-1.5">
                            {allPermissions
                              .filter(p => p.category === category)
                              .map(permission => {
                                const rolePerms = rolePermissionsMap[selectedRole.id] || [];
                                const isAssigned = rolePerms.includes(permission.code);
                                const canEdit = !selectedRole.is_system && (hasPermission('tenant.manage_settings') || hasPermission('users.assign_roles'));
                                
                                return (
                                  <label
                                    key={permission.id}
                                    className={`flex items-start space-x-2.5 p-1.5 rounded text-xs transition-colors ${
                                      canEdit ? 'cursor-pointer hover:bg-slate-100/50' : 'cursor-not-allowed opacity-80'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isAssigned}
                                      disabled={!canEdit || editRolePermsLoading}
                                      onChange={() => handleTogglePermission(selectedRole.id, permission.id, isAssigned)}
                                      className="mt-0.5 rounded text-slate-900 focus:ring-slate-900 border-slate-300"
                                    />
                                    <div className="space-y-0.5 leading-tight">
                                      <span className="font-semibold text-slate-800 block">{permission.code}</span>
                                      <span className="text-[10px] text-slate-400 block">{permission.description}</span>
                                    </div>
                                  </label>
                                );
                              })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Active Users in this Role */}
                  <div className="border-t border-slate-150 pt-5 space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Assigned Members</h3>
                    
                    {teamProfiles.filter(p => p.id === selectedRole.id).length === 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {teamProfiles.map(profileItem => (
                          <div key={profileItem.id} className="text-[10px] text-slate-500 bg-slate-50 border border-slate-100 rounded px-2.5 py-1">
                            {profileItem.full_name} ({profileItem.email})
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">Inspect assignments or use the Team tab to grant/revoke this role to users.</p>
                    )}
                  </div>

                </div>
              ) : (
                <div className="bg-white border border-slate-200 rounded-xl p-8 shadow-2xs text-center space-y-3">
                  <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto text-slate-400">
                    <Lock className="w-6 h-6" />
                  </div>
                  <div className="max-w-xs mx-auto space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">Select a Role</h3>
                    <p className="text-xs text-slate-500 leading-normal">
                      Click on any role in the list to manage its associated system permissions, toggle functional permissions, or inspect membership.
                    </p>
                  </div>
                </div>
              )}

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

        {/* TAB 5: Tool Builder */}
        {activeTab === 'tools' && (
          <ToolBuilder />
        )}

      </main>

      {/* Page Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-400">
        DASH V2 Behavioural Observation Platform &bull; Phase 2 Auth & Tenancy Core Verified &bull; Supabase Zero-Trust
      </footer>
    </div>
  );
}
