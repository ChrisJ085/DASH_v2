-- supabase/migrations/006_conditional_rules.sql

-- 1. Conditional Rules
CREATE TABLE public.conditional_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tool_version_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('question', 'section')),
    target_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('show', 'hide', 'require')),
    logical_operator TEXT NOT NULL DEFAULT 'AND' CHECK (logical_operator IN ('AND', 'OR')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_conditional_rules_tenant_id UNIQUE (tenant_id, id),
    CONSTRAINT uq_conditional_rules_version_id UNIQUE (tool_version_id, id),
    CONSTRAINT fk_cr_version FOREIGN KEY (tenant_id, tool_version_id) REFERENCES public.tool_versions(tenant_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_conditional_rules_version ON public.conditional_rules(tool_version_id);
CREATE INDEX idx_conditional_rules_target ON public.conditional_rules(target_type, target_id);

-- 2. Rule Conditions (nested clauses)
CREATE TABLE public.rule_conditions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL,
    tool_version_id UUID NOT NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    source_question_id UUID NOT NULL,
    comparison_operator TEXT NOT NULL CHECK (comparison_operator IN ('equals', 'not_equals', 'in', 'not_in', 'greater_than', 'less_than', 'is_empty', 'is_not_empty')),
    expected_value JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_rc_rule FOREIGN KEY (tool_version_id, rule_id) REFERENCES public.conditional_rules(tool_version_id, id) ON DELETE CASCADE,
    CONSTRAINT fk_rc_source_question FOREIGN KEY (tool_version_id, source_question_id) REFERENCES public.tool_questions(tool_version_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_rule_conditions_rule ON public.rule_conditions(rule_id);
