-- supabase/migrations/014_phase2_auth_tenancy.sql

-- 1. Secure existing helper functions with explicit search paths
CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp;

CREATE OR REPLACE FUNCTION public.has_permission(p_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_platform_admin BOOLEAN;
    v_has_perm BOOLEAN;
BEGIN
    -- 1. Platform Admin bypass (fully system-wide)
    SELECT is_platform_admin INTO v_is_platform_admin 
    FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
    IF v_is_platform_admin IS TRUE THEN
        RETURN TRUE;
    END IF;

    -- 2. Check if user is associated with any active roles carrying this permission
    SELECT EXISTS (
        SELECT 1 
        FROM public.user_roles ur
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = auth.uid() AND p.code = p_code
    ) INTO v_has_perm;

    RETURN v_has_perm;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp;

CREATE OR REPLACE FUNCTION public.has_operational_scope(target_contract_id UUID, target_site_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_is_platform_admin BOOLEAN;
  v_is_tenant_admin BOOLEAN;
  v_has_any_contract_assignment BOOLEAN;
  v_has_any_site_assignment BOOLEAN;
  v_contract_matched BOOLEAN;
  v_site_matched BOOLEAN;
BEGIN
  -- 1. Platform Admin bypass
  SELECT is_platform_admin INTO v_is_platform_admin 
  FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
  IF v_is_platform_admin IS TRUE THEN
    RETURN TRUE;
  END IF;

  -- 2. Tenant Admin bypass
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND r.code = 'tenant_admin'
  ) INTO v_is_tenant_admin;
  IF v_is_tenant_admin IS TRUE THEN
    -- Verify the user actually belongs to the same tenant as the contract/site
    IF EXISTS (
        SELECT 1 FROM public.contract_sites cs
        WHERE cs.contract_id = target_contract_id 
          AND cs.site_id = target_site_id
          AND cs.tenant_id = public.current_tenant_id()
          AND cs.deleted_at IS NULL
    ) THEN
        RETURN TRUE;
    END IF;
    RETURN FALSE;
  END IF;

  -- 3. Verify valid contract-site relationship exists in tenant
  IF NOT EXISTS (
    SELECT 1 FROM public.contract_sites cs
    WHERE cs.contract_id = target_contract_id 
      AND cs.site_id = target_site_id
      AND cs.deleted_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  -- 4. Check user assignments
  SELECT EXISTS (SELECT 1 FROM public.user_contracts WHERE user_id = auth.uid()) INTO v_has_any_contract_assignment;
  SELECT EXISTS (SELECT 1 FROM public.user_sites WHERE user_id = auth.uid()) INTO v_has_any_site_assignment;

  -- If user has no scope assignments whatsoever -> DEFAULT RESTRICTED
  IF NOT v_has_any_contract_assignment AND NOT v_has_any_site_assignment THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_contracts WHERE user_id = auth.uid() AND contract_id = target_contract_id) INTO v_contract_matched;
  SELECT EXISTS (SELECT 1 FROM public.user_sites WHERE user_id = auth.uid() AND site_id = target_site_id) INTO v_site_matched;

  -- Case A: User has BOTH Contract and Site restrictions -> INTERSECTION
  IF v_has_any_contract_assignment AND v_has_any_site_assignment THEN
    RETURN (v_contract_matched AND v_site_matched);
  END IF;

  -- Case B: User has Contract restrictions ONLY
  IF v_has_any_contract_assignment AND NOT v_has_any_site_assignment THEN
    RETURN v_contract_matched;
  END IF;

  -- Case C: User has Site restrictions ONLY
  IF NOT v_has_any_contract_assignment AND v_has_any_site_assignment THEN
    RETURN v_site_matched;
  END IF;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth, pg_temp;


-- Re-secure the trigger and procedure functions from migration 012 with search_path
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
    
    -- B. Fired on child tables
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

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
    SELECT source_tool_version_id, name, description, category
    INTO v_source_version_id, v_template_name, v_template_desc, v_template_cat
    FROM public.tool_templates
    WHERE id = p_template_id;
    
    IF v_source_version_id IS NULL THEN
        RAISE EXCEPTION 'Template with ID % not found', p_template_id;
    END IF;

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

    SELECT instructions, settings
    INTO v_source_tv_instructions, v_source_tv_settings
    FROM public.tool_versions
    WHERE id = v_source_version_id;

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

    CREATE TEMP TABLE temp_sec_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;
    CREATE TEMP TABLE temp_q_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;
    CREATE TEMP TABLE temp_rule_map (old_id UUID PRIMARY KEY, new_id UUID UNIQUE) ON COMMIT DROP;

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

    FOR r_rule IN 
        SELECT id, target_type, target_id, action, logical_operator
        FROM public.conditional_rules
        WHERE tool_version_id = v_source_version_id
    LOOP
        v_new_rule_id := gen_random_uuid();
        
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;


-- 2. Auth user profiles trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    v_tenant_id UUID;
    v_full_name TEXT;
    v_status TEXT;
BEGIN
    -- Extract tenant_id from user metadata
    v_tenant_id := COALESCE(
        (NEW.raw_app_meta_data->>'tenant_id')::uuid,
        (NEW.raw_user_meta_data->>'tenant_id')::uuid
    );
    
    -- Extract full name, defaulting to email prefix if not supplied
    v_full_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
    );

    -- Status defaults to invited for new invites or if specified, active if requested
    v_status := COALESCE(
        NEW.raw_user_meta_data->>'status',
        NEW.raw_app_meta_data->>'status',
        'invited'
    );

    -- Instantiates profiles
    INSERT INTO public.profiles (
        id,
        tenant_id,
        email,
        full_name,
        status,
        created_at,
        updated_at
    ) VALUES (
        NEW.id,
        v_tenant_id,
        NEW.email,
        v_full_name,
        v_status,
        NEW.created_at,
        NEW.created_at
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        tenant_id = COALESCE(EXCLUDED.tenant_id, profiles.tenant_id),
        email = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        status = CASE WHEN EXCLUDED.status IS NOT NULL THEN EXCLUDED.status ELSE profiles.status END,
        updated_at = now();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

-- Bind the trigger safely (drop if exists to ensure reproducibility)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 3. Prevent platform admin self-escalation trigger
CREATE OR REPLACE FUNCTION public.prevent_platform_admin_escalation()
RETURNS TRIGGER AS $$
DECLARE
    v_caller_is_platform_admin BOOLEAN;
BEGIN
    -- Only check if is_platform_admin changes to true, or is being updated
    IF NEW.is_platform_admin IS DISTINCT FROM OLD.is_platform_admin THEN
        -- Verify if the active caller is a platform admin
        SELECT is_platform_admin INTO v_caller_is_platform_admin 
        FROM public.profiles WHERE id = auth.uid() AND deleted_at IS NULL;
        
        IF COALESCE(v_caller_is_platform_admin, false) IS NOT TRUE THEN
            RAISE EXCEPTION 'Platform Admin escalation forbidden. Only active Platform Admins can modify this privilege.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS tr_prevent_platform_admin_escalation ON public.profiles;
CREATE TRIGGER tr_prevent_platform_admin_escalation
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.prevent_platform_admin_escalation();


-- 4. Tenant and first tenant admin bootstrap function
CREATE OR REPLACE FUNCTION public.bootstrap_tenant(
    p_tenant_name TEXT,
    p_admin_name TEXT
)
RETURNS UUID AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_role_id UUID;
BEGIN
    -- Verify caller is logged in
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required to bootstrap tenant';
    END IF;

    -- Verify user does not already belong to a tenant
    IF EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = v_user_id AND tenant_id IS NOT NULL AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'User is already associated with a tenant';
    END IF;

    -- Validate input
    IF p_tenant_name IS NULL OR trim(p_tenant_name) = '' THEN
        RAISE EXCEPTION 'Tenant name cannot be empty';
    END IF;

    -- Create Tenant record
    INSERT INTO public.tenants (
        name,
        slug,
        status
    ) VALUES (
        p_tenant_name,
        lower(regexp_replace(p_tenant_name, '[^a-zA-Z0-9]+', '-', 'g')),
        'active'
    ) RETURNING id INTO v_tenant_id;

    -- Update active caller's profile with the new tenant and active status
    UPDATE public.profiles
    SET 
        tenant_id = v_tenant_id,
        full_name = COALESCE(p_admin_name, full_name),
        status = 'active',
        updated_at = now()
    WHERE id = v_user_id;

    -- Retrieve tenant_admin system role ID
    SELECT id INTO v_role_id 
    FROM public.roles 
    WHERE tenant_id IS NULL AND code = 'tenant_admin';

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'System role tenant_admin is missing from configuration';
    END IF;

    -- Grant tenant_admin privileges to user
    INSERT INTO public.user_roles (
        user_id,
        role_id,
        tenant_id
    ) VALUES (
        v_user_id,
        v_role_id,
        v_tenant_id
    ) ON CONFLICT (user_id, role_id) DO NOTHING;

    RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;
