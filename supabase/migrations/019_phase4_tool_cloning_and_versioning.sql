-- supabase/migrations/019_phase4_tool_cloning_and_versioning.sql

CREATE OR REPLACE FUNCTION public.clone_tool_version(
    p_version_id UUID,
    p_created_by UUID
)
RETURNS UUID AS $$
DECLARE
    v_source_tool_id UUID;
    v_tenant_id UUID;
    v_next_version INT;
    v_new_version_id UUID;
    v_instructions TEXT;
    v_settings JSONB;
    
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
    -- 1. Fetch source version metadata
    SELECT tool_id, tenant_id, instructions, settings
    INTO v_source_tool_id, v_tenant_id, v_instructions, v_settings
    FROM public.tool_versions
    WHERE id = p_version_id;
    
    IF v_source_tool_id IS NULL THEN
        RAISE EXCEPTION 'Tool version with ID % not found', p_version_id;
    END IF;

    -- 2. Calculate next version number
    SELECT COALESCE(MAX(version_number), 0) + 1
    INTO v_next_version
    FROM public.tool_versions
    WHERE tool_id = v_source_tool_id;

    -- 3. Create new draft version
    INSERT INTO public.tool_versions (
        tool_id,
        tenant_id,
        version_number,
        status,
        instructions,
        settings
    ) VALUES (
        v_source_tool_id,
        v_tenant_id,
        v_next_version,
        'draft',
        v_instructions,
        v_settings
    ) RETURNING id INTO v_new_version_id;

    -- 4. Create temporary tracking tables to map old UUIDs to new UUIDs
    CREATE TEMP TABLE temp_sec_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;
    CREATE TEMP TABLE temp_q_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;
    CREATE TEMP TABLE temp_rule_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;

    -- 5. Deep clone Tool Sections
    FOR r_sec IN 
        SELECT id, title, description, order_index 
        FROM public.tool_sections 
        WHERE tool_version_id = p_version_id
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
            v_tenant_id,
            r_sec.title,
            r_sec.description,
            r_sec.order_index
        );
        
        INSERT INTO temp_sec_map (old_id, new_id) VALUES (r_sec.id, v_new_sec_id);
    END LOOP;

    -- 6. Deep clone Tool Questions
    FOR r_q IN 
        SELECT id, section_id, question_code, question_text, hint_text, answer_type, is_required, order_index, metadata
        FROM public.tool_questions 
        WHERE tool_version_id = p_version_id
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
            v_tenant_id,
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

    -- 7. Deep clone Question Options
    FOR r_opt IN 
        SELECT id, question_id, label, value, score, is_flagged, order_index
        FROM public.question_options
        WHERE tenant_id = v_tenant_id
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
            v_tenant_id,
            r_opt.label,
            r_opt.value,
            r_opt.score,
            r_opt.is_flagged,
            r_opt.order_index
        );
    END LOOP;

    -- 8. Deep clone Conditional Rules
    FOR r_rule IN 
        SELECT id, target_type, target_id, action, logical_operator
        FROM public.conditional_rules
        WHERE tool_version_id = p_version_id
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
            v_tenant_id,
            r_rule.target_type,
            v_mapped_target_id,
            r_rule.action,
            r_rule.logical_operator
        );
        
        INSERT INTO temp_rule_map (old_id, new_id) VALUES (r_rule.id, v_new_rule_id);
    END LOOP;

    -- 9. Deep clone Rule Conditions
    FOR r_cond IN 
        SELECT id, rule_id, source_question_id, comparison_operator, expected_value
        FROM public.rule_conditions
        WHERE tool_version_id = p_version_id
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
            v_tenant_id,
            v_mapped_src_q_id,
            r_cond.comparison_operator,
            r_cond.expected_value
        );
    END LOOP;

    -- 10. Audit Logging
    INSERT INTO public.audit_logs (
        tenant_id,
        user_id,
        action,
        target_type,
        target_id,
        payload_after
    ) VALUES (
        v_tenant_id,
        p_created_by,
        'tool_version.clone',
        'tool_versions',
        v_new_version_id,
        jsonb_build_object(
            'source_version_id', p_version_id,
            'tool_id', v_source_tool_id,
            'new_version_number', v_next_version
        )
    );

    RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
