import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  FileText,
  Clipboard,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Trash2,
  ArrowRight,
  Layers,
  Sparkles,
  X,
  Check,
  Settings2,
  Plus,
  Briefcase,
  ShieldCheck
} from 'lucide-react';
import { ToolQuestion, QuestionOption, AnswerType, Tool, SiteArea, OperationType } from '../types/tool-engine';
import { Site } from '../types/database';
import { MultiSelectEntityDropdown } from './MultiSelectEntityDropdown';
import { enrichWithSites } from '../lib/site-area-utils';

interface ParsedQuestionItem {
  id: string;
  selected: boolean;
  question_text: string;
  hint_text: string;
  answer_type: AnswerType;
  site_ids?: string[];
  area_id?: string | null;
  operation_type_id?: string | null;
  area_ids?: string[];
  operation_type_ids?: string[];
  tool_ids?: string[];
  options_preset: 'pass_fail' | 'yes_no' | 'compliant' | 'custom' | 'none';
  custom_options?: { label: string; value: string; is_flagged: boolean; score: number }[];
  isValid: boolean;
  validationError?: string;
}

interface BatchQuestionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  sectionId?: string;
  sectionTitle?: string;
  toolVersionId?: string;
  tenantId: string;
  initialToolId?: string;
  existingQuestionsCount?: number;
  onImportSuccess: (newQuestions: ToolQuestion[], newOptions: QuestionOption[]) => void;
}

const SAMPLE_PASTE_DATA = `Question\tHint
LGV Key Control: Keys secured from driver?\tLGV keys must be with the MHE operator.
Shunt Unit: Disconnected before loading/unloading?\tNo un/loading to take place with shunt vehicle attached.
Trailer Support: Stand correctly positioned?\tUnder trailer (touching the trailer bed) or designated area.
Wheel Security: Are trailer wheels chocked?\tShould be around one inch from the tyre.
Pedestrian Safety: Safe zone used for assistants?\tMHE interacting with trailer; pedestrian must use the safe zone.
Operator Restraint: Seat belt worn and secured?\tSecured and clicked across the operator's lap.
Fork Configuration: Operating with double-forks?\tEmpty forks must be within the width of the truck.
Direction of Travel: Operator looking toward movement?\tHead turned toward direction of movement; no driving blind.
Safe Distance: 5-meter pedestrian gap maintained?\tMaintain a 5-metre gap and make eye contact.
Doorway Protocol: Full stop and wait for opening?\tSpeed caution / horn / wait for door to be 100% open / closed empty forks.
Visibility Management: Operating with obscured view?\tOperators must drive in reverse when load obscures view.
Speed Control: Appropriate for site conditions?\tSharp turning / speed awareness.`;

const DEFAULT_PRESETS = {
  pass_fail: [
    { label: 'Pass', value: 'pass', is_flagged: false, score: 100 },
    { label: 'Fail', value: 'fail', is_flagged: true, score: 0 },
    { label: 'N/A', value: 'na', is_flagged: false, score: null }
  ],
  yes_no: [
    { label: 'Yes', value: 'yes', is_flagged: false, score: 100 },
    { label: 'No', value: 'no', is_flagged: true, score: 0 },
    { label: 'N/A', value: 'na', is_flagged: false, score: null }
  ],
  compliant: [
    { label: 'Compliant', value: 'compliant', is_flagged: false, score: 100 },
    { label: 'Non-Compliant', value: 'non_compliant', is_flagged: true, score: 0 },
    { label: 'N/A', value: 'na', is_flagged: false, score: null }
  ]
};

export const BatchQuestionImportModal: React.FC<BatchQuestionImportModalProps> = ({
  isOpen,
  onClose,
  sectionId: propSectionId,
  sectionTitle: propSectionTitle,
  toolVersionId: propToolVersionId,
  tenantId,
  initialToolId,
  existingQuestionsCount = 0,
  onImportSuccess
}) => {
  const [step, setStep] = useState<'paste' | 'configure'>('paste');
  const [rawText, setRawText] = useState('');
  const [defaultAnswerType, setDefaultAnswerType] = useState<AnswerType>('single_choice');
  const [defaultPreset, setDefaultPreset] = useState<'pass_fail' | 'yes_no' | 'compliant' | 'none'>('pass_fail');
  const [parsedItems, setParsedItems] = useState<ParsedQuestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Entities state
  const [tools, setTools] = useState<Tool[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [siteAreas, setSiteAreas] = useState<SiteArea[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);

  // Selected Instrument / Tool & Metadata (Optional - defaults to Central Question Bank)
  const [selectedToolId, setSelectedToolId] = useState<string>(initialToolId || '');
  const [selectedToolIds, setSelectedToolIds] = useState<string[]>(initialToolId ? [initialToolId] : []);
  const [isCreatingNewTool, setIsCreatingNewTool] = useState<boolean>(false);
  const [newToolName, setNewToolName] = useState<string>('');
  const [newToolDesc, setNewToolDesc] = useState<string>('');

  // Selected Physical Sites, Areas & Operation Types
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedAreaIds, setSelectedAreaIds] = useState<string[]>([]);
  const [selectedOperationTypeId, setSelectedOperationTypeId] = useState<string>('');
  const [selectedOpTypeIds, setSelectedOpTypeIds] = useState<string[]>([]);

  // Fetch available entities when modal is opened
  useEffect(() => {
    if (!isOpen || !tenantId) return;
    const loadEntities = async () => {
      try {
        const [toolsRes, sitesRes, areasRes, opsRes] = await Promise.all([
          supabase.from('tools').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('name'),
          supabase.from('sites').select('*').eq('tenant_id', tenantId).is('deleted_at', null).order('name'),
          supabase.from('site_areas').select('*').is('deleted_at', null).order('name'),
          supabase.from('operation_types').select('*').is('deleted_at', null).order('name')
        ]);

        if (toolsRes.data) {
          setTools(toolsRes.data);
          if (initialToolId && toolsRes.data.some(t => t.id === initialToolId)) {
            setSelectedToolId(initialToolId);
            setSelectedToolIds([initialToolId]);
          }
        }
        if (sitesRes.data) setSites(sitesRes.data);
        if (areasRes.data) setSiteAreas(areasRes.data.map(a => enrichWithSites(a)));
        if (opsRes.data) setOperationTypes(opsRes.data.map(o => enrichWithSites(o)));
      } catch (err) {
        console.error('Error loading entities for batch modal:', err);
      }
    };
    loadEntities();
  }, [isOpen, tenantId, initialToolId]);

  if (!isOpen) return null;

  // Helper to parse raw text into items
  const handleParseText = () => {
    setError(null);
    if (!rawText.trim()) {
      setError('Please paste question data into the box before parsing.');
      return;
    }

    const lines = rawText.split(/\r?\n/).filter(line => line.trim().length > 0);
    const items: ParsedQuestionItem[] = [];

    lines.forEach((line, index) => {
      // Auto-detect header row
      if (index === 0) {
        const lower = line.toLowerCase();
        if (
          (lower.includes('question') && lower.includes('hint')) ||
          (lower.includes('question') && lower.includes('description'))
        ) {
          return; // Skip header row
        }
      }

      let qText = '';
      let hText = '';

      if (line.includes('\t')) {
        // Tab separated
        const parts = line.split('\t');
        qText = parts[0]?.trim() || '';
        hText = parts.slice(1).join('\t').trim();
      } else if (line.includes('|')) {
        // Pipe separated
        const parts = line.split('|');
        qText = parts[0]?.trim() || '';
        hText = parts.slice(1).join('|').trim();
      } else if (line.includes('  ')) {
        // Multi-space separated
        const parts = line.split(/\s{2,}/);
        qText = parts[0]?.trim() || '';
        hText = parts.slice(1).join(' ').trim();
      } else {
        // Fallback single column
        qText = line.trim();
        hText = '';
      }

      const isValid = qText.length >= 3;

      items.push({
        id: `parsed_${Date.now()}_${index}`,
        selected: isValid,
        question_text: qText,
        hint_text: hText,
        answer_type: defaultAnswerType,
        area_id: selectedAreaId || null,
        operation_type_id: selectedOperationTypeId || null,
        options_preset: defaultPreset,
        isValid,
        validationError: isValid ? undefined : 'Question text must be at least 3 characters'
      });
    });

    if (items.length === 0) {
      setError('No valid questions could be extracted from the provided text.');
      return;
    }

    setParsedItems(items);
    setStep('configure');
  };

  const handleGlobalAnswerTypeChange = (type: AnswerType) => {
    setDefaultAnswerType(type);
    setParsedItems(prev => prev.map(item => ({
      ...item,
      answer_type: type
    })));
  };

  const handleGlobalPresetChange = (preset: 'pass_fail' | 'yes_no' | 'compliant' | 'none') => {
    setDefaultPreset(preset);
    setParsedItems(prev => prev.map(item => ({
      ...item,
      options_preset: preset
    })));
  };

  const handleGlobalAreaChange = (areaId: string) => {
    setSelectedAreaId(areaId);
    setParsedItems(prev => prev.map(item => ({
      ...item,
      area_id: areaId || null
    })));
  };

  const handleGlobalOpTypeChange = (opTypeId: string) => {
    setSelectedOperationTypeId(opTypeId);
    setParsedItems(prev => prev.map(item => ({
      ...item,
      operation_type_id: opTypeId || null
    })));
  };

  const handleItemTextChange = (id: string, field: 'question_text' | 'hint_text', value: string) => {
    setParsedItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      const updated = { ...item, [field]: value };
      updated.isValid = updated.question_text.trim().length >= 3;
      updated.validationError = updated.isValid ? undefined : 'Question text must be at least 3 characters';
      return updated;
    }));
  };

  const handleItemTypeChange = (id: string, type: AnswerType) => {
    setParsedItems(prev => prev.map(item => item.id === id ? { ...item, answer_type: type } : item));
  };

  const handleItemPresetChange = (id: string, preset: 'pass_fail' | 'yes_no' | 'compliant' | 'none') => {
    setParsedItems(prev => prev.map(item => item.id === id ? { ...item, options_preset: preset } : item));
  };

  const handleItemAreaChange = (id: string, areaId: string) => {
    setParsedItems(prev => prev.map(item => item.id === id ? { ...item, area_id: areaId || null } : item));
  };

  const handleItemSiteChange = (id: string, siteId: string) => {
    setParsedItems(prev => prev.map(item => item.id === id ? { ...item, site_ids: siteId ? [siteId] : [] } : item));
  };

  const handleItemOpTypeChange = (id: string, opTypeId: string) => {
    setParsedItems(prev => prev.map(item => item.id === id ? { ...item, operation_type_id: opTypeId || null } : item));
  };

  const handleToggleSelect = (id: string) => {
    setParsedItems(prev => prev.map(item => item.id === id ? { ...item, selected: !item.selected } : item));
  };

  const handleToggleSelectAll = (select: boolean) => {
    setParsedItems(prev => prev.map(item => ({ ...item, selected: select && item.isValid })));
  };

  const selectedCount = parsedItems.filter(i => i.selected && i.isValid).length;

  const handleExecuteImport = async () => {
    const validToImport = parsedItems.filter(i => i.selected && i.isValid);
    if (validToImport.length === 0) {
      setError('Please select at least one valid question to import.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      let targetToolVersionId = propToolVersionId;
      let targetSectionId = propSectionId;

      // 1. Resolve or Create Tool & Draft Version & Section
      if (isCreatingNewTool) {
        if (!newToolName.trim()) {
          throw new Error('Please enter a name for the new Instrument / Tool.');
        }
        const slug = newToolName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const { data: newTool, error: toolErr } = await supabase
          .from('tools')
          .insert({
            tenant_id: tenantId,
            name: newToolName.trim(),
            slug,
            description: newToolDesc.trim() || null,
            category: 'safety',
            status: 'draft',
            site_ids: selectedSiteIds,
            area_ids: selectedAreaIds,
            operation_type_ids: selectedOpTypeIds
          })
          .select()
          .single();

        if (toolErr || !newTool) throw toolErr || new Error('Failed to create new tool.');

        const { data: newVer, error: verErr } = await supabase
          .from('tool_versions')
          .insert({
            tool_id: newTool.id,
            tenant_id: tenantId,
            version_number: 1,
            status: 'draft',
            instructions: 'Imported questions draft version'
          })
          .select()
          .single();

        if (verErr || !newVer) throw verErr || new Error('Failed to create tool version.');

        const { data: newSec, error: secErr } = await supabase
          .from('tool_sections')
          .insert({
            tool_version_id: newVer.id,
            tenant_id: tenantId,
            title: 'General Inspection',
            order_index: 0
          })
          .select()
          .single();

        if (secErr || !newSec) throw secErr || new Error('Failed to create tool section.');

        targetToolVersionId = newVer.id;
        targetSectionId = newSec.id;
      } else if (!targetToolVersionId || !targetSectionId) {
        // Resolve target tool: either user selected one, or default to tenant's Master Question Bank!
        let effectiveToolId = selectedToolId;

        if (!effectiveToolId) {
          // Find or auto-initialize Master Question Bank repository for the tenant
          let bankTool = tools.find(t => t.slug === 'master-question-bank' || t.name === 'Master Question Bank');
          if (!bankTool) {
            const { data: newBank, error: bErr } = await supabase
              .from('tools')
              .insert({
                tenant_id: tenantId,
                name: 'Master Question Bank',
                slug: 'master-question-bank',
                description: 'Central Question Bank repository for general, unassigned, and shared questions',
                category: 'safety',
                status: 'active',
                site_ids: selectedSiteIds,
                area_ids: selectedAreaIds,
                operation_type_ids: selectedOpTypeIds
              })
              .select()
              .single();

            if (bErr || !newBank) {
              throw bErr || new Error('Failed to initialize Master Question Bank repository.');
            }
            bankTool = newBank;
            setTools(prev => [newBank, ...prev]);
          }
          effectiveToolId = bankTool ? (bankTool as any).id : '';
        }

        // Find or create draft version
        const { data: verList } = await supabase
          .from('tool_versions')
          .select('*')
          .eq('tool_id', effectiveToolId)
          .order('version_number', { ascending: false });

        let activeVer = verList?.find(v => v.status === 'draft') || verList?.[0];

        if (!activeVer) {
          const { data: createdVer, error: cVerErr } = await supabase
            .from('tool_versions')
            .insert({
              tool_id: effectiveToolId,
              tenant_id: tenantId,
              version_number: (verList?.length || 0) + 1,
              status: 'draft'
            })
            .select()
            .single();

          if (cVerErr || !createdVer) throw cVerErr || new Error('Failed to initialize draft version.');
          activeVer = createdVer;
        }

        targetToolVersionId = activeVer.id;

        // Find or create section
        const { data: secList } = await supabase
          .from('tool_sections')
          .select('*')
          .eq('tool_version_id', targetToolVersionId)
          .order('order_index', { ascending: true });

        let activeSec = secList?.[0];

        if (!activeSec) {
          const { data: createdSec, error: cSecErr } = await supabase
            .from('tool_sections')
            .insert({
              tool_version_id: targetToolVersionId,
              tenant_id: tenantId,
              title: 'General Inspection',
              order_index: 0
            })
            .select()
            .single();

          if (cSecErr || !createdSec) throw cSecErr || new Error('Failed to initialize tool section.');
          activeSec = createdSec;
        }

        targetSectionId = activeSec.id;
      }

      let currentOrder = existingQuestionsCount;

      // 2. Prepare questions payload
      const questionsPayload = validToImport.map((item, index) => {
        const orderIdx = currentOrder + index;
        const codeNum = existingQuestionsCount + index + 1;
        
        const itemSiteIds = item.site_ids && item.site_ids.length > 0
          ? item.site_ids
          : selectedSiteIds;
        const itemAreaIds = item.area_ids && item.area_ids.length > 0
          ? item.area_ids
          : (item.area_id ? [item.area_id] : selectedAreaIds);
        const itemOpTypeIds = item.operation_type_ids && item.operation_type_ids.length > 0
          ? item.operation_type_ids
          : (item.operation_type_id ? [item.operation_type_id] : selectedOpTypeIds);
        const itemToolIds = item.tool_ids && item.tool_ids.length > 0
          ? item.tool_ids
          : (selectedToolIds.length > 0 ? selectedToolIds : []);

        return {
          section_id: targetSectionId,
          tool_version_id: targetToolVersionId,
          tenant_id: tenantId,
          question_code: `Q_${codeNum}`,
          question_text: item.question_text.trim(),
          hint_text: item.hint_text.trim() || null,
          answer_type: item.answer_type,
          site_ids: itemSiteIds,
          area_id: itemAreaIds[0] || item.area_id || null,
          operation_type_id: itemOpTypeIds[0] || item.operation_type_id || null,
          area_ids: itemAreaIds,
          operation_type_ids: itemOpTypeIds,
          tool_ids: itemToolIds,
          is_required: true,
          order_index: orderIdx,
          metadata: { imported_via_batch: true, site_ids: itemSiteIds }
        };
      });

      // Insert questions into database
      const { data: createdQuestions, error: qErr } = await supabase
        .from('tool_questions')
        .insert(questionsPayload)
        .select();

      if (qErr || !createdQuestions) throw qErr || new Error('Failed to create questions.');

      // 2. Prepare options payload for selectable questions
      const optionsPayload: any[] = [];

      createdQuestions.forEach((q, idx) => {
        const originalItem = validToImport[idx];
        const isChoiceType = ['single_choice', 'multiple_choice', 'boolean'].includes(q.answer_type);

        if (isChoiceType && originalItem.options_preset !== 'none') {
          const presetList = DEFAULT_PRESETS[originalItem.options_preset as keyof typeof DEFAULT_PRESETS] || DEFAULT_PRESETS.pass_fail;
          
          presetList.forEach((opt, optIdx) => {
            optionsPayload.push({
              question_id: q.id,
              tenant_id: tenantId,
              label: opt.label,
              value: opt.value,
              score: opt.score,
              is_flagged: opt.is_flagged,
              order_index: optIdx
            });
          });
        }
      });

      let createdOptions: QuestionOption[] = [];
      if (optionsPayload.length > 0) {
        const { data: optData, error: optErr } = await supabase
          .from('question_options')
          .insert(optionsPayload)
          .select();

        if (optErr) throw optErr;
        createdOptions = optData || [];
      }

      onImportSuccess(createdQuestions as ToolQuestion[], createdOptions as QuestionOption[]);
      onClose();
    } catch (err: any) {
      console.error('Batch question import error:', err);
      setError(err.message || 'An error occurred while importing questions.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Clipboard className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold tracking-tight">Copy & Paste Question Parser</h3>
              <p className="text-xs text-slate-400">
                Bulk import into section: <span className="text-indigo-300 font-semibold">{propSectionTitle || 'General Inspection'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center space-x-2.5 text-xs text-red-800 shrink-0">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          
          {step === 'paste' ? (
            /* STEP 1: RAW TEXT INPUT */
            <div className="space-y-5">
              <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-4 text-xs text-indigo-950 space-y-2">
                <div className="flex items-center space-x-2 font-bold text-indigo-900">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>Two-Column Tab / SpreadSheet Format Supported</span>
                </div>
                <p className="leading-relaxed">
                  Copy and paste columns from Excel, Google Sheets, or plain text. The parser expects two columns: <code className="bg-indigo-100 px-1.5 py-0.5 rounded font-mono font-bold text-indigo-900">Question | Hint</code> (tab or pipe separated).
                </p>
              </div>

              {/* Target Instrument, Area & Operation Type Settings */}
              <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-4">
                <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between">
                  <span className="flex items-center">
                    <Briefcase className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> Target Assignment Context
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal normal-case">Questions will be assigned to these entities</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Physical Site Selection */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Physical Site(s)</label>
                    <MultiSelectEntityDropdown
                      options={sites.map(s => ({ id: s.id, name: s.name, code: s.code }))}
                      selectedIds={selectedSiteIds}
                      onChange={setSelectedSiteIds}
                      placeholder="All / Select Site(s)..."
                      label="Physical Site"
                      badgeColor="blue"
                    />
                  </div>

                  {/* Area Selection */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Site Area(s)</label>
                    <MultiSelectEntityDropdown
                      options={siteAreas.map(a => ({ id: a.id, name: a.name, code: a.code }))}
                      selectedIds={selectedAreaIds}
                      onChange={(ids) => {
                        setSelectedAreaIds(ids);
                        if (ids.length > 0) setSelectedAreaId(ids[0]);
                      }}
                      placeholder="All / Select Area(s)..."
                      label="Site Area"
                      badgeColor="indigo"
                    />
                  </div>

                  {/* Operation Type Selection */}
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 block">Operation Type(s)</label>
                    <MultiSelectEntityDropdown
                      options={operationTypes.map(o => ({ id: o.id, name: o.name, code: o.code }))}
                      selectedIds={selectedOpTypeIds}
                      onChange={(ids) => {
                        setSelectedOpTypeIds(ids);
                        if (ids.length > 0) setSelectedOperationTypeId(ids[0]);
                      }}
                      placeholder="All / Select Operation(s)..."
                      label="Operation Type"
                      badgeColor="purple"
                    />
                  </div>

                  {/* Instrument / Tool Selection (Optional) */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-700 block">
                        Instrument(s) <span className="font-normal text-slate-400">(Optional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsCreatingNewTool(!isCreatingNewTool)}
                        className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                      >
                        {isCreatingNewTool ? 'Select Existing' : '+ Create New'}
                      </button>
                    </div>
                    {!isCreatingNewTool ? (
                      <MultiSelectEntityDropdown
                        options={tools.map(t => ({ id: t.id, name: t.name }))}
                        selectedIds={selectedToolIds}
                        onChange={(ids) => {
                          setSelectedToolIds(ids);
                          if (ids.length > 0) setSelectedToolId(ids[0]);
                          else setSelectedToolId('');
                        }}
                        placeholder="Question Bank (General)..."
                        label="Instrument"
                        badgeColor="slate"
                      />
                    ) : (
                      <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200">
                        Creating new instrument below...
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline New Tool Creator Form */}
                {isCreatingNewTool && (
                  <div className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-3 space-y-2 animate-fadeIn">
                    <div className="text-[11px] font-bold text-indigo-900 flex items-center">
                      <Plus className="w-3.5 h-3.5 mr-1 text-indigo-600" /> Define New Instrument / Tool
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={newToolName}
                        onChange={(e) => setNewToolName(e.target.value)}
                        placeholder="e.g. MHE Pre-Shift Safety Audit"
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-semibold text-slate-900"
                      />
                      <input
                        type="text"
                        value={newToolDesc}
                        onChange={(e) => setNewToolDesc(e.target.value)}
                        placeholder="Optional description or scope..."
                        className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Default Settings Before Parse */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-200 rounded-xl">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-700 block">Default Answer Type</label>
                  <select
                    value={defaultAnswerType}
                    onChange={(e) => setDefaultAnswerType(e.target.value as AnswerType)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="single_choice">Single Choice (Select One)</option>
                    <option value="boolean">Boolean (Pass/Fail or Yes/No)</option>
                    <option value="multiple_choice">Multiple Choice (Checkboxes)</option>
                    <option value="text">Open Text Response</option>
                    <option value="number">Numeric Value</option>
                    <option value="photo">Photo Evidence Required</option>
                    <option value="signature">Sign-off Signature</option>
                  </select>
                </div>

                {['single_choice', 'boolean', 'multiple_choice'].includes(defaultAnswerType) && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-700 block">Default Answer Options Set</label>
                    <select
                      value={defaultPreset}
                      onChange={(e) => setDefaultPreset(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="pass_fail">Pass / Fail / N/A (Standard Audit)</option>
                      <option value="yes_no">Yes / No / N/A</option>
                      <option value="compliant">Compliant / Non-Compliant / N/A</option>
                      <option value="none">None (Add custom options later)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Textarea Area */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Paste Questions & Hints Below
                  </label>
                  <button
                    type="button"
                    onClick={() => setRawText(SAMPLE_PASTE_DATA)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer flex items-center space-x-1"
                  >
                    <span>Load Sample Inspection Checklist</span>
                  </button>
                </div>

                <textarea
                  rows={10}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Question\tHint\nLGV Key Control: Keys secured from driver?\tLGV keys must be with the MHE operator.\nShunt Unit: Disconnected before loading/unloading?\tNo un/loading with shunt attached.`}
                  className="w-full p-4 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:ring-2 focus:ring-slate-900 transition-all leading-relaxed"
                />
              </div>
            </div>
          ) : (
            /* STEP 2: PARSED VALIDATION & CONFIGURATION GRID */
            <div className="space-y-5">
              
              {/* Batch Controls Bar */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center space-x-3 text-xs font-medium text-slate-700">
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(true)}
                    className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-700 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleSelectAll(false)}
                    className="px-2.5 py-1 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-700 transition-colors"
                  >
                    Deselect All
                  </button>
                  <span className="text-slate-400">|</span>
                  <span className="font-bold text-slate-900">{selectedCount} of {parsedItems.length} selected</span>
                </div>

                <div className="flex items-center space-x-3 text-xs">
                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-500 font-medium">Set All Types:</span>
                    <select
                      value={defaultAnswerType}
                      onChange={(e) => handleGlobalAnswerTypeChange(e.target.value as AnswerType)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="single_choice">Single Choice</option>
                      <option value="boolean">Boolean</option>
                      <option value="multiple_choice">Multiple Choice</option>
                      <option value="text">Open Text</option>
                      <option value="number">Numeric</option>
                      <option value="photo">Photo</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-1.5">
                    <span className="text-slate-500 font-medium">Options Preset:</span>
                    <select
                      value={defaultPreset}
                      onChange={(e) => handleGlobalPresetChange(e.target.value as any)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                    >
                      <option value="pass_fail">Pass / Fail / N/A</option>
                      <option value="yes_no">Yes / No / N/A</option>
                      <option value="compliant">Compliant / Non-Compliant</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-3">
                {parsedItems.map((item, idx) => (
                  <div
                    key={item.id}
                    className={`p-4 border rounded-xl transition-all space-y-3 ${
                      !item.selected
                        ? 'bg-slate-50/50 border-slate-200 opacity-60'
                        : item.isValid
                        ? 'bg-white border-slate-200 shadow-2xs hover:border-slate-300'
                        : 'bg-red-50/50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start space-x-3">
                      <input
                        type="checkbox"
                        checked={item.selected}
                        onChange={() => handleToggleSelect(item.id)}
                        className="mt-1 rounded text-slate-900 focus:ring-slate-900 cursor-pointer"
                      />

                      <div className="flex-1 space-y-2">
                        {/* Question Text Input */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">
                              Question #{idx + 1}
                            </span>
                            {!item.isValid && (
                              <span className="text-[10px] font-bold text-red-600">
                                {item.validationError}
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={item.question_text}
                            onChange={(e) => handleItemTextChange(item.id, 'question_text', e.target.value)}
                            placeholder="Observation question text..."
                            className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900"
                          />
                        </div>

                        {/* Hint Input */}
                        <div>
                          <span className="text-[10px] font-medium text-slate-400 block mb-0.5">
                            Hint / Help Guidance (Shown to auditor)
                          </span>
                          <input
                            type="text"
                            value={item.hint_text}
                            onChange={(e) => handleItemTextChange(item.id, 'hint_text', e.target.value)}
                            placeholder="Optional hint or instruction..."
                            className="w-full px-3 py-1 border border-slate-200 rounded-lg text-xs text-slate-600 italic bg-slate-50/50 focus:outline-none focus:ring-1 focus:ring-slate-900"
                          />
                        </div>

                        {/* Individual Type & Preset Selectors */}
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                          <div className="flex items-center space-x-1.5">
                            <span className="text-[10px] font-semibold text-slate-500">Answer Type:</span>
                            <select
                              value={item.answer_type}
                              onChange={(e) => handleItemTypeChange(item.id, e.target.value as AnswerType)}
                              className="px-2 py-0.5 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium"
                            >
                              <option value="single_choice">Single Choice</option>
                              <option value="boolean">Boolean</option>
                              <option value="multiple_choice">Multiple Choice</option>
                              <option value="text">Open Text</option>
                              <option value="number">Numeric</option>
                              <option value="photo">Photo</option>
                            </select>
                          </div>

                          {['single_choice', 'boolean', 'multiple_choice'].includes(item.answer_type) && (
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-semibold text-slate-500">Options Set:</span>
                              <select
                                value={item.options_preset}
                                onChange={(e) => handleItemPresetChange(item.id, e.target.value as any)}
                                className="px-2 py-0.5 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium text-indigo-900"
                              >
                                <option value="pass_fail">Pass / Fail / N/A</option>
                                <option value="yes_no">Yes / No / N/A</option>
                                <option value="compliant">Compliant / Non-Compliant</option>
                                <option value="none">No default options</option>
                              </select>
                            </div>
                          )}

                          {/* Individual Physical Site Selector */}
                          {sites.length > 0 && (
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-semibold text-slate-500">Site:</span>
                              <select
                                value={item.site_ids?.[0] || ''}
                                onChange={(e) => handleItemSiteChange(item.id, e.target.value)}
                                className="px-2 py-0.5 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium text-slate-800"
                              >
                                <option value="">-- All Sites --</option>
                                {sites.map(s => (
                                  <option key={s.id} value={s.id}>{s.name} ({s.code})</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Individual Area Selector */}
                          {siteAreas.length > 0 && (
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-semibold text-slate-500">Area:</span>
                              <select
                                value={item.area_id || ''}
                                onChange={(e) => handleItemAreaChange(item.id, e.target.value)}
                                className="px-2 py-0.5 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium text-slate-800"
                              >
                                <option value="">-- All Areas --</option>
                                {siteAreas.map(a => (
                                  <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Individual Operation Type Selector */}
                          {operationTypes.length > 0 && (
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-semibold text-slate-500">Op Type:</span>
                              <select
                                value={item.operation_type_id || ''}
                                onChange={(e) => handleItemOpTypeChange(item.id, e.target.value)}
                                className="px-2 py-0.5 border border-slate-200 rounded text-[11px] bg-white focus:outline-none focus:ring-1 focus:ring-slate-900 font-medium text-slate-800"
                              >
                                <option value="">-- All Operations --</option>
                                {operationTypes.map(o => (
                                  <option key={o.id} value={o.id}>[{o.code}] {o.name}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between shrink-0">
          {step === 'paste' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleParseText}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer flex items-center space-x-2"
              >
                <span>Parse & Validate Data</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep('paste')}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              >
                ← Back to Raw Input
              </button>
              <button
                type="button"
                disabled={loading || selectedCount === 0}
                onClick={handleExecuteImport}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors disabled:opacity-50 cursor-pointer flex items-center space-x-2 font-sans"
              >
                {loading ? (
                  <span>Importing Questions...</span>
                ) : (
                  <span>Import {selectedCount} Valid Questions</span>
                )}
              </button>
            </>
          )}
        </div>

      </div>
    </div>
  );
};
