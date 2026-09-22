// src/components/AddQuestionsFromBankModal.tsx

import React, { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
  X,
  Search,
  CheckSquare,
  Square,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Layers,
  Building2,
  Edit3,
  RotateCcw,
  ShieldCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from 'lucide-react';
import { Tool, ToolSection, ToolQuestion, SiteArea, OperationType, AnswerType } from '../types/tool-engine';
import { Site } from '../types/database';

export interface QuestionAmendment {
  question_text: string;
  hint_text: string;
  answer_type: AnswerType;
  is_required: boolean;
}

interface AddQuestionsFromBankModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetTool: Tool;
  targetVersionId: string;
  sections: ToolSection[];
  defaultSectionId?: string;
  existingQuestions: ToolQuestion[];
  allBankQuestions: (ToolQuestion & {
    tool_name?: string;
    tool_names?: string[];
    tool_id?: string;
    area_ids?: string[];
    operation_type_ids?: string[];
    site_ids?: string[];
    site_names?: string[];
  })[];
  sites: Site[];
  siteAreas: SiteArea[];
  operationTypes: OperationType[];
  onQuestionsAdded: () => Promise<void> | void;
}

const DEFAULT_OPTIONS_PRESETS: Record<string, { label: string; value: string; score: number | null; is_flagged: boolean }[]> = {
  pass_fail: [
    { label: 'Pass', value: 'pass', score: 100, is_flagged: false },
    { label: 'Fail', value: 'fail', score: 0, is_flagged: true },
    { label: 'N/A', value: 'na', score: null, is_flagged: false }
  ],
  yes_no: [
    { label: 'Yes', value: 'yes', score: 100, is_flagged: false },
    { label: 'No', value: 'no', score: 0, is_flagged: true },
    { label: 'N/A', value: 'na', score: null, is_flagged: false }
  ],
  compliant: [
    { label: 'Compliant', value: 'compliant', score: 100, is_flagged: false },
    { label: 'Non-Compliant', value: 'non_compliant', score: 0, is_flagged: true },
    { label: 'N/A', value: 'na', score: null, is_flagged: false }
  ]
};

export const AddQuestionsFromBankModal: React.FC<AddQuestionsFromBankModalProps> = ({
  isOpen,
  onClose,
  targetTool,
  targetVersionId,
  sections,
  defaultSectionId,
  existingQuestions,
  allBankQuestions,
  sites,
  siteAreas,
  operationTypes,
  onQuestionsAdded
}) => {
  if (!isOpen) return null;

  const [selectedSectionId, setSelectedSectionId] = useState<string>(
    defaultSectionId || sections[0]?.id || ''
  );
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [expandedAmendIds, setExpandedAmendIds] = useState<string[]>([]);
  const [amendments, setAmendments] = useState<Record<string, QuestionAmendment>>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSiteId, setFilterSiteId] = useState<string>('');
  const [filterAreaId, setFilterAreaId] = useState<string>('');
  const [filterOpTypeId, setFilterOpTypeId] = useState<string>('');
  const [onlyMatchingCriteria, setOnlyMatchingCriteria] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteMap = useMemo(() => new Map(sites.map(s => [s.id, s.name])), [sites]);
  const areaMap = useMemo(() => new Map(siteAreas.map(a => [a.id, a.name])), [siteAreas]);
  const opMap = useMemo(() => new Map(operationTypes.map(o => [o.id, o.name])), [operationTypes]);

  // Existing question texts in this version to prevent accidental duplicate insertions
  const existingTexts = useMemo(
    () => new Set(existingQuestions.map(q => q.question_text.trim().toLowerCase())),
    [existingQuestions]
  );

  const toolSiteIds = targetTool.site_ids || [];
  const toolAreaIds = targetTool.area_ids || [];
  const toolOpTypeIds = targetTool.operation_type_ids || [];

  // Filter bank questions
  const filteredQuestions = useMemo(() => {
    return allBankQuestions.filter(q => {
      // 1. If onlyMatchingCriteria is toggled on, check overlap with tool's configured site/area/ops
      if (onlyMatchingCriteria) {
        const siteMatch =
          toolSiteIds.length === 0 ||
          !q.site_ids?.length ||
          q.site_ids.some(sid => toolSiteIds.includes(sid));

        const areaMatch =
          toolAreaIds.length === 0 ||
          !q.area_ids?.length ||
          q.area_ids.some(aid => toolAreaIds.includes(aid));

        const opMatch =
          toolOpTypeIds.length === 0 ||
          !q.operation_type_ids?.length ||
          q.operation_type_ids.some(oid => toolOpTypeIds.includes(oid));

        if (!siteMatch || !areaMatch || !opMatch) return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const textMatch = q.question_text.toLowerCase().includes(query);
        const hintMatch = q.hint_text?.toLowerCase().includes(query);
        if (!textMatch && !hintMatch) return false;
      }

      // 3. Dropdown filters
      if (filterSiteId && !q.site_ids?.includes(filterSiteId)) return false;
      if (filterAreaId && !q.area_ids?.includes(filterAreaId) && q.area_id !== filterAreaId) return false;
      if (filterOpTypeId && !q.operation_type_ids?.includes(filterOpTypeId) && q.operation_type_id !== filterOpTypeId) return false;

      return true;
    });
  }, [
    allBankQuestions,
    onlyMatchingCriteria,
    searchQuery,
    filterSiteId,
    filterAreaId,
    filterOpTypeId,
    toolSiteIds,
    toolAreaIds,
    toolOpTypeIds
  ]);

  const handleToggleSelectAll = (select: boolean) => {
    if (select) {
      const selectable = filteredQuestions
        .filter(q => !existingTexts.has(q.question_text.trim().toLowerCase()))
        .map(q => q.id);
      setSelectedQuestionIds(selectable);
    } else {
      setSelectedQuestionIds([]);
    }
  };

  const handleToggleQuestion = (id: string) => {
    setSelectedQuestionIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleExpandAmend = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    // Auto-select question when user opens amend panel
    if (!selectedQuestionIds.includes(id)) {
      setSelectedQuestionIds(prev => [...prev, id]);
    }
    setExpandedAmendIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const getEffectiveQuestionData = (q: ToolQuestion) => {
    const amend = amendments[q.id];
    return {
      question_text: amend?.question_text !== undefined ? amend.question_text : q.question_text,
      hint_text: amend?.hint_text !== undefined ? amend.hint_text : (q.hint_text || ''),
      answer_type: amend?.answer_type !== undefined ? amend.answer_type : q.answer_type,
      is_required: amend?.is_required !== undefined ? amend.is_required : (q.is_required ?? true),
      isAmended: Boolean(amend)
    };
  };

  const handleUpdateAmendment = (id: string, field: keyof QuestionAmendment, value: any, baseQ: ToolQuestion) => {
    setAmendments(prev => {
      const current = prev[id] || {
        question_text: baseQ.question_text,
        hint_text: baseQ.hint_text || '',
        answer_type: baseQ.answer_type,
        is_required: baseQ.is_required ?? true
      };
      return {
        ...prev,
        [id]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  const handleResetAmendment = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setAmendments(prev => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const handleAddQuestions = async () => {
    if (selectedQuestionIds.length === 0) {
      setError('Please select at least one question to add.');
      return;
    }

    if (!selectedSectionId) {
      setError('Please select a section to place the questions in.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const selectedQuestions = allBankQuestions.filter(q =>
        selectedQuestionIds.includes(q.id)
      );

      // Fetch options for these questions
      const { data: sourceOptions } = await supabase
        .from('question_options')
        .select('*')
        .in('question_id', selectedQuestionIds)
        .order('order_index', { ascending: true });

      const currentCount = existingQuestions.length;

      // Insert selected questions into tool_questions for this target instrument
      for (let idx = 0; idx < selectedQuestions.length; idx++) {
        const sq = selectedQuestions[idx];
        const nextOrder = currentCount + idx;
        const effective = getEffectiveQuestionData(sq);

        const { data: newQ, error: iErr } = await supabase
          .from('tool_questions')
          .insert({
            tool_version_id: targetVersionId,
            section_id: selectedSectionId,
            tenant_id: targetTool.tenant_id,
            question_code: sq.question_code || `Q_${Date.now().toString().slice(-4)}_${idx}`,
            question_text: effective.question_text.trim(),
            hint_text: effective.hint_text?.trim() || null,
            answer_type: effective.answer_type,
            is_required: effective.is_required,
            order_index: nextOrder,
            site_ids: sq.site_ids || [],
            area_ids: sq.area_ids || [],
            operation_type_ids: sq.operation_type_ids || [],
            tool_ids: [targetTool.id],
            metadata: {
              imported_from_bank: true,
              source_master_question_id: sq.id,
              is_amended_from_master: effective.isAmended,
              original_master_question_text: sq.question_text
            }
          })
          .select()
          .single();

        if (iErr || !newQ) throw iErr || new Error('Failed to add question to instrument.');

        // Copy or synthesize options for choice/boolean types
        const opts = (sourceOptions || []).filter(o => o.question_id === sq.id);
        
        if (effective.answer_type === sq.answer_type && opts.length > 0) {
          // Carry forward source options
          const optPayload = opts.map(o => ({
            question_id: newQ.id,
            tenant_id: targetTool.tenant_id,
            label: o.label,
            value: o.value,
            score: o.score,
            is_flagged: o.is_flagged,
            order_index: o.order_index
          }));
          await supabase.from('question_options').insert(optPayload);
        } else if (['boolean', 'single_choice', 'multiple_choice'].includes(effective.answer_type)) {
          // If answer type was amended or no options existed, generate appropriate defaults
          const presetType = effective.answer_type === 'boolean' ? 'yes_no' : 'pass_fail';
          const defaults = DEFAULT_OPTIONS_PRESETS[presetType] || DEFAULT_OPTIONS_PRESETS.pass_fail;
          const optPayload = defaults.map((d, dIdx) => ({
            question_id: newQ.id,
            tenant_id: targetTool.tenant_id,
            label: d.label,
            value: d.value,
            score: d.score,
            is_flagged: d.is_flagged,
            order_index: dIdx
          }));
          await supabase.from('question_options').insert(optPayload);
        }
      }

      await onQuestionsAdded();
      onClose();
    } catch (err: any) {
      console.error('Error adding questions from Master Bank:', err);
      setError(err?.message || 'Failed to add questions to instrument.');
    } finally {
      setSubmitting(false);
    }
  };

  const amendedCount = useMemo(() => {
    return Object.keys(amendments).filter(id => selectedQuestionIds.includes(id)).length;
  }, [amendments, selectedQuestionIds]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-600/30 text-indigo-400 rounded-xl border border-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Add Questions from Master Question Bank
              </h3>
              <p className="text-xs text-slate-300">
                Target Instrument: <span className="font-semibold text-white">{targetTool.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Banner */}
        <div className="bg-indigo-50/90 border-b border-indigo-150 px-6 py-2.5 flex items-center justify-between text-xs text-indigo-900">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Safe Local Amendments:</strong> You can customize question text, hints, or answer types below. Changes create an independent copy for <em>{targetTool.name}</em> and will <u>never</u> affect the Master Question Bank.
            </span>
          </div>
          {amendedCount > 0 && (
            <span className="bg-indigo-200 text-indigo-950 font-bold px-2 py-0.5 rounded-full text-[10px] shrink-0">
              {amendedCount} amended locally
            </span>
          )}
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Target Section Selector & Criteria Filter */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-indigo-600" />
              <span className="font-bold text-slate-700">Add to Section:</span>
              <select
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900 cursor-pointer"
              >
                {sections.map(sec => (
                  <option key={sec.id} value={sec.id}>
                    {sec.title}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-2">
              <label className="flex items-center space-x-2 text-slate-700 font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyMatchingCriteria}
                  onChange={(e) => setOnlyMatchingCriteria(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span className="flex items-center gap-1 text-xs">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  Filter by Instrument Scope ({toolSiteIds.length} sites, {toolAreaIds.length} areas, {toolOpTypeIds.length} ops)
                </span>
              </label>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 bg-slate-50/80 p-3 border border-slate-200 rounded-xl text-xs">
            {/* Search */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500 block">Search</label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Search master bank..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                />
              </div>
            </div>

            {/* Site Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500 block">Physical Site</label>
              <select
                value={filterSiteId}
                onChange={(e) => setFilterSiteId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="">-- All Sites --</option>
                {sites.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                ))}
              </select>
            </div>

            {/* Area Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500 block">Site Area</label>
              <select
                value={filterAreaId}
                onChange={(e) => setFilterAreaId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="">-- All Areas --</option>
                {siteAreas.map(a => (
                  <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                ))}
              </select>
            </div>

            {/* Operation Type Filter */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase text-slate-500 block">Operation Type</label>
              <select
                value={filterOpTypeId}
                onChange={(e) => setFilterOpTypeId(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
              >
                <option value="">-- All Operations --</option>
                {operationTypes.map(o => (
                  <option key={o.id} value={o.id}>[{o.code}] {o.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Select Bar */}
          <div className="flex items-center justify-between text-xs px-1">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => handleToggleSelectAll(true)}
                className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
              >
                Select All ({filteredQuestions.length})
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => handleToggleSelectAll(false)}
                className="text-slate-500 hover:text-slate-700 font-semibold cursor-pointer"
              >
                Deselect All
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <span className="font-bold text-slate-700">
                {selectedQuestionIds.length} question(s) selected
              </span>
            </div>
          </div>

          {/* Questions List */}
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl space-y-2">
              <HelpCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-sm font-bold text-slate-700">No matching questions found in Master Bank</div>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Try unchecking "Filter by Instrument Scope" to view all standardized questions in your Master Question Bank.
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
              {filteredQuestions.map(q => {
                const isSelected = selectedQuestionIds.includes(q.id);
                const isAlreadyPresent = existingTexts.has(q.question_text.trim().toLowerCase());
                const isExpanded = expandedAmendIds.includes(q.id);
                const effective = getEffectiveQuestionData(q);

                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border transition-all text-xs overflow-hidden ${
                      isAlreadyPresent
                        ? 'bg-slate-50/70 border-slate-200 opacity-60'
                        : isSelected
                        ? 'bg-white border-indigo-300 shadow-sm ring-1 ring-indigo-200/50'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {/* Main Row */}
                    <div
                      onClick={() => {
                        if (!isAlreadyPresent) handleToggleQuestion(q.id);
                      }}
                      className="p-3.5 flex items-start space-x-3 cursor-pointer"
                    >
                      <div className="pt-0.5">
                        {isAlreadyPresent ? (
                          <div className="w-4 h-4 rounded border border-slate-300 bg-slate-200 flex items-center justify-center text-[10px] text-slate-500 font-bold">
                            ✓
                          </div>
                        ) : isSelected ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-300" />
                        )}
                      </div>

                      <div className="flex-1 space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-bold">
                            {q.question_code}
                          </span>

                          {isAlreadyPresent && (
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded">
                              Already In Instrument
                            </span>
                          )}

                          {effective.isAmended && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold rounded flex items-center gap-1">
                              <Edit3 className="w-2.5 h-2.5" /> Amended Locally
                            </span>
                          )}

                          {/* Physical Site Badges */}
                          {q.site_ids && q.site_ids.length > 0 && (
                            q.site_ids.map(sid => {
                              const sName = siteMap.get(sid);
                              if (!sName) return null;
                              return (
                                <span key={sid} className="px-1.5 py-0.5 bg-sky-50 border border-sky-200 text-sky-800 text-[10px] font-semibold rounded flex items-center">
                                  <Building2 className="w-2.5 h-2.5 mr-1" />
                                  {sName}
                                </span>
                              );
                            })
                          )}

                          {/* Area Badges */}
                          {q.area_ids && q.area_ids.length > 0 && (
                            q.area_ids.map(aid => {
                              const aName = areaMap.get(aid);
                              if (!aName) return null;
                              return (
                                <span key={aid} className="px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-semibold rounded">
                                  Area: {aName}
                                </span>
                              );
                            })
                          )}

                          {/* Operation Type Badges */}
                          {q.operation_type_ids && q.operation_type_ids.length > 0 && (
                            q.operation_type_ids.map(oid => {
                              const oName = opMap.get(oid);
                              if (!oName) return null;
                              return (
                                <span key={oid} className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold rounded">
                                  Op: {oName}
                                </span>
                              );
                            })
                          )}

                          <span className="px-1.5 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-medium rounded capitalize">
                            {effective.answer_type.replace('_', ' ')}
                          </span>

                          {effective.is_required && (
                            <span className="text-[9px] font-bold text-red-500 uppercase">
                              Required
                            </span>
                          )}
                        </div>

                        {/* Displayed Question Text */}
                        <div className="font-bold text-slate-900 leading-snug">
                          {effective.question_text}
                        </div>

                        {effective.hint_text && (
                          <div className="text-[11px] text-slate-500 italic">
                            Hint: {effective.hint_text}
                          </div>
                        )}
                      </div>

                      {/* Amend / Expand Trigger Button */}
                      {!isAlreadyPresent && (
                        <div className="shrink-0 flex items-center space-x-1 pl-2">
                          <button
                            type="button"
                            onClick={(e) => toggleExpandAmend(q.id, e)}
                            className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors flex items-center space-x-1 cursor-pointer ${
                              effective.isAmended
                                ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                                : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                            title="Amend question text, hint or answer type for this instrument"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>{isExpanded ? 'Hide Edit' : 'Amend'}</span>
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline Amendment Panel */}
                    {isExpanded && !isAlreadyPresent && (
                      <div className="bg-slate-50/90 border-t border-slate-200 p-4 space-y-3.5 animate-in slide-in-from-top-1 duration-150">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-1.5 text-xs font-bold text-indigo-900">
                            <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Amend Question for "{targetTool.name}"</span>
                          </div>
                          {effective.isAmended && (
                            <button
                              type="button"
                              onClick={(e) => handleResetAmendment(q.id, e)}
                              className="text-[11px] text-slate-500 hover:text-red-600 flex items-center space-x-1 cursor-pointer font-medium"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Reset to Master Bank Default</span>
                            </button>
                          )}
                        </div>

                        {/* Amendment Fields */}
                        <div className="space-y-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                          {/* Question Text */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-slate-600 block">
                              Question Text (Local Override)
                            </label>
                            <textarea
                              rows={2}
                              value={effective.question_text}
                              onChange={(e) => handleUpdateAmendment(q.id, 'question_text', e.target.value, q)}
                              className="w-full text-xs font-semibold p-2 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                              placeholder="Enter customized question text for this instrument..."
                            />
                          </div>

                          {/* Hint / Guidance Text */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold uppercase text-slate-600 block">
                              Hint / Guidance for Auditor (Local Override)
                            </label>
                            <input
                              type="text"
                              value={effective.hint_text}
                              onChange={(e) => handleUpdateAmendment(q.id, 'hint_text', e.target.value, q)}
                              className="w-full text-xs p-2 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-1 focus:ring-slate-900 bg-white"
                              placeholder="Optional guidance hint for auditor..."
                            />
                          </div>

                          {/* Answer Type & Required */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                            <div className="space-y-1">
                              <label className="text-[10px] font-bold uppercase text-slate-600 block">
                                Answer Type
                              </label>
                              <select
                                value={effective.answer_type}
                                onChange={(e) => handleUpdateAmendment(q.id, 'answer_type', e.target.value as AnswerType, q)}
                                className="w-full text-xs p-2 border border-slate-200 rounded-lg font-medium text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 cursor-pointer"
                              >
                                <option value="single_choice">Single Choice (Select One)</option>
                                <option value="boolean">Boolean (Pass / Fail / Yes / No)</option>
                                <option value="multiple_choice">Multiple Choice (Checkboxes)</option>
                                <option value="text">Open Text</option>
                                <option value="number">Numeric</option>
                                <option value="photo">Photo Evidence</option>
                                <option value="signature">Signature Sign-off</option>
                              </select>
                            </div>

                            <div className="flex items-center pt-5">
                              <label className="flex items-center space-x-2 text-xs text-slate-800 font-semibold cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={effective.is_required}
                                  onChange={(e) => handleUpdateAmendment(q.id, 'is_required', e.target.checked, q)}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                                />
                                <span>Question is Mandatory / Required</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        <p className="text-[10px] text-slate-400 italic">
                          💡 The Master Question Bank question ({q.question_code}) remains completely untouched.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={submitting || selectedQuestionIds.length === 0}
            onClick={handleAddQuestions}
            className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-2 transition-colors"
          >
            {submitting ? (
              <span>Adding Questions to Instrument...</span>
            ) : (
              <>
                <span>Add {selectedQuestionIds.length} Question{selectedQuestionIds.length === 1 ? '' : 's'} to Instrument</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
