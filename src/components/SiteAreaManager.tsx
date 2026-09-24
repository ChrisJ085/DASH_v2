import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  MapPin,
  Layers,
  Activity,
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
  X
} from 'lucide-react';
import { SiteArea, OperationType } from '../types/tool-engine';
import {
  enrichWithSites,
  formatAreaDescription,
  doesApplyToSite
} from '../lib/site-area-utils';

interface SiteAreaManagerProps {
  tenantId: string;
  sites: { id: string; name: string; code: string }[];
  onUpdated?: () => void;
}

export const SiteAreaManager: React.FC<SiteAreaManagerProps> = ({
  tenantId,
  sites,
  onUpdated
}) => {
  const [activeTab, setActiveTab] = useState<'areas' | 'operations'>('areas');

  // Filter state for the list view
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [areas, setAreas] = useState<SiteArea[]>([]);
  const [operations, setOperations] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [appliesToAllSites, setAppliesToAllSites] = useState<boolean>(true);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Load all areas and operations bound to the tenant
  useEffect(() => {
    if (tenantId) {
      fetchData();
    }
  }, [tenantId]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch site areas for tenant
      const { data: areasData, error: areasErr } = await supabase
        .from('site_areas')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (areasErr) throw areasErr;
      const enrichedAreas = (areasData || []).map(a => enrichWithSites(a));
      setAreas(enrichedAreas);

      // Fetch operation types for tenant
      const { data: opsData, error: opsErr } = await supabase
        .from('operation_types')
        .select('*')
        .is('deleted_at', null)
        .order('name');

      if (opsErr) throw opsErr;
      const enrichedOps = (opsData || []).map(o => enrichWithSites(o));
      setOperations(enrichedOps);
    } catch (err: any) {
      console.error('Error fetching site areas/operation types:', err);
      setError(err.message || 'Failed to load site areas & operation types');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setNameInput('');
    setCodeInput('');
    setDescInput('');
    setAppliesToAllSites(true);
    setSelectedSiteIds(sites.map(s => s.id));
  };

  const handleStartEdit = (item: SiteArea | OperationType) => {
    setEditingId(item.id);
    setNameInput(item.name);
    setCodeInput(item.code);
    setDescInput(item.description || '');
    if (item.applies_to_all_sites || !item.site_ids || item.site_ids.length === 0) {
      setAppliesToAllSites(true);
      setSelectedSiteIds(sites.map(s => s.id));
    } else {
      setAppliesToAllSites(false);
      setSelectedSiteIds(item.site_ids);
    }
    setError(null);
    setSuccess(null);
  };

  const toggleSiteSelection = (siteId: string) => {
    if (appliesToAllSites) {
      setAppliesToAllSites(false);
      setSelectedSiteIds([siteId]);
      return;
    }

    setSelectedSiteIds(prev => {
      const exists = prev.includes(siteId);
      const next = exists ? prev.filter(id => id !== siteId) : [...prev, siteId];
      if (next.length === sites.length && sites.length > 0) {
        setAppliesToAllSites(true);
      }
      return next;
    });
  };

  const handleSelectAllSites = () => {
    setAppliesToAllSites(true);
    setSelectedSiteIds(sites.map(s => s.id));
  };

  const handleDeselectAllSites = () => {
    setAppliesToAllSites(false);
    setSelectedSiteIds([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;

    // Validate that at least one site is selected if not applies to all
    if (!appliesToAllSites && selectedSiteIds.length === 0) {
      setError('Please select at least one site or choose "Apply to All Sites in Tenant".');
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const isArea = activeTab === 'areas';
    const tableName = isArea ? 'site_areas' : 'operation_types';
    const prefix = isArea ? 'AREA' : 'OP';
    const generatedCode = codeInput.trim() || `${prefix}-${nameInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10)}`;

    const targetSiteIds = appliesToAllSites ? sites.map(s => s.id) : selectedSiteIds;
    const primarySiteId = targetSiteIds[0] || sites[0]?.id;

    const formattedDescription = formatAreaDescription(descInput, targetSiteIds, appliesToAllSites);

    const basePayload: Record<string, any> = {
      tenant_id: tenantId,
      site_id: primarySiteId,
      name: nameInput.trim(),
      code: generatedCode,
      description: formattedDescription,
      status: 'active'
    };

    try {
      if (editingId) {
        // Update existing record
        let updateErr: any = null;
        try {
          // Attempt update with site_ids array
          const { error } = await supabase
            .from(tableName)
            .update({
              ...basePayload,
              site_ids: targetSiteIds,
              updated_at: new Date().toISOString()
            })
            .eq('id', editingId);
          updateErr = error;
        } catch {
          updateErr = { code: 'FALLBACK' };
        }

        // If site_ids column isn't in DB yet, fallback without it (metadata is in description)
        if (updateErr) {
          const { error: fallbackErr } = await supabase
            .from(tableName)
            .update({
              ...basePayload,
              updated_at: new Date().toISOString()
            })
            .eq('id', editingId);
          if (fallbackErr) throw fallbackErr;
        }

        setSuccess(`Successfully updated ${isArea ? 'Area' : 'Operation Type'} "${nameInput.trim()}".`);
      } else {
        // Insert new record
        let insertErr: any = null;
        try {
          // Attempt insert with site_ids array
          const { error } = await supabase
            .from(tableName)
            .insert({
              ...basePayload,
              site_ids: targetSiteIds
            });
          insertErr = error;
        } catch {
          insertErr = { code: 'FALLBACK' };
        }

        // Fallback without site_ids column if not in DB yet
        if (insertErr) {
          const { error: fallbackErr } = await supabase
            .from(tableName)
            .insert(basePayload);
          if (fallbackErr) throw fallbackErr;
        }

        setSuccess(`Successfully created ${isArea ? 'Area' : 'Operation Type'} "${nameInput.trim()}".`);
      }

      resetForm();
      await fetchData();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      console.error('Error saving area/operation:', err);
      setError(err.message || 'Failed to save changes.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteArea = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove Area "${name}"?`)) return;
    try {
      const { error: delErr } = await supabase
        .from('site_areas')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (delErr) throw delErr;
      setAreas(prev => prev.filter(a => a.id !== id));
      setSuccess(`Area "${name}" removed.`);
      if (editingId === id) resetForm();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete area');
    }
  };

  const handleDeleteOperation = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove Operation Type "${name}"?`)) return;
    try {
      const { error: delErr } = await supabase
        .from('operation_types')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id);

      if (delErr) throw delErr;
      setOperations(prev => prev.filter(o => o.id !== id));
      setSuccess(`Operation Type "${name}" removed.`);
      if (editingId === id) resetForm();
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete operation type');
    }
  };

  // Filter items for current tab by selected site and search query
  const rawList = activeTab === 'areas' ? areas : operations;
  const filteredList = rawList.filter(item => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = item.name.toLowerCase().includes(q);
      const matchCode = item.code.toLowerCase().includes(q);
      const matchDesc = item.description?.toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchDesc) return false;
    }
    if (siteFilter !== 'all') {
      return doesApplyToSite(item, siteFilter);
    }
    return true;
  });

  const siteMap = new Map(sites.map(s => [s.id, s]));

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
      
      {/* Header & Tenant Context */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-base font-bold text-slate-900">Tenant Areas & Operation Types</h2>
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-md border border-indigo-200">
                Tenant-Level
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Configure standardized zones and task operations once at tenant level, then select which sites they apply to.
            </p>
          </div>
        </div>

        {/* Total Sites Count Badge */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>{sites.length} Active Site{sites.length === 1 ? '' : 's'}</span>
          </div>
        </div>
      </div>

      {/* Tabs & View Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-2">
        <div className="flex space-x-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('areas');
              resetForm();
              setError(null);
              setSuccess(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'areas'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Site Areas ({areas.length})</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('operations');
              resetForm();
              setError(null);
              setSuccess(null);
            }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'operations'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Operation Types ({operations.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={fetchData}
          disabled={loading}
          className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors cursor-pointer"
          title="Refresh List"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-800 flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Filter & List */}
        <div className="lg:col-span-2 space-y-3">
          
          {/* List Toolbar: Search & Site Filter */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={`Search ${activeTab === 'areas' ? 'areas' : 'operation types'}...`}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center space-x-1.5">
              <label className="text-[11px] font-bold text-slate-500 whitespace-nowrap">Filter Site:</label>
              <select
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
                className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
              >
                <option value="all">All Sites ({rawList.length})</option>
                {sites.map(s => {
                  const count = rawList.filter(item => doesApplyToSite(item, s.id)).length;
                  return (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {activeTab === 'areas' ? 'Configured Areas' : 'Configured Operation Types'} ({filteredList.length})
            </h3>
            {siteFilter !== 'all' && (
              <span className="text-[11px] text-indigo-600 font-semibold">
                Filtered by {siteMap.get(siteFilter)?.name || 'Selected Site'}
              </span>
            )}
          </div>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-xl">
              Loading {activeTab === 'areas' ? 'areas' : 'operation types'}...
            </div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-10 px-4 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl space-y-2">
              <p className="font-semibold text-slate-600">
                No {activeTab === 'areas' ? 'site areas' : 'operation types'} found
                {siteFilter !== 'all' ? ' for this site' : ''}.
              </p>
              <p className="text-[11px]">Use the form on the right to add one and select which sites it applies to.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              {filteredList.map(item => {
                const isAllSites = item.applies_to_all_sites || !item.site_ids || item.site_ids.length === 0 || item.site_ids.length >= sites.length;
                const assignedSites = isAllSites ? [] : (item.site_ids || []).map(id => siteMap.get(id)).filter(Boolean);

                return (
                  <div
                    key={item.id}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors ${
                      editingId === item.id ? 'bg-amber-50/40 border-l-4 border-amber-500' : ''
                    }`}
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-xs text-slate-900">{item.name}</span>
                        <span className={`px-1.5 py-0.5 font-mono text-[10px] rounded font-bold ${
                          activeTab === 'areas' ? 'bg-slate-100 text-slate-700' : 'bg-indigo-50 text-indigo-700'
                        }`}>
                          {item.code}
                        </span>
                        {editingId === item.id && (
                          <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">
                            Editing
                          </span>
                        )}
                      </div>

                      {item.description && (
                        <p className="text-[11px] text-slate-500">{item.description}</p>
                      )}

                      {/* Site Applicability Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400 mr-0.5">Applies to:</span>
                        {isAllSites ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <Globe className="w-3 h-3 text-indigo-500" />
                            <span>All Tenant Sites ({sites.length})</span>
                          </span>
                        ) : assignedSites.length === 0 ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600">
                            <Building2 className="w-3 h-3 text-slate-400" />
                            <span>Single Site (Default)</span>
                          </span>
                        ) : (
                          <>
                            {assignedSites.slice(0, 3).map(site => (
                              <span
                                key={site!.id}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-100"
                              >
                                <Building2 className="w-2.5 h-2.5 text-emerald-600" />
                                <span>[{site!.code}] {site!.name}</span>
                              </span>
                            ))}
                            {assignedSites.length > 3 && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                                +{assignedSites.length - 3} more
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center space-x-1 shrink-0 self-end sm:self-center">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(item)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title={`Edit ${activeTab === 'areas' ? 'Area' : 'Operation Type'}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => activeTab === 'areas' ? handleDeleteArea(item.id, item.name) : handleDeleteOperation(item.id, item.name)}
                        className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title={`Delete ${activeTab === 'areas' ? 'Area' : 'Operation Type'}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Add / Edit Form */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5 space-y-4 h-fit">
          <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
              {editingId ? (
                <>
                  <Edit2 className="w-4 h-4 text-amber-600" />
                  <span>Edit {activeTab === 'areas' ? 'Site Area' : 'Operation Type'}</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-indigo-600" />
                  <span>Add {activeTab === 'areas' ? 'Site Area' : 'Operation Type'}</span>
                </>
              )}
            </h3>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center space-x-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* Name Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-600">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder={activeTab === 'areas' ? 'e.g. Loading Bay 1, Cold Store A' : 'e.g. Forklift Unloading, Shunting'}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Code Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-600">
                Code <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder={activeTab === 'areas' ? 'e.g. AREA-BAY1' : 'e.g. OP-FLT'}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                className="w-full text-xs font-mono font-semibold border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Description Input */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-600">
                Description <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <textarea
                rows={2}
                placeholder="Brief description or guidelines..."
                value={descInput}
                onChange={(e) => setDescInput(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            {/* Multi-Select Site Selector */}
            <div className="space-y-2 pt-1 border-t border-slate-200/80">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1">
                  <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Applicable Sites</span>
                </label>
                
                <div className="flex items-center space-x-2 text-[10px]">
                  <button
                    type="button"
                    onClick={handleSelectAllSites}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={handleDeselectAllSites}
                    className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>

              {/* All Sites Option */}
              <div
                onClick={() => {
                  const next = !appliesToAllSites;
                  setAppliesToAllSites(next);
                  if (next) setSelectedSiteIds(sites.map(s => s.id));
                }}
                className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${
                  appliesToAllSites
                    ? 'bg-indigo-50/80 border-indigo-300 text-indigo-950 font-bold'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center space-x-2 text-xs">
                  {appliesToAllSites ? (
                    <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <div>
                    <span className="block leading-tight">Apply to All Sites in Tenant</span>
                    <span className="text-[10px] text-slate-500 font-normal">
                      Automatically applies to all current ({sites.length}) & future sites
                    </span>
                  </div>
                </div>
                <Globe className={`w-4 h-4 ${appliesToAllSites ? 'text-indigo-600' : 'text-slate-300'}`} />
              </div>

              {/* Specific Sites Multi-Select List */}
              {!appliesToAllSites && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between px-0.5">
                    <span>Select Specific Sites:</span>
                    <span className="text-indigo-600 font-mono">
                      {selectedSiteIds.length} of {sites.length} selected
                    </span>
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-slate-200 rounded-lg p-1.5 bg-white">
                    {sites.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-400">
                        No sites configured in tenant.
                      </div>
                    ) : (
                      sites.map(site => {
                        const isSelected = selectedSiteIds.includes(site.id);
                        return (
                          <div
                            key={site.id}
                            onClick={() => toggleSiteSelection(site.id)}
                            className={`flex items-center space-x-2 p-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                              isSelected
                                ? 'bg-indigo-50/70 text-indigo-950 font-medium'
                                : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            {isSelected ? (
                              <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            )}
                            <span className="font-mono text-[10px] font-bold text-slate-500">[{site.code}]</span>
                            <span className="truncate">{site.name}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={submitting || !nameInput.trim()}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center cursor-pointer"
            >
              {submitting
                ? 'Saving...'
                : editingId
                ? `Update ${activeTab === 'areas' ? 'Area' : 'Operation Type'}`
                : `Add ${activeTab === 'areas' ? 'Area' : 'Operation Type'}`}
            </button>
          </form>

          {/* Footer Note matching the user's uploaded image position */}
          <p className="text-[10px] text-slate-400 leading-normal flex items-start space-x-1.5 pt-1">
            <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Bound to your tenant and applied to selected sites. Can be referenced when building tools, questions, and launching observations across those locations.
            </span>
          </p>
        </div>

      </div>

    </div>
  );
};
