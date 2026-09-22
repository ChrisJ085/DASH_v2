// src/components/ColleagueManager.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import {
  ColleagueProfile,
  ColleagueRole,
  DEFAULT_COLLEAGUE_ROLES
} from '../types/colleague';
import {
  fetchColleagues,
  saveColleague,
  deleteColleague,
  fetchColleagueRoles,
  saveColleagueRole
} from '../lib/colleague-service';
import {
  Users,
  UserPlus,
  Shield,
  Truck,
  Cog,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  Plus,
  X,
  BadgeCheck,
  Building,
  Clock,
  Tag
} from 'lucide-react';

interface ColleagueManagerProps {
  tenantId: string;
}

export default function ColleagueManager({ tenantId }: ColleagueManagerProps) {
  const { profile, hasPermission } = useAuth();

  const [colleagues, setColleagues] = useState<ColleagueProfile[]>([]);
  const [roles, setRoles] = useState<ColleagueRole[]>(DEFAULT_COLLEAGUE_ROLES);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingColleague, setEditingColleague] = useState<ColleagueProfile | null>(null);
  const [formName, setFormName] = useState('');
  const [formEmpId, setFormEmpId] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formShift, setFormShift] = useState('Morning (06:00 - 14:00)');
  const [formRoles, setFormRoles] = useState<string[]>([]);
  const [formNotes, setFormNotes] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');

  // New Custom Role Modal
  const [showNewRoleModal, setShowNewRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRoleDesc, setNewRoleDesc] = useState('');
  const [newRoleCanObserve, setNewRoleCanObserve] = useState(false);
  const [newRoleCanBeObserved, setNewRoleCanBeObserved] = useState(true);

  const loadData = async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [cols, rls] = await Promise.all([
        fetchColleagues(tenantId),
        fetchColleagueRoles(tenantId)
      ]);
      setColleagues(cols);
      setRoles(rls);
    } catch (err) {
      console.error('Failed to load colleagues:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [tenantId]);

  const openCreateModal = () => {
    setEditingColleague(null);
    setFormName('');
    setFormEmpId(`OP-${Math.floor(1000 + Math.random() * 9000)}`);
    setFormEmail('');
    setFormPhone('');
    setFormDept('Operations');
    setFormShift('Morning (06:00 - 14:00)');
    setFormRoles(['mhe_operator']);
    setFormNotes('');
    setFormStatus('active');
    setShowModal(true);
  };

  const openEditModal = (c: ColleagueProfile) => {
    setEditingColleague(c);
    setFormName(c.full_name);
    setFormEmpId(c.employee_id);
    setFormEmail(c.email || '');
    setFormPhone(c.phone || '');
    setFormDept(c.department || '');
    setFormShift(c.shift || 'Morning (06:00 - 14:00)');
    setFormRoles(c.role_ids || []);
    setFormNotes(c.notes || '');
    setFormStatus(c.status);
    setShowModal(true);
  };

  const handleSaveColleague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmpId.trim()) return;

    const isObserver = formRoles.includes('observer') || formRoles.includes('role-observer');
    const isOperator = formRoles.some(r => 
      r.includes('operator') || r.includes('mhe') || r.includes('warehouse')
    );

    const payload: ColleagueProfile = {
      id: editingColleague ? editingColleague.id : `col-${Date.now()}`,
      tenant_id: tenantId,
      user_id: editingColleague?.user_id || null,
      full_name: formName.trim(),
      employee_id: formEmpId.trim(),
      email: formEmail.trim() || null,
      phone: formPhone.trim() || null,
      department: formDept.trim() || null,
      shift: formShift,
      status: formStatus,
      role_ids: formRoles,
      is_observer: isObserver,
      is_operator: isOperator,
      notes: formNotes.trim() || null,
      created_at: editingColleague ? editingColleague.created_at : new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await saveColleague(tenantId, payload);
    setShowModal(false);
    await loadData();
  };

  const handleDeleteColleague = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to remove ${name} from the colleagues list?`)) return;
    await deleteColleague(tenantId, id);
    await loadData();
  };

  const handleCreateCustomRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoleName.trim()) return;

    const code = newRoleCode.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_') ||
      newRoleName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');

    const rolePayload: ColleagueRole = {
      id: `role-${code}`,
      code,
      name: newRoleName.trim(),
      description: newRoleDesc.trim() || undefined,
      badge_color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
      is_can_observe: newRoleCanObserve,
      is_can_be_observed: newRoleCanBeObserved,
      is_system: false
    };

    await saveColleagueRole(tenantId, rolePayload);
    setShowNewRoleModal(false);
    setNewRoleName('');
    setNewRoleCode('');
    setNewRoleDesc('');
    await loadData();
  };

  // Filter colleagues
  const filteredColleagues = colleagues.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;

    if (roleFilter !== 'all') {
      const normalizedRoles = (c.role_ids || []).map(r => r.toLowerCase().replace(/^role-/, '').replace(/-/g, '_'));
      const target = roleFilter.toLowerCase().replace(/^role-/, '').replace(/-/g, '_');
      const hasRole = normalizedRoles.includes(target) ||
        (target === 'observer' && c.is_observer) ||
        (target.includes('operator') && c.is_operator);
      if (!hasRole) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = c.full_name.toLowerCase().includes(q);
      const matchId = c.employee_id.toLowerCase().includes(q);
      const matchDept = (c.department || '').toLowerCase().includes(q);
      const matchEmail = (c.email || '').toLowerCase().includes(q);
      if (!matchName && !matchId && !matchDept && !matchEmail) return false;
    }

    return true;
  });

  // Calculate high-level stats
  const totalCount = colleagues.length;
  const observerCount = colleagues.filter(c => c.is_observer || (c.role_ids || []).some(r => r.includes('observer'))).length;
  const mheCount = colleagues.filter(c => (c.role_ids || []).some(r => r.includes('mhe'))).length;
  const machineCount = colleagues.filter(c => (c.role_ids || []).some(r => r.includes('machine'))).length;

  return (
    <div className="space-y-6">
      {/* Top Banner & Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Colleague Roster</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-900 mt-2">{totalCount}</p>
          <span className="text-[11px] text-slate-400">Shopfloor personnel & observers</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Observers</span>
            <Eye className="w-4 h-4 text-blue-600" />
          </div>
          <p className="text-2xl font-extrabold text-blue-900 mt-2">{observerCount}</p>
          <span className="text-[11px] text-blue-600 font-medium">Qualified to conduct observations</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">MHE Operators</span>
            <Truck className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-extrabold text-amber-900 mt-2">{mheCount}</p>
          <span className="text-[11px] text-amber-700 font-medium">Forklifts, Reach, PPT, LLOP</span>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Machine Operators</span>
            <Cog className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-900 mt-2">{machineCount}</p>
          <span className="text-[11px] text-emerald-700 font-medium">Production lines, cells, robotics</span>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-3xs overflow-hidden">
        {/* Header Bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-slate-700" />
              <h2 className="text-base font-bold text-slate-900">Colleague Profiles & Operational Roles</h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage operators and observers. Instrument creation links to these colleague roles so observers can identify the colleague being observed.
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowNewRoleModal(true)}
              className="px-3 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center cursor-pointer"
            >
              <Tag className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
              Manage Roles
            </button>
            <button
              onClick={openCreateModal}
              className="px-3.5 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-3xs transition-colors flex items-center cursor-pointer"
            >
              <UserPlus className="w-3.5 h-3.5 mr-1.5" />
              Add Colleague Profile
            </button>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="p-4 bg-slate-50/70 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2 flex-1 min-w-[240px] max-w-md">
            <div className="relative w-full">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search colleague by name, employee ID, department..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-slate-400 hover:text-slate-600 text-xs px-1 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2 flex-wrap">
            {/* Role Filter Tabs */}
            <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5 shadow-3xs">
              <button
                onClick={() => setRoleFilter('all')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  roleFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-3xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Roles
              </button>
              <button
                onClick={() => setRoleFilter('observer')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  roleFilter === 'observer'
                    ? 'bg-blue-600 text-white shadow-3xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Observers
              </button>
              <button
                onClick={() => setRoleFilter('mhe_operator')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  roleFilter === 'mhe_operator'
                    ? 'bg-amber-600 text-white shadow-3xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                MHE Operators
              </button>
              <button
                onClick={() => setRoleFilter('machine_operator')}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  roleFilter === 'machine_operator'
                    ? 'bg-emerald-600 text-white shadow-3xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Machine Operators
              </button>
            </div>

            {/* Status dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Colleague List Table */}
        {loading ? (
          <div className="p-8 text-center text-xs text-slate-400">Loading colleague roster...</div>
        ) : filteredColleagues.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs text-slate-500 font-medium">No colleagues found matching current filters.</p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Add New Colleague
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredColleagues.map((c) => {
              const isObserver = c.is_observer || (c.role_ids || []).includes('observer');
              const isMhe = (c.role_ids || []).some(r => r.includes('mhe'));
              const isMachine = (c.role_ids || []).some(r => r.includes('machine'));

              return (
                <div
                  key={c.id}
                  className="p-4 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                >
                  {/* Left: Identity & Badges */}
                  <div className="space-y-1.5 flex-1">
                    <div className="flex items-center space-x-2.5 flex-wrap">
                      <span className="font-bold text-sm text-slate-900">{c.full_name}</span>
                      <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-semibold border border-slate-200">
                        {c.employee_id}
                      </span>
                      <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                        c.status === 'active'
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : 'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>
                        {c.status}
                      </span>
                      {c.user_id && (
                        <span className="text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-medium border border-indigo-100">
                          App Account
                        </span>
                      )}
                    </div>

                    {/* Operational Roles Badges */}
                    <div className="flex items-center space-x-1.5 flex-wrap pt-0.5">
                      {isObserver && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded bg-blue-50 text-blue-750 border border-blue-200">
                          <Eye className="w-3 h-3 mr-1 text-blue-600" />
                          Observer
                        </span>
                      )}
                      {isMhe && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded bg-amber-50 text-amber-850 border border-amber-200">
                          <Truck className="w-3 h-3 mr-1 text-amber-600" />
                          MHE Operator
                        </span>
                      )}
                      {isMachine && (
                        <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-50 text-emerald-850 border border-emerald-200">
                          <Cog className="w-3 h-3 mr-1 text-emerald-600" />
                          Machine Operator
                        </span>
                      )}
                      {(c.role_ids || [])
                        .filter(r => !r.includes('observer') && !r.includes('mhe') && !r.includes('machine'))
                        .map(rId => {
                          const rDef = roles.find(r => r.code === rId || r.id === rId);
                          return (
                            <span
                              key={rId}
                              className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold rounded bg-slate-100 text-slate-800 border border-slate-200"
                            >
                              {rDef ? rDef.name : rId}
                            </span>
                          );
                        })}
                    </div>

                    {/* Department, Shift, & Notes */}
                    <div className="flex items-center space-x-4 text-[11px] text-slate-500 pt-0.5 flex-wrap">
                      {c.department && (
                        <span className="flex items-center">
                          <Building className="w-3 h-3 mr-1 text-slate-400" />
                          {c.department}
                        </span>
                      )}
                      {c.shift && (
                        <span className="flex items-center">
                          <Clock className="w-3 h-3 mr-1 text-slate-400" />
                          {c.shift}
                        </span>
                      )}
                      {c.notes && (
                        <span className="text-slate-400 italic truncate max-w-sm">
                          "{c.notes}"
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => openEditModal(c)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5 mr-1 text-slate-500" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteColleague(c.id, c.full_name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                      title="Remove Colleague"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500 flex items-center justify-between">
          <span>
            Showing {filteredColleagues.length} of {colleagues.length} total colleagues
          </span>
          <span className="font-medium text-slate-600">
            DASH V2 Colleague Role Governance
          </span>
        </div>
      </div>

      {/* CREATE / EDIT COLLEAGUE MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingColleague ? 'Edit Colleague Profile' : 'Add New Colleague Profile'}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveColleague} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Full Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Liam Hayes"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Employee / Badge ID *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. OP-4081"
                    value={formEmpId}
                    onChange={(e) => setFormEmpId(e.target.value)}
                    className="w-full text-xs font-mono border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              {/* Operational Roles Selector */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900">
                    Colleague Roles & Capabilities *
                  </label>
                  <span className="text-[10px] text-slate-400">Select all that apply</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Defines whether this colleague can perform observations, operate MHE/machinery, and be selected as the observed colleague.
                </p>

                <div className="space-y-1.5 border border-slate-200 rounded-xl p-3 bg-slate-50/60">
                  {roles.map(r => {
                    const isChecked = formRoles.includes(r.code) || formRoles.includes(r.id);
                    return (
                      <label
                        key={r.id || r.code}
                        className={`flex items-start space-x-3 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                          isChecked ? 'bg-indigo-50/80 text-indigo-950 font-medium' : 'hover:bg-slate-100/80 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormRoles(prev => [...prev, r.code]);
                            } else {
                              setFormRoles(prev => prev.filter(x => x !== r.code && x !== r.id));
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 mt-0.5"
                        />
                        <div className="flex-1 space-y-0.5">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold">{r.name}</span>
                            {r.is_can_observe && (
                              <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-semibold">
                                Observer
                              </span>
                            )}
                            {r.is_can_be_observed && (
                              <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-semibold">
                                Can Be Observed
                              </span>
                            )}
                          </div>
                          {r.description && (
                            <p className="text-[10px] text-slate-500 leading-snug">{r.description}</p>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Department & Shift */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Department / Area</label>
                  <input
                    type="text"
                    placeholder="e.g. Logistics & Inbound"
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Operating Shift</label>
                  <select
                    value={formShift}
                    onChange={(e) => setFormShift(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="Morning (06:00 - 14:00)">Morning (06:00 - 14:00)</option>
                    <option value="Afternoon (14:00 - 22:00)">Afternoon (14:00 - 22:00)</option>
                    <option value="Night (22:00 - 06:00)">Night (22:00 - 06:00)</option>
                    <option value="Day Shift (08:00 - 16:30)">Day Shift (08:00 - 16:30)</option>
                    <option value="Rotation / Weekend">Rotation / Weekend</option>
                  </select>
                </div>
              </div>

              {/* Contact info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="e.g. operative@ops.internal"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                  >
                    <option value="active">Active (Available for observation)</option>
                    <option value="inactive">Inactive / Off Rota</option>
                  </select>
                </div>
              </div>

              {/* Certifications & Notes */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Certifications & Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. FLT Counterbalance certified. Qualified peer observer."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-3xs transition-colors cursor-pointer"
                >
                  {editingColleague ? 'Update Profile' : 'Save Colleague Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MANAGE CUSTOM ROLES MODAL */}
      {showNewRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Tag className="w-5 h-5 text-slate-700" />
                <h3 className="text-base font-bold text-slate-900">Define Operational Role</h3>
              </div>
              <button
                onClick={() => setShowNewRoleModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomRole} className="p-6 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Role Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Tugger Train Driver"
                  value={newRoleName}
                  onChange={(e) => {
                    setNewRoleName(e.target.value);
                    if (!newRoleCode) {
                      setNewRoleCode(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_'));
                    }
                  }}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Role Code</label>
                <input
                  type="text"
                  placeholder="e.g. tugger_driver"
                  value={newRoleCode}
                  onChange={(e) => setNewRoleCode(e.target.value)}
                  className="w-full text-xs font-mono border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700">Description</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Drivers operating internal plant tow trains and trailer dollies."
                  value={newRoleDesc}
                  onChange={(e) => setNewRoleDesc(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-lg p-2 bg-white text-slate-900 focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <span className="text-xs font-bold text-slate-800 block">Role Capabilities</span>
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRoleCanBeObserved}
                    onChange={(e) => setNewRoleCanBeObserved(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Can be observed (operator / subject of observation)</span>
                </label>
                <label className="flex items-center space-x-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newRoleCanObserve}
                    onChange={(e) => setNewRoleCanObserve(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Can perform observations (Observer role)</span>
                </label>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowNewRoleModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 rounded-lg bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-3xs transition-colors cursor-pointer"
                >
                  Create Operational Role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
