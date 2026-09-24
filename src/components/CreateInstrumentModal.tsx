// src/components/CreateInstrumentModal.tsx

import React, { useEffect, useState, useMemo } from 'react';
import {
  X,
  Sparkles,
  Layers,
  Building2,
  Users,
  RefreshCw,
  CheckSquare,
  Square,
  Globe,
  Sliders,
  Check,
  Search,
  Tag,
  MapPin,
  Workflow
} from 'lucide-react';
import { Site } from '../types/database';
import { SiteArea, OperationType } from '../types/tool-engine';
import { ColleagueRole } from '../types/colleague';
import { CustomScopeType, CustomScopeOption } from '../types/custom-types';
import { filterOptionsForSites } from '../lib/custom-types-service';

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
  customScopeSelections?: Record<string, string[]>;
  setCustomScopeSelections?: React.Dispatch<React.SetStateAction<Record<string, string[]>>>;
  customTypes?: CustomScopeType[];
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
  customScopeSelections = {},
  setCustomScopeSelections,
  customTypes = [],
  sites,
  siteAreas,
  operationTypes,
  colleagueRoles,
  loading
}) => {
  const [siteSearch, setSiteSearch] = useState('');
  const [roleSearch, setRoleSearch] = useState('');
  const [customTypeSearches, setCustomTypeSearches] = useState<Record<string, string>>({});

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loading, onClose]);

  if (!isOpen) return null;

  // Filtered physical sites
  const filteredSites = sites.filter(s =>
    s.name.toLowerCase().includes(siteSearch.toLowerCase()) ||
    (s.code && s.code.toLowerCase().includes(siteSearch.toLowerCase())) ||
    (s.city && s.city.toLowerCase().includes(siteSearch.toLowerCase()))
  );

  const filteredRoles = colleagueRoles.filter(r =>
    r.name.toLowerCase().includes(roleSearch.toLowerCase()) ||
    (r.code && r.code.toLowerCase().includes(roleSearch.toLowerCase())) ||
    (r.description && r.description.toLowerCase().includes(roleSearch.toLowerCase()))
  );

  // Helper to handle toggling custom type options
  const handleToggleCustomOption = (type: CustomScopeType, opt: CustomScopeOption) => {
    const isAreaGroup = type.code === 'AREAS' || type.title.toLowerCase().includes('area');
    const isOpGroup = type.code === 'OPERATIONS' || type.title.toLowerCase().includes('operation');

    if (setCustomScopeSelections) {
      setCustomScopeSelections(prev => {
        const currentSelected = prev[type.id] || [];
        const isSelected = currentSelected.includes(opt.id);
        const updated = isSelected
          ? currentSelected.filter(id => id !== opt.id)
          : [...currentSelected, opt.id];
        return {
          ...prev,
          [type.id]: updated
        };
      });
    }

    // Sync with legacy areaIds and operationTypeIds
    if (isAreaGroup) {
      const isSelected = areaIds.includes(opt.id) || areaIds.includes(opt.code);
      if (isSelected) {
        setAreaIds(prev => prev.filter(id => id !== opt.id && id !== opt.code));
      } else {
        setAreaIds(prev => [...prev, opt.id]);
      }
    } else if (isOpGroup) {
      const isSelected = operationTypeIds.includes(opt.id) || operationTypeIds.includes(opt.code);
      if (isSelected) {
        setOperationTypeIds(prev => prev.filter(id => id !== opt.id && id !== opt.code));
      } else {
        setOperationTypeIds(prev => [...prev, opt.id]);
      }
    }
  };

  const handleSelectAllCustomType = (type: CustomScopeType, applicableOpts: CustomScopeOption[]) => {
    const isAreaGroup = type.code === 'AREAS' || type.title.toLowerCase().includes('area');
    const isOpGroup = type.code === 'OPERATIONS' || type.title.toLowerCase().includes('operation');

    if (setCustomScopeSelections) {
      setCustomScopeSelections(prev => ({
        ...prev,
        [type.id]: applicableOpts.map(o => o.id)
      }));
    }

    if (isAreaGroup) {
      setAreaIds(applicableOpts.map(o => o.id));
    } else if (isOpGroup) {
      setOperationTypeIds(applicableOpts.map(o => o.id));
    }
  };

  const handleClearCustomType = (type: CustomScopeType) => {
    const isAreaGroup = type.code === 'AREAS' || type.title.toLowerCase().includes('area');
    const isOpGroup = type.code === 'OPERATIONS' || type.title.toLowerCase().includes('operation');

    if (setCustomScopeSelections) {
      setCustomScopeSelections(prev => ({
        ...prev,
        [type.id]: []
      }));
    }

    if (isAreaGroup) {
      setAreaIds([]);
    } else if (isOpGroup) {
      setOperationTypeIds([]);
    }
  };

  const getCustomTypeIcon = (title: string, code: string) => {
    const lower = (title + ' ' + code).toLowerCase();
    if (lower.includes('area') || lower.includes('zone')) {
      return <MapPin className="w-4 h-4 text-indigo-600" />;
    }
    if (lower.includes('op') || lower.includes('workflow') || lower.includes('task')) {
      return <Workflow className="w-4 h-4 text-indigo-600" />;
    }
    return <Tag className="w-4 h-4 text-indigo-600" />;
  };

  // Check which custom options are selected
  const isOptionSelected = (typeId: string, opt: CustomScopeOption, typeCode: string, typeTitle: string) => {
    const isAreaGroup = typeCode === 'AREAS' || typeTitle.toLowerCase().includes('area');
    const isOpGroup = typeCode === 'OPERATIONS' || typeTitle.toLowerCase().includes('operation');

    if (customScopeSelections[typeId]?.includes(opt.id)) return true;
    if (isAreaGroup && (areaIds.includes(opt.id) || areaIds.includes(opt.code))) return true;
    if (isOpGroup && (operationTypeIds.includes(opt.id) || operationTypeIds.includes(opt.code))) return true;
    return false;
  };

  // Calculate scope summary tallies
  const customScopeSummaryParts = customTypes.map(ct => {
    const count = (customScopeSelections[ct.id] || []).length ||
      (ct.code === 'AREAS' ? areaIds.length : ct.code === 'OPERATIONS' ? operationTypeIds.length : 0);
    return `${count} ${ct.title}`;
  });

  return (
    <div
      id="create-instrument-modal-overlay"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex justify-end animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) {
          onClose();
        }
      }}
    >
      <div
        id="create-instrument-modal-card"
        className="w-full sm:w-[90vw] md:w-[85vw] lg:w-[80vw] max-w-[1550px] h-full bg-white shadow-2xl flex flex-col animate-slide-in-right overflow-hidden border-l border-slate-200"
      >
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 sm:px-8 py-4 flex items-center justify-between shrink-0 border-b border-slate-800">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Create New Instrument
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                  80% Workspace
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure observation forms, inspection checklists, and tenant custom types
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline-block text-[11px] font-mono text-slate-400 bg-slate-800 px-2 py-1 rounded">
              Esc to close
            </span>
            <button
              id="close-create-instrument-modal-btn"
              onClick={onClose}
              disabled={loading}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer disabled:opacity-50"
              title="Close Panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Body taking advantage of the expansive 80% screen width */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-xs text-slate-700 bg-slate-50/40">
          
          {/* Section 1: General Details */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center space-x-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <span>Basic Instrument Details</span>
              </h3>
              <span className="text-[11px] text-slate-400">Core identity and classification</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="md:col-span-2 space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                  <span>Instrument Name <span className="text-red-500">*</span></span>
                  <span className="text-[10px] font-normal text-slate-400">Descriptive audit or inspection title</span>
                </label>
                <input
                  id="instrument-name-input"
                  type="text"
                  placeholder="e.g. Forklift Pre-Use Inspection, Daily Bay Safety Walk"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full text-xs font-semibold border border-slate-200 rounded-xl px-3.5 py-2.5 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700">
                  Category
                </label>
                <select
                  id="instrument-category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded-xl px-3.5 py-2.5 bg-white text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs"
                >
                  <option value="safety">Safety Observation</option>
                  <option value="audit">Safety Audit</option>
                  <option value="inspection">Facility Inspection</option>
                  <option value="risk_assessment">Risk Assessment</option>
                </select>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center justify-between">
                <span>Description / Operational Purpose</span>
                <span className="text-[10px] font-normal text-slate-400">Optional context for auditors and observers</span>
              </label>
              <textarea
                id="instrument-desc-input"
                placeholder="e.g. Conducted daily by operator before initiating warehouse transport tasks to identify mechanical and environmental hazards."
                value={description}
                rows={2}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full text-xs border border-slate-200 rounded-xl p-3 text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs leading-relaxed"
              />
            </div>
          </div>

          {/* Section 2: Facility & Custom Scopes Applicability */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center space-x-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <span>Scope & Tenant Custom Types</span>
              </h3>
              <p className="text-[11px] text-slate-500">
                Filter which physical sites and custom scope types this checklist activates for
              </p>
            </div>

            {/* Grid of Scope Cards: Physical Sites + Dynamic Custom Types */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              
              {/* Card 1: Physical Sites */}
              <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs flex flex-col h-[360px]">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center space-x-1.5">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-xs text-slate-900">Physical Sites</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                    {siteIds.length === 0 ? 'All Sites (Global)' : `${siteIds.length} of ${sites.length}`}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-2 pb-1 text-[11px]">
                  <span className="text-slate-400 text-[10px]">Filter target locations:</span>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setSiteIds(sites.map(s => s.id))}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSiteIds([])}
                      className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                    >
                      All Sites (Global)
                    </button>
                  </div>
                </div>

                {sites.length > 5 && (
                  <div className="relative my-1.5">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search sites..."
                      value={siteSearch}
                      onChange={(e) => setSiteSearch(e.target.value)}
                      className="w-full text-[11px] pl-7 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                )}

                <div className="flex-1 overflow-y-auto space-y-1 pt-1.5 pr-1">
                  {/* Global Option */}
                  <div
                    onClick={() => setSiteIds([])}
                    className={`flex items-center space-x-2 p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                      siteIds.length === 0
                        ? 'bg-indigo-50 border border-indigo-200 text-indigo-950 font-semibold'
                        : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                    }`}
                  >
                    <Globe className={`w-3.5 h-3.5 ${siteIds.length === 0 ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <div className="flex-1">
                      <span className="block leading-tight">All Sites (Tenant Global)</span>
                      <span className="text-[10px] text-slate-400 font-normal">Active across all physical sites</span>
                    </div>
                    {siteIds.length === 0 && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                  </div>

                  {filteredSites.map(site => {
                    const checked = siteIds.includes(site.id);
                    return (
                      <div
                        key={site.id}
                        onClick={() => {
                          if (checked) {
                            setSiteIds(prev => prev.filter(id => id !== site.id));
                          } else {
                            setSiteIds(prev => [...prev, site.id]);
                          }
                        }}
                        className={`flex items-center space-x-2 p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                          checked
                            ? 'bg-indigo-50/70 border border-indigo-200 text-indigo-950 font-semibold'
                            : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                        )}
                        <div className="flex-1 truncate">
                          <span className="font-mono text-[10px] text-slate-400 mr-1.5">[{site.code}]</span>
                          <span>{site.name}</span>
                          {site.city && <span className="text-[10px] text-slate-400 ml-1">({site.city})</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Dynamic Cards: Render Each Custom Type Configured by Tenant Admin */}
              {customTypes.length > 0 ? (
                customTypes.map(ct => {
                  const applicableOptions = filterOptionsForSites(ct.options, siteIds);
                  const searchVal = customTypeSearches[ct.id] || '';
                  const filteredOptions = applicableOptions.filter(o =>
                    o.name.toLowerCase().includes(searchVal.toLowerCase()) ||
                    o.code.toLowerCase().includes(searchVal.toLowerCase())
                  );

                  const selectedCount = applicableOptions.filter(o =>
                    isOptionSelected(ct.id, o, ct.code, ct.title)
                  ).length;

                  return (
                    <div
                      key={ct.id}
                      className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs flex flex-col h-[360px]"
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                        <div className="flex items-center space-x-1.5">
                          {getCustomTypeIcon(ct.title, ct.code)}
                          <span className="font-bold text-xs text-slate-900">{ct.title}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {selectedCount} of {applicableOptions.length} selected
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 pb-1 text-[11px]">
                        <span className="text-slate-400 text-[10px]">Filter for instrument:</span>
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => handleSelectAllCustomType(ct, applicableOptions)}
                            className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                          >
                            Select All
                          </button>
                          <span className="text-slate-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleClearCustomType(ct)}
                            className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {applicableOptions.length > 4 && (
                        <div className="relative my-1.5">
                          <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <input
                            type="text"
                            placeholder={`Search ${ct.title.toLowerCase()}...`}
                            value={searchVal}
                            onChange={(e) => setCustomTypeSearches(prev => ({ ...prev, [ct.id]: e.target.value }))}
                            className="w-full text-[11px] pl-7 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          />
                        </div>
                      )}

                      <div className="flex-1 overflow-y-auto space-y-1 pt-1.5 pr-1">
                        {applicableOptions.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-center text-xs text-slate-400 p-4">
                            No {ct.title.toLowerCase()} apply to the selected physical sites.
                          </div>
                        ) : filteredOptions.length === 0 ? (
                          <div className="h-full flex items-center justify-center text-center text-xs text-slate-400 p-4">
                            No matching {ct.title.toLowerCase()} found.
                          </div>
                        ) : (
                          filteredOptions.map(opt => {
                            const checked = isOptionSelected(ct.id, opt, ct.code, ct.title);
                            return (
                              <div
                                key={opt.id}
                                onClick={() => handleToggleCustomOption(ct, opt)}
                                className={`flex items-center space-x-2 p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                                  checked
                                    ? 'bg-indigo-50/70 border border-indigo-200 text-indigo-950 font-semibold'
                                    : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                                }`}
                              >
                                {checked ? (
                                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                ) : (
                                  <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                )}
                                <div className="flex-1 truncate">
                                  <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 py-0.5 rounded mr-1.5 font-bold">
                                    {opt.code}
                                  </span>
                                  <span>{opt.name}</span>
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                /* Fallback to default Site Areas and Operation Types if customTypes not yet loaded */
                <>
                  {/* Site Areas */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs flex flex-col h-[360px]">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center space-x-1.5">
                        <MapPin className="w-4 h-4 text-indigo-600" />
                        <span className="font-bold text-xs text-slate-900">Site Areas / Zones</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {areaIds.length} of {siteAreas.length} selected
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 pb-1 text-[11px]">
                      <span className="text-slate-400 text-[10px]">Filter applicable zones:</span>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setAreaIds(siteAreas.map(a => a.id))}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setAreaIds([])}
                          className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1 pt-1.5 pr-1">
                      {siteAreas.map(area => {
                        const checked = areaIds.includes(area.id);
                        return (
                          <div
                            key={area.id}
                            onClick={() => {
                              if (checked) {
                                setAreaIds(prev => prev.filter(id => id !== area.id));
                              } else {
                                setAreaIds(prev => [...prev, area.id]);
                              }
                            }}
                            className={`flex items-center space-x-2 p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                              checked
                                ? 'bg-indigo-50/70 border border-indigo-200 text-indigo-950 font-semibold'
                                : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            )}
                            <div className="flex-1 truncate">
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 py-0.5 rounded mr-1.5 font-bold">
                                {area.code}
                              </span>
                              <span>{area.name}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Operation Types */}
                  <div className="bg-white border border-slate-200 rounded-2xl p-4.5 shadow-2xs flex flex-col h-[360px]">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                      <div className="flex items-center space-x-1.5">
                        <Workflow className="w-4 h-4 text-indigo-600" />
                        <span className="font-bold text-xs text-slate-900">Operation Types</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {operationTypeIds.length} of {operationTypes.length} selected
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 pb-1 text-[11px]">
                      <span className="text-slate-400 text-[10px]">Filter task scopes:</span>
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={() => setOperationTypeIds(operationTypes.map(o => o.id))}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                        >
                          Select All
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setOperationTypeIds([])}
                          className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1 pt-1.5 pr-1">
                      {operationTypes.map(op => {
                        const checked = operationTypeIds.includes(op.id);
                        return (
                          <div
                            key={op.id}
                            onClick={() => {
                              if (checked) {
                                setOperationTypeIds(prev => prev.filter(id => id !== op.id));
                              } else {
                                setOperationTypeIds(prev => [...prev, op.id]);
                              }
                            }}
                            className={`flex items-center space-x-2 p-2 rounded-xl cursor-pointer text-xs transition-colors ${
                              checked
                                ? 'bg-indigo-50/70 border border-indigo-200 text-indigo-950 font-semibold'
                                : 'hover:bg-slate-50 text-slate-700 border border-transparent'
                            }`}
                          >
                            {checked ? (
                              <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            ) : (
                              <Square className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                            )}
                            <div className="flex-1 truncate">
                              <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1 py-0.5 rounded mr-1.5 font-bold">
                                {op.code}
                              </span>
                              <span>{op.name}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

            </div>
          </div>

          {/* Section 3: Colleague Roles */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  Applicable Colleague Roles ({targetRoleIds.length} of {colleagueRoles.length} selected)
                </h3>
              </div>

              <div className="flex items-center space-x-3">
                {colleagueRoles.length > 6 && (
                  <div className="relative">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="Search roles..."
                      value={roleSearch}
                      onChange={(e) => setRoleSearch(e.target.value)}
                      className="text-[11px] pl-7 pr-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-36"
                    />
                  </div>
                )}
                <div className="flex items-center space-x-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setTargetRoleIds(colleagueRoles.map(r => r.code))}
                    className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                  >
                    Select All
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    type="button"
                    onClick={() => setTargetRoleIds([])}
                    className="text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                  >
                    Clear
                  </button>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              Select which personnel roles this inspection instrument applies to during operational safety observations.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-56 overflow-y-auto pr-1">
              {filteredRoles.map(role => {
                const checked = targetRoleIds.includes(role.code) || targetRoleIds.includes(role.id);
                return (
                  <div
                    key={role.id || role.code}
                    onClick={() => {
                      if (checked) {
                        setTargetRoleIds(prev => prev.filter(r => r !== role.code && r !== role.id));
                      } else {
                        setTargetRoleIds(prev => [...prev, role.code]);
                      }
                    }}
                    className={`flex items-start space-x-3 p-3 rounded-xl cursor-pointer border transition-colors ${
                      checked
                        ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-700'
                    }`}
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-bold text-xs truncate">{role.name}</span>
                        {role.is_can_observe && (
                          <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-semibold shrink-0">
                            Observer
                          </span>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-[10px] text-slate-500 leading-snug line-clamp-2 mt-0.5">
                          {role.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer with summary and action buttons */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4 shrink-0">
          <div className="flex items-center space-x-2 text-[11px] text-slate-600">
            <span className="font-bold text-slate-900">Configured Scope:</span>
            <span>
              {siteIds.length === 0 ? 'All Physical Sites' : `${siteIds.length} Site${siteIds.length === 1 ? '' : 's'}`}
              {customScopeSummaryParts.length > 0
                ? ' · ' + customScopeSummaryParts.join(' · ')
                : ` · ${areaIds.length} Areas · ${operationTypeIds.length} Operation Types`}
              {' · '}
              {targetRoleIds.length} Role{targetRoleIds.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex items-center space-x-3">
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
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-2 disabled:opacity-50 transition-colors"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Creating Instrument & Version...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Create Instrument & Version 1</span>
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
