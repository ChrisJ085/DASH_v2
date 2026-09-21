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
  HelpCircle
} from 'lucide-react';
import {
  Tool,
  ToolVersion,
  ToolSection,
  ToolQuestion,
  QuestionOption,
  ConditionalRule,
  RuleCondition,
  AnswerType,
  ToolStatus
} from '../types/tool-engine';
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
  // 'tool_settings' | 'section' | 'question' | 'rules' | 'preview'
  const [workspaceMode, setWorkspaceMode] = useState<'tool_settings' | 'hierarchy' | 'rules' | 'preview'>('tool_settings');

  // Currently focused element for editing in sidebar/panels
  const [editingSection, setEditingSection] = useState<ToolSection | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<ToolQuestion | null>(null);
  
  // UI creation state modals
  const [showCreateTool, setShowCreateTool] = useState(false);
  const [newToolName, setNewToolName] = useState('');
  const [newToolDesc, setNewToolDesc] = useState('');
  const [newToolCategory, setNewToolCategory] = useState('safety');

  // Action pending loaders
  const [actionLoading, setActionLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationSuccess, setValidationSuccess] = useState<string | null>(null);

  // Mock answers for preview mode
  const [mockAnswers, setMockAnswers] = useState<Record<string, any>>({});

  // Fetch initial tools list
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
      setTools(data || []);
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
      return;
    }
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
          settings: {}
        })
        .select()
        .single();

      if (verErr) throw verErr;

      setTools(prev => [...prev, toolData]);
      setSelectedTool(toolData);
      setSelectedVersion(verData);
      
      // Track Action in Audit Logs
      await supabase.from('audit_logs').insert({
        tenant_id: profile.tenant_id,
        user_id: profile.id,
        action: 'tool.create',
        target_type: 'tools',
        target_id: toolData.id,
        payload_after: { name: newToolName, category: newToolCategory }
      });

      // Reset Create form
      setNewToolName('');
      setNewToolDesc('');
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
      const { error: delErr } = await supabase
        .from('tool_sections')
        .delete()
        .eq('id', secId);

      if (delErr) throw delErr;

      setSections(prev => prev.filter(s => s.id !== secId));
      setQuestions(prev => prev.filter(q => q.section_id !== secId));
      if (editingSection?.id === secId) setEditingSection(null);
    } catch (err) {
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
    if (!isEditable) return;
    if (!confirm('Are you sure you want to delete this question?')) return;
    try {
      const { error: delErr } = await supabase
        .from('tool_questions')
        .delete()
        .eq('id', qId);

      if (delErr) throw delErr;

      setQuestions(prev => prev.filter(q => q.id !== qId));
      setOptions(prev => prev.filter(opt => opt.question_id !== qId));
      if (editingQuestion?.id === qId) setEditingQuestion(null);
    } catch (err) {
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
              return (
                <button
                  key={t.id}
                  onClick={() => {
                    setSelectedTool(t);
                    setWorkspaceMode('tool_settings');
                  }}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
                    isSel 
                      ? 'bg-slate-900 text-white shadow-xs' 
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="truncate">{t.name}</span>
                  <span className="text-[9px] uppercase font-mono tracking-wider opacity-60 ml-2">
                    {t.category}
                  </span>
                </button>
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

      {/* 2. Middle Outline Structure Tree Column (2cols on Desktop) */}
      <div className="lg:col-span-2 space-y-6">
        {selectedTool && selectedVersion ? (
          <div className="bg-white border border-slate-200 rounded-xl shadow-2xs overflow-hidden flex flex-col">
            
            {/* Outline Header Tabs */}
            <div className="bg-slate-50 border-b border-slate-200 px-4 py-2 flex items-center justify-between">
              <div className="flex space-x-1">
                {[
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
              
              {/* VIEW A: Tool & Version Metadata Settings */}
              {workspaceMode === 'tool_settings' && (
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
                      <button
                        onClick={handleAddSection}
                        className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors flex items-center shadow-xs"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" /> Add Section
                      </button>
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
                                  <button
                                    onClick={() => handleAddQuestion(sec.id)}
                                    className="p-1 hover:bg-slate-200 text-indigo-700 rounded transition-colors cursor-pointer"
                                    title="Add Question to Section"
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
                                return (
                                  <div key={q.id} className="p-4 space-y-3 hover:bg-slate-50/40 transition-colors">
                                    <div className="flex items-start justify-between">
                                      <div className="space-y-1">
                                        <div className="flex items-center space-x-2">
                                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                                            {q.question_code}
                                          </span>
                                          <span className="text-[10px] font-mono font-bold text-indigo-700 uppercase tracking-wider">
                                            {q.answer_type}
                                          </span>
                                          {q.is_required && (
                                            <span className="text-[9px] font-bold text-red-500 uppercase">Required</span>
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
                      <h2 className="text-base font-bold text-slate-900">{selectedTool.name}</h2>
                      {selectedTool.description && (
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

        {/* Create Tool Drawer Modal inside panel */}
        {showCreateTool && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                Create New Instrument
              </h3>
              <button
                onClick={() => setShowCreateTool(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Name</label>
                <input
                  type="text"
                  placeholder="e.g. Forklift Pre-Use"
                  value={newToolName}
                  onChange={(e) => setNewToolName(e.target.value)}
                  className="w-full text-xs font-semibold border border-slate-200 rounded p-2 text-slate-900 bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Description</label>
                <textarea
                  placeholder="e.g. Conducted daily by operator"
                  value={newToolDesc}
                  rows={2}
                  onChange={(e) => setNewToolDesc(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded p-2 text-slate-900 bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase text-slate-500">Category</label>
                <select
                  value={newToolCategory}
                  onChange={(e) => setNewToolCategory(e.target.value)}
                  className="w-full text-xs border border-slate-200 rounded p-2 bg-white text-slate-700 font-semibold"
                >
                  <option value="safety">Safety Observation</option>
                  <option value="audit">Safety Audit</option>
                  <option value="inspection">Facility Inspection</option>
                  <option value="risk_assessment">Risk Assessment</option>
                </select>
              </div>

              <button
                onClick={handleCreateTool}
                disabled={actionLoading || !newToolName.trim()}
                className="w-full text-center py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer transition-colors"
              >
                Create Instrument Container & V1
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
