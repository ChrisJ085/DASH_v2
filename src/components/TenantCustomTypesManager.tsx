// src/components/TenantCustomTypesManager.tsx

import React, { useState, useEffect } from 'react';
import {
  Layers,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Info,
  RefreshCw,
  Edit2,
  Globe,
  Search,
  CheckSquare,
  Square,
  X,
  Sliders,
  FolderPlus,
  Tag,
  ChevronRight,
  AlertTriangle
} from 'lucide-react';
import { Site } from '../types/database';
import { CustomScopeType, CustomScopeOption } from '../types/custom-types';
import {
  fetchTenantCustomTypes,
  saveTenantCustomTypes
} from '../lib/custom-types-service';

interface TenantCustomTypesManagerProps {
  tenantId: string;
  sites: Site[];
  onUpdated?: () => void;
}

export const TenantCustomTypesManager: React.FC<TenantCustomTypesManagerProps> = ({
  tenantId,
  sites,
  onUpdated
}) => {
  const [customTypes, setCustomTypes] = useState<CustomScopeType[]>([]);
  const [selectedTypeId, setSelectedTypeId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // List filtering
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Option Form state
  const [editingOptionId, setEditingOptionId] = useState<string | null>(null);
  const [optName, setOptName] = useState('');
  const [optCode, setOptCode] = useState('');
  const [optDesc, setOptDesc] = useState('');
  const [optAppliesToAll, setOptAppliesToAll] = useState(true);
  const [optSiteIds, setOptSiteIds] = useState<string[]>([]);

  // Group Create/Edit Modal state
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [groupTitle, setGroupTitle] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [groupAppliesToAll, setGroupAppliesToAll] = useState(true);
  const [groupSiteIds, setGroupSiteIds] = useState<string[]>([]);

  // In-app deletion confirmation states (replaces blocked window.confirm/alert)
  const [groupToDelete, setGroupToDelete] = useState<{ id: string; title: string; count: number } | null>(null);
  const [optionToDelete, setOptionToDelete] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (tenantId) {
      loadCustomTypes();
    }
  }, [tenantId]);

  const loadCustomTypes = async () => {
    setLoading(true);
    setError(null);
    try {
      const types = await fetchTenantCustomTypes(tenantId);
      setCustomTypes(types);
      if (types.length > 0) {
        if (!selectedTypeId || !types.some(t => t.id === selectedTypeId)) {
          setSelectedTypeId(types[0].id);
        }
      } else {
        setSelectedTypeId('');
      }
    } catch (err: any) {
      console.error('Error loading custom types:', err);
      setError(err.message || 'Failed to load custom types');
    } finally {
      setLoading(false);
    }
  };

  const selectedType = customTypes.find(t => t.id === selectedTypeId) || (customTypes.length > 0 ? customTypes[0] : null);

  const resetOptionForm = () => {
    setEditingOptionId(null);
    setOptName('');
    setOptCode('');
    setOptDesc('');
    setOptAppliesToAll(true);
    setOptSiteIds(sites.map(s => s.id));
  };

  const handleOpenAddOption = () => {
    resetOptionForm();
  };

  const handleOpenEditOption = (opt: CustomScopeOption) => {
    setEditingOptionId(opt.id);
    setOptName(opt.name);
    setOptCode(opt.code);
    setOptDesc(opt.description || '');
    setOptAppliesToAll(opt.applies_to_all_sites);
    setOptSiteIds(opt.site_ids && opt.site_ids.length > 0 ? opt.site_ids : sites.map(s => s.id));
  };

  const handleSaveOption = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedType || !optName.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const generatedCode = optCode.trim() || optName.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10);
      
      const newOption: CustomScopeOption = {
        id: editingOptionId || `cso_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: optName.trim(),
        code: generatedCode,
        description: optDesc.trim() || undefined,
        applies_to_all_sites: optAppliesToAll,
        site_ids: optAppliesToAll ? [] : optSiteIds,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const updatedTypes = customTypes.map(ct => {
        if (ct.id !== selectedType.id) return ct;
        let newOptions: CustomScopeOption[];
        if (editingOptionId) {
          newOptions = ct.options.map(o => o.id === editingOptionId ? newOption : o);
        } else {
          newOptions = [...ct.options, newOption];
        }
        return {
          ...ct,
          options: newOptions,
          updated_at: new Date().toISOString()
        };
      });

      await saveTenantCustomTypes(tenantId, updatedTypes);
      setCustomTypes(updatedTypes);
      resetOptionForm();
      setSuccess(`Option "${optName.trim()}" saved in ${selectedType.title}.`);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save option');
    } finally {
      setSaving(false);
    }
  };

  const handleExecuteDeleteOption = async () => {
    if (!optionToDelete || !selectedType) return;

    setSaving(true);
    setError(null);
    try {
      const optNameDeleted = optionToDelete.name;
      const updatedTypes = customTypes.map(ct => {
        if (ct.id !== selectedType.id) return ct;
        return {
          ...ct,
          options: ct.options.filter(o => o.id !== optionToDelete.id),
          updated_at: new Date().toISOString()
        };
      });

      await saveTenantCustomTypes(tenantId, updatedTypes);
      setCustomTypes(updatedTypes);
      setSuccess(`Option "${optNameDeleted}" removed.`);
      if (editingOptionId === optionToDelete.id) resetOptionForm();
      setOptionToDelete(null);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete option');
    } finally {
      setSaving(false);
    }
  };

  // Group management handlers
  const handleOpenAddGroup = () => {
    setEditingGroupId(null);
    setGroupTitle('');
    setGroupCode('');
    setGroupDesc('');
    setGroupAppliesToAll(true);
    setGroupSiteIds(sites.map(s => s.id));
    setShowGroupModal(true);
  };

  const handleOpenEditGroup = (type: CustomScopeType) => {
    setEditingGroupId(type.id);
    setGroupTitle(type.title);
    setGroupCode(type.code);
    setGroupDesc(type.description || '');
    setGroupAppliesToAll(type.applies_to_all_sites);
    setGroupSiteIds(type.site_ids && type.site_ids.length > 0 ? type.site_ids : sites.map(s => s.id));
    setShowGroupModal(true);
  };

  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupTitle.trim()) return;

    setSaving(true);
    setError(null);
    try {
      const generatedCode = groupCode.trim() || groupTitle.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 12);
      let updatedTypes: CustomScopeType[];

      if (editingGroupId) {
        updatedTypes = customTypes.map(ct => {
          if (ct.id !== editingGroupId) return ct;
          return {
            ...ct,
            title: groupTitle.trim(),
            code: generatedCode,
            description: groupDesc.trim() || undefined,
            applies_to_all_sites: groupAppliesToAll,
            site_ids: groupAppliesToAll ? [] : groupSiteIds,
            updated_at: new Date().toISOString()
          };
        });
      } else {
        const newGroup: CustomScopeType = {
          id: `cst_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          title: groupTitle.trim(),
          code: generatedCode,
          description: groupDesc.trim() || undefined,
          applies_to_all_sites: groupAppliesToAll,
          site_ids: groupAppliesToAll ? [] : groupSiteIds,
          options: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        updatedTypes = [...customTypes, newGroup];
        setSelectedTypeId(newGroup.id);
      }

      await saveTenantCustomTypes(tenantId, updatedTypes);
      setCustomTypes(updatedTypes);
      setShowGroupModal(false);
      setSuccess(`Custom Type Group "${groupTitle.trim()}" saved.`);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to save custom type group');
    } finally {
      setSaving(false);
    }
  };

  const handleExecuteDeleteGroup = async () => {
    if (!groupToDelete) return;

    setSaving(true);
    setError(null);
    try {
      const titleDeleted = groupToDelete.title;
      const updatedTypes = customTypes.filter(ct => ct.id !== groupToDelete.id);
      await saveTenantCustomTypes(tenantId, updatedTypes);
      setCustomTypes(updatedTypes);
      if (updatedTypes.length > 0) {
        setSelectedTypeId(updatedTypes[0].id);
      } else {
        setSelectedTypeId('');
      }
      setGroupToDelete(null);
      setShowGroupModal(false);
      setSuccess(`Custom Type Group "${titleDeleted}" was successfully deleted.`);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete custom type group');
    } finally {
      setSaving(false);
    }
  };

  const siteMap = new Map(sites.map(s => [s.id, s]));

  // Filter options for current view
  const currentOptions = selectedType ? selectedType.options : [];
  const filteredOptions = currentOptions.filter(opt => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = opt.name.toLowerCase().includes(q);
      const matchCode = opt.code.toLowerCase().includes(q);
      const matchDesc = opt.description?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchDesc) return false;
    }
    if (siteFilter !== 'all') {
      if (opt.applies_to_all_sites || !opt.site_ids || opt.site_ids.length === 0) return true;
      return opt.site_ids.includes(siteFilter);
    }
    return true;
  });

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
      
      {/* Header & Subtitle */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Tenant Custom Types & Scopes
            </h2>
            <p className="text-xs text-slate-500">
              Create and manage custom taxonomies (e.g. Areas, Operation Types, Shifts, Departments) applied across physical sites and instruments
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={loadCustomTypes}
            disabled={loading}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Refresh Custom Types"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenAddGroup}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center space-x-1.5 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            <span>New Custom Type Group</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="cursor-pointer text-red-500 hover:text-red-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="cursor-pointer text-emerald-500 hover:text-emerald-700">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Custom Type Tabs */}
      {customTypes.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          {customTypes.map(type => {
            const isSelected = selectedType && selectedType.id === type.id;
            return (
              <div
                key={type.id}
                className={`group flex items-center rounded-xl transition-all ${
                  isSelected
                    ? 'bg-slate-900 text-white shadow-xs font-bold'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200/80'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTypeId(type.id);
                    resetOptionForm();
                  }}
                  className="px-3.5 py-2 text-xs font-bold flex items-center space-x-2 cursor-pointer"
                >
                  <Tag className={`w-3.5 h-3.5 ${isSelected ? 'text-indigo-400' : 'text-slate-400'}`} />
                  <span>{type.title}</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                    isSelected ? 'bg-slate-800 text-indigo-300' : 'bg-slate-200/80 text-slate-600'
                  }`}>
                    {type.options.length}
                  </span>
                </button>

                {/* Edit Button */}
                <button
                  type="button"
                  onClick={() => handleOpenEditGroup(type)}
                  className={`p-2 transition-colors cursor-pointer ${
                    isSelected ? 'hover:bg-slate-800 text-slate-300' : 'hover:bg-slate-200 text-slate-400'
                  }`}
                  title={`Edit Group "${type.title}"`}
                >
                  <Edit2 className="w-3 h-3" />
                </button>

                {/* Direct Delete Group Button */}
                <button
                  type="button"
                  onClick={() => setGroupToDelete({ id: type.id, title: type.title, count: type.options.length })}
                  className={`p-2 rounded-r-xl transition-colors cursor-pointer ${
                    isSelected
                      ? 'hover:bg-red-900/60 text-slate-400 hover:text-red-400'
                      : 'hover:bg-red-100 text-slate-400 hover:text-red-600'
                  }`}
                  title={`Delete Group "${type.title}"`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-900 text-sm">No Custom Type Groups Configured</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
              Add your first custom scope group (such as Areas, Operation Types, Shifts, or Equipment Classes) to use when building inspection instruments.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenAddGroup}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer inline-flex items-center space-x-2"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Create Custom Type Group</span>
          </button>
        </div>
      )}

      {/* Selected Group Details Bar */}
      {selectedType && (
        <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-slate-900">{selectedType.title}</span>
            <span className="px-1.5 py-0.5 bg-slate-200 text-slate-700 font-mono text-[10px] rounded font-semibold">
              {selectedType.code}
            </span>
            {selectedType.description && (
              <span className="text-slate-500 text-[11px] hidden sm:inline">
                — {selectedType.description}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3 text-[11px]">
            <span className="text-slate-500 flex items-center space-x-1">
              <Globe className="w-3.5 h-3.5 text-indigo-500" />
              <span>
                {selectedType.applies_to_all_sites || !selectedType.site_ids || selectedType.site_ids.length === 0
                  ? 'Active on All Tenant Sites'
                  : `Active on ${selectedType.site_ids.length} of ${sites.length} sites`}
              </span>
            </span>

            <button
              type="button"
              id="delete-selected-group-btn"
              onClick={() => setGroupToDelete({ id: selectedType.id, title: selectedType.title, count: selectedType.options.length })}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded-md font-semibold cursor-pointer transition-colors flex items-center space-x-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete Group</span>
            </button>
          </div>
        </div>
      )}

      {/* Two Column Layout: Option List (Left) & Create/Edit Option Form (Right) */}
      {selectedType && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: List of options/types under this title */}
          <div className="lg:col-span-2 space-y-4">
            
            {/* Search and Site Filter Toolbar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={`Search ${selectedType.title.toLowerCase()}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full text-xs pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Building2 className="w-3.5 h-3.5 text-slate-400" />
                <select
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  className="text-xs bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-2 font-medium text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">All Sites Scope</option>
                  {sites.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Options List */}
            {filteredOptions.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 space-y-2">
                <Tag className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-xs text-slate-500">
                  {searchQuery || siteFilter !== 'all'
                    ? `No ${selectedType.title.toLowerCase()} match your filters.`
                    : `No ${selectedType.title.toLowerCase()} configured yet.`}
                </p>
                <p className="text-[11px] text-slate-400">
                  Use the form on the right to add the first option for "{selectedType.title}".
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                {filteredOptions.map(opt => {
                  const appliesToAll = opt.applies_to_all_sites || !opt.site_ids || opt.site_ids.length === 0;
                  const isEditing = editingOptionId === opt.id;

                  return (
                    <div
                      key={opt.id}
                      className={`p-3.5 flex items-start justify-between gap-3 transition-colors ${
                        isEditing ? 'bg-indigo-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-xs text-slate-900">{opt.name}</span>
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-700 font-mono text-[10px] rounded font-bold">
                            {opt.code}
                          </span>
                          {appliesToAll ? (
                            <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 bg-blue-50 text-blue-700 text-[9px] font-semibold rounded">
                              <Globe className="w-2.5 h-2.5" />
                              <span>All Sites</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-1.5 py-0.2 bg-purple-50 text-purple-700 text-[9px] font-semibold rounded">
                              <Building2 className="w-2.5 h-2.5" />
                              <span>{opt.site_ids?.length || 0} Sites</span>
                            </span>
                          )}
                        </div>

                        {opt.description && (
                          <p className="text-[11px] text-slate-500 leading-relaxed">
                            {opt.description}
                          </p>
                        )}

                        {!appliesToAll && opt.site_ids && opt.site_ids.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {opt.site_ids.map(sid => {
                              const s = siteMap.get(sid);
                              return (
                                <span
                                  key={sid}
                                  className="text-[9px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded"
                                >
                                  {s ? `${s.name} (${s.code})` : sid}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditOption(opt)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Option"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setOptionToDelete({ id: opt.id, name: opt.name })}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                          title="Delete Option"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Column: Add / Edit Option Form */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
              <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900 flex items-center space-x-1.5">
                <Plus className="w-3.5 h-3.5 text-indigo-600" />
                <span>{editingOptionId ? `Edit Option` : `Add New Option`}</span>
              </h3>
              {editingOptionId && (
                <button
                  type="button"
                  onClick={resetOptionForm}
                  className="text-[11px] text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                >
                  Cancel
                </button>
              )}
            </div>

            <form onSubmit={handleSaveOption} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Option Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={`e.g. Loading Bay 1, Night Shift, Logistics`}
                  value={optName}
                  onChange={(e) => setOptName(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Unique Code</span>
                  <span className="text-[10px] text-slate-400 font-normal">Auto-generated if empty</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. BAY_01, SHIFT_NIGHT"
                  value={optCode}
                  onChange={(e) => setOptCode(e.target.value.toUpperCase())}
                  className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                  Description
                </label>
                <textarea
                  placeholder="Operational scope notes or guidelines..."
                  value={optDesc}
                  onChange={(e) => setOptDesc(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              {/* Physical Site Applicability */}
              <div className="space-y-2 pt-1 border-t border-slate-200/80">
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Site Applicability</span>
                  <span className="text-[10px] text-slate-400 font-normal">Physical sites filter</span>
                </label>

                <div className="space-y-1.5">
                  <label
                    onClick={() => setOptAppliesToAll(true)}
                    className={`flex items-center space-x-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      optAppliesToAll
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-950 font-semibold'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Apply to All Sites in Tenant</span>
                  </label>

                  <label
                    onClick={() => setOptAppliesToAll(false)}
                    className={`flex items-center space-x-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      !optAppliesToAll
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-950 font-semibold'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Select Specific Sites</span>
                  </label>
                </div>

                {!optAppliesToAll && (
                  <div className="p-2.5 bg-white border border-slate-200 rounded-xl max-h-40 overflow-y-auto space-y-1">
                    {sites.map(site => {
                      const checked = optSiteIds.includes(site.id);
                      return (
                        <div
                          key={site.id}
                          onClick={() => {
                            if (checked) {
                              setOptSiteIds(prev => prev.filter(id => id !== site.id));
                            } else {
                              setOptSiteIds(prev => [...prev, site.id]);
                            }
                          }}
                          className={`flex items-center space-x-2 p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                            checked ? 'bg-indigo-50 text-indigo-950 font-medium' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          {checked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-300" />
                          )}
                          <span className="truncate">
                            {site.name} <span className="text-[10px] text-slate-400">({site.code})</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={saving || !optName.trim()}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer flex items-center justify-center space-x-1.5 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>{editingOptionId ? 'Update Option' : `Add to ${selectedType.title}`}</span>
                  </>
                )}
              </button>
            </form>
          </div>

        </div>
      )}

      {/* Modal: Create or Edit Custom Type Group */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col animate-scale-up">
            <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <FolderPlus className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-sm">
                  {editingGroupId ? 'Edit Custom Type Group' : 'New Custom Type Group'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} className="p-6 space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Group Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Areas, Operation Types, Shifts, Departments"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px] flex items-center justify-between">
                  <span>Group Code</span>
                  <span className="text-[10px] text-slate-400 font-normal">Auto-generated identifier</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. AREAS, SHIFTS, DEPTS"
                  value={groupCode}
                  onChange={(e) => setGroupCode(e.target.value.toUpperCase())}
                  className="w-full text-xs font-mono border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Description
                </label>
                <textarea
                  placeholder="Explain what this category classifies across instruments..."
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  rows={2}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="font-bold text-slate-700 uppercase tracking-wider text-[11px]">
                  Group Site Scope
                </label>
                <div className="space-y-1.5">
                  <label
                    onClick={() => setGroupAppliesToAll(true)}
                    className={`flex items-center space-x-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      groupAppliesToAll
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-950 font-semibold'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Apply to All Sites in Tenant</span>
                  </label>

                  <label
                    onClick={() => setGroupAppliesToAll(false)}
                    className={`flex items-center space-x-2 p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                      !groupAppliesToAll
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-950 font-semibold'
                        : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Select Specific Sites</span>
                  </label>
                </div>

                {!groupAppliesToAll && (
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl max-h-36 overflow-y-auto space-y-1">
                    {sites.map(site => {
                      const checked = groupSiteIds.includes(site.id);
                      return (
                        <div
                          key={site.id}
                          onClick={() => {
                            if (checked) {
                              setGroupSiteIds(prev => prev.filter(id => id !== site.id));
                            } else {
                              setGroupSiteIds(prev => [...prev, site.id]);
                            }
                          }}
                          className={`flex items-center space-x-2 p-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                            checked ? 'bg-indigo-50 text-indigo-950 font-medium' : 'hover:bg-slate-100 text-slate-700'
                          }`}
                        >
                          {checked ? (
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-300" />
                          )}
                          <span className="truncate">
                            {site.name} <span className="text-[10px] text-slate-400">({site.code})</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {editingGroupId ? (
                  <button
                    type="button"
                    onClick={() => {
                      const toDel = customTypes.find(ct => ct.id === editingGroupId);
                      if (toDel) {
                        setShowGroupModal(false);
                        setGroupToDelete({ id: toDel.id, title: toDel.title, count: toDel.options.length });
                      }
                    }}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded text-xs font-semibold flex items-center space-x-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete this Group</span>
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowGroupModal(false)}
                    className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || !groupTitle.trim()}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editingGroupId ? 'Save Changes' : 'Create Group'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Group Confirmation */}
      {groupToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md shadow-2xl p-6 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Delete Custom Type Group</h3>
                <p className="text-xs text-slate-500">This action cannot be undone.</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs text-slate-700">
              <p>
                Are you sure you want to delete <span className="font-bold text-slate-900">"{groupToDelete.title}"</span>?
              </p>
              <p className="text-slate-500 text-[11px] leading-relaxed">
                This will permanently delete this group and all{' '}
                <span className="font-semibold text-slate-800">{groupToDelete.count} option(s)</span> configured under it from your tenant settings.
              </p>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setGroupToDelete(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-group-btn"
                disabled={saving}
                onClick={handleExecuteDeleteGroup}
                className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting Group...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Yes, Delete Group</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Delete Option Confirmation */}
      {optionToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
            <div className="flex items-center space-x-3 text-red-600">
              <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Remove Option</h3>
                <p className="text-xs text-slate-500">Remove from {selectedType?.title}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to remove <span className="font-bold text-slate-900">"{optionToDelete.name}"</span>?
            </p>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setOptionToDelete(null)}
                className="px-3.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleExecuteDeleteOption}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-bold text-xs rounded-lg shadow-xs cursor-pointer flex items-center space-x-1"
              >
                {saving ? (
                  <>
                    <RefreshCw className="w-3 h-3 animate-spin" />
                    <span>Removing...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3 h-3" />
                    <span>Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
