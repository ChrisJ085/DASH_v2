// src/components/ObservationRunner.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import {
  fetchPublishedTools,
  fetchPublishedToolVersion,
  fetchFullToolDefinition,
  fetchUserOperationalScope,
  startObservationDraft,
  upsertObservationResponse,
  uploadObservationPhoto,
  uploadObservationSignature,
  finalizeObservation,
  FullToolDefinition,
  UserOperationalScope
} from '../lib/observation-service';
import {
  Tool,
  ToolVersion,
  ToolQuestion,
  QuestionOption,
  Observation,
  SiteArea,
  OperationType,
  ObservationResponse,
  ObservationPhoto,
  ObservationSignature
} from '../types/tool-engine';
import {
  evaluateToolVisibility,
  isAnswerEmpty
} from '../lib/rule-evaluation';
import { doesApplyToSite } from '../lib/site-area-utils';
import SignatureCanvas from './SignatureCanvas';
import {
  Layers,
  MapPin,
  Briefcase,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertCircle,
  Camera,
  PenTool,
  RotateCcw,
  Send,
  Save,
  Check,
  ShieldCheck,
  FileText,
  Clock,
  ArrowRight,
  Users,
  UserCheck,
  UserPlus,
  Truck,
  Cog,
  Search,
  X
} from 'lucide-react';
import { ColleagueProfile } from '../types/colleague';
import { fetchColleagues, saveColleague, filterColleaguesByRoles } from '../lib/colleague-service';

export type RunnerStep = 
  | 'select_tool' 
  | 'select_context' 
  | 'form_execution' 
  | 'review' 
  | 'confirmation';

interface ObservationRunnerProps {
  onCancel?: () => void;
  onComplete?: (obsId: string) => void;
}

export default function ObservationRunner({ onCancel, onComplete }: ObservationRunnerProps) {
  const { profile, tenant } = useAuth();

  // Navigation step
  const [step, setStep] = useState<RunnerStep>('select_tool');

  // Operational Context & Tool Selection
  const [publishedTools, setPublishedTools] = useState<Tool[]>([]);
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [selectedVersion, setSelectedVersion] = useState<ToolVersion | null>(null);
  
  // Scope Context
  const [userScope, setUserScope] = useState<UserOperationalScope>({ contracts: [], sites: [] });
  const [selectedContractId, setSelectedContractId] = useState<string>('');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('');

  // Site Areas & Operation Types
  const [siteAreas, setSiteAreas] = useState<SiteArea[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);
  const [selectedAreaId, setSelectedAreaId] = useState<string>('');
  const [selectedOperationTypeId, setSelectedOperationTypeId] = useState<string>('');

  // Colleague & Observed Operator State
  const [colleagues, setColleagues] = useState<ColleagueProfile[]>([]);
  const [selectedColleague, setSelectedColleague] = useState<ColleagueProfile | null>(null);
  const [colleagueSearch, setColleagueSearch] = useState<string>('');
  const [colleagueFilterMode, setColleagueFilterMode] = useState<'matching' | 'all'>('matching');
  const [showQuickAddColleague, setShowQuickAddColleague] = useState<boolean>(false);
  const [quickName, setQuickName] = useState<string>('');
  const [quickEmpId, setQuickEmpId] = useState<string>('');
  const [quickRole, setQuickRole] = useState<string>('mhe_operator');

  // Effect to load site areas & operation types whenever site or tool changes
  useEffect(() => {
    if (!selectedSiteId) {
      setSiteAreas([]);
      setOperationTypes([]);
      setSelectedAreaId('');
      setSelectedOperationTypeId('');
      return;
    }
    const loadSiteContext = async () => {
      try {
        const [areasRes, opsRes] = await Promise.all([
          supabase.from('site_areas').select('*').is('deleted_at', null).order('name'),
          supabase.from('operation_types').select('*').is('deleted_at', null).order('name')
        ]);

        let availableAreas = (areasRes.data || []).filter(a => doesApplyToSite(a, selectedSiteId));
        let availableOps = (opsRes.data || []).filter(o => doesApplyToSite(o, selectedSiteId));

        // If the selected tool has configured site area restrictions, filter available areas
        if (selectedTool?.area_ids && selectedTool.area_ids.length > 0) {
          const matching = availableAreas.filter(a => selectedTool.area_ids!.includes(a.id));
          if (matching.length > 0) {
            availableAreas = matching;
          }
        }

        // If the selected tool has configured operation type restrictions, filter available operation types
        if (selectedTool?.operation_type_ids && selectedTool.operation_type_ids.length > 0) {
          const matching = availableOps.filter(o => selectedTool.operation_type_ids!.includes(o.id));
          if (matching.length > 0) {
            availableOps = matching;
          }
        }

        setSiteAreas(availableAreas);
        setSelectedAreaId(availableAreas[0]?.id || '');

        setOperationTypes(availableOps);
        setSelectedOperationTypeId(availableOps[0]?.id || '');
      } catch (err) {
        console.error('Failed to load site areas/operation types:', err);
      }
    };
    loadSiteContext();
  }, [selectedSiteId, selectedTool?.id]);

  // Loaded Tool Definition
  const [toolDef, setToolDef] = useState<FullToolDefinition | null>(null);

  // Active Observation Draft
  const [observation, setObservation] = useState<Observation | null>(null);
  
  // Local Response State
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [photosByQuestion, setPhotosByQuestion] = useState<Record<string, ObservationPhoto[]>>({});
  const [signaturesByQuestion, setSignaturesByQuestion] = useState<Record<string, ObservationSignature[]>>({});

  // Active Section Index for Mobile Pagination
  const [activeSectionIndex, setActiveSectionIndex] = useState<number>(0);

  // Loaders and Error handling
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Initial load: Fetch published tools and operational scope
  useEffect(() => {
    if (!profile?.tenant_id || !profile?.id) return;
    const tenantId = profile.tenant_id;
    const userId = profile.id;

    const init = async () => {
      setLoading(true);
      try {
        const [toolsData, scopeData, colleagueData] = await Promise.all([
          fetchPublishedTools(tenantId),
          fetchUserOperationalScope(userId, tenantId),
          fetchColleagues(tenantId)
        ]);

        setPublishedTools(toolsData);
        setUserScope(scopeData);
        setColleagues(colleagueData);

        if (scopeData.contracts.length > 0) {
          setSelectedContractId(scopeData.contracts[0].id);
        }
        if (scopeData.sites.length > 0) {
          setSelectedSiteId(scopeData.sites[0].id);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [profile?.tenant_id, profile?.id]);

  // When a Tool is selected, resolve its exact published Tool Version
  const handleSelectTool = async (tool: Tool) => {
    if (!profile?.tenant_id) return;
    setActionLoading(true);
    setError(null);
    try {
      const ver = await fetchPublishedToolVersion(tool.id, profile.tenant_id);
      if (!ver) {
        throw new Error(`Tool "${tool.name}" currently has no published version available.`);
      }

      // Extract target roles configured for this instrument
      const targetRoles: string[] = tool.target_role_ids || (ver.settings as any)?.target_role_ids || [];
      const toolWithRoles = { ...tool, target_role_ids: targetRoles };

      setSelectedTool(toolWithRoles);
      setSelectedVersion(ver);

      // Pre-select matching colleague if available
      const { matching } = filterColleaguesByRoles(colleagues, targetRoles);
      if (matching.length > 0) {
        setSelectedColleague(matching[0]);
        setColleagueFilterMode('matching');
      } else if (colleagues.length > 0) {
        setSelectedColleague(colleagues[0]);
        setColleagueFilterMode('all');
      } else {
        setSelectedColleague(null);
      }
      
      // Advance to Context Selection
      setStep('select_context');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Quick Add Colleague on Shift
  const handleQuickAddColleague = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.tenant_id || !quickName.trim()) return;

    const generatedId = quickEmpId.trim() || `OP-${Math.floor(1000 + Math.random() * 9000)}`;
    const newColleague: ColleagueProfile = {
      id: `col-${Date.now()}`,
      tenant_id: profile.tenant_id,
      full_name: quickName.trim(),
      employee_id: generatedId,
      department: 'Operations',
      shift: 'Active Shift',
      status: 'active',
      role_ids: [quickRole],
      is_observer: quickRole === 'observer',
      is_operator: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    await saveColleague(profile.tenant_id, newColleague);
    setColleagues(prev => [newColleague, ...prev]);
    setSelectedColleague(newColleague);
    setShowQuickAddColleague(false);
    setQuickName('');
    setQuickEmpId('');
  };

  // Start the observation draft and load full coherent tool definition
  const handleStartObservation = async () => {
    if (!profile?.tenant_id || !selectedTool || !selectedVersion) return;
    if (!selectedContractId || !selectedSiteId) {
      setError('Please select both a contract and a site location before proceeding.');
      return;
    }
    if (!selectedColleague) {
      setError('Please select the colleague being observed before proceeding.');
      return;
    }

    setActionLoading(true);
    setError(null);
    try {
      // 1. Fetch full coherent tool definition
      const def = await fetchFullToolDefinition(selectedVersion.id, profile.tenant_id);
      setToolDef(def);

      const targetRoles = selectedTool.target_role_ids || (selectedVersion.settings as any)?.target_role_ids || [];

      // 2. Start Draft Observation in DB
      const draftObs = await startObservationDraft(
        profile.tenant_id,
        profile.id,
        selectedTool.id,
        selectedVersion.id,
        selectedContractId,
        selectedSiteId,
        selectedAreaId || null,
        selectedOperationTypeId || null,
        {
          observed_colleague_id: selectedColleague.id,
          observed_colleague_name: selectedColleague.full_name,
          observed_colleague_employee_id: selectedColleague.employee_id,
          observed_colleague_role: (selectedColleague.role_ids || []).join(', ') || 'Operator',
          observed_colleague_shift: selectedColleague.shift,
          observed_colleague_department: selectedColleague.department,
          target_roles: targetRoles
        }
      );
      setObservation(draftObs);

      // Reset state for form execution
      setAnswers({});
      setPhotosByQuestion({});
      setSignaturesByQuestion({});
      setActiveSectionIndex(0);
      setStep('form_execution');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Helper to evaluate if question matches operational context (site area & operation type)
  const isQuestionContextMatch = (q: ToolQuestion): boolean => {
    // Area filter check
    const qAreaIds = q.area_ids && q.area_ids.length > 0 
      ? q.area_ids 
      : (q.area_id ? [q.area_id] : []);

    if (qAreaIds.length > 0) {
      if (!selectedAreaId || !qAreaIds.includes(selectedAreaId)) {
        return false;
      }
    }

    // Operation Type filter check
    const qOpTypeIds = q.operation_type_ids && q.operation_type_ids.length > 0 
      ? q.operation_type_ids 
      : (q.operation_type_id ? [q.operation_type_id] : []);

    if (qOpTypeIds.length > 0) {
      if (!selectedOperationTypeId || !qOpTypeIds.includes(selectedOperationTypeId)) {
        return false;
      }
    }

    return true;
  };

  // Evaluate dynamic visibility and requiredness using rule-evaluation service!
  const evalResult = toolDef ? evaluateToolVisibility(
    toolDef.sections,
    toolDef.questions,
    toolDef.rules,
    toolDef.conditions,
    answers
  ) : { visibleQuestions: new Set<string>(), visibleSections: new Set<string>(), requiredQuestions: new Set<string>() };

  // Handle setting/saving an answer
  const handleAnswerChange = async (question: ToolQuestion, value: any) => {
    if (!profile?.tenant_id || !observation) return;

    // Update local answers map instantly
    setAnswers(prev => ({ ...prev, [question.id]: value }));

    // Prepare relational payload
    let selectedOptionId: string | null = null;
    let answerText: string | null = null;
    let answerNumeric: number | null = null;
    let answerBoolean: boolean | null = null;
    let answerJson: any | null = null;

    if (question.answer_type === 'boolean') {
      answerBoolean = typeof value === 'boolean' ? value : value === 'true';
    } else if (question.answer_type === 'single_choice') {
      selectedOptionId = typeof value === 'string' ? value : null;
    } else if (question.answer_type === 'multiple_choice') {
      answerJson = Array.isArray(value) ? value : [value];
    } else if (question.answer_type === 'number' || question.answer_type === 'rating') {
      answerNumeric = value !== null && value !== undefined && value !== '' ? Number(value) : null;
    } else {
      answerText = typeof value === 'string' ? value : JSON.stringify(value);
    }

    // Persist answer to Supabase asynchronously
    try {
      await upsertObservationResponse(
        profile.tenant_id,
        observation.id,
        question.id,
        {
          selected_option_id: selectedOptionId,
          answer_text: answerText,
          answer_numeric: answerNumeric,
          answer_boolean: answerBoolean,
          answer_json: answerJson
        }
      );
    } catch (err) {
      console.error('Async answer save error:', err);
    }
  };

  // Handle Photo File Upload
  const handlePhotoUpload = async (questionId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    if (!profile?.tenant_id || !observation || !e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    setActionLoading(true);
    try {
      const photoRecord = await uploadObservationPhoto(
        profile.tenant_id,
        observation.id,
        questionId,
        file
      );

      setPhotosByQuestion(prev => ({
        ...prev,
        [questionId]: [...(prev[questionId] || []), photoRecord]
      }));
    } catch (err) {
      alert(`Photo upload failed: ${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Handle Signature Upload
  const handleSignatureSave = async (questionId: string, dataUrl: string) => {
    if (!profile?.tenant_id || !observation) return;
    setActionLoading(true);
    try {
      const sigRecord = await uploadObservationSignature(
        profile.tenant_id,
        observation.id,
        questionId,
        profile.full_name || 'Observer',
        'Observer',
        dataUrl
      );

      setSignaturesByQuestion(prev => ({
        ...prev,
        [questionId]: [sigRecord]
      }));
    } catch (err) {
      alert(`Signature upload failed: ${(err as Error).message}`);
    } finally {
      setActionLoading(false);
    }
  };

  // Submission & Validation Logic
  const handleValidateAndReview = () => {
    if (!toolDef) return;
    setValidationErrors([]);

    const errors: string[] = [];

    // Validate only visible & context-matching questions
    for (const q of toolDef.questions) {
      if (!evalResult.visibleQuestions.has(q.id) || !isQuestionContextMatch(q)) continue; // Skip hidden or non-matching questions

      const isReq = evalResult.requiredQuestions.has(q.id);
      const ans = answers[q.id];

      if (isReq) {
        if (q.answer_type === 'photo') {
          const photos = photosByQuestion[q.id] || [];
          if (photos.length === 0) {
            errors.push(`Photo requirement missing for "${q.question_text}" (${q.question_code}).`);
          }
        } else if (q.answer_type === 'signature') {
          const sigs = signaturesByQuestion[q.id] || [];
          if (sigs.length === 0) {
            errors.push(`Signature requirement missing for "${q.question_text}" (${q.question_code}).`);
          }
        } else if (isAnswerEmpty(ans)) {
          errors.push(`Required question unanswered: "${q.question_text}" (${q.question_code}).`);
        }
      }
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
    } else {
      setValidationErrors([]);
    }

    setStep('review');
  };

  const handleFinalSubmit = async () => {
    if (!observation) return;
    setActionLoading(true);
    setError(null);

    try {
      // Execute transactional finalization RPC
      await finalizeObservation(observation.id);

      setStep('confirmation');
      if (onComplete) onComplete(observation.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 space-y-4">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-semibold text-slate-500">Loading operational instruments...</p>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto bg-slate-50 min-h-screen pb-12 shadow-xl rounded-2xl overflow-hidden border border-slate-200">
      
      {/* Mobile Top Header */}
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center space-x-2">
          {step !== 'select_tool' && step !== 'confirmation' && (
            <button
              onClick={() => {
                if (step === 'select_context') setStep('select_tool');
                else if (step === 'form_execution') {
                  if (activeSectionIndex > 0) setActiveSectionIndex(prev => prev - 1);
                  else setStep('select_context');
                } else if (step === 'review') setStep('form_execution');
              }}
              className="p-1 hover:bg-slate-800 rounded-lg cursor-pointer transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-300" />
            </button>
          )}
          <div>
            <h2 className="text-sm font-bold truncate">
              {selectedTool ? selectedTool.name : 'Start Observation'}
            </h2>
            <p className="text-[10px] text-slate-400 font-mono">
              {selectedVersion ? `v${selectedVersion.version_number} Published` : 'DASH V2 Runtime'}
            </p>
          </div>
        </div>

        {onCancel && step !== 'confirmation' && (
          <button
            onClick={onCancel}
            className="text-xs text-slate-400 hover:text-white font-semibold cursor-pointer"
          >
            Cancel
          </button>
        )}
      </div>

      {/* Global Error Notice */}
      {error && (
        <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-semibold text-red-800 flex items-center">
          <AlertCircle className="w-4 h-4 mr-2 shrink-0 text-red-600" />
          <span>{error}</span>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* STEP 1: Tool Selection */}
      {/* ----------------------------------------------------------------------- */}
      {step === 'select_tool' && (
        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Step 1 of 3</h3>
            <h1 className="text-lg font-bold text-slate-900">Select Observation Tool</h1>
            <p className="text-xs text-slate-500">Only published tools available for your tenant are listed.</p>
          </div>

          {publishedTools.length === 0 ? (
            <div className="p-8 text-center bg-white border border-dashed border-slate-200 rounded-xl text-xs text-slate-400">
              No published tools are currently available for this tenant.
            </div>
          ) : (
            <div className="space-y-3">
              {publishedTools.map(tool => (
                <button
                  key={tool.id}
                  onClick={() => handleSelectTool(tool)}
                  disabled={actionLoading}
                  className="w-full text-left p-4 bg-white hover:bg-slate-100/80 border border-slate-200 rounded-xl shadow-3xs transition-all cursor-pointer flex items-center justify-between group"
                >
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-bold uppercase px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">
                      {tool.category}
                    </span>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {tool.name}
                    </h3>
                    {tool.description && (
                      <p className="text-xs text-slate-500 line-clamp-2">{tool.description}</p>
                    )}
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* STEP 2: Context Selection (Contract & Site) */}
      {/* ----------------------------------------------------------------------- */}
      {step === 'select_context' && selectedTool && (
        <div className="p-4 space-y-6">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Step 2 of 3</h3>
            <h1 className="text-lg font-bold text-slate-900">Operational Scope Context</h1>
            <p className="text-xs text-slate-500">Confirm the specific contract and site where this observation is occurring.</p>
          </div>

          <div className="space-y-4 bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
            {/* Contract Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center">
                <Briefcase className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> Contract Scope
              </label>
              <select
                value={selectedContractId}
                onChange={(e) => {
                  setSelectedContractId(e.target.value);
                  // Filter sites
                  const matchingSites = userScope.sites.filter(s => s.contract_id === e.target.value);
                  if (matchingSites.length > 0) setSelectedSiteId(matchingSites[0].id);
                }}
                className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-3 bg-white text-slate-900"
              >
                {userScope.contracts.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.code} - {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Site Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center">
                <MapPin className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> Site Location
              </label>
              <select
                value={selectedSiteId}
                onChange={(e) => setSelectedSiteId(e.target.value)}
                className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-3 bg-white text-slate-900"
              >
                {userScope.sites
                  .filter(s => s.contract_id === selectedContractId)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.code} - {s.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Site Area Selector */}
            {siteAreas.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center">
                    <Layers className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> Site Area / Zone
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </label>
                <select
                  value={selectedAreaId}
                  onChange={(e) => setSelectedAreaId(e.target.value)}
                  className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-3 bg-white text-slate-900"
                >
                  <option value="">-- Unspecified / Entire Site --</option>
                  {siteAreas.map(a => (
                    <option key={a.id} value={a.id}>
                      [{a.code}] {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Operation Type Selector */}
            {operationTypes.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center font-bold">
                    <ShieldCheck className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> Operation Type
                  </span>
                  <span className="text-[10px] text-slate-400 font-normal">Optional</span>
                </label>
                <select
                  value={selectedOperationTypeId}
                  onChange={(e) => setSelectedOperationTypeId(e.target.value)}
                  className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-3 bg-white text-slate-900"
                >
                  <option value="">-- Unspecified Operation --</option>
                  {operationTypes.map(o => (
                    <option key={o.id} value={o.id}>
                      [{o.code}] {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Colleague Being Observed Selection Card */}
          {(() => {
            const targetRoles: string[] = selectedTool.target_role_ids || (selectedVersion?.settings as any)?.target_role_ids || [];
            const { matching } = filterColleaguesByRoles(colleagues, targetRoles);
            
            const displayList = colleagueFilterMode === 'matching' && targetRoles.length > 0
              ? matching
              : colleagues;

            const filteredList = displayList.filter(c => {
              if (!colleagueSearch.trim()) return true;
              const q = colleagueSearch.toLowerCase();
              return c.full_name.toLowerCase().includes(q) || c.employee_id.toLowerCase().includes(q);
            });

            return (
              <div className="space-y-3 bg-white border border-slate-200 rounded-xl p-4 shadow-3xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="space-y-0.5">
                    <label className="text-xs font-bold text-slate-900 flex items-center">
                      <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                      Colleague Being Observed <span className="text-red-500 ml-1">*</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Select the operator or colleague being evaluated during this observation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddColleague(true)}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center bg-indigo-50 px-2 py-1 rounded cursor-pointer transition-colors"
                  >
                    <UserPlus className="w-3 h-3 mr-1" />
                    + Quick Add
                  </button>
                </div>

                {/* Target Role Indication Banner */}
                {targetRoles.length > 0 && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-xs flex items-center justify-between">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                        Configured Instrument Roles
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {targetRoles.map(roleCode => (
                          <span
                            key={roleCode}
                            className="bg-indigo-100 text-indigo-800 text-[10px] font-bold px-1.5 py-0.5 rounded capitalize"
                          >
                            {roleCode.replace(/_/g, ' ')}
                          </span>
                        ))}
                      </div>
                    </div>
                    {matching.length > 0 && (
                      <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                        {matching.length} matching found
                      </span>
                    )}
                  </div>
                )}

                {/* Filter Tabs & Search */}
                <div className="space-y-2">
                  {targetRoles.length > 0 && (
                    <div className="flex border-b border-slate-100 text-xs">
                      <button
                        type="button"
                        onClick={() => setColleagueFilterMode('matching')}
                        className={`pb-1.5 px-2 font-bold cursor-pointer transition-colors border-b-2 ${
                          colleagueFilterMode === 'matching'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        Matching Roles ({matching.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setColleagueFilterMode('all')}
                        className={`pb-1.5 px-2 font-bold cursor-pointer transition-colors border-b-2 ${
                          colleagueFilterMode === 'all'
                            ? 'border-indigo-600 text-indigo-600'
                            : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                      >
                        All Colleagues ({colleagues.length})
                      </button>
                    </div>
                  )}

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search colleague by name or badge #..."
                      value={colleagueSearch}
                      onChange={(e) => setColleagueSearch(e.target.value)}
                      className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400"
                    />
                  </div>
                </div>

                {/* Colleague Selection Cards List */}
                {filteredList.length === 0 ? (
                  <div className="p-4 text-center border border-dashed border-slate-200 rounded-lg space-y-2">
                    <p className="text-xs text-slate-500">
                      No colleagues found matching your current filter.
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowQuickAddColleague(true)}
                      className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5 mr-1" />
                      Add colleague to shift
                    </button>
                  </div>
                ) : (
                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1">
                    {filteredList.map(c => {
                      const isSelected = selectedColleague?.id === c.id;

                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => setSelectedColleague(c)}
                          className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/70 ring-1 ring-indigo-500'
                              : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/60'
                          }`}
                        >
                          <div className="space-y-1">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-slate-900">
                                {c.full_name}
                              </span>
                              <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                                {c.employee_id}
                              </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1">
                              {(c.role_ids || []).map(rId => (
                                <span
                                  key={rId}
                                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded capitalize ${
                                    targetRoles.includes(rId)
                                      ? 'bg-indigo-100 text-indigo-800'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {rId.replace(/_/g, ' ')}
                                </span>
                              ))}
                              {c.shift && (
                                <span className="text-[9px] text-slate-400">
                                  • {c.shift}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center pl-2">
                            {isSelected ? (
                              <div className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 stroke-[3]" />
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full border border-slate-300" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Selected Colleague Banner Summary */}
                {selectedColleague && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                        {selectedColleague.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="flex items-center space-x-1.5">
                          <span className="text-xs font-bold text-emerald-950">
                            {selectedColleague.full_name}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-emerald-700">
                            ({selectedColleague.employee_id})
                          </span>
                        </div>
                        <span className="text-[10px] text-emerald-800 font-medium">
                          {(selectedColleague.role_ids || []).join(', ') || 'Colleague'}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                      Selected
                    </span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Quick Add Colleague Modal */}
          {showQuickAddColleague && (
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
              <div className="bg-white border border-slate-200 rounded-xl max-w-sm w-full p-5 space-y-4 shadow-2xl animate-in zoom-in-95">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <div className="flex items-center space-x-2">
                    <UserPlus className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900">Add Colleague on Shift</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQuickAddColleague(false)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleQuickAddColleague} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Full Name *</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. David Ross"
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      className="w-full text-xs font-medium border border-slate-200 rounded-lg p-2.5 text-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Employee / Badge ID</label>
                    <input
                      type="text"
                      placeholder="e.g. OP-5021 (auto-generated if blank)"
                      value={quickEmpId}
                      onChange={(e) => setQuickEmpId(e.target.value)}
                      className="w-full text-xs font-medium border border-slate-200 rounded-lg p-2.5 text-slate-900 bg-white"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Primary Role *</label>
                    <select
                      value={quickRole}
                      onChange={(e) => setQuickRole(e.target.value)}
                      className="w-full text-xs font-medium border border-slate-200 rounded-lg p-2.5 text-slate-900 bg-white"
                    >
                      <option value="mhe_operator">MHE Operator (Forklift, Reach, LLOP)</option>
                      <option value="machine_operator">Machine Operator (Production, Sorter)</option>
                      <option value="observer">Safety Observer / Auditor</option>
                      <option value="warehouse_colleague">Warehouse Colleague</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowQuickAddColleague(false)}
                      className="w-1/2 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!quickName.trim()}
                      className="w-1/2 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg cursor-pointer"
                    >
                      Save & Select
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <button
            onClick={handleStartObservation}
            disabled={actionLoading || !selectedContractId || !selectedSiteId || !selectedColleague}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center cursor-pointer"
          >
            {actionLoading ? 'Initializing Runtime...' : 'Begin Observation Execution'}
            <ArrowRight className="w-4 h-4 ml-2" />
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* STEP 3: Form Execution (Mobile Section by Section) */}
      {/* ----------------------------------------------------------------------- */}
      {step === 'form_execution' && toolDef && (
        <div className="space-y-4">
          
          {/* Section Progress Bar */}
          {toolDef.sections.length > 0 && (
            <div className="bg-white border-b border-slate-200 p-4 sticky top-[57px] z-20 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                <span className="uppercase tracking-wider text-[10px] text-slate-400">
                  Section {activeSectionIndex + 1} of {toolDef.sections.length}
                </span>
                <span className="text-indigo-600">
                  {toolDef.sections[activeSectionIndex]?.title}
                </span>
              </div>
              
              {/* Progress bar line */}
              <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-300"
                  style={{ width: `${((activeSectionIndex + 1) / toolDef.sections.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Observed Colleague Banner */}
          {selectedColleague && (
            <div className="mx-4 bg-white border border-slate-200 rounded-xl px-3 py-2 flex items-center justify-between text-xs shadow-3xs">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-[10px]">
                  {selectedColleague.full_name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-slate-800 text-xs">
                      Observing: {selectedColleague.full_name}
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      ({selectedColleague.employee_id})
                    </span>
                  </div>
                </div>
              </div>
              <span className="text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded capitalize">
                {(selectedColleague.role_ids || []).join(', ') || 'Colleague'}
              </span>
            </div>
          )}

          {/* Current Active Section Content */}
          <div className="p-4 space-y-6">
            {(() => {
              const currentSection = toolDef.sections[activeSectionIndex];
              if (!currentSection || !evalResult.visibleSections.has(currentSection.id)) {
                return (
                  <div className="p-8 text-center text-xs text-slate-400 font-semibold italic bg-white rounded-xl border border-slate-200">
                    This section is hidden by current operational rule conditions.
                  </div>
                );
              }

              const secQs = toolDef.questions
                .filter(q => q.section_id === currentSection.id && isQuestionContextMatch(q))
                .sort((a, b) => a.order_index - b.order_index);

              return (
                <div className="space-y-6">
                  {/* Section Title Card */}
                  <div className="space-y-1 border-b border-slate-200 pb-3">
                    <h2 className="text-base font-bold text-slate-900">{currentSection.title}</h2>
                    {currentSection.description && (
                      <p className="text-xs text-slate-500">{currentSection.description}</p>
                    )}
                  </div>

                  {secQs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 italic bg-white rounded-xl border border-slate-200">
                      No questions in this section match the selected site area or operation scope.
                    </div>
                  ) : (
                    /* Questions Render Loop */
                    <div className="space-y-6">
                      {secQs.map((q) => {
                        // Skip if question is hidden by conditional logic
                        if (!evalResult.visibleQuestions.has(q.id)) return null;

                      const isReq = evalResult.requiredQuestions.has(q.id);
                      const currentAns = answers[q.id];
                      const qOpts = toolDef.options
                        .filter(opt => opt.question_id === q.id)
                        .sort((a, b) => a.order_index - b.order_index);

                      return (
                        <div key={q.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs space-y-3">
                          <div className="space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                                {q.question_code}
                              </span>
                              {isReq && (
                                <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider">Required</span>
                              )}
                            </div>
                            <h3 className="text-xs font-bold text-slate-900 leading-snug">{q.question_text}</h3>
                            {q.hint_text && (
                              <p className="text-[10px] text-slate-400 italic">{q.hint_text}</p>
                            )}
                          </div>

                          {/* Render Touch Answer Input Controls */}
                          <div className="pt-2">
                            {/* BOOLEAN */}
                            {q.answer_type === 'boolean' && (
                              <div className="grid grid-cols-2 gap-3">
                                {[
                                  { label: 'Yes', val: true },
                                  { label: 'No', val: false }
                                ].map(opt => {
                                  const active = currentAns === opt.val;
                                  return (
                                    <button
                                      key={opt.label}
                                      type="button"
                                      onClick={() => handleAnswerChange(q, opt.val)}
                                      className={`py-3 text-xs font-bold rounded-xl border text-center transition-all cursor-pointer ${
                                        active
                                          ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* SINGLE CHOICE / MULTI CHOICE */}
                            {(q.answer_type === 'single_choice' || q.answer_type === 'multiple_choice') && (
                              <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                  {qOpts.map(opt => {
                                    const isArr = Array.isArray(currentAns);
                                    const active = q.answer_type === 'single_choice'
                                      ? currentAns === opt.value
                                      : isArr && currentAns.includes(opt.value);

                                    return (
                                      <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => {
                                          if (q.answer_type === 'single_choice') {
                                            handleAnswerChange(q, opt.value);
                                          } else {
                                            const cur = Array.isArray(currentAns) ? currentAns : [];
                                            const next = cur.includes(opt.value)
                                              ? cur.filter(v => v !== opt.value)
                                              : [...cur, opt.value];
                                            handleAnswerChange(q, next);
                                          }
                                        }}
                                        className={`px-3 py-2 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                                          active
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                        }`}
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* RATING */}
                            {q.answer_type === 'rating' && (
                              <div className="flex justify-between items-center gap-1">
                                {[1, 2, 3, 4, 5].map(num => (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => handleAnswerChange(q, num)}
                                    className={`w-11 h-11 rounded-xl border font-bold text-xs flex items-center justify-center cursor-pointer transition-all ${
                                      currentAns === num
                                        ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                    }`}
                                  >
                                    {num}
                                  </button>
                                ))}
                              </div>
                            )}

                            {/* TEXT */}
                            {q.answer_type === 'text' && (
                              <textarea
                                value={currentAns || ''}
                                onChange={(e) => handleAnswerChange(q, e.target.value)}
                                rows={3}
                                placeholder="Enter detailed operational notes..."
                                className="w-full text-xs border border-slate-200 rounded-xl p-3 bg-white text-slate-900"
                              />
                            )}

                            {/* NUMBER */}
                            {q.answer_type === 'number' && (
                              <input
                                type="number"
                                value={currentAns || ''}
                                onChange={(e) => handleAnswerChange(q, e.target.value)}
                                placeholder="0"
                                className="w-full text-xs border border-slate-200 rounded-xl p-3 bg-white text-slate-900"
                              />
                            )}

                            {/* DATE & TIME */}
                            {q.answer_type === 'date' && (
                              <input
                                type="date"
                                value={currentAns || ''}
                                onChange={(e) => handleAnswerChange(q, e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded-xl p-3 bg-white text-slate-900"
                              />
                            )}
                            {q.answer_type === 'time' && (
                              <input
                                type="time"
                                value={currentAns || ''}
                                onChange={(e) => handleAnswerChange(q, e.target.value)}
                                className="w-full text-xs border border-slate-200 rounded-xl p-3 bg-white text-slate-900"
                              />
                            )}

                            {/* PHOTO CAPTURE */}
                            {q.answer_type === 'photo' && (
                              <div className="space-y-3">
                                <label className="flex items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-colors">
                                  <Camera className="w-5 h-5 mr-2 text-indigo-600" />
                                  <span className="text-xs font-bold text-slate-700">Capture / Upload Photo</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(e) => handlePhotoUpload(q.id, e)}
                                    className="hidden"
                                  />
                                </label>

                                {/* List uploaded photos */}
                                {(photosByQuestion[q.id] || []).length > 0 && (
                                  <div className="text-xs font-semibold text-green-700 flex items-center">
                                    <Check className="w-4 h-4 mr-1 text-green-600" />
                                    {(photosByQuestion[q.id] || []).length} Photo(s) Attached
                                  </div>
                                )}
                              </div>
                            )}

                            {/* SIGNATURE CAPTURE */}
                            {q.answer_type === 'signature' && (
                              <SignatureCanvas
                                onSave={(dataUrl) => handleSignatureSave(q.id, dataUrl)}
                                existingSignatureUrl={(signaturesByQuestion[q.id] || [])[0]?.storage_path}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Section Navigation Footer Controls */}
          <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-between sticky bottom-0 z-20 shadow-lg">
            <button
              onClick={() => setActiveSectionIndex(prev => Math.max(0, prev - 1))}
              disabled={activeSectionIndex === 0}
              className="px-4 py-2 text-xs font-bold text-slate-600 disabled:opacity-30 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Previous
            </button>

            {activeSectionIndex < toolDef.sections.length - 1 ? (
              <button
                onClick={() => setActiveSectionIndex(prev => prev + 1)}
                className="px-5 py-2.5 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 cursor-pointer transition-colors"
              >
                Next Section
              </button>
            ) : (
              <button
                onClick={handleValidateAndReview}
                className="px-5 py-2.5 bg-indigo-600 text-white font-bold text-xs rounded-xl hover:bg-indigo-700 cursor-pointer transition-colors flex items-center"
              >
                Review & Submit <ChevronRight className="w-4 h-4 ml-1" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* STEP 4: Review Observation */}
      {/* ----------------------------------------------------------------------- */}
      {step === 'review' && toolDef && (
        <div className="p-4 space-y-6">
          <div className="space-y-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Step 3 of 3</h3>
            <h1 className="text-lg font-bold text-slate-900">Review & Submit</h1>
            <p className="text-xs text-slate-500">Confirm all responses before finalizing the observation.</p>
          </div>

          {/* Validation Errors Notice */}
          {validationErrors.length > 0 && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-2">
              <h4 className="text-xs font-bold text-red-800 flex items-center">
                <AlertCircle className="w-4 h-4 mr-1.5 text-red-600" /> Validation Requirements
              </h4>
              <ul className="list-disc list-inside text-xs text-red-700 space-y-0.5">
                {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            </div>
          )}

          {/* Header Metadata summary */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs space-y-2 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 font-bold text-slate-800">
              <span>{selectedTool?.name}</span>
              <span className="font-mono text-[10px] text-indigo-700">v{selectedVersion?.version_number}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
              <div>
                <span className="text-slate-400 block font-semibold text-[9px] uppercase">Observer</span>
                <span className="font-bold text-slate-800">{profile?.full_name}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold text-[9px] uppercase">Timestamp</span>
                <span className="font-bold text-slate-800">{new Date().toLocaleTimeString()}</span>
              </div>
            </div>
          </div>

          {/* Observed Colleague Summary Card */}
          {selectedColleague && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-3xs space-y-2 text-xs">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="font-bold text-slate-800 flex items-center">
                  <UserCheck className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                  Observed Colleague
                </span>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded font-mono">
                  {selectedColleague.employee_id}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div>
                  <span className="text-slate-400 block font-semibold text-[9px] uppercase">Name</span>
                  <span className="font-bold text-slate-800">{selectedColleague.full_name}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[9px] uppercase">Operational Role</span>
                  <span className="font-bold text-slate-800">{(selectedColleague.role_ids || []).join(', ') || 'Operator'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[9px] uppercase">Shift</span>
                  <span className="text-slate-700">{selectedColleague.shift || 'Standard'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold text-[9px] uppercase">Department</span>
                  <span className="text-slate-700">{selectedColleague.department || 'Operations'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Response Review list */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Answer Summary</h3>
            <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-100 shadow-3xs">
              {toolDef.questions.map(q => {
                if (!evalResult.visibleQuestions.has(q.id) || !isQuestionContextMatch(q)) return null;
                const ans = answers[q.id];

                return (
                  <div key={q.id} className="p-3 flex items-start justify-between text-xs">
                    <div className="space-y-0.5">
                      <span className="text-[9px] font-mono font-bold text-slate-400">{q.question_code}</span>
                      <p className="font-semibold text-slate-800">{q.question_text}</p>
                    </div>
                    <div className="text-right">
                      <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded inline-block text-[11px]">
                        {isAnswerEmpty(ans) ? 'Unanswered' : String(ans)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            onClick={handleFinalSubmit}
            disabled={actionLoading || validationErrors.length > 0}
            className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center cursor-pointer"
          >
            <Send className="w-4 h-4 mr-2" />
            {actionLoading ? 'Submitting Observation...' : 'Submit Observation'}
          </button>
        </div>
      )}

      {/* ----------------------------------------------------------------------- */}
      {/* STEP 5: Submission Confirmation Card */}
      {/* ----------------------------------------------------------------------- */}
      {step === 'confirmation' && observation && (
        <div className="p-6 text-center space-y-6 my-auto flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h1 className="text-lg font-bold text-slate-900">Observation Submitted</h1>
            <p className="text-xs text-slate-500">
              Your observation has been transactionally finalized and bound to tool version v{selectedVersion?.version_number}.
            </p>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 w-full text-left space-y-2 text-xs shadow-3xs">
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-400">Reference ID:</span>
              <span className="font-mono font-bold text-slate-800">{observation.id.substring(0, 13)}...</span>
            </div>
            <div className="flex justify-between border-b pb-2">
              <span className="text-slate-400">Instrument:</span>
              <span className="font-bold text-slate-800">{selectedTool?.name}</span>
            </div>
            {selectedColleague && (
              <div className="flex justify-between border-b pb-2">
                <span className="text-slate-400">Observed Colleague:</span>
                <span className="font-bold text-slate-800">
                  {selectedColleague.full_name} ({selectedColleague.employee_id})
                </span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-slate-400">Status:</span>
              <span className="font-bold uppercase text-green-700">Completed</span>
            </div>
          </div>

          <button
            onClick={() => {
              setStep('select_tool');
              setObservation(null);
            }}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors"
          >
            Start Another Observation
          </button>
        </div>
      )}

    </div>
  );
}
