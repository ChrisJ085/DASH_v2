-- supabase/migrations/011_rls.sql

-- Enable Row-Level Security on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conditional_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_conditions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tool_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.observation_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 1. tenants
-- =========================================================================
CREATE POLICY select_tenants ON public.tenants
    FOR SELECT USING (
        id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_tenants ON public.tenants
    FOR ALL USING (
        public.has_permission('tenant.manage_settings') OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 2. contracts
-- =========================================================================
CREATE POLICY select_contracts ON public.contracts
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_contracts ON public.contracts
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('tenant.manage_contracts')) OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 3. sites
-- =========================================================================
CREATE POLICY select_sites ON public.sites
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_sites ON public.sites
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('tenant.manage_sites')) OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 4. contract_sites
-- =========================================================================
CREATE POLICY select_contract_sites ON public.contract_sites
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_contract_sites ON public.contract_sites
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('tenant.map_contract_sites')) OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 5. profiles
-- =========================================================================
CREATE POLICY select_profiles ON public.profiles
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        id = auth.uid() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY insert_profiles ON public.profiles
    FOR INSERT WITH CHECK (
        id = auth.uid() OR 
        public.has_permission('users.invite') OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY update_profiles ON public.profiles
    FOR UPDATE USING (
        id = auth.uid() OR 
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.manage_status')) OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 6. roles
-- =========================================================================
CREATE POLICY select_roles ON public.roles
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        tenant_id IS NULL OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_roles ON public.roles
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_roles')) OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 7. permissions
-- =========================================================================
CREATE POLICY select_permissions ON public.permissions
    FOR SELECT USING (true); -- Authenticated users can read the catalog

CREATE POLICY modify_permissions ON public.permissions
    FOR ALL USING (public.has_permission('platform.manage'));

-- =========================================================================
-- 8. role_permissions
-- =========================================================================
CREATE POLICY select_role_permissions ON public.role_permissions
    FOR SELECT USING (true); -- Associated through role SELECT policy

CREATE POLICY modify_role_permissions ON public.role_permissions
    FOR ALL USING (
        public.has_permission('tenant.manage_settings') OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 9. user_roles
-- =========================================================================
CREATE POLICY select_user_roles ON public.user_roles
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_user_roles ON public.user_roles
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_roles')) OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 10. user_contracts & user_sites
-- =========================================================================
CREATE POLICY select_user_contracts ON public.user_contracts
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_user_contracts ON public.user_contracts
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_scopes')) OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY select_user_sites ON public.user_sites
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_user_sites ON public.user_sites
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('users.assign_scopes')) OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 11. tools, tool_versions, sections, questions, and options
-- =========================================================================
CREATE POLICY select_tools ON public.tools
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_tools ON public.tools
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND (
            public.has_permission('tools.create') OR 
            public.has_permission('tools.edit_draft') OR 
            public.has_permission('tools.publish') OR 
            public.has_permission('tools.archive')
        )) OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY select_tool_versions ON public.tool_versions
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY modify_tool_versions ON public.tool_versions
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND (
            public.has_permission('tools.create') OR 
            public.has_permission('tools.edit_draft') OR 
            public.has_permission('tools.publish')
        )) OR 
        public.has_permission('platform.manage')
    );

-- Child tables cascade viewability based on parent version SELECT
CREATE POLICY select_tool_sections ON public.tool_sections
    FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY modify_tool_sections ON public.tool_sections
    FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission('tools.edit_draft'));

CREATE POLICY select_tool_questions ON public.tool_questions
    FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY modify_tool_questions ON public.tool_questions
    FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission('tools.edit_draft'));

CREATE POLICY select_question_options ON public.question_options
    FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY modify_question_options ON public.question_options
    FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission('tools.edit_draft'));

-- =========================================================================
-- 12. conditional_rules & rule_conditions
-- =========================================================================
CREATE POLICY select_conditional_rules ON public.conditional_rules
    FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY modify_conditional_rules ON public.conditional_rules
    FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission('tools.edit_draft'));

CREATE POLICY select_rule_conditions ON public.rule_conditions
    FOR SELECT USING (tenant_id = public.current_tenant_id());

CREATE POLICY modify_rule_conditions ON public.rule_conditions
    FOR ALL USING (tenant_id = public.current_tenant_id() AND public.has_permission('tools.edit_draft'));

-- =========================================================================
-- 13. tool_templates
-- =========================================================================
CREATE POLICY select_tool_templates ON public.tool_templates
    FOR SELECT USING (
        visibility = 'platform_public' OR 
        tenant_id = public.current_tenant_id() OR 
        (visibility = 'tenant_shared' AND tenant_id = public.current_tenant_id())
    );

CREATE POLICY modify_tool_templates ON public.tool_templates
    FOR ALL USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('templates.export')) OR 
        public.has_permission('platform.manage')
    );

-- =========================================================================
-- 14. observations
-- =========================================================================
CREATE POLICY select_observations ON public.observations
    FOR SELECT USING (
        tenant_id = public.current_tenant_id() AND (
            public.has_permission('observations.read_all') OR 
            (public.has_permission('observations.read_scoped') AND public.has_operational_scope(contract_id, site_id)) OR 
            (public.has_permission('observations.read_own') AND observer_id = auth.uid())
        )
    );

CREATE POLICY insert_observations ON public.observations
    FOR INSERT WITH CHECK (
        tenant_id = public.current_tenant_id() AND 
        public.has_permission('observations.create') AND 
        public.has_operational_scope(contract_id, site_id)
    );

CREATE POLICY update_observations ON public.observations
    FOR UPDATE USING (
        tenant_id = public.current_tenant_id() AND 
        public.has_permission('observations.edit_in_progress') AND 
        public.has_operational_scope(contract_id, site_id) AND 
        status = 'in_progress'
    );

CREATE POLICY delete_observations ON public.observations
    FOR DELETE USING (
        tenant_id = public.current_tenant_id() AND 
        public.has_permission('observations.delete')
    );

-- =========================================================================
-- 15. observation_responses, photos & signatures (Cascade via parent observation)
-- =========================================================================
CREATE POLICY select_observation_responses ON public.observation_responses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id
        )
    );

CREATE POLICY insert_observation_responses ON public.observation_responses
    FOR INSERT WITH CHECK (
        tenant_id = public.current_tenant_id() AND 
        public.has_permission('observations.create') AND 
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id AND o.status = 'in_progress'
        )
    );

CREATE POLICY update_observation_responses ON public.observation_responses
    FOR UPDATE USING (
        tenant_id = public.current_tenant_id() AND 
        public.has_permission('observations.edit_in_progress') AND 
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id AND o.status = 'in_progress'
        )
    );

-- Photos
CREATE POLICY select_observation_photos ON public.observation_photos
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id
        )
    );

CREATE POLICY modify_observation_photos ON public.observation_photos
    FOR ALL USING (
        tenant_id = public.current_tenant_id() AND 
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id AND o.status = 'in_progress'
        )
    );

-- Signatures
CREATE POLICY select_observation_signatures ON public.observation_signatures
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id
        )
    );

CREATE POLICY modify_observation_signatures ON public.observation_signatures
    FOR ALL USING (
        tenant_id = public.current_tenant_id() AND 
        EXISTS (
            SELECT 1 FROM public.observations o 
            WHERE o.id = observation_id AND o.status = 'in_progress'
        )
    );

-- =========================================================================
-- 16. audit_logs
-- =========================================================================
CREATE POLICY select_audit_logs ON public.audit_logs
    FOR SELECT USING (
        (tenant_id = public.current_tenant_id() AND public.has_permission('audit.read')) OR 
        public.has_permission('platform.manage')
    );

CREATE POLICY insert_audit_logs ON public.audit_logs
    FOR INSERT WITH CHECK (true); -- Logging should always be allowed by the system

-- Update & Delete are explicitly forbidden (no policy means default deny)
