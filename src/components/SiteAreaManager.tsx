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
  RefreshCw
} from 'lucide-react';
import { SiteArea, OperationType } from '../types/tool-engine';

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
  const [selectedSiteId, setSelectedSiteId] = useState<string>(sites[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'areas' | 'operations'>('areas');

  const [areas, setAreas] = useState<SiteArea[]>([]);
  const [operations, setOperations] = useState<OperationType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form states
  const [nameInput, setNameInput] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [descInput, setDescInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (sites.length > 0 && !selectedSiteId) {
      setSelectedSiteId(sites[0].id);
    }
  }, [sites]);

  useEffect(() => {
    if (selectedSiteId) {
      fetchData();
    }
  }, [selectedSiteId, tenantId]);

  const fetchData = async () => {
    if (!selectedSiteId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch site areas
      const { data: areasData, error: areasErr } = await supabase
        .from('site_areas')
        .select('*')
        .eq('site_id', selectedSiteId)
        .is('deleted_at', null)
        .order('name');

      if (areasErr) throw areasErr;
      setAreas(areasData || []);

      // Fetch operation types
      const { data: opsData, error: opsErr } = await supabase
        .from('operation_types')
        .select('*')
        .eq('site_id', selectedSiteId)
        .is('deleted_at', null)
        .order('name');

      if (opsErr) throw opsErr;
      setOperations(opsData || []);
    } catch (err: any) {
      console.error('Error fetching site areas/operation types:', err);
      setError(err.message || 'Failed to load site areas & operation types');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateArea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !selectedSiteId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const generatedCode = codeInput.trim() || `AREA-${nameInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10)}`;

    try {
      const { data, error: insertErr } = await supabase
        .from('site_areas')
        .insert({
          tenant_id: tenantId,
          site_id: selectedSiteId,
          name: nameInput.trim(),
          code: generatedCode,
          description: descInput.trim() || null,
          status: 'active'
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setAreas(prev => [...prev, data]);
      setNameInput('');
      setCodeInput('');
      setDescInput('');
      setSuccess(`Area "${data.name}" successfully created.`);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      console.error('Error creating area:', err);
      setError(err.message || 'Failed to create area.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !selectedSiteId) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const generatedCode = codeInput.trim() || `OP-${nameInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10)}`;

    try {
      const { data, error: insertErr } = await supabase
        .from('operation_types')
        .insert({
          tenant_id: tenantId,
          site_id: selectedSiteId,
          name: nameInput.trim(),
          code: generatedCode,
          description: descInput.trim() || null,
          status: 'active'
        })
        .select()
        .single();

      if (insertErr) throw insertErr;

      setOperations(prev => [...prev, data]);
      setNameInput('');
      setCodeInput('');
      setDescInput('');
      setSuccess(`Operation type "${data.name}" successfully created.`);
      if (onUpdated) onUpdated();
    } catch (err: any) {
      console.error('Error creating operation type:', err);
      setError(err.message || 'Failed to create operation type.');
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
      if (onUpdated) onUpdated();
    } catch (err: any) {
      setError(err.message || 'Failed to delete operation type');
    }
  };

  const selectedSite = sites.find(s => s.id === selectedSiteId);

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-2xs space-y-6">
      
      {/* Header & Site Selector */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">Site Areas & Operation Types</h2>
            <p className="text-xs text-slate-500">
              Configure zones, departments, and specific operational task types per site location.
            </p>
          </div>
        </div>

        {/* Site Dropdown */}
        <div className="flex items-center space-x-2">
          <label className="text-xs font-bold text-slate-600 flex items-center">
            <Building2 className="w-3.5 h-3.5 mr-1 text-slate-400" />
            Site:
          </label>
          <select
            value={selectedSiteId}
            onChange={(e) => {
              setSelectedSiteId(e.target.value);
              setNameInput('');
              setCodeInput('');
              setDescInput('');
            }}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {sites.map(s => (
              <option key={s.id} value={s.id}>
                {s.code} - {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex space-x-2">
          <button
            onClick={() => {
              setActiveTab('areas');
              setError(null);
              setSuccess(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 ${
              activeTab === 'areas'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>Site Areas ({areas.length})</span>
          </button>
          <button
            onClick={() => {
              setActiveTab('operations');
              setError(null);
              setSuccess(null);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 ${
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

      {/* Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* List Column */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
            {activeTab === 'areas' ? 'Configured Areas' : 'Configured Operation Types'} for {selectedSite?.name || 'Selected Site'}
          </h3>

          {loading ? (
            <div className="p-8 text-center text-xs text-slate-400">
              Loading {activeTab === 'areas' ? 'areas' : 'operation types'}...
            </div>
          ) : activeTab === 'areas' ? (
            areas.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No site areas configured for this site. Add one using the form.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {areas.map(area => (
                  <div key={area.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-slate-900">{area.name}</span>
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 font-mono text-[10px] rounded font-bold">
                          {area.code}
                        </span>
                      </div>
                      {area.description && (
                        <p className="text-[11px] text-slate-500">{area.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteArea(area.id, area.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete Area"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            operations.length === 0 ? (
              <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No operation types configured for this site. Add one using the form.
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                {operations.map(op => (
                  <div key={op.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                    <div className="space-y-0.5">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-xs text-slate-900">{op.name}</span>
                        <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 font-mono text-[10px] rounded font-bold">
                          {op.code}
                        </span>
                      </div>
                      {op.description && (
                        <p className="text-[11px] text-slate-500">{op.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteOperation(op.id, op.name)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete Operation Type"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Add Form Column */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
            <Plus className="w-4 h-4 text-indigo-600" />
            <span>Add {activeTab === 'areas' ? 'Site Area' : 'Operation Type'}</span>
          </h3>

          <form onSubmit={activeTab === 'areas' ? handleCreateArea : handleCreateOperation} className="space-y-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">Name</label>
              <input
                type="text"
                required
                placeholder={activeTab === 'areas' ? 'e.g. Loading Bay 1, Cold Store A' : 'e.g. Forklift Unloading, Shunting'}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">
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

            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500">
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

            <button
              type="submit"
              disabled={submitting || !nameInput.trim()}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center cursor-pointer"
            >
              {submitting ? 'Creating...' : `Add ${activeTab === 'areas' ? 'Area' : 'Operation Type'}`}
            </button>
          </form>

          <p className="text-[10px] text-slate-400 leading-normal flex items-start space-x-1">
            <Info className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
            <span>
              Bound to selected site and your active tenant. Can be referenced when building tools, questions, and launching observations.
            </span>
          </p>
        </div>

      </div>

    </div>
  );
};
