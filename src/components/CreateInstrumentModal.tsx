// src/components/CreateInstrumentModal.tsx

import React from 'react';
import {
  X,
  Sparkles,
  Layers,
  Building2,
  MapPin,
  Workflow,
  Users,
  RefreshCw
} from 'lucide-react';
import { Site } from '../types/database';
import { SiteArea, OperationType } from '../types/tool-engine';
import { ColleagueRole } from '../types/colleague';

export interface CreateInstrumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: () => Promise<void>;
  name: string;
  setName: (val: string) => void;
  description: string;
  setDescription: (val: string) => void;
  category: string;
  setCategory: (val: string) => void;
  siteIds: string[];
  setSiteIds: React.Dispatch<React.SetStateAction<string[]>>;
  areaIds: string[];
  setAreaIds: React.Dispatch<React.SetStateAction<string[]>>;
  operationTypeIds: string[];
  setOperationTypeIds: React.Dispatch<React.SetStateAction<string[]>>;
  targetRoleIds: string[];
  setTargetRoleIds: React.Dispatch<React.SetStateAction<string[]>>;
  sites: Site[];
  siteAreas: SiteArea[];
  operationTypes: OperationType[];
  colleagueRoles: ColleagueRole[];
  loading: boolean;
}

export const CreateInstrumentModal: React.FC<CreateInstrumentModalProps> = ({
  isOpen,
  onClose,
  onCreate,
  name,
  setName,
  description,
  setDescription,
  category,
  setCategory,
  siteIds,
  setSiteIds,
  areaIds,
  setAreaIds,
  operationTypeIds,
  setOperationTypeIds,
  targetRoleIds,
  setTargetRoleIds,
  sites,
  siteAreas,
  operationTypes,
  colleagueRoles,
  loading
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="create-instrument-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        id="create-instrument-modal-card"
        className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Create New Instrument
              </h2>
              <p className="text-xs text-slate-400">
                Configure observation forms, inspection checklists, and scope parameters
              </p>
            </div>
          </div>
          <button
            id="close-create-instrument-modal-btn"
            onClick={onClose}
            disabled={loading}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-slate-700 divide-y divide-slate-100">
          
          {/* Section 1: General Details */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Basic Instrument Details</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2 space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Instrument Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="instrument-name-input"
                  type="text"
                  placeholder="e.g. Forklift Pre-Use Inspection"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs font-semibold border border-slate-200 rounded-xl p-2.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                  Category
                </label>
                <select
                  id="instrument-category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-xl p-2.5 bg-white text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="safety">Safety Observation</option>
                  <option value="audit">Safety Audit</option>
                  <option value="inspection">Facility Inspection</option>
                  <option value="risk_assessment">Risk Assessment</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Description / Purpose
              </label>
              <textarea
                id="instrument-desc-input"
                placeholder="e.g. Conducted daily by operator before initiating warehouse transport tasks."
                value={description}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl p-2.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Section 2: Physical & Operational Scopes */}
          <div className="space-y-4 pt-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              <span>Scope & Facility Applicability</span>
            </h3>

            {/* Site Scope Checkbox Options */}
            {sites && sites.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-bold uppercase text-slate-700 flex items-center space-x-1">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Physical Sites ({siteIds.length === 0 ? 'All Sites' : `${siteIds.length} selected`})</span>
                  </label>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSiteIds(sites.map(s => s.id))}
                      className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSiteIds([])}
                      className="text-[10px] text-slate-500 hover:underline font-semibold cursor-pointer"
                    >
                      All Sites (Global)
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-slate-500">
                  Leave unselected for global tenant availability, or target specific physical sites.
                </p>
                <div className="max-h-28 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                  {sites.map(site => {
                    const checked = siteIds.includes(site.id);
                    return (
                      <label
                        key={site.id}
                        className={`flex items-center space-x-2 p-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                          checked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSiteIds(prev => [...prev, site.id]);
                            } else {
                              setSiteIds(prev => prev.filter(id => id !== site.id));
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span className="font-medium text-slate-800">{site.name}</span>
                        {site.city && <span className="text-[10px] text-slate-400">({site.city})</span>}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Site Areas Checkbox Options */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase text-slate-700 flex items-center space-x-1">
                  <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Site Areas / Zones ({areaIds.length} selected)</span>
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setAreaIds(siteAreas.map(a => a.id))}
                    className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setAreaIds([])}
                    className="text-[10px] text-slate-500 hover:underline font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Select zones applicable to this instrument. These will appear as initial options in the form to filter matching questions.
              </p>
              {siteAreas.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic">No site areas configured.</p>
              ) : (
                <div className="max-h-28 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                  {siteAreas.map(area => {
                    const checked = areaIds.includes(area.id);
                    return (
                      <label
                        key={area.id}
                        className={`flex items-center space-x-2 p-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                          checked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setAreaIds(prev => [...prev, area.id]);
                            } else {
                              setAreaIds(prev => prev.filter(id => id !== area.id));
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>
                          <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1 py-0.5 rounded mr-1.5">
                            {area.code}
                          </span>
                          {area.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Operation Types Checkbox Options */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[11px] font-bold uppercase text-slate-700 flex items-center space-x-1">
                  <Workflow className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Operation Types ({operationTypeIds.length} selected)</span>
                </label>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setOperationTypeIds(operationTypes.map(o => o.id))}
                    className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setOperationTypeIds([])}
                    className="text-[10px] text-slate-500 hover:underline font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500">
                Select operational scopes applicable to this instrument.
              </p>
              {operationTypes.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic">No operation types configured.</p>
              ) : (
                <div className="max-h-28 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                  {operationTypes.map(op => {
                    const checked = operationTypeIds.includes(op.id);
                    return (
                      <label
                        key={op.id}
                        className={`flex items-center space-x-2 p-1.5 rounded-lg cursor-pointer transition-colors text-xs ${
                          checked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setOperationTypeIds(prev => [...prev, op.id]);
                            } else {
                              setOperationTypeIds(prev => prev.filter(id => id !== op.id));
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                        />
                        <span>
                          <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1 py-0.5 rounded mr-1.5">
                            {op.code}
                          </span>
                          {op.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Colleague Roles */}
          <div className="space-y-3 pt-5">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold uppercase text-slate-800 flex items-center space-x-1.5">
                <Users className="w-3.5 h-3.5 text-indigo-600" />
                <span>Applicable Colleague Roles ({targetRoleIds.length} selected)</span>
              </label>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setTargetRoleIds(colleagueRoles.map(r => r.code))}
                  className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => setTargetRoleIds([])}
                  className="text-[10px] text-slate-500 hover:underline font-semibold cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="text-[10px] text-slate-500">
              Select which colleague roles this instrument applies to during mobile observations.
            </p>
            <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
              {colleagueRoles.map(role => {
                const checked = targetRoleIds.includes(role.code) || targetRoleIds.includes(role.id);
                return (
                  <label
                    key={role.id || role.code}
                    className={`flex items-start space-x-2.5 p-2 rounded-lg cursor-pointer transition-colors text-xs ${
                      checked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setTargetRoleIds(prev => [...prev, role.code]);
                        } else {
                          setTargetRoleIds(prev => prev.filter(r => r !== role.code && r !== role.id));
                        }
                      }}
                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 mt-0.5 cursor-pointer"
                    />
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold">{role.name}</span>
                        {role.is_can_observe && (
                          <span className="text-[8px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-semibold">
                            Observer
                          </span>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-[10px] text-slate-500 leading-snug">{role.description}</p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-end space-x-3 shrink-0">
          <button
            id="cancel-create-instrument-btn"
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            id="submit-create-instrument-btn"
            type="button"
            onClick={onCreate}
            disabled={loading || !name.trim()}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5 disabled:opacity-50 transition-colors"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                <span>Creating Instrument...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1" />
                <span>Create Instrument & Version 1</span>
              </>
            )}
          </button>
        </div>

      </div>
    </div>
  );
};
