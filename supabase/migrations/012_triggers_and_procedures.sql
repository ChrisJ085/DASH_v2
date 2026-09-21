-- supabase/migrations/012_triggers_and_procedures.sql

-- =========================================================================
-- 1. Tool Version Immutability Trigger & Functions
-- =========================================================================

CREATE OR REPLACE FUNCTION public.check_tool_version_immutability()
RETURNS TRIGGER AS $$
DECLARE
    v_status TEXT;
    v_version_id UUID;
BEGIN
    -- A. Fired on tool_versions directly
    IF TG_TABLE_NAME = 'tool_versions' THEN
        IF TG_OP = 'DELETE' THEN
            IF OLD.status IN ('published', 'archived') THEN
                RAISE EXCEPTION 'Cannot delete a published or archived tool version';
            END IF;
            RETURN OLD;
        ELSIF TG_OP = 'UPDATE' THEN
            IF OLD.status = 'archived' THEN
                RAISE EXCEPTION 'Cannot update an archived tool version';
            END IF;
            
            IF OLD.status = 'published' THEN
                -- Only ALLOW status transitioning to 'archived', reject any other column edits!
                IF NEW.status = 'archived' AND 
                   NEW.id = OLD.id AND 
                   NEW.tool_id = OLD.tool_id AND 
                   NEW.tenant_id = OLD.tenant_id AND 
                   NEW.version_number = OLD.version_number AND 
                   NEW.instructions IS NOT DISTINCT FROM OLD.instructions AND 
                   NEW.settings IS NOT DISTINCT FROM OLD.settings THEN
                    RETURN NEW;
                ELSE
                    RAISE EXCEPTION 'Published tool versions are immutable. Only status can transition from published to archived.';
                END IF;
            END IF;
        END IF;
        RETURN NEW;
    
    -- B. Fired on child tables (tool_sections, tool_questions, question_options, conditional_rules, rule_conditions)
    ELSE
        IF TG_OP = 'DELETE' THEN
            IF TG_TABLE_NAME = 'question_options' THEN
                SELECT tool_version_id INTO v_version_id FROM public.tool_questions WHERE id = OLD.question_id;
            ELSIF TG_TABLE_NAME = 'rule_conditions' THEN
                SELECT tool_version_id INTO v_version_id FROM public.conditional_rules WHERE id = OLD.rule_id;
            ELSE
                v_version_id := OLD.tool_version_id;
            END IF;
        ELSE
            IF TG_TABLE_NAME = 'question_options' THEN
                SELECT tool_version_id INTO v_version_id FROM public.tool_questions WHERE id = NEW.question_id;
            ELSIF TG_TABLE_NAME = 'rule_conditions' THEN
                SELECT tool_version_id INTO v_version_id FROM public.conditional_rules WHERE id = NEW.rule_id;
            ELSE
                v_version_id := NEW.tool_version_id;
            END IF;
        END IF;

        IF v_version_id IS NOT NULL THEN
            SELECT status INTO v_status FROM public.tool_versions WHERE id = v_version_id;
            IF v_status IN ('published', 'archived') THEN
                RAISE EXCEPTION 'Cannot modify or delete child records of a published or archived tool version (Table: %)', TG_TABLE_NAME;
            END IF;
        END IF;
        
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bind Immutability Trigger to relevant tables
CREATE TRIGGER tr_tool_versions_immutability
    BEFORE UPDATE OR DELETE ON public.tool_versions
    FOR EACH ROW EXECUTE FUNCTION public.check_tool_version_immutability();

CREATE TRIGGER tr_tool_sections_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.tool_sections
    FOR EACH ROW EXECUTE FUNCTION public.check_tool_version_immutability();

CREATE TRIGGER tr_tool_questions_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.tool_questions
    FOR EACH ROW EXECUTE FUNCTION public.check_tool_version_immutability();

CREATE TRIGGER tr_question_options_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.question_options
    FOR EACH ROW EXECUTE FUNCTION public.check_tool_version_immutability();

CREATE TRIGGER tr_conditional_rules_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.conditional_rules
    FOR EACH ROW EXECUTE FUNCTION public.check_tool_version_immutability();

CREATE TRIGGER tr_rule_conditions_immutability
    BEFORE INSERT OR UPDATE OR DELETE ON public.rule_conditions
    FOR EACH ROW EXECUTE FUNCTION public.check_tool_version_immutability();


-- =========================================================================
-- 2. Template Adoption Stored Procedure
-- =========================================================================

CREATE OR REPLACE FUNCTION public.tools_adopt_template(
    p_template_id UUID,
    p_tenant_id UUID,
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_source_version_id UUID;
    v_template_name TEXT;
    v_template_desc TEXT;
    v_template_cat TEXT;
    
    v_new_tool_id UUID;
    v_new_version_id UUID;
    v_source_tv_instructions TEXT;
    v_source_tv_settings JSONB;
    
    -- cursors and records for copying
    r_sec RECORD;
    r_q RECORD;
    r_opt RECORD;
    r_rule RECORD;
    r_cond RECORD;
    
    v_new_sec_id UUID;
    v_new_q_id UUID;
    v_new_rule_id UUID;
    v_mapped_target_id UUID;
    v_mapped_src_q_id UUID;
BEGIN
    -- 1. Fetch template metadata
    SELECT source_tool_version_id, name, description, category
    INTO v_source_version_id, v_template_name, v_template_desc, v_template_cat
    FROM public.tool_templates
    WHERE id = p_template_id;
    
    IF v_source_version_id IS NULL THEN
        RAISE EXCEPTION 'Template with ID % not found', p_template_id;
    END IF;

    -- 2. Insert new Tool container owned by the adopting tenant
    INSERT INTO public.tools (
        tenant_id,
        name,
        slug,
        description,
        category,
        status,
        created_by
    ) VALUES (
        p_tenant_id,
        v_template_name,
        lower(regexp_replace(v_template_name, '[^a-zA-Z0-9]+', '-', 'g')),
        v_template_desc,
        v_template_cat,
        'active',
        p_created_by
    ) RETURNING id INTO v_new_tool_id;

    -- 3. Fetch source tool version settings
    SELECT instructions, settings
    INTO v_source_tv_instructions, v_source_tv_settings
    FROM public.tool_versions
    WHERE id = v_source_version_id;

    -- 4. Create new version (V1) in draft state
    INSERT INTO public.tool_versions (
        tool_id,
        tenant_id,
        version_number,
        status,
        instructions,
        settings
    ) VALUES (
        v_new_tool_id,
        p_tenant_id,
        1,
        'draft',
        v_source_tv_instructions,
        v_source_tv_settings
    ) RETURNING id INTO v_new_version_id;

    -- 5. Create temporary tracking tables to map old UUIDs to new UUIDs
    CREATE TEMP TABLE temp_sec_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;
    CREATE TEMP TABLE temp_q_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;
    CREATE TEMP TABLE temp_rule_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;

    -- 6. Deep clone Tool Sections
    FOR r_sec IN 
        SELECT id, title, description, order_index 
        FROM public.tool_sections 
        WHERE tool_version_id = v_source_version_id
    LOOP
        v_new_sec_id := gen_random_uuid();
        
        INSERT INTO public.tool_sections (
            id,
            tool_version_id,
            tenant_id,
            title,
            description,
            order_index
        ) VALUES (
            v_new_sec_id,
            v_new_version_id,
            p_tenant_id,
            r_sec.title,
            r_sec.description,
            r_sec.order_index
        );
        
        INSERT INTO temp_sec_map (old_id, new_id) VALUES (r_sec.id, v_new_sec_id);
    END LOOP;

    -- 7. Deep clone Tool Questions
    FOR r_q IN 
        SELECT id, section_id, question_code, question_text, hint_text, answer_type, is_required, order_index, metadata
        FROM public.tool_questions 
        WHERE tool_version_id = v_source_version_id
    LOOP
        v_new_q_id := gen_random_uuid();
        SELECT new_id INTO v_new_sec_id FROM temp_sec_map WHERE old_id = r_q.section_id;
        
        INSERT INTO public.tool_questions (
            id,
            section_id,
            tool_version_id,
            tenant_id,
            question_code,
            question_text,
            hint_text,
            answer_type,
            is_required,
            order_index,
            metadata
        ) VALUES (
            v_new_q_id,
            v_new_sec_id,
            v_new_version_id,
            p_tenant_id,
            r_q.question_code,
            r_q.question_text,
            r_q.hint_text,
            r_q.answer_type,
            r_q.is_required,
            r_q.order_index,
            r_q.metadata
        );
        
        INSERT INTO temp_q_map (old_id, new_id) VALUES (r_q.id, v_new_q_id);
    END LOOP;

    -- 8. Deep clone Question Options
    FOR r_opt IN 
        SELECT id, question_id, label, value, score, is_flagged, order_index
        FROM public.question_options
        WHERE tenant_id = (SELECT tenant_id FROM public.tool_versions WHERE id = v_source_version_id)
          AND question_id IN (SELECT old_id FROM temp_q_map)
    LOOP
        SELECT new_id INTO v_new_q_id FROM temp_q_map WHERE old_id = r_opt.question_id;
        
        INSERT INTO public.question_options (
            question_id,
            tenant_id,
            label,
            value,
            score,
            is_flagged,
            order_index
        ) VALUES (
            v_new_q_id,
            p_tenant_id,
            r_opt.label,
            r_opt.value,
            r_opt.score,
            r_opt.is_flagged,
            r_opt.order_index
        );
    END LOOP;

    -- 9. Deep clone Conditional Rules
    FOR r_rule IN 
        SELECT id, target_type, target_id, action, logical_operator
        FROM public.conditional_rules
        WHERE tool_version_id = v_source_version_id
    LOOP
        v_new_rule_id := gen_random_uuid();
        
        -- Resolve target ID to newly cloned equivalent
        IF r_rule.target_type = 'question' THEN
            SELECT new_id INTO v_mapped_target_id FROM temp_q_map WHERE old_id = r_rule.target_id;
        ELSIF r_rule.target_type = 'section' THEN
            SELECT new_id INTO v_mapped_target_id FROM temp_sec_map WHERE old_id = r_rule.target_id;
        END IF;
        
        INSERT INTO public.conditional_rules (
            id,
            tool_version_id,
            tenant_id,
            target_type,
            target_id,
            action,
            logical_operator
        ) VALUES (
            v_new_rule_id,
            v_new_version_id,
            p_tenant_id,
            r_rule.target_type,
            v_mapped_target_id,
            r_rule.action,
            r_rule.logical_operator
        );
        
        INSERT INTO temp_rule_map (old_id, new_id) VALUES (r_rule.id, v_new_rule_id);
    END LOOP;

    -- 10. Deep clone Rule Conditions
    FOR r_cond IN 
        SELECT id, rule_id, source_question_id, comparison_operator, expected_value
        FROM public.rule_conditions
        WHERE tool_version_id = v_source_version_id
    LOOP
        SELECT new_id INTO v_new_rule_id FROM temp_rule_map WHERE old_id = r_cond.rule_id;
        SELECT new_id INTO v_mapped_src_q_id FROM temp_q_map WHERE old_id = r_cond.source_question_id;
        
        INSERT INTO public.rule_conditions (
            rule_id,
            tool_version_id,
            tenant_id,
            source_question_id,
            comparison_operator,
            expected_value
        ) VALUES (
            v_new_rule_id,
            v_new_version_id,
            p_tenant_id,
            v_mapped_src_q_id,
            r_cond.comparison_operator,
            r_cond.expected_value
        );
    END LOOP;

    RETURN v_new_tool_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
