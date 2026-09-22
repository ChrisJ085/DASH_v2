// src/components/ToolBuilder.tsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import {
  Settings,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Check,
  X,
  ChevronRight,
  ChevronDown,
  Copy,
  Lock,
  Unlock,
  Archive,
  Eye,
  RefreshCw,
  AlertCircle,
  EyeOff,
  Save,
  Layers,
  FileText,
  Workflow,
  HelpCircle,
  Clipboard,
  Users,
  Building2,
  MapPin,
  Sparkles,
  CheckSquare
} from 'lucide-react';
import { BatchQuestionImportModal } from './BatchQuestionImportModal';
import { MultiSelectEntityDropdown } from './MultiSelectEntityDropdown';
import { AddQuestionsFromBankModal } from './AddQuestionsFromBankModal';
import { CreateInstrumentModal } from './CreateInstrumentModal';
import {
  Tool,
  ToolVersion,
  ToolSection,
  ToolQuestion,
  SiteArea,
  OperationType,
  QuestionOption,
  ConditionalRule,
  RuleCondition,
  AnswerType,
  ToolStatus
} from '../types/tool-engine';
import { Site } from '../types/database';
import { ColleagueRole, DEFAULT_COLLEAGUE_ROLES } from '../types/colleague';
import { fetchColleagueRoles } from '../lib/colleague-service';
import {
  evaluateToolVisibility,
  detectCircularDependencies,
  isAnswerEmpty
} from '../lib/rule-evaluation';

export default function ToolBuilder() {
  const { profile, tenant, hasPermission } = useAuth();

  // Primary list state
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected state
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const [versions, setVersions] = useState<ToolVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<ToolVersion | null>(null);

  // Structural state of selected version
  const [sections, setSections] = useState<ToolSection[]>([]);
  const [questions, setQuestions] = useState<ToolQuestion[]>([]);
  const [options, setOptions] = useState<QuestionOption[]>([]);
  const [rules, setRules] = useState<ConditionalRule[]>([]);
  const [conditions, setConditions] = useState<RuleCondition[]>([]);

  // Workspace active editing mode
  // 'questions' | 'tool_settings' | 'hierarchy' | 'rules' | 'preview'
  const [workspaceMode, setWorkspaceMode] = useState<'questions' | 'tool_settings' | 'hierarchy' | 'rules' | 'preview'>('questions');

  // Currently focused element for editing in sidebar/panels
  const [editingSection, setEditingSection] = useState<ToolSection | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<ToolQuestion | null>(null);
  
  // UI creation state modals
  const [showCreateTool, setShowCreateTool] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDesc, setNewToolDesc] = useState('');
  const [newToolCategory, setNewToolCategory] = useState('safety');
  const [newToolSiteIds, setNewToolSiteIds] = useState<string[]>([]);
  const [newToolAreaIds, setNewToolAreaIds] = useState<string[]>([]);
  const [newToolOpTypeIds, setNewToolOpTypeIds] = useState<string[]>([]);
  const [newToolTargetRoleIds, setNewToolTargetRoleIds] = useState<string[]>(['mhe_operator', 'machine_operator']);
  const [colleagueRoles, setColleagueRoles] = useState<ColleagueRole[]>(DEFAULT_COLLEAGUE_ROLES);
  const [sites, setSites] = useState<Site[]>([]);

  // Deleting whole instrument states
  const [deleteToolModalOpen, setDeleteToolModalOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<any>(null);
  const [questionsToPreserveIds, setQuestionsToPreserveIds] = useState<string[]>([]);
  const [toolToDeleteQuestions, setToolToDeleteQuestions] = useState<any[]>([]);
  const [fetchingToolQs, setFetchingToolQs] = useState(false);

  // Global Questions Builder state
  const [allQuestions, setAllQuestions] = useState<(ToolQuestion & { tool_name?: string; tool_names?: string[]; tool_id?: string; area_ids?: string[]; operation_type_ids?: string[] })[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterToolId, setFilterToolId] = useState<string>('');
  const [filterAreaId, setFilterAreaId] = useState<string>('');
  const [filterOpTypeId, setFilterOpTypeId] = useState<string>('');

  // Single Question Creator / Editor Modal State
  const [showSingleQuestionModal, setShowSingleQuestionModal] = useState(false);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qFormTitle, setQFormTitle] = useState('');
  const [qFormHint, setQFormHint] = useState('');
  const [qFormAnswerType, setQFormAnswerType] = useState<AnswerType>('single_choice');
  const [qFormToolIds, setQFormToolIds] = useState<string[]>([]);
  const [qFormIsCreatingTool, setQFormIsCreatingTool] = useState(false);
  const [qFormNewToolName, setQFormNewToolName] = useState('');
  const [qFormNewToolDesc, setQFormNewToolDesc] = useState('');
  const [qFormAreaIds, setQFormAreaIds] = useState<string[]>([]);
  const [qFormOpTypeIds, setQFormOpTypeIds] = useState<string[]>([]);
  const [qFormPreset, setQFormPreset] = useState<'pass_fail' | 'yes_no' | 'compliant' | 'none'>('pass_fail');

  // Batch Question Parser Modal State
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchImportTarget, setBatchImportTarget] = useState<{ id: string; title: string } | null>(null);

  // Add from Master Question Bank Modal State
  const [showAddFromBankModal, setShowAddFromBankModal] = useState(false);
  const [addFromBankTargetSectionId, setAddFromBankTargetSectionId] = useState<string | undefined>(undefined);

  const handleOpenAddFromBank = (sectionId?: string) => {
    setAddFromBankTargetSectionId(sectionId);
    setShowAddFromBankModal(true);
  };

  // Site Areas & Operation Types state
  const [siteAreas, setSiteAreas] = useState<SiteArea[]>([]);
  const [operationTypes, setOperationTypes] = useState<OperationType[]>([]);

  useEffect(() => {
    const tenantId = profile?.tenant_id;
    if (!tenantId) return;
    const fetchAreasAndOps = async () => {
      try {
        const [areasRes, opsRes, rolesData, sitesRes] = await Promise.all([
          supabase.from('site_areas').select('*').is('deleted_at', null).order('name'),
          supabase.from('operation_types').select('*').is('deleted_at', null).order('name'),
          fetchColleagueRoles(tenantId),
          supabase.from('sites').select('*').is('deleted_at', null).order('name')
        ]);
        if (areasRes.data) setSiteAreas(areasRes.data);
        if (opsRes.data) setOperationTypes(opsRes.data);
        if (rolesData) setColleagueRoles(rolesData);
        if (sitesRes.data) setSites(sitesRes.data);
      } catch (err) {
        console.error('Error fetching site areas/operation types:', err);
      }
    };
    fetchAreasAndOps();
  }, [profile?.tenant_id]);

  // Fetch all questions for Questions Builder view
  const fetchAllQuestions = async () => {
    if (!profile?.tenant_id) return;
    try {
      const { data: qData, error: qErr } = await supabase
        .from('tool_questions')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false });

      if (qErr) throw qErr;

      const { data: verData } = await supabase
        .from('tool_versions')
        .select('id, tool_id')
        .eq('tenant_id', profile.tenant_id);

      const { data: toolData } = await supabase
        .from('tools')
        .select('id, name')
        .eq('tenant_id', profile.tenant_id);

      const toolMap = new Map((toolData || []).map(t => [t.id, t.name]));
      const verToToolIdMap = new Map((verData || []).map(v => [v.id, v.tool_id]));
      const verMap = new Map((verData || []).map(v => [v.id, toolMap.get(v.tool_id)]));

      const enriched = (qData || []).map(q => {
        const primaryToolId = verToToolIdMap.get(q.tool_version_id);
        const tIds = (q.tool_ids && Array.isArray(q.tool_ids) && q.tool_ids.length > 0)
          ? q.tool_ids
          : (primaryToolId ? [primaryToolId] : []);
        const aIds = (q.area_ids && Array.isArray(q.area_ids) && q.area_ids.length > 0)
          ? q.area_ids
          : (q.area_id ? [q.area_id] : []);
        const oIds = (q.operation_type_ids && Array.isArray(q.operation_type_ids) && q.operation_type_ids.length > 0)
          ? q.operation_type_ids
          : (q.operation_type_id ? [q.operation_type_id] : []);

        const toolNames = tIds.map((tid: string) => toolMap.get(tid)).filter(Boolean) as string[];

        return {
          ...q,
          tool_id: primaryToolId,
          tool_ids: tIds,
          tool_names: toolNames,
          tool_name: toolNames.join(', ') || verMap.get(q.tool_version_id) || 'Unassigned Tool',
          area_ids: aIds,
          operation_type_ids: oIds,
        };
      });

      setAllQuestions(enriched);
    } catch (err) {
      console.error('Error fetching all questions:', err);
    }
  };

  useEffect(() => {
    fetchAllQuestions();
  }, [profile?.tenant_id]);

  // Action pending loaders
  const [actionLoading, setActionLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);

  // Mock answers for preview mode
  const [mockAnswers, setMockAnswers] = useState<Record<string, any>>({});

  const DEFAULT_PRESETS_MAP = {
    pass_fail: [
      { label: 'Pass', value: 'pass', is_flagged: false, score: 1 },
      { label: 'Fail', value: 'fail', is_flagged: true, score: 0 },
      { label: 'N/A', value: 'na', is_flagged: false, score: null }
    ],
    yes_no: [
      { label: 'Yes', value: 'yes', is_flagged: false, score: 1 },
      { label: 'No', value: 'no', is_flagged: true, score: 0 },
      { label: 'N/A', value: 'na', is_flagged: false, score: null }
    ],
    compliant: [
      { label: 'Compliant', value: 'compliant', is_flagged: false, score: 1 },
      { label: 'Non-Compliant', value: 'non_compliant', is_flagged: true, score: 0 },
      { label: 'N/A', value: 'na', is_flagged: false, score: null }
    ]
  };

  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    setQFormTitle('');
    setQFormHint('');
    setQFormAnswerType('single_choice');
    const defaultToolId = selectedTool?.id || (tools[0]?.id || '');
    setQFormToolIds(defaultToolId ? [defaultToolId] : []);
    setQFormIsCreatingTool(tools.length === 0);
    setQFormNewToolName('');
    setQFormNewToolDesc('');
    setQFormAreaIds([]);
    setQFormOpTypeIds([]);
    setQFormPreset('pass_fail');
  };

  const handleOpenNewQuestionModal = () => {
    resetQuestionForm();
    setShowSingleQuestionModal(true);
  };

  const handleOpenEditQuestionModal = (q: ToolQuestion & { tool_id?: string; tool_ids?: string[]; area_ids?: string[]; operation_type_ids?: string[] }) => {
    setEditingQuestionId(q.id);
    setQFormTitle(q.question_text || '');
    setQFormHint(q.hint_text || '');
    setQFormAnswerType(q.answer_type || 'single_choice');
    
    const tIds = (q.tool_ids && q.tool_ids.length > 0)
      ? q.tool_ids
      : (q.tool_id ? [q.tool_id] : (selectedTool?.id ? [selectedTool.id] : []));
    const aIds = (q.area_ids && q.area_ids.length > 0)
      ? q.area_ids
      : (q.area_id ? [q.area_id] : []);
    const oIds = (q.operation_type_ids && q.operation_type_ids.length > 0)
      ? q.operation_type_ids
      : (q.operation_type_id ? [q.operation_type_id] : []);

    setQFormToolIds(tIds);
    setQFormIsCreatingTool(false);
    setQFormNewToolName('');
    setQFormNewToolDesc('');
    setQFormAreaIds(aIds);
    setQFormOpTypeIds(oIds);
    setQFormPreset('pass_fail');
    setShowSingleQuestionModal(true);
  };

  const handleSaveSingleQuestion = async () => {
    if (!profile?.tenant_id) return;
    if (!qFormTitle.trim()) {
      setError('Question title is required.');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      let targetToolVersionId = '';
      let targetSectionId = '';
      let finalToolIds = [...qFormToolIds];

      if (qFormIsCreatingTool) {
        if (!qFormNewToolName.trim()) {
          throw new Error('Instrument / Tool Name is required.');
        }
        const slug = qFormNewToolName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const { data: newTool, error: tErr } = await supabase
          .from('tools')
          .insert({
            tenant_id: profile.tenant_id,
            name: qFormNewToolName.trim(),
            slug,
            description: qFormNewToolDesc.trim() || null,
            category: 'safety',
            status: 'draft',
            area_ids: qFormAreaIds,
            operation_type_ids: qFormOpTypeIds
          })
          .select()
          .single();

        if (tErr || !newTool) throw tErr || new Error('Failed to create new Instrument.');

        const { data: newVer, error: vErr } = await supabase
          .from('tool_versions')
          .insert({
            tool_id: newTool.id,
            tenant_id: profile.tenant_id,
            version_number: 1,
            status: 'draft'
          })
          .select()
          .single();

        if (vErr || !newVer) throw vErr || new Error('Failed to create version.');

        const { data: newSec, error: sErr } = await supabase
          .from('tool_sections')
          .insert({
            tool_version_id: newVer.id,
            tenant_id: profile.tenant_id,
            title: 'General Inspection',
            order_index: 0
          })
          .select()
          .single();

        if (sErr || !newSec) throw sErr || new Error('Failed to create section.');

        targetToolVersionId = newVer.id;
        targetSectionId = newSec.id;
        finalToolIds = [newTool.id, ...finalToolIds.filter(id => id !== newTool.id)];
      } else {
        const primaryToolId = finalToolIds[0] || selectedTool?.id;
        if (!primaryToolId) {
          throw new Error('Please select at least one Instrument / Tool or create a new one.');
        }

        // Fetch or create draft version
        const { data: verList } = await supabase
          .from('tool_versions')
          .select('*')
          .eq('tool_id', primaryToolId)
          .order('version_number', { ascending: false });

        let activeVer = verList?.find(v => v.status === 'draft') || verList?.[0];

        if (!activeVer) {
          const { data: createdVer, error: cVerErr } = await supabase
            .from('tool_versions')
            .insert({
              tool_id: primaryToolId,
              tenant_id: profile.tenant_id,
              version_number: (verList?.length || 0) + 1,
              status: 'draft'
            })
            .select()
            .single();

          if (cVerErr || !createdVer) throw cVerErr || new Error('Failed to initialize draft version.');
          activeVer = createdVer;
        }

        targetToolVersionId = activeVer.id;

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
              tenant_id: profile.tenant_id,
              title: 'General Inspection',
              order_index: 0
            })
            .select()
            .single();

          if (cSecErr || !createdSec) throw cSecErr || new Error('Failed to initialize section.');
          activeSec = createdSec;
        }

        targetSectionId = activeSec.id;
      }

      const primaryAreaId = qFormAreaIds[0] || null;
      const primaryOpTypeId = qFormOpTypeIds[0] || null;

      if (editingQuestionId) {
        // Update
        const { error: uErr } = await supabase
          .from('tool_questions')
          .update({
            question_text: qFormTitle.trim(),
            hint_text: qFormHint.trim() || null,
            answer_type: qFormAnswerType,
            area_id: primaryAreaId,
            operation_type_id: primaryOpTypeId,
            area_ids: qFormAreaIds,
            operation_type_ids: qFormOpTypeIds,
            tool_ids: finalToolIds,
            tool_version_id: targetToolVersionId,
            section_id: targetSectionId,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingQuestionId);

        if (uErr) throw uErr;
      } else {
        // Insert
        const { data: createdQ, error: iErr } = await supabase
          .from('tool_questions')
          .insert({
            section_id: targetSectionId,
            tool_version_id: targetToolVersionId,
            tenant_id: profile.tenant_id,
            question_code: `Q_${Date.now().toString().slice(-4)}`,
            question_text: qFormTitle.trim(),
            hint_text: qFormHint.trim() || null,
            answer_type: qFormAnswerType,
            area_id: primaryAreaId,
            operation_type_id: primaryOpTypeId,
            area_ids: qFormAreaIds,
            operation_type_ids: qFormOpTypeIds,
            tool_ids: finalToolIds,
            is_required: true,
            order_index: allQuestions.length,
            metadata: {}
          })
          .select()
          .single();

        if (iErr || !createdQ) throw iErr || new Error('Failed to create question.');

        // Insert option presets if choice type
        if (['single_choice', 'boolean', 'multiple_choice'].includes(qFormAnswerType) && qFormPreset !== 'none') {
          const presets = DEFAULT_PRESETS_MAP[qFormPreset as keyof typeof DEFAULT_PRESETS_MAP] || DEFAULT_PRESETS_MAP.pass_fail;
          const optPayload = presets.map((p, idx) => ({
            question_id: createdQ.id,
            tenant_id: profile.tenant_id,
            label: p.label,
            value: p.value,
            score: p.score,
            is_flagged: p.is_flagged,
            order_index: idx
          }));
          await supabase.from('question_options').insert(optPayload);
        }
      }

      await Promise.all([
        fetchAllQuestions(),
        fetchTools()
      ]);

      setShowSingleQuestionModal(false);
      resetQuestionForm();
    } catch (err: any) {
      console.error('Error saving question:', err);
      setError(err.message || 'Failed to save question.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteQuestionGlobal = async (questionId: string) => {
    const q = allQuestions.find(item => item.id === questionId);
    const linkedCount = q?.tool_ids?.length || 0;
    const warningMsg = linkedCount > 0
      ? `This question is currently used by ${linkedCount} instrument(s) (e.g. ${q?.tool_name}). Deleting it will permanently remove it from ALL these instruments. Are you sure you want to proceed?`
      : 'Are you sure you want to permanently delete this question?';
    
    if (!window.confirm(warningMsg)) return;
    try {
      // Delete dependent records first to handle foreign key constraints and trigger immutability checks cleanly
      await supabase.from('observation_responses').delete().eq('question_id', questionId);
      await supabase.from('question_options').delete().eq('question_id', questionId);
      await supabase.from('conditional_rules').delete().eq('source_question_id', questionId);

      const { error: dErr } = await supabase.from('tool_questions').delete().eq('id', questionId);
      if (dErr) throw dErr;
      await fetchAllQuestions();
    } catch (err: any) {
      console.error('Error deleting question:', err);
      alert(err?.message || 'Failed to delete question.');
    }
  };

  const handleOpenDeleteToolModal = async (tool: any) => {
    if (!profile?.tenant_id) return;
    setToolToDelete(tool);
    setDeleteToolModalOpen(true);
    setFetchingToolQs(true);
    setQuestionsToPreserveIds([]);
    try {
      // Fetch versions of this tool
      const { data: vers, error: vErr } = await supabase
        .from('tool_versions')
        .select('id')
        .eq('tool_id', tool.id);
      if (vErr) throw vErr;
      const verIds = (vers || []).map(v => v.id);

      // Fetch questions associated with this tool
      const { data: qs, error: qErr } = await supabase
        .from('tool_questions')
        .select('*')
        .eq('tenant_id', profile.tenant_id);
      if (qErr) throw qErr;

      const filtered = (qs || []).filter(q => 
        verIds.includes(q.tool_version_id) || 
        (q.tool_ids && Array.isArray(q.tool_ids) && q.tool_ids.includes(tool.id))
      );

      setToolToDeleteQuestions(filtered);
    } catch (err) {
      console.error('Error fetching questions for tool delete:', err);
    } finally {
      setFetchingToolQs(false);
    }
  };

  const handleDeleteInstrument = async (toolId: string, questionsToKeepIds: string[]) => {
    if (!profile?.tenant_id) return;
    setActionLoading(true);
    try {
      // 1. Fetch all versions of this tool
      const { data: vers, error: vErr } = await supabase
        .from('tool_versions')
        .select('id')
        .eq('tool_id', toolId);
      if (vErr) throw vErr;
      const versionIds = (vers || []).map(v => v.id);

      // 2. Fetch all observations for this tool or its versions
      let observationIds: string[] = [];
      if (versionIds.length > 0) {
        const { data: obs, error: oErr } = await supabase
          .from('observations')
          .select('id')
          .in('tool_version_id', versionIds);
        if (oErr) throw oErr;
        observationIds = (obs || []).map(o => o.id);
      } else {
        const { data: obs, error: oErr } = await supabase
          .from('observations')
          .select('id')
          .eq('tool_id', toolId);
        if (oErr) throw oErr;
        observationIds = (obs || []).map(o => o.id);
      }

      // 3. Delete dependencies of observations
      if (observationIds.length > 0) {
        await supabase.from('observation_responses').delete().in('observation_id', observationIds);
        await supabase.from('observation_photos').delete().in('observation_id', observationIds);
        await supabase.from('observation_signatures').delete().in('observation_id', observationIds);
        await supabase.from('observations').delete().in('id', observationIds);
      }

      // 4. Fetch all questions associated with this tool
      const { data: qs, error: qErr } = await supabase
        .from('tool_questions')
        .select('*')
        .eq('tenant_id', profile.tenant_id);
      if (qErr) throw qErr;

      const toolQs = (qs || []).filter(q => 
        versionIds.includes(q.tool_version_id) || 
        (q.tool_ids && Array.isArray(q.tool_ids) && q.tool_ids.includes(toolId))
      );

      const questionsToDelete = toolQs.filter(q => !questionsToKeepIds.includes(q.id));
      const questionsToKeep = toolQs.filter(q => questionsToKeepIds.includes(q.id));

      // 5. Delete questions NOT marked to keep
      if (questionsToDelete.length > 0) {
        const deleteIds = questionsToDelete.map(q => q.id);
        // Delete question options first
        await supabase.from('question_options').delete().in('question_id', deleteIds);
        // Delete conditional rule conditions where source_question_id is deleted
        await supabase.from('rule_conditions').delete().in('source_question_id', deleteIds);
        
        // Delete conditional rules and their conditions
        if (versionIds.length > 0) {
          const { data: rules } = await supabase
            .from('conditional_rules')
            .select('id')
            .in('tool_version_id', versionIds);
          const ruleIds = (rules || []).map(r => r.id);
          if (ruleIds.length > 0) {
            await supabase.from('rule_conditions').delete().in('rule_id', ruleIds);
            await supabase.from('conditional_rules').delete().in('id', ruleIds);
          }
        }

        // Finally delete the questions
        const { error: dErr } = await supabase.from('tool_questions').delete().in('id', deleteIds);
        if (dErr) throw dErr;
      }

      // 6. Keep questions marked to keep: update their tool_ids to exclude this tool, and reassign tool_version_id and section_id to prevent NOT NULL violations
      for (const q of questionsToKeep) {
        const nextToolIds = (q.tool_ids || []).filter((id: string) => id !== toolId);
        
        let targetVersionId = q.tool_version_id;
        let targetSectionId = q.section_id;

        if (versionIds.includes(q.tool_version_id)) {
          // It was associated with this tool's version! We must find another version & section to point to.
          if (nextToolIds.length > 0) {
            const fallbackToolId = nextToolIds[0];
            
            // Query for this fallback tool's versions
            const { data: fallbackVers } = await supabase
              .from('tool_versions')
              .select('id')
              .eq('tool_id', fallbackToolId)
              .order('version_number', { ascending: false });
            
            if (fallbackVers && fallbackVers.length > 0) {
              targetVersionId = fallbackVers[0].id;
              
              // Query for fallback tool's sections in this version
              const { data: fallbackSecs } = await supabase
                .from('tool_sections')
                .select('id')
                .eq('tool_version_id', targetVersionId)
                .order('order_index', { ascending: true });
              
              if (fallbackSecs && fallbackSecs.length > 0) {
                targetSectionId = fallbackSecs[0].id;
              } else {
                // Create a default section for this version
                const { data: newSec, error: nsErr } = await supabase
                  .from('tool_sections')
                  .insert({
                    tool_version_id: targetVersionId,
                    tenant_id: profile.tenant_id,
                    title: 'General Questions',
                    order_index: 0
                  })
                  .select()
                  .single();
                if (nsErr || !newSec) throw nsErr || new Error('Failed to create fallback section.');
                targetSectionId = newSec.id;
              }
            } else {
              // Create version & section on fallback tool
              const { data: newVer, error: nvErr } = await supabase
                .from('tool_versions')
                .insert({
                  tool_id: fallbackToolId,
                  tenant_id: profile.tenant_id,
                  version_number: 1,
                  status: 'draft',
                  instructions: 'Default instructions.',
                  settings: {}
                })
                .select()
                .single();
              if (nvErr || !newVer) throw nvErr || new Error('Failed to create fallback version.');
              targetVersionId = newVer.id;

              const { data: newSec, error: nsErr } = await supabase
                .from('tool_sections')
                .insert({
                  tool_version_id: targetVersionId,
                  tenant_id: profile.tenant_id,
                  title: 'General Questions',
                  order_index: 0
                })
                .select()
                .single();
              if (nsErr || !newSec) throw nsErr || new Error('Failed to create fallback section.');
              targetSectionId = newSec.id;
            }
          } else {
            // There are NO other tools in nextToolIds!
            // The user wanted to keep this question in the library for future use, but it doesn't belong to any other tool right now.
            // Let's check if the fallback library tool "Preserved Questions Library" already exists.
            let libTool = null;
            const { data: existingLib } = await supabase
              .from('tools')
              .select('*')
              .eq('tenant_id', profile.tenant_id)
              .eq('name', 'Preserved Questions Library')
              .limit(1);
            
            if (existingLib && existingLib.length > 0) {
              libTool = existingLib[0];
            } else {
              const slug = 'preserved-questions-library';
              const { data: newLib, error: lErr } = await supabase
                .from('tools')
                .insert({
                  tenant_id: profile.tenant_id,
                  name: 'Preserved Questions Library',
                  slug,
                  description: 'Contains saved questions preserved from deleted instruments.',
                  category: 'Library',
                  status: 'active',
                  created_by: profile.id
                })
                .select()
                .single();
              if (lErr || !newLib) throw lErr || new Error('Failed to create Preserved Questions Library tool.');
              libTool = newLib;
            }

            nextToolIds.push(libTool.id);

            // Fetch or create version & section for the library
            const { data: libVers } = await supabase
              .from('tool_versions')
              .select('id')
              .eq('tool_id', libTool.id)
              .order('version_number', { ascending: false });
            
            if (libVers && libVers.length > 0) {
              targetVersionId = libVers[0].id;
              const { data: libSecs } = await supabase
                .from('tool_sections')
                .select('id')
                .eq('tool_version_id', targetVersionId)
                .order('order_index', { ascending: true });
              
              if (libSecs && libSecs.length > 0) {
                targetSectionId = libSecs[0].id;
              } else {
                const { data: newSec, error: nsErr } = await supabase
                  .from('tool_sections')
                  .insert({
                    tool_version_id: targetVersionId,
                    tenant_id: profile.tenant_id,
                    title: 'Preserved Questions',
                    order_index: 0
                  })
                  .select()
                  .single();
                if (nsErr || !newSec) throw nsErr || new Error('Failed to create library section.');
                targetSectionId = newSec.id;
              }
            } else {
              const { data: newVer, error: nvErr } = await supabase
                .from('tool_versions')
                .insert({
                  tool_id: libTool.id,
                  tenant_id: profile.tenant_id,
                  version_number: 1,
                  status: 'draft',
                  instructions: 'Default instructions.',
                  settings: {}
                })
                .select()
                .single();
              if (nvErr || !newVer) throw nvErr || new Error('Failed to create library version.');
              targetVersionId = newVer.id;

              const { data: newSec, error: nsErr } = await supabase
                .from('tool_sections')
                .insert({
                  tool_version_id: targetVersionId,
                  tenant_id: profile.tenant_id,
                  title: 'Preserved Questions',
                  order_index: 0
                })
                .select()
                .single();
              if (nsErr || !newSec) throw nsErr || new Error('Failed to create library section.');
              targetSectionId = newSec.id;
            }
          }
        }

        const { error: upErr } = await supabase
          .from('tool_questions')
          .update({
            tool_ids: nextToolIds,
            tool_version_id: targetVersionId,
            section_id: targetSectionId
          })
          .eq('id', q.id);
        if (upErr) throw upErr;
      }

      // 7. Delete tool sections belonging to these versions
      if (versionIds.length > 0) {
        await supabase.from('tool_sections').delete().in('tool_version_id', versionIds);
        
        // Delete conditional rules left over
        const { data: leftRules } = await supabase
          .from('conditional_rules')
          .select('id')
          .in('tool_version_id', versionIds);
        const leftRuleIds = (leftRules || []).map(r => r.id);
        if (leftRuleIds.length > 0) {
          await supabase.from('rule_conditions').delete().in('rule_id', leftRuleIds);
          await supabase.from('conditional_rules').delete().in('id', leftRuleIds);
        }

        // Delete tool templates referencing these versions
        await supabase.from('tool_templates').delete().in('source_tool_version_id', versionIds);

        // Delete the tool versions themselves
        const { error: dvErr } = await supabase.from('tool_versions').delete().in('id', versionIds);
        if (dvErr) throw dvErr;
      }

      // 8. Finally delete the tool itself!
      const { error: dtErr } = await supabase.from('tools').delete().eq('id', toolId);
      if (dtErr) throw dtErr;

      // Reset and refresh everything
      setSelectedTool(null);
      setSelectedVersion(null);
      setWorkspaceMode('questions');
      await fetchTools();
      await fetchAllQuestions();
      
      setDeleteToolModalOpen(false);
    } catch (err: any) {
      console.error('Error deleting instrument:', err);
      alert(err?.message || 'Failed to delete instrument.');
    } finally {
      setActionLoading(false);
    }
  };

  const fetchTools = async () => {
    if (!profile?.tenant_id) return;
    setLoading(true);
    try {
      const { data, error: tErr } = await supabase
        .from('tools')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .order('name', { ascending: true });

      if (tErr) throw tErr;
      let toolList: Tool[] = data || [];

      // Ensure Master Question Bank exists for tenant
      const hasMasterBank = toolList.some(
        t => t.name.toLowerCase() === 'master question bank' || t.slug === 'master-question-bank'
      );

      if (!hasMasterBank && profile?.tenant_id) {
        const { data: newBank, error: bankErr } = await supabase
          .from('tools')
          .insert({
            tenant_id: profile.tenant_id,
            name: 'Master Question Bank',
            slug: 'master-question-bank',
            description: 'Central Master Question Bank repository for standardized questions, hints, and response types shared across all observation instruments.',
            category: 'safety',
            status: 'active',
            created_by: profile.id
          })
          .select()
          .single();

        if (newBank && !bankErr) {
          const { data: verData } = await supabase
            .from('tool_versions')
            .insert({
              tool_id: newBank.id,
              tenant_id: profile.tenant_id,
              version_number: 1,
              status: 'draft',
              instructions: 'Master pool of standard questions.'
            })
            .select()
            .single();

          if (verData) {
            await supabase.from('tool_sections').insert({
              tool_version_id: verData.id,
              tenant_id: profile.tenant_id,
              title: 'Master Question Pool',
              order_index: 0
            });
          }
          toolList = [newBank, ...toolList];
        }
      }

      // Sort Master Question Bank to the top
      toolList.sort((a, b) => {
        const aIsMaster = a.slug === 'master-question-bank' || a.name.toLowerCase() === 'master question bank';
        const bIsMaster = b.slug === 'master-question-bank' || b.name.toLowerCase() === 'master question bank';
        if (aIsMaster && !bIsMaster) return -1;
        if (!aIsMaster && bIsMaster) return 1;
        return a.name.localeCompare(b.name);
      });

      setTools(toolList);
      setError(null);
    } catch (err) {
      console.error('Error fetching tools:', err);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTools();
  }, [profile?.tenant_id]);

  // Fetch versions when selected tool changes
  useEffect(() => {
    if (!selectedTool) {
      setVersions([]);
      setSelectedVersion(null);
      setFilterToolId('');
      return;
    }
    setFilterToolId(selectedTool.id);
    const fetchVersions = async () => {
      try {
        const { data, error: vErr } = await supabase
          .from('tool_versions')
          .select('*')
          .eq('tool_id', selectedTool.id)
          .order('version_number', { ascending: false });

        if (vErr) throw vErr;
        setVersions(data || []);
        if (data && data.length > 0) {
          // Select newest by default
          setSelectedVersion(data[0]);
        } else {
          setSelectedVersion(null);
        }
      } catch (err) {
        console.error('Error fetching tool versions:', err);
      }
    };
    fetchVersions();
  }, [selectedTool]);

  // Fetch all child structures when selected version changes
  const fetchVersionStructure = async (versionId: string) => {
    try {
      // 1. Fetch Sections
      const { data: secData, error: secErr } = await supabase
        .from('tool_sections')
        .select('*')
        .eq('tool_version_id', versionId)
        .order('order_index', { ascending: true });
      if (secErr) throw secErr;
      setSections(secData || []);

      // 2. Fetch Questions
      const { data: qData, error: qErr } = await supabase
        .from('tool_questions')
        .select('*')
        .eq('tool_version_id', versionId)
        .order('order_index', { ascending: true });
      if (qErr) throw qErr;
      setQuestions(qData || []);

      // 3. Fetch Options (bulk load options for this tenant belonging to these questions)
      if (qData && qData.length > 0) {
        const qIds = qData.map(q => q.id);
        const { data: optData, error: optErr } = await supabase
          .from('question_options')
          .select('*')
          .in('question_id', qIds)
          .order('order_index', { ascending: true });
        if (optErr) throw optErr;
        setOptions(optData || []);
      } else {
        setOptions([]);
      }

      // 4. Fetch Rules
      const { data: ruleData, error: ruleErr } = await supabase
        .from('conditional_rules')
        .select('*')
        .eq('tool_version_id', versionId);
      if (ruleErr) throw ruleErr;
      setRules(ruleData || []);

      // 5. Fetch Conditions
      const { data: condData, error: condErr } = await supabase
        .from('rule_conditions')
        .select('*')
        .eq('tool_version_id', versionId);
      if (condErr) throw condErr;
      setConditions(condData || []);

      // Clear edit states
      setEditingSection(null);
      setEditingQuestion(null);
      setMockAnswers({});
      setValidationErrors([]);
      setValidationSuccess(null);
    } catch (err) {
      console.error('Error fetching version structures:', err);
    }
  };

  useEffect(() => {
    if (!selectedVersion) {
      setSections([]);
      setQuestions([]);
      setOptions([]);
      setRules([]);
      setConditions([]);
      return;
    }
    fetchVersionStructure(selectedVersion.id);
  }, [selectedVersion]);

  const isEditable = selectedVersion?.status === 'draft';
  const isMasterBank = selectedTool?.slug === 'master-question-bank' || selectedTool?.name?.toLowerCase() === 'master question bank';

  // --- Core Tool Operations ---
  const handleCreateTool = async () => {
    if (!profile?.tenant_id) return;
    if (!newToolName.trim()) return;

    setActionLoading(true);
    try {
      const slug = newToolName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      
      // 1. Create Tool Container
      const { data: toolData, error: toolErr } = await supabase
        .from('tools')
        .insert({
          tenant_id: profile.tenant_id,
          name: newToolName,
          slug,
          description: newToolDesc,
          category: newToolCategory,
          status: 'active',
          site_ids: newToolSiteIds.length > 0 ? newToolSiteIds : null,
          area_ids: newToolAreaIds,
          operation_type_ids: newToolOpTypeIds,
          created_by: profile.id
        })
        .select()
        .single();

      if (toolErr) throw toolErr;

      // 2. Create version 1 (Draft)
      const { data: verData, error: verErr } = await supabase
        .from('tool_versions')
        .insert({
          tool_id: toolData.id,
          tenant_id: profile.tenant_id,
          version_number: 1,
          status: 'draft',
          instructions: 'Fill out this gathering form accurately.',
          settings: {
            target_role_ids: newToolTargetRoleIds
          }
        })
        .select()
        .single();

      if (verErr) throw verErr;

      const fullToolWithRoles = { ...toolData, target_role_ids: newToolTargetRoleIds };
      setTools(prev => [...prev, fullToolWithRoles]);
      setSelectedTool(fullToolWithRoles);
      setSelectedVersion(verData);
      
      // Track Action in Audit Logs
      await supabase.from('audit_logs').insert({
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        action: 'tool.create',
        target_type: 'tools',
        target_id: toolData.id,
        payload_after: {
          name: newToolName,
          category: newToolCategory,
          site_ids: newToolSiteIds,
          area_ids: newToolAreaIds,
          operation_type_ids: newToolOpTypeIds,
          target_role_ids: newToolTargetRoleIds
        }
      });

      // Reset Create form
      setNewToolName('');
      setNewToolDesc('');
      setNewToolSiteIds([]);
      setNewToolAreaIds([]);
      setNewToolOpTypeIds([]);
      setNewToolTargetRoleIds(['mhe_operator', 'machine_operator']);
      setShowCreateTool(false);
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleCloneVersion = async () => {
    if (!selectedVersion || !profile) return;
    setActionLoading(true);
    try {
      const { data, error: cloneErr } = await supabase
        .rpc('clone_tool_version', {
          p_version_id: selectedVersion.id,
          p_created_by: profile.id
        });

      if (cloneErr) throw cloneErr;

      // Reload versions for this tool
      const { data: newVers, error: vErr } = await supabase
        .from('tool_versions')
        .select('*')
        .eq('tool_id', selectedTool!.id)
        .order('version_number', { ascending: false });

      if (vErr) throw vErr;
      setVersions(newVers || []);
      const newlyCreated = newVers?.find(v => v.id === data);
      if (newlyCreated) {
        setSelectedVersion(newlyCreated);
      }
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchiveVersion = async () => {
    if (!selectedVersion || !profile) return;
    if (!confirm('Are you sure you want to archive this version? This operation is permanent.')) return;

    setActionLoading(true);
    try {
      const { error: updErr } = await supabase
        .from('tool_versions')
        .update({ status: 'archived', updated_at: new Date().toISOString() })
        .eq('id', selectedVersion.id);

      if (updErr) throw updErr;

      // Log to Audit
      await supabase.from('audit_logs').insert({
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        action: 'tool_version.archive',
        target_type: 'tool_versions',
        target_id: selectedVersion.id,
        payload_after: { status: 'archived' }
      });

      setSelectedVersion(prev => prev ? { ...prev, status: 'archived' } : null);
      setVersions(prev => prev.map(v => v.id === selectedVersion.id ? { ...v, status: 'archived' } : v));
    } catch (err) {
      alert((err as Error).message);
    } finally {
      setActionLoading(false);
    }
  };

  // Rigorous Publishing Validation & Publication Transition
  const handlePublishVersion = async () => {
    if (!selectedVersion || !profile) return;
    setValidationErrors([]);
    setValidationSuccess(null);

    const errors: string[] = [];

    // Validation checks
    if (!selectedTool?.name?.trim()) {
      errors.push('Tool container is missing a valid name.');
    }
    if (sections.length === 0) {
      errors.push('Tool must contain at least one section before publishing.');
    }
    if (questions.length === 0) {
      errors.push('Tool must contain at least one question before publishing.');
    }

    // Verify all selectable questions (single_choice, multiple_choice) contain options
    for (const q of questions) {
      if (q.answer_type === 'single_choice' || q.answer_type === 'multiple_choice') {
        const hasOpts = options.some(opt => opt.question_id === q.id);
        if (!hasOpts) {
          errors.push(`Question "${q.question_text}" (${q.question_code}) is selectable but contains no options.`);
        }
      }
    }

    // Verify conditional rules have valid references
    const validQIds = new Set(questions.map(q => q.id));
    const validSecIds = new Set(sections.map(s => s.id));
    for (const rule of rules) {
      if (rule.target_type === 'question' && !validQIds.has(rule.target_id)) {
        errors.push(`Rule ${rule.id} targets question ID ${rule.target_id} which does not exist in this version.`);
      }
      if (rule.target_type === 'section' && !validSecIds.has(rule.target_id)) {
        errors.push(`Rule ${rule.id} targets section ID ${rule.target_id} which does not exist in this version.`);
      }
    }

    // Check circular dependencies
    const cycleRes = detectCircularDependencies(questions, rules, conditions);
    if (cycleRes.hasCycle) {
      errors.push(`Circular dependency detected in conditional rules! Dependency path: ${cycleRes.path.join(' -> ')}`);
    }

    // If validation fails, halt
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }

    // Proceed with transition to 'published'
    setActionLoading(true);
    try {
      const { error: pubErr } = await supabase
        .from('tool_versions')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          published_by: profile.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedVersion.id);

      if (pubErr) throw pubErr;

      // Log to Audit
      await supabase.from('audit_logs').insert({
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        action: 'tool_version.publish',
        target_type: 'tool_versions',
        target_id: selectedVersion.id,
        payload_after: { status: 'published', version_number: selectedVersion.version_number }
      });

      setValidationSuccess('Tool version published successfully and is now strictly immutable!');
      setSelectedVersion(prev => prev ? { ...prev, status: 'published' } : null);
      setVersions(prev => prev.map(v => v.id === selectedVersion.id ? { ...v, status: 'published' } : v));
    } catch (err) {
      setValidationErrors([(err as Error).message]);
    } finally {
      setActionLoading(false);
    }
  };

  // --- Dynamic Operations: Add, Edit, Delete, Reorder Section ---
  const handleAddSection = async () => {
    if (!selectedVersion || !profile || !isEditable) return;
    try {
      const nextOrder = sections.length > 0 ? Math.max(...sections.map(s => s.order_index)) + 1 : 0;
      const { data, error: secErr } = await supabase
        .from('tool_sections')
        .insert({
          tool_version_id: selectedVersion.id,
          tenant_id: profile.tenant_id,
          title: 'New Section Title',
          description: 'Optional Section description text.',
          order_index: nextOrder
        })
        .select()
        .single();

      if (secErr) throw secErr;
      setSections(prev => [...prev, data]);
      setEditingSection(data);
      setEditingQuestion(null);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleUpdateSection = async (secId: string, updates: Partial<ToolSection>) => {
    if (!isEditable) return;
    try {
      const { error: updErr } = await supabase
        .from('tool_sections')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', secId);

      if (updErr) throw updErr;

      setSections(prev => prev.map(s => s.id === secId ? { ...s, ...updates } : s));
      if (editingSection?.id === secId) {
        setEditingSection(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleDeleteSection = async (secId: string) => {
    if (!isEditable) return;
    if (!confirm('Are you sure you want to delete this section and all questions inside it?')) return;
    try {
      const secQuestions = questions.filter(q => q.section_id === secId);
      for (const q of secQuestions) {
        await supabase.from('observation_responses').delete().eq('question_id', q.id);
        await supabase.from('question_options').delete().eq('question_id', q.id);
        await supabase.from('conditional_rules').delete().eq('source_question_id', q.id);
      }
      await supabase.from('tool_questions').delete().eq('section_id', secId);

      const { error: delErr } = await supabase
        .from('tool_sections')
        .delete()
        .eq('id', secId);

      if (delErr) throw delErr;

      setSections(prev => prev.filter(s => s.id !== secId));
      setQuestions(prev => prev.filter(q => q.section_id !== secId));
      if (editingSection?.id === secId) setEditingSection(null);
    } catch (err: any) {
      alert((err as Error).message);
    }
  };

  const handleMoveSection = async (secId: string, direction: 'up' | 'down') => {
    if (!isEditable) return;
    const index = sections.findIndex(s => s.id === secId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sections.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const itemA = sections[index];
    const itemB = sections[targetIndex];

    try {
      const { error: err1 } = await supabase
        .from('tool_sections')
        .update({ order_index: itemB.order_index })
        .eq('id', itemA.id);
      const { error: err2 } = await supabase
        .from('tool_sections')
        .update({ order_index: itemA.order_index })
        .eq('id', itemB.id);

      if (err1 || err2) throw (err1 || err2);

      // Reload sections to maintain deterministic sort
      const newSections = [...sections];
      newSections[index] = { ...itemA, order_index: itemB.order_index };
      newSections[targetIndex] = { ...itemB, order_index: itemA.order_index };
      newSections.sort((a, b) => a.order_index - b.order_index);
      setSections(newSections);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // --- Dynamic Operations: Questions ---
  const handleAddQuestion = async (sectionId: string) => {
    if (!selectedVersion || !profile || !isEditable) return;
    try {
      const sectionQuestions = questions.filter(q => q.section_id === sectionId);
      const nextOrder = sectionQuestions.length > 0 ? Math.max(...sectionQuestions.map(q => q.order_index)) + 1 : 0;
      const countCode = questions.length + 1;

      const { data, error: qErr } = await supabase
        .from('tool_questions')
        .insert({
          section_id: sectionId,
          tool_version_id: selectedVersion.id,
          tenant_id: profile.tenant_id,
          question_code: `Q_${countCode}`,
          question_text: 'Describe the observation point...',
          answer_type: 'boolean',
          is_required: true,
          order_index: nextOrder,
          metadata: {}
        })
        .select()
        .single();

      if (qErr) throw qErr;
      setQuestions(prev => [...prev, data]);
      setEditingQuestion(data);
      setEditingSection(null);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleBatchImportSuccess = (newQuestions: ToolQuestion[], newOptions: QuestionOption[]) => {
    setQuestions(prev => [...prev, ...newQuestions]);
    if (newOptions.length > 0) {
      setOptions(prev => [...prev, ...newOptions]);
    }
    setValidationSuccess(`Batch imported ${newQuestions.length} questions successfully into section.`);
    setTimeout(() => setValidationSuccess(null), 5000);
  };

  const handleUpdateQuestion = async (qId: string, updates: Partial<ToolQuestion>) => {
    if (!isEditable) return;
    try {
      const { error: updErr } = await supabase
        .from('tool_questions')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', qId);

      if (updErr) throw updErr;

      setQuestions(prev => prev.map(q => q.id === qId ? { ...q, ...updates } : q));
      if (editingQuestion?.id === qId) {
        setEditingQuestion(prev => prev ? { ...prev, ...updates } : null);
      }
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (!isEditable || !profile?.tenant_id) return;
    const q = questions.find(item => item.id === qId);
    if (!q) return;

    const otherToolIds = (q.tool_ids || []).filter(id => id !== selectedTool?.id);
    if (otherToolIds.length > 0) {
      if (!confirm('This question is shared with other instruments. Deleting it here will only unlink it from this instrument, keeping it intact for the others. Proceed?')) return;
      try {
        let targetVersionId = q.tool_version_id;
        let targetSectionId = q.section_id;

        const fallbackToolId = otherToolIds[0];
        
        // Query for this fallback tool's versions
        const { data: fallbackVers } = await supabase
          .from('tool_versions')
          .select('id')
          .eq('tool_id', fallbackToolId)
          .order('version_number', { ascending: false });
        
        if (fallbackVers && fallbackVers.length > 0) {
          targetVersionId = fallbackVers[0].id;
          
          // Query for fallback tool's sections in this version
          const { data: fallbackSecs } = await supabase
            .from('tool_sections')
            .select('id')
            .eq('tool_version_id', targetVersionId)
            .order('order_index', { ascending: true });
          
          if (fallbackSecs && fallbackSecs.length > 0) {
            targetSectionId = fallbackSecs[0].id;
          } else {
            // Create a default section for this version
            const { data: newSec, error: nsErr } = await supabase
              .from('tool_sections')
              .insert({
                tool_version_id: targetVersionId,
                tenant_id: profile.tenant_id,
                title: 'General Questions',
                order_index: 0
              })
              .select()
              .single();
            if (nsErr || !newSec) throw nsErr || new Error('Failed to create fallback section.');
            targetSectionId = newSec.id;
          }
        } else {
          // Create version & section on fallback tool
          const { data: newVer, error: nvErr } = await supabase
            .from('tool_versions')
            .insert({
              tool_id: fallbackToolId,
              tenant_id: profile.tenant_id,
              version_number: 1,
              status: 'draft',
              instructions: 'Default instructions.',
              settings: {}
            })
            .select()
            .single();
          if (nvErr || !newVer) throw nvErr || new Error('Failed to create fallback version.');
          targetVersionId = newVer.id;

          const { data: newSec, error: nsErr } = await supabase
            .from('tool_sections')
            .insert({
              tool_version_id: targetVersionId,
              tenant_id: profile.tenant_id,
              title: 'General Questions',
              order_index: 0
            })
            .select()
            .single();
          if (nsErr || !newSec) throw nsErr || new Error('Failed to create fallback section.');
          targetSectionId = newSec.id;
        }

        const { error: upErr } = await supabase
          .from('tool_questions')
          .update({
            tool_ids: otherToolIds,
            tool_version_id: targetVersionId,
            section_id: targetSectionId
          })
          .eq('id', qId);
        if (upErr) throw upErr;
        setQuestions(prev => prev.filter(item => item.id !== qId));
        await fetchAllQuestions();
        return;
      } catch (err: any) {
        alert(err.message || 'Failed to unlink shared question.');
        return;
      }
    }

    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      await supabase.from('observation_responses').delete().eq('question_id', qId);
      await supabase.from('question_options').delete().eq('question_id', qId);
      await supabase.from('conditional_rules').delete().eq('source_question_id', qId);

      const { error: delErr } = await supabase
        .from('tool_questions')
        .delete()
        .eq('id', qId);

      if (delErr) throw delErr;

      setQuestions(prev => prev.filter(q => q.id !== qId));
      setOptions(prev => prev.filter(opt => opt.question_id !== qId));
      if (editingQuestion?.id === qId) setEditingQuestion(null);
      await fetchAllQuestions();
    } catch (err: any) {
      alert((err as Error).message);
    }
  };

  const handleMoveQuestion = async (qId: string, direction: 'up' | 'down') => {
    if (!isEditable) return;
    const currentQ = questions.find(q => q.id === qId);
    if (!currentQ) return;

    const sectionQs = questions.filter(q => q.section_id === currentQ.section_id).sort((a, b) => a.order_index - b.order_index);
    const index = sectionQs.findIndex(q => q.id === qId);

    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sectionQs.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const itemA = sectionQs[index];
    const itemB = sectionQs[targetIndex];

    try {
      const { error: err1 } = await supabase
        .from('tool_questions')
        .update({ order_index: itemB.order_index })
        .eq('id', itemA.id);
      const { error: err2 } = await supabase
        .from('tool_questions')
        .update({ order_index: itemA.order_index })
        .eq('id', itemB.id);

      if (err1 || err2) throw (err1 || err2);

      setQuestions(prev => prev.map(q => {
        if (q.id === itemA.id) return { ...q, order_index: itemB.order_index };
        if (q.id === itemB.id) return { ...q, order_index: itemA.order_index };
        return q;
      }).sort((a, b) => a.order_index - b.order_index));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // --- Dynamic Operations: Question Options ---
  const handleAddOption = async (questionId: string) => {
    if (!profile?.tenant_id || !isEditable) return;
    try {
      const qOpts = options.filter(opt => opt.question_id === questionId);
      const nextOrder = qOpts.length > 0 ? Math.max(...qOpts.map(o => o.order_index)) + 1 : 0;

      const { data, error: optErr } = await supabase
        .from('question_options')
        .insert({
          question_id: questionId,
          tenant_id: profile.tenant_id,
          label: 'Option Label',
          value: `value_${nextOrder + 1}`,
          order_index: nextOrder,
          is_flagged: false,
          score: 100
        })
        .select()
        .single();

      if (optErr) throw optErr;
      setOptions(prev => [...prev, data]);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleUpdateOption = async (optId: string, updates: Partial<QuestionOption>) => {
    if (!isEditable) return;
    try {
      const { error: updErr } = await supabase
        .from('question_options')
        .update(updates)
        .eq('id', optId);

      if (updErr) throw updErr;
      setOptions(prev => prev.map(opt => opt.id === optId ? { ...opt, ...updates } : opt));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleDeleteOption = async (optId: string) => {
    if (!isEditable) return;
    try {
      const { error: delErr } = await supabase
        .from('question_options')
        .delete()
        .eq('id', optId);

      if (delErr) throw delErr;
      setOptions(prev => prev.filter(opt => opt.id !== optId));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // --- Dynamic Operations: Conditional Rules & Conditions ---
  const handleAddRule = async (targetType: 'question' | 'section', targetId: string) => {
    if (!selectedVersion || !profile || !isEditable) return;
    try {
      const { data, error: rErr } = await supabase
        .from('conditional_rules')
        .insert({
          tool_version_id: selectedVersion.id,
          tenant_id: profile.tenant_id,
          target_type: targetType,
          target_id: targetId,
          action: 'show',
          logical_operator: 'AND'
        })
        .select()
        .single();

      if (rErr) throw rErr;
      setRules(prev => [...prev, data]);
      setWorkspaceMode('rules');
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleUpdateRule = async (ruleId: string, updates: Partial<ConditionalRule>) => {
    if (!isEditable) return;
    try {
      const { error: updErr } = await supabase
        .from('conditional_rules')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', ruleId);

      if (updErr) throw updErr;
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, ...updates } : r));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!isEditable) return;
    try {
      const { error: delErr } = await supabase
        .from('conditional_rules')
        .delete()
        .eq('id', ruleId);

      if (delErr) throw delErr;
      setRules(prev => prev.filter(r => r.id !== ruleId));
      setConditions(prev => prev.filter(c => c.rule_id !== ruleId));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleAddCondition = async (ruleId: string) => {
    if (!selectedVersion || !profile || !isEditable) return;
    const firstQ = questions[0];
    if (!firstQ) return;
    try {
      const { data, error: cErr } = await supabase
        .from('rule_conditions')
        .insert({
          rule_id: ruleId,
          tool_version_id: selectedVersion.id,
          tenant_id: profile.tenant_id,
          source_question_id: firstQ.id,
          comparison_operator: 'equals',
          expected_value: JSON.stringify('true')
        })
        .select()
        .single();

      if (cErr) throw cErr;
      setConditions(prev => [...prev, data]);
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleUpdateCondition = async (condId: string, updates: Partial<RuleCondition>) => {
    if (!isEditable) return;
    try {
      const { error: updErr } = await supabase
        .from('rule_conditions')
        .update(updates)
        .eq('id', condId);

      if (updErr) throw updErr;
      setConditions(prev => prev.map(c => c.id === condId ? { ...c, ...updates } : c));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  const handleDeleteCondition = async (condId: string) => {
    if (!isEditable) return;
    try {
      const { error: delErr } = await supabase
        .from('rule_conditions')
        .delete()
        .eq('id', condId);

      if (delErr) throw delErr;
      setConditions(prev => prev.filter(c => c.id !== condId));
    } catch (err) {
      alert((err as Error).message);
    }
  };

  // --- Preview Engine Integration ---
  // Live computed results using the rule-evaluation service!
  const previewState = evaluateToolVisibility(
    sections,
    questions,
    rules,
    conditions,
    mockAnswers
  );

  const isRightPanelActive = !!(selectedVersion && isEditable && (editingSection || editingQuestion));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
      
      {/* 1. Left Toolbar & Selection Column */}
      <div className="lg:col-span-1 space-y-6">
        
        {/* Tool Select list Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center">
              <Layers className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
              Instruments
            </h3>
            <button
              onClick={() => setShowCreateTool(true)}
              className="text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded cursor-pointer transition-colors flex items-center"
            >
              <Plus className="w-3 h-3 mr-0.5" /> New
            </button>
          </div>

          {/* Tools loop */}
          <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
            {tools.map(t => {
              const isSel = selectedTool?.id === t.id;
              const isMaster = t.slug === 'master-question-bank' || t.name.toLowerCase() === 'master question bank';
              return (
                <div key={t.id} className="flex items-center space-x-1 group">
                  <button
                    onClick={() => {
                      setSelectedTool(t);
                      setWorkspaceMode('tool_settings');
                    }}
                    className={`flex-1 text-left px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                      isSel 
                        ? 'bg-slate-900 text-white shadow-xs' 
                        : isMaster
                        ? 'bg-indigo-50/70 border border-indigo-150 text-indigo-950 hover:bg-indigo-100/70'
                        : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center space-x-1.5 truncate">
                      {isMaster && <Sparkles className={`w-3.5 h-3.5 shrink-0 ${isSel ? 'text-amber-300' : 'text-amber-500'}`} />}
                      <span className="truncate">{t.name}</span>
                    </div>
                    <span className={`text-[9px] uppercase font-mono tracking-wider ml-2 shrink-0 ${
                      isSel ? 'opacity-70' : isMaster ? 'bg-indigo-200/80 text-indigo-900 px-1.5 py-0.5 rounded font-bold' : 'opacity-60'
                    }`}>
                      {isMaster ? 'Master Bank' : t.category}
                    </span>
                  </button>
                  {!isMaster && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenDeleteToolModal(t);
                      }}
                      title="Delete Instrument"
                      className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Version Controller Card */}
        {selectedTool && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center">
                <Workflow className="w-3.5 h-3.5 mr-1.5 text-slate-500" />
                Versions ({versions.length})
              </h3>
              {selectedVersion && selectedVersion.status === 'published' && (
                <button
                  onClick={handleCloneVersion}
                  disabled={actionLoading}
                  className="text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded transition-colors flex items-center"
                >
                  <Copy className="w-3 h-3 mr-0.5" /> Clone
                </button>
              )}
            </div>

            {/* Version timeline selection */}
            <div className="space-y-1.5">
              {versions.map(v => {
                const isSel = selectedVersion?.id === v.id;
                return (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVersion(v)}
                    className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between ${
                      isSel
                        ? 'border-indigo-600 bg-indigo-50/40 shadow-2xs'
                        : 'border-slate-150 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="space-y-0.5">
                      <div className="text-xs font-bold text-slate-900">
                        Version {v.version_number}
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {v.published_at ? new Date(v.published_at).toLocaleDateString() : 'Unpublished Draft'}
                      </div>
                    </div>
                    
                    {/* Badge */}
                    <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.5 rounded ${
                      v.status === 'published' 
                        ? 'bg-green-100 text-green-800' 
                        : v.status === 'archived'
                        ? 'bg-slate-100 text-slate-600'
                        : 'bg-amber-100 text-amber-800'
                    }`}>
                      {v.status}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Version state transition buttons */}
            {selectedVersion && (
              <div className="pt-2 border-t border-slate-100 flex flex-col space-y-2">
                {selectedVersion.status === 'draft' && (
                  <button
                    onClick={handlePublishVersion}
                    disabled={actionLoading}
                    className="w-full text-center py-2 text-xs font-bold bg-green-600 hover:bg-green-700 text-white rounded-lg cursor-pointer transition-colors flex items-center justify-center shadow-xs"
                  >
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                    Publish Version {selectedVersion.version_number}
                  </button>
                )}
                {selectedVersion.status === 'published' && (
                  <button
                    onClick={handleArchiveVersion}
                    disabled={actionLoading}
                    className="w-full text-center py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg cursor-pointer transition-colors flex items-center justify-center shadow-xs"
                  >
                    <Archive className="w-3.5 h-3.5 mr-1.5" />
                    Archive Version {selectedVersion.version_number}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Middle Outline Structure Tree Column */}
      <div className={`${isRightPanelActive ? 'lg:col-span-2' : 'lg:col-span-3'} space-y-6`}>
        {(workspaceMode === 'questions' || (selectedTool && selectedVersion)) ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden flex flex-col">
            
            {/* Outline Header Tabs */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
              <div className="flex space-x-1">
                {[
                  { id: 'questions', label: 'Questions Builder', icon: HelpCircle },
                  { id: 'tool_settings', label: 'Settings', icon: Settings },
                  { id: 'hierarchy', label: 'Hierarchy Workspace', icon: Layers },
                  { id: 'rules', label: 'Conditional Rules', icon: Workflow },
                  { id: 'preview', label: 'Builder Preview', icon: Eye }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = workspaceMode === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setWorkspaceMode(tab.id as any)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-white border border-slate-200 text-slate-900 shadow-3xs'
                          : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 mr-1.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
              <span className={`text-[10px] font-mono font-bold uppercase flex items-center ${
                isEditable ? 'text-amber-700' : 'text-green-700'
              }`}>
                {isEditable ? (
                  <>
                    <Unlock className="w-3 h-3 mr-1" /> EDITABLE
                  </>
                ) : (
                  <>
                    <Lock className="w-3 h-3 mr-1" /> IMMUTABLE SNAPSHOT
                  </>
                )}
              </span>
            </div>

            {/* Validation Outputs */}
            {validationErrors.length > 0 && (
              <div className="bg-red-50 border-b border-red-200 p-4 space-y-1">
                <h4 className="text-xs font-bold text-red-800 flex items-center">
                  <AlertCircle className="w-4 h-4 mr-1.5" /> Publishing Validation Failed:
                </h4>
                <ul className="list-disc list-inside text-xs text-red-700 pl-1.5 space-y-0.5">
                  {validationErrors.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}
            {validationSuccess && (
              <div className="bg-green-50 border-b border-green-200 p-4 text-xs font-semibold text-green-800 flex items-center">
                <Check className="w-4 h-4 mr-1.5 text-green-600" />
                {validationSuccess}
              </div>
            )}

            {/* Tab Workspace View panels */}
            <div className="p-6 min-h-[450px]">
              
              {/* VIEW 0: Global Questions Builder View */}
              {workspaceMode === 'questions' && (
                <div className="space-y-6">
                  {/* Top Header & Quick Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center">
                        <HelpCircle className="w-5 h-5 mr-2 text-indigo-600" />
                        Questions Builder
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Create questions with hint, answer type, and assign to Instruments, Areas, or Operation Types — or paste and parse in bulk.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      {selectedTool && !isMasterBank && isEditable ? (
                        <button
                          type="button"
                          onClick={() => handleOpenAddFromBank()}
                          className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                        >
                          <Sparkles className="w-4 h-4 text-amber-600" />
                          <span>Add from Master Bank</span>
                        </button>
                      ) : isMasterBank ? (
                        <button
                          type="button"
                          onClick={() => {
                            setBatchImportTarget(null);
                            setShowBatchModal(true);
                          }}
                          className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-2xs"
                        >
                          <Clipboard className="w-4 h-4 text-indigo-600" />
                          <span>Paste & Parse Questions</span>
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={handleOpenNewQuestionModal}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer flex items-center space-x-1.5 shadow-xs"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Add Question</span>
                      </button>
                    </div>
                  </div>

                  {/* Filter & Search Toolbar */}
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 border border-slate-200 rounded-xl">
                    {/* Search Input */}
                    <div className="sm:col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Search</label>
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Filter questions..."
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-slate-900"
                      />
                    </div>

                    {/* Instrument Filter */}
                    <div className="sm:col-span-1">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">Instrument / Tool</label>
                        {selectedTool && (filterToolId === selectedTool.id || !filterToolId) && (
                          <span className="text-[9px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">Active</span>
                        )}
                      </div>
                      <select
                        value={filterToolId || (selectedTool ? selectedTool.id : '')}
                        onChange={(e) => setFilterToolId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="">-- All Instruments --</option>
                        {tools.map(t => (
                          <option key={t.id} value={t.id}>
                            {t.name} {selectedTool?.id === t.id ? '(Active)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Area Filter */}
                    <div className="sm:col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Site Area</label>
                      <select
                        value={filterAreaId}
                        onChange={(e) => setFilterAreaId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="">-- All Areas --</option>
                        {siteAreas.map(a => (
                          <option key={a.id} value={a.id}>[{a.code}] {a.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Operation Type Filter */}
                    <div className="sm:col-span-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block mb-1">Operation Type</label>
                      <select
                        value={filterOpTypeId}
                        onChange={(e) => setFilterOpTypeId(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-slate-900"
                      >
                        <option value="">-- All Operations --</option>
                        {operationTypes.map(o => (
                          <option key={o.id} value={o.id}>[{o.code}] {o.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Filtered Questions Cards */}
                  {(() => {
                    const targetToolId = filterToolId || selectedTool?.id;

                    const filtered = allQuestions.filter(q => {
                      if (searchQuery.trim()) {
                        const s = searchQuery.toLowerCase();
                        const matchQ = q.question_text.toLowerCase().includes(s);
                        const matchH = q.hint_text?.toLowerCase().includes(s);
                        if (!matchQ && !matchH) return false;
                      }
                      if (targetToolId) {
                        const isAssigned = (
                          q.tool_id === targetToolId ||
                          (Array.isArray(q.tool_ids) && q.tool_ids.includes(targetToolId)) ||
                          (selectedTool?.id === targetToolId && selectedVersion && q.tool_version_id === selectedVersion.id)
                        );
                        if (!isAssigned) return false;
                      }
                      if (filterAreaId && q.area_id !== filterAreaId && (!q.area_ids || !q.area_ids.includes(filterAreaId))) return false;
                      if (filterOpTypeId && q.operation_type_id !== filterOpTypeId && (!q.operation_type_ids || !q.operation_type_ids.includes(filterOpTypeId))) return false;
                      return true;
                    });

                    if (filtered.length === 0) {
                      return (
                        <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl space-y-3">
                          <HelpCircle className="w-8 h-8 text-slate-300 mx-auto" />
                          <div className="text-sm font-bold text-slate-700">
                            {selectedTool 
                              ? `No questions assigned to "${selectedTool.name}" yet`
                              : 'No questions match the criteria'}
                          </div>
                          <p className="text-xs text-slate-400 max-w-sm mx-auto">
                            {selectedTool && !isMasterBank
                              ? 'Click "+ Add from Master Bank" to import standard questions, or "+ Add Question" to create a custom question for this instrument.'
                              : 'Click "+ Add Question" to create your first question or "Paste & Parse Questions" to bulk import.'}
                          </p>
                        </div>
                      );
                    }

                    const areaMap = new Map(siteAreas.map(a => [a.id, a.name]));
                    const opMap = new Map(operationTypes.map(o => [o.id, o.name]));

                    return (
                      <div className="space-y-3">
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center justify-between px-1">
                          <span>Showing {filtered.length} Question{filtered.length === 1 ? '' : 's'}</span>
                          {(filterToolId || filterAreaId || filterOpTypeId || searchQuery) && (
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('');
                                setFilterToolId('');
                                setFilterAreaId('');
                                setFilterOpTypeId('');
                              }}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                            >
                              Clear Filters
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-1 gap-3">
                          {filtered.map(q => {
                            const areaName = q.area_id ? areaMap.get(q.area_id) : null;
                            const opName = q.operation_type_id ? opMap.get(q.operation_type_id) : null;

                            return (
                              <div
                                key={q.id}
                                className="bg-white border border-slate-200 rounded-xl p-4 hover:border-slate-300 transition-all shadow-2xs space-y-3"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="space-y-1 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-mono font-bold rounded">
                                        {q.question_code}
                                      </span>

                                      {/* Instrument Badges */}
                                      {q.tool_names && q.tool_names.length > 0 ? (
                                        q.tool_names.map((tn, idx) => (
                                          <span key={idx} className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-900 text-[10px] font-semibold rounded-md flex items-center">
                                            <Workflow className="w-3 h-3 mr-1 text-indigo-600" />
                                            {tn}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="px-2 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-900 text-[10px] font-semibold rounded-md flex items-center">
                                          <Workflow className="w-3 h-3 mr-1 text-indigo-600" />
                                          {q.tool_name || 'Unassigned Instrument'}
                                        </span>
                                      )}

                                      {/* Area Badges */}
                                      {q.area_ids && q.area_ids.length > 0 ? (
                                        q.area_ids.map(aid => {
                                          const aName = areaMap.get(aid);
                                          if (!aName) return null;
                                          return (
                                            <span key={aid} className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-[10px] font-semibold rounded-md">
                                              Area: {aName}
                                            </span>
                                          );
                                        })
                                      ) : areaName ? (
                                        <span className="px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-900 text-[10px] font-semibold rounded-md">
                                          Area: {areaName}
                                        </span>
                                      ) : null}

                                      {/* Operation Type Badges */}
                                      {q.operation_type_ids && q.operation_type_ids.length > 0 ? (
                                        q.operation_type_ids.map(oid => {
                                          const oName = opMap.get(oid);
                                          if (!oName) return null;
                                          return (
                                            <span key={oid} className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-semibold rounded-md">
                                              Op: {oName}
                                            </span>
                                          );
                                        })
                                      ) : opName ? (
                                        <span className="px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-semibold rounded-md">
                                          Op: {opName}
                                        </span>
                                      ) : null}

                                      <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-medium rounded capitalize">
                                        {q.answer_type.replace('_', ' ')}
                                      </span>
                                    </div>

                                    <h4 className="text-sm font-bold text-slate-900 pt-1">
                                      {q.question_text}
                                    </h4>

                                    {q.hint_text && (
                                      <p className="text-xs text-slate-500 italic bg-slate-50 px-2.5 py-1 rounded-md border border-slate-150 inline-block">
                                        Hint: {q.hint_text}
                                      </p>
                                    )}
                                  </div>

                                  {/* Question Actions */}
                                  <div className="flex items-center space-x-1">
                                    <button
                                      type="button"
                                      onClick={() => handleOpenEditQuestionModal(q)}
                                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                      title="Edit Question"
                                    >
                                      <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteQuestionGlobal(q.id)}
                                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                                      title="Delete Question"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
              
              {/* VIEW A: Tool & Version Metadata Settings */}
              {workspaceMode === 'tool_settings' && selectedTool && selectedVersion && (
                <div className="space-y-6 max-w-xl">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-slate-900">Instrument Settings</h3>
                    <p className="text-xs text-slate-400">Configure global metadata for this data-gathering container.</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Tool Name</label>
                      <input
                        type="text"
                        value={selectedTool.name}
                        disabled={!isEditable}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, name: val } : t));
                          setSelectedTool(prev => prev ? { ...prev, name: val } : null);
                          await supabase.from('tools').update({ name: val }).eq('id', selectedTool.id);
                        }}
                        className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 disabled:bg-slate-50"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Description</label>
                      <textarea
                        value={selectedTool.description || ''}
                        disabled={!isEditable}
                        rows={3}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, description: val } : t));
                          setSelectedTool(prev => prev ? { ...prev, description: val } : null);
                          await supabase.from('tools').update({ description: val }).eq('id', selectedTool.id);
                        }}
                        className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 disabled:bg-slate-50"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700">Category</label>
                        <select
                          value={selectedTool.category}
                          disabled={!isEditable}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, category: val } : t));
                            setSelectedTool(prev => prev ? { ...prev, category: val } : null);
                            await supabase.from('tools').update({ category: val }).eq('id', selectedTool.id);
                          }}
                          className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 disabled:bg-slate-50"
                        >
                          <option value="safety">Safety Observation</option>
                          <option value="audit">Safety Audit</option>
                          <option value="inspection">Facility Inspection</option>
                          <option value="risk_assessment">Risk Assessment</option>
                        </select>
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-slate-700">Instructions (Version {selectedVersion.version_number})</label>
                        <input
                          type="text"
                          value={selectedVersion.instructions || ''}
                          disabled={!isEditable}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setSelectedVersion(prev => prev ? { ...prev, instructions: val } : null);
                            await supabase.from('tool_versions').update({ instructions: val }).eq('id', selectedVersion.id);
                          }}
                          className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 disabled:bg-slate-50"
                        />
                      </div>
                    </div>

                    {/* Site Areas Checkbox Options */}
                    <div className="space-y-2 pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-900">
                          Applicable Site Areas / Zones ({(selectedTool.area_ids || []).length} configured)
                        </label>
                        {isEditable && (
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={async () => {
                                const allIds = siteAreas.map(a => a.id);
                                setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, area_ids: allIds } : t));
                                setSelectedTool(prev => prev ? { ...prev, area_ids: allIds } : null);
                                await supabase.from('tools').update({ area_ids: allIds }).eq('id', selectedTool.id);
                              }}
                              className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={async () => {
                                setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, area_ids: [] } : t));
                                setSelectedTool(prev => prev ? { ...prev, area_ids: [] } : null);
                                await supabase.from('tools').update({ area_ids: [] }).eq('id', selectedTool.id);
                              }}
                              className="text-xs text-slate-500 hover:underline font-semibold cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        When starting this instrument form, only these site areas will be presented as options to drive question visibility.
                      </p>
                      {siteAreas.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No site areas found.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                          {siteAreas.map(area => {
                            const curAreaIds = selectedTool.area_ids || [];
                            const checked = curAreaIds.includes(area.id);
                            return (
                              <label
                                key={area.id}
                                className={`flex items-center space-x-2 p-1.5 rounded cursor-pointer transition-colors text-xs ${
                                  checked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={!isEditable}
                                  checked={checked}
                                  onChange={async (e) => {
                                    const nextAreaIds = e.target.checked
                                      ? [...curAreaIds, area.id]
                                      : curAreaIds.filter(id => id !== area.id);
                                    setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, area_ids: nextAreaIds } : t));
                                    setSelectedTool(prev => prev ? { ...prev, area_ids: nextAreaIds } : null);
                                    await supabase.from('tools').update({ area_ids: nextAreaIds }).eq('id', selectedTool.id);
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
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
                    <div className="space-y-2 pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-900">
                          Applicable Operation Types ({(selectedTool.operation_type_ids || []).length} configured)
                        </label>
                        {isEditable && (
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={async () => {
                                const allIds = operationTypes.map(o => o.id);
                                setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, operation_type_ids: allIds } : t));
                                setSelectedTool(prev => prev ? { ...prev, operation_type_ids: allIds } : null);
                                await supabase.from('tools').update({ operation_type_ids: allIds }).eq('id', selectedTool.id);
                              }}
                              className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                            >
                              Select All
                            </button>
                            <span className="text-slate-300">|</span>
                            <button
                              type="button"
                              onClick={async () => {
                                setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, operation_type_ids: [] } : t));
                                setSelectedTool(prev => prev ? { ...prev, operation_type_ids: [] } : null);
                                await supabase.from('tools').update({ operation_type_ids: [] }).eq('id', selectedTool.id);
                              }}
                              className="text-xs text-slate-500 hover:underline font-semibold cursor-pointer"
                            >
                              Clear
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="text-xs text-slate-500">
                        When starting this instrument form, only these operation types will be presented as options to drive question visibility.
                      </p>
                      {operationTypes.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">No operation types found.</p>
                      ) : (
                        <div className="max-h-40 overflow-y-auto space-y-1 border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                          {operationTypes.map(op => {
                            const curOpIds = selectedTool.operation_type_ids || [];
                            const checked = curOpIds.includes(op.id);
                            return (
                              <label
                                key={op.id}
                                className={`flex items-center space-x-2 p-1.5 rounded cursor-pointer transition-colors text-xs ${
                                  checked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'text-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  disabled={!isEditable}
                                  checked={checked}
                                  onChange={async (e) => {
                                    const nextOpIds = e.target.checked
                                      ? [...curOpIds, op.id]
                                      : curOpIds.filter(id => id !== op.id);
                                    setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, operation_type_ids: nextOpIds } : t));
                                    setSelectedTool(prev => prev ? { ...prev, operation_type_ids: nextOpIds } : null);
                                    await supabase.from('tools').update({ operation_type_ids: nextOpIds }).eq('id', selectedTool.id);
                                  }}
                                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
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

                    {/* Applicable Colleague Roles & Operators Checkbox Options */}
                    <div className="space-y-2 pt-3 border-t border-slate-200">
                      {(() => {
                        const targetRoleIds: string[] = (selectedVersion.settings as any)?.target_role_ids || selectedTool.target_role_ids || [];
                        
                        const updateTargetRoles = async (nextRoles: string[]) => {
                          const currentSettings = selectedVersion.settings || {};
                          const updatedSettings = { ...currentSettings, target_role_ids: nextRoles };
                          setSelectedVersion(prev => prev ? { ...prev, settings: updatedSettings } : null);
                          setVersions(prev => prev.map(v => v.id === selectedVersion.id ? { ...v, settings: updatedSettings } : v));
                          setSelectedTool(prev => prev ? { ...prev, target_role_ids: nextRoles } : null);
                          setTools(prev => prev.map(t => t.id === selectedTool.id ? { ...t, target_role_ids: nextRoles } : t));
                          await supabase.from('tool_versions').update({ settings: updatedSettings }).eq('id', selectedVersion.id);
                        };

                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-slate-900 flex items-center">
                                <Users className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                                Applicable Colleague Roles ({targetRoleIds.length} configured)
                              </label>
                              {isEditable && (
                                <div className="flex items-center space-x-2">
                                  <button
                                    type="button"
                                    onClick={() => updateTargetRoles(colleagueRoles.map(r => r.code))}
                                    className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                                  >
                                    Select All
                                  </button>
                                  <span className="text-slate-300">|</span>
                                  <button
                                    type="button"
                                    onClick={() => updateTargetRoles([])}
                                    className="text-xs text-slate-500 hover:underline font-semibold cursor-pointer"
                                  >
                                    Clear
                                  </button>
                                </div>
                              )}
                            </div>
                            <p className="text-xs text-slate-500">
                              Observers using this instrument will select from colleagues matching these roles (e.g. MHE Operator, Machine Operator).
                            </p>
                            <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-lg p-2 bg-slate-50/50">
                              {colleagueRoles.map(role => {
                                const checked = targetRoleIds.includes(role.code) || targetRoleIds.includes(role.id);
                                return (
                                  <label
                                    key={role.id || role.code}
                                    className={`flex items-start space-x-2.5 p-2 rounded-md cursor-pointer transition-colors text-xs ${
                                      checked ? 'bg-indigo-50/80 text-indigo-900 font-medium' : 'text-slate-700 hover:bg-slate-100'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      disabled={!isEditable}
                                      checked={checked}
                                      onChange={async (e) => {
                                        const nextRoles = e.target.checked
                                          ? [...targetRoleIds, role.code]
                                          : targetRoleIds.filter(r => r !== role.code && r !== role.id);
                                        await updateTargetRoles(nextRoles);
                                      }}
                                      className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 mt-0.5"
                                    />
                                    <div className="flex-1 space-y-0.5">
                                      <div className="flex items-center space-x-2">
                                        <span className="font-bold">{role.name}</span>
                                        {role.is_can_observe && (
                                          <span className="text-[9px] bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded font-semibold">
                                            Observer
                                          </span>
                                        )}
                                      </div>
                                      {role.description && (
                                        <p className="text-[10px] text-slate-400 leading-snug">{role.description}</p>
                                      )}
                                    </div>
                                  </label>
                                );
                              })}
                            </div>
                          </>
                        );
                      })()}
                    </div>

                    {/* Danger Zone */}
                    <div className="pt-6 border-t border-red-100 space-y-3">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-red-600 uppercase tracking-wider font-mono">Danger Zone</h4>
                        <p className="text-[11px] text-slate-400">Permanently delete this instrument and all its associated versions, with the option to preserve questions in the Question Bank.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteToolModal(selectedTool)}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 hover:text-red-700 text-xs font-bold rounded-lg border border-red-200 cursor-pointer transition-colors flex items-center space-x-1.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Entire Instrument</span>
                      </button>
                    </div>

                  </div>
                </div>
              )}

              {/* VIEW B: Workspace Structural Hierarchy Tree */}
              {workspaceMode === 'hierarchy' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Builder Hierarchy Workspace</h3>
                      <p className="text-xs text-slate-400">Add sections, nesting questions, and setting up option definitions.</p>
                    </div>
                    {isEditable && (
                      <div className="flex items-center space-x-2">
                        {!isMasterBank && (
                          <button
                            onClick={() => handleOpenAddFromBank()}
                            className="px-3 py-1.5 text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 rounded-lg cursor-pointer transition-colors flex items-center shadow-xs"
                          >
                            <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" /> Add from Master Bank
                          </button>
                        )}
                        <button
                          onClick={handleAddSection}
                          className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors flex items-center shadow-xs"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                        </button>
                      </div>
                    )}
                  </div>

                  {sections.length === 0 && (
                    <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                      <Layers className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-xs text-slate-400 font-medium">No sections added to this version yet.</p>
                    </div>
                  )}

                  {/* Sections loop */}
                  <div className="space-y-6">
                    {sections.map((sec, sIdx) => {
                      const secQs = questions.filter(q => q.section_id === sec.id).sort((a, b) => a.order_index - b.order_index);
                      
                      return (
                        <div key={sec.id} className="border border-slate-150 rounded-xl overflow-hidden shadow-3xs">
                          {/* Section Header */}
                          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between border-b border-slate-100">
                            <div className="space-y-0.5">
                              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                                Section {sIdx + 1}
                              </span>
                              <h4 className="text-xs font-bold text-slate-900">{sec.title}</h4>
                            </div>

                            {/* Section Toolbar */}
                            <div className="flex items-center space-x-1.5">
                              {isEditable && (
                                <>
                                  {isMasterBank ? (
                                    <button
                                      onClick={() => {
                                        setBatchImportTarget({ id: sec.id, title: sec.title });
                                        setShowBatchModal(true);
                                      }}
                                      className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/80 text-indigo-700 rounded text-[11px] font-semibold transition-colors cursor-pointer mr-1"
                                      title="Copy & Paste Questions Parser (Question | Hint)"
                                    >
                                      <Clipboard className="w-3 h-3" />
                                      <span>Paste Questions</span>
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleOpenAddFromBank(sec.id)}
                                      className="flex items-center space-x-1 px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 rounded text-[11px] font-semibold transition-colors cursor-pointer mr-1 shadow-2xs"
                                      title="Select and customize questions from Master Question Bank"
                                    >
                                      <Sparkles className="w-3 h-3 text-amber-600" />
                                      <span>+ From Master Bank</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleAddQuestion(sec.id)}
                                    className="p-1 hover:bg-slate-200 text-indigo-700 rounded transition-colors cursor-pointer"
                                    title="Add Single Question"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      setEditingSection(sec);
                                      setEditingQuestion(null);
                                    }}
                                    className="p-1 hover:bg-slate-200 text-slate-600 rounded transition-colors cursor-pointer"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveSection(sec.id, 'up')}
                                    disabled={sIdx === 0}
                                    className="p-1 hover:bg-slate-200 text-slate-600 rounded disabled:opacity-30 transition-colors cursor-pointer"
                                  >
                                    <ArrowUp className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleMoveSection(sec.id, 'down')}
                                    disabled={sIdx === sections.length - 1}
                                    className="p-1 hover:bg-slate-200 text-slate-600 rounded disabled:opacity-30 transition-colors cursor-pointer"
                                  >
                                    <ArrowDown className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSection(sec.id)}
                                    className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Questions Nest Block */}
                          <div className="divide-y divide-slate-100 bg-white">
                            {secQs.length === 0 ? (
                              <div className="p-4 text-center text-xs text-slate-400 font-semibold italic">
                                No questions inside this section.
                              </div>
                            ) : (
                               secQs.map((q, qIdx) => {
                                const qOpts = options.filter(opt => opt.question_id === q.id).sort((a, b) => a.order_index - b.order_index);
                                const linkedArea = siteAreas.find(a => a.id === q.area_id);
                                const linkedOp = operationTypes.find(o => o.id === q.operation_type_id);
                                return (
                                  <div key={q.id} className="p-4 space-y-3 hover:bg-slate-50/40 transition-colors">
                                    <div className="flex items-start justify-between">
                                      <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                            {q.question_code}
                                          </span>
                                          <span className="text-[10px] font-mono font-bold text-indigo-700 uppercase tracking-wider">
                                            {q.answer_type}
                                          </span>
                                          {q.is_required && (
                                            <span className="text-[9px] font-bold text-red-500 uppercase">Required</span>
                                          )}
                                          {linkedArea && (
                                            <span className="text-[9px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                                              Area: {linkedArea.name}
                                            </span>
                                          )}
                                          {linkedOp && (
                                            <span className="text-[9px] font-bold bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100">
                                              Op: {linkedOp.name}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs font-bold text-slate-900">{q.question_text}</p>
                                        {q.hint_text && (
                                          <p className="text-[10px] text-slate-400 italic">Hint: {q.hint_text}</p>
                                        )}
                                      </div>

                                      {/* Question Actions */}
                                      <div className="flex items-center space-x-1">
                                        {isEditable && (
                                          <>
                                            <button
                                              onClick={() => {
                                                setEditingQuestion(q);
                                                setEditingSection(null);
                                              }}
                                              className="p-1 hover:bg-slate-200 text-slate-600 rounded transition-colors cursor-pointer"
                                            >
                                              <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => handleMoveQuestion(q.id, 'up')}
                                              disabled={qIdx === 0}
                                              className="p-1 hover:bg-slate-200 text-slate-600 rounded disabled:opacity-30 transition-colors cursor-pointer"
                                            >
                                              <ArrowUp className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => handleMoveQuestion(q.id, 'down')}
                                              disabled={qIdx === secQs.length - 1}
                                              className="p-1 hover:bg-slate-200 text-slate-600 rounded disabled:opacity-30 transition-colors cursor-pointer"
                                            >
                                              <ArrowDown className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                              onClick={() => handleDeleteQuestion(q.id)}
                                              className="p-1 hover:bg-red-50 text-red-600 rounded transition-colors cursor-pointer"
                                            >
                                              <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                          </>
                                        )}
                                      </div>
                                    </div>

                                    {/* Question Options UI List (if applicable) */}
                                    {(q.answer_type === 'single_choice' || q.answer_type === 'multiple_choice') && (
                                      <div className="pl-6 space-y-2 border-l-2 border-slate-100">
                                        <div className="flex items-center justify-between">
                                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Selectable Options ({qOpts.length})
                                          </span>
                                          {isEditable && (
                                            <button
                                              onClick={() => handleAddOption(q.id)}
                                              className="text-[9px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-1.5 py-0.5 rounded cursor-pointer"
                                            >
                                              + Add Option
                                            </button>
                                          )}
                                        </div>

                                        <div className="space-y-1">
                                          {qOpts.map((opt, oIdx) => (
                                            <div key={opt.id} className="flex items-center justify-between text-xs py-1 bg-slate-50 px-2 rounded border border-slate-100">
                                              <div className="flex items-center space-x-2 w-full">
                                                <input
                                                  type="text"
                                                  value={opt.label}
                                                  disabled={!isEditable}
                                                  placeholder="Label"
                                                  onChange={(e) => handleUpdateOption(opt.id, { label: e.target.value })}
                                                  className="bg-transparent border-none text-xs font-semibold text-slate-800 p-0 focus:ring-0 max-w-[140px]"
                                                />
                                                <span className="text-[10px] text-slate-400 font-mono">➡</span>
                                                <input
                                                  type="text"
                                                  value={opt.value}
                                                  disabled={!isEditable}
                                                  placeholder="Value"
                                                  onChange={(e) => handleUpdateOption(opt.id, { value: e.target.value })}
                                                  className="bg-transparent border-none text-[10px] font-mono text-indigo-700 p-0 focus:ring-0 max-w-[100px]"
                                                />
                                              </div>

                                              <div className="flex items-center space-x-2">
                                                {/* Score */}
                                                <div className="flex items-center space-x-1">
                                                  <span className="text-[9px] text-slate-400 uppercase font-mono">Wt</span>
                                                  <input
                                                    type="number"
                                                    value={opt.score || 0}
                                                    disabled={!isEditable}
                                                    onChange={(e) => handleUpdateOption(opt.id, { score: Number(e.target.value) })}
                                                    className="w-10 bg-transparent border-none text-xs font-mono text-slate-700 p-0 text-center"
                                                  />
                                                </div>

                                                {/* Flagged checkbox */}
                                                <label className="flex items-center space-x-1 cursor-pointer">
                                                  <input
                                                    type="checkbox"
                                                    checked={opt.is_flagged}
                                                    disabled={!isEditable}
                                                    onChange={(e) => handleUpdateOption(opt.id, { is_flagged: e.target.checked })}
                                                    className="rounded border-slate-200 text-indigo-600 focus:ring-indigo-500 w-3 h-3"
                                                  />
                                                  <span className="text-[9px] text-red-500 font-bold uppercase">Flag</span>
                                                </label>

                                                {isEditable && (
                                                  <button
                                                    onClick={() => handleDeleteOption(opt.id)}
                                                    className="text-red-600 hover:text-red-800"
                                                  >
                                                    <X className="w-3 h-3" />
                                                  </button>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Create a rule action */}
                                    {isEditable && (
                                      <div className="pl-6 pt-1">
                                        <button
                                          onClick={() => handleAddRule('question', q.id)}
                                          className="text-[10px] font-bold text-slate-500 hover:text-indigo-600 flex items-center cursor-pointer"
                                        >
                                          <Workflow className="w-3 h-3 mr-1" /> Add Visibility/Requirement Rule
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* VIEW C: Rules Configuration Tab */}
              {workspaceMode === 'rules' && (
                <div className="space-y-6">
                  <div className="border-b border-slate-100 pb-2">
                    <h3 className="text-sm font-bold text-slate-900">Configured Declarative Rules</h3>
                    <p className="text-xs text-slate-400">Rules are stored relationally in public.conditional_rules and rule_conditions. No frontend hardcoding.</p>
                  </div>

                  {rules.length === 0 && (
                    <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-2">
                      <Workflow className="w-8 h-8 mx-auto text-slate-300" />
                      <p className="text-xs text-slate-400 font-medium">No conditional rules defined for this version yet.</p>
                    </div>
                  )}

                  <div className="space-y-4">
                    {rules.map((rule, rIdx) => {
                      const ruleConds = conditions.filter(c => c.rule_id === rule.id);
                      
                      // Identify target label
                      let targetLabel = 'Unknown';
                      if (rule.target_type === 'question') {
                        const q = questions.find(qu => qu.id === rule.target_id);
                        targetLabel = q ? `Question: ${q.question_text} (${q.question_code})` : `Deleted Question (${rule.target_id})`;
                      } else {
                        const s = sections.find(sec => sec.id === rule.target_id);
                        targetLabel = s ? `Section: ${s.title}` : `Deleted Section (${rule.target_id})`;
                      }

                      return (
                        <div key={rule.id} className="border border-slate-200 rounded-xl p-4 bg-slate-50 shadow-3xs space-y-4">
                          <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                            <div className="space-y-1">
                              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider">
                                Rule {rIdx + 1}
                              </span>
                              <div className="text-xs font-semibold text-slate-800">
                                Action:{' '}
                                <select
                                  value={rule.action}
                                  disabled={!isEditable}
                                  onChange={(e) => handleUpdateRule(rule.id, { action: e.target.value as any })}
                                  className="mx-1 border-slate-200 rounded text-xs p-0.5 bg-white font-bold uppercase text-indigo-700"
                                >
                                  <option value="show">SHOW</option>
                                  <option value="hide">HIDE</option>
                                  <option value="require">REQUIRE</option>
                                </select>{' '}
                                target:{' '}
                                <span className="font-bold text-slate-900">{targetLabel}</span>
                              </div>
                            </div>

                            {isEditable && (
                              <button
                                onClick={() => handleDeleteRule(rule.id)}
                                className="text-red-600 hover:text-red-800 p-1 rounded hover:bg-red-50 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Conditions Block */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-1.5 text-xs text-slate-600 font-semibold">
                                <span>Evaluate conditions with operator</span>
                                <select
                                  value={rule.logical_operator}
                                  disabled={!isEditable}
                                  onChange={(e) => handleUpdateRule(rule.id, { logical_operator: e.target.value as any })}
                                  className="border-slate-200 rounded text-xs p-0.5 bg-white font-bold text-slate-800"
                                >
                                  <option value="AND">AND (All true)</option>
                                  <option value="OR">OR (Any true)</option>
                                </select>
                              </div>

                              {isEditable && (
                                <button
                                  onClick={() => handleAddCondition(rule.id)}
                                  className="text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-2 py-1 rounded cursor-pointer"
                                >
                                  + Add Condition
                                </button>
                              )}
                            </div>

                            {ruleConds.length === 0 ? (
                              <div className="text-center py-4 bg-white border rounded-lg text-xs font-semibold text-slate-400 italic">
                                No clauses attached. This rule will evaluate to TRUE by default.
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {ruleConds.map((cond, cIdx) => (
                                  <div key={cond.id} className="bg-white border border-slate-150 p-3 rounded-lg flex flex-col md:flex-row md:items-center gap-3">
                                    <span className="text-[10px] font-mono font-bold text-slate-400 md:self-center">
                                      Clause {cIdx + 1}
                                    </span>

                                    {/* Source question selector */}
                                    <div className="flex-1 min-w-[200px]">
                                      <select
                                        value={cond.source_question_id}
                                        disabled={!isEditable}
                                        onChange={(e) => handleUpdateCondition(cond.id, { source_question_id: e.target.value })}
                                        className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-700"
                                      >
                                        {questions.map(q => (
                                          <option key={q.id} value={q.id}>
                                            {q.question_code}: {q.question_text.substring(0, 45)}...
                                          </option>
                                        ))}
                                      </select>
                                    </div>

                                    {/* Comparison selector */}
                                    <div>
                                      <select
                                        value={cond.comparison_operator}
                                        disabled={!isEditable}
                                        onChange={(e) => handleUpdateCondition(cond.id, { comparison_operator: e.target.value as any })}
                                        className="text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-700"
                                      >
                                        <option value="equals">equals</option>
                                        <option value="not_equals">not_equals</option>
                                        <option value="in">in list</option>
                                        <option value="not_in">not_in list</option>
                                        <option value="greater_than">greater than</option>
                                        <option value="less_than">less than</option>
                                        <option value="is_empty">is empty</option>
                                        <option value="is_not_empty">is not empty</option>
                                      </select>
                                    </div>

                                    {/* Expected Value input */}
                                    {cond.comparison_operator !== 'is_empty' && cond.comparison_operator !== 'is_not_empty' && (
                                      <div className="flex-1">
                                        <input
                                          type="text"
                                          disabled={!isEditable}
                                          value={typeof cond.expected_value === 'string' ? cond.expected_value.replace(/^"|"$/g, '') : JSON.stringify(cond.expected_value)}
                                          placeholder="Expected value (e.g. true, live_load)"
                                          onChange={(e) => {
                                            const val = e.target.value;
                                            // Handle numbers/booleans smartly
                                            let parsed: any = val;
                                            if (val.toLowerCase() === 'true') parsed = true;
                                            else if (val.toLowerCase() === 'false') parsed = false;
                                            else if (!isNaN(Number(val)) && val.trim() !== '') parsed = Number(val);
                                            handleUpdateCondition(cond.id, { expected_value: JSON.stringify(parsed) });
                                          }}
                                          className="w-full text-xs border border-slate-200 rounded p-1.5 bg-white text-slate-700 font-semibold"
                                        />
                                      </div>
                                    )}

                                    {/* Delete condition clause */}
                                    {isEditable && (
                                      <button
                                        onClick={() => handleDeleteCondition(cond.id)}
                                        className="text-red-500 hover:text-red-700 self-end md:self-center"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* VIEW D: Dynamic Configurable Builder Preview */}
              {workspaceMode === 'preview' && (
                <div className="space-y-6">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Interactive Gathering Preview</h3>
                      <p className="text-xs text-slate-400">Test and validate sections, questions, required rules, and conditions in real-time before releasing.</p>
                    </div>
                    <button
                      onClick={() => setMockAnswers({})}
                      className="text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded transition-colors flex items-center"
                    >
                      <RefreshCw className="w-3.5 h-3.5 mr-1" /> Reset Answers
                    </button>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 space-y-6">
                    <div className="space-y-1">
                      <h2 className="text-base font-bold text-slate-900">{selectedTool?.name || 'Instrument Preview'}</h2>
                      {selectedTool?.description && (
                        <p className="text-xs text-slate-400">{selectedTool.description}</p>
                      )}
                    </div>

                    {/* Render sections sequentially */}
                    <div className="space-y-6">
                      {sections.map((sec) => {
                        const isSecVisible = previewState.visibleSections.has(sec.id);
                        if (!isSecVisible) return null;

                        const secQs = questions.filter(q => q.section_id === sec.id).sort((a, b) => a.order_index - b.order_index);

                        return (
                          <div key={sec.id} className="bg-white border border-slate-150 rounded-xl p-5 shadow-3xs space-y-4">
                            <div className="border-b border-slate-100 pb-2">
                              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">{sec.title}</h4>
                              {sec.description && (
                                <p className="text-[10px] text-slate-400">{sec.description}</p>
                              )}
                            </div>

                            {/* Questions Render Loop */}
                            <div className="space-y-4">
                              {secQs.map((q) => {
                                const isQVisible = previewState.visibleQuestions.has(q.id);
                                if (!isQVisible) return null;

                                const isQReq = previewState.requiredQuestions.has(q.id);
                                const currentAns = mockAnswers[q.id];

                                return (
                                  <div key={q.id} className="space-y-1.5">
                                    <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                                      <span>{q.question_text}</span>
                                      {isQReq && <span className="text-red-500">*</span>}
                                    </div>
                                    {q.hint_text && (
                                      <p className="text-[10px] text-slate-400 italic font-medium">{q.hint_text}</p>
                                    )}

                                    {/* Handle Answer Input Primitives dynamically */}
                                    <div className="pt-1">
                                      {q.answer_type === 'boolean' && (
                                        <div className="flex space-x-2">
                                          {[
                                            { label: 'Yes', val: true },
                                            { label: 'No', val: false }
                                          ].map(opt => {
                                            const active = currentAns === opt.val;
                                            return (
                                              <button
                                                key={opt.label}
                                                onClick={() => setMockAnswers(prev => ({ ...prev, [q.id]: opt.val }))}
                                                className={`px-4 py-2 text-xs font-bold rounded-lg border cursor-pointer transition-all ${
                                                  active
                                                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                }`}
                                              >
                                                {opt.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {(q.answer_type === 'single_choice' || q.answer_type === 'multiple_choice') && (
                                        <div className="flex flex-wrap gap-2">
                                          {options.filter(opt => opt.question_id === q.id).map(opt => {
                                            const isArr = Array.isArray(currentAns);
                                            const active = q.answer_type === 'single_choice'
                                              ? currentAns === opt.value
                                              : isArr && currentAns.includes(opt.value);

                                            return (
                                              <button
                                                key={opt.id}
                                                onClick={() => {
                                                  if (q.answer_type === 'single_choice') {
                                                    setMockAnswers(prev => ({ ...prev, [q.id]: opt.value }));
                                                  } else {
                                                    const cur = Array.isArray(currentAns) ? currentAns : [];
                                                    const next = cur.includes(opt.value)
                                                      ? cur.filter(v => v !== opt.value)
                                                      : [...cur, opt.value];
                                                    setMockAnswers(prev => ({ ...prev, [q.id]: next }));
                                                  }
                                                }}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-full border cursor-pointer transition-all ${
                                                  active
                                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-3xs'
                                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                                }`}
                                              >
                                                {opt.label}
                                                {opt.score !== null && (
                                                  <span className="ml-1 opacity-60 text-[9px] font-mono">({opt.score})</span>
                                                )}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}

                                      {q.answer_type === 'text' && (
                                        <textarea
                                          value={currentAns || ''}
                                          onChange={(e) => setMockAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                          rows={2}
                                          className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900"
                                          placeholder="Type notes..."
                                        />
                                      )}

                                      {q.answer_type === 'number' && (
                                        <input
                                          type="number"
                                          value={currentAns || ''}
                                          onChange={(e) => setMockAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                          className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 max-w-xs"
                                          placeholder="Enter count..."
                                        />
                                      )}

                                      {q.answer_type === 'date' && (
                                        <input
                                          type="date"
                                          value={currentAns || ''}
                                          onChange={(e) => setMockAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                          className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 max-w-xs"
                                        />
                                      )}

                                      {q.answer_type === 'time' && (
                                        <input
                                          type="time"
                                          value={currentAns || ''}
                                          onChange={(e) => setMockAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                                          className="w-full text-xs border border-slate-200 rounded-lg p-2.5 bg-white text-slate-900 max-w-xs"
                                        />
                                      )}

                                      {q.answer_type === 'rating' && (
                                        <div className="flex space-x-1">
                                          {[1, 2, 3, 4, 5].map(num => (
                                            <button
                                              key={num}
                                              onClick={() => setMockAnswers(prev => ({ ...prev, [q.id]: num }))}
                                              className={`w-8 h-8 rounded-full border flex items-center justify-center font-bold text-xs cursor-pointer ${
                                                currentAns === num
                                                  ? 'bg-amber-500 text-white border-amber-500 shadow-3xs'
                                                  : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200'
                                              }`}
                                            >
                                              {num}
                                            </button>
                                          ))}
                                        </div>
                                      )}

                                      {(q.answer_type === 'photo' || q.answer_type === 'signature') && (
                                        <div className="border border-dashed border-slate-200 rounded-lg p-4 text-center text-xs text-slate-400 font-medium">
                                          📸 Simulated Camera/Signature input
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-2xs space-y-4 min-h-[450px] flex flex-col justify-center items-center">
            <Layers className="w-12 h-12 text-slate-300 animate-pulse" />
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900">DASH Tool Builder</h3>
              <p className="text-xs text-slate-400 max-w-md">
                Select an existing operational data-gathering instrument from the left toolbar, or create a new customizable form from scratch.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 3. Right Editing Controller Panel for details (1col on Desktop) */}
      <div className="lg:col-span-1 space-y-6">
        {selectedVersion && isEditable && (editingSection || editingQuestion) && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center">
                <Settings className="w-3.5 h-3.5 mr-1.5 text-indigo-500" />
                Properties
              </h3>
              <button
                onClick={() => {
                  setEditingSection(null);
                  setEditingQuestion(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Editing Section properties */}
            {editingSection && (
              <div className="space-y-4">
                <div className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded inline-block">
                  SECTION PROPERTIES
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Section Title</label>
                  <input
                    type="text"
                    value={editingSection.title}
                    onChange={(e) => handleUpdateSection(editingSection.id, { title: e.target.value })}
                    className="w-full text-xs font-semibold border border-slate-200 rounded p-2 text-slate-900 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Description</label>
                  <textarea
                    value={editingSection.description || ''}
                    rows={3}
                    onChange={(e) => handleUpdateSection(editingSection.id, { description: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded p-2 text-slate-900 bg-white"
                  />
                </div>
              </div>
            )}

            {/* Editing Question properties */}
            {editingQuestion && (
              <div className="space-y-4">
                <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded inline-block">
                  QUESTION PROPERTIES
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Unique Code (Sync Check)</label>
                  <input
                    type="text"
                    value={editingQuestion.question_code}
                    onChange={(e) => handleUpdateQuestion(editingQuestion.id, { question_code: e.target.value })}
                    className="w-full text-xs font-mono font-bold border border-slate-200 rounded p-2 text-slate-900 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Question Text</label>
                  <textarea
                    value={editingQuestion.question_text}
                    rows={3}
                    onChange={(e) => handleUpdateQuestion(editingQuestion.id, { question_text: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded p-2 text-slate-900 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Help/Hint Text</label>
                  <input
                    type="text"
                    value={editingQuestion.hint_text || ''}
                    onChange={(e) => handleUpdateQuestion(editingQuestion.id, { hint_text: e.target.value })}
                    className="w-full text-xs border border-slate-200 rounded p-2 text-slate-900 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Answer Type</label>
                  <select
                    value={editingQuestion.answer_type}
                    onChange={(e) => handleUpdateQuestion(editingQuestion.id, { answer_type: e.target.value as AnswerType })}
                    className="w-full text-xs border border-slate-200 rounded p-2 bg-white text-slate-800"
                  >
                    <option value="boolean">Yes/No Toggle (Boolean)</option>
                    <option value="single_choice">Single Select Options</option>
                    <option value="multiple_choice">Multi-Select Checkboxes</option>
                    <option value="text">Text Input</option>
                    <option value="number">Numeric Keypad</option>
                    <option value="date">Native Date Picker</option>
                    <option value="time">Native Time Picker</option>
                    <option value="rating">Compliance rating (1-5)</option>
                    <option value="photo">Photo Capture</option>
                    <option value="signature">Canvas Signature</option>
                  </select>
                </div>

                {/* Target Area Tag */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Target Site Area Tag</label>
                  <select
                    value={editingQuestion.area_id || ''}
                    onChange={(e) => handleUpdateQuestion(editingQuestion.id, { area_id: e.target.value || null })}
                    className="w-full text-xs border border-slate-200 rounded p-2 bg-white text-slate-800"
                  >
                    <option value="">-- All Areas / Global --</option>
                    {siteAreas.map(a => (
                      <option key={a.id} value={a.id}>
                        [{a.code}] {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Target Operation Type Tag */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase text-slate-500">Target Operation Type Tag</label>
                  <select
                    value={editingQuestion.operation_type_id || ''}
                    onChange={(e) => handleUpdateQuestion(editingQuestion.id, { operation_type_id: e.target.value || null })}
                    className="w-full text-xs border border-slate-200 rounded p-2 bg-white text-slate-800"
                  >
                    <option value="">-- All Operations / Global --</option>
                    {operationTypes.map(o => (
                      <option key={o.id} value={o.id}>
                        [{o.code}] {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-2 pt-2">
                  <input
                    type="checkbox"
                    id="is_required_prop"
                    checked={editingQuestion.is_required}
                    onChange={(e) => handleUpdateQuestion(editingQuestion.id, { is_required: e.target.checked })}
                    className="rounded border-slate-350 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                  />
                  <label htmlFor="is_required_prop" className="text-xs font-bold text-slate-700 cursor-pointer">
                    Required Question
                  </label>
                </div>
              </div>
            )}
          </div>
        )}



        {/* Create New Instrument Modal */}
        <CreateInstrumentModal
          isOpen={showCreateTool}
          onClose={() => setShowCreateTool(false)}
          onCreate={handleCreateTool}
          name={newToolName}
          setName={setNewToolName}
          description={newToolDesc}
          setDescription={setNewToolDesc}
          category={newToolCategory}
          setCategory={setNewToolCategory}
          siteIds={newToolSiteIds}
          setSiteIds={setNewToolSiteIds}
          areaIds={newToolAreaIds}
          setAreaIds={setNewToolAreaIds}
          operationTypeIds={newToolOpTypeIds}
          setOperationTypeIds={setNewToolOpTypeIds}
          targetRoleIds={newToolTargetRoleIds}
          setTargetRoleIds={setNewToolTargetRoleIds}
          sites={sites}
          siteAreas={siteAreas}
          operationTypes={operationTypes}
          colleagueRoles={colleagueRoles}
          loading={actionLoading}
        />

        {/* Batch Question Import Copy & Paste Modal */}
        {showBatchModal && profile && (
          <BatchQuestionImportModal
            isOpen={showBatchModal}
            onClose={() => {
              setShowBatchModal(false);
              setBatchImportTarget(null);
            }}
            sectionId={batchImportTarget?.id || ''}
            sectionTitle={batchImportTarget?.title || 'General Inspection'}
            toolVersionId={selectedVersion?.id || ''}
            tenantId={profile.tenant_id || ''}
            existingQuestionsCount={questions.filter(q => q.section_id === batchImportTarget?.id).length}
            onImportSuccess={(newQs, newOpts) => {
              handleBatchImportSuccess(newQs, newOpts);
              fetchAllQuestions();
              fetchTools();
            }}
          />
        )}

        {/* Add Questions From Master Bank Modal */}
        {showAddFromBankModal && selectedTool && selectedVersion && profile && (
          <AddQuestionsFromBankModal
            isOpen={showAddFromBankModal}
            onClose={() => {
              setShowAddFromBankModal(false);
              setAddFromBankTargetSectionId(undefined);
            }}
            targetTool={selectedTool}
            targetVersionId={selectedVersion.id}
            sections={sections}
            defaultSectionId={addFromBankTargetSectionId}
            existingQuestions={questions}
            allBankQuestions={allQuestions}
            sites={sites}
            siteAreas={siteAreas}
            operationTypes={operationTypes}
            onQuestionsAdded={async () => {
              if (selectedVersion) {
                await fetchVersionStructure(selectedVersion.id);
              }
              await fetchAllQuestions();
              setValidationSuccess('Successfully added and customized questions from Master Question Bank.');
              setTimeout(() => setValidationSuccess(null), 5000);
            }}
          />
        )}

        {/* Single Question Creator / Editor Modal */}
        {showSingleQuestionModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
              
              {/* Header */}
              <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <HelpCircle className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-base font-bold">
                    {editingQuestionId ? 'Edit Question' : 'Create Question'}
                  </h3>
                </div>
                <button
                  onClick={() => setShowSingleQuestionModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content */}
              <div className="p-6 overflow-y-auto space-y-4 text-xs">
                {/* Pre-fill from Master Question Bank Helper */}
                {!editingQuestionId && allQuestions.length > 0 && (
                  <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 space-y-1.5">
                    <label className="font-bold text-amber-950 flex items-center text-[11px]">
                      <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-600" />
                      Optional: Pre-fill from Master Question Bank
                    </label>
                    <select
                      onChange={(e) => {
                        const qId = e.target.value;
                        if (!qId) return;
                        const match = allQuestions.find(q => q.id === qId);
                        if (match) {
                          setQFormTitle(match.question_text);
                          setQFormHint(match.hint_text || '');
                          setQFormAnswerType(match.answer_type || 'single_choice');
                          if (match.area_ids && match.area_ids.length > 0) {
                            setQFormAreaIds(match.area_ids);
                          }
                          if (match.operation_type_ids && match.operation_type_ids.length > 0) {
                            setQFormOpTypeIds(match.operation_type_ids);
                          }
                        }
                      }}
                      defaultValue=""
                      className="w-full px-3 py-1.5 border border-amber-300 rounded-lg text-xs bg-white text-slate-800 cursor-pointer"
                    >
                      <option value="">-- Choose a standard question to load & customize --</option>
                      {allQuestions.map(q => (
                        <option key={q.id} value={q.id}>
                          {q.question_text.length > 80 ? q.question_text.slice(0, 80) + '...' : q.question_text}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Question Title */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Question Title / Text *</label>
                  <textarea
                    rows={2}
                    value={qFormTitle}
                    onChange={(e) => setQFormTitle(e.target.value)}
                    placeholder="e.g. LGV Key Control: Keys secured from driver?"
                    className="w-full p-3 border border-slate-200 rounded-xl font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* Hint / Help text */}
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 block">Hint / Guidance for Auditor (Optional)</label>
                  <input
                    type="text"
                    value={qFormHint}
                    onChange={(e) => setQFormHint(e.target.value)}
                    placeholder="e.g. LGV keys must be kept with the MHE operator during loading."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>

                {/* Answer Type */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-700 block">Answer Type</label>
                    <select
                      value={qFormAnswerType}
                      onChange={(e) => setQFormAnswerType(e.target.value as AnswerType)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
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

                  {['single_choice', 'boolean', 'multiple_choice'].includes(qFormAnswerType) && (
                    <div className="space-y-1">
                      <label className="font-bold text-slate-700 block">Default Options Set</label>
                      <select
                        value={qFormPreset}
                        onChange={(e) => setQFormPreset(e.target.value as any)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl font-medium focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white text-indigo-900"
                      >
                        <option value="pass_fail">Pass / Fail / N/A</option>
                        <option value="yes_no">Yes / No / N/A</option>
                        <option value="compliant">Compliant / Non-Compliant / N/A</option>
                        <option value="none">None (Add custom options later)</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Target Instrument / Tool */}
                <div className="bg-slate-50 p-4 border border-slate-200 rounded-xl space-y-3">
                  <div className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center">
                    <Workflow className="w-3.5 h-3.5 mr-1.5 text-indigo-600" /> Instrument Assignment
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1 sm:col-span-1">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-slate-700 block">Instrument(s) / Tool(s)</label>
                        <button
                          type="button"
                          onClick={() => setQFormIsCreatingTool(!qFormIsCreatingTool)}
                          className="text-[10px] text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                        >
                          {qFormIsCreatingTool ? 'Select Existing' : '+ Create New'}
                        </button>
                      </div>
                      {!qFormIsCreatingTool ? (
                        <MultiSelectEntityDropdown
                          options={tools.map(t => ({ id: t.id, name: t.name }))}
                          selectedIds={qFormToolIds}
                          onChange={setQFormToolIds}
                          placeholder="Select Instrument(s)..."
                          label="Instrument"
                        />
                      ) : (
                        <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1.5 rounded-lg border border-indigo-200">
                          Creating new instrument below...
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 sm:col-span-1">
                      <label className="font-bold text-slate-700 block">Site Area(s)</label>
                      <MultiSelectEntityDropdown
                        options={siteAreas.map(a => ({ id: a.id, name: a.name, code: a.code }))}
                        selectedIds={qFormAreaIds}
                        onChange={setQFormAreaIds}
                        placeholder="Select Area(s)..."
                        label="Site Area"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-1">
                      <label className="font-bold text-slate-700 block">Operation Type(s)</label>
                      <MultiSelectEntityDropdown
                        options={operationTypes.map(o => ({ id: o.id, name: o.name, code: o.code }))}
                        selectedIds={qFormOpTypeIds}
                        onChange={setQFormOpTypeIds}
                        placeholder="Select Operation(s)..."
                        label="Operation Type"
                      />
                    </div>
                  </div>

                  {qFormIsCreatingTool && (
                    <div className="bg-indigo-50/60 border border-indigo-200 rounded-lg p-3 space-y-2">
                      <div className="font-bold text-indigo-900 flex items-center">
                        <Plus className="w-3.5 h-3.5 mr-1 text-indigo-600" /> Define New Instrument Details
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={qFormNewToolName}
                          onChange={(e) => setQFormNewToolName(e.target.value)}
                          placeholder="Instrument Name e.g. Cold Store Inspection"
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs font-semibold"
                        />
                        <input
                          type="text"
                          value={qFormNewToolDesc}
                          onChange={(e) => setQFormNewToolDesc(e.target.value)}
                          placeholder="Optional description..."
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setShowSingleQuestionModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading}
                  onClick={handleSaveSingleQuestion}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-2"
                >
                  {actionLoading ? <span>Saving Question...</span> : <span>Save Question</span>}
                </button>
              </div>

            </div>
          </div>
        )}

        {/* Delete Instrument with Question Preservation Modal */}
        {deleteToolModalOpen && toolToDelete && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
              
              {/* Header */}
              <div className="bg-slate-50 border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="p-2 bg-red-100 text-red-600 rounded-lg">
                    <Trash2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Delete Instrument: {toolToDelete.name}</h3>
                    <p className="text-[11px] text-slate-400">Manage questions and dependencies before deleting this container.</p>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteToolModalOpen(false)}
                  className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4 max-h-[450px] overflow-y-auto">
                <div className="bg-red-50/50 border border-red-150 rounded-xl p-4 space-y-1.5 text-xs text-red-900">
                  <p className="font-bold">⚠️ Warning: Relational Deletion Cascade</p>
                  <p>Deleting this instrument will permanently archive or clear all associated logs, templates, section boundaries, and observation records referencing it. This action is completely irreversible.</p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">
                      Associated Question Bank ({fetchingToolQs ? '...' : toolToDeleteQuestions.length})
                    </h4>
                    {!fetchingToolQs && toolToDeleteQuestions.length > 0 && (
                      <div className="flex items-center space-x-2 text-[11px]">
                        <button
                          type="button"
                          onClick={() => setQuestionsToPreserveIds(toolToDeleteQuestions.map(q => q.id))}
                          className="text-indigo-600 hover:underline font-bold cursor-pointer"
                        >
                          Select All (Save)
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => setQuestionsToPreserveIds([])}
                          className="text-slate-500 hover:underline font-bold cursor-pointer"
                        >
                          Deselect All (Delete)
                        </button>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-xs text-slate-500">
                    Which questions do you want to **PRESERVE** in the library so they can be assigned to other instruments later? Unchecked questions will be permanently deleted.
                  </p>

                  {fetchingToolQs ? (
                    <div className="text-center py-6 text-xs text-slate-400 flex items-center justify-center space-x-2">
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                      <span>Loading associated library metadata...</span>
                    </div>
                  ) : toolToDeleteQuestions.length === 0 ? (
                    <div className="text-center py-6 bg-slate-50 rounded-xl text-xs text-slate-400 italic">
                      No questions are currently associated with this instrument.
                    </div>
                  ) : (
                    <div className="border border-slate-150 rounded-xl overflow-hidden bg-slate-50/30 max-h-56 overflow-y-auto p-1.5 space-y-1">
                      {toolToDeleteQuestions.map(q => {
                        const isPreserved = questionsToPreserveIds.includes(q.id);
                        return (
                          <label
                            key={q.id}
                            className={`flex items-start space-x-3 p-2.5 rounded-lg border transition-all cursor-pointer text-xs ${
                              isPreserved
                                ? 'border-indigo-150 bg-indigo-50/40 font-medium text-slate-900'
                                : 'border-slate-100 bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isPreserved}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setQuestionsToPreserveIds(prev => [...prev, q.id]);
                                } else {
                                  setQuestionsToPreserveIds(prev => prev.filter(id => id !== q.id));
                                }
                              }}
                              className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                            />
                            <div className="flex-1 space-y-0.5">
                              <div className="font-bold flex items-center space-x-1.5">
                                <span className="font-mono text-[9px] bg-slate-200 text-slate-700 px-1 py-0.2 rounded">
                                  {q.question_code}
                                </span>
                                <span className="text-[10px] uppercase font-semibold text-slate-400">
                                  {q.answer_type.replace('_', ' ')}
                                </span>
                              </div>
                              <p className="text-slate-700 line-clamp-2">{q.question_text}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDeleteToolModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={actionLoading || fetchingToolQs}
                  onClick={() => handleDeleteInstrument(toolToDelete.id, questionsToPreserveIds)}
                  className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl shadow-xs cursor-pointer flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin mr-1" />
                      <span>Deleting Instrument...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Confirm and Delete Entire Instrument</span>
                    </>
                  )}
                </button>
              </div>

            </div>
          </div>
        )}
      </div>

    </div>
  );
}
