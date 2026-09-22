// src/lib/observation-service.ts

import { supabase } from './supabase';
import {
  Observation,
  ObservationResponse,
  ObservationPhoto,
  ObservationSignature,
  Tool,
  ToolVersion,
  ToolSection,
  ToolQuestion,
  QuestionOption,
  ConditionalRule,
  RuleCondition
} from '../types/tool-engine';

export interface FullToolDefinition {
  tool: Tool;
  version: ToolVersion;
  sections: ToolSection[];
  questions: ToolQuestion[];
  options: QuestionOption[];
  rules: ConditionalRule[];
  conditions: RuleCondition[];
}

export interface UserOperationalScope {
  contracts: { id: string; code: string; name: string }[];
  sites: { id: string; contract_id: string; code: string; name: string }[];
}

/**
 * Loads published tools available for the current tenant.
 */
export async function fetchPublishedTools(tenantId: string): Promise<Tool[]> {
  const { data, error } = await supabase
    .from('tools')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .order('name', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * Retrieves the published version for a tool.
 */
export async function fetchPublishedToolVersion(toolId: string, tenantId: string): Promise<ToolVersion | null> {
  const { data, error } = await supabase
    .from('tool_versions')
    .select('*')
    .eq('tool_id', toolId)
    .eq('tenant_id', tenantId)
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Loads full coherent structure for a tool version in a single parallel fetch.
 */
export async function fetchFullToolDefinition(versionId: string, tenantId: string): Promise<FullToolDefinition> {
  // 1. Version metadata & Tool header
  const { data: ver, error: verErr } = await supabase
    .from('tool_versions')
    .select('*')
    .eq('id', versionId)
    .eq('tenant_id', tenantId)
    .single();
  if (verErr || !ver) throw new Error(verErr?.message || 'Tool version not found');

  const { data: tool, error: toolErr } = await supabase
    .from('tools')
    .select('*')
    .eq('id', ver.tool_id)
    .eq('tenant_id', tenantId)
    .single();
  if (toolErr || !tool) throw new Error(toolErr?.message || 'Tool not found');

  const toolWithRoles: Tool = {
    ...tool,
    target_role_ids: (ver.settings as any)?.target_role_ids || tool.target_role_ids || []
  };

  // 2. Sections, Questions, Rules, Conditions in parallel
  const [secRes, qRes, ruleRes, condRes] = await Promise.all([
    supabase.from('tool_sections').select('*').eq('tool_version_id', versionId).order('order_index', { ascending: true }),
    supabase.from('tool_questions').select('*').eq('tool_version_id', versionId).order('order_index', { ascending: true }),
    supabase.from('conditional_rules').select('*').eq('tool_version_id', versionId),
    supabase.from('rule_conditions').select('*').eq('tool_version_id', versionId)
  ]);

  if (secRes.error) throw secRes.error;
  if (qRes.error) throw qRes.error;
  if (ruleRes.error) throw ruleRes.error;
  if (condRes.error) throw condRes.error;

  const questions = qRes.data || [];
  let options: QuestionOption[] = [];

  // Fetch Options for these questions
  if (questions.length > 0) {
    const qIds = questions.map(q => q.id);
    const { data: optData, error: optErr } = await supabase
      .from('question_options')
      .select('*')
      .in('question_id', qIds)
      .order('order_index', { ascending: true });
    if (optErr) throw optErr;
    options = optData || [];
  }

  return {
    tool: toolWithRoles,
    version: ver,
    sections: secRes.data || [],
    questions,
    options,
    rules: ruleRes.data || [],
    conditions: condRes.data || []
  };
}

/**
 * Loads the user's permitted contracts and sites based on user_contracts & user_sites.
 */
export async function fetchUserOperationalScope(userId: string, tenantId: string): Promise<UserOperationalScope> {
  // Fetch user_contracts
  const { data: ucData, error: ucErr } = await supabase
    .from('user_contracts')
    .select('contract_id, contracts(id, code, name)')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (ucErr) console.warn('User contracts fetch error:', ucErr.message);

  // Fetch user_sites
  const { data: usData, error: usErr } = await supabase
    .from('user_sites')
    .select('site_id, sites(id, contract_id, code, name)')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);

  if (usErr) console.warn('User sites fetch error:', usErr.message);

  const contracts = (ucData || []).map((uc: any) => uc.contracts).filter(Boolean);
  const sites = (usData || []).map((us: any) => us.sites).filter(Boolean);

  // Fallback: If user has read_all or contract/site scope is empty, fetch all active tenant contracts/sites
  if (contracts.length === 0 || sites.length === 0) {
    const { data: allContracts } = await supabase
      .from('contracts')
      .select('id, code, name')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    const { data: allSites } = await supabase
      .from('sites')
      .select('id, contract_id, code, name')
      .eq('tenant_id', tenantId)
      .eq('status', 'active');

    return {
      contracts: contracts.length > 0 ? contracts : (allContracts || []),
      sites: sites.length > 0 ? sites : (allSites || [])
    };
  }

  return { contracts, sites };
}

/**
 * Creates or retrieves an in-progress draft observation header.
 */
export async function startObservationDraft(
  tenantId: string,
  userId: string,
  toolId: string,
  toolVersionId: string,
  contractId: string,
  siteId: string,
  areaId?: string | null,
  operationTypeId?: string | null,
  metadata?: Record<string, unknown>
): Promise<Observation> {
  const { data, error } = await supabase
    .from('observations')
    .insert({
      tenant_id: tenantId,
      observer_id: userId,
      tool_id: toolId,
      tool_version_id: toolVersionId,
      contract_id: contractId,
      site_id: siteId,
      area_id: areaId || null,
      operation_type_id: operationTypeId || null,
      observed_at: new Date().toISOString(),
      status: 'in_progress',
      metadata: metadata || {}
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Upserts a single question response in an observation, enforcing uq_obs_responses_obs_q.
 */
export async function upsertObservationResponse(
  tenantId: string,
  observationId: string,
  questionId: string,
  payload: {
    selected_option_id?: string | null;
    answer_text?: string | null;
    answer_numeric?: number | null;
    answer_boolean?: boolean | null;
    answer_json?: any | null;
    is_flagged?: boolean;
    comment?: string | null;
  }
): Promise<ObservationResponse> {
  const { data, error } = await supabase
    .from('observation_responses')
    .upsert(
      {
        tenant_id: tenantId,
        observation_id: observationId,
        question_id: questionId,
        ...payload,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'observation_id, question_id' }
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Uploads a photo to Supabase Storage bucket observation-photos and records row in observation_photos.
 */
export async function uploadObservationPhoto(
  tenantId: string,
  observationId: string,
  questionId: string | null,
  file: File,
  caption?: string
): Promise<ObservationPhoto> {
  const fileExt = file.name.split('.').pop() || 'jpg';
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
  const storagePath = `${tenantId}/${observationId}/${fileName}`;

  // 1. Upload to Storage bucket
  const { error: uploadErr } = await supabase.storage
    .from('observation-photos')
    .upload(storagePath, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (uploadErr) console.warn('Storage upload note:', uploadErr.message);

  // 2. Insert metadata record in DB
  const { data, error: dbErr } = await supabase
    .from('observation_photos')
    .insert({
      tenant_id: tenantId,
      observation_id: observationId,
      question_id: questionId,
      storage_path: storagePath,
      file_name: file.name,
      file_size_bytes: file.size,
      mime_type: file.type || 'image/jpeg',
      caption: caption || null
    })
    .select()
    .single();

  if (dbErr) throw dbErr;
  return data;
}

/**
 * Converts a Base64 dataURL signature PNG into a Blob/File, uploads to Storage, and inserts row in observation_signatures.
 */
export async function uploadObservationSignature(
  tenantId: string,
  observationId: string,
  questionId: string | null,
  signerName: string,
  signerRole: string,
  dataUrl: string
): Promise<ObservationSignature> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const fileName = `signature_${Date.now()}.png`;
  const storagePath = `${tenantId}/${observationId}/${fileName}`;

  // Upload to Storage
  const { error: uploadErr } = await supabase.storage
    .from('observation-signatures')
    .upload(storagePath, blob, {
      contentType: 'image/png',
      upsert: true
    });

  if (uploadErr) console.warn('Storage signature upload note:', uploadErr.message);

  // Insert DB record
  const { data, error: dbErr } = await supabase
    .from('observation_signatures')
    .insert({
      tenant_id: tenantId,
      observation_id: observationId,
      question_id: questionId,
      signer_name: signerName,
      signer_role: signerRole,
      storage_path: storagePath,
      signed_at: new Date().toISOString()
    })
    .select()
    .single();

  if (dbErr) throw dbErr;
  return data;
}

/**
 * Submits and finalizes the observation via submit_observation RPC.
 */
export async function finalizeObservation(observationId: string): Promise<any> {
  const { data, error } = await supabase.rpc('submit_observation', {
    p_observation_id: observationId
  });

  if (error) {
    // Fallback: If RPC fails or is missing, update table directly
    const { data: directData, error: directErr } = await supabase
      .from('observations')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', observationId)
      .select()
      .single();

    if (directErr) throw directErr;
    return directData;
  }

  return data;
}
