/**
 * DASH V2 - Tool Engine, Conditional Rules & Observation Types
 * Phase 0 Architecture Definition
 */

export type ToolStatus = 'draft' | 'published' | 'archived';

export interface Tool {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string;
  status: ToolStatus;
  is_template?: boolean;
  origin_template_id?: string | null;
  site_ids?: string[]; // Physical sites
  area_ids?: string[];
  operation_type_ids?: string[];
  target_role_ids?: string[]; // Colleague operational roles this instrument applies to
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export * from './colleague';

export interface ToolTemplate {
  id: string;
  tenant_id: string | null; // NULL for platform-curated global template
  source_tool_version_id: string;
  name: string;
  description: string | null;
  category: string;
  visibility: 'private' | 'tenant_shared' | 'platform_public';
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolVersion {
  id: string;
  tool_id: string;
  tenant_id: string;
  version_number: number;
  status: ToolStatus;
  instructions: string | null;
  settings: Record<string, unknown>;
  published_at: string | null;
  published_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ToolSection {
  id: string;
  tool_version_id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  order_index: number;
  created_at: string;
  updated_at: string;
}

export type AnswerType =
  | 'single_choice'
  | 'multiple_choice'
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'time'
  | 'photo'
  | 'signature'
  | 'rating';

export interface SiteArea {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  code: string;
  description: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface OperationType {
  id: string;
  tenant_id: string;
  site_id: string;
  name: string;
  code: string;
  description: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ToolQuestion {
  id: string;
  section_id: string;
  tool_version_id: string;
  tenant_id: string;
  question_code: string;
  question_text: string;
  hint_text: string | null;
  answer_type: AnswerType;
  is_required: boolean;
  order_index: number;
  area_id?: string | null;
  operation_type_id?: string | null;
  site_ids?: string[];
  area_ids?: string[];
  operation_type_ids?: string[];
  tool_ids?: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  tenant_id: string;
  label: string;
  value: string;
  score: number | null;
  is_flagged: boolean;
  order_index: number;
  created_at: string;
}

export type RuleTargetType = 'question' | 'section';
export type RuleAction = 'show' | 'hide' | 'require';
export type LogicalOperator = 'AND' | 'OR';
export type ComparisonOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty';

export interface ConditionalRule {
  id: string;
  tool_version_id: string;
  tenant_id: string;
  target_type: RuleTargetType;
  target_id: string;
  action: RuleAction;
  logical_operator: LogicalOperator;
  created_at: string;
  updated_at: string;
  conditions?: RuleCondition[];
}

export interface RuleCondition {
  id: string;
  rule_id: string;
  tenant_id: string;
  source_question_id: string;
  comparison_operator: ComparisonOperator;
  expected_value: unknown;
  created_at: string;
}

export type ObservationStatus = 'in_progress' | 'completed' | 'flagged' | 'archived';

export interface Observation {
  id: string;
  tenant_id: string;
  contract_id: string;
  site_id: string;
  area_id?: string | null;
  operation_type_id?: string | null;
  tool_id: string;
  tool_version_id: string;
  observer_id: string;
  observed_at: string;
  status: ObservationStatus;
  score_percentage: number | null;
  has_flagged_items: boolean;
  summary_notes: string | null;
  metadata: Record<string, unknown>;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ObservationResponse {
  id: string;
  observation_id: string;
  question_id: string;
  tenant_id: string;
  selected_option_id: string | null;
  answer_text: string | null;
  answer_numeric: number | null;
  answer_boolean: boolean | null;
  answer_json: unknown | null;
  is_flagged: boolean;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ObservationPhoto {
  id: string;
  observation_id: string;
  question_id: string | null;
  tenant_id: string;
  storage_path: string;
  file_name: string;
  file_size_bytes: number;
  mime_type: string;
  caption: string | null;
  created_at: string;
}

export interface ObservationSignature {
  id: string;
  observation_id: string;
  question_id: string | null;
  tenant_id: string;
  signer_name: string;
  signer_role: string;
  storage_path: string;
  signed_at: string;
  created_at: string;
}
