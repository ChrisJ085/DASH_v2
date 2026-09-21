// src/lib/rule-evaluation.ts

export type AnswerType = 
  | 'single_choice' 
  | 'multiple_choice' 
  | 'boolean' 
  | 'text' 
  | 'number' 
  | 'date' 
  | 'time' 
  | 'photo' 
  | 'signature' 
  | 'rating';

export interface Question {
  id: string;
  section_id: string;
  tool_version_id: string;
  question_code: string;
  question_text: string;
  hint_text?: string | null;
  answer_type: AnswerType;
  is_required: boolean;
  order_index: number;
}

export interface Section {
  id: string;
  tool_version_id: string;
  title: string;
  description?: string | null;
  order_index: number;
}

export interface ConditionalRule {
  id: string;
  tool_version_id: string;
  target_type: 'question' | 'section';
  target_id: string;
  action: 'show' | 'hide' | 'require';
  logical_operator: 'AND' | 'OR';
}

export interface RuleCondition {
  id: string;
  rule_id: string;
  tool_version_id?: string;
  source_question_id: string;
  comparison_operator: 'equals' | 'not_equals' | 'in' | 'not_in' | 'greater_than' | 'less_than' | 'is_empty' | 'is_not_empty';
  expected_value: any; // Can be JSON / parsed
}

export interface EvaluationResult {
  visibleQuestions: Set<string>; // Set of question_ids
  visibleSections: Set<string>;   // Set of section_ids
  requiredQuestions: Set<string>;  // Set of question_ids
}

/**
 * Checks if a value is empty (unanswered).
 */
export function isAnswerEmpty(val: any): boolean {
  if (val === undefined || val === null || val === '') return true;
  if (Array.isArray(val) && val.length === 0) return true;
  if (typeof val === 'object' && Object.keys(val).length === 0) return true;
  return false;
}

/**
 * Evaluates a single rule condition against the given answers.
 */
export function evaluateCondition(cond: RuleCondition, answers: Record<string, any>): boolean {
  const answer = answers[cond.source_question_id];
  const op = cond.comparison_operator;
  
  // Safely parse expected value if it comes as a JSON string or already parsed
  let expected = cond.expected_value;
  if (typeof expected === 'string') {
    try {
      expected = JSON.parse(expected);
    } catch {
      // Keep as string
    }
  }

  // Handle empty checks
  if (op === 'is_empty') {
    return isAnswerEmpty(answer);
  }
  if (op === 'is_not_empty') {
    return !isAnswerEmpty(answer);
  }

  // If answer is missing or empty, other checks are FALSE
  if (isAnswerEmpty(answer)) {
    return false;
  }

  switch (op) {
    case 'equals': {
      // Cast both to string/boolean for soft comparison
      if (typeof answer === 'boolean' || typeof expected === 'boolean') {
        const bAns = answer === true || String(answer).toLowerCase() === 'true';
        const bExp = expected === true || String(expected).toLowerCase() === 'true';
        return bAns === bExp;
      }
      return String(answer).toLowerCase() === String(expected).toLowerCase();
    }
    case 'not_equals': {
      if (typeof answer === 'boolean' || typeof expected === 'boolean') {
        const bAns = answer === true || String(answer).toLowerCase() === 'true';
        const bExp = expected === true || String(expected).toLowerCase() === 'true';
        return bAns !== bExp;
      }
      return String(answer).toLowerCase() !== String(expected).toLowerCase();
    }
    case 'in': {
      const arr = Array.isArray(expected) ? expected : [expected];
      const stringArr = arr.map(val => String(val).toLowerCase());
      if (Array.isArray(answer)) {
        return answer.some(ans => stringArr.includes(String(ans).toLowerCase()));
      }
      return stringArr.includes(String(answer).toLowerCase());
    }
    case 'not_in': {
      const arr = Array.isArray(expected) ? expected : [expected];
      const stringArr = arr.map(val => String(val).toLowerCase());
      if (Array.isArray(answer)) {
        return !answer.some(ans => stringArr.includes(String(ans).toLowerCase()));
      }
      return !stringArr.includes(String(answer).toLowerCase());
    }
    case 'greater_than': {
      return Number(answer) > Number(expected);
    }
    case 'less_than': {
      return Number(answer) < Number(expected);
    }
    default:
      return false;
  }
}

/**
 * Reusable evaluation service for computing visibility and requiredness of questions/sections.
 */
export function evaluateToolVisibility(
  sections: Section[],
  questions: Question[],
  rules: ConditionalRule[],
  conditions: RuleCondition[],
  answers: Record<string, any>
): EvaluationResult {
  
  // 1. Initially, assume all elements are visible UNLESS they are target of a SHOW rule.
  // If target of a SHOW rule, they start as HIDDEN.
  // If target of a HIDE rule, they start as VISIBLE.
  const showRuleTargets = new Set<string>();
  for (const r of rules) {
    if (r.action === 'show') {
      showRuleTargets.add(r.target_id);
    }
  }

  const initiallyVisibleSections = new Set<string>(
    sections.map(s => s.id).filter(id => !showRuleTargets.has(id))
  );
  const initiallyVisibleQuestions = new Set<string>(
    questions.map(q => q.id).filter(id => !showRuleTargets.has(id))
  );

  // Group conditions by rule ID
  const condsByRule: Record<string, RuleCondition[]> = {};
  for (const c of conditions) {
    if (!condsByRule[c.rule_id]) {
      condsByRule[c.rule_id] = [];
    }
    condsByRule[c.rule_id].push(c);
  }

  // Evaluate each rule
  const ruleEvaluation: Record<string, boolean> = {};
  for (const rule of rules) {
    const ruleConds = condsByRule[rule.id] || [];
    if (ruleConds.length === 0) {
      // Rule with no conditions is always true
      ruleEvaluation[rule.id] = true;
      continue;
    }

    const results = ruleConds.map(c => evaluateCondition(c, answers));
    if (rule.logical_operator === 'OR') {
      ruleEvaluation[rule.id] = results.some(res => res === true);
    } else {
      ruleEvaluation[rule.id] = results.every(res => res === true);
    }
  }

  // Apply visibility rules (SHOW and HIDE)
  const visibleSections = new Set<string>(initiallyVisibleSections);
  const visibleQuestions = new Set<string>(initiallyVisibleQuestions);

  // A. Process SHOW rules: If rule evaluates to true, add to visible set
  for (const r of rules) {
    if (r.action === 'show' && ruleEvaluation[r.id]) {
      if (r.target_type === 'section') {
        visibleSections.add(r.target_id);
      } else {
        visibleQuestions.add(r.target_id);
      }
    }
  }

  // B. Process HIDE rules: If rule evaluates to true, subtract from visible set (HIDE overrides SHOW)
  for (const r of rules) {
    if (r.action === 'hide' && ruleEvaluation[r.id]) {
      if (r.target_type === 'section') {
        visibleSections.delete(r.target_id);
      } else {
        visibleQuestions.delete(r.target_id);
      }
    }
  }

  // C. Prune questions that are inside a hidden section
  const sectionIds = new Set(sections.map(s => s.id));
  const questionMap = new Map<string, Question>(questions.map(q => [q.id, q]));
  
  for (const qId of Array.from(visibleQuestions)) {
    const q = questionMap.get(qId);
    if (q && sectionIds.has(q.section_id) && !visibleSections.has(q.section_id)) {
      visibleQuestions.delete(qId);
    }
  }

  // D. Evaluate Requiredness
  // Start with questions statically marked as required, but only if they are visible
  const requiredQuestions = new Set<string>();
  for (const q of questions) {
    if (q.is_required && visibleQuestions.has(q.id)) {
      requiredQuestions.add(q.id);
    }
  }

  // Process REQUIRE rules
  for (const r of rules) {
    if (r.action === 'require' && r.target_type === 'question') {
      if (ruleEvaluation[r.id] && visibleQuestions.has(r.target_id)) {
        requiredQuestions.add(r.target_id);
      }
    }
  }

  return {
    visibleQuestions,
    visibleSections,
    requiredQuestions
  };
}

/**
 * Cycle detection in the dependency graph to prevent circular dependencies.
 * Graph vertices are sections and questions.
 * Edges represent dependency: source_question -> target_id (question/section).
 */
export function detectCircularDependencies(
  questions: { id: string }[],
  rules: { target_id: string; target_type: string }[],
  conditions: { rule_id: string; source_question_id: string }[]
): { hasCycle: boolean; path: string[] } {
  // Map rule_id to its target_id
  const ruleToTarget = new Map<string, string>();
  for (const r of rules) {
    ruleToTarget.set((r as any).id || '', r.target_id);
  }

  // Build Adjacency List: source_question_id -> target_id
  const adj = new Map<string, Set<string>>();
  const allNodes = new Set<string>();

  for (const q of questions) {
    allNodes.add(q.id);
  }

  for (const cond of conditions) {
    const targetId = ruleToTarget.get(cond.rule_id);
    if (targetId) {
      allNodes.add(cond.source_question_id);
      allNodes.add(targetId);

      if (!adj.has(cond.source_question_id)) {
        adj.set(cond.source_question_id, new Set<string>());
      }
      adj.get(cond.source_question_id)!.add(targetId);
    }
  }

  // Cycle detection with DFS
  const visited = new Map<string, 'unvisited' | 'visiting' | 'visited'>();
  for (const node of allNodes) {
    visited.set(node, 'unvisited');
  }

  const path: string[] = [];

  function dfs(u: string): boolean {
    visited.set(u, 'visiting');
    path.push(u);

    const neighbors = adj.get(u);
    if (neighbors) {
      for (const v of neighbors) {
        if (visited.get(v) === 'visiting') {
          path.push(v);
          return true; // Cycle found
        } else if (visited.get(v) === 'unvisited') {
          if (dfs(v)) return true;
        }
      }
    }

    visited.set(u, 'visited');
    path.pop();
    return false;
  }

  for (const node of allNodes) {
    if (visited.get(node) === 'unvisited') {
      if (dfs(node)) {
        return { hasCycle: true, path };
      }
    }
  }

  return { hasCycle: false, path: [] };
}
